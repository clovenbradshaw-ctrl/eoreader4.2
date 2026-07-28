// Drives the EO Reader in headless Chromium to verify the graph/findings restructure:
//   - the Graph tab now hosts the real graph (entity web), inline
//   - the Findings tab hosts the provenance DAG on top with the claims list below (the pivot)
// Boots the app, seeds a source (+ a synthetic grounded turn for claims), then drives the tabs
// and asserts each renders with every {{ binding }} resolved and no page/console errors.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const PORT = 8172;
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
page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));

// Click a tab in the main tab bar by its label.
const clickTab = async (label) => {
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === lbl || x.textContent.trim().startsWith(lbl));
    if (b) b.click();
  }, label);
  await sleep(500);
};
// The visible stage's text, and whether any unresolved {{ }} placeholder leaked into it.
const stageText = () => page.evaluate(() => document.body.innerText);
const hasUnresolved = () => page.evaluate(() => /\{\{\s*[\w.]+\s*\}\}/.test(document.body.innerHTML));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => window.EO && window.EO.app && window.EO.mountTieredGraph, { timeout: 20000 });
  await sleep(1200);
  check('app booted (window.EO.app + mountTieredGraph)', true);

  // Seed a source so the topic has entities to graph.
  await page.evaluate(() => {
    const t = 'Ada Lovelace worked with Charles Babbage on the Analytical Engine. '
      + 'The Analytical Engine was a mechanical general-purpose computer. '
      + 'Ada Lovelace wrote the first algorithm intended for the Engine. '
      + 'Charles Babbage designed the Difference Engine before the Analytical Engine.';
    window.EO.app.ingestText(t, 'Lovelace & Babbage');
  });
  await sleep(1500);

  // Synthesise a grounded assistant turn so findings()/provenance() yield claims + passages.
  const seeded = await page.evaluate(() => {
    try {
      const app = window.EO.app;
      const st = app.state;
      const topic = st.topics.find((x) => x.id === st.activeTopicId) || st.topics[0];
      const src = st.sources[st.sources.length - 1];
      if (!topic || !src) return { ok: false, why: 'no topic/source' };
      const quote = 'Ada Lovelace wrote the first algorithm intended for the Engine.';
      topic.messages.push({
        id: 'm_verify_1', role: 'assistant', text: 'Ada Lovelace wrote the first algorithm for the Analytical Engine.',
        cites: [{ idx: 1, sn: src.sn, reg: src.reg || 'S1', text: quote, docId: src.docId }],
        bound: [{ claim: 'Ada Lovelace wrote the first algorithm for the Analytical Engine.', citation: '1' }],
        verdicts: [],
      });
      if (app.persist) try { app.persist(); } catch {}
      // nudge a re-render
      if (window.EO.audit && window.EO.audit.emit) try { window.EO.audit.emit('turn'); } catch {}
      return { ok: true, sn: src.sn, claims: app.findings().stats.claims };
    } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
  });
  check('seeded a source + synthetic grounded claim', !!seeded.ok, seeded.ok ? `claims=${seeded.claims}` : seeded.why);
  // force a repaint by toggling tabs
  await clickTab('Sources');
  await sleep(400);

  // ---- GRAPH TAB — the real graph (entity web) ----
  await clickTab('Graph');
  await sleep(1200);
  const gText = await stageText();
  check('Graph tab: knowledge-graph header shown', /KNOWLEDGE GRAPH · EVERYTHING IN FOCUS/.test(gText), gText.slice(0, 0));
  check('Graph tab: scope column ("Whole topic") shown', /Whole topic/.test(gText));
  check('Graph tab: entity kind shown and causal DAG hidden', /Entities/.test(gText) && !/Causal DAG/.test(gText));
  const canvasKids = await page.evaluate(() => {
    // the web canvas is the ref div inside .eo-wgbody (the middle column)
    const body = document.querySelector('.eo-wgbody');
    if (!body) return -1;
    const cols = body.children;
    // middle child is the graph canvas
    let max = 0;
    for (const c of cols) max = Math.max(max, c.querySelectorAll('svg, canvas, div').length);
    return max;
  });
  check('Graph tab: entity web drew nodes/edges into the canvas', canvasKids > 3, `canvas descendants=${canvasKids}`);
  check('Graph tab: no unresolved {{ }} placeholders', !(await hasUnresolved()));


  // ---- FINDINGS TAB — provenance DAG on top, claims list below (the pivot) ----
  await clickTab('Findings');
  await sleep(1200);
  const fText = await stageText();
  check('Findings tab: provenance header shown', /FINDINGS · PROVENANCE DAG ⇄ CLAIMS/.test(fText));
  check('Findings tab: claims list present (claim text)', /Ada Lovelace wrote the first algorithm/.test(fText));
  check('Findings tab: no unresolved {{ }} placeholders', !(await hasUnresolved()));
  const provNodes = await page.evaluate(() => {
    const vp = document.querySelector('[data-screen-label="Provenance DAG"]');
    return vp ? vp.querySelectorAll('div').length : -1;
  });
  check('Findings tab: provenance DAG viewport rendered', provNodes > 2, `viewport descendants=${provNodes}`);

  // pivot: expand the tiers (folded by default), then click a real claim/source node card and
  // confirm the list narrows (banner). The memo-root card is deliberately a no-op pivot.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Expand all/.test(x.textContent));
    if (b) b.click();
  });
  await sleep(700);
  const pivoted = await page.evaluate(() => {
    const vp = document.querySelector('[data-screen-label="Provenance DAG"]');
    if (!vp) return false;
    // a real SOURCE node card ("SOURCE  S-0001 …"), not the plural tier header ("SOURCES 1")
    const card = [...vp.querySelectorAll('div')].find((d) => {
      const s = d.getAttribute('style') || '';
      return /cursor:\s*pointer/.test(s) && /position:\s*absolute/.test(s) && /SOURCE\s+S-\d/.test(d.textContent.replace(/\s+/g, ' '));
    });
    if (!card) return false;
    card.click();
    return true;
  });
  await sleep(700);
  const fText2 = await stageText();
  check('Findings tab: clicking a graph node pivots the list (banner)', pivoted && /Pivoted to/.test(fText2), pivoted ? '' : 'no clickable node found');

  // ---- collapse the provenance canvas (hand its height to the claims list) ----
  const clickByText = (re) => page.evaluate((src) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll('button')].find((x) => rx.test(x.textContent.trim()));
    if (b) { b.click(); return true; }
    return false;
  }, re.source);
  const vpPresent = () => page.evaluate(() => !!document.querySelector('[data-screen-label="Provenance DAG"]'));
  check('Findings tab: canvas shown before collapse', await vpPresent());
  const hid = await clickByText(/Hide graph/);
  await sleep(500);
  check('Findings tab: "Hide graph" folds the canvas away', hid && !(await vpPresent()));
  check('Findings tab: claims list still present while folded', /Ada Lovelace wrote the first algorithm/.test(await stageText()));
  const shown = await clickByText(/Show graph/);
  await sleep(600);
  check('Findings tab: "Show graph" brings the canvas back', shown && (await vpPresent()));
  check('Findings tab: no unresolved placeholders after collapse cycle', !(await hasUnresolved()));

  // ---- the legend pill expands to the full key and folds back ----
  const legendPill = await clickByText(/^Legend$/);
  await sleep(400);
  check('Findings tab: legend pill expands to the full key', legendPill && /grounds \/ traces/.test(await stageText()));

  // ---- other tabs still fine ----
  await clickTab('Chat'); await sleep(300);
  await clickTab('Memo'); await sleep(300);
  check('no unresolved placeholders after touring all tabs', !(await hasUnresolved()));

  check('no page errors across the run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  // console errors: ignore benign network/proxy noise
  const realConsole = consoleErrors.filter((e) => !/Failed to load resource|net::|favicon|proxy|CORS|Access-Control/i.test(e));
  check('no unexpected console errors', realConsole.length === 0, realConsole.slice(0, 3).join(' | '));
} catch (e) {
  check('run completed without throwing', false, String((e && e.stack) || e));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
