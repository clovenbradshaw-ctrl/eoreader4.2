import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReflection, metaReflect, createMetaReader, buildMetaReflection,
  connect, buildConnection, weaveReading,
  analogize, relationGraph, wlColors,
  buildSubstrate, readReflections, readMetaReflections, readConnections,
  RESTING,
} from '../src/surfer/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// WEAVE (fold/weave.js) — loops on loops of deep reading. Loop 1 (deep-reading.js) deposits
// reflections at the places of most interest; this module adds LOOP 2 (metacognition — the
// reflection ABOUT the reflections) and CROSS-CONNECTIONS (CON bonds between held interpretations).
// Every product is reafferent and held at band void — the firewall holds at every level.

const BOOK =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a stick. The apple lodged in his back and festered. ' +
  'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead.';

const bookDoc = () => parseText(BOOK, { docId: 'metamorphosis.txt', genderCoref: true });

// Seed a document's log with hand-built reflections — deterministic, so the pattern read is exact.
const withReflections = (doc, specs) => {
  for (const s of specs) doc.log.append(buildReflection(s));
  return doc;
};

// A fake meaning-embedder: a one-hot over a tiny vocabulary keyed on which token a body mentions.
// Two bodies naming the same figure embed identically (cosine 1); different figures are orthogonal.
const VOCAB = ['grete', 'apple', 'father', 'clerk'];
const fakeEmbedder = {
  measuresMeaning: true,
  embed: async (text) => {
    const t = String(text).toLowerCase();
    const v = VOCAB.map((w) => (t.includes(w) ? 1 : 0));
    if (v.every((x) => x === 0)) v[0] = 1e-4;   // never a zero vector
    return v;
  },
};

// ── METACOGNITION (loop 2) ──────────────────────────────────────────────────────────

test('ONTOLOGY + EPISTEMICS: a meta-reflection is an enacted EVA one grain up, reafferent, band void', () => {
  const e = buildMetaReflection({ cursor: 3, focus: 'grete', pattern: 'recurring-focus', verdict: 'strain', surprise: 3, body: 'the reading keeps returning to Grete.', sources: [3, 8] });
  assert.equal(e.op, 'EVA', 'the evaluate operator');
  assert.equal(e.register, 'enacted');
  assert.equal(e.meta, true, 'tagged meta — one order up');
  assert.equal(e.order, 2);
  assert.equal(e.layer, 'metacognition');
  assert.equal(e.reflection, undefined, 'NOT reflection:true — readReflections must never fold it back in');
  assert.equal(e.band, 'void');
  assert.equal(e.grounded, false);
  assert.equal(canWitness(e.prov), false, 'the §8 firewall — a meta-reflection cannot witness world');
});

test('metaReflect reads the reading’s OWN reflections and notices a recurring focus', () => {
  // a mixed focus (one strain, one confirm) isolates recurring-focus — a strain-ONLY focus would
  // outrank it with a standing-strain note (see the next test).
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'Grete turns away.' },
    { cursor: 8, focus: 'grete', verdict: 'confirm', body: 'Grete relents, briefly.' },
    { cursor: 6, focus: 'father', verdict: 'confirm', body: 'The father drives him back.' },
  ]);
  const before = doc.log.length;
  const r = metaReflect(doc);
  assert.ok(r, 'a pattern was found');
  assert.equal(r.pattern, 'recurring-focus');
  assert.equal(r.focus, 'grete', 'the focus the reading kept returning to');
  assert.deepEqual([...r.sources], [3, 8], 'sourced to its own prior reflections — claim-src on itself');
  assert.equal(doc.log.length, before + 1, 'exactly one meta-reflection appended');
  assert.equal(r.canWitness, false, 'the firewall holds on the real log');

  // it never folds itself back in as a first-order reflection
  assert.equal(readReflections(doc).length, 3, 'still three first-order reflections — the meta-event is not one');
  assert.equal(readMetaReflections(doc).length, 1, 'the meta-event reads back as a metacognition event');
});

