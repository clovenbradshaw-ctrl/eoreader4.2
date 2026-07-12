import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseText } from '../src/perceiver/parse/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { ENACTED_MASK, DEPICTED_ALPHABET, parseToMoves, depictedMoves } from '../src/turn/depicted.js';
import { sequenceLogLikelihood, grammarMargin, loadShapeGrammars, contrastOf,
         scoreDraftGrammar, grammarFormError } from '../src/turn/shape-grammar.js';
import { withPersistentEmbedCache } from '../src/model/embed-cache.js';
import { extendLibraryWithNavPool } from '../src/turn/nav-pool.js';
import { buildShapeLibrary, answerFormError } from '../src/turn/shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHAPES = JSON.parse(readFileSync(join(ROOT, 'data', 'shapes.json'), 'utf8'));

// A fetch stub serving a JSON or text body, the shape loadShapeGrammars and the pool
// loader consume. Tests run in Node — no browser fetch, no IndexedDB — so every loader
// exercises its injected-dependency path, exactly as the centroids loader's tests do.
const fakeFetch = (body, { json = true } = {}) => async () => ({
  ok: true,
  json: async () => body,
  text: async () => (json ? JSON.stringify(body) : body),
});

// A deterministic fake embedder in a tiny space: hash the first letter into one of 4
// dims. Enough to give "who wrote this" and "who is the author" distinct-but-stable
// vectors and to make nearest-neighbour label transfer predictable.
const fakeEmbedder = () => {
  let computes = 0;
  return {
    id: 'fake', organ: 'fake', model: 'fake-4d', measuresMeaning: true,
    isWarm: () => true,
    async warm() {},
    get computes() { return computes; },
    async embed(text) {
      computes++;
      const v = new Float32Array(4);
      for (const w of String(text).toLowerCase().split(/\s+/)) {
        if (w) v[w.charCodeAt(0) % 4] += 1;
      }
      let n = Math.hypot(...v) || 1;
      for (let i = 0; i < 4; i++) v[i] /= n;
      return v;
    },
  };
};

// ── depicted.js — the one reduction ──────────────────────────────────────────────────

test('depictedMoves masks the enacted register structurally', () => {
  const moves = depictedMoves('Grete entered the room. She sat by the window and read.', 't1');
  assert.ok(moves.length > 0, 'a real sentence yields depicted moves');
  for (const m of moves) {
    assert.ok(!ENACTED_MASK.has(m.op), `masked op ${m.op} leaked into the depicted sequence`);
    assert.equal(m.register, 'content');
  }
});

test('parseToMoves tags every move kept-or-masked, and the split is exact', () => {
  const all = parseToMoves('Gregor woke. He looked at the clock. The clock said six.', 't2');
  const kept = all.filter((m) => m.kept);
  const masked = all.filter((m) => !m.kept);
  assert.equal(kept.length + masked.length, all.length);
  // The enacted stream always runs (a DEF opens the frame), so masked is never empty
  // on a multi-sentence text — the audit has something to show.
  assert.ok(masked.length > 0, 'the enacted register produced moves to mask');
  for (const m of masked) assert.ok(ENACTED_MASK.has(m.op) || m.register === 'enacted');
  assert.deepEqual(kept, depictedMoves('Gregor woke. He looked at the clock. The clock said six.', 't2'));
});

test('the reduction is deterministic — same text, same sequence', () => {
  const a = depictedMoves('The house stood on a hill. It had seven windows.', 'd1').map((m) => m.op);
  const b = depictedMoves('The house stood on a hill. It had seven windows.', 'd2').map((m) => m.op);
  assert.deepEqual(a, b);
});

// ── shape-grammar.js — likelihood, margin, scoring ───────────────────────────────────

const UNIFORM = (() => {
  const alphabet = DEPICTED_ALPHABET;
  const p = 1 / alphabet.length;
  const marginal = Object.fromEntries(alphabet.map((o) => [o, p]));
  const trans = Object.fromEntries(alphabet.map((o) => [o, { ...marginal }]));
  return { alphabet, trans, marginal };
})();

test('sequenceLogLikelihood: uniform grammar scores every move at -log2(V)', () => {
  const ll = sequenceLogLikelihood(['NUL', 'INS', 'CON'], UNIFORM);
  assert.ok(Math.abs(ll - Math.log2(1 / DEPICTED_ALPHABET.length)) < 1e-9);
});

