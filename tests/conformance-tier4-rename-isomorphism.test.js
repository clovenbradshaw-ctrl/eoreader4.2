// TIER 4 — Lexical independence, the rename isomorphism (docs/parse-
// conformance-spec.md). "The highest-value tier in the suite... the one test
// that can falsify the modelless architecture's core claim, it needs no
// labels, and it will almost certainly fail the first time you run it."
//
// Correspondence method: a referent's identity across two reads is established
// at the PROJECTED (post-union-find) entity level — the actual unit of
// "referent" the individuation gate and the graph both operate on, not a raw
// admission id (entities.js can split one real-world referent across several
// admission ids — a bare surname alongside a title-prefixed full name — until
// project.js's union-find folds them). A projected entity's `label` is exactly
// the admitted label string of whichever raw id was INS'd first, in reading
// order, among everything that collapsed onto it (src/core/project.js);
// applying the SAME word-rename map to that label predicts the renamed
// entity's label exactly, which is a precise, collision-free correspondence —
// unlike matching on mention-sentence SETS alone, which collides whenever two
// distinct referents happen to be mentioned only in the same one sentence
// (this fixture has several: "Marion Vance", "Harold Kim" and others are each
// sighted only once, in the same "Present were ..." sentence).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadFixture } from './conformance/harness/fixtures.js';
import { readWithSeed } from './conformance/harness/read.js';
import { typeReferents } from '../src/perceiver/individuation.js';
import { caesarShiftWord, renameFixture, applyRename } from './conformance/harness/rename.js';

const QUANT = (x, d = 4) => Math.round((x || 0) * 10 ** d) / 10 ** d;

// Build the label-predicted bijection between two docs' PROJECTED referents,
// using the SAME word-rename `map` that produced doc2's text from doc1's.
// Returns { pairs: [{id1,id2}], unmatched1: [id], unmatched2: [id] }.
const bijectionByRenamedLabel = (doc1, doc2, map) => {
  const g1 = doc1.projectGraph(), g2 = doc2.projectGraph();
  const label2ToId2 = new Map([...g2.entities].map(([id, e]) => [e.label, id]));
  const pairs = [];
  const unmatched1 = [];
  const usedIds2 = new Set();
  for (const [id1, e1] of g1.entities) {
    const predicted = applyRename(e1.label, map);
    const id2 = label2ToId2.get(predicted);
    if (id2 == null || usedIds2.has(id2)) { unmatched1.push(id1); continue; }
    usedIds2.add(id2);
    pairs.push({ id1, id2 });
  }
  const unmatched2 = [...g2.entities.keys()].filter((id) => !usedIds2.has(id));
  return { pairs, unmatched1, unmatched2 };
};

// ── #15 — Consistent-rename isomorphism ─────────────────────────────

