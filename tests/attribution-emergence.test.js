import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createConventions, induceAttributionFrames, induceAttributions } from '../src/core/conventions/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { attributionNesting, nestFrames } from '../src/perceiver/index.js';

// EMERGENCE — the attribution nest reads WHO SPEAKS with as few seeds as possible. There is no
// report-verb list and no source-noun list anywhere; both registers are learn-only and INDUCED
// off their slot, the way induceAttributionVerbs reads speech verbs off the quotation mark. This
// proves the registers emerge from the text — a novel reporting verb and a novel bearer noun the
// engine has never seen are caught the moment their slot appears — with NO model and NO list.

const speechOf = () => { const c = createConventions(); return (w) => c.isAttributionVerb(w); };

test('the complementizer is induced off a known speech verb, not hard-coded', () => {
  // "said" is a speech verb; the short closed token after it, seen twice, is the marker. No
  // English "that" is assumed — the same bootstrap would learn a different language's particle.
  const segs = ['He said that it was late.', 'She said that they had gone.'];
  const { markers } = induceAttributionFrames(segs, { isSpeech: speechOf() });
  assert.ok(markers.includes('that'), 'the marker "that" is learned from where it sits, not seeded');
});

test('a NOVEL reporting verb is induced from its slot — no verb list', () => {
  // "quips" / "transmits" are in no seed. They occupy ⟨subject⟩ ___ that, so they are learned.
  const segs = ['Chen quips that the vendor lied.', 'The relay transmits that the grid is down.'];
  const { reportVerbs } = induceAttributionFrames(segs, { isSpeech: speechOf() });
  const learned = reportVerbs.map((r) => r.token);
  assert.ok(learned.includes('quips'), 'quips is learned as a report verb');
  assert.ok(learned.includes('transmits'), 'transmits is learned as a report verb');
});

test('a NOVEL source noun is induced from the bearer slot — no noun list', () => {
  const segs = ['The bulletin notes that the road closed.', 'The dossier alleges that officials knew.'];
  const { sourceNouns } = induceAttributionFrames(segs, { isSpeech: speechOf() });
  const learned = sourceNouns.map((r) => r.token);
  assert.ok(learned.includes('bulletin'), 'bulletin is learned as a source noun');
  assert.ok(learned.includes('dossier'), 'dossier is learned as a source noun');
});

test('the appositive "the fact that" is NOT a report frame — the determiner guards it', () => {
  // "fact" sits before "that" but is DETERMINER-preceded (a noun complement, not a verb-subject),
  // so it is never learned as a report verb — the one structural discriminator, no stop-list.
  const { reportVerbs } = induceAttributionFrames(['The fact that it rained is irrelevant.'], { isSpeech: speechOf() });
  assert.ok(!reportVerbs.some((r) => r.token === 'fact'), '"fact" is not mistaken for a report verb');
});

test('a bare agent ("residents said that") is a speaker but NOT the common-noun source class', () => {
  // Determiner-licence tells a source-NP ("the report") from a bare plural subject. The verb is
  // still learned; the bare noun is not promoted to the SOURCE register.
  const { sourceNouns, reportVerbs } = induceAttributionFrames(['Residents insisted that the river rose.'], { isSpeech: speechOf() });
  assert.ok(reportVerbs.some((r) => r.token === 'insisted'), 'the verb is learned');
  assert.ok(!sourceNouns.some((r) => r.token === 'residents'), 'a bare plural is not a source noun');
});

test('end to end — a parsed document self-teaches its registers, and the nest reads them', () => {
  // None of "quips" / "transmits" / "bulletin" is seeded. Parsing runs Pass 0, which induces them
  // into the doc's own ledger; the nest then reads a two-lens stack built entirely from what the
  // text taught — Chen relays the bulletin.
  const doc = parseText('Chen quips that the bulletin transmits that the sensors are failing.');
  assert.equal(doc.conventions.isReport('quips'), true);
  assert.equal(doc.conventions.isReport('transmits'), true);
  assert.equal(doc.conventions.isSourceNoun('bulletin'), true);

  const nz = attributionNesting(doc);
  const chain = nz.sentences[0].chains[0].map((s) => `${s.bearer ?? '∅'}:${s.mode}`);
  assert.deepEqual(chain, ['Chen:report', 'the bulletin:report']);
});

test('the seed floor is minimal — an unseen report verb only frames once the text teaches it', () => {
  // A ledger with priors but no corpus induction knows the SPEECH register only. "posits" is not
  // a speech verb, so the floor alone does not frame it…
  const floor = createConventions();
  assert.equal(floor.isReport('posits'), false);
  // …but a standalone nestFrames SELF-INDUCES off the very text, so it still reads the frame with
  // no seed and no doc — the register emerged from one sentence.
  const nest = nestFrames('Vasquez posits that the map is wrong.');
  assert.equal(nest.length, 1);
  assert.equal(nest[0].mode, 'report');
  assert.equal(nest[0].bearer, 'Vasquez');
});

test('induceAttributions writes all three registers into the ledger and stays defeasible', () => {
  const c = createConventions();
  induceAttributions(c, ['Ruiz said, "go."', 'Ruiz argues that the plan failed.', 'The memo warns that costs rose.']);
  assert.equal(c.isAttributionVerb('said'), true);   // speech, off the quote
  assert.equal(c.isReport('argues'), true);          // report, off the that-slot
  assert.equal(c.isSourceNoun('memo'), true);        // source, off the bearer slot
  // a learned register is defeasible like every other — a discovery can override it
  c.defeat('report-verb', 'argues');
  assert.equal(c.isReport('argues'), false);
});
