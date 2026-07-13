// Drives the shape/grammar/navigation wiring in headless Chromium to verify it works in
// a REAL browser — real module graph over HTTP, real fetch of the shipped artifacts,
// real IndexedDB — not just under Node. Serves the repo, then:
//   1. boots index.html and asserts the app comes up with no page errors (the app.js
//      wiring — imports, buildShapeLib, shapeLibrary threading — must not break boot)
//   2. on a blank same-origin page, runs the full pipeline: loadShapeGrammars (network →
//      IDB), loadShapeLibrary in grammar mode over data/exemplars.jsonl, nav-pool
//      extension over data/nav-corpus.jsonl under a real wall-clock budget, and
//      answerFormError over a live draft
//   3. reloads the page (fresh JS world, same origin/IDB) and re-runs: the shapes bundle
//      must load from cache and the nav vectors must cost ZERO computes — the
//      more-efficient-the-more-it-operates contract, observed across a page boundary
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright/index.js');

const PORT = 8173;
const BASE = `http://127.0.0.1:${PORT}`;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await sleep(800);

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

// The wiring exercise, run inside the page. A tiny deterministic meaning embedder stands
// in for MiniLM (its CDN is unreachable from this sandbox; in production the warm path
// is the same code) — everything else is the real thing: real modules over HTTP, real
// data files, real IndexedDB.
const RUN_WIRING = `(async () => {
  const { loadShapeGrammars, grammarFormError } = await import('/src/turn/shape-grammar.js');
  const { loadShapeLibrary, answerFormError } = await import('/src/turn/shape.js');
  const { extendLibraryWithNavPool } = await import('/src/turn/nav-pool.js');
  const { withPersistentEmbedCache } = await import('/src/model/embed-cache.js');

  let computes = 0;
  const fake = {
    id: 'fake', organ: 'fake', model: 'fake-8d', measuresMeaning: true,
    isWarm: () => true, async warm() {},
    async embed(text) {
      computes++;
      const v = new Float32Array(8);
      for (const w of String(text).toLowerCase().split(/\\s+/)) if (w) v[w.charCodeAt(0) % 8] += 1;
      const n = Math.hypot(...v) || 1;
      for (let i = 0; i < 8; i++) v[i] /= n;
      return v;
    },
  };
  const emb = withPersistentEmbedCache(fake);

  const shapes = await loadShapeGrammars();
  if (!shapes) return { fail: 'shapes.json did not load' };

  const lib = await loadShapeLibrary((t) => emb.embed(t), { shapes });
  if (!lib) return { fail: 'shape library did not build' };

  const pool = await extendLibraryWithNavPool(lib, emb, { budgetMs: 3000 });

  const q = await emb.embed('who wrote this');
  const target = lib.selectForQuestion(q);
  const inBasin = answerFormError(lib, q, 'Balzac. He wrote it in 1835.');
  const scored = grammarFormError(shapes, 'lookup', 'Balzac. He wrote it in 1835.');

  return {
    shapesFrom: shapes.loadedFrom,
    shapesVersion: shapes.version,
    intents: Object.keys(shapes.perIntent).length,
    mode: lib.mode,
    exemplars: lib.lib.length,
    navSize: lib.navSize(),
    pool,
    computes,
    cacheStats: emb.cacheStats(),
    targetIntent: target && target.intent,
    targetThreshold: target && target.threshold,
    inBasinIsNull: inBasin === null,
    scoredIsNull: scored === null,
  };
})()`;

try {
  // ── 1. the app boots with the new wiring ────────────────────────────────────────────
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  check('app boots with no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  // ── 2. cold run: real fetches, real IDB, budgeted nav pool ─────────────────────────
  await page.goto(`${BASE}/tools/`, { waitUntil: 'domcontentloaded' });   // any same-origin page
  const cold = await page.evaluate(RUN_WIRING);
  if (cold.fail) { check('cold wiring run', false, cold.fail); throw new Error(cold.fail); }
  check('shapes.json loads over the network on first run', cold.shapesFrom === 'network', `from=${cold.shapesFrom} v${cold.shapesVersion}, ${cold.intents} intents`);
  check('library builds in grammar mode over the real exemplars', cold.mode === 'grammar' && cold.exemplars === 430, `mode=${cold.mode}, n=${cold.exemplars}`);
  check('nav pool extends under the budget with transferred labels', cold.navSize > 0 && cold.pool.embedded > 0, `nav=${cold.navSize}, embedded=${cold.pool.embedded}, cached=${cold.pool.cached}, exhausted=${cold.pool.exhausted}, ${cold.pool.ms}ms`);
  check('navigation selects an intent with a measured threshold', !!cold.targetIntent && typeof cold.targetThreshold === 'number', `intent=${cold.targetIntent}, threshold=${cold.targetThreshold}`);
  check('a lookup-shaped draft scores in-basin (both entry points)', cold.inBasinIsNull && cold.scoredIsNull);

  // ── 3. warm run after a reload: the persistence + top-up contract ───────────────────
  // Session N+1 starts where N stopped: everything N embedded comes back from IndexedDB
  // as free cache hits, and the freed budget extends coverage deeper into the pool.
  // Nothing is ever RE-computed — warm computes at most what cold never reached.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const warm = await page.evaluate(RUN_WIRING);
  if (warm.fail) { check('warm wiring run', false, warm.fail); throw new Error(warm.fail); }
  const coldCovered = cold.pool.embedded + cold.pool.cached;
  const warmCovered = warm.pool.embedded + warm.pool.cached;
  check('shapes.json loads from IndexedDB after reload', warm.shapesFrom === 'cache');
  check('nothing recomputes — warm embeds only what cold never reached', warm.computes <= Math.max(0, cold.pool.total - coldCovered), `computes=${warm.computes} (cold left ${cold.pool.total - coldCovered} unreached of ${cold.pool.total}; cold computed ${cold.computes})`);
  check('the freed budget extends coverage (top-up, not re-pay)', warmCovered >= coldCovered, `cold=${coldCovered}, warm=${warmCovered}`);

  // ── 4. third run: the pool is resident — the whole load is one cache sweep ──────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  const third = await page.evaluate(RUN_WIRING);
  if (third.fail) { check('third wiring run', false, third.fail); throw new Error(third.fail); }
  check('third run computes nothing at all', third.computes === 0 && third.pool.embedded === 0, `computes=${third.computes}, embedded=${third.pool.embedded}, cached=${third.pool.cached}`);
  check('third run covers whatever the first two reached, for free', third.pool.cached >= warmCovered, `cached=${third.pool.cached} vs prior coverage ${warmCovered}`);
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