test('Tier4 #15: consistent-rename isomorphism — municipal minutes, every named referent renamed', async () => {
  const f = loadFixture('muni-council-minutes-01');
  const doc = await readWithSeed(f.bytes, {});
  const { renamedText, words, map } = renameFixture(f.text, doc, { shift: 13 });
  assert.ok(words.length >= 8, 'sanity: the fixture should admit at least 8 distinct name words to rename');
  assert.notEqual(renamedText, f.text, 'the rename must actually change the text');

  const renamedDoc = await readWithSeed(renamedText, {});

  // Identical unit boundaries (segmentation reads structural/closed-class words,
  // none of which this rename touches).
  assert.equal(renamedDoc.sentences.length, doc.sentences.length, 'unit count changed under rename');

  const g1 = doc.projectGraph(), g2 = renamedDoc.projectGraph();
  const labelOf = (g, id) => (g.entities.get(id) && g.entities.get(id).label) || id;

  // Identical referent COUNT and a full bijection — no orphan on either side.
  const { pairs, unmatched1, unmatched2 } = bijectionByRenamedLabel(doc, renamedDoc, map);
  assert.equal(unmatched1.length, 0, `referents lost under rename (no positional match in the renamed read): ${unmatched1.map((id) => labelOf(g1, id)).join(', ')}`);
  assert.equal(unmatched2.length, 0, `referents GAINED under rename (no positional match in the original read): ${unmatched2.map((id) => labelOf(g2, id)).join(', ')}`);
  assert.equal(g2.entities.size, g1.entities.size, 'referent count changed under rename');
  assert.equal(pairs.length, g1.entities.size, 'bijection size must equal the referent count');

  // Identical individuation-gate typing, mass, and rho per corresponding node.
  const typed1 = new Map(typeReferents(doc).map((t) => [t.id, t]));
  const typed2 = new Map(typeReferents(renamedDoc).map((t) => [t.id, t]));
  for (const { id1, id2 } of pairs) {
    const t1 = typed1.get(id1), t2 = typed2.get(id2);
    assert.ok(t1 && t2, `both sides must be typed: ${id1} / ${id2}`);
    assert.equal(t2.type, t1.type, `individuation type differs for ${labelOf(g1, id1)}: ${t1.type} -> ${t2.type}`);
    assert.equal(QUANT(t2.mass), QUANT(t1.mass), `mass differs for ${labelOf(g1, id1)}`);
    assert.equal(QUANT(t2.rho), QUANT(t1.rho), `rho (coupling) differs for ${labelOf(g1, id1)}`);
    assert.equal(QUANT(t2.subjShare), QUANT(t1.subjShare), `subjShare differs for ${labelOf(g1, id1)}`);
  }

  // Identical projectGraph edge weights: every edge in the original graph has a
  // corresponding edge (same via, same sentIdx, same coupling/weight) between
  // the bijected endpoints in the renamed graph, and vice versa (same count).
  // `via` is USUALLY a relation verb/preposition untouched by the rename (not a
  // name word), but not always — an apposition/possessor-derived edge can carry
  // a lowercased REFERENT NAME as its via label (e.g. "Planning Commission
  // --marchetti--> letter", via:'marchetti' — the possessor's own name,
  // lowercased), so `via` must be renamed too before comparing, case-
  // insensitively (admitted labels are capitalized; a `via` name is not).
  const idMap = new Map(pairs.map((p) => [p.id1, p.id2]));
  const viaMap = new Map([...map].flatMap(([k, v]) => [[k, v], [k.toLowerCase(), v.toLowerCase()]]));
  const renameVia = (via) => applyRename(String(via ?? ''), viaMap);
  const edgeKey = (from, to, via, sentIdx) => `${from}|${to}|${via}|${sentIdx}`;
  const g2ByKey = new Map(g2.edges.map((e) => [edgeKey(e.from, e.to, e.via, e.sentIdx), e]));
  assert.equal(g2.edges.length, g1.edges.length, 'edge count changed under rename');
  for (const e of g1.edges) {
    const mappedFrom = idMap.get(e.from) ?? e.from;   // an edge endpoint may be a non-referent NP lemma
    const mappedTo = idMap.get(e.to) ?? e.to;
    const mappedVia = renameVia(e.via);
    const match = g2ByKey.get(edgeKey(mappedFrom, mappedTo, mappedVia, e.sentIdx));
    assert.ok(match, `no corresponding edge in the renamed graph for ${e.from}--${e.via}-->${e.to} @${e.sentIdx}`);
    assert.equal(QUANT(match.weight), QUANT(e.weight), `edge weight differs for ${e.from}--${e.via}-->${e.to}`);
    assert.equal(QUANT(match.coupling), QUANT(e.coupling), `edge coupling differs for ${e.from}--${e.via}-->${e.to}`);
  }
});

