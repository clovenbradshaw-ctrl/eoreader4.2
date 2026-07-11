import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  redact, redactEot, EOT_LEGEND, restore, realizeRestored, fixArticles,
  buildTable, redactionTable, assertNoNameLeak,
} from '../src/weave/write/redact.js';
import { briefRDF } from '../src/weave/write/rdf.js';
import { emitEot } from '../src/organs/ingest/eot-emit.js';

// A tiny EOT-shaped doc: two entities and a date literal, related by two edges. The real
// surfaces (the who/what a remote model must never see) are the entity labels and the literal.
const doc = () => ({
  log: {
    events: [
      { op: 'INS', id: 1, label: 'Dr. Awad', sentIdx: 0 },
      { op: 'INS', id: 2, label: 'Meridian Corp', sentIdx: 0 },
      { op: 'CON', src: 1, via: 'advised', tgt: 2, sentIdx: 0 },
      { op: 'SIG', src: 2, via: 'acquired_on', tgt: 'March 2019', sentIdx: 1 },
    ],
  },
});

const SECRETS = ['Dr. Awad', 'Meridian Corp', 'March 2019'];
const QNAMES = ['Dr_Awad', 'Meridian_Corp', 'March_2019'];

test('redact: no real name — raw or QName-mangled — reaches the model input', () => {
  const { prompt } = redact(doc());
  const serial = `${prompt.system}\n${prompt.user}`;
  for (const s of SECRETS) assert.ok(!serial.includes(s), `leaked raw name: ${s}`);
  for (const q of QNAMES) assert.ok(!new RegExp(`\\b${q}\\b`).test(serial), `leaked QName: ${q}`);
});

test('redact: the referents are present, but only as opaque tokens', () => {
  const { prompt, table } = redact(doc());
  assert.match(prompt.user, /ex:Referent1\b/);
  assert.match(prompt.user, /ex:Referent2\b/);
  assert.match(prompt.user, /"Value1"/);           // the date literal, tokenized
  // the table maps each token back to its real surface — and lives only here, never sent
  assert.equal(table.get('Referent1'), 'Dr. Awad');
  assert.equal(table.get('Referent2'), 'Meridian Corp');
  assert.equal(table.get('Value1'), 'March 2019');
});

test('redact: the typed EO shape survives redaction (structure, not identity)', () => {
  const { prompt } = redact(doc());
  // the relations and the EO annotations pass through — the model loses reference, not shape
  assert.match(prompt.user, /eo:advised\b/);
  assert.match(prompt.user, /eo:op "CON"/);
  assert.match(prompt.user, /eo:band "firm"/);
  assert.match(prompt.user, /eo:door /);
});

test('the membrane is a no-op when nothing leaves the box — briefRDF unchanged without alias', () => {
  // the default (no alias) path still carries the real names, byte-for-byte as before
  const plain = briefRDF(doc(), { max: 24 });
  assert.ok(plain.includes('ex:Dr_Awad'), 'unredacted brief keeps the real QName');
  assert.ok(plain.includes('ex:Meridian_Corp'));
});

test('assertNoNameLeak throws on a planted leak (mechanical, mirror of assertNoLeak)', () => {
  const names = ['Dr. Awad', 'Meridian Corp'];
  assert.doesNotThrow(() => assertNoNameLeak({ system: '', user: 'Referent1 advised Referent2.' }, names));
  assert.throws(
    () => assertNoNameLeak({ system: '', user: 'Actually Dr. Awad advised them.' }, names),
    /redaction leak: name "Dr\. Awad"/,
  );
  // also caught in its ex:/eo: QName-mangled form
  assert.throws(
    () => assertNoNameLeak({ system: '', user: 'ex:Meridian_Corp a owl:NamedIndividual .' }, names),
    /redaction leak: name "Meridian Corp" \(as Meridian_Corp\)/,
  );
});

test('restore: de-pseudonymize the model prose, bare or ex:-prefixed tokens', () => {
  const { table } = redact(doc());
  const prose = 'Referent1 advised Referent2, and ex:Referent2 was acquired in Value1.';
  assert.equal(
    restore(prose, table),
    'Dr. Awad advised Meridian Corp, and Meridian Corp was acquired in March 2019.',
  );
});

test('fixArticles: the a/an rule the model could not have applied over an opaque token', () => {
  // the model wrote "a Referent1" / "an Referent2" blind; restoration makes the sound knowable
  assert.equal(fixArticles('a Ivory Holdings filed'), 'an Ivory Holdings filed');
  assert.equal(fixArticles('an Corp merged'), 'a Corp merged');
  assert.equal(fixArticles('A honest broker'), 'An honest broker');   // silent h → vowel sound
  assert.equal(fixArticles('an university'), 'a university');          // "yoo" onset → consonant
  assert.equal(fixArticles('a apple'), 'an apple');
});

test('realizeRestored: restore + local grammar fix, with unresolved tokens surfaced', () => {
  const table = new Map([['Referent1', 'Ivory Holdings']]);
  const out = realizeRestored('a Referent1 and a Referent9', table);
  assert.equal(out.text, 'an Ivory Holdings and a Referent9');   // Ref1 restored + a→an; Ref9 untouched
  assert.deepEqual(out.unresolved, ['Referent9']);               // the unmapped token is a loud guard
});

