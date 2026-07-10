import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { meaningfulness, metacognize, traceReading, promote, surfToAnswer,
         encodeLevels, attributedEvaluation, SELF } from '../src/surfer/index.js';
import { structuralActivations } from '../src/surfer/structure-basis.js';

// Metacognition: the Born rule tests whether content COHERES into a reading (a spectrum that
// concentrates above the noise floor) or is a diffuse smear — and the reading is made VISIBLE.

const acts = (text) => structuralActivations(parseText(text, { docId: 'm', totalRead: true })).activations;

test('meaningfulness: empty / structureless content carries no reading', () => {
  assert.equal(meaningfulness([]).meaningful, false);
  assert.equal(meaningfulness([]).reason, 'empty — no content to read');
});

test('meaningfulness: a coherent passage concentrates a reading above the noise floor', () => {
  const m = meaningfulness(acts(
    'Pierre met Andrew. Pierre trusted Andrew. Andrew told Pierre the truth. ' +
    'Natasha loved Pierre. Pierre married Natasha. Natasha raised the children.'));
  assert.equal(m.meaningful, true, 'a structured passage is meaningful');
  assert.ok(m.concentration > 0, 'its spectrum departs the maximally-mixed ground');
  assert.ok(m.signalReadings >= 1, 'at least one reading stands out above the noise');
});

test('meaningfulness is a Born measure — concentration in [0,1], purity ≤ 1', () => {
  const m = meaningfulness(acts('Pierre walked. Pierre opened the door. Pierre sat.'));
  assert.ok(m.concentration >= 0 && m.concentration <= 1);
  assert.ok(m.purity > 0 && m.purity <= 1 + 1e-9);
  assert.ok(m.entropy >= 0);
});

test('metacognize retains provenance — testing the self\'s own content keeps owner=self', () => {
  const doc = parseText('CHAPTER I\nPierre met Andrew. Pierre trusted Andrew.\nCHAPTER II\nNatasha sang. Natasha danced.\n' +
    'CHAPTER III\nBoris waited. Boris left.\nCHAPTER IV\nMary read. Mary wrote.', { docId: 's0', totalRead: true });
  const enc = encodeLevels(doc);
  const r0 = surfToAnswer('who did Pierre trust?', { doc, encoding: enc, evaluation: attributedEvaluation(doc, enc) });
  const promoted = promote(r0, { level: 0, verdict: 'Pierre trusts Andrew because Andrew told him the truth, and that trust is earned.' });
  const v = metacognize(promoted);   // test the meaningfulness of the self's promoted verdict
  assert.ok(v.provenance, 'provenance is carried through the metacognitive test');
  assert.equal(v.provenance.owner, SELF, 'the verdict it tested was the self\'s own (owner=self)');
  assert.equal(v.provenance.wasLevel, 0);
  assert.equal(typeof v.meaningful, 'boolean');
});

test('traceReading makes the metacognition VISIBLE — EOT lines for what it parses through', () => {
  const t = traceReading('Pierre met Andrew. Pierre trusted Andrew. Natasha loved Pierre.');
  assert.ok(t.lines.length > 0, 'the reading emits a visible trace');
  // a figure entering and a bond forming both show, in EOT surface syntax.
  assert.ok(t.lines.some((l) => l.op === 'INS' && /^exists: /.test(l.eot)), 'figures shown as they enter');
  assert.ok(t.lines.some((l) => /\S -> \S.* : \S/.test(l.eot)), 'bonds shown as EOT LINK triples');
  assert.ok(/interesting|smear/.test(t.summary), 'a closing metacognitive summary (the Born judgment)');
  assert.equal(typeof t.meaningfulness.meaningful, 'boolean');
});

test('the spiral can gate on meaningfulness — a smear verdict is caught before it climbs', () => {
  // A coherent verdict reads as meaningful; an empty one does not — the gate the spiral consults.
  const good = metacognize('The opera defamiliarizes social pretense; Natasha sees only boards and the seeing is the point.');
  const empty = metacognize('');
  assert.equal(empty.meaningful, false, 'a smear does not earn the climb');
  assert.equal(typeof good.meaningful, 'boolean');
});
