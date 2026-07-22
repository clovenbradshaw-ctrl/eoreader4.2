import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createParser } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/reading.js';
import { makeLens, lensId, resolveLens, DEFAULT_LENS, DEFAULT_GAMMA } from '../src/perceiver/lens.js';

// The Lens as a first-class object (docs/ground-column §1). A Lens is the named, addressable
// selection rule a reading is read under — the two horizon coordinates (gamma, horizon) plus the
// optional Atmosphere corpus seed, collapsed into ONE object. These pin: L1 (addressable, a filter
// not a reweighting), L2 (every reading records its Lens), L4 (the default Lens is byte-identical),
// C6 (an inert corpus changes nothing), and backward compatibility with the loose gamma/horizon.

const TEXT = 'Grete tends the household with care. The father grows harsh and distant. '
  + 'The lodgers arrive and the rooms fill with strangers. Grete plays the violin for them. '
  + 'The father disowns the son at the table. The household settles into its decline.';

const doc = () => createParser().parse(TEXT);
const strip = ({ lens, ...rest }) => rest;   // the reading minus its address — the measured numbers

// ── the Lens object ───────────────────────────────────────────────────────────

test('lens: the DEFAULT Lens is the shipping recency reading at γ=0.7', () => {
  assert.equal(DEFAULT_GAMMA, 0.7);
  assert.equal(DEFAULT_LENS.gamma, 0.7);
  assert.equal(DEFAULT_LENS.horizon, 'recency');
  assert.equal(DEFAULT_LENS.corpus, null, 'no corpus seeds the default — inert (C6)');
  assert.ok(Object.isFrozen(DEFAULT_LENS), 'a Lens is immutable');
  assert.equal(lensId(DEFAULT_LENS), 'recency@γ0.70', 'the default address');
});

test('lens: makeLens normalises and is NOT silently promoted past a bad field (L4)', () => {
  assert.equal(makeLens({ gamma: NaN }).gamma, 0.7, 'a non-finite gamma falls back to the default');
  assert.equal(makeLens({ horizon: 'wild' }).horizon, 'recency', 'an unknown horizon is not a new default');
  const l = makeLens({ gamma: 0.95, horizon: 'entity' });
  assert.equal(l.gamma, 0.95);
  assert.equal(l.horizon, 'entity');
  assert.ok(Object.isFrozen(l));
});

test('lens: makeLens is idempotent — a Lens passed back through is the SAME object', () => {
  const l = makeLens({ gamma: 0.8, horizon: 'entity' });
  assert.equal(makeLens(l), l, 'no re-freeze, no copy');
});

test('lens: lensId is a stable, distinct ADDRESS per (horizon, gamma, corpus) (L1)', () => {
  assert.equal(lensId(makeLens({})), 'recency@γ0.70');
  assert.equal(lensId(makeLens({ gamma: 0.95 })), 'recency@γ0.95');
  assert.equal(lensId(makeLens({ horizon: 'entity' })), 'entity@γ0.70');
  // a corpus seed appends its identity (C5): name@hash, or name@? when the hash is unknown
  assert.equal(lensId(makeLens({ corpus: 'reuters' })), 'recency@γ0.70+reuters@?');
  assert.equal(lensId(makeLens({ corpus: { name: 'reuters', hash: 'abc123' } })), 'recency@γ0.70+reuters@abc123');
  // stable across calls
  const l = makeLens({ gamma: 0.9, horizon: 'entity' });
  assert.equal(lensId(l), lensId(l));
});

test('lens: resolveLens — explicit opts.lens wins over the loose coordinates', () => {
  assert.equal(resolveLens({}), DEFAULT_LENS, 'no hints ⇒ the default Lens, the same object');
  assert.equal(resolveLens({ gamma: 0.9 }).gamma, 0.9, 'a loose gamma builds a Lens');
  assert.equal(resolveLens({ horizon: 'entity' }).horizon, 'entity', 'a loose horizon builds a Lens');
  const r = resolveLens({ lens: { gamma: 0.5, horizon: 'entity' }, gamma: 0.9, horizon: 'recency' });
  assert.equal(r.gamma, 0.5, 'opts.lens takes precedence over opts.gamma');
  assert.equal(r.horizon, 'entity', 'opts.lens takes precedence over opts.horizon');
  assert.deepEqual(resolveLens({ corpus: 'x' }).corpus, { name: 'x', hash: null }, 'a loose corpus is admitted');
});

// ── the reading records its Lens (L2) ───────────────────────────────────────────

test('reading: every reading is ADDRESSED — it records the Lens it was read under (L2)', () => {
  const d = doc();
  for (let c = 0; c < d.sentences.length; c++) {
    const r = readingAt(d, c);
    assert.equal(typeof r.lens, 'string');
    assert.equal(r.lens, 'recency@γ0.70', 'the default reading is addressed to the default Lens');
  }
});

// ── the default Lens is byte-identical (L4) ─────────────────────────────────────

test('reading: the DEFAULT Lens leaves output byte-identical to no-opts (L4)', () => {
  const d = doc();
  for (let c = 0; c < d.sentences.length; c++) {
    const bare = readingAt(d, c);
    const viaLens = readingAt(d, c, { lens: DEFAULT_LENS });
    const viaLoose = readingAt(d, c, { gamma: 0.7, horizon: 'recency' });
    assert.deepEqual(viaLens, bare, 'opts.lens = DEFAULT_LENS matches no-opts exactly, address included');
    assert.deepEqual(viaLoose, bare, 'the explicit default coordinates match no-opts exactly');
  }
});

// ── backward compatibility: loose gamma/horizon still work, and match opts.lens ──

test('reading: loose gamma/horizon are backward-compatible and equal the collapsed Lens', () => {
  const d = doc();
  const cur = 4; // "The father disowns the son at the table."
  const wideLoose = readingAt(d, cur, { gamma: 0.95 });
  const wideLens = readingAt(d, cur, { lens: { gamma: 0.95 } });
  assert.equal(wideLoose.lens, 'recency@γ0.95', 'the loose gamma is reflected in the address');
  assert.deepEqual(wideLens, wideLoose, 'opts.gamma and opts.lens={gamma} produce the identical reading');

  const entLoose = readingAt(d, cur, { horizon: 'entity' });
  const entLens = readingAt(d, cur, { lens: { horizon: 'entity' } });
  assert.equal(entLoose.lens, 'entity@γ0.70');
  assert.deepEqual(entLens, entLoose, 'opts.horizon and opts.lens={horizon} produce the identical reading');
});

// ── the corpus slot is INERT (C6) ───────────────────────────────────────────────

test('reading: a corpus-seeded Lens is INERT — it re-addresses but changes no number (C6)', () => {
  const d = doc();
  for (let c = 0; c < d.sentences.length; c++) {
    const bare = readingAt(d, c);
    const seeded = readingAt(d, c, { lens: { corpus: { name: 'reuters', hash: 'abc123' } } });
    assert.equal(seeded.lens, 'recency@γ0.70+reuters@abc123', 'the surprise carries its corpus calibration (C5)');
    assert.deepEqual(strip(seeded), strip(bare), 'no corpus loaded into the arithmetic yet ⇒ identical measurements');
  }
});
