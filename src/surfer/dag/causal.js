// EO: SEG·CON(Field → Link, Dissecting,Binding) — causal-clause reader / witness
// The causal-clause reader — the witness layer under the asserted DAG.
//
// A causal edge in the DESCRIBED content does not live in the narrative entity graph
// (that graph is tuned for who-did-what-to-whom SVO); it lives in the causal-marker
// clauses a source writes: "the library reduced crime", "X is associated with Y",
// "through informal surveillance, X lowers Y", "the program had no effect on Y". This
// reader scans a doc's own sentences for exactly those clauses and emits a CLAIM per
// sighting — never a fact, always a claim traced to the passage that made it (claim-src).
//
// THREE COLLAPSES, THREE GUARDRAILS. The honest chain has three links, and each is a
// collapse the architecture exists to prevent:
//   1. the world              — a causal effect is a counterfactual; it is NOT in any text.
//   2. what the source claims  — traced to the passage (claim-src): never "X causes Y",
//                                only "this passage claims X causes Y".
//   3. what the READER reads    — and this is the third guardrail the user named: the edge
//      the source claims       is not even a fact about the SOURCE. It is the reader's
//                                READING of the passage — what eoreader takes the source to
//                                mean — and the reader can misread. So every claim is rooted
//      at the reader (the INSTRUMENT, core/holder.js), carries a `readerConfidence` (how
//      surely it read the construction, NOT how true it is — relations.js §4), and is
//      `reading: true`, defeasible. There is no field that says "the source means X"; there
//      is only "the reader reads this passage as proposing X." Witness-does-not-decide, all
//      the way down: the reading is the floor, the claim is above it, the world is out of reach.
//
// WITNESS-FIRST, and conservative: it fires ONLY on a recognized causal/association
// marker (stance.js). A sentence with no such marker proposes no causal edge and is
// passed over — the map it builds is a FLOOR on the causal structure the corpus states,
// never a ceiling, and it invents no edge no source wrote.
//
// The claim is the unit. Each carries: the cause and effect NODES (head-noun keys, so
// "the library"/"libraries"/"a new library" converge), the construct QUALIFIERS the
// source attached to each (so "reported crime" vs "actual crime" can be told apart), the
// proposed STANCE (accidental/essential/generative — stance.js, never upgraded), the
// polarity (− = a measured null), the modality (hedged or not), the readerConfidence, and
// the SRC: docId, sentence index, char span, and the verbatim text. Nothing floats free.

import { proposeStance, readPolarity, readModality, ESSENTIAL_VERBS, ASSOCIATION_VERBS } from './stance.js';

// Determiners / possessives stripped from an NP's front when finding its head + qualifiers.
const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'their', 'his', 'her',
  'our', 'your', 'my', 'some', 'any', 'no', 'each', 'every', 'another', 'such', 'more',
  'most', 'less', 'much', 'many', 'few', 'all', 'both', 'one',
]);
// Tokens that cannot be an NP head or a meaningful qualifier — closed-class noise.
const STOP = new Set([
  ...DETERMINERS,
  'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'for', 'as', 'than', 'about',
  'and', 'but', 'or', 'nor', 'so', 'if', 'when', 'while', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'it', 'they', 'he', 'she', 'we', 'you', 'i', 'them', 'him',
  'her', 'us', 'me', 'which', 'who', 'whom', 'whose', 'what', 'there', 'here',
  // adverbs/connectives that sit between a subject and its verb but name no referent —
  // skipped in head selection so "civic investment ALSO reduced crime" heads on investment.
  'also', 'then', 'now', 'thus', 'therefore', 'still', 'again', 'only', 'even', 'just',
  'actually', 'indeed', 'however', 'moreover', 'meanwhile', 'often', 'always', 'never',
  'sometimes', 'usually', 'generally', 'typically', 'largely', 'mostly', 'nonetheless',
]);
// Modifiers that name a MEASUREMENT CONSTRUCT — kept as qualifiers because a disagreement
// among them on the same head noun is the construct-validity fault (crime.js): "reported"
// vs "actual", "self-reported" vs "official". Direction words (higher/lower) are captured
// separately as the effect sign, not as construct qualifiers.
const DIRECTION = new Set(['higher', 'lower', 'more', 'less', 'greater', 'fewer', 'increased', 'decreased', 'reduced', 'raised']);

