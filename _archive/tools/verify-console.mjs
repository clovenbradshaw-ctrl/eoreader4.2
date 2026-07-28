// Drives the EO Reader in headless Chromium to verify the audit console
// (src/rooms/reader/console-surface.js). Serves the repo, boots the app, then:
//   1. asserts the Console launcher mounts, opens, and shows provenance
//   2. synthetically drives window.EO.audit to prove stage lines stream
//   3. simulates a hung turn to prove the stall detector fires
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const PORT = 8171;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await sleep(800);

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // boot: wait for the engine membrane to come up
  await page.waitForFunction(() => window.EO && window.EO.audit && window.EO.app, { timeout: 20000 });
  await sleep(1500);

  // 1. launcher present
  const fab = await page.$('.eo-con-fab');
  check('Console launcher (.eo-con-fab) mounted', !!fab);

  // open it
  if (fab) await fab.click();
  await sleep(300);
  const open = await page.$eval('.eo-con', (n) => n.getAttribute('data-open') === '1').catch(() => false);
  check('Panel opens on click (.eo-con[data-open="1"])', open);

  const prov = await page.$eval('.eo-con__prov', (n) => n.textContent.trim()).catch(() => '');
  check('Header shows provenance', prov.length > 0, prov);

  const attached = await page.$eval('.eo-con__body', (n) => n.textContent.includes('console attached')).catch(() => false);
  check('"console attached" line present', attached);

  // 2. synthetically drive the audit log → prove stage lines stream
  await page.evaluate(() => {
    const t = window.EO.audit.turn('probe: write an essay about them');
    t.step('route', { ms: 1, route: 'grounded', task: 'answer' });
    t.step('prompt', { ms: 1, promptLen: 1973 });
    t.step('llm', { ms: 3491, outputLen: 122, maxTokens: 384 });
    t.finish({ route: 'grounded', answer: 'A probe answer.', durationMs: 3500 });
  });
  await sleep(200);
  const bodyText = await page.$eval('.eo-con__body', (n) => n.textContent);
  check('Turn-open line streamed (▶ + question)', bodyText.includes('▶') && bodyText.includes('probe: write an essay'));
  check('Stage lines streamed (route/prompt/llm)', bodyText.includes('route') && bodyText.includes('prompt') && bodyText.includes('llm'));
  check('Finish line streamed (■)', bodyText.includes('■'));

  // 3. simulate a HUNG turn (the essay-freeze signature): steps to `prompt`, then
  //    no `llm`, never finished. The surface stall detector should light up.
  await page.evaluate(() => {
    const t = window.EO.audit.turn('probe: hung turn (no llm step)');
    t.step('route', { ms: 1, route: 'grounded' });
    t.step('prompt', { ms: 1, promptLen: 1973 });
    // deliberately never emit `llm` and never finish → the hang
    window.__eoHungTurn = t.id;
  });
  const statusBefore = await page.$eval('.eo-con__status', (n) => n.getAttribute('data-state')).catch(() => '');
  check('Active turn shows "work" immediately', statusBefore === 'work', `state=${statusBefore}`);

  console.log('   …waiting 7s for the stall detector (STALL_SOFT=6s)…');
  await sleep(7200);
  const statusAfter = await page.$eval('.eo-con__status', (n) => n.getAttribute('data-state')).catch(() => '');
  const statusText = await page.$eval('.eo-con__stext', (n) => n.textContent).catch(() => '');
  const fabState = await page.$eval('.eo-con-fab', (n) => n.getAttribute('data-state')).catch(() => '');
  check('Stall detector escalated past "work"', ['soft', 'hard', 'frozen'].includes(statusAfter), `state=${statusAfter} · "${statusText}"`);
  check('Stall names the stuck stage (prompt)', /prompt/.test(statusText), statusText);

  // 4. no errors from our module
  const ourErrors = [...consoleErrors, ...pageErrors].filter((e) => /console-surface/.test(e));
  check('No errors from console-surface.js', ourErrors.length === 0, ourErrors.join(' | '));

  // capture a screenshot of the open console for the record
  await page.screenshot({ path: 'tools/console-verify.png' }).catch(() => {});

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
