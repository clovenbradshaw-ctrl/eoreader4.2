// Probe for "the epithet-fold" — why "God", "Good God" and "Great God" show as THREE
// entities and not one, and what makes them one. Cheap, read-only, runnable narrative.
// Run: node probes/entity-epithet-merge.mjs
//
// It executes the REAL code paths — the name-variant clusterer (clusterAnchors) and the
// cross-source entity-panel merge (mergeEntitiesByReferent). It prints a report; it
// asserts nothing — the regression guards are tests/entity-epithet-merge.test.js. The
// point is to SEE, on the actual spine, three things:
//
//   1. WHY they split — the SAME sticky abstention that (rightly) keeps the two Bushes
//      and the two Testaments apart also keeps "Good God" / "Great God" apart. Orthography
//      cannot tell a decorated UNIQUE referent from a distinguished family.
//   2. WHAT flips it — one signal the conventions ledger already carries: the head is a
//      non-person ("God", the `isNonPerson` register) decorated by epithets ("Good",
//      "Great", the `isModifier` register). Feed that in and the three become one.
//   3. THE LIMIT — different NAMES of one referent (YHWH / Elohim / Adonai, in Hebrew)
//      share no letters, so NOTHING orthographic can fold them; that is a coreference /
//      discriminator-convergence job, not a name-variant one.

import { clusterAnchors } from '../src/perceiver/parse/index.js';
import { mergeEntitiesByReferent } from '../src/rooms/reader/entity-merge.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// The two conventions registers, as sets — exactly what the live ledger supplies via
// `isNonPerson` (a unique free-capital that names no person) and `isModifier` (an epithet
// adjective). Lowercased at the call, as the ledger's own `norm` does.
const NONPERSON = new Set(['god', 'lord']);
const EPITHET   = new Set(['good', 'great', 'almighty', 'holy', 'most', 'high', 'blessed', 'lord', 'eternal']);
const SIGNAL = {
  epithetHead: (t) => NONPERSON.has(String(t).toLowerCase()),
  isEpithet:   (t) => EPITHET.has(String(t).toLowerCase()),
};

// Print how a bag of surface labels clusters — once with the plain containment rule, once
// with the epithet signal fed in — so the flip (or the deliberate non-flip) is visible.
const clusterReport = (title, labels, note) => {
  h(title);
  if (note) console.log(dim('  ' + note));
  for (const [tag, opts] of [['plain   ', undefined], ['epithet ', SIGNAL]]) {
    const anchor = clusterAnchors(labels, opts);
    const groups = new Map();
    for (const l of labels) (groups.get(anchor.get(l)) || groups.set(anchor.get(l), []).get(anchor.get(l))).push(l);
    const shown = [...groups.entries()].map(([a, ls]) => ls.length > 1 ? `${a} ⇐ {${ls.join(', ')}}` : a);
    console.log(`  ${tag} → ${String(groups.size).padStart(2)} referents:  ${shown.join('   ·   ')}`);
  }
};

// ── 1. the screenshot, and the family/pair it is isomorphic to ─────────────────
clusterReport('God — the screenshot', ['God', 'Good God', 'Great God'],
  'Plain: three referents. "God" is a subsequence of both fuller names, which are incomparable, so it abstains.');
clusterReport('The two Bushes — the SAME shape, and here the split is RIGHT', ['George Bush', 'George Herbert Bush', 'George Walker Bush'],
  'The epithet signal must NOT touch this: no token is a non-person head. Two men stay two.');
clusterReport('Old Testament / New Testament — "throw in the old testament"', ['Testament', 'Old Testament', 'New Testament'],
  '"Old"/"New" are adjectives too, but "Testament" is no non-person head — so the fold stays OFF. Two books stay two.');

// ── 2. pile the epithets on; the head absorbs them all ─────────────────────────
clusterReport('God, decorated many ways', ['God', 'Good God', 'Great God', 'Almighty God', 'Most High God', 'Blessed God'],
  'Every epithet form folds onto the one head "God"; the plain rule leaves six.');

// ── 3. Hebrew — the containment chain, and the honest limit ─────────────────────
clusterReport('Hebrew — El and its epithets (same shape as God)', ['אל', 'אל שדי', 'אל עליון'],
  'El (אל) ⊑ El-Shaddai (אל שדי) and ⊑ El-Elyon (אל עליון) → El abstains → three. The Latin signal set has no'
  + ' Hebrew tokens, so "epithet" is still three here; the Hebrew-aware fold is the next block.');
clusterReport('Hebrew — the DIFFERENT names of God (the limit)', ['יהוה', 'אלהים', 'אדוני', 'השם'],
  'YHWH / Elohim / Adonai / HaShem share no letters — no orthographic rule folds them. That needs coreference, not this.');

// For the El-Hebrew case the epithet set above has no Hebrew tokens; show it folding with a
// Hebrew-aware signal so the mechanism is not mistaken for Latin-only.
h('Hebrew El-chain, with a Hebrew-aware signal');
console.log(dim('  epithetHead = {אל}, isEpithet = {שדי, עליון} — the same fold, another script.'));
{
  const HEB = { epithetHead: (t) => t === 'אל', isEpithet: (t) => ['שדי', 'עליון'].includes(t) };
  const labels = ['אל', 'אל שדי', 'אל עליון'];
  const anchor = clusterAnchors(labels, HEB);
  console.log(`  epithet  →  ${new Set([...anchor.values()]).size} referent:  ${[...new Set([...anchor.values()])].join(', ')} ⇐ {${labels.join(', ')}}`);
}

// ── 4. end-to-end: the actual entity-panel row, plain vs folded ────────────────
h('The entity panel — mentions and source-reach, plain vs folded');
const row = (label, docId, mentions) => ({ label, docId, entId: `${label}@${docId}`, sn: docId, mentions, links: 1, key: label });
const panelRows = [
  row('God', 'Genesis', 40), row('Good God', 'Genesis', 3),
  row('Great God', 'Psalms', 6), row('Almighty God', 'Psalms', 4), row('Most High God', 'Daniel', 2),
];
for (const [tag, opts] of [['plain   ', {}], ['epithet ', SIGNAL]]) {
  const merged = mergeEntitiesByReferent(panelRows, opts);
  console.log(`  ${tag} → ${merged.length} rows`);
  for (const r of merged) console.log(dim(`        ${r.label.padEnd(16)} mentions=${String(r.mentions).padStart(3)}  sources=${r.sourceCount}`));
}

console.log(dim('\nWhat would make it merge: the head is a non-person (isNonPerson) and the leading words are'));
console.log(dim('epithets (isModifier). Both are ledger registers already; the panel now reads them (app/entities.js).'));