test('sequenceLogLikelihood: null on an empty or out-of-alphabet sequence', () => {
  assert.equal(sequenceLogLikelihood([], UNIFORM), null);
  assert.equal(sequenceLogLikelihood(['DEF', 'EVA'], UNIFORM), null, 'masked ops are not in the alphabet');
});

test('grammarMargin prefers the grammar that actually generated the sequence', () => {
  // A grammar that loves NUL→NUL against one that hates it.
  const loves = JSON.parse(JSON.stringify(UNIFORM));
  loves.marginal.NUL = 0.9;
  loves.trans.NUL.NUL = 0.9;
  const m = grammarMargin(['NUL', 'NUL', 'NUL'], loves, UNIFORM);
  assert.ok(m.margin > 0, `expected positive margin, got ${m.margin}`);
});

test('the fitted bundle: every grammar is masked-op-free, thresholds are present', () => {
  assert.equal(SHAPES.version, 3);
  for (const op of SHAPES.maskedOps) assert.ok(!SHAPES.alphabet.includes(op));
  for (const [intent, entry] of Object.entries(SHAPES.perIntent)) {
    for (const op of ['DEF', 'EVA', 'REC']) {
      assert.ok(!(op in entry.grammar.marginal), `${intent} carries ${op} mass`);
    }
    assert.ok(entry.marginStats, `${intent} is missing its LOO margin stats`);
    assert.equal(typeof entry.marginStats.p10, 'number');
  }
  assert.ok(SHAPES.contrast?.['assistant-synthetic']?.grammar, 'assistant contrast grammar present');
});

test('scoreDraftGrammar: a terse lookup-shaped draft is in-basin for lookup', () => {
  const sc = scoreDraftGrammar(SHAPES, 'lookup', 'Balzac. He wrote it in 1835.');
  assert.ok(sc, 'the draft scored');
  assert.equal(sc.off, false, `expected in-basin, margin ${sc.margin} vs threshold ${sc.threshold}`);
});

test('grammarFormError: null when in-basin, a soft error when off', () => {
  assert.equal(grammarFormError(SHAPES, 'lookup', 'Balzac. He wrote it in 1835.'), null);
  // Long assistant-flavoured prose against a terse intent: if it lands off-basin the
  // error is soft (gates:false) and names the intent; if the margin still clears the
  // bar that is a legitimate outcome — only the CONTRACT is asserted here.
  const listy = 'There are several important considerations to keep in mind. First, the author. ' +
    'Second, the historical context of the novel. Third, the translation you are reading. ' +
    'Each of these factors plays a role in the overall experience. Additionally, it is worth ' +
    'noting that many readers find the opening chapters slow. Finally, remember that reading ' +
    'is a personal journey and everyone approaches it differently.';
  const err = grammarFormError(SHAPES, 'lookup', listy);
  if (err) {
    assert.equal(err.gates, false, 'form is a smoke alarm, never a gate');
    assert.equal(err.intent, 'lookup');
    assert.ok(err.reason.includes('lookup'));
  }
});

test('grammarFormError is inert without shapes or intent', () => {
  assert.equal(grammarFormError(null, 'lookup', 'text'), null);
  assert.equal(grammarFormError(SHAPES, null, 'text'), null);
  assert.equal(grammarFormError(SHAPES, 'no-such-intent', 'text'), null);
});

test('loadShapeGrammars: injected fetch, no cache — returns the frozen bundle', async () => {
  const shapes = await loadShapeGrammars({ fetchImpl: fakeFetch(SHAPES), useCache: false });
  assert.ok(shapes);
  assert.equal(shapes.loadedFrom, 'network');
  assert.ok(Object.isFrozen(shapes));
  assert.ok(contrastOf(shapes));
});

test('loadShapeGrammars: degrades to null on a bad bundle or no fetch', async () => {
  assert.equal(await loadShapeGrammars({ fetchImpl: fakeFetch({ nope: 1 }), useCache: false }), null);
  assert.equal(await loadShapeGrammars({ fetchImpl: null, useCache: false }), null);
});