test('standing-strain: a focus that only ever strained is surfaced as an open question', () => {
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'Grete turns away.' },
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'Grete disowns him.' },
  ]);
  const reader = createMetaReader({ doc });
  const out = reader.arrive();
  const patterns = out.metaReflections.map((m) => m.pattern);
  assert.ok(patterns.includes('standing-strain'), 'a strain-only focus becomes a standing-strain note');
  assert.ok(patterns.includes('recurring-focus'), 'and the recurrence is noticed too');
});

test('GOVERNED LOOP: it habituates on the PATTERN and quiesces — no meta-rumination', () => {
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'Grete turns away.' },
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'Grete disowns him.' },
  ]);
  const reader = createMetaReader({ doc });
  const first = reader.arrive();
  assert.ok(first.metaReflections.length >= 1);
  assert.equal(reader.state, RESTING, 'it self-terminates');

  const again = reader.arrive();
  assert.equal(again.metaReflections.length, 0, 'the same patterns are never noticed twice — habituation');
  assert.equal(reader.canGround(reader.metaReflections[0]), false, 'a meta-reflection cannot ground itself');
});

test('nothing to reflect on: fewer than minRecur reflections yields no meta-reflection', () => {
  const doc = withReflections(bookDoc(), [{ cursor: 3, focus: 'grete', verdict: 'strain', body: 'Grete turns away.' }]);
  assert.equal(metaReflect(doc), null, 'a single reflection is no pattern');
  assert.equal(readMetaReflections(doc).length, 0);
});

// ── CROSS-CONNECTIONS ────────────────────────────────────────────────────────────────

test('ONTOLOGY: a connection is an enacted CON bond, reafferent, band void — never a firm edge', () => {
  const e = buildConnection({ kind: 'echo', a: 3, b: 8, aCursor: 3, bCursor: 8, sameness: 1, body: 'same idea twice.' });
  assert.equal(e.op, 'CON', 'the bond operator (Relate × Structure — the central operator)');
  assert.equal(e.register, 'enacted');
  assert.equal(e.connection, true);
  assert.equal(e.band, 'void', 'held open — an interpretation, never a firm bond');
  assert.equal(e.grounded, false);
  assert.equal(canWitness(e.prov), false, 'the firewall — a connection cannot witness world');
});

test('ECHO: two reflections that are the same proposition are connected, Born-gated', async () => {
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'grete turns away from him' },
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'grete disowns him entirely' },
    { cursor: 6, focus: 'father', verdict: 'confirm', body: 'father drives him back' },
    { cursor: 7, focus: 'apple', verdict: 'confirm', body: 'apple festers in his back' },
  ]);
  const before = doc.log.length;
  const out = await connect(doc, { embedder: fakeEmbedder, minSim: 0.5 });
  assert.equal(out.live, true, 'a meaning-embedder makes echo live');
  assert.equal(out.connections.length, 1, 'the two Grete reflections echo; father/apple do not');
  const c = out.connections[0];
  assert.equal(c.kind, 'echo');
  assert.deepEqual([c.aCursor, c.bCursor], [3, 8]);
  assert.equal(doc.log.length, before + 1, 'the echo landed on the log');
  assert.equal(readConnections(doc).length, 1);
});

test('the firewall on echo: a spelling-space embedder measures nothing → no connection asserted', async () => {
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'grete turns away' },
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'grete disowns him' },
  ]);
  const out = await connect(doc, { embedder: { measuresMeaning: false, embed: async () => [1, 0] }, minSim: 0.5 });
  assert.equal(out.live, false, 'held: equivalence is live only under a meaning-embedder');
  assert.equal(out.connections.length, 0, 'no echo asserted where the cosine measures nothing');
});

test('CROSS-CORPUS: an echo across two documents is a cross-doc connection', async () => {
  const docA = withReflections(parseText(BOOK, { docId: 'a.txt' }), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'grete turns away' },
  ]);
  const docB = withReflections(parseText(BOOK, { docId: 'b.txt' }), [
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'grete disowns him' },
  ]);
  // multi-doc: no shared log, so return uncommitted (commit is a no-op without a home log)
  const out = await connect([docA, docB], { embedder: fakeEmbedder, minSim: 0.5 });
  assert.equal(out.connections.length, 1, 'the same idea found in two texts is one connection');
  const c = out.connections[0];
  assert.equal(c.aDoc, 'a.txt');
  assert.equal(c.bDoc, 'b.txt');
  assert.match(c.body, /across two documents/);
});

