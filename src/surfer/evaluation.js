// EO: EVA·SIG(Field,Atmosphere → Lens, Tracing,Binding) — the modeler — narrator evaluation
// Attributed evaluation — the MODELER, not the evaluator. Faculty #2 of the three that
// the EVA label was carrying.
//
//   #1 EVA-as-merge        identity bookkeeping (who-refers-to-what). Stays in the parser.
//   #2 the MODELER (here)  reads OTHER MINDS' evaluations into the theory-of-mind graph.
//                          Authorial judgment is just the narrator's node — one mind among
//                          the many in the book. σ-side: document-intrinsic, query-invariant,
//                          re-derivable, encoded once. Every locus is OWNED by a mind.
//   #3 the EVALUATOR       the machine's OWN opinion — the act performed OVER the graph at
//                          read-time, ρ-relative. Never a node anyone owns. It is the veto
//                          guard's sibling: the guard is the endorsement layer on the TRUTH
//                          axis ("the text says X" ≠ "X"); the evaluator is the same organ on
//                          the RHETORIC axis ("is this irony earned by argument or installed
//                          by montage"). It lives elsewhere, read-time, and is NOT this file.
//
// Two failure modes this module is built to refuse:
//   LAUNDERING (ρ→σ): encoding the machine's opinion as a document fact. This module never
//     emits the machine's stance — only attributed stances owned by a mind in the text.
//   CAPTURE (σ→ρ unmarked): reading "narrator holds Napoleon is deluded" off as "Napoleon is
//     deluded". Great prose — free indirect discourse above all — is engineered to force this.
//     So every locus carries an OWNER, and where the grammar is the narrator's but the
//     valuation may be the character's (FID), the owner is marked AMBIGUOUS, never forced. A
//     reader that collapses the owner gets colonized by whatever it reads; the owner field is
//     the firewall that gives the machine a stable self across texts.
//
// What it detects is the narrator's evaluative OPERATION — readable from structure, not from
// evaluative predicates (which Tolstoy almost never uses). Two carriers survive the cheap
// falsification on War and Peace (a third, intra-sentence concession, fired 0× on the opera —
// the strongest irony is cross-paragraph montage with no connective — so it is dropped):
//
//   FRAMING (carrier 2)  a SIG/attribution to a source the narrator habitually undercuts
//     (historians, posterity, generals, official dispatch). Named honestly as a source-list
//     heuristic with a known ceiling — it pattern-matches the attributed-to, it does not
//     detect the undercut, so it misses novel framings and would over-fire on a neutral
//     citation. The narrator's framing voice, owner = narrator.
//   DEFAMILIARIZATION (carrier 3)  an ELEVATED-pretense frame (spectacle, ceremony, glory,
//     rank) rendered in flat CONCRETE register (high npShare). TOPIC-CONDITIONAL by
//     construction: the product needs both the elevated frame AND the deflating register, so
//     it fires on the opera (spectacle × concrete = high) and stays dark on the artillery
//     digression (concrete but no pretense to deflate — the false positive a GLOBAL register
//     prior could not reject). The narrator's deflating gaze, owner = narrator unless FID
//     hands the gaze to a character, when the owner is ambiguous.

import { encodeLevels } from './levels.js';

// The σ-side narratorial mind — one node among the book's minds, never the machine.
export const NARRATOR = 'mind:narrator';

// Carrier 2 — the sources the narrator habitually frames-then-undercuts. A heuristic list
// (its ceiling: it misses novel framings, neutral citations slip through). Matched in text.
const UNDERCUT_SOURCE = [
  'historian', 'historians', 'posterity', 'biographer', 'biographers', 'memoirs',
  'the dispatch', 'dispatches', 'bulletin', 'bulletins', 'official', 'authorities',
  'they say', 'it is said', 'it was said', 'we are told', 'tell us', 'told us',
  'so-called', 'supposed', 'supposedly', 'is said to', 'are said to', 'reputed',
  'science', 'the learned', 'great men', 'the generals', 'military science',
];