// Reporting / speech verbs — "the council CLAIMED", "critics ARGUED", "the study FOUND".
// A node is a noun, never a verb, so these (and the causal/association verbs) are rejected as
// heads: when NP extraction lands on one it has mistaken a clause verb for a noun.
const REPORTING = new Set([
  'argued', 'argue', 'argues', 'claimed', 'claim', 'claims', 'said', 'says', 'say',
  'found', 'find', 'finds', 'showed', 'show', 'shows', 'suggested', 'suggest', 'suggests',
  'concluded', 'conclude', 'concludes', 'noted', 'note', 'notes', 'stated', 'state', 'states',
  'thought', 'think', 'thinks', 'believed', 'believe', 'believes', 'contended', 'reported',
  'commissioned', 'gathered', 'opened', 'mattered', 'told', 'tells', 'tell', 'wrote',
  'fell', 'rose', 'ran', 'grew', 'came', 'went', 'did', 'was', 'were', 'is', 'are',
]);
const REPORTING_RE = /\b(?:argued|claimed|said|found|showed|suggested|concluded|noted|stated|thought|believed|contended|reported|wrote)\b/i;

// A causal-verb token right after one of these is an adjective/noun-modifier, not a verb.
const PRE_NOUN = new Set([
  'with', 'of', 'to', 'in', 'on', 'at', 'from', 'by', 'for', 'as', 'than', 'about',
  'the', 'a', 'an', 'and', 'or', 'no', 'any', 'this', 'that', 'these', 'those',
  'more', 'less', 'much', 'very', 'so', 'too', 'its', 'their', 'his', 'her', 'our',
]);
const singular = (w) => {
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';       // libraries → library
  if (/(ss|ch|sh|x)es$/.test(w)) return w.slice(0, -2);                   // boxes → box
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);      // crimes → crime
  return w;
};
const words = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z-]*/g) || []);

// Tokens that END a noun phrase — a preposition or a coordinator. The object NP is the
// IMMEDIATE run after the verb, bounded here, so "crime in the neighborhood" heads on
// `crime`, not `neighborhood` (the prepositional tail is a separate phrase).
const NP_BREAK = new Set([
  'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'for', 'as', 'than', 'about',
  'into', 'onto', 'upon', 'over', 'under', 'across', 'through', 'and', 'but', 'or',
  'nor', 'so', 'because', 'that', 'which', 'who', 'when', 'while', 'if', 'unless',
]);

// Auxiliaries / copulas that mark the end of a subject NP and the start of its predicate.
const AUX = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'might', 'must', 'should']);
const looksVerb = (w, i) => i >= 1 && (AUX.has(w) || (/(?:ed|ing)$/.test(w) && w.length > 3) || ESSENTIAL_VERBS.has(w) || ASSOCIATION_VERBS.has(w));

// Reduce a noun phrase to its NODE key (the head noun, singularized) plus the display
// label, the construct qualifiers, and the effect-direction sign. `side` says which NP to
// take:
//   'lead'    the phrase's leading NP (a post-verb object), head = last content token.
//   'trail'   its trailing NP (a pre-verb subject), head = last content token.
//   'subject' the SUBJECT of a full clause ("the library opened", "crime fell") — the NP
//             before the clause's own verb, so the verb is not mistaken for the head.
// Each bounds the NP at a prepositional break so a trailing phrase never steals the head.
// Returns null if there is no content head.
const readNP = (phrase, side = 'lead') => {
  const all = words(phrase).filter((w) => w.length > 1);
  if (!all.length) return null;
  // Cut the run to a single NP.
  let run;
  if (side === 'subject') {
    // leading tokens up to the clause verb (or a prepositional break); if no verb is found,
    // fall back to the first content noun (an intransitive irregular like "fell").
    const lead = [];
    for (const t of all) { if (lead.length && NP_BREAK.has(t)) break; lead.push(t); }
    let vb = -1;
    for (let i = 0; i < lead.length; i++) if (looksVerb(lead[i], i)) { vb = i; break; }
    if (vb >= 1) run = lead.slice(0, vb);
    else if (lead.length >= 2) run = lead.slice(0, -1);   // no aux/-ed verb found → the trailing
                                                          // token is the intransitive verb ("crime FELL",
                                                          // "foot traffic ROSE"); the head is before it.
    else { const first = lead.find((t) => !STOP.has(t)); return first ? finishNP([first], phrase) : null; }
  } else if (side === 'lead') {
    run = [];
    for (const t of all) { if (run.length && NP_BREAK.has(t)) break; run.push(t); }
  } else {
    run = [];
    for (let j = all.length - 1; j >= 0; j--) { if (run.length && NP_BREAK.has(all[j])) break; run.unshift(all[j]); }
  }
  return finishNP(run, phrase);
};

