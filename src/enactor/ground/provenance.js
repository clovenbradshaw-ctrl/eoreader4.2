// EO: EVA(Link,Network → Lens, Binding,Tracing) — per-proposition provenance (classifyProvenance)
// Per-proposition grounding provenance — veto on MEANING, not raw spans.
//
// A response is not one thing to accept or refuse whole. It is a sequence of PROPOSITIONS,
// and each can stand in a different relation to what was read:
//
//   VERBATIM    the proposition is lifted from a read span — the perceiver's own words.
//   GROUNDED    the proposition CORRESPONDS to a document proposition: the same figures
//               stand in the same relation. The meaning is witnessed, even if the wording
//               is the writer's own. (This is the test that matters — propositional
//               correspondence, NOT lexical span overlap. The audit's salad "Saving the
//               Appearances answer question" shares words with the title span yet asserts
//               no proposition the document holds, so it must NOT count as grounded.)
//   FABRICATED  the proposition corresponds to nothing read — pure enactor, no witness.
//
// EVERYTHING IS GROUNDED — even the fabricated. A proposition that nothing read witnesses is
// not free-floating: it stands on the model's own training data, and we name that ground the
// VOID. The void is a real ground — the ground of last resort — distinct from the source
// grounds (span/document) exactly because nothing outside the model witnesses it. So each
// proposition carries a `ground`: 'span' (verbatim), 'source' (grounded to the document), or
// 'void' (grounded only to the model's training). "Fabricated" is the OLD name for the same
// thing; it is retained for compatibility, but the honest reading is "grounded to the void."
// The point of naming the void is that the surface can RAISE it — say plainly "this rests on
// the model's training, nothing read" — instead of pretending an unwitnessed claim came from
// the page. A veto still acts per proposition — flag the void-grounded, let the witnessed
// ride — but it flags a KNOWN ground, not an absence.
//
// This is the provenance line (core/provenance) read at proposition grain: verbatim and
// grounded carry a PERCEIVER witness (they can anchor); void is ENACTOR-only (mine,
// grounded to training, unwitnessed by anything read). Embedder-free: figures match by
// label, relations by operator/verb; verbatim is the one place a literal span check is
// correct, because verbatim IS about the surface.

import { parseText, nameTokens, isSubsequence } from '../../perceiver/parse/index.js';

// Same figure, possibly under a shorter name — "Atlas" ⊑ "Project Atlas" (name-variants.js's
// token-subsequence containment, the SAME rule the within-document alias folds on), not naive
// substring: "purdue" and "cincinnati" share no tokens, so a role-swapped comparative claim
// still fails this, while a claim keying on a document's own shortened reference still passes.
const sameFigure = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const ta = nameTokens(a), tb = nameTokens(b);
  return isSubsequence(ta, tb) || isSubsequence(tb, ta);
};

// the propositions of a text — subject–relation–object bonds, figures as lowercased labels.
// `neg` carries the parser's polarity channel: a comparative/exclusion reading ("chose A over
// B") bonds the rejected figure with polarity '−' (relations.js), so "B" here means "NOT B",
// not a second, equally-asserted object — the distinction the OLD shape (no neg field) erased,
// making "chose A over B" and "chose B over A" produce the identical prop set.
const propsOf = (text) => {
  const doc = parseText(String(text || ''), { docId: 'prov' });
  const events = doc.log.snapshot();
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label).toLowerCase());
  const L = (id) => label.get(id) ?? String(id).toLowerCase();
  const props = [];
  for (const e of events) {
    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null) {
      props.push({ subj: L(e.src), via: String(e.via).toLowerCase(), obj: e.tgt != null ? L(e.tgt) : null, neg: e.polarity === '−' });
    }
  }
  return props;
};

// the document's own propositions, read off its graph (full cross-sentence coref intact),
// optionally restricted to the sentences actually read. This is the right ground truth for a
// doc-grounded answer — re-parsing spans in isolation loses the coref the graph already has.
const docPropositions = (doc, spanIdxs = null) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label).toLowerCase());
  const L = (id) => label.get(id) ?? String(id).toLowerCase();
  const allow = spanIdxs ? new Set(spanIdxs) : null;
  const props = [];
  for (const e of events) {
    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null && (!allow || allow.has(e.sentIdx))) {
      // the door the proposition was constituted through: exafference (the world, witnessed) or
      // reafference (the model's interpretation — an EOT note, which cannot witness). Prose
      // events carry no door → exafference (the text WAS the world read), so prose is unchanged.
      const door = e.door ?? e.prov?.door ?? 'perceiver';
      props.push({ subj: L(e.src), via: String(e.via).toLowerCase(), obj: e.tgt != null ? L(e.tgt) : null, door, neg: e.polarity === '−' });
    }
  }
  return props;
};