// ── #16 — Rename under the individuation gate, descriptor channel ─────────
//
// KNOWN GAP, triaged (spec Tier 4 set-down: "every failure triaged to a named
// lexical dependency with a decision recorded"). The descriptor channel that
// seats "his wife"/"his father" as un-named referents does NOT run on document
// statistics the way proper-name admission does. `scanDescriptors`
// (src/perceiver/parse/relations.js) recognizes a role epithet only against
// `conventions.isRole` — a hand-seeded CLOSED vocabulary (sister, mother, wife,
// father, ...), not a company/frequency signal read off the text. Renaming the
// word "wife" to a synthetic token removes it from that seed list, so the
// descriptor channel simply never fires for the renamed word — the referent
// disappears from the cast entirely, rather than surviving with a new name.
// This is a REAL, confirmed lexical dependency the rename isomorphism exists to
// find (unlike proper-name admission, entities.js, which is fully statistical
// and DOES survive the rename — see Tier4 #15). Decision: declare it as a known
// prior, not fix it here — making role/kinship detection statistical instead of
// a seed list is a feature change beyond this suite's scope. Recorded via
// `test.todo` so the gap stays visible in `node --test` output.
test.todo('Tier4 #16: descriptor-channel rename — a never-named kinship epithet ("wife") remains the same gate type, same mass x coupling', async () => {
  const f = loadFixture('literary-frankenstein');
  const doc = await readWithSeed(f.bytes, {});

  const typed = typeReferents(doc);
  const before = typed.find((t) => t.label === 'wife' && t.ins === false);
  assert.ok(before, 'frankenstein.txt must produce an un-INS\'d "wife" descriptor referent');
  assert.equal(before.type, 'emanon', 'sanity: a never-named, recurring, acting epithet is an emanon (individuation.js\'s own definition)');

  const map = new Map([['wife', caesarShiftWord('wife', 13)]]);   // -> "jvsr"
  const renamedText = applyRename(f.text, map);
  assert.notEqual(renamedText, f.text);

  const renamedDoc = await readWithSeed(renamedText, {});
  const typedAfter = typeReferents(renamedDoc);
  const after = typedAfter.find((t) => t.label === map.get('wife') && t.ins === false);
  assert.ok(after, `the renamed descriptor "${map.get('wife')}" must still reach the cast, un-named`);

  assert.equal(after.type, before.type, 'the individuation-gate type must survive the rename');
  assert.equal(QUANT(after.mass), QUANT(before.mass), 'mass must survive the rename');
  assert.equal(QUANT(after.rho), QUANT(before.rho), 'coupling (rho) must survive the rename');
  assert.equal(QUANT(after.salience), QUANT(before.salience), 'the mass x coupling read-off (salience) must survive the rename');

  // A DIFFERENT untouched descriptor ("father") must be equally unaffected —
  // renaming one referent must not perturb another's individuation typing.
  const fatherBefore = typed.find((t) => t.label === 'father' && t.ins === false);
  const fatherAfter = typedAfter.find((t) => t.label === 'father' && t.ins === false);
  if (fatherBefore) {
    assert.ok(fatherAfter, 'the untouched "father" descriptor must still be present');
    assert.equal(fatherAfter.type, fatherBefore.type);
    assert.equal(QUANT(fatherAfter.mass), QUANT(fatherBefore.mass));
  }
});

// ── #17 — Script and orthography independence ───────────────────────

test('Tier4 #17: a different Caesar shift on the referent tokens preserves the same structure', async () => {
  const f = loadFixture('muni-council-minutes-01');
  const doc = await readWithSeed(f.bytes, {});
  const shift5 = renameFixture(f.text, doc, { shift: 5 });
  const shift19 = renameFixture(f.text, doc, { shift: 19 });
  assert.notEqual(shift5.renamedText, shift19.renamedText, 'sanity: the two ciphers actually produce different texts');

  const doc5 = await readWithSeed(shift5.renamedText, {});
  const doc19 = await readWithSeed(shift19.renamedText, {});

  assert.equal(doc5.sentences.length, doc.sentences.length);
  assert.equal(doc19.sentences.length, doc.sentences.length);

  const g0 = doc.projectGraph(), g5 = doc5.projectGraph(), g19 = doc19.projectGraph();
  assert.equal(g5.entities.size, g0.entities.size, 'shift=5: referent count changed');
  assert.equal(g19.entities.size, g0.entities.size, 'shift=19: referent count changed');

  const { unmatched1: un5 } = bijectionByRenamedLabel(doc, doc5, shift5.map);
  const { unmatched1: un19 } = bijectionByRenamedLabel(doc, doc19, shift19.map);
  assert.equal(un5.length, 0, 'shift=5: lost a referent under a different cipher');
  assert.equal(un19.length, 0, 'shift=19: lost a referent under a different cipher');
});