// Head selection + qualifier/sign read, shared by all NP sides.
const finishNP = (run, phrase) => {
  // Head = the last content (non-stop) token in the run.
  let hi = run.length - 1;
  while (hi >= 0 && STOP.has(run[hi])) hi--;
  if (hi < 0) return null;
  const head = singular(run[hi]);
  if (head.length < 2 || STOP.has(head)) return null;
  // A node is a noun, never a verb: reject a head that is a causal, association, or reporting
  // verb (NP extraction mistook a clause verb for a noun — "argued", "found", "drove").
  if (ESSENTIAL_VERBS.has(head) || ASSOCIATION_VERBS.has(head) || REPORTING.has(head)) return null;
  const pre = run.slice(0, hi).filter((w) => !STOP.has(w));
  const qualifiers = pre.filter((w) => !DIRECTION.has(w));
  const sign = pre.some((w) => ['higher', 'more', 'greater', 'increased', 'raised'].includes(w)) ? '+'
    : pre.some((w) => ['lower', 'less', 'fewer', 'decreased', 'reduced'].includes(w)) ? '−' : null;
  const label = run.join(' ');
  return { key: head, label, qualifiers, sign };
};

// The causal verbs whose direction is EFFECT-REVERSING — "X prevents Y", "X reduces Y",
// "X cuts Y" assert X pushes Y DOWN. Recorded on the claim so a reader knows the sign of
// the asserted effect without re-reading. (The node key is still the construct, e.g. "crime".)
const NEGATIVE_EFFECT_VERBS = new Set([
  'reduce', 'reduces', 'reduced', 'reducing', 'lower', 'lowers', 'lowered', 'lowering',
  'prevent', 'prevents', 'prevented', 'preventing', 'cut', 'cuts', 'cutting',
  'curb', 'curbs', 'curbed', 'curbing', 'diminish', 'diminishes', 'diminished',
  'decrease', 'decreases', 'decreased', 'inhibit', 'inhibits', 'inhibited',
  'suppress', 'suppresses', 'suppressed', 'deter', 'deters', 'deterred',
  'mitigate', 'mitigates', 'mitigated', 'alleviate', 'alleviates', 'alleviated',
  'weaken', 'weakens', 'weakened', 'undermine', 'undermines', 'undermined',
  'depress', 'depresses', 'depressed', 'worsen', 'worsens', 'worsened',
  'hinder', 'hinders', 'hindered', 'kill', 'kills', 'killed', 'harm', 'harms', 'harmed',
]);

// A single causal pattern found in a sentence: the cause phrase, the verb (or link), the
// effect phrase, and the char offsets of the verb (for the claim span). The reader tries,
// in order: an association phrase, a causal verb, and a "because"/"due to" subordinator.
// All are conservative — a hit requires the marker AND a content head on each side.
const VERB_RE = /\b([a-z][a-z-]+)\b/gi;

const findCausalClauses = (sentence) => {
  const s = sentence;
  const lower = s.toLowerCase();
  const out = [];

  // (a) "<cause> ... <causal|assoc verb> ... <effect>" — the verb splits the clause. We
  // take the nearest admitted causal/association verb and read the NP on each side. A
  // copular "is/are associated with" is handled because "associated" is itself the verb.
  let m;
  const re = new RegExp(VERB_RE.source, 'gi');
  while ((m = re.exec(s)) !== null) {
    const v = m[1].toLowerCase();
    if (!ESSENTIAL_VERBS.has(v) && !ASSOCIATION_VERBS.has(v)) continue;
    const before = s.slice(0, m.index);
    // ADJECTIVE GUARD. Several causal verbs are also comparative adjectives ("lower crime",
    // "higher rates") or participles. A verb never sits right after a preposition or a
    // determiner — a NOUN does — so a causal-verb token preceded by one is being used
    // adjectivally here. Skip it, so "associated with LOWER crime" reads one claim, not two.
    const prev = (before.match(/([a-z]+)\s*$/i) || [, ''])[1].toLowerCase();
    if (PRE_NOUN.has(prev)) continue;
    let after = s.slice(m.index + m[0].length);
    // step over a following linking preposition ("leads TO", "results IN", "associated WITH")
    after = after.replace(/^\s+(?:to|in|with|on|for|of)\b/i, '');
    const cause = readNP(before.split(/[,;:]/).pop());        // nearest clause segment before
    const effect = readNP(after.split(/[,;:.!?]/)[0]);        // up to the next clause break
    if (!cause || !effect || cause.key === effect.key) continue;
    out.push({ cause, effect, verb: v, at: m.index, len: m[0].length,
      effectSign: NEGATIVE_EFFECT_VERBS.has(v) ? '−' : (effect.sign || '+') });
  }

  // (b) subordinator causation: "Y because X", "Y due to X", "because X, Y", "X, so Y".
  // These carry the direction explicitly. The parser types the same connective as an
  // inter-proposition 'cause' link; here we read it at the NP grain so it lands on nodes.
  for (const cue of ['because', 'due to', 'as a result of', 'owing to', 'thanks to']) {
    let idx = lower.indexOf(cue);
    while (idx >= 0) {
      const causePart = s.slice(idx + cue.length).split(/[,;:.!?]/)[0];
      const effectPart = s.slice(0, idx).split(/[,;:]/).pop();
      // A reporting matrix ("The council CLAIMED the library reduced crime because …") attaches
      // the 'because' to the REPORTED content, not the reporting subject — the subject-read would
      // wrongly make "council" the effect. Too ambiguous to place at the noun grain, so skip it.
      if (REPORTING_RE.test(effectPart)) { idx = lower.indexOf(cue, idx + cue.length); continue; }
      // A subordinator clause is a full clause on each side ("the library opened",
      // "crime fell") — read the SUBJECT noun, not the clause verb.
      const cause = readNP(causePart, 'subject');
      const effect = readNP(effectPart, 'subject');
      if (cause && effect && cause.key !== effect.key)
        out.push({ cause, effect, verb: 'cause-link', at: idx, len: cue.length, effectSign: effect.sign || '+' });
      idx = lower.indexOf(cue, idx + cue.length);
    }
  }
  return out;
};