// classifyProvenance(answer, source) → one verdict per proposition of the answer.
//   source   a string[] of read spans (re-parsed), OR { doc, spanIdxs?, spans? } to judge
//            against the document's OWN graph (coref intact) — the correct ground truth for
//            an answer generated from a doc.
//   verbatim   the answer clause appears (subj, relation, object together) in a read span.
//   grounded   the same two figures stand in a relation among the source propositions.
//   fabricated neither — asserts a proposition nothing read supports.
export const classifyProvenance = (answer, source = []) => {
  const fromDoc = source && !Array.isArray(source) && source.doc;
  const spans = Array.isArray(source) ? source : (source.spans || source.doc?.sentences || []);
  // Each span's OWN structural reading — the verbatim ground truth. Re-parsed independently
  // (not read off docProps/the doc graph) because verbatim is specifically about what THIS one
  // span's surface supports, the same scope the old substring check ran over — just read as a
  // proposition instead of a bag of words.
  const spanProps = spans.map((sp) => propsOf(String(sp)));
  const docProps = fromDoc ? docPropositions(source.doc, source.spanIdxs) : spans.flatMap(propsOf);
  // GROUNDED requires the same RELATION between the same FIGURES, not merely the same figures:
  // "Gregor married Grete" is fabricated even though the doc relates Gregor and Grete, because
  // it relates them by other verbs — the meaning of a proposition is its relation, not just
  // who it is about. Figures are order-insensitive (a passive/role-swapped rewording still
  // grounds: "Ben was trusted by Anna" ↔ "Anna trusted Ben"); the relation must match — and, so
  // a comparative's rejected figure ("chose A over B") never grounds a claim asserting it was
  // chosen, the polarity must match too: a proposition and its negation are different relations,
  // not the same relation twice.
  const relKey = (p) => `${[p.subj, p.obj || ''].sort().join('~')}|${p.via}|${p.neg ? 'neg' : 'pos'}`;
  const docRel = new Set(docProps.map(relKey));
  // the relations the WORLD witnesses — grounded by at least one exafferent (perceiver) doc
  // event. A relation present only through reafference (the model's EOT notes) is grounded but
  // NOT witnessed: it is the engine's interpretation, defeasible, not the asserted ground.
  const witnessedRel = new Set(docProps.filter((p) => p.door !== 'enactor').map(relKey));
  // SEEK THE WITNESS: when a separate exafferent SOURCE is supplied (source.witness — the text
  // the notes were read from), a claim grounded only in the notes is checked against it. If the
  // source attests the same relation, the interpretation is CONFIRMED — it becomes witnessed,
  // grounded to the source, not just the engine's reading. This is the engine actively seeking
  // the witness for what it had only conjectured (active inference for grounding).
  const witnessDoc = fromDoc ? source.witness : null;
  if (witnessDoc) for (const p of docPropositions(witnessDoc)) if (p.door !== 'enactor') witnessedRel.add(relKey(p));

  // are the "spans" the WORLD, or the model's own notes? Prose sentences (and string spans) are
  // exafference; an EOT doc's "sentences" are its note-lines — reafference — so a verbatim match
  // against THEM is still interpretation, not a witnessed lift.
  const spansAreWorld = !(fromDoc && source.doc?.eot);

  const out = propsOf(answer).map((p) => {
    // VERBATIM is a per-span STRUCTURAL match — the same subject, relation, object, AND
    // polarity, read off one span in isolation — not "do these three words all occur somewhere
    // in the span" (the old substring test): that reads "chose Purdue" as verbatim against a
    // span reading "chose Cincinnati over Purdue" (every token present, wrong clause), and would
    // do the same for any role-swap ("the janitor fired the CEO" against "the CEO fired the
    // janitor" — same three words, opposite relation). Requiring the actual parsed tuple closes
    // both: a claim only reads verbatim off a span that independently parses to it.
    const inSpan = spanProps.some((props) => props.some((q) =>
      sameFigure(q.subj, p.subj) && q.via === p.via &&
      (p.obj == null ? q.obj == null : sameFigure(q.obj, p.obj)) &&
      !!q.neg === !!p.neg));
    const grounded = docRel.has(relKey(p));
    const grounding = inSpan ? 'verbatim' : grounded ? 'grounded' : 'fabricated';
    // the GROUND each proposition stands on — nothing is groundless: a lifted claim stands on
    // its span, a corresponding claim on the document source, and a claim nothing read
    // witnesses stands on the VOID (the model's own training). 'void' IS the honest ground of
    // the fabricated case; the surface names it rather than calling it an absence.
    const ground = inSpan ? 'span' : grounded ? 'source' : 'void';
    // the WITNESS dimension, orthogonal to grounding: a claim lifted from / grounded by the
    // WORLD is witnessed (exafference); a claim present only through the model's notes is
    // reafference — interpretation; a claim grounded to the void is witnessed by nothing read
    // — its witness IS the void (the training). `interpretation` flags exactly the reafference
    // case: in the reading, but not witnessed by anything outside the engine's own reading.
    const witness = grounding === 'fabricated' ? 'void'
      : ((inSpan && spansAreWorld) || witnessedRel.has(relKey(p))) ? 'exafference' : 'reafference';
    return Object.freeze({ ...p, grounding, ground, witnessed: grounding !== 'fabricated', witness, interpretation: witness === 'reafference' });
  });

  const summary = { verbatim: 0, grounded: 0, fabricated: 0, void: 0, interpretation: 0 };
  for (const o of out) { summary[o.grounding] += 1; if (o.ground === 'void') summary.void += 1; if (o.interpretation) summary.interpretation += 1; }
  return Object.freeze({
    propositions: out, summary,
    anyWitnessed: out.some((o) => o.witness === 'exafference'),
    allFabricated: out.length > 0 && out.every((o) => !o.witnessed),
    // every proposition rests only on the void — the model's training, nothing read witnesses any of it.
    allVoid: out.length > 0 && out.every((o) => o.ground === 'void'),
    // every grounded claim rests only on the model's interpretation — nothing the world witnesses.
    onlyInterpretation: out.length > 0 && out.some((o) => o.witnessed) && !out.some((o) => o.witness === 'exafference'),
  });
};
