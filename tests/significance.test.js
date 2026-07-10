import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  inferSignificance, inferFoldSignificance, weaveSignificance, readSignificance, firewallAudit, auditLog,
} from '../src/surfer/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { projectGraph, canWitness } from '../src/core/index.js';
import { structureSurface } from '../src/perceiver/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// THE SIGNIFICANCE CONNECTOR (fold/significance.js) — the connections the reader INFERS but the
// text never states (contradicts · connects · corroborates), promoted to the graph as reafferent,
// void, provenance-carrying edges. They MOVE the physics (impact) while never touching the
// witnessed record (safe): factsAdded 0, inferredAdded N. The version that works.

// Alice & Carol both relate to Bob but never to each other (a latent CONNECTS); Bob both helped and
// did-not-help Alice (a CONTRADICTS). Both are read off the witnessed structure, neither is stated.
const TEXT = 'Alice trusts Bob. Carol trusts Bob. Bob helped Alice. Bob did not help Alice.';
const doc = () => parseText(TEXT, { docId: 'abc', genderCoref: true });
const witnessed = (g) => g.edges.filter((e) => canWitness(e.prov ?? null) !== false);

test('INFERS connections not in the text: a contradiction and a common-neighbour link', () => {
  const conns = inferSignificance(doc());
  const kinds = conns.map((c) => c.kind).sort();
  assert.ok(kinds.includes('contradicts'), 'the affirmed-and-denied bond becomes a contradiction');
  assert.ok(kinds.includes('connects'), 'the two figures that share a neighbour become a latent link');

  // and the connection is genuinely NOT in the witnessed structure — no such relation was parsed.
  const rels = (structureSurface(doc(), [0, 1, 2, 3]).relations || []).map((r) => `${r.src?.id}|${r.via}|${r.tgt?.id}`);
  const connect = conns.find((c) => c.kind === 'connects');
  assert.ok(!rels.some((k) => k === `${connect.src}|${connect.via}|${connect.tgt}`), 'the connects edge is inferred, never parsed from the text');
});

test('EPISTEMICS: every connection is reafference — canWitness false, enactor door, band void', () => {
  for (const c of inferSignificance(doc())) {
    assert.equal(c.op, 'CON', 'a connection is a CON — the bond at Relate × Structure');
    assert.equal(canWitness(c.prov), false, 'it can never witness world — the §8 firewall');
    assert.equal(c.door, 'enactor', 'reafference — the enactor door');
    assert.equal(c.band, 'void', 'held open — an interpretation, never firm');
    assert.equal(c.grounded, false);
    assert.equal(c.inferred, true, 'tagged as the reader\'s inference so the firewall attributes it');
  }
});

test('IMPACT: promoting the connections adds real edges to the graph, each carrying its provenance', () => {
  const d = doc();
  const before = projectGraph(d.log, {}).edges.length;
  const w = weaveSignificance(d);
  assert.ok(w.count >= 2, 'connections were committed');
  assert.equal(w.reafferent, true, 'every promoted edge is reafference');

  const g = projectGraph(d.log, {});
  assert.equal(g.edges.length, before + w.count, 'the inferred connections are real edges in the physics graph');
  // each inferred edge sits between real figures and carries prov (canWitness false) — the physics
  // reads it, a witnessed reader can tell it from world.
  const inferredEdges = g.edges.filter((e) => canWitness(e.prov ?? null) === false);
  assert.equal(inferredEdges.length, w.count);
  for (const e of inferredEdges) { assert.ok(e.from && e.to, 'between real figures'); }
});

test('FIREWALL: impact WITHOUT laundering — the witnessed record is untouched', () => {
  const d = doc();
  const witBefore = witnessed(projectGraph(d.log, {})).length;
  const w = weaveSignificance(d);

  const f = firewallAudit(d);
  assert.equal(f.factsAdded, 0, 'no inferred connection became a WITNESSED fact');
  assert.equal(f.inferredAdded, w.count, 'the reader\'s connections ride as the reafferent overlay');
  assert.equal(f.figuresAdded, 0, 'a connection links existing figures, never invents one');
  assert.equal(f.intact, true, 'the firewall holds — impact without laundering');

  const witAfter = witnessed(projectGraph(d.log, {})).length;
  assert.equal(witAfter, witBefore, 'the witnessed edge set is byte-unchanged');
});

test('IMPACT on attention: the surf field moves once the connections are on the graph', () => {
  const d = doc();
  const before = surfFold(d, 0, {}).field.map((f) => f.bayes);
  weaveSignificance(d);
  const after = surfFold(d, 0, {}).field.map((f) => f.bayes);
  let l1 = 0; for (let i = 0; i < before.length; i++) l1 += Math.abs((after[i] ?? 0) - (before[i] ?? 0));
  assert.ok(l1 > 0, `the reading's attention field responds to the inferred connections (L1 ${l1.toFixed(3)})`);
});

