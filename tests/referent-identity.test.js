import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { referentApiFor } from '../src/perceiver/referents/index.js';
import { projectGraph } from '../src/core/index.js';

// REFERENT-FIRST IDENTITY (src/perceiver/referents/). A spelling is an observed SURFACE MENTION
// that DENOTES a latent, opaque referent; identity is shared denotation, never string-merging.
// The layer is gated by referentIdentity:'mention' and byte-identical when off. These tests pin
// the spec's invariants and acceptance criteria on small worked corpora.

const FRANK =
  'Victor Frankenstein toiled for months to build his creation from lifeless matter. ' +
  'On a dreary night in November, Frankenstein beheld the creature open its dull yellow eyes. ' +
  'The creature stretched out a hand toward its maker, but Victor fled the room in horror. ' +
  'For days the creature wandered the woods alone and learned to fear the cruelty of men. ' +
  'The creature watched a poor family through a chink in their cottage wall. ' +
  'The wretch taught itself to speak by listening to the cottagers each evening. ' +
  'When the creature revealed itself, the family drove the wretch away with stones. ' +
  'The creature swore revenge against Frankenstein for abandoning it to misery. ' +
  'The wretch strangled young William in the woods outside Geneva. ' +
  'Frankenstein climbed the glacier and there the creature confronted him. ' +
  'The creature begged Victor to build it a companion so it would no longer be alone. ' +
  'When Victor destroyed the half-made bride, the creature vowed to ruin him. ' +
  'The creature murdered Elizabeth, and Frankenstein pursued the wretch into the frozen north.';

const on = () => parseText(FRANK, { docId: 'pg84', unnamedReferents: true, referentIdentity: 'mention' });
const nameMention = (doc, text) => doc.surfaceMentions().find((m) => m.form === 'name' && m.text === text);
const events = (doc) => (doc.log.snapshot ? doc.log.snapshot() : doc.log.events);

test('acceptance 10 — the layer is OFF by default and byte-identical (only appends when on)', () => {
  const off = parseText(FRANK, { docId: 'pg84', unnamedReferents: true });
  const withRef = on();
  assert.equal(off.referentOf, undefined, 'no referent API when the flag is off');
  // The on-stream is the off-stream plus APPENDED denotation events — nothing rewritten. Compare
  // the shared prefix modulo the per-event wall-clock `t` (which differs between any two runs).
  const strip = (e) => { const { t, ...rest } = e; return JSON.stringify(rest); };
  const a = events(off).map(strip), b = events(withRef).map(strip);
  assert.ok(b.length > a.length, 'the on-stream only grows');
  for (let i = 0; i < a.length; i++) assert.equal(b[i], a[i], `event ${i} is unchanged`);
  assert.ok(events(withRef).slice(a.length).every((e) => e.op === 'SYN' || e.op === 'EVA'),
    'everything appended is a denotation SYN / EVA — the identity union-find is untouched');
});

test('acceptance 1 — Victor and Frankenstein denote ONE opaque referent, no token overlap needed', () => {
  const doc = on();
  const v = nameMention(doc, 'Victor'), f = nameMention(doc, 'Frankenstein');
  assert.ok(v && f, 'both surfaces were observed');
  const rv = doc.referentOf(v.id), rf = doc.referentOf(f.id);
  assert.equal(rv, rf, '"Victor" and "Frankenstein" point to the same referent');
  // invariant 2 / acceptance 9 — the id is OPAQUE, never a slug of a preferred name.
  assert.match(rv, /^ref-\d+$/, 'the referent id is opaque');
  assert.ok(!/victor|frankenstein/i.test(rv), 'the id is not derived from any surface');
});

test('the surfaces of that referent are its exact mentions, not one canonical label', () => {
  const doc = on();
  const ref = doc.referentOf(nameMention(doc, 'Victor').id);
  const surfaces = doc.surfacesOf(ref);
  const forms = new Set(surfaces.map((m) => m.text));
  assert.ok(forms.has('Victor') && forms.has('Frankenstein') && forms.has('Victor Frankenstein'),
    'every observed surface of the referent is retained as provenance');
  // each surface addresses an exact occurrence (acceptance 8) — a span that round-trips to source.
  for (const m of surfaces) assert.match(m.id, /^surface:pg84:\d+:\d+-\d+$/);
});

test('the nameless creature is ONE referent — all its descriptions converge (the user\'s ask)', () => {
  const doc = on();
  const creature = doc.surfaceMentions().find((m) => m.form === 'description' && /creature/.test(m.text));
  const wretch   = doc.surfaceMentions().find((m) => m.form === 'description' && /wretch/.test(m.text));
  assert.ok(creature && wretch, 'both descriptions were observed as surfaces');
  assert.equal(doc.referentOf(creature.id), doc.referentOf(wretch.id),
    '"the creature" and "the wretch" denote the same referent, though the strings are disjoint (invariant 4)');
});

