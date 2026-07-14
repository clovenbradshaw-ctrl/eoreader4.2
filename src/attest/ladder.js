// EO: EVA·DEF(Lens → Lens,Atmosphere, Dissecting,Tracing,Binding) — the attestation ladder
// Attestation — "does the span I collapsed survive in the witness's copy?" (docs/attestation-
// spec.md §5). The THIRD function, and the one where the value shows up: a judgment (EVA) rendered
// by testing ONE span against a witness's bytes — never a page against a page.
//
// Page-level byte comparison is a dead end (§5.1): rotating ads, session IDs, CSRF tokens, view
// counters and "last updated" stamps make ~every page diverge for reasons that have nothing to do
// with truth — a signal with a ~100% false-positive rate is no signal. The only question a court,
// an editor, or a hostile press officer ever asks is whether the SENTENCE you are about to quote
// is in the timestamped copy. So attestation is per-span, at the same grain as everything else.
//
// The ladder (§5.3), four rungs:
//   1. exact substring in the witness text          → attested
//   2. normalized match                             → attested_normalized
//   3. fuzzy ≥ threshold similarity                 → attested_fuzzy   ⚑ human review
//   4. no match                                     → divergent        ⚑ ESCALATE
// Rungs 1–2 are automatic. Rung 3 is FLAGGED, never auto-accepted — a near-match may be a
// rendering artifact or may be an edit, and only a person can tell. Rung 4 stops the line, and its
// cause is TYPED (§5.4), because a divergence is a finding, not an error to retry away.
//
// Pure: the id_ fetch of the witness bytes is the seam (witness.js idReplayUrl); here we compare.

import { waybackToIso } from './witness.js';

