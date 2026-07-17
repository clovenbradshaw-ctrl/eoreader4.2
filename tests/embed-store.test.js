import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbeddingMemo,
  setEmbeddingBudget,
  embeddingResidency,
} from '../src/model/embed-store.js';

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
