import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseText } from '../src/perceiver/parse/index.js';
import {
  readCommission, describeBrief,
  extractStyleTemplate, styleVectorOf, styleDistance, blendTemplates, describeTemplate,
  arcOf, surfaceOf, PHASE_OPS,
} from '../src/weave/commission/index.js';
import { MOVE_ALPHABET } from '../src/perceiver/predict/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(path.join(ROOT, 'data/metamorphosis.txt'), 'utf8');

// ── brief.js — reading the ask apart ─────────────────────────────────────────

test('brief: "in the style of X" is peeled into an exemplar', () => {
  const b = readCommission('write me an essay in the style of Montaigne');
  assert.equal(b.wantsCommission, true);
  assert.equal(b.deliverable, 'essay');
  assert.ok(b.exemplar, 'an exemplar was found');
  assert.equal(b.exemplar.name, 'Montaigne');
  assert.equal(b.exemplar.kind, 'author');
  assert.equal(b.wantsStyle, true);
  assert.equal(b.longform, true);
});

test('brief: topic and style are separated', () => {
  const b = readCommission('compose an essay about grief in the style of Joan Didion');
  assert.equal(b.deliverable, 'essay');
  assert.equal(b.topic, 'grief');
  assert.equal(b.exemplar.name, 'Joan Didion');
});

test('brief: other imitation cues are caught', () => {
  assert.equal(readCommission('draft a short story à la Borges').exemplar.name, 'Borges');
  assert.equal(readCommission('write something in the manner of Sir Thomas Browne').exemplar.name, 'Sir Thomas Browne');
  assert.equal(readCommission("a poem in Dickinson's voice").exemplar.name, 'Dickinson');
});

test('brief: a scholarly commission routes to the academic register', () => {
  const b = readCommission('write me a literature review of research on sleep and memory');
  assert.equal(b.register, 'scholarly');
  assert.equal(b.longform, true);
});

test('brief: a plain question is not a commission', () => {
  const b = readCommission('what is the capital of France?');
  assert.equal(b.wantsCommission, false);
  assert.equal(b.exemplar, null);
});

test('brief: an unspecified-inspiration commission is still a commission', () => {
  const b = readCommission('write me an essay on the ethics of attention');
  assert.equal(b.wantsCommission, true);
  assert.equal(b.exemplar, null);            // inspiration to be chosen by the selector
  assert.equal(b.topic, 'the ethics of attention');
  assert.match(describeBrief(b), /inspiration to be chosen/);
});

// ── template.js — the EOT structure ──────────────────────────────────────────

test('template: an exemplar reading yields a well-formed StyleTemplate', () => {
  const doc = parseText(fixture, { docId: 'meta' });
  const t = extractStyleTemplate(doc, { name: 'Kafka', title: 'The Metamorphosis', source: 'gutenberg' });

  assert.equal(t.kind, 'eo-style-template');
  // grammar: a bigram over the ten-symbol move alphabet
  assert.deepEqual(t.grammar.alphabet, MOVE_ALPHABET);
  const marginalSum = MOVE_ALPHABET.reduce((s, op) => s + t.grammar.marginal[op], 0);
  assert.ok(Math.abs(marginalSum - 1) < 1e-3, 'marginal is a distribution');
  for (const prev of MOVE_ALPHABET) {
    const rowSum = MOVE_ALPHABET.reduce((s, op) => s + t.grammar.trans[prev][op], 0);
    assert.ok(Math.abs(rowSum - 1) < 1e-3, `trans row ${prev} is a distribution`);
  }
  // fingerprint mirrors the marginal
  assert.ok(Math.abs(t.fingerprint.EVA - t.grammar.marginal.EVA) < 1e-3);
  // arc: a phase schedule
  assert.equal(t.arc.bins, 3);
  assert.equal(t.arc.phases.length, 3);
  for (const p of t.arc.phases) assert.ok(Object.keys(PHASE_OPS).includes(p));
  // surface: sane, bounded signatures
  assert.ok(t.surface.meanWords > 0);
  for (const k of ['quotationRate', 'firstPersonRate', 'digressionRate', 'lexicalDiversity']) {
    assert.ok(t.surface[k] >= 0 && t.surface[k] <= 1, `${k} in [0,1]`);
  }
  assert.equal(t.exemplar.name, 'Kafka');
  assert.equal(t.exemplar.source, 'gutenberg');
  assert.ok(t.provenance.movesRead > 0);
  assert.match(describeTemplate(t), /Kafka/);
});

test('template: styleVector is unit-norm and self-distance is zero', () => {
  const doc = parseText(fixture, { docId: 'meta2' });
  const t = extractStyleTemplate(doc, { name: 'Kafka' });
  const v = styleVectorOf(t);
  assert.equal(v.length, MOVE_ALPHABET.length + 8);
  const norm = Math.hypot(...v);
  assert.ok(Math.abs(norm - 1) < 1e-3, 'unit-norm');
  assert.ok(styleDistance(t, t) < 1e-4, 'a template is at distance ~0 from itself');
});

test('template: two different forms sit at a positive structural distance', () => {
  const doc = parseText(fixture, { docId: 'meta3' });
  const kafka = extractStyleTemplate(doc, { name: 'Kafka' });
  // a synthetic first-person, question-laden, clipped voice — a different region of shape-space
  const chatty = parseText(
    'Do you see it? I do. I think so. Why not? I ask myself. We wonder. I feel it now. '
    + 'Is that right? I hope so. We try. I know. Do we? I will. We shall. I must. Why? I care.',
    { docId: 'chatty' });
  const other = extractStyleTemplate(chatty, { name: 'chatter' });
  assert.ok(styleDistance(kafka, other) > 0.02, 'distinct forms are distinguishable');
});

test('template: blend fuses two exemplars into one grammar', () => {
  const a = extractStyleTemplate(parseText(fixture, { docId: 'a' }), { name: 'A' });
  const b = extractStyleTemplate(parseText(fixture.slice(0, fixture.length >> 1), { docId: 'b' }), { name: 'B' });
  const blend = blendTemplates([a, b]);
  assert.equal(blend.exemplar.blendedFrom, 2);
  const sum = MOVE_ALPHABET.reduce((s, op) => s + blend.grammar.marginal[op], 0);
  assert.ok(Math.abs(sum - 1) < 1e-2, 'blended marginal stays a distribution');
});

test('template: arcOf and surfaceOf are usable stand-alone', () => {
  const s = surfaceOf(['I wonder, greatly, at this.', 'The house—old, vast—stood still.']);
  assert.ok(s.digressionRate > 0);
  const arc = arcOf([{ op: 'INS', register: 'content', cursor: 0 }, { op: 'EVA', register: 'content', cursor: 9 }],
    { INS: 0.5, EVA: 0.5 }, { bins: 2 });
  assert.equal(arc.schedule.length, 2);
});