// ── embed-cache.js — persistence wrapper ─────────────────────────────────────────────

test('withPersistentEmbedCache: computes once, then serves from memory', async () => {
  const inner = fakeEmbedder();
  const cached = withPersistentEmbedCache(inner, { useIDB: false });
  const a = await cached.embed('hello world');
  const b = await cached.embed('hello world');
  assert.equal(inner.computes, 1, 'second call was a cache hit');
  assert.deepEqual([...a], [...b]);
  const stats = cached.cacheStats();
  assert.equal(stats.computed, 1);
  assert.equal(stats.memoryHits, 1);
});

test('withPersistentEmbedCache: embedIfCached never computes', async () => {
  const inner = fakeEmbedder();
  const cached = withPersistentEmbedCache(inner, { useIDB: false });
  assert.equal(await cached.embedIfCached('unseen text'), null);
  assert.equal(inner.computes, 0, 'the probe must not spend compute');
  await cached.embed('unseen text');
  assert.ok(await cached.embedIfCached('unseen text'), 'probe hits after a real embed');
  assert.equal(inner.computes, 1);
});

test('withPersistentEmbedCache: passes the organ contract through', () => {
  const cached = withPersistentEmbedCache(fakeEmbedder(), { useIDB: false });
  assert.equal(cached.measuresMeaning, true);
  assert.equal(cached.isWarm(), true);
  assert.equal(cached.model, 'fake-4d');
});

// ── shape.js grammar mode + nav-pool.js — the wired path ─────────────────────────────

const EXEMPLARS = [
  { id: 'e1', intent: 'lookup', user_turn: 'who wrote this', response: 'Balzac.' },
  { id: 'e2', intent: 'lookup', user_turn: 'what year is this from', response: '1835.' },
  { id: 'e3', intent: 'synthesis', user_turn: 'zk pull the threads together', response: 'Three strands meet here: money, family, ambition. Each daughter embodies one.' },
];

test('grammar mode: responses are never embedded, mode is declared', async () => {
  const inner = fakeEmbedder();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => inner.embed(t), { shapes: SHAPES });
  assert.equal(lib.mode, 'grammar');
  assert.equal(inner.computes, EXEMPLARS.length, 'exactly one embed per user_turn, zero per response');
  for (const e of lib.lib) assert.equal(e.responseVec, null);
});

test('grammar mode: selectForQuestion carries the intent’s measured threshold', async () => {
  const inner = fakeEmbedder();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => inner.embed(t), { shapes: SHAPES });
  const q = await inner.embed('who wrote this');
  const target = lib.selectForQuestion(q);
  assert.ok(target);
  assert.equal(target.intent, 'lookup');
  assert.equal(target.threshold, SHAPES.perIntent.lookup.marginStats.p10);
  assert.equal(target.competitorExemplars.length, 0, 'the contrast grammar replaces the competitor set');
});

test('answerFormError in grammar mode takes the draft TEXT', async () => {
  const inner = fakeEmbedder();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => inner.embed(t), { shapes: SHAPES });
  const q = await inner.embed('who wrote this');
  // In-basin terse lookup: no error.
  assert.equal(answerFormError(lib, q, 'Balzac. He wrote it in 1835.'), null);
});

test('end-to-end: a grammar-mode library rides a full runTurn — shapeTarget set, no crash', async () => {
  const inner = fakeEmbedder();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => inner.embed(t), { shapes: SHAPES });
  const doc = parseText(
    'The dolphin swam near the boat. The dolphin is intelligent. ' +
    'It recognizes itself in a mirror. The pod hunted fish together in the bay.',
    { docId: 'dolphins' });
  const model = {
    id: 'stub', kind: 'local', isLoaded: () => true,
    describe: () => ({ backend: 'stub', kind: 'local', model: 'stub', label: 'stub' }),
    async load() {},
    async phrase() { return 'The dolphin recognizes itself in a mirror.'; },
  };
  let sawShapeTarget = false;
  const r = await runTurn({
    question: 'What does the dolphin recognize?', doc, model,
    embedder: createHashEmbedder(),
    geometricEmbedder: inner,                    // measuresMeaning + warm → navigation runs
    shapeLibrary: lib,
    auditLog: createAuditLog({ capacity: 64 }),
    onStep: (name, ctx) => { if (ctx?.shapeTarget) sawShapeTarget = true; },
  });
  assert.ok(r.answer, 'the turn answered');
  assert.ok(sawShapeTarget, 'the predict stage selected a target shape from the library');
});