test('CONNECTS needs a shared neighbour AND no direct link — a directly-related pair is not linked', () => {
  // Alice and Bob are directly related (trusts), so they are never CONNECTED to each other; only
  // the non-adjacent Alice/Carol pair (shared neighbour Bob) is.
  const conns = inferSignificance(doc()).filter((c) => c.kind === 'connects');
  for (const c of conns) {
    const pair = new Set([c.src, c.tgt]);
    assert.ok(!(pair.has('alice') && pair.has('bob')), 'directly-related figures are not proposed as a latent connection');
  }
  assert.ok(conns.some((c) => new Set([c.src, c.tgt]).size === 2), 'the non-adjacent pair sharing a neighbour is connected');
});

test('CONTRADICTS needs a polarity clash — pure agreement yields none', () => {
  const agree = parseText('Alice trusts Bob. Carol trusts Bob.', { genderCoref: true });
  const conns = inferSignificance(agree);
  assert.ok(!conns.some((c) => c.kind === 'contradicts'), 'no clash, no contradiction');
  assert.ok(conns.some((c) => c.kind === 'connects'), 'but the shared neighbour is still connected');
});

test('composes with the audit: a doc carrying significance edges still reads firewall-intact', () => {
  const d = doc();
  weaveSignificance(d);
  const a = auditLog(d);   // auditLog reads EVA reflections (none here) but the firewall sees the connections
  assert.equal(a.firewall.intact, true);
  assert.equal(a.firewall.factsAdded, 0);
  assert.ok(a.firewall.inferredAdded >= 2, 'the audit surfaces the significance overlay');
});

// ── FOLD-FED — the significance read off the reader's folds at its surprise peaks, not the raw
// structure. Grete's care at the open and her relief at the close bind figures the structural
// reading never pairs, because the connection is drawn where the reading STRAINED, not where the
// graph converges.
const ARC = 'Grete brought Gregor food but looked away. The father struck Gregor with a stick. ' +
  'Grete decided Gregor was no longer her brother. The charwoman found Gregor dead. Grete felt relief.';

test('FOLD-FED: connections are drawn from the folds at surprise peaks, needing an injected surf', () => {
  const doc = parseText(ARC, { docId: 'arc', genderCoref: true });
  assert.throws(() => inferFoldSignificance(doc, {}), /surf must be injected/);
  const conns = inferFoldSignificance(doc, { surf: surfFold });
  assert.ok(conns.length >= 1, 'the reading strained over figures it binds into a connection');
  for (const c of conns) {
    assert.equal(canWitness(c.prov), false, 'a fold-fed connection is reafference — the firewall holds');
    assert.equal(c.band, 'void');
    assert.equal(c.inferred, true);
    assert.match(c.body, /recurring concern/, 'its WHY is read off the fold, not the parse graph');
  }
});

test('FOLD-FED finds a link the structure does not: the reading\'s recurring concern', () => {
  const doc = parseText(ARC, { docId: 'arc', genderCoref: true });
  const structural = new Set(inferSignificance(doc).map((c) => [c.src, c.tgt].sort().join('|')));
  const foldFed = inferFoldSignificance(doc, { surf: surfFold }).map((c) => [c.src, c.tgt].sort().join('|'));
  assert.ok(foldFed.some((p) => !structural.has(p)), 'the fold-fed reading surfaces a pair the structure never linked');
});

test('FOLD-FED composes under one firewall: weaveSignificance(surf) runs both readings, still intact', () => {
  const doc = parseText(ARC, { docId: 'arc', genderCoref: true });
  const structOnly = weaveSignificance(parseText(ARC, { docId: 'arc2', genderCoref: true }));   // no surf
  const both = weaveSignificance(doc, { surf: surfFold });                                       // structure + fold-fed
  assert.ok(both.count >= structOnly.count, 'adding the fold-fed reading never drops connections');
  const f = firewallAudit(doc);
  assert.equal(f.factsAdded, 0, 'no fold-fed connection became a witnessed fact');
  assert.equal(f.inferredAdded, both.count, 'every connection rides as the reafferent overlay');
  assert.equal(f.intact, true, 'both readings, one firewall — impact without laundering');
});

test('readSignificance reads the connections back; inference is deterministic', () => {
  const d = doc();
  weaveSignificance(d);
  assert.ok(readSignificance(d).length >= 2, 'the committed connections are read back off the log');

  const a = inferSignificance(doc()).map((c) => `${c.kind}:${c.src}->${c.tgt}`);
  const b = inferSignificance(doc()).map((c) => `${c.kind}:${c.src}->${c.tgt}`);
  assert.deepEqual(a, b, 'same document → identical inferences');
});
