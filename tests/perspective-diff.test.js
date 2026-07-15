import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { perspectiveOf } from '../src/perceiver/perspective.js';
import {
  diffPerspectives, learnedDiff, mergePerspectives,
  claimText, claimPhrase, claimPolarity,
} from '../src/perceiver/perspective-diff.js';

// The Rashomon fold: the SAME events, read from two figures' folds, and the DIFFERENCE
// between those folds as a first-class, computable, model-free object. This proves it end
// to end over real parsed prose — with NO model at the floor — and then proves the LEARNED
// lift (proposition-equivalence over a meaning embedder) can only ADD agreements/conflicts,
// never lose the floor's, and holds the floor under a spelling-space embedder (the firewall).

// A worked scene: two speakers who see one platform differently. Reyes reads Fusus as
// surveillance that watches the city; the chief (named, so he resolves) reads it as recording
// nothing. Their quotes carry claims OF THEIR OWN — that is each figure's private universe.
const SCENE = [
  'Councilmember Reyes questioned the budget.',
  'Reyes said, "Fusus is a surveillance tool."',
  'Reyes said, "Fusus watches the city."',
  'Chief Delgado said, "Fusus is a safety tool."',
].join(' ');

// Resolve a bare name to an admitted id, tolerating a titled full label ("Chief Delgado").
const idFor = (doc, name) => {
  if (doc.admission.isAdmitted(name)) return doc.admission.idOf(name);
  for (const label of doc.admission.admitted.keys()) if (label.split(/\s+/).includes(name)) return doc.admission.idOf(label);
  return null;
};
const foldsOf = (scene) => {
  const doc = parseText(scene);
  const speech = doc.conventions?.isAttributionVerb;
  const reyes = perspectiveOf(doc, [idFor(doc, 'Reyes')].filter(Boolean), { isSpeech: speech });
  const delgado = perspectiveOf(doc, [idFor(doc, 'Delgado')].filter(Boolean), { isSpeech: speech });
  return { doc, reyes, delgado };
};

test('both figures read as agents with quotes and a fold of their own', () => {
  const { reyes, delgado } = foldsOf(SCENE);
  assert.equal(reyes.isAgent, true);
  assert.equal(delgado.isAgent, true);
  assert.ok(reyes.fold.claims.length >= 2, 'Reyes voices claims of his own');
  assert.ok(delgado.fold.claims.length >= 1, 'Delgado voices a claim of his own');
});

test('a claim renders to a neutral clause (for the embedder) and a signed phrase (for a surface)', () => {
  const isa = { type: 'is-a', subject: 'Fusus', value: 'a tool', polarity: '-' };
  assert.equal(claimText(isa), 'Fusus is a tool');       // neutral — polarity is the parser's, not spelling's
  assert.equal(claimPhrase(isa), 'Fusus is not a tool'); // signed — what a person reads
  assert.equal(claimPolarity(isa), '-');
  const link = { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' };
  assert.equal(claimPhrase(link), 'Fusus watches the city');
});

test('the lexical floor is deterministic, model-free, and separates conflict from each own', () => {
  const { reyes, delgado } = foldsOf(SCENE);
  const d = diffPerspectives(reyes, delgado);

  assert.equal(d.metric.basis, 'lexical');
  assert.match(d.a.label, /Reyes/);
  assert.match(d.b.label, /Delgado/);

  // "Fusus is a surveillance tool" vs "Fusus is a safety tool" — same subject, no shared
  // claim about it, no shared sign on a shared topic ⇒ a DIVERGENT subject, not agreement.
  const fusus = d.divergent.find((x) => x.subject === 'Fusus');
  assert.ok(fusus, 'Fusus is a divergent subject — both speak of it, sharing no claim');
  assert.ok(fusus.a.some((t) => /surveillance/.test(t)));
  assert.ok(fusus.b.some((t) => /safety/.test(t)));

  // Reyes's "Fusus watches the city" is his alone — Delgado never says it.
  assert.ok(d.onlyA.some((x) => /watches/.test(x.text)));
  assert.ok(d.onlyB.some((x) => /safety/.test(x.text)));
  assert.ok(!d.onlyB.some((x) => /watches/.test(x.text)));

  // determinism: the fold is pure — same input, byte-identical output.
  assert.deepEqual(diffPerspectives(reyes, delgado), d);
});

test('a direct contradiction (same topic, opposite sign) reads as a conflict', () => {
  // Reyes: "Fusus records nothing" is a negated claim; the report says it DOES record.
  const a = { label: 'A', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'records', object: 'faces', polarity: '+' },
  ] } };
  const b = { label: 'B', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'records', object: 'faces', polarity: '-' },
  ] } };
  const d = diffPerspectives(a, b);
  assert.equal(d.conflict.length, 1);
  assert.equal(d.shared.length, 0);
  assert.match(d.conflict[0].a.text, /Fusus records faces/);
  assert.match(d.conflict[0].b.text, /Fusus does not records faces/);
});

