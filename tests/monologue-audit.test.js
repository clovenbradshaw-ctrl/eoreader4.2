import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  auditMonologue, auditLog, firewallAudit, reportAudit, deepReading,
} from '../src/surfer/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { projectGraph, canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// THE MONOLOGUE AUDIT (fold/audit.js) — is the inner monologue actually helping? The instrument
// turns whatever the deep reader deposited into a verdict on the system's own terms: DISTINCT
// (not ruminating), NOVEL (not restating the record), SIGNIFICANT (beats the band), and SAFE
// (the firewall held — no reflection became a fact). These tests pin each verdict and the safety.

const PROSE =
  'Gregor woke to find himself changed. His body was hard and armored. ' +
  'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
  'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
  'His father drove him back with a stick. The apple lodged in his back and festered. ' +
  'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead.';
const devDoc = () => parseText(PROSE, { docId: 'metamorphosis.txt', genderCoref: true });

// A pool of mutually distinct one-sentence judgments — what a CAPABLE reflect voice produces on
// developing prose (each peak a different note). Indexed by cursor so the audit is deterministic.
const DISTINCT = [
  'The ordinary is being clung to even as it becomes impossible.',
  'A body has turned into an argument the family refuses to hear.',
  'The threshold is where love decides how far it will go, and stops.',
  'Compassion is already curdling into revulsion, tended and refused at once.',
  'Bureaucracy blunders into catastrophe, indifferent to the ruin in the room.',
  'Speech fails exactly where it is most needed, sealing him in.',
  'Protection has become violence without anyone deciding it should.',
  'The wound is left to fester because no one will look at it.',
  'The verdict lands from the one who loved him, which is what makes it final.',
  'Routine closes over the death as if nothing had interrupted it.',
];
const capableVoice = (fold, ctx) => ({ body: DISTINCT[ctx.cursor % DISTINCT.length], verdict: 'strain' });

test('HELPING: a distinct, novel voice that beats the band and leaves the record untouched', () => {
  const audit = auditMonologue(devDoc(), { surf: surfFold, reflect: capableVoice });
  assert.equal(audit.verdict, 'helping', audit.reason);
  assert.ok(audit.reflected >= 2, 'it reflected on more than one place');
  assert.ok(audit.distinctness >= 0.9, `distinct reflections (got ${audit.distinctness})`);
  assert.ok(audit.novelty >= 0.9, `novel — not restating the source (got ${audit.novelty})`);
  assert.equal(audit.firewall.intact, true, 'the record it can witness is untouched');
  assert.ok(audit.score >= 0.8, `a helping monologue scores high (got ${audit.score})`);
});

test('ECHOING: the MODEL-FREE monologue names the bond at each peak — distinct but restating', () => {
  // The honest finding the gen battery motivates (docs/deep-reading-gen-battery-2026-07.md): the
  // model-free inner note voices the substantive beat, which is a near-restatement of the source.
  const audit = auditMonologue(devDoc(), { surf: surfFold });   // no reflect → the inner note
  assert.equal(audit.verdict, 'echoing', audit.reason);
  assert.ok(audit.echo > 0.6, `the reflections restate their sources (echo ${audit.echo})`);
  assert.ok(audit.distinctness > 0.5, 'the model-free notes are still distinct from each other');
  assert.equal(audit.firewall.intact, true, 'echoing or not, the firewall holds');
});

test('RUMINATING: a voice that repeats itself is the churn instrument turned on the monologue', () => {
  const stuck = () => ({ body: 'The mechanism processes the input and returns the same settled output.', verdict: 'strain' });
  const audit = auditMonologue(devDoc(), { surf: surfFold, reflect: stuck });
  assert.equal(audit.verdict, 'ruminating', audit.reason);
  assert.ok(audit.rumination >= 0.5, `the bodies collide (rumination ${audit.rumination})`);
  assert.ok(audit.distinctness <= 0.5, 'distinctness is low — the inner voice is looping');
  // a looping monologue scores low even though each body is novel vs the source (geometric mean).
  assert.ok(audit.score <= 0.4, `a ruminating monologue scores low (got ${audit.score})`);
});

test('NOISE: reflecting on citation apparatus is caught even when the titles are distinct & novel', () => {
  // The merged-corpus failure (the real dolphins corpus): the surf peaks on bibliography TITLES
  // — bare quoted paper names the engine's terminal-tail guard cannot bound — and the voice names
  // their nouns. Distinctness and novelty are HIGH (the titles differ and don't echo the prose),
  // so only the apparatus dimension catches it: without it this would read, falsely, as helping.
  const corpus = [
    'Dolphins are marine mammals that use echolocation to hunt.',
    'They live in pods and cooperate when foraging.',
    '"Sex in Cetaceans: Morphology, Behavior, and the Evolution of Sexual Strategies".',
    '"Self-recognition in animals: Where do we stand 50 years later?"',
    '"chapter 15 Marine Mammals: Fisheries, Tourism and Management Issues" (PDF).',
    '"Adaptive features of aquatic mammals\' eye".',
    '"Encyclopedia of Marine Mammals".',
    '"Selective heating of vibrissal follicles in seals (Phoca vitulina) and dolphins (Sotalia fluviatilis)" (PDF).',
  ].join(' ');
  const audit = auditMonologue(parseText(corpus, { docId: 'dolphins-merged', genderCoref: true }), { surf: surfFold });
  assert.equal(audit.verdict, 'noise', audit.reason);
  assert.ok(audit.apparatus >= 0.5, `most reflections land on citation apparatus (got ${audit.apparatus})`);
  assert.equal(audit.score, 0, 'a monologue reflecting on bibliography scores 0 no matter how distinct the titles are');
  assert.ok(audit.notes.some((n) => n.onApparatus), 'the per-reflection notes flag the citation lines');
  assert.equal(audit.firewall.intact, true, 'noise or not, the firewall still holds');
});