// How surely the READER apprehended this causal reading of the passage — NOT how true it
// is (relations.js §4). An explicit causal verb reads high; a bare subordinator or a
// mechanism-cue-only reading reads lower; a hedge ("may", "suggests") and a many-word,
// hard-to-head NP each shave it. It rides the edge so the corpus DAG can weight a
// confidently-read claim above a strained one — and so a low number is a reason to
// re-read, never a reason to drop the reading (total capture, §1).
const readerConfidenceOf = (claim, sent) => {
  let c = claim.warrant.startsWith('causal-verb') ? 0.9
    : claim.warrant.startsWith('assoc') ? 0.85
    : claim.warrant.startsWith('mechanism+') ? 0.85
    : claim.marker === 'cause-link' ? 0.65
    : claim.warrant === 'mechanism-cue' ? 0.5 : 0.6;
  if (claim.modality === 'epistemic') c *= 0.85;                 // a hedged claim, read as such
  const npLen = (claim.causeQualifiers.length + claim.effectQualifiers.length);
  if (npLen >= 4) c *= 0.9;                                       // a long NP is a harder read
  return Math.round(c * 1000) / 1000;
};

// Read every causal CLAIM a doc's sentences make. `doc` is what parseText returns (we use
// only doc.sentences and doc.docId). Returns a frozen array of claims — each one a READING
// of the passage, rooted at the reader, fully sourced, never a fact about source or world.
export const readCausalClaims = (doc, { docId } = {}) => {
  const id = docId || doc?.docId || 'doc';
  const sentences = doc?.sentences || [];
  const claims = [];
  sentences.forEach((sent, sentIdx) => {
    for (const c of findCausalClauses(sent)) {
      const stance = proposeStance(c.verb, sent);
      if (!stance.stance) continue;                    // no causal claim proposed → pass over
      const span = [c.at, c.at + c.len];
      const base = {
        cause: c.cause.key, causeLabel: c.cause.label, causeQualifiers: Object.freeze(c.cause.qualifiers),
        effect: c.effect.key, effectLabel: c.effect.label, effectQualifiers: Object.freeze(c.effect.qualifiers),
        effectSign: c.effectSign,
        stance: stance.stance, warrant: stance.warrant,
        polarity: readPolarity(sent), modality: readModality(sent),
        marker: c.verb,
        // `reading:true` — this is what the READER takes the passage to mean, defeasible and
        // rooted at the reader (the INSTRUMENT), never asserted as the source's settled view.
        reading: true,
        // claim-src: keeps this a claim, not a fact. WHO said it (docId), WHERE (sentence +
        // span + verbatim text). The reading traces to the passage; the passage to the source.
        src: Object.freeze({ docId: id, sentIdx, span: Object.freeze(span), text: sent }),
      };
      claims.push(Object.freeze({ ...base, readerConfidence: readerConfidenceOf(base, sent) }));
    }
  });
  return Object.freeze(claims);
};