test('BEARS-ON: a reflection whose focus touches a held tension is connected to it (pure, no embedder)', async () => {
  const doc = withReflections(bookDoc(), [{ cursor: 8, focus: 'gregor', verdict: 'strain', body: 'is gregor still their brother' }]);
  // a substrate carrying a competing-fills tension about gregor
  const substrate = {
    tensions: [{ id: 't0', label: 'gregor: the document gives both “brother” and “creature” and settles neither.' }],
    reframings: [],
  };
  const out = await connect(doc, { substrate, embedder: null });
  const bearsOn = out.connections.filter((c) => c.kind === 'bears-on');
  assert.equal(bearsOn.length, 1, 'the reflection bears on the tension about the same figure');
  assert.equal(bearsOn[0].b, 't0');
});

// ── ANALOGY — structure-mapping across the corpus ──────────────────────────────────────

// Two documents with ISOMORPHIC relation graphs but NO shared surface words: the analogy is
// carried by the topology, not the labels. Acme↔Umbra, Bob↔Kane, Corp↔Vortex, Dana↔Lee.
const BIZ   = 'Acme employs Bob. Acme partners Corp. Corp employs Dana. Bob trusts Dana.';
const CRIME = 'Umbra hires Kane. Umbra allies Vortex. Vortex hires Lee. Kane trusts Lee.';
const bizDoc   = () => parseText(BIZ,   { docId: 'biz' });
const crimeDoc = () => parseText(CRIME, { docId: 'crime' });
const mapOf = (out) => new Map(out.connections.map((c) => [c.a, c.b]));

test('STRUCTURE-MAPPING: isomorphic graphs map by topology, ignoring the surface labels', () => {
  const out = analogize([bizDoc(), crimeDoc()], { commit: false });
  const m = mapOf(out);
  assert.equal(m.get('Acme'), 'Umbra', 'the source-of-two maps to the source-of-two');
  assert.equal(m.get('Dana'), 'Lee', 'the sink-of-two maps to the sink-of-two');
  assert.equal(m.get('Bob'), 'Kane');
  assert.equal(m.get('Corp'), 'Vortex');
  assert.equal(out.connections.length, 4, 'the full four-node correspondence, one connection each');
  for (const c of out.connections) assert.equal(c.sameness, 1, 'every edge preserved — a clean isomorphism');
});

test('ONTOLOGY + FIREWALL: an analogy is a CON at band void, reafferent, sourced to both sides', () => {
  const out = analogize([bizDoc(), crimeDoc()], { commit: false });
  const c = out.connections[0];
  assert.equal(c.op, 'CON');
  assert.equal(c.kind, 'analogy');
  assert.equal(c.band, 'void', 'held open — never a firm structural claim');
  assert.equal(canWitness(c.prov), false, 'the firewall — structure-mapping is interpretation, not witness');
  assert.equal(c.aDoc, 'biz');
  assert.equal(c.bDoc, 'crime');
  assert.ok(c.sources.length >= 1, 'sourced to the passages that proposed the mapped relations');
});

test('SYSTEMATICITY: a structurally unrelated document yields no false analogy', () => {
  const flat = parseText('Sky is blue. Grass is green.', { docId: 'flat' });
  const out = analogize([bizDoc(), flat], { commit: false });
  assert.equal(out.connections.length, 0, 'no shared relational role → no correspondence (not a same-degree coincidence)');
});

test('the WL role signature is label-free: corresponding nodes share a colour across documents', () => {
  const A = relationGraph(bizDoc());
  const B = relationGraph(crimeDoc());
  const ca = wlColors(A), cb = wlColors(B);
  // Acme (source-of-two) and Umbra share a role colour; Acme and Dana (sink) do not.
  assert.equal(ca.get('acme'), cb.get('umbra'), 'same structural role → same colour, though no shared words');
  assert.notEqual(ca.get('acme'), ca.get('dana'), 'source and sink are different roles');
});

