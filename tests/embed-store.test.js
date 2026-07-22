import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbeddingMemo,
  setEmbeddingBudget,
  embeddingResidency,
  quantizeVectors,
  setEmbeddingQuantization,
} from '../src/model/embed-store.js';

// Cosine as every stored-vector reader computes it (semantic.js / atmosphere.js /
// site.js / impression.js all use this exact normalized form).
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

// A tiny deterministic PRNG (no Math.random — reproducible failures) → an L2-normalized
// vector, the form the MiniLM embedder emits (embed.js: normalize: true).
const mkRng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const normalVec = (rng, dim) => {
  const v = new Float32Array(dim);
  let n = 0;
  for (let i = 0; i < dim; i++) { v[i] = rng() * 2 - 1; n += v[i] * v[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

test('memoises per organ — compute runs once per (doc, organ) while resident', async () => {
  setEmbeddingBudget(60_000);
  const memo = createEmbeddingMemo();
  let calls = 0;
  const compute = () => { calls++; return Promise.resolve([1, 2, 3]); };

  const a = await memo.get('minilm', 3, compute);
  const b = await memo.get('minilm', 3, compute);
  assert.equal(calls, 1, 'second get is a cache hit, no recompute');
  assert.strictEqual(a, b, 'same resolved matrix returned');

  await memo.get('hash', 3, compute);
  assert.equal(calls, 2, 'a different organ computes independently');
  memo.release();
});

test('release() frees the doc\'s residency', async () => {
  setEmbeddingBudget(60_000);
  const before = embeddingResidency().resident;
  const memo = createEmbeddingMemo();
  await memo.get('minilm', 100, () => Promise.resolve(new Array(100)));
  assert.equal(embeddingResidency().resident, before + 100);
  memo.release();
  assert.equal(embeddingResidency().resident, before, 'residency returns to baseline after release');
});

test('over-budget access evicts the least-recently-used matrix and rebuilds lazily', async () => {
  // Tight budget: only two 100-vector matrices fit at once.
  setEmbeddingBudget(250);
  const docA = createEmbeddingMemo();
  const docB = createEmbeddingMemo();
  const docC = createEmbeddingMemo();
  let aCalls = 0;
  const mk = (tag, counter) => () => { counter.n++; return Promise.resolve([tag]); };
  const aCounter = { n: 0 };

  await docA.get('minilm', 100, mk('A', aCounter)); // resident 100
  await docB.get('minilm', 100, () => Promise.resolve(['B'])); // resident 200
  await docC.get('minilm', 100, () => Promise.resolve(['C'])); // resident 300 → evict LRU (A)
  await flush();

  assert.ok(embeddingResidency().resident <= 250, 'residency held within budget after eviction');
  assert.equal(aCounter.n, 1, 'A computed once so far');

  // A was evicted → next access recomputes (a cheap IDB re-hit in the real app).
  await docA.get('minilm', 100, mk('A', aCounter));
  await flush();
  assert.equal(aCounter.n, 2, 'evicted matrix rebuilt on next need');

  docA.release(); docB.release(); docC.release();
  setEmbeddingBudget(60_000);
});

test('an in-flight (pinned) matrix is never evicted mid-compute', async () => {
  setEmbeddingBudget(150);
  const docA = createEmbeddingMemo();
  const docB = createEmbeddingMemo();

  let resolveA;
  const slowA = new Promise((res) => { resolveA = res; });
  const pA = docA.get('minilm', 100, () => slowA); // pinned, resident 100
  // While A is still computing, B pushes over budget — must NOT drop the pinned A.
  await docB.get('minilm', 100, () => Promise.resolve(['B']));
  await flush();

  resolveA([1, 2, 3]);
  const a = await pA;
  assert.deepEqual(a, [1, 2, 3], 'pinned compute survived and resolved');

  docA.release(); docB.release();
  setEmbeddingBudget(60_000);
});

test('a failed compute unregisters the slot so a retry recomputes', async () => {
  setEmbeddingBudget(60_000);
  const before = embeddingResidency().resident;
  const memo = createEmbeddingMemo();
  let calls = 0;
  await assert.rejects(
    memo.get('minilm', 10, () => { calls++; return Promise.reject(new Error('boom')); }),
    /boom/,
  );
  assert.equal(embeddingResidency().resident, before, 'a failed compute leaves no residency behind');
  await memo.get('minilm', 10, () => { calls++; return Promise.resolve([1]); });
  assert.equal(calls, 2, 'retry recomputes rather than returning the rejected promise');
  memo.release();
});

test('quantizeVectors returns int8 subarray views over one contiguous buffer', () => {
  setEmbeddingQuantization(true);
  const rng = mkRng(7);
  const vecs = Array.from({ length: 5 }, () => normalVec(rng, 384));
  const q = quantizeVectors(vecs);
  assert.equal(q.length, 5);
  for (const v of q) {
    assert.ok(v instanceof Int8Array, 'each view is an Int8Array');
    assert.equal(v.length, 384);
  }
  // One backing buffer shared by every view (4× smaller than 5 separate Float32Arrays).
  assert.strictEqual(q[0].buffer, q[4].buffer, 'views share a single ArrayBuffer');
  assert.equal(q[0].buffer.byteLength, 5 * 384, 'int8 — one byte per component');
});

test('int8 cosine reproduces Float32 cosine to within rounding, and preserves top-k ranking', () => {
  setEmbeddingQuantization(true);
  const rng = mkRng(42);
  const dim = 384;
  const N = 400;
  const floatVecs = Array.from({ length: N }, () => normalVec(rng, dim));
  const int8Vecs = quantizeVectors(floatVecs);
  const query = normalVec(rng, dim);   // the query stays full-precision Float32

  let maxDelta = 0;
  const floatScores = floatVecs.map((v, i) => ({ i, s: cosine(query, v) }));
  const int8Scores = int8Vecs.map((v, i) => ({ i, s: cosine(query, v) }));
  for (let i = 0; i < N; i++) maxDelta = Math.max(maxDelta, Math.abs(floatScores[i].s - int8Scores[i].s));
  assert.ok(maxDelta < 0.01, `per-vector cosine drift stays tiny (was ${maxDelta.toFixed(5)})`);

  const topK = (scored) => [...scored].sort((a, b) => b.s - a.s).slice(0, 10).map((x) => x.i);
  assert.deepEqual(topK(int8Scores), topK(floatScores), 'int8 top-10 ordering matches Float32');
});

test('setEmbeddingQuantization(false) leaves the float vectors untouched', () => {
  setEmbeddingQuantization(false);
  const rng = mkRng(3);
  const vecs = Array.from({ length: 3 }, () => normalVec(rng, 8));
  const out = quantizeVectors(vecs);
  assert.strictEqual(out, vecs, 'pass-through when quantization is off');
  assert.ok(out[0] instanceof Float32Array);
  setEmbeddingQuantization(true);
});

test('quantizeVectors leaves ragged or empty input alone', () => {
  setEmbeddingQuantization(true);
  assert.deepEqual(quantizeVectors([]), []);
  const ragged = [new Float32Array([1, 2, 3]), new Float32Array([1, 2])];
  assert.strictEqual(quantizeVectors(ragged), ragged, 'mismatched dims are not quantized');
});

test('the memo hands cosine readers int8 matrices end to end', async () => {
  setEmbeddingQuantization(true);
  setEmbeddingBudget(60_000);
  const rng = mkRng(11);
  const vecs = Array.from({ length: 6 }, () => normalVec(rng, 384));
  const memo = createEmbeddingMemo();
  const stored = await memo.get('minilm', vecs.length, () => Promise.resolve(vecs));
  assert.ok(stored[0] instanceof Int8Array, 'stored matrix is int8');
  assert.equal(stored.length, 6);
  memo.release();
});
