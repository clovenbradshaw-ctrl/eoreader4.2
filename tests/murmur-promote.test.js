import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';
import { canWitness } from '../src/core/provenance.js';
import { promoteConnection } from '../src/enactor/connect/index.js';

// The promotion gate (phase 4, the VERIFY half). murmur POINTS at a candidate connection; the
// DOCUMENT witnesses it. A document-corroborated relation bridging two passages promotes to a real
// CON edge (Tier 2); every other echo is held open as a firewalled EVA/void note (Tier 1). A
// murmur-nominated edge is reafferent — it enters the graph but can NEVER witness a later claim.

const docWith = (lines, docId = 'docP') => parseText(lines.join('\n'), { docId });
const cand = (from, to, extra = {}) => ({ from, to, sim: 0.95, ...extra });

test('Tier 2: a document-witnessed recurrence promotes to a grounded CON edge', async () => {
  // "Alice trusted Bob" is read at sentence 0 and again, distant, at sentence 5.
  const doc = docWith(['Alice trusted Bob.', 'The harvest failed.', 'Rain fell.', 'Crops died.', 'Traders fretted.', 'Alice trusted Bob deeply.'], 'docP');
  const res = await promoteConnection(
    cand({ docId: 'docP', sentIdxs: [5], cursor: 5 }, { docId: 'docP', sentIdxs: [0], cursor: 0 }),
    { docFor: (id) => (id === 'docP' ? doc : null) },
  );
  assert.equal(res.tier, 2, 'a verbatim recurrence across distant passages is grounded');
  assert.equal(res.event.op, 'CON');
  assert.equal(res.event.nominatedBy, 'murmur', 'the new provenance field records WHAT pointed here');
  assert.ok(res.event.connection, 'tagged a connective edge');
  assert.equal(res.event.citation, 's0', 'it cites the EARLIER passage that witnesses the echo');
  assert.equal(canWitness(res.event.prov), false, 'reafferent — a murmur edge can never witness another claim');

  // Appended, it is a real edge in the session graph — but stays OUT of the witness set.
  doc.log.append(res.event);
  const g = projectGraph(doc.log);
  const mine = g.edges.find((e) => e.prov && e.prov.door === 'enactor' && e.via === 'trusted');
  assert.ok(mine, 'the connection enters the graph as a CON edge (prosifiable content)');
  assert.equal(canWitness(mine.prov), false, 'and it can never corroborate a later claim (the firewall holds)');
});

test('Tier 1: an echo with no shared witnessed subject is held open, asserting nothing', async () => {
  const doc = docWith(['Alice trusted Bob.', 'x.', 'y.', 'z.', 'w.', 'Carol painted Dave.'], 'docQ');
  const before = projectGraph(doc.log).edges.length;
  const res = await promoteConnection(
    cand({ docId: 'docQ', sentIdxs: [5], cursor: 5 }, { docId: 'docQ', sentIdxs: [0], cursor: 0 }, { phrase: 'vaguely familiar' }),
    { docFor: (id) => (id === 'docQ' ? doc : null) },
  );
  assert.equal(res.tier, 1, 'no shared subject across the loci → not grounded, only a margin note');
  assert.equal(res.event.op, 'EVA');
  assert.equal(res.event.band, 'void', 'held open — an interpretation, never asserted firm');
  assert.equal(res.event.grounded, false);
  assert.equal(canWitness(res.event.prov), false);

  // projectGraph deliberately skips EVA — the Tier-1 note can never masquerade as a fact.
  doc.log.append(res.event);
  assert.equal(projectGraph(doc.log).edges.length, before, 'the Tier-1 reflection adds NO edge to the graph');
});

test('a contradicted relation is never promoted, even when its subject recurs', async () => {
  // Sarah is asserted as Abram's WIFE, then (a disjoint kinship axiom) as his SISTER on the same
  // pair. checkClaim contradicts the second; the connection is NOT written as a fact.
  const doc = docWith(['Sarah was the wife of Abram.', 'A famine came.', 'They traveled far.', 'Sarah was the sister of Abram.'], 'docK');
  const res = await promoteConnection(
    cand({ docId: 'docK', sentIdxs: [3], cursor: 3 }, { docId: 'docK', sentIdxs: [0], cursor: 0 }),
    { docFor: (id) => (id === 'docK' ? doc : null) },
  );
  assert.notEqual(res.tier, 2, 'a document-denied relation is never promoted to a grounded connection');
});

test('cross-doc echo cannot be verified yet → Tier 1 (documented first-cut limit)', async () => {
  const doc = docWith(['Alice trusted Bob.', 'Alice trusted Bob again.'], 'docR');
  const res = await promoteConnection(
    cand({ docId: 'docR', sentIdxs: [1], cursor: 1 }, { docId: 'docOTHER', sentIdxs: [0], cursor: 0 }),
    { docFor: (id) => (id === 'docR' ? doc : null) },
  );
  assert.equal(res.tier, 1, 'cross-doc entity ids are not comparable — held open, never fabricated');
});

test('a self-loop (a passage recognizing itself) writes nothing', async () => {
  const doc = docWith(['Alice trusted Bob.'], 'docS');
  const res = await promoteConnection(
    cand({ docId: 'docS', sentIdxs: [0], cursor: 0 }, { docId: 'docS', sentIdxs: [0], cursor: 0 }),
    { docFor: (id) => (id === 'docS' ? doc : null) },
  );
  assert.equal(res.tier, 0, 'no connection from a passage to itself');
});
