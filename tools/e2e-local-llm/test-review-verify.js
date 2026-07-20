// Headless E2E probe of research-review-corpus.js's leadExcerpt (Born-rule term rank + deriveNull
// margin gate) and app/research-review-actions.js's reviewVerifyAnswer (the local-model classifier
// fallback), with a REAL LLM decoding on CPU — no mocks. Mirrors run.js's boot sequence exactly,
// but drives reviewCompute/reviewVerifyAnswer directly against hand-built review topics instead of
// ask()/runTurn, so it stays hermetic (no live web search needed) while still exercising the real
// wllama backend for the "does this excerpt answer the question" check.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = process.env.EO_E2E_ASSETS || path.join(HERE, 'assets');
const WLLAMA_ESM = path.join(ASSETS, 'package', 'esm');
const APP = 'http://127.0.0.1:8777/index.html';
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/';
const CHROMIUM = process.env.EO_E2E_CHROMIUM || '/opt/pw-browsers/chromium';

// The two live-bug scenarios from this session's screenshots — rows are the same fixtures used to
// unit-test leadExcerpt directly (a mechanical Node script, no browser), reproduced here so the
// SAME candidates get a real local-model classifier check on top of the mechanical rank.
const SCENARIOS = [
  {
    query: 'who was the first black canadian president',
    rows: [
      { title: "Who's on First?", text: "\"Who's on First?\" is a comedy routine made famous by American comedy duo Abbott and Costello. The premise of the sketch is that Abbott is identifying the players on a baseball team for Costello. However, the players' names can simultaneously serve as the basis for questions." },
      { title: 'List of Black Canadians', text: 'This is a list of notable Black Canadians, people who are citizens or permanent residents of Canada and are of Black African descent. Canada has never had a Black president, as Canada is not a republic and has no such office; the head of government is the Prime Minister.' },
      { title: 'President of Canada (disambiguation)', text: 'Canada does not have a president. The head of state is the monarch, represented by the Governor General, and the head of government is the Prime Minister.' },
    ],
  },
  {
    query: 'where is roswell new mexico',
    rows: [
      { title: 'Roswell, New Mexico (TV series)', text: 'Roswell, New Mexico is an American science fiction drama television series, named after the city of Roswell, New Mexico, the site of a famous alleged UFO incident. Developed by Carina Adly Mackenzie for the CW, it debuted as a midseason entry during the 2018-2019 television season.' },
      { title: 'Roswell, New Mexico', text: 'Roswell is a city in and the county seat of Chaves County, New Mexico, United States. Roswell is located in the Pecos Valley of southeastern New Mexico, and is home to New Mexico Military Institute and Eastern New Mexico University-Roswell.' },
      { title: 'Roswell incident', text: 'The Roswell incident is a set of events beginning in June or July 1947 in which the United States Army Air Forces claimed to have recovered a crashed flying disc near Roswell, New Mexico.' },
    ],
  },
];

const mime = (f) => f.endsWith('.wasm') ? 'application/wasm'
  : f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript'
  : 'application/octet-stream';

const main = async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try { localStorage.setItem('eo_backend', 'wllama'); localStorage.setItem('eo_web_mode', 'off'); } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(0);
  page.on('console', (m) => { const t = m.text(); if (/^\[EO|MODEL|error|Error|failed/i.test(t)) console.log('  [page]', t.slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 300)));

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:8777')) return route.continue();
    if (url.startsWith(CDN_PREFIX)) {
      const rel = url.slice(CDN_PREFIX.length).split('?')[0];
      const file = path.join(WLLAMA_ESM, rel);
      if (fs.existsSync(file)) {
        return route.fulfill({ status: 200, headers: { 'Content-Type': mime(file), 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' }, body: fs.readFileSync(file) });
      }
      console.log('  [route] MISSING runtime file:', rel);
      return route.abort();
    }
    if (/smollm2-135m-instruct-q8_0\.gguf/i.test(url)) return route.fulfill({ status: 302, headers: { Location: 'http://127.0.0.1:8777/__model.gguf' } });
    return route.abort();
  });

  console.log('== booting', APP);
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.EO && window.EO.app), null, { timeout: 60000 });
  console.log('== engine bridge up; crossOriginIsolated =', await page.evaluate(() => crossOriginIsolated));

  await page.evaluate(() => { window.EO.app.setWebMode('off'); window.EO.app.setBackend('wllama'); });

  console.log('== loading local model (wllama / SmolLM2-135M-Instruct q8_0, CPU WASM)…');
  const t0 = Date.now();
  await page.evaluate(() => window.EO.app.ensureModel());
  console.log(`== model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (const { query, rows } of SCENARIOS) {
    console.log(`\n== SCENARIO: "${query}"`);
    const out = await page.evaluate(({ query, rows }) => {
      const t = window.EO.app.topicNew(query, {});
      t.kind = 'review';
      t.review = { query, discovered: [], excludedSns: [], recipe: 'balanced', createdAt: new Date(0).toISOString(), admittedAt: null, targetTopicId: null, admittedSns: [], independentOverrides: [], identityDecisions: {} };
      for (const r of rows) window.EO.app.ingestText(r.text, r.title);
      const before = window.EO.app.reviewCompute(t.id).answer;
      return { topicId: t.id, before };
    }, { query, rows });
    console.log('-- mechanical pick (leadExcerpt):', JSON.stringify(out.before, null, 2));

    if (out.before && !out.before.confident) {
      const tv = Date.now();
      const verdict = await page.evaluate((topicId) => window.EO.app.reviewVerifyAnswer(topicId), out.topicId);
      const secs = ((Date.now() - tv) / 1000).toFixed(1);
      const after = await page.evaluate((topicId) => window.EO.app.reviewCompute(topicId).answer, out.topicId);
      console.log(`-- local-model verdict (${secs}s):`, verdict);
      console.log('-- after reviewVerifyAnswer, view.answer:', JSON.stringify(after, null, 2));
    } else {
      console.log('-- mechanical rank was already confident; reviewVerifyAnswer would no-op.');
    }
  }

  await browser.close();
  console.log('\n== done');
};

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
