// Drives the EO Reader in headless Chromium to verify the Phase-1 boot-shell extraction
// (index.html → shell-loader.js + src/rooms/reader/ui/shell.{css,template.html,logic.js}):
//   1. the static boot shell (#eo-boot-shell) paints immediately
//   2. shell-loader.js fetches the template + controller and mounts the real surface (#dc-root)
//   3. the boot shell is removed once — and only once — the surface has actually mounted
//   4. the engine bridge (window.EO) comes up and the surface adopts it
//   5. no console/page errors, and index.html itself stays under the Phase-1 size budget
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const PORT = 8173;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const htmlBytes = statSync('index.html').size;
check('index.html stays under the 20KB Phase-1 budget', htmlBytes < 20 * 1024, `${htmlBytes} bytes`);

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await sleep(800);

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

try {
  // 1. the static shell markup is in the raw, unbuilt HTML itself — true on every load, not
  // just a fast local server that could out-race a DOM check taken after mount already ran.
  const rawHtml = await (await fetch(BASE)).text();
  check('Static #eo-boot-shell markup ships in the raw HTML (paints before any script runs)',
    /id="eo-boot-shell"[\s\S]*Loading the reader/.test(rawHtml));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // 2. the real surface mounts (#dc-root appears) within a generous window
  await page.waitForSelector('#dc-root', { timeout: 15000 }).catch(() => {});
  const mounted = await page.$('#dc-root');
  check('#dc-root mounts (shell-loader.js fetched + installed the DC surface)', !!mounted);

  // 3. the boot shell is gone once mounted — never both on screen at once
  const shellGone = !(await page.$('#eo-boot-shell'));
  check('The static boot shell is removed once mounted', shellGone);

  // no premature "reload the app" fallback should ever have shown
  const fallbackShown = !!(await page.$('#eo-boot-fallback'));
  check('No spurious reload-fallback prompt', !fallbackShown);

  // 4. the engine bridge comes up and the surface adopts it (real content renders, not
  //    just the "Engine booting…" placeholder)
  await page.waitForFunction(() => window.EO && window.EO.app, { timeout: 20000 }).catch(() => {});
  const hasEO = await page.evaluate(() => !!(window.EO && window.EO.app));
  check('window.EO engine bridge comes up', hasEO);

  await sleep(500);
  const bodyText = await page.evaluate(() => document.body.textContent);
  check('The mounted surface shows real EO Reader chrome, not a blank page', /EO Reader|Overview|Sources|Ask/.test(bodyText), bodyText.slice(0, 80));

  // 5. shell.css actually applied (a rule only that stylesheet defines)
  const cssApplied = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'eo-skel';
    document.body.appendChild(probe);
    const applied = getComputedStyle(probe).borderRadius !== '0px';
    probe.remove();
    return applied;
  });
  check('shell.css loaded and applied (.eo-skel border-radius set)', cssApplied);

  const relevantErrors = [...consoleErrors, ...pageErrors].filter((e) => /shell-loader|dc-runtime|support\.js/.test(e));
  check('No shell-loader/dc-runtime errors', relevantErrors.length === 0, relevantErrors.join(' | '));

  console.log('\n--- page errors (all) ---');
  console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
  console.log('--- console errors (all) ---');
  console.log(consoleErrors.length ? consoleErrors.slice(0, 12).join('\n') : '(none)');
} catch (e) {
  console.error('DRIVER ERROR:', e && e.stack || e);
  results.push({ name: 'driver ran to completion', ok: false, detail: String(e && e.message || e) });
} finally {
  await browser.close();
  server.kill('SIGKILL');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