test('CONTENT is not misread as citation: real prose with an embedded quote stays helping', () => {
  // guard against the apparatus detector over-firing: prose that merely CONTAINS a quote is not a
  // bibliography entry.
  const doc = parseText('Gregor woke changed. His father said "you are not my son" and drove him back. ' +
    'Grete brought food but looked away. The clerk demanded an explanation Gregor could not give.', { genderCoref: true });
  const audit = auditMonologue(doc, { surf: surfFold });
  assert.equal(audit.apparatus, 0, 'an embedded quote in prose is not flagged as a citation line');
  assert.notEqual(audit.verdict, 'noise');
});

test('IDLE: with the band above every peak, nothing is deposited and nothing is claimed helping', () => {
  const doc = devDoc();
  const before = doc.log.length;
  const audit = auditMonologue(doc, { surf: surfFold, medianBand: 1e9 });   // an unreachable floor
  assert.equal(audit.verdict, 'idle', audit.reason);
  assert.equal(audit.reflected, 0);
  assert.equal(audit.score, 0);
  assert.equal(doc.log.length, before, 'a below-band monologue deposits nothing — the log is untouched');
});

test('FIREWALL: after a real run, the projected graph is byte-identical — zero facts, zero figures added', () => {
  const doc = devDoc();
  const gBefore = projectGraph(doc.log, {});
  const factsBefore = gBefore.edges.length, figuresBefore = gBefore.entities.size ?? gBefore.entities.length;

  const audit = auditMonologue(doc, { surf: surfFold });   // deposits real reflections
  assert.ok(audit.reflected >= 1, 'reflections were deposited, so the firewall claim is non-trivial');

  const f = audit.firewall;
  assert.equal(f.factsAdded, 0, 'no reflection became a witnessed fact');
  assert.equal(f.figuresAdded, 0, 'no reflection introduced a figure');
  assert.equal(f.depictedIdentical, true, 'the depicted edges are identical with the reflections stripped');
  assert.equal(f.allReafferent, true, 'every reflection is reafferent — canWitness false, enactor door');
  assert.equal(f.allVoid, true, 'every reflection is held void and grounded false');
  assert.equal(f.intact, true);

  // and independently: the graph the reader CAN witness did not move.
  const gAfter = projectGraph(doc.log, {});
  assert.equal(gAfter.edges.length, factsBefore, 'edge count unchanged');
  assert.equal(gAfter.entities.size ?? gAfter.entities.length, figuresBefore, 'figure count unchanged');
  assert.equal(JSON.stringify(gAfter.edges), JSON.stringify(gBefore.edges), 'the facts are byte-identical');
});

test('UNSAFE: a reflection mis-minted as witnessable is caught — the verdict overrides everything', () => {
  const doc = devDoc();
  auditMonologue(doc, { surf: surfFold });                 // real, safe reflections first
  // forge a bad "reflection" onto the log: an EVA tagged reflection but claiming firm, grounded,
  // and witnessable — the exact laundering the firewall exists to prevent.
  doc.log.append({
    op: 'EVA', register: 'enacted', reflection: true, layer: 'reflection', cursor: 1, sentIdx: 1,
    focus: null, verdict: 'strain', surprise: 0.9, body: 'a smuggled fact', sources: [1],
    band: 'firm', grounded: true, prov: { fromEnactor: false }, door: 'perceiver',
  });
  const f = firewallAudit(doc);
  assert.equal(f.allReafferent, false, 'the bad reflection is at the wrong door / can witness');
  assert.equal(f.allVoid, false, 'the bad reflection is firm and grounded');
  assert.equal(f.intact, false, 'the firewall reports breached');

  const audit = auditLog(doc);
  assert.equal(audit.verdict, 'unsafe', 'the verdict is unsafe regardless of how the prose reads');
  assert.equal(audit.score, 0, 'an unsafe monologue scores 0 — the firewall gates the score');
});