test('end-to-end: the form alarm rides a CHAT turn (no document) and flags chatbot-ese', async () => {
  const inner = fakeEmbedder();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => inner.embed(t), { shapes: SHAPES });
  const stub = (reply) => ({
    id: 'stub', kind: 'local', isLoaded: () => true,
    describe: () => ({ backend: 'stub', kind: 'local', model: 'stub', label: 'stub' }),
    async load() {},
    async phrase() { return reply; },
  });
  const ask = (model) => runTurn({
    question: 'who wrote this', doc: null, model,
    embedder: createHashEmbedder(), geometricEmbedder: inner,
    shapeLibrary: lib, auditLog: createAuditLog({ capacity: 64 }),
  });
  const flagged = (r) => [...(r.flags || []), ...(r.vetoes || [])]
    .some((f) => (f.id || f) === 'answer-shape-weak');

  // A terse, lookup-shaped reply clears the intent's own measured bar — no flag.
  const good = await ask(stub('Balzac. He wrote it in 1835.'));
  assert.equal(good.route, 'chat');
  assert.equal(flagged(good), false, 'an in-basin chat answer must not be flagged');

  // Full assistant-listicle register — measured off-basin for lookup (falls under the
  // LOO p10 threshold against the assistant-contrast grammar) — raises the soft flag.
  const listy = await ask(stub(
    'Great question! Here are the answers to both parts:\n\n' +
    '1. **2014 World Series**: The San Francisco Giants won the 2014 World Series. They defeated the Kansas City Royals 4 games to 3.\n\n' +
    '2. **Fastest land mammal**: The cheetah is the fastest land mammal, capable of reaching speeds of up to 70 mph (113 km/h).\n\n' +
    'Let me know if you would like more details about either topic!'));
  assert.equal(listy.route, 'chat');
  assert.equal(flagged(listy), true, 'an off-basin chat answer must raise answer-shape-weak');
});

test('nav pool: budget honoured, cached prefix is free, labels transfer, best stays an exemplar', async () => {
  const inner = fakeEmbedder();
  const cached = withPersistentEmbedCache(inner, { useIDB: false });
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => cached.embed(t), { shapes: SHAPES });

  const pool = [
    { id: 'n1', source: 's', text: 'who is the author of this book' },
    { id: 'n2', source: 's', text: 'what would you say the themes are' },
    { id: 'n3', source: 's', text: 'when was it published' },
  ];
  const poolJsonl = pool.map((r) => JSON.stringify(r)).join('\n');

  // Zero budget, nothing cached: no embeds spent, pool exhausted immediately.
  const dry = await extendLibraryWithNavPool(lib, cached, {
    fetchImpl: fakeFetch(poolJsonl, { json: false }), budgetMs: 0,
  });
  assert.equal(dry.embedded, 0);
  assert.equal(dry.exhausted, true);
  assert.equal(lib.navSize(), 0);

  // Generous budget: the pool embeds and labels transfer from nearest exemplars.
  const run = await extendLibraryWithNavPool(lib, cached, {
    fetchImpl: fakeFetch(poolJsonl, { json: false }), budgetMs: 10_000,
  });
  assert.equal(run.embedded + run.cached, 3);
  assert.ok(lib.navSize() > 0, 'labelled entries joined the library');

  // A second run over the same pool costs no compute — every vector is cached.
  const before = inner.computes;
  const rerun = await extendLibraryWithNavPool(lib, cached, {
    fetchImpl: fakeFetch(poolJsonl, { json: false }), budgetMs: 10_000,
  });
  assert.equal(inner.computes, before, 'the rerun raced the cache, computed nothing');
  assert.equal(rerun.cached, 3);

  // matchPrompt: nav entries vote, but `best` is always a real exemplar.
  const q = await cached.embed('who wrote this book');
  const pm = lib.matchPrompt(q);
  assert.ok(pm);
  assert.ok(EXEMPLARS.some((e) => e.id === pm.best.id), 'best must be a real exemplar, never a nav entry');
});