test('buildTable / redactionTable are deterministic and order-stable', () => {
  const t1 = redactionTable(doc());
  const t2 = redactionTable(doc());
  assert.deepEqual([...t1.back.entries()], [...t2.back.entries()]);
  assert.deepEqual([...t1.alias.entries()], [
    ['Dr. Awad', 'Referent1'],
    ['Meridian Corp', 'Referent2'],
    ['March 2019', 'Value1'],
  ]);
  // buildTable direct: entities get Referent{n}, literals Value{n}, first-appearance order
  const { alias } = buildTable([
    { label: 'A', kind: 'entity' }, { label: 'x', kind: 'literal' }, { label: 'B', kind: 'entity' },
  ]);
  assert.deepEqual([...alias.entries()], [['A', 'Referent1'], ['x', 'Value1'], ['B', 'Referent2']]);
});

// A richer reading, exercising the operators the RDF projection cannot carry: an attribute
// (DEF), an asserted absence (NUL), a state transition (EVA), and a NEGATED relation (CON −).
const richDoc = () => ({
  log: {
    events: [
      { op: 'INS', id: 1, label: 'Dr. Awad' },
      { op: 'INS', id: 2, label: 'Patient X' },
      { op: 'SIG', src: 1, via: 'is', tgt: 'physician', sentIdx: 0 },
      { op: 'DEF', id: 1, key: 'clinic', value: 'Meridian', sentIdx: 0 },
      { op: 'NUL', id: 1, key: 'license', sentIdx: 1 },
      { op: 'EVA', id: 1, via: 'status', from: 'suspended', to: 'active', sentIdx: 1 },
      { op: 'CON', src: 1, via: 'treated', tgt: 2, polarity: '−', sentIdx: 2 },
    ],
  },
});

const RICH_SECRETS = ['Dr. Awad', 'Patient X', 'Meridian', 'suspended', 'active'];

test('redactEot: the EOT carrier redacts entity labels AND literal values, structure passes', () => {
  const { prompt, table } = redactEot(richDoc());
  const u = prompt.user;
  for (const s of RICH_SECRETS) assert.ok(!u.includes(s), `EOT leaked: ${s}`);
  // entities and values became tokens; the type, fields, relation and operators stayed (structure)
  assert.match(u, /Referent1 : physician/);          // type designation carried (physician = structure)
  assert.match(u, /Referent1\.clinic = Value1/);      // attribute: value redacted, field key kept
  assert.match(u, /Referent1\.license = nil/);        // ABSENCE — dropped entirely by RDF
  assert.match(u, /!eva Referent1\.status : Value2 -> Value3/);   // TRANSITION — dropped by RDF
  assert.match(u, /Referent1 -> Referent2 : not-treated/);       // NEGATED relation — mangled by RDF
  assert.equal(table.get('Referent1'), 'Dr. Awad');
  assert.equal(table.get('Value1'), 'Meridian');
  // the legend that teaches the notation rides in the system prompt
  assert.ok(prompt.system.includes(EOT_LEGEND.slice(0, 24)));
});

test('EOT carries richness the RDF projection loses (the whole point of the carrier choice)', () => {
  const doc = richDoc();
  const eotUser = redactEot(doc).prompt.user;
  const rdfUser = redact(doc).prompt.user;
  // the absence and the transition exist in EOT, not in RDF
  assert.ok(eotUser.includes('= nil') && !rdfUser.includes('nil'));
  assert.ok(eotUser.includes('!eva') && !rdfUser.includes('eva'));
  // the relation's NEGATION survives in EOT; the RDF edge drops the polarity (says "treated")
  assert.ok(eotUser.includes('not-treated'));
  assert.ok(!rdfUser.includes('not-treated'));
});

test('emitEot alias is a no-op when absent — byte-identical to the unredacted surface', () => {
  const plain = emitEot(richDoc().log).text;
  assert.ok(plain.includes('Dr. Awad.clinic = Meridian'));      // real names/values, as before
  assert.ok(plain.includes('!eva Dr. Awad.status : suspended -> active'));
});

test('redactEot: restore round-trips the fuller surface, no leak throughout', () => {
  const { prompt, table } = redactEot(richDoc());
  assert.ok(!RICH_SECRETS.some((s) => `${prompt.system}${prompt.user}`.includes(s)));
  const modelOutput = 'Referent1, a physician at Value1, treated no one — notably not Referent2 — '
    + 'and moved from Value2 to Value3, though Referent1 held no license.';
  assert.equal(
    restore(modelOutput, table),
    'Dr. Awad, a physician at Meridian, treated no one — notably not Patient X — '
    + 'and moved from suspended to active, though Dr. Awad held no license.',
  );
});

test('end-to-end: redact → (model echoes tokens) → restore → local cleanup, no leak throughout', () => {
  const { prompt, table } = redact(doc());
  // a stand-in "remote model" that only ever saw tokens: it structures them into prose
  const modelOutput = 'Referent1 advised Referent2, an Referent2 later acquired in Value1.';
  // the model input never held a real name
  assert.ok(!SECRETS.some((s) => `${prompt.system}${prompt.user}`.includes(s)));
  // restore locally, then the a/an fix runs on the real names the model never saw
  const { text, unresolved } = realizeRestored(modelOutput, table);
  assert.equal(unresolved.length, 0);
  assert.equal(text, 'Dr. Awad advised Meridian Corp, a Meridian Corp later acquired in March 2019.');
});