// Carrier 3 — the frames that carry social pretense, the ones the narrator deflates. NOT
// generic topics (battle, hunt carry no pretense to expose); the frames whose EXPECTED
// register is elevated, so a concrete rendering reads as withheld frame. General, not the
// opera scene's own words ("cardboard"), so it is not overfit to the validation positives.
const ELEVATED_FRAME = [
  'opera', 'theatre', 'theater', 'stage', 'ballet', 'actress', 'actor', 'orchestra',
  'aria', 'performance', 'audience', 'spectacle', 'spectators', 'box', 'curtain', 'applause',
  'parade', 'review', 'ceremony', 'coronation', 'procession', 'te deum', 'liturgy', 'throne',
  'majesty', 'imperial', 'court', 'ball', 'salon', 'gala', 'banquet', 'reception',
  'glory', 'honor', 'honour', 'standard', 'banner', 'medal', 'cross', 'eagle', 'laurels',
];

// Free-indirect markers — where the grammar is the narrator's but the valuation may be the
// character's. Their presence makes a locus's owner AMBIGUOUS, not narrator. The seam that
// preserves divergence: dramatic irony is the gap between the character's self-attribution
// and the narrator's attribution over it, and forcing one owner erases the irony.
const FID_MARKER = [
  'it seemed', 'seemed to', 'as if', 'as though', 'evidently', 'no doubt', 'of course',
  'surely', 'must have', 'felt that', 'thought that', 'fancied', 'imagined', 'it appeared',
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const countHits = (text, terms) => { let n = 0; for (const t of terms) { let i = 0; while ((i = text.indexOf(t, i)) !== -1) { n++; i += t.length; } } return n; };
const zscores = (xs) => {
  const n = xs.length || 1;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return xs.map((x) => (x - mean) / sd);
};

// attributedEvaluation — the modeler. Over the coarse spine (encodeLevels, or one supplied),
// it reads the narrator's evaluative operation per unit and ATTRIBUTES it: a framing density
// and a defamiliarization signal, each a stance OWNED by the narrator (or ambiguous under
// FID), never the machine's. The combined `score` is a z-blend, so a unit is evaluative
// RELATIVE TO THIS DOCUMENT's own distribution — most units sit near zero, the evaluative
// ones spike. Returned as attributed loci the theory-of-mind graph consumes; nothing here is
// the machine's endorsement (that is the read-time evaluator, the veto guard's sibling).
export const attributedEvaluation = (doc, encoding = null) => {
  const enc = encoding || encodeLevels(doc);
  const segs = enc.segments || [];
  const raw = segs.map((seg) => {
    const text = seg.text || '';                          // already lowercased+deaccented by the encoder
    const n = Math.max(1, seg.sentences || 1);
    const framing = countHits(text, UNDERCUT_SOURCE) / n;
    const elevation = countHits(text, ELEVATED_FRAME) / n;
    const defam = elevation * (seg.npShare ?? 0);          // topic-conditional register-surprise
    const fid = countHits(text, FID_MARKER) / n;
    return { seg, framing, elevation, defam, fid };
  });
  const zF = zscores(raw.map((r) => r.framing));
  const zD = zscores(raw.map((r) => r.defam));
  const segments = raw.map((r, i) => {
    // The owner: the narrator's framing/deflating voice — UNLESS this unit is dense with
    // free-indirect markers, when the valuation may be a character's and the owner is left
    // ambiguous (divergence preserved, capture refused).
    const owner = r.fid >= 0.15 ? 'ambiguous' : NARRATOR;
    const score = Math.round((zF[i] + zD[i]) * 100) / 100;
    return Object.freeze({
      idx: r.seg.idx, lo: r.seg.lo, hi: r.seg.hi, title: r.seg.title,
      owner,                                  // the firewall field — who holds this stance
      framing: Math.round(r.framing * 1000) / 1000,
      defamiliarization: Math.round(r.defam * 1000) / 1000,
      fidShare: Math.round(r.fid * 1000) / 1000,
      score,
      // The carrier that fired, for the audit — what KIND of evaluative operation this is.
      carrier: r.defam > 0 && zD[i] >= zF[i] ? 'defamiliarization'
             : r.framing > 0 ? 'framing' : null,
    });
  });
  return Object.freeze({
    owner: NARRATOR,                          // the default mind these stances attribute to
    note: 'attributed (σ): the narrator\'s evaluative operation, not the machine\'s endorsement',
    segments,
    ranked: [...segments].filter((s) => s.score > 0).sort((a, b) => b.score - a.score),
  });
};
