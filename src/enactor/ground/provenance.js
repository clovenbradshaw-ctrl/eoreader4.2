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

import { parseText } from '../../perceiver/parse/index.js';

// the propositions of a text — subject–relation–object bonds, figures as lowercased labels.
const propsOf = (text) => {
  const doc = parseText(String(text || ''), { docId: 'prov' });
  const events = doc.log.snapshot();
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label).toLowerCase());
  const L = (id) => label.get(id) ?? String(id).toLowerCase();
  const props = [];
  for (const e of events) {
    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null) {
      props.push({ subj: L(e.src), via: String(e.via).toLowerCase(), obj: e.tgt != null ? L(e.tgt) : null });
    }
  }
  return props;
};

// namedFigures(text) — every entity the tiny parser names in `text`, lowercased, independent
// of whether it ever anchors a full subject–relation–object triple. A short claim ("Armstrong
// joined the faculty at Purdue.") often fails to parse into a clean CON/SIG relation at all —
// propsOf(text) then returns [], and a caller that only reads propositions has no figure to
// check the contrastive guard against. Entity recognition (the INS events) is a much lower bar
// than relation extraction, so this stays populated far more often — exactly what groundSpans
// needs to ask "does this claim name a figure THIS passage marks as rejected?" without first
// requiring the claim's own relation to have parsed.
export const namedFigures = (text) => {
  const doc = parseText(String(text || ''), { docId: 'prov' });
  const labels = new Set();
  for (const e of doc.log.snapshot()) if (e.op === 'INS' && e.label) labels.add(String(e.label).toLowerCase());
  return labels;
};

// ── the contrastive-construction guard ───────────────────────────────────────────────────
// propsOf links a subject to EVERY noun phrase its clause names, with no notion that a
// comparison construction REJECTS the second one: "Armstrong chose Cincinnati over Purdue"
// and "Armstrong chose Purdue over Cincinnati" parse to the identical pair of relations
// (armstrong-chose-cincinnati, armstrong-chose-purdue) — the grammar has no way to represent
// exclusion, so a claim about EITHER side comes out equally "witnessed." That is exactly the
// shape that let a fold summary say Armstrong joined Purdue's aerospace department, when the
// source named Cincinnati and Purdue only as the school he passed over.
//
// This is a narrow, TEXT-level patch, not a parser fix — the grammar still can't represent
// exclusion — so it only ever SUBTRACTS a credit the naive figure-pair match would otherwise
// give (a real relation to the winning side is untouched), never adds one. Deliberately small:
// a closed set of preference verbs anchors "over" (a wildly overloaded preposition elsewhere —
// "over the weekend," "handed over"), and "rather than" / "instead of" are unambiguous alone.
// Anything outside this shape rides exactly as it did before.
//
// The rejected side's capture STOPS at the next clause boundary (comma, sentence end, or a
// subordinating/coordinating conjunction) — not a fixed character run — because the winning
// side routinely reappears a few words later to explain the choice ("chose Cincinnati over
// Purdue because Cincinnati had..."); a wide, boundary-blind window would catch that second,
// unrelated mention and wrongly mark the WINNER a loser too.
const PREFERENCE_VERB = '(?:chose|chosen|choosing|picked|picking|preferred|preferring|selected|selecting|favou?red|favou?ring|opted)';
const CLAUSE_STOP = '(?:[,.?!]|\\b(?:because|since|for|and|but|which|who|that|as|so|while|although)\\b|$)';
const CONTRAST_RE = new RegExp(`\\b(?:${PREFERENCE_VERB}\\b[^.?!]{0,60}?\\bover\\b|rather than\\b|instead of\\b)([^.?!,]{0,40}?)(?=${CLAUSE_STOP})`, 'gi');

// Does `sentence` name `label` on the REJECTED side of a comparison? Pure text scan, no doc
// needed — the same sentence a proposition's own subj/obj was read from. Exported so groundSpans
// (spans.js) can run the SAME check directly against a matched passage — its lexical-overlap
// shortcut (CITE_VERBATIM) does not go through propsOf(claim) at all, so it needs its own way
// to ask "does the passage that matched reject the figure this claim is actually naming?"
export const isContrastiveLoser = (sentence, label) => {
  if (!label) return false;
  const text = String(sentence || '');
  CONTRAST_RE.lastIndex = 0;
  let m;
  while ((m = CONTRAST_RE.exec(text)) !== null) if (m[1].toLowerCase().includes(label)) return true;
  return false;
};

// the document's own propositions, read off its graph (full cross-sentence coref intact),
// optionally restricted to the sentences actually read. This is the right ground truth for a
// doc-grounded answer — re-parsing spans in isolation loses the coref the graph already has.
// Each proposition carries `__text` — the sentence it was read from — so a caller can run the
// contrastive guard against exactly the clause that produced it, not the whole document.
const docPropositions = (doc, spanIdxs = null) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label).toLowerCase());
  const L = (id) => label.get(id) ?? String(id).toLowerCase();
  const allow = spanIdxs ? new Set(spanIdxs) : null;
  const units = doc?.units || doc?.sentences || [];
  const props = [];
  for (const e of events) {
    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null && (!allow || allow.has(e.sentIdx))) {
      // the door the proposition was constituted through: exafference (the world, witnessed) or
      // reafference (the model's interpretation — an EOT note, which cannot witness). Prose
      // events carry no door → exafference (the text WAS the world read), so prose is unchanged.
      const door = e.door ?? e.prov?.door ?? 'perceiver';
      const text = e.sentIdx != null ? String(units[e.sentIdx] ?? '') : '';
      props.push({ subj: L(e.src), via: String(e.via).toLowerCase(), obj: e.tgt != null ? L(e.tgt) : null, door, __text: text });
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
  const spanLC = spans.map((s) => String(s).toLowerCase());   // for the verbatim substring check only
  const docPropsRaw = fromDoc ? docPropositions(source.doc, source.spanIdxs)
    : spans.flatMap((s) => propsOf(s).map((p) => ({ ...p, __text: s })));
  // The contrastive guard (above): a proposition whose OWN sentence marks its subject or
  // object as the rejected side of a comparison never credits grounding — see CONTRAST_RE.
  const docProps = docPropsRaw.filter((p) => !isContrastiveLoser(p.__text, p.subj) && !isContrastiveLoser(p.__text, p.obj));
  // GROUNDED requires the same RELATION between the same FIGURES, not merely the same figures:
  // "Gregor married Grete" is fabricated even though the doc relates Gregor and Grete, because
  // it relates them by other verbs — the meaning of a proposition is its relation, not just
  // who it is about. Figures are order-insensitive (a passive/role-swapped rewording still
  // grounds: "Ben was trusted by Anna" ↔ "Anna trusted Ben"); the relation must match.
  const relKey = (p) => `${[p.subj, p.obj || ''].sort().join('~')}|${p.via}`;
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
    const inSpan = spanLC.some((s, i) => {
      if (!(s.includes(p.subj) && s.includes(p.via) && (!p.obj || s.includes(p.obj)))) return false;
      // The same guard as docProps above, applied to the literal span: sharing every word of a
      // clause is not a lift when that clause's own comparison rejects the figure named.
      return !isContrastiveLoser(spans[i], p.subj) && !(p.obj && isContrastiveLoser(spans[i], p.obj));
    });
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
