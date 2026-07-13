// EO: CON(Field,Entity → Link, Binding) — citation binder (bindCitations)
// bindCitations — re-cite the model's draft mechanically against the
// spans it was given. The model never writes [sN] tags; we do.
//
// Memoized per claim sentence: the converge loop re-binds 3–5 near-
// identical drafts; without this each re-bind would be O(claims × spans).
//
// Binding is the CERTIFICATION step — the audit trusts whatever citation
// lands here. What we bind is a claim to the passage it SHARES A REFERENT
// with, not the passage whose surface it happens to overlap. A citation is
// not gated on clearing a fixed slice of lexical overlap (the old flat 0.25
// MIN_OVERLAP null); it is BORN when the reading of who-this-is-about
// separates from the noise — when one passage stands out as the witness
// because it carries the same warm, discriminating figures the claim does.
//
// The signal is shaped by two readings the reader already computed:
//
//   idf      — a matched token counts for log(1 + N/df): a token that
//              appears in every sentence carries almost no evidence, a rare
//              content word carries most of it. This is the sister/mother
//              guard at the lexical level — a frequent name can no longer
//              out-overlap the one rare token that actually discriminates.
//   referent — the figures the claim and a span BOTH name, weighted by how
//              much each one discriminates AMONG the spans (idfRef: a figure
//              in every retrieved passage — the ubiquitous subject — is noise
//              and counts for nothing; a figure in one passage is signal) and
//              tilted by the γ-decayed coref field (the same warmth the
//              fact-checker grounds endpoints on). Sharing the subject every
//              passage shares does not bind; sharing the one specific figure
//              the claim is actually about does. This is the sense in which
//              the cite is born from signal, not read lexically in a vacuum.
//
// The gate is OPT-IN on the reading. Called without a doc+cursor (or when the
// page carries no mention table) the referent reading is unavailable and the
// binder falls back EXACTLY to the old idf-overlap posterior against
// MIN_OVERLAP — so every no-doc caller (the weld witness, a bare bind) is
// byte-identical. With the reading in hand (the answer turn), the fixed bar
// gives way to the born-from-noise gate below.

import { tok } from '../../perceiver/parse/index.js';
import { documentFieldAt } from '../factcheck/index.js';
import { typeClaim, predicationSupport } from './predication.js';

export const MIN_OVERLAP = 0.25;   // the lexical null the no-reading fallback still beats to CITE
const BETA        = 0.5;   // how hard the warm-referent prior tilts the fallback ranking

// VERBATIM_LIFT — the overlap at or above which a lexical match is a genuine LIFT: so much of
// the claim is the passage's own words that the surface IS the grounding and no referent reading
// is owed. Mirrors ground/spans.js CITE_VERBATIM; a claim this close to a span cites even when it
// names no figure the reader tabled (a definitional line, a quoted phrase).
const VERBATIM_LIFT = 0.6;

// BETA_REF — how much a shared discriminating referent LIFTS a span's evidence over its bare
// lexical overlap. One specific shared figure (idfRef ≈ log(#spans) ≈ 1.8) lifts the witnessing
// span's evidence ~2–3×, so a claim that names the right figure rises out of the field even when
// few of its words are the passage's. A claim that shares only the ubiquitous subject gets no
// lift (idfRef → 0), so it does not.
const BETA_REF = 1;

// SIGNAL_RATIO — the born-from-noise bar. A citation lands only when the strongest witness's
// evidence stands at least this many times the MEDIAN evidence of the other passages the claim
// touched — the winner outmatches the noisy background rather than clearing a fixed slice. The
// referent lift does the discriminating (a shared specific figure clears this comfortably; a
// coincidental word-overlap on the shared subject does not), so this is the separation test, not
// a disguised overlap threshold.
const SIGNAL_RATIO = 2.5;

// CONTACT_FLOOR — the amplitude below which a claim made NO lexical contact with any span:
// zero surviving content tokens, prose from nowhere. The binder's `score` is an idf-weighted
// overlap FRACTION over tokens that survive the tokenizer's stop/length filter, so score > 0
// means at least one content token of the claim landed in some span. This names the
// HIGH-AMPLITUDE LIMIT of the un-groundedness reading — where the floor SUBSTITUTES — as
// distinct from a paraphrase that made contact yet could not be BORN as a citation, which RIDES
// flagged. `score` stays the lexical-contact amplitude the veto battery reads (isUnbound /
// unbound-contact), independent of how the citation itself is now decided.
export const CONTACT_FLOOR = 0;

