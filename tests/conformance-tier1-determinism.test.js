// TIER 1 — Determinism and total function (docs/parse-conformance-spec.md).
// "The floor. Nothing else means anything until this holds."
//
// Scale-down note: the spec's counts (100 replay runs, 10,000 fuzzed fixtures)
// are calibrated for a dedicated CI lane, not the default `npm test` run. This
// file scales each down to a number that keeps the whole suite fast while still
// exercising the same code paths at the same variety; every scaled-down count
// says so at the point it is used. Run with CONFORMANCE_FUZZ_N=<n> to widen the
// fuzz sweep locally (e.g. before a release — see tests/conformance/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listFixtures, loadFixture } from './conformance/harness/fixtures.js';
import { readWithSeed } from './conformance/harness/read.js';
import { readingHash } from './conformance/harness/reading-hash.js';
import { mutateFixture } from './conformance/harness/mutate.js';
import { assertNoInvalidNumerics, docSubstrateForValidation } from './conformance/harness/validate-substrate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRINT_HASH = path.join(HERE, 'conformance', 'harness', 'print-hash.mjs');

// A representative sample across categories — every category, kept small so
// `npm test` (which runs this file on every commit per the spec's "Running it"
// gate) stays fast. Excludes `degenerate-*` here; those get their own test (#5).
const SAMPLE_IDS = [
  'muni-council-minutes-01', 'legal-order-01', 'news-infrastructure-01',
  'literary-the-lamplighter', 'adversarial-citations', 'ocr-legal-order',
];

// ── #1 — Byte-identical replay ───────────────────────────────────────────────

test('Tier1 #1: byte-identical replay — same process, N runs', async () => {
  const RUNS = 15;   // spec: 100. Scaled down for default `npm test` runtime.
  for (const id of SAMPLE_IDS) {
    const f = loadFixture(id);
    const hashes = new Set();
    for (let i = 0; i < RUNS; i++) {
      const doc = await readWithSeed(f.bytes, {});
      hashes.add(readingHash(doc));
    }
    assert.equal(hashes.size, 1, `${id}: ${RUNS} same-process reads produced ${hashes.size} distinct hashes`);
  }
});

test('Tier1 #1: byte-identical replay — fresh process agrees with in-process', async () => {
  for (const id of SAMPLE_IDS) {
    const f = loadFixture(id);
    const doc = await readWithSeed(f.bytes, {});
    const inProcess = readingHash(doc);
    const fresh = execFileSync(process.execPath, [PRINT_HASH, id], { encoding: 'utf8' }).trim();
    assert.equal(fresh, inProcess, `${id}: a fresh process disagreed with the in-process hash`);
  }
});

// ── #2 — Concurrency independence ────────────────────────────────────────────

test('Tier1 #2: concurrency independence — interleaved reads match serial reads', async () => {
  const ids = SAMPLE_IDS.slice(0, 3);
  const bytesOf = Object.fromEntries(ids.map((id) => [id, loadFixture(id).bytes]));

  // Serial baseline: one at a time, nothing else touching the module in between.
  const serial = {};
  for (const id of ids) serial[id] = readingHash(await readWithSeed(bytesOf[id], {}));

  // Interleaved: all three in flight together (Promise.all), so any module-level
  // mutable state (a shared cache, a singleton) has a chance to leak between them.
  const interleavedDocs = await Promise.all(ids.map((id) => readWithSeed(bytesOf[id], {})));
  const interleaved = Object.fromEntries(ids.map((id, i) => [id, readingHash(interleavedDocs[i])]));

  for (const id of ids) {
    assert.equal(interleaved[id], serial[id], `${id}: hash differs when read concurrently alongside other documents`);
  }
});

// ── #3 — Chunk independence (adapted) ────────────────────────────────────────
// HONEST SEAM: the engine has no raw byte-chunked ingestion API — parseText
// always receives the whole decoded string at once (src/perceiver/parse/
// pipeline.js). What IS chunked is the per-sentence PROCESSING driver: with
// `opts.onProgress` set, pipeline.js walks sentences in chunks of `chunkSize`,
// yielding to the event loop between them, and calls the SAME `finalize()`
// either way ("finalize() runs once either way" — pipeline.js's own comment).
// This test exercises that real chunking knob across several sizes, rather than
// asserting a byte-chunked-input contract that does not exist.
test('Tier1 #3: chunk independence (adapted) — the yielding chunked driver matches the synchronous one', async () => {
  const CHUNK_SIZES = [1, 3, 7, 64, 250];
  for (const id of SAMPLE_IDS) {
    const f = loadFixture(id);
    const baseline = readingHash(await readWithSeed(f.bytes, {}));
    for (const chunkSize of CHUNK_SIZES) {
      const doc = await readWithSeed(f.bytes, { parse: { onProgress: () => {}, chunkSize } });
      assert.equal(readingHash(doc), baseline, `${id}: chunkSize=${chunkSize} diverged from the synchronous read`);
    }
  }
});

// ── #4 — Totality under fuzz ─────────────────────────────────────────────────

test('Tier1 #4: totality under fuzz — mutated fixtures terminate, never throw, never emit NaN/Infinity/undefined', async () => {
  const N = Number(process.env.CONFORMANCE_FUZZ_N) || 40;   // spec: 10,000. See file header.
  const TIME_BOUND_MS = 3000;
  const bases = SAMPLE_IDS.map((id) => loadFixture(id));
  const failures = [];

  for (let i = 0; i < N; i++) {
    const base = bases[i % bases.length];
    const { kind, bytes } = mutateFixture(base.bytes, i * 2654435761);
    const started = Date.now();
    try {
      const docPromise = readWithSeed(bytes, {});
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('time bound exceeded')), TIME_BOUND_MS));
      const doc = await Promise.race([docPromise, timeout]);
      assertNoInvalidNumerics(docSubstrateForValidation(doc), `${base.id}+${kind}#${i}`);
    } catch (e) {
      failures.push({ base: base.id, kind, seed: i, elapsedMs: Date.now() - started, error: String(e && e.message || e) });
    }
  }

  if (failures.length) {
    const sample = failures.slice(0, 5).map((f) => `${f.base}+${f.kind}(seed ${f.seed}): ${f.error}`).join('\n  ');
    assert.fail(`${failures.length}/${N} fuzzed reads failed totality —\n  ${sample}`);
  }
});

// ── #5 — Degenerate inputs ───────────────────────────────────────────────────

test('Tier1 #5: degenerate inputs — every degenerate fixture reads to a well-formed reading, never throws or hangs', async () => {
  for (const row of listFixtures({ category: 'degenerate' })) {
    const f = loadFixture(row.id);
    const doc = await readWithSeed(f.bytes, {});
    assert.ok(Array.isArray(doc.sentences), `${row.id}: doc.sentences must be an array`);
    assert.ok(doc.log && typeof doc.log.snapshot === 'function', `${row.id}: doc.log must be a real log`);
    assertNoInvalidNumerics(docSubstrateForValidation(doc), row.id);
  }
});

test('Tier1 #5: empty input produces a valid, zero-unit reading — not null, not a throw', async () => {
  const doc = await readWithSeed(Buffer.alloc(0), {});
  assert.ok(doc, 'empty input must still produce a Reading, not null/undefined');
  assert.deepEqual(doc.sentences, [], 'empty input has zero units');
});