test('Assembly B — referentApiFor builds the center POST-HOC, without the parse-time flag', () => {
  // The plan's Assembly B: on an ordinarily-parsed doc (NO referentIdentity flag), the referent API
  // is built lazily off the doc's own log/admission/corefField and STILL yields one opaque center for
  // the nameless creature. This proves the fold composes over a plain parse — the path every reader
  // consumer will take when the layer is promoted (Assembly C).
  const doc = parseText(FRANK, { docId: 'pg84', unnamedReferents: true });   // no referentIdentity — plain parse
  assert.equal(doc.referentOf, undefined, 'plainly parsed: no referent API is threaded');
  const api = referentApiFor(doc);
  assert.ok(api && typeof api.referents === 'function', 'the API is built post-hoc off the parsed doc');

  const creature = api.surfaceMentions().find((m) => m.form === 'description' && /creature/.test(m.text));
  const wretch   = api.surfaceMentions().find((m) => m.form === 'description' && /wretch/.test(m.text));
  const rc = api.referentOf(creature.id);
  assert.ok(rc && rc.startsWith('ref-') && !/creature|wretch/i.test(rc), 'the center is OPAQUE, not a slug (invariant 2)');
  assert.equal(rc, api.referentOf(wretch.id), 'creature and wretch converge on the one post-hoc center');

  const center = api.referents().find((r) => r.id === rc);
  assert.ok(/creature/i.test(center.display) && /wretch/i.test(center.display),
    'its display reads the epithets it was seen under, not one canonical name');
  // Consumer-safety: the center aggregates its mentions as PROVENANCE; it did not inflate the firm
  // entity graph — the same doc parsed without the API has the identical firm sightings.
  const firmSightings = (d) => {
    const g = projectGraph(d.log); let total = 0;
    for (const [, ent] of g.entities) total += ent.sightings || 0;
    return total;
  };
  const plain = parseText(FRANK, { docId: 'pg84', unnamedReferents: true });
  assert.equal(firmSightings(doc), firmSightings(plain), 'building the referent layer added zero firm sightings');
});

test('invariant 7 — relations bind REFERENT ids, with the surface span kept as provenance', () => {
  const doc = on();
  const edges = doc.referentEdges();
  const creatureRef = doc.referentOf(doc.surfaceMentions().find((m) => m.form === 'description' && /creature/.test(m.text)).id);
  const victorRef   = doc.referentOf(nameMention(doc, 'Victor').id);
  // The creature's agency — bonds the main read never made (the description was not yet a referent)
  // and the retroactive cursor recovered — now anchor the creature referent.
  const acts = edges.filter((e) => e.src === creatureRef);
  assert.ok(acts.length >= 4, 'the creature referent is the subject of its own actions');
  assert.ok(acts.every((e) => typeof e.src === 'string' && e.src.startsWith('ref-')), 'endpoints are referent ids');
  // "Frankenstein pursued the wretch" — a bond whose np-object was the wretch — resolves onto the
  // creature referent, and Frankenstein onto Victor's referent.
  assert.ok(edges.some((e) => e.src === victorRef && e.tgt === creatureRef && e.via === 'pursued'),
    'the object "the wretch" resolves to the creature referent');
});

test('acceptance 7 — a reader assertion merges disjoint surfaces; undo restores by retraction', () => {
  const doc = on();
  const william = nameMention(doc, 'William'), elizabeth = nameMention(doc, 'Elizabeth');
  const before = [doc.referentOf(william.id), doc.referentOf(elizabeth.id)];
  assert.notEqual(before[0], before[1], 'they start as distinct referents');

  const res = doc.assertCoreference([william.id, elizabeth.id], { warrant: 'reader-test' });
  assert.ok(res.ok && res.seqs.length, 'the assertion logged');
  assert.equal(doc.referentOf(william.id), doc.referentOf(elizabeth.id), 'now one referent');

  doc.retractIdentity(res.seqs[0], 'undo');
  assert.notEqual(doc.referentOf(william.id), doc.referentOf(elizabeth.id),
    'undo is an APPENDED retraction — the projection returns to the prior grouping (invariant 6)');
});

test('invariant 3 — a user split keeps two surfaces apart and blocks regrouping', () => {
  const doc = on();
  const v = nameMention(doc, 'Victor'), f = nameMention(doc, 'Frankenstein');
  assert.equal(doc.referentOf(v.id), doc.referentOf(f.id), 'they begin as one referent');
  const split = doc.assertDistinct([v.id, f.id], { warrant: 'reader-test' });
  assert.ok(split.ok, 'the split logged');
  assert.notEqual(doc.referentOf(v.id), doc.referentOf(f.id), 'they are now distinct');
  // a later proposal to merge them is refused — conflict dominates convergence.
  const prop = doc.proposeCoreference([v.id, f.id], { warrant: 'auto' });
  assert.equal(prop.verdict, 'conflict', 'the split blocks speculative regrouping');
});

test('acceptance 6 — incompatible functional attributes defeat a proposed coreference', () => {
  const doc = parseText(
    'Alan Turing was born in 1912 and led the effort. Alan Young was born in 1919 and joined later.',
    { docId: 'bios', referentIdentity: 'mention' });
  const turing = nameMention(doc, 'Alan Turing'), young = nameMention(doc, 'Alan Young');
  assert.ok(turing && young, 'both figures observed');
  assert.notEqual(doc.referentOf(turing.id), doc.referentOf(young.id), 'distinct referents to begin with');
  const prop = doc.proposeCoreference([turing.id, young.id], { warrant: 'shared-given-name' });
  assert.equal(prop.verdict, 'conflict', 'a birth-year conflict refuses the merge');
  assert.equal(prop.reason, 'functional-key-conflict');
});

test('acceptance 2 — a shared surname does not force a merge (Alphonse Frankenstein is distinct)', () => {
  const doc = parseText(
    'Victor Frankenstein built the creature. Alphonse Frankenstein was his father and lived in Geneva.',
    { docId: 'kin', referentIdentity: 'mention' });
  const victor = nameMention(doc, 'Victor Frankenstein'), alphonse = nameMention(doc, 'Alphonse Frankenstein');
  assert.ok(victor && alphonse, 'both full names observed');
  assert.notEqual(doc.referentOf(victor.id), doc.referentOf(alphonse.id),
    'two people who share the surname "Frankenstein" remain different referents (invariant 3)');
});