// ── normalization (§5.3 rung 2) ─────────────────────────────────────────────────
// The exact transform the spec names: whitespace collapsed, smart quotes folded, HTML entities
// decoded, soft hyphens stripped. Deliberately NOT case-folding — the spec lists these four and
// no more; a case difference is left for the fuzzy rung to weigh, not silently erased.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', '#39': "'", '#34': '"' };
const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c >= 32 && c <= 0x10ffff ? String.fromCodePoint(c) : _; })
  .replace(/&([a-z0-9#]+);/gi, (m, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : m));

export const normalize = (text) => decodeEntities(String(text || ''))
  .replace(/­/g, '')                            // soft hyphens stripped
  .replace(/[‘’‚‛]/g, "'")       // smart single quotes folded
  .replace(/[“”„‟]/g, '"')       // smart double quotes folded
  .replace(/\s+/g, ' ')                              // whitespace collapsed
  .trim();

// ── fuzzy similarity (§5.3 rung 3) ───────────────────────────────────────────────
// Character-bigram Dice coefficient — symmetric, in [0,1], deterministic, and robust to a small
// misaligned window (it is a multiset measure, not positional). A one-character typo in a ~40-char
// span sits well above 0.95; a genuinely different sentence sits far below it.
const bigrams = (s) => {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
};
export const charDice = (a, b) => {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, sizeA = 0, sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const [g, n] of B) { sizeB += n; if (A.has(g)) inter += Math.min(n, A.get(g)); }
  return (2 * inter) / (sizeA + sizeB);
};

// The best near-substring similarity of `span` inside `witness` (both normalized). Exact/normalized
// substrings are handled by the rungs above; this only needs to catch an ALMOST-exact occurrence,
// so it anchors on a slice of the span, and around each anchor hit probes a few window lengths to
// absorb an insertion/deletion. Bounded work: anchors × a small window sweep. Returns [0,1].
const nearSubstringSim = (span, witness) => {
  const L = span.length;
  if (L === 0 || witness.length === 0) return 0;
  if (L <= 24) {                                     // short span: the whole span is the anchor probe
    let best = 0;
    for (let s = 0; s <= witness.length - Math.max(2, L - 2); s++) {
      for (let len = L - 2; len <= L + 2; len++) { if (len < 2) continue; best = Math.max(best, charDice(span, witness.substr(s, len))); if (best === 1) return 1; }
    }
    return best;
  }
  const anchors = [span.slice(0, 16), span.slice(-16), span.slice((L >> 1) - 8, (L >> 1) + 8)];
  let best = 0;
  for (const anchor of anchors) {
    let from = 0, idx;
    while ((idx = witness.indexOf(anchor, from)) !== -1) {
      const start = Math.max(0, idx - (L - anchor.length));   // align the window to hold the whole span
      for (let s = start; s <= idx + 4 && s <= witness.length; s++) {
        for (let len = L - 3; len <= L + 3; len++) { if (len < 2) continue; best = Math.max(best, charDice(span, witness.substr(s, len))); if (best === 1) return 1; }
      }
      from = idx + 1;
    }
  }
  return best;
};

// ── the four states ──────────────────────────────────────────────────────────────
export const ATTEST_STATES = Object.freeze(['attested', 'attested_normalized', 'attested_fuzzy', 'divergent']);

// runLadder(spanText, witnessText, { fuzzyThreshold=0.95 }) → { state, similarity, human, escalate }.
// human is true ONLY on the fuzzy rung (⚑ never auto-accepted); escalate is true ONLY on divergent
// (⚑ stops the line). similarity is 1 for the two exact rungs, the Dice best for fuzzy/divergent.
export const runLadder = (spanText, witnessText, { fuzzyThreshold = 0.95 } = {}) => {
  const rawSpan = String(spanText || ''), rawWit = String(witnessText || '');
  if (!rawSpan.trim()) return { state: 'divergent', similarity: 0, human: false, escalate: true, reason: 'empty-span' };
  if (rawWit.includes(rawSpan)) return { state: 'attested', similarity: 1, human: false, escalate: false };
  const nSpan = normalize(rawSpan), nWit = normalize(rawWit);
  if (nWit.includes(nSpan)) return { state: 'attested_normalized', similarity: 1, human: false, escalate: false };
  const sim = nearSubstringSim(nSpan, nWit);
  if (sim >= fuzzyThreshold) return { state: 'attested_fuzzy', similarity: sim, human: true, escalate: false };
  return { state: 'divergent', similarity: sim, human: false, escalate: true };
};

// ── divergence triage (§5.4) — a divergence must have a cause ─────────────────────
export const DIVERGENCE_CAUSES = Object.freeze(['paywall', 'geo', 'edited', 'cloaked', 'render']);

// Heuristic markers of a paywall interstitial standing in for the article.
const PAYWALL_MARKERS = ['subscribe to continue', 'subscribe now', 'sign in to read', 'sign in to continue', 'create a free account', 'this content is for subscribers', 'subscribers only', 'to continue reading', 'metered', 'you have reached your limit'];
const looksLikePaywall = (witnessText) => {
  const n = normalize(witnessText).toLowerCase();
  if (PAYWALL_MARKERS.some((m) => n.includes(m))) return true;
  return n.length > 0 && n.length < 600;              // an interstitial is short where the article is long
};

// ISO timestamps are UTC ('…Z'), fixed-width — so lexical order IS chronological, and a same-day
// test is a 10-char prefix compare. No clock, no Date, fully deterministic on the given strings.
const laterThan = (a, b) => !!a && !!b && String(a) > String(b);
const sameDay = (a, b) => !!a && !!b && String(a).slice(0, 10) === String(b).slice(0, 10);
// Is there a CDX capture EARLIER than our fetch? Its 14-digit wayback timestamp is converted to
// ISO and compared lexically (both UTC). An earlier capture is the one §5.4 says to check for.
const hasEarlierCapture = (cdxRows, fetchedAt) =>
  Array.isArray(cdxRows) && !!fetchedAt &&
  cdxRows.some((r) => { const iso = r && waybackToIso(r.timestamp); return iso && laterThan(fetchedAt, iso); });

// triageDivergence({ capture, witnessText, witnessCapturedAt, fetchedAt, cdxRows, signals }) →
// { cause, why }. Ordered by strength of evidence, not the table's order: a benign, evidenced
// explanation (paywall, edited) is preferred to the loud one (cloaked) so we escalate `cloaked`
// only when nothing benign fits — different content served to a crawler than to a browser is a
// deliberate act, and it is the finding, so it must not be reached for cheaply.
export const triageDivergence = ({ capture = {}, witnessText = '', witnessCapturedAt = null, fetchedAt = null, cdxRows = [], signals = {} } = {}) => {
  if (capture.authenticated && looksLikePaywall(witnessText))
    return { cause: 'paywall', why: 'authenticated capture vs an unauthenticated witness interstitial — expected, not escalated (§5.4)' };
  if (laterThan(witnessCapturedAt, fetchedAt) && hasEarlierCapture(cdxRows, fetchedAt))
    return { cause: 'edited', why: 'the witness captured after your fetch and an earlier capture exists in CDX — the page changed (§5.4)' };
  if (capture.renderer && signals.renderDiverged)
    return { cause: 'render', why: `JS-rendered (${capture.renderer}); the witness DOM differs — diagnosable, escalate to human (§5.4)` };
  if (signals.geoHint)
    return { cause: 'geo', why: 'content varies by region (caller hint); coherent but different (§5.4)' };
  if (sameDay(witnessCapturedAt, fetchedAt))
    return { cause: 'cloaked', why: 'witness captured contemporaneously, content differs materially, no benign explanation — THE loud one (§5.4)' };
  return { cause: 'geo', why: 'content differs but captures are not contemporaneous — treat as regional/edge variance pending review (§5.4)' };
};

// ── the whole verdict, and its EOT signals (§9 assembly 3) ───────────────────────
// attest(...) runs the ladder and, when divergent, types the cause. The verdict carries the two
// flags a pipeline acts on: `human` (fuzzy — route to review) and `escalate` (divergent — stop).
export const attest = ({ spanText, witnessText, capture = {}, witnessCapturedAt = null, fetchedAt = null, cdxRows = [], signals = {}, fuzzyThreshold = 0.95 } = {}) => {
  const v = runLadder(spanText, witnessText, { fuzzyThreshold });
  if (v.state === 'divergent' && v.reason !== 'empty-span') {
    const t = triageDivergence({ capture, witnessText, witnessCapturedAt, fetchedAt, cdxRows, signals });
    return { ...v, cause: t.cause, why: t.why };
  }
  return v;
};

// The EOT line an attestation writes to the tape (§9 assembly 3): a per-span EVA against a named
// witness. `!EVA <spanId> @ <witnessId> = "<state>"`.
export const attestationSig = (spanId, witnessId, state) =>
  `!EVA ${spanId} @ ${witnessId} = ${JSON.stringify(state)}`;

// The human-review flag a fuzzy rung must carry — tier 3 never auto-passes (§5.3).
export const humanReviewSig = (spanId) => `!SIG ${spanId}.review = "human"`;