test('Tier4 #17: a hand transliteration of a name into Cyrillic-lookalike letters is still admitted the same way', async () => {
  // A small, hand-built case (not the full fixture — accurate transliteration
  // of a whole document is its own project): the same two-sentence structure,
  // once in plain Latin, once with the character names transliterated into
  // visually similar Cyrillic letters. Admission reads \p{Lu}/\p{L} (any cased
  // script) by construction (entities.js), so this is a direct, low-risk probe
  // of the omnilingual claim without staging a full document.
  const latin = 'Delgado moved to approve the item. Delgado explained the change to Reyes.';
  const cyrillicLookalike = 'Ｄеlgаdо moved to approve the item. Ｄеlgаdо explained the change to Rеуеs.';
  // (The Cyrillic-lookalike string above swaps Latin a/e/o for Cyrillic а/е/о
  // and full-width D — visually near-identical, structurally a different script
  // per \p{Script}, but still \p{Lu}/\p{L} for the capital-scan regex.)
  const docA = await readWithSeed(latin, {});
  const docB = await readWithSeed(cyrillicLookalike, {});
  assert.equal(docA.sentences.length, docB.sentences.length);
  const namesA = [...docA.admission.admitted.keys()];
  const namesB = [...docB.admission.admitted.keys()];
  assert.equal(namesB.length, namesA.length, 'the mixed-script variant must admit the same NUMBER of referents');
});

// ── #18 — Case and honorific variance ─────────────────────────────

test('Tier4 #18a: "Chief Drake" / "Drake" / "the chief" / "DRAKE" collapse to one referent, not four', async () => {
  const text = [
    'Chief Drake addressed the council on Tuesday.',
    'Drake explained the new patrol schedule in detail.',
    'The chief said the schedule would begin next week.',
    'DRAKE thanked the council for its support.',
  ].join(' ');
  const doc = await readWithSeed(text, {});
  // admission.admitted keeps "Chief Drake" and "Drake" under SEPARATE ids (a
  // tail/surname-position alias is committed defeasibly, never unified at
  // admission time — entities.js's head/tail alias split); the collapse is the
  // PROJECTION's job (project.js's union-find over the SYN kind:'merge' event
  // pipeline.js emits for a tail alias) — so the referent COUNT that matters
  // here is the post-projection entity count, not the raw admission id count.
  // "DRAKE" is expected to fold onto "Drake" at admission time itself (canon()
  // folding an ALL-CAPS spelling onto its earlier mixed-case twin), so it adds
  // no separate id at all. "the chief" (bare, a single un-recurring sighting)
  // is not expected to seat its own body — it simply never gets admitted,
  // which trivially does not add a fourth referent either.
  const graph = doc.projectGraph();
  const entityLabels = [...graph.entities.values()].map((e) => e.label);
  assert.equal(graph.entities.size, 1,
    `expected exactly one referent (post-projection) across "Chief Drake"/"Drake"/"DRAKE", got ${graph.entities.size}: ${entityLabels.join(', ')}`);
});

// KNOWN GAP, triaged (spec Tier 4 set-down: "every failure triaged to a named
// lexical dependency with a decision recorded — remove it, or declare it and
// document it as a prior"). entities.js's head-alias containment ("Jefferson"
// ⊂ "Jefferson Avenue" -> same id, admission.aliasOf's `kind:'head'` branch) is
// a genuine, USEFUL prior for a person's given name inside their own full name
// ("Gregor" ⊂ "Gregor Samsa"). It is lexically identical, and therefore
// mechanically indistinguishable at this layer, from a person's bare name
// prefixing an UNRELATED multi-word place name ("Jefferson" the person vs.
// "Jefferson Avenue" the street) — the false-merge case Tier 4 #18 predicts
// ("most implementations fix one by breaking the other"). Confirmed failing
// against the real engine as of this suite; not fixed here (disambiguating
// person-name-containment from place-name-containment needs a signal this
// module does not have — a role/kind judgment, not a string one). Recorded as
// a declared lexical prior, per the spec's own triage instruction, via
// `test.todo` — this keeps the failure visible in `node --test` output without
// failing the corpus-wide gate on a documented, decided limitation.
test.todo('Tier4 #18b: the same string used for a person and a street must not merge purely on string identity', async () => {
  const text = [
    'Jefferson walked to the corner store on Monday.',
    'Jefferson bought a newspaper and a coffee.',
    'The council approved resurfacing for Jefferson Avenue this spring.',
    'Crews will begin work on Jefferson Avenue in June.',
  ].join(' ');
  const doc = await readWithSeed(text, {});
  const personId = doc.admission.idOf('Jefferson');
  const streetId = doc.admission.idOf('Jefferson Avenue');
  assert.ok(personId, 'the bare "Jefferson" (person, acting) must be admitted');
  assert.ok(streetId, '"Jefferson Avenue" (the street) must be admitted');
  assert.notEqual(personId, streetId, 'the person and the street must not merge purely on shared spelling');
});