// P0.4: a talker sometimes opens with a meta-line — "Here's a direct and specific
// answer to the user's question:" / "Sure, here is …:" — before the real first claim.
// Strip a single leading meta-line so it never ships and the first citation binds to
// the real claim, not the preamble. Anchored, one line, only the announce-then-colon
// shape — a claim that merely contains "here" mid-sentence is untouched.
const PREAMBLE = /^\s*(?:here(?:'s| is)\b[^:\n]*:|sure[,!]?\s[^:\n]*:)\s*/i;

export const bindCitations = (draft, spans, opts = {}) => {
  const claims = splitClaims(String(draft || '').replace(PREAMBLE, ''));
  const idf        = buildIdf(opts.doc);
  const fieldByIdx = buildFieldByIdx(opts.doc, opts.cursor);
  // The referent reading — available only when the page carries a mention table and the turn
  // handed us a cursor. When it is null, bestMatch runs the old lexical-null gate unchanged.
  const referent   = buildReferentReading(opts.doc, spans, opts.cursor);
  // TYPED BINDING (The Work v2 #2, ground/predication.js) — opt-in, and only over a doc whose
  // admission actually resolves ids (the same opt-in discipline the referent reading uses).
  // A claim that TYPES — parses to a resolved predication, or asserts a copular evaluation —
  // is judged over the PREDICATION, not the tokens: the span must predicate the asserted
  // value / hold the relation at least as strongly / entail the asserted evaluation. The cut:
  //   supported      → the citation is born from the predication (even on thin overlap);
  //   unsupported    → NO citation, even where the lexical born-gate would have passed —
  //                    sharing the subject's words is not support (the dolphins case);
  //   indeterminate  → the authored tables are silent (the strength/eval residue): uncited,
  //                    never guessed.
  // An untypeable claim falls through to the lexical floor, byte-identical; `score` stays the
  // bare lexical-contact amplitude on every path (the veto battery's contract).
  const typing = !!opts.typed && typeof opts.doc?.admission?.idOf === 'function';
  const cache  = new Map();
  const bound  = [];
  for (const claim of claims) {
    const key = claim.toLowerCase();
    let best = cache.get(key);
    if (best === undefined) {
      best = referent
        ? bestMatchBorn(claim, spans, { idf, referent })
        : bestMatch(claim, spans, { idf, fieldByIdx });
      cache.set(key, best);
    }
    let typed = null;
    if (typing) {
      try {
        const t = typeClaim(claim, opts.doc, opts.cursor ?? Infinity);
        if (t) {
          const support = predicationSupport(t, spans, opts.doc, opts.cursor ?? Infinity);
          if (support) typed = Object.freeze({ op: t.op, ...support });
        }
      } catch { typed = null; }   // a typing fault falls back to the lexical floor
    }
    // A claim CITES when its witness was BORN (`best.cited`) — either it shares the discriminating
    // referent that separates one passage from the field, or the surface itself is a verbatim lift.
    // Below that the citation is null, but the lexical-contact amplitude still RIDES in `score`, so
    // the floor can tell a paraphrase that made contact (flag, ride) from prose from nowhere.
    const lexicalCite = best && best.cited ? `s${best.idx}` : null;
    const citation = typed
      ? (typed.verdict === 'supported' ? `s${typed.spanIdx}` : null)
      : lexicalCite;
    bound.push({
      claim,
      citation,
      score:    best ? best.score : 0,
      ...(typed ? { typed } : {}),
    });
  }
  return bound;
};

const splitClaims = (draft) =>
  String(draft || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

// idf over the document's own units: log(1 + N/(1+df)). With no doc every
// token weighs 1, so the idf-weighted overlap collapses back to a plain
// matched/total fraction and the threshold keeps its old meaning.
const buildIdf = (doc) => {
  const units = doc?.units || doc?.sentences || null;
  if (!units || !units.length) return () => 1;
  const N  = units.length;
  const df = new Map();
  for (const u of units) for (const t of new Set(tok(u))) df.set(t, (df.get(t) || 0) + 1);
  return (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
};

// idx → summed γ-field posterior of the referents mentioned in that unit.
// documentFieldAt is the SAME warmth the fact-checker resolves claim endpoints
// through (factcheck/correspond.js); ground reads it here so the node-level
// binder and the edge-level checker agree on which figures are live. With no
// doc or no cursor it returns null and the tilt is a no-op.
const buildFieldByIdx = (doc, cursor) => {
  const mentions = doc?.mentions;
  if (!doc || !mentions || !mentions.size || cursor == null) return null;
  const wById = new Map(documentFieldAt(doc, cursor).map(f => [f.id, f.w]));
  const byIdx = new Map();
  for (const [id, idxs] of mentions) {
    const w = wById.get(id) || 0;
    if (!w) continue;
    for (const i of idxs) byIdx.set(i, (byIdx.get(i) || 0) + w);
  }
  return byIdx.size ? byIdx : null;
};

const EMPTY_SET = new Set();

// The referent reading the born gate rides: for the retrieved spans, WHICH figures each one
// names, how much each figure DISCRIMINATES among those spans (idfRef — a figure in every span is
// the shared subject and worth ~0; a figure in one span is worth log(#spans)), and the warm γ-
// field the fact-checker uses. Restricted to the figures actually present in the spans, so the
// per-claim work is a walk over the spans' own referents. Null (→ lexical fallback) when the page
// has no mention table, no admission labels, or the turn passed no cursor.
const buildReferentReading = (doc, spans, cursor) => {
  const mentions = doc?.mentions;
  const labelOf  = doc?.admission?.labelOf;
  if (!mentions || !mentions.size || typeof labelOf !== 'function' || cursor == null) return null;
  if (!Array.isArray(spans) || !spans.length) return null;

  const spanIdx = new Set(spans.map(s => s.idx));
  const refsByIdx = new Map();   // spanIdx → Set(referent id)
  const dfById    = new Map();   // referent id → # of spans that name it
  for (const [id, idxs] of mentions) {
    let hits = 0;
    for (const i of idxs) {
      if (!spanIdx.has(i)) continue;
      let set = refsByIdx.get(i); if (!set) { set = new Set(); refsByIdx.set(i, set); }
      if (!set.has(id)) { set.add(id); hits++; }
    }
    if (hits) dfById.set(id, hits);
  }
  if (!dfById.size) return null;   // the spans name no tabled figure — nothing to bind on but words

  const S = spanIdx.size || 1;
  // idfRef: the ubiquitous subject (named in every span) → log(1) = 0, pure noise; a figure in one
  // span → log(S), full signal. This is what makes "shares the subject" not a binding.
  const idfRef = (id) => Math.log(S / (dfById.get(id) || S));
  const wById  = new Map(documentFieldAt(doc, cursor).map(f => [f.id, f.w]));
  const fieldBoost = (id) => 1 + (wById.get(id) || 0);

  // the figures present in the spans, with their (lowercased) label tokens — the vocabulary a
  // claim's own tokens are matched against to see which of these figures the claim also names.
  const figures = [];
  for (const id of dfById.keys()) {
    const lt = tok(String(labelOf(id) ?? '').toLowerCase());
    if (lt.length) figures.push({ id, labelTokens: lt });
  }

  return {
    // the referent ids a claim names: a tabled figure whose every label token is in the claim.
    claimReferents: (claimTokens) =>
      figures.filter(f => f.labelTokens.every(t => claimTokens.has(t))).map(f => f.id),
    referentsAt: (idx) => refsByIdx.get(idx) || EMPTY_SET,
    idfRef, fieldBoost,
  };
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// bestMatchBorn — the referent-born gate. For each span the claim made lexical contact with, the
// evidence is its idf-overlap LIFTED by the discriminating figures the claim and span both name.
// The winner is the strongest evidence; it is CITED when it was born — a verbatim lift, the lone
// witness that shares a real figure, or evidence that stands SIGNAL_RATIO× over the median of the
// other touched passages. `score` stays the winner's bare lexical amplitude for the veto battery.
const bestMatchBorn = (claim, spans, { idf, referent }) => {
  const claimTokens = new Set(tok(claim));
  if (claimTokens.size === 0) return null;
  let denom = 0;
  for (const t of claimTokens) denom += idf(t);
  if (denom === 0) return null;

  const claimRefs = new Set(referent.claimReferents(claimTokens));
  const scored = [];
  for (const s of spans) {
    const sTokens = new Set(tok(s.text));
    let num = 0;
    for (const t of claimTokens) if (sTokens.has(t)) num += idf(t);
    const lex = num / denom;
    if (lex <= 0) continue;   // no content contact — not a candidate witness
    let refMass = 0;
    if (claimRefs.size) {
      const here = referent.referentsAt(s.idx);
      for (const id of claimRefs) if (here.has(id)) refMass += referent.idfRef(id) * referent.fieldBoost(id);
    }
    const evidence = lex * (1 + BETA_REF * refMass);
    scored.push({ s, lex, refMass, evidence });
  }
  if (!scored.length) return null;   // no lexical contact with any span — prose from nowhere

  scored.sort((a, b) => b.evidence - a.evidence);
  const top = scored[0];

  // BORN — the citation emerges from signal, not from clearing a fixed slice. The noise it must
  // rise out of is the overlap a passage gets from the SHARED SUBJECT alone (the figure every
  // passage names); the signal is a discriminating figure the claim is actually about.
  //   · a verbatim lift — the surface itself is the grounding, no figure owed;
  //   · the winner carries a discriminating shared figure (refMass > 0) — born unless a
  //     subject-only passage explains just as much overlap, so the figure added no separation.
  //     Two passages that each carry a DIFFERENT figure the claim names are both witnesses; the
  //     bar is the subject-only floor, never the other witness, so a claim that names two figures
  //     across two spans still binds;
  //   · no figure anywhere — a pure lexical paraphrase — is born only when its overlap stands
  //     SIGNAL_RATIO× over the median of the other touched passages (the captivity/speed case),
  //     never on a lone or flat contact (the pod-shares-only-"range/size" coincidence rides).
  let born;
  if (top.lex >= VERBATIM_LIFT) {
    born = true;
  } else if (top.refMass > 0) {
    const noise = scored.filter(x => x.refMass === 0).map(x => x.evidence);
    const floor = noise.length ? median(noise) : 0;
    born = floor === 0 || top.evidence >= SIGNAL_RATIO * floor;
  } else {
    born = scored.length > 1 && top.evidence >= SIGNAL_RATIO * median(scored.slice(1).map(x => x.evidence));
  }

  return { ...top.s, score: top.lex, cited: born };
};

// bestMatch — the no-reading fallback: the idf-weighted lexical posterior against the unchanged
// MIN_OVERLAP null, with the warm-field tilt breaking ties among CITABLE claims. Byte-identical to
// the binder before the referent reading was wired, so every no-doc caller is unchanged.
const bestMatch = (claim, spans, { idf = () => 1, fieldByIdx = null } = {}) => {
  const claimTokens = new Set(tok(claim));
  if (claimTokens.size === 0) return null;
  let denom = 0;
  for (const t of claimTokens) denom += idf(t);
  if (denom === 0) return null;

  // First pass: the lexical posterior (idf-weighted overlap, ∈ [0,1]) and the
  // span's raw field mass. maxField normalises the tilt per claim.
  let maxField = 0;
  const scored = [];
  for (const s of spans) {
    const sTokens = new Set(tok(s.text));
    let num = 0;
    for (const t of claimTokens) if (sTokens.has(t)) num += idf(t);
    const lex = num / denom;
    if (lex <= 0) continue;
    const field = fieldByIdx ? (fieldByIdx.get(s.idx) || 0) : 0;
    if (field > maxField) maxField = field;
    scored.push({ s, lex, field });
  }

  if (!scored.length) return null;   // no lexical contact with any span — prose from nowhere

  // The CITATION gate is the lexical posterior against the unchanged MIN_OVERLAP null —
  // the field never lets an under-grounded claim CITE, it only re-ranks claims that
  // already clear the bar. So the warm-referent prior can change WHICH source a claim
  // cites, never WHETHER it cites one.
  const admitted = scored.filter(x => x.lex >= MIN_OVERLAP);
  if (admitted.length) {
    let best = null, bestRank = -Infinity;
    for (const x of admitted) {
      const prior = maxField > 0 ? (1 - BETA) + BETA * (x.field / maxField) : 1;
      const rank  = x.lex * prior;
      // Report the lexical posterior as the grounding strength; the tilt only
      // breaks ties so `score` stays a comparable [0,1] measure of how grounded.
      if (rank > bestRank) { bestRank = rank; best = { ...x.s, score: x.lex, cited: true }; }
    }
    return best;
  }

  // Contact, but below the citation bar (CONTACT_FLOOR < score < MIN_OVERLAP): the claim
  // does NOT cite, but its strongest sub-threshold amplitude is REPORTED so the floor reads
  // the contact and flags-and-rides rather than substitutes. No field tilt here — the tilt
  // only breaks ties among CITABLE claims; a claim that does not cite has no citation to tilt.
  let best = null, bestLex = -Infinity;
  for (const x of scored) if (x.lex > bestLex) { bestLex = x.lex; best = { ...x.s, score: x.lex, cited: false }; }
  return best;
};

// The claim-grain honesty marker. A cited claim renders with its [sN]. An UNcited
// claim that made NO lexical contact with any span (score ≤ CONTACT_FLOOR, and no
// edge-grounding) is "prose from nowhere" — the model's own assertion, not anything
// the reading turned up. Under `mark`, that claim is surfaced at claim grain the way a
// citation is, so a grounded answer can no longer pass an unsourced sentence off as
// sourced. This is the leak the shipped woodpeckers turn showed: "They're social birds
// and are often seen in flocks." bound at score 0 (false, in no source) and rode
// indistinguishable from the cited claims — then became the premise of the next turn.
// Flag-and-tell, never gag: the claim still ships, it just wears its provenance. A
// contacted-but-uncited paraphrase (0 < score < the citation bar) is NOT marked — it
// touched a span; only the zero-contact claim is called out. Default off ⇒ every
// existing caller (bindAndVeto, the weld witness) is byte-identical.
export const UNSOURCED_MARK = '[no source]';

// The CREATIVE / FACTUAL split. The mark exists to flag a fact-from-nowhere — a claim
// STATED AS BEING THE CASE that nothing read witnesses. It has no business on CREATIVE
// output: a story, a poem, an imagined scene are meant to come from the writer, and a
// "[no source]" hung on invented prose is noise, not honesty. So the mark is owed only
// by an ASSERTION OF FACT. A line that asserts no checkable fact — a question, an
// invitation to imagine, an interjection — is not a grounding leak and rides clean.
//
// Conservative by design: the user cares most about NOT MISSING an ungrounded fact, so
// anything that reads as a plain declarative statement is treated as factual (marked if
// unsourced). Only the overt non-assertions are exempted — a narrow, high-confidence set,
// so a real ungrounded claim is never waved through as "creative".
const NON_FACT_QUESTION = /\?\s*$/;
const NON_FACT_OPENER = /^\s*(?:imagine|picture|envision|suppose|behold|hark|lo|pretend)\b/i;
const NON_FACT_INTERJECTION = /^\s*(?:oh|ah|alas|hark|lo|hey|wow|hmm|ha|oh no)\b[\s,!—-]/i;
export const isFactualClaim = (claim = '') => {
  const t = String(claim || '').trim();
  if (!t) return false;
  if (NON_FACT_QUESTION.test(t)) return false;          // a question asserts nothing
  if (NON_FACT_OPENER.test(t)) return false;            // an invitation to imagine — creative
  if (NON_FACT_INTERJECTION.test(t)) return false;      // an interjection — expressive, not factual
  return true;
};

const isProseFromNowhere = (b) =>
  !b.citation && !b.edgeGrounded && (b.score || 0) <= CONTACT_FLOOR && isFactualClaim(b.claim);

export const renderBound = (bound, { mark = false } = {}) =>
  bound
    .map(b => {
      if (b.citation) return `${b.claim} [${b.citation}]`;
      if (mark && isProseFromNowhere(b)) return `${b.claim} ${UNSOURCED_MARK}`;
      return b.claim;
    })
    .join(' ');
