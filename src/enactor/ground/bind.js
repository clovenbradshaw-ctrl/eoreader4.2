// EO: CON(Field,Entity → Link, Binding) — citation binder (bindCitations)
// bindCitations — re-cite the model's draft mechanically against the
// spans it was given. The model never writes [sN] tags; we do.
//
// Memoized per claim sentence: the converge loop re-binds 3–5 near-
// identical drafts; without this each re-bind would be O(claims × spans).
//
// Binding is the CERTIFICATION step — the audit trusts whatever citation
// lands here. So the match is not raw token overlap (which a span heavy in
// common, document-frequent tokens can win on its own padding); it is a
// posterior beating the same MIN_OVERLAP null the binder always used,
// shaped by two priors the reader already computed:
//
//   idf      — a matched token counts for log(1 + N/df): a token that
//              appears in every sentence carries almost no evidence, a rare
//              content word carries most of it. This is the sister/mother
//              guard at the lexical level — a frequent name can no longer
//              out-overlap the one rare token that actually discriminates.
//   field    — among spans that clear the lexical gate, the one mentioning
//              the WARM referents (the γ-decayed coref posterior at the
//              cursor, the same field the fact-checker grounds endpoints on)
//              wins the tie. The binding is tilted toward the reading it
//              sits inside, not chosen lexically in a vacuum.
//
// Both priors are OPT-IN: called without a doc (or with an empty field) the
// idf weights flatten to 1 and the field tilt vanishes, and bestMatch
// reduces exactly to the old overlap/claimTokens.size against MIN_OVERLAP.

import { tok } from '../../perceiver/parse/index.js';
import { documentFieldAt } from '../factcheck/index.js';

export const MIN_OVERLAP = 0.25;   // the citation bar — the null the lexical posterior beats to CITE
const BETA        = 0.5;   // how hard the warm-referent prior tilts the ranking

// CONTACT_FLOOR — the amplitude below which a claim made NO lexical contact with any span:
// zero surviving content tokens, prose from nowhere. The binder's `score` is an idf-weighted
// overlap FRACTION over tokens that survive the tokenizer's stop/length filter, so score > 0
// means at least one content token of the claim landed in some span. This names the
// HIGH-AMPLITUDE LIMIT of the un-groundedness reading — where the floor SUBSTITUTES — as
// distinct from a paraphrase that made contact yet could not clear MIN_OVERLAP, which RIDES
// flagged. Under the lexical organ the honest floor is exactly "no token survived" (0); a
// future meaning reader may raise it past 0, once the amplitude is a real distribution to
// beat rather than an overlap fraction (docs/grounding-floor.md, the graded-naming seam).
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
  const cache  = new Map();
  const bound  = [];
  for (const claim of claims) {
    const key = claim.toLowerCase();
    let best = cache.get(key);
    if (best === undefined) {
      best = bestMatch(claim, spans, { idf, fieldByIdx });
      cache.set(key, best);
    }
    // A claim CITES only when its amplitude cleared the MIN_OVERLAP bar (`best.cited`).
    // Below the bar the citation is null — but the sub-threshold amplitude still RIDES in
    // `score`, so the floor can read the contact reading and tell a paraphrase that made
    // lexical contact (flag, ride) from prose that came from nowhere (substitute).
    bound.push({
      claim,
      citation: best && best.cited ? `s${best.idx}` : null,
      score:    best ? best.score : 0,
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

export const renderBound = (bound) =>
  bound
    .map(b => (b.citation ? `${b.claim} [${b.citation}]` : b.claim))
    .join(' ');