test('FIREWALL has teeth: a reflection minted with a WITNESSABLE op is caught as a fact leak', () => {
  // The subtle breach: not an EVA tagged firm, but a reflection forged with a witnessable op
  // (op:'CON') so projectGraph turns it into a real edge. The firewall strips by the reflection
  // TAG (any op), so the forged edge is present with reflections in but absent with them stripped
  // → factsAdded fires. (Were the strip keyed on op==='EVA', this would slip through as intact.)
  const doc = devDoc();
  const cleanFacts = projectGraph(doc.log, {}).edges.length;
  doc.log.append({
    op: 'CON', reflection: true, register: 'enacted', layer: 'reflection',
    src: { id: 'grete', label: 'Grete' }, tgt: { id: 'gregor', label: 'Gregor' }, via: 'betrays',
    sentIdx: 8, cursor: 8, band: 'firm', grounded: true, prov: { fromEnactor: false }, door: 'perceiver',
  });
  assert.ok(projectGraph(doc.log, {}).edges.length > cleanFacts, 'the forged CON is a real edge in the record');
  const f = firewallAudit(doc);
  assert.ok(f.factsAdded > 0, 'the projection delta catches the reflection that became a fact — the check is not vacuous');
  assert.equal(f.depictedIdentical, false);
  assert.equal(f.intact, false);
  assert.equal(auditLog(doc).verdict, 'unsafe');
});

test('short reflections still compare: two identical 2-word bodies read as ruminating, not distinct', () => {
  // The bigram fallback: a pure-trigram set is empty below three content words, so two identical
  // short notes would otherwise read as maximally distinct. The stuck voice returns a 2-content-
  // word body at every peak.
  const stuck = () => ({ body: 'Bureaucracy collapses.', verdict: 'strain' });
  const audit = auditMonologue(devDoc(), { surf: surfFold, reflect: stuck });
  assert.ok(audit.reflected >= 2, 'more than one short reflection');
  assert.ok(audit.rumination >= 0.9, `identical short bodies collide (rumination ${audit.rumination})`);
  assert.equal(audit.verdict, 'ruminating');
});

test('echoing fires per-item: a few verbatim echoes are not hidden by many novel reflections', () => {
  // decide() uses echoRate (the fraction of reflections that individually cross the restatement
  // line), not meanEcho — so a minority of verbatim echoes cannot average away.
  const doc = parseText('Gregor woke changed. His body was armored. The family would not enter. ' +
    'Grete brought him food but looked away. The clerk demanded an explanation. His father drove him back.', { genderCoref: true });
  // a voice that copies the source sentence at every peak → every reflection is a verbatim echo.
  const sents = doc.units || doc.sentences || [];
  const copy = (fold, ctx) => ({ body: String(sents[ctx.cursor] || ''), verdict: 'strain' });
  const audit = auditMonologue(doc, { surf: surfFold, reflect: copy });
  assert.ok(audit.echoRate >= 0.5, `most reflections restate their source (echoRate ${audit.echoRate})`);
  assert.equal(audit.verdict, 'echoing');
});

test('APPARATUS: the monologue reflects on the prose and deposits NOTHING on a citation tail', () => {
  const TAIL = ' References. ↑ Smith, J. (1950). Kafka Studies. Princeton University Press. ISBN 0-000-00000-0. ' +
    '↑ Doe, A. (1961). doi: 10.1000/abcd. Retrieved 2020-01-01, archived from the original.';
  const proseCount = (parseText(PROSE, {}).units || parseText(PROSE, {}).sentences || []).length;
  const audit = auditMonologue(parseText(PROSE + TAIL, { docId: 'tailed', genderCoref: true }), { surf: surfFold });
  assert.ok(audit.reflected >= 1, 'it still reflects on the real prose');
  for (const n of audit.notes) {
    assert.ok(n.peak < proseCount, `reflection at §${n.peak} must be in the prose (< §${proseCount}), never the citation tail`);
  }
  assert.equal(audit.firewall.intact, true);
});

test('DETERMINISM: the model-free audit is a pure function of the document', () => {
  const a = auditMonologue(devDoc(), { surf: surfFold });
  const b = auditMonologue(devDoc(), { surf: surfFold });
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same document → identical audit');
});

test('READ-ONLY: auditLog reads the log without mutating it; an untouched doc is idle', () => {
  const doc = devDoc();
  const before = doc.log.length;
  const audit = auditLog(doc);
  assert.equal(audit.verdict, 'idle', 'no reflection deposited → nothing to help with');
  assert.equal(audit.reflected, 0);
  assert.equal(audit.firewall.factsAdded, 0);
  assert.equal(doc.log.length, before, 'auditLog appended nothing — it is a pure read');

  // deposit one reflection, then auditLog sees it, still without mutating.
  deepReading(doc, { surf: surfFold });
  const mid = doc.log.length;
  const a2 = auditLog(doc);
  assert.equal(a2.reflected, 1, 'auditLog reads the deposited reflection off the log');
  assert.equal(doc.log.length, mid, 'still a pure read');
});

test('reportAudit renders the verdict and the firewall line as text', () => {
  const audit = auditMonologue(devDoc(), { surf: surfFold, reflect: capableVoice });
  const report = reportAudit(audit, { title: 'test' });
  assert.match(report, /verdict\s+HELPING/i);
  assert.match(report, /firewall\s+INTACT/i);
  assert.match(report, /facts added 0/);
});
