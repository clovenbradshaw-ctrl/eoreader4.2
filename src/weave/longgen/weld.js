// EO: EVA·SEG(Field,Link → Lens, Binding,Dissecting) — self-read weld
// The self-read weld — re-read an accepted paragraph back through the grounder
// before it becomes the prior the next paragraph opens on.
//
// The walk's birth gate (bindAndVeto against the beat's slice) is a lexical
// floor: it certifies that a claim's WORDS made contact with the slice. Drift
// that keeps the slice's words while changing what the prose CLAIMS rides
// straight through it — the Step 0 measurement (docs/self-read-weld-measurement.md)
// put the birth gate's catch rate at 0% across every drift mode it modelled.
// The weld is the re-read that measurement licenses: three signals, each cheap,
// synchronous, and model-free, OR'd per sentence.
//
//   number   — a quantity the sentence carries that its slice does not: the
//              paragraph asserts a magnitude the fold never served (+87.5
//              discrimination on number drift).
//   refold   — the sentence makes no citable contact ANYWHERE in the fold, not
//              just its own slice: contamination from outside the situation
//              (+54.2 on cross-document splices).
//   witness  — the sentence stands on no source propositionally: groundSpans'
//              per-span verdict, the same witness gate the render binder reads
//              (+58.3 on cross-document splices, +29.2 on off-fold ones).
//
// What the weld does NOT catch, on the record: a polarity flip (negation) is
// invisible to every read-only organ measured (+1.1 best), and a figure swap is
// caught weakly (+22.5 composite). Those need a polarity-aware relation
// agreement and better claim-edge coverage respectively — organs to extend, not
// thresholds to tune. The weld ships what discriminates today; it does not
// pretend to more.
//
// Grain and action mirror evaSplice: the verdict is per SENTENCE, and the act is
// a strike — drop the drifted sentences, keep the welded rest. All clean →
// accept. Everything struck → reject (the caller holds the beat as a NUL rather
// than fold drift into the document). Striking, never rewriting: the weld has no
// model and writes no prose.

import { bindCitations, groundSpans, contentTerms } from '../../enactor/ground/index.js';
import { segmentSentences } from '../../perceiver/parse/index.js';

// The quantity vocabulary the number signal reads — digits plus the small number
// words prose actually spells out. Deliberately shallow: a magnitude the slice
// never mentions in ANY form is the drift being caught; normalizing "7" to
// "seven" would add recall the measurement did not test.
const NUM_RE = /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)\b/gi;
const numbersIn = (s) => new Set((String(s || '').match(NUM_RE) || []).map(x => x.toLowerCase()));

// Content-term floor for the refold signal — a short connective ("And then it
// was over.") binds nowhere without being contamination. contentTerms is the
// witness gate's own content-word read (ground/spans.js), so the substantiveness
// floor is one rule across both signals.
const MIN_TERMS = 3;

// selfRead(text, { slice, pool, doc }) — the re-read verdict for one accepted
// paragraph.
//
//   slice  the spans the paragraph was written against (the birth gate's own set)
//   pool   the WHOLE fold the walk is drinking from — the "anywhere" the refold
//          signal re-binds against. Defaults to the slice when the caller has no
//          wider fold (a one-slice walk), which degrades refold to the birth
//          gate's reach, never widens it.
//   doc    optional — the reading's own doc; lets the witness signal judge
//          propositionally (coref intact). Absent, the witness degrades to the
//          citation-holds gate against the slice, exactly as groundSpans does.
//
// Returns { action, text, spans, fired } where spans is one verdict per sentence:
// { text, fired, reasons } and text is the welded paragraph (fired sentences
// struck). action: 'accept' (nothing fired) | 'splice' (some struck, rest kept)
// | 'reject' (everything fired — nothing safe to keep).
export const selfRead = (text, { slice = [], pool = null, doc = null } = {}) => {
  const sentences = segmentSentences(String(text || '')).filter(s => s.trim());
  if (!sentences.length) return { action: 'reject', text: '', spans: [], fired: true };

  const foldPool = (pool && pool.length ? pool : slice).map((s, i) => ({ idx: s.idx ?? i, text: s.text }));
  const passages = slice.map((s, i) => ({ u: doc?.docId ?? 'fold', idx: s.idx ?? i, text: s.text }));
  const sliceNums = numbersIn(slice.map(s => s.text).join(' '));

  // One witness verdict per sentence — the same per-span projection the reader
  // hovers, judged against the slice and (when given) the doc's own reading.
  const witnessed = groundSpans(sentences, { passages, doc });

  const spans = sentences.map((sentence, i) => {
    const reasons = [];

    for (const x of numbersIn(sentence)) {
      if (!sliceNums.has(x)) { reasons.push('number'); break; }
    }

    const substantive = contentTerms(sentence).length >= MIN_TERMS;
    if (substantive) {
      const bound = bindCitations(sentence, foldPool);
      if (bound.length && bound.every(b => !b.citation)) reasons.push('refold');
    }

    // The witness strike is DOUBLY gated: the propositional deny (assertion grounded
    // to the void) AND no citable contact with the sentence's own slice. The witness
    // read is parser-coverage-limited on paraphrase — a legitimate rewording the SVO
    // reader cannot see parses to nothing and reads as void — so a sentence the birth
    // gate's own measure certifies against the slice is never struck on witness
    // alone. Spliced contamination has no slice citation to hide behind.
    const w = witnessed[i];
    if (substantive && w && w.kind === 'llm' && w.role === 'assertion') {
      const vsSlice = bindCitations(sentence, passages.map((p, k) => ({ idx: p.idx ?? k, text: p.text })));
      if (vsSlice.length && vsSlice.every(b => !b.citation)) reasons.push('witness');
    }

    return { text: sentence, fired: reasons.length > 0, reasons };
  });

  const kept = spans.filter(s => !s.fired).map(s => s.text);
  const fired = spans.some(s => s.fired);
  const action = !fired ? 'accept' : (kept.length ? 'splice' : 'reject');
  return { action, text: kept.join(' '), spans, fired };
};
