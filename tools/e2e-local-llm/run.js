// Headless end-to-end run of EO Reader with a REAL local LLM:
//   boot index.html in Chromium → load the wllama backend (SmolLM2-135M q8_0,
//   CPU/WASM) through the app's own model ladder → ingest a corpus through
//   ingestText → ask questions through the real ask()/runTurn pipeline.
//
// All external URLs are intercepted and served from local disk (the runtime
// unpacked from the npm tarball, the GGUF fetched once beforehand), so the
// browser makes no live CDN/HF requests — the run is hermetic. See README.md
// for the asset layout and how to fetch it.
//
//   node tools/e2e-local-llm/server.js <repoRoot> <assets>/smollm2-135m-instruct-q8_0.gguf &
//   node tools/e2e-local-llm/run.js [question …]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ASSETS = process.env.EO_E2E_ASSETS || path.join(HERE, 'assets');
const WLLAMA_ESM = path.join(ASSETS, 'package', 'esm');
const APP = 'http://127.0.0.1:8777/index.html';
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/';
const CHROMIUM = process.env.EO_E2E_CHROMIUM || '/opt/pw-browsers/chromium';

const CORPORA = [
  { title: 'The Metamorphosis (excerpt)', file: path.join(REPO, 'data', 'metamorphosis.txt') },
];

const QUESTIONS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'Who is Gregor Samsa and what happened to him?',
  'What was Gregor looking at on the wall of his room?',
  // deliberately off-corpus — the corpus never mentions weather; a grounded
  // pipeline should refuse or come back ungrounded, never invent
  'What does the document say about the weather outside?',
];

const mime = (f) => f.endsWith('.wasm') ? 'application/wasm'
  : f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript'
  : 'application/octet-stream';

const main = async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('eo_backend', 'wllama');
      localStorage.setItem('eo_web_mode', 'off');
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(0);
  page.on('console', (m) => {
    const t = m.text();
    if (/^\[EO|MODEL|error|Error|failed/i.test(t)) console.log('  [page]', t.slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 300)));

  // Hermetic network: wllama runtime from disk, weights via the local server,
  // everything else external is refused.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:8777')) return route.continue();
    if (url.startsWith(CDN_PREFIX)) {
      const rel = url.slice(CDN_PREFIX.length).split('?')[0];
      const file = path.join(WLLAMA_ESM, rel);
      if (fs.existsSync(file)) {
        return route.fulfill({
          status: 200,
          headers: {
            'Content-Type': mime(file),
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
          body: fs.readFileSync(file),
        });
      }
      console.log('  [route] MISSING runtime file:', rel);
      return route.abort();
    }
    // Case-insensitive: the default weights are now a ladder of mirrors
    // (model/wllama.js DEFAULT_MODEL_URLS) and the mirrors case the same
    // filename differently (SmolLM2-135M-Instruct-Q8_0.gguf vs all-lowercase).
    if (/smollm2-135m-instruct-q8_0\.gguf/i.test(url)) {
      // 302 onto the local static server: the 145MB file streams natively
      // instead of riding the CDP wire as one fulfill payload.
      return route.fulfill({ status: 302, headers: { Location: 'http://127.0.0.1:8777/__model.gguf' } });
    }
    return route.abort();  // fonts, matrix, MiniLM CDN, anything else — hermetic run
  });

  console.log('== booting', APP);
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.EO && window.EO.app), null, { timeout: 60000 });
  console.log('== engine bridge up; crossOriginIsolated =', await page.evaluate(() => crossOriginIsolated),
    '| cores =', await page.evaluate(() => navigator.hardwareConcurrency));

  // progress reporting from inside the app
  await page.evaluate(() => {
    let last = '';
    window.EO.app.subscribe((kind) => {
      if (kind !== 'model') return;
      const m = window.EO.app.state.model;
      const line = `MODEL ${m.backend} ${m.state} ${Math.round((m.progress || 0) * 100)}% ${m.note || ''}`;
      if (line !== last) { last = line; console.log(line); }
    });
    window.EO.app.setWebMode('off');
    window.EO.app.setBackend('wllama');
  });

  // ingest the corpus through the app's own membrane
  for (const c of CORPORA) {
    const text = fs.readFileSync(c.file, 'utf8');
    const src = await page.evaluate(({ text, title }) => {
      const s = window.EO.app.ingestText(text, title);
      return { sn: s.sn, title: s.title, sha: s.sha, words: (text.match(/\S+/g) || []).length };
    }, { text, title: c.title });
    console.log(`== ingested "${src.title}" as ${src.sn} (${src.words} words, ${String(src.sha).slice(0, 24)}…)`);
  }

  console.log('== loading local model (wllama / SmolLM2-135M-Instruct q8_0, CPU WASM)…');
  const t0 = Date.now();
  await page.evaluate(() => window.EO.app.ensureModel());
  console.log(`== model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s;`,
    await page.evaluate(() => JSON.stringify(window.EO.app.state.model)));

  const results = [];
  for (const q of QUESTIONS) {
    console.log(`\n== ASK: ${q}`);
    const tq = Date.now();
    const r = await page.evaluate(async (q) => {
      const msg = await window.EO.app.ask(q);
      return msg && {
        text: msg.text, route: msg.route || null, grounded: !!msg.grounded,
        cites: (msg.cites || []).length, unbound: !!msg.unbound,
      };
    }, q);
    const secs = ((Date.now() - tq) / 1000).toFixed(1);
    console.log(`-- answered in ${secs}s  route=${r?.route} grounded=${r?.grounded} cites=${r?.cites}`);
    console.log(`-- ${String(r?.text).replace(/\n/g, '\n   ')}`);
    results.push({ question: q, seconds: Number(secs), ...r });
  }

  // pull the session's self-model + ledger readout — the honesty seams
  const seams = await page.evaluate(() => ({
    selfModel: window.EO.app.selfModel(),
    ledger: window.EO.app.ledger().length,
  }));
  console.log('\n== seams:', JSON.stringify(seams));

  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify({ results, seams }, null, 2));
  await browser.close();
  console.log('== done');
};

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
