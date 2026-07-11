// Drives the EO Reader in headless Chromium to verify, end-to-end in the real surface:
//   1. reader-render.inlineMdMarks is loaded in-browser and pairs *…* across an entity boundary
//   2. a SETTLED answer that italicises a linked entity renders with NO raw `*` and the entity
//      carries the emphasis (the "* Swept Away *" bug from the screenshot)
//   3. the per-answer "How it read this" FACING toggle opens this answer's EoT reading inline
// Fails the process (exit 1) on any page/console error or failed check.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const PORT = 8172;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await sleep(900);
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
// reduced motion → the typewriter reveal snaps to the whole settled body at once, so an injected
// answer is `finished` immediately (the settled _segsFor path + the facing toggle both gate on it).
await page.emulateMedia({ reducedMotion: 'reduce' });
const pageErrors = [], consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => window.EO && window.EO.app && window.__eoUI, { timeout: 20000 });
  await sleep(900);

  // 1. the pure helper, in-browser
  const marks = await page.evaluate(() => {
    const r = window.EO.readerRender.inlineMdMarks([
      { t: 'text', s: 'almost certainly *' },
      { t: 'ent', s: 'Swept Away', docId: 'd', entId: 'e' },
      { t: 'text', s: '* — which critics savaged.' },
    ]);
    const vis = r.pieces.map((p) => (p ? p.map((x) => x.s).join('') : '')).join('');
    return { entKind: r.opaque[1] && r.opaque[1].kind, vis };
  });
  check('inlineMdMarks loaded; entity inside *…* is em', marks.entKind === 'em', String(marks.entKind));
  check('inlineMdMarks drops the orphaned markers', !marks.vis.includes('*'), JSON.stringify(marks.vis));

  // 2. drive a REAL settled-answer render
  await page.evaluate(() => {
    const app = window.EO.app, ui = window.__eoUI;
    const src = app.ingestText('Swept Away is a 2002 film directed by Guy Ritchie. Showgirls is a 1995 film. Critics savaged both films.', 'Films');
    const t = app.topic();
    t.messages.push({
      id: 'mtest1', role: 'assistant', pending: false, grounded: true, route: 'grounded',
      at: new Date(0).toISOString(),
      text: 'There is no single worst movie ever, but *Swept Away* is a candidate [s1]. And *Showgirls* also gets mentioned.',
      cites: [{ idx: 1, sn: src.sn, reg: src.reg, title: src.title, text: 'Critics savaged both films.', docId: src.docId }],
      flags: [], verdicts: [],
    });
    if (ui.state.tab !== 'chat') ui.setState({ tab: 'chat' });
    ui.setState({ rev: (ui.state.rev || 0) + 1 });
  });
  await sleep(500);

  const ans = await page.evaluate(() => {
    const entBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Swept Away');
    const para = entBtn ? entBtn.closest('div') : null;
    return {
      hasEnt: !!entBtn,
      entItalic: entBtn ? /font-style:\s*italic/.test(entBtn.getAttribute('style') || '') : false,
      paraText: para ? para.innerText : '',
      hasFacingToggle: [...document.querySelectorAll('button')].some((b) => b.textContent.includes("How it read this")),
    };
  });
  check('answer: "Swept Away" is a linked entity', ans.hasEnt);
  check('answer: the entity carries italic emphasis', ans.entItalic);
  check('answer: NO raw asterisk bleeds around the entity', !/\*/.test(ans.paraText), JSON.stringify(ans.paraText.slice(0, 120)));
  check('answer: the facing toggle is present', ans.hasFacingToggle);

  // 3. open the facing page
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes("How it read this"));
    if (b) b.click();
  });
  await sleep(400);
  const facing = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'How it read this answer');
    const panel = hdr ? hdr.closest('div').parentElement : null;
    const lines = panel ? panel.querySelectorAll('.eo-scroll > div').length : 0;
    const nowHide = [...document.querySelectorAll('button')].some((b) => b.textContent.includes("Hide the reading"));
    return { hasPanel: !!hdr, lines, nowHide };
  });
  check('facing: the "How it read this answer" panel opened', facing.hasPanel);
  check('facing: it shows EoT reading lines', facing.lines > 0, `${facing.lines} lines`);
  check('facing: the toggle flipped to "Hide the reading"', facing.nowHide);

  // Ignore environmental resource-load noise (favicon / version.json / proxy cert) — the real
  // signal for a template or render bug is an UNCAUGHT page error, of which there must be none.
  const appConsoleErrors = consoleErrors.filter((t) => !/Failed to load resource|ERR_CONNECTION|ERR_CERT|404|net::/i.test(t));
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check('no app console errors', appConsoleErrors.length === 0, appConsoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('harness ran without throwing', false, String((e && e.stack) || e));
} finally {
  await browser.close();
  server.kill('SIGKILL');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