test('agreement on the same signed claim, and the overlap metric', () => {
  const a = { label: 'A', quotes: [], fold: { figures: [{ label: 'Fusus', count: 2 }, { label: 'City', count: 1 }], claims: [
    { type: 'is-a', subject: 'Fusus', value: 'a tool' },
    { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' },
  ] } };
  const b = { label: 'B', quotes: [], fold: { figures: [{ label: 'Fusus', count: 1 }, { label: 'Vendor', count: 1 }], claims: [
    { type: 'is-a', subject: 'Fusus', value: 'a tool' },
    { type: 'link', subject: 'Vendor', via: 'sold', object: 'Fusus' },
  ] } };
  const d = diffPerspectives(a, b);
  assert.equal(d.shared.length, 1);
  assert.match(d.shared[0].text, /Fusus is a tool/);
  assert.equal(d.onlyA.length, 1);   // Fusus watches the city
  assert.equal(d.onlyB.length, 1);   // Vendor sold Fusus
  // claimOverlap = shared / union(signed) = 1 / 3
  assert.equal(d.metric.claimOverlap, 0.333);
  // cast: Fusus shared; City only A; Vendor only B → castOverlap = 1/3
  assert.deepEqual(d.cast.shared, ['Fusus']);
  assert.equal(d.metric.castOverlap, 0.333);
});

// A stub MEANING embedder: paraphrases map to the same vector, antonyms to a shared axis with
// opposite sign (so cosine is high and the polarity slot decides same-vs-opposed). Everything
// else is orthogonal. measuresMeaning:true opens the learned path (the firewall is for the
// spelling organ). This stands in for MiniLM so the lift is testable with no model download.
const AXES = { surveil: 0, safety: 1, city: 2, vendor: 3, other: 4 };
const axisOf = (text) => /surveil|watch|monitor/.test(text) ? 'surveil'
  : /safe|protect|guard/.test(text) ? 'safety'
  : /city|street/.test(text) ? 'city'
  : /vendor|sold|bought/.test(text) ? 'vendor' : 'other';
const stubEmbedder = {
  measuresMeaning: true,
  embed: async (text) => {
    const v = new Array(6).fill(0);
    v[AXES[axisOf(text)]] = 1;
    return v;
  },
};
const spellingEmbedder = { measuresMeaning: false, embed: async () => [1, 0, 0, 0, 0, 0] };

test('the learned lift finds an agreement the spelling floor missed (paraphrase)', async () => {
  // "Fusus watches the city" (A) and "Fusus monitors the streets" (B) are the SAME assertion
  // to a meaning embedder, though they share no lexical topic key.
  const a = { label: 'A', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' },
  ] } };
  const b = { label: 'B', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'monitors', object: 'the streets' },
  ] } };

  const floor = diffPerspectives(a, b);
  assert.equal(floor.shared.length, 0);          // the floor cannot see the paraphrase
  assert.equal(floor.onlyA.length, 1);
  assert.equal(floor.onlyB.length, 1);

  const lifted = await learnedDiff(a, b, { embedder: stubEmbedder, alpha: 0.5 });
  assert.equal(lifted.metric.basis, 'meaning');
  assert.equal(lifted.shared.length, 1);         // meaning lifted it to an agreement
  assert.equal(lifted.shared[0].learned, true);
  assert.equal(lifted.onlyA.length, 0);          // and the claims it consumed left "each own"
  assert.equal(lifted.onlyB.length, 0);
});

test('the firewall holds — a spelling-space embedder returns the floor unchanged', async () => {
  const a = { label: 'A', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' },
  ] } };
  const b = { label: 'B', quotes: [], fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'monitors', object: 'the streets' },
  ] } };
  const lifted = await learnedDiff(a, b, { embedder: spellingEmbedder });
  const floor = diffPerspectives(a, b);
  assert.deepEqual(lifted.shared, floor.shared);
  assert.deepEqual(lifted.onlyA, floor.onlyA);
});

test('mergePerspectives unions one figure across sources for the topic-scope diff', () => {
  const s1 = { label: 'Reyes', source: 's1', quotes: [{ text: 'q1', idx: 0 }], attributions: [],
    fold: { text: '', figures: [{ label: 'Fusus', count: 2 }], claims: [{ type: 'is-a', subject: 'Fusus', value: 'a tool' }] } };
  const s2 = { label: 'Reyes', source: 's2', quotes: [{ text: 'q2', idx: 0 }], attributions: [],
    fold: { text: '', figures: [{ label: 'Fusus', count: 1 }, { label: 'City', count: 3 }],
      claims: [{ type: 'is-a', subject: 'Fusus', value: 'a tool' }, { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' }] } };
  const merged = mergePerspectives([s1, s2]);
  assert.equal(merged.label, 'Reyes');
  assert.equal(merged.quotes.length, 2);               // both sources' voices
  assert.equal(merged.fold.claims.length, 2);          // the duplicate "is a tool" folded once
  const fusus = merged.fold.figures.find((f) => f.label === 'Fusus');
  assert.equal(fusus.count, 3);                         // counts summed across sources
  assert.deepEqual(merged.sources.sort(), ['s1', 's2']);
});