test('SUBGRAPH: the core mapping is robust to extra structure; unmatched roles simply drop', () => {
  // CRIME plus a disconnected extra relation (Zed→Yara) that has no counterpart in BIZ.
  const bigger = parseText('Umbra hires Kane. Umbra allies Vortex. Vortex hires Lee. Kane trusts Lee. Zed guards Yara.', { docId: 'bigger' });
  const out = analogize([bizDoc(), bigger], { commit: false });
  const m = mapOf(out);
  assert.equal(m.get('Acme'), 'Umbra', 'the four core roles still map through the added structure');
  assert.equal(m.get('Dana'), 'Lee');
  assert.equal(out.connections.length, 4, 'the extra Zed/Yara roles have no counterpart and are not invented');
  assert.ok(!m.has('Zed') && ![...m.values()].includes('Yara'), 'no spurious correspondence for the unmatched pair');
});

test('the composed nest folds analogy in when a corpus is given', async () => {
  const woven = await weaveReading(bizDoc(), { surf: surfFold, corpus: [bizDoc(), crimeDoc()] });
  const analogies = woven.connections.filter((c) => c.kind === 'analogy');
  assert.ok(analogies.length >= 1, 'weaveReading with a corpus surfaces analogy connections');
  for (const c of analogies) assert.equal(c.band, 'void');
});

// ── THE FIREWALL SURVIVES THE NEST ────────────────────────────────────────────────────

test('the substrate carries eo:MetaReflection and eo:Connection nodes, both band void, reafferent', () => {
  const doc = withReflections(bookDoc(), [
    { cursor: 3, focus: 'grete', verdict: 'strain', body: 'Grete turns away.' },
    { cursor: 8, focus: 'grete', verdict: 'strain', body: 'Grete disowns him.' },
  ]);
  createMetaReader({ doc }).arrive();
  doc.log.append(buildConnection({ kind: 'echo', a: 3, b: 8, aCursor: 3, bCursor: 8, sameness: 1, body: 'same idea twice.' }));

  const substrate = buildSubstrate({
    structure: { relations: [], defs: [] },
    reflections: readReflections(doc),
    metaReflections: readMetaReflections(doc),
    connections: readConnections(doc),
  });
  assert.ok(substrate.metaReflections.length >= 1, 'meta-reflections surface as nodes');
  assert.equal(substrate.metaReflections[0].band, 'void');
  assert.equal(substrate.metaReflections[0].witness, 'reafferent');
  assert.equal(substrate.connections.length, 1, 'the connection surfaces as a node');
  assert.equal(substrate.connections[0].band, 'void');
  assert.equal(substrate.connections[0].witness, 'reafferent');
});

test('a document with no weave is byte-identical — the new node groups are empty', () => {
  const doc = bookDoc();
  assert.deepEqual(readMetaReflections(doc), []);
  assert.deepEqual(readConnections(doc), []);
  const substrate = buildSubstrate({ structure: { relations: [], defs: [] } });
  assert.deepEqual(substrate.metaReflections, [], 'no meta-reflection node where none was deposited');
  assert.deepEqual(substrate.connections, [], 'no connection node where none was deposited');
});

test('COMPOSED NEST: weaveReading runs loop 1 → loop 2 → connections, and every product is void', async () => {
  const doc = bookDoc();
  const out = await weaveReading(doc, { surf: surfFold, embedder: fakeEmbedder });
  assert.ok(out.reflections.length >= 1, 'loop 1 deposited reflections');
  // every reflection, meta-reflection and connection on the log is reafferent — the firewall held
  for (const e of readReflections(doc)) assert.equal(canWitness(e.prov), false);
  for (const e of readMetaReflections(doc)) assert.equal(canWitness(e.prov), false);
  for (const e of readConnections(doc)) assert.equal(canWitness(e.prov), false);
  assert.equal(out.quiesced, true, 'both loops self-terminated');
});
