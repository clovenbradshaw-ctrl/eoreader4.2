// EO: EVA·SIG(Field → Lens, Tracing,Tending) — the per-candidate waveform preview (docs/research-
// review.md §6). Reuses the SAME Reading the Overview page's waveform already reads (app.eotFor's
// turns — surprisal/belief, bridge) rather than building a second detector, and opens through the
// SAME evidence-modal contract (evidence.js buildMark) Overview's marks open through, so a mark
// clicked here and a mark clicked there resolve to one shape. Only ever called for a REVIEWED
// candidate (a real, parsed S-registry source) — never for a discovered-only stub, which has no eot
// to read (§6: "No waveform may be generated from a snippet-only candidate").
//
// Honest about scope: of the spec's default marks (structural frames, local strain, significant
// turns, echoes, referent presence, comparable propositions/measures, cross-candidate matches), this
// implements three from data the app already computes per-source — significant turns (the
// belief/surprisal track itself), referent presence (a turn's bridge flag), and comparable measures
// (correspondence against the review's own comparisonMatrix). Structural frames, echo detection, and
// cross-candidate-match marks are NOT implemented — they would need the fuller omnimodal build
// (docs/omnimodal-waveform.md) run per-candidate, which this screen does not do — left out rather
// than faked with a placeholder mark.

import { buildMark, correspondingEvidenceFor } from './evidence.js';

const NBARS = 28;

// candidateWaveform(eot, { matrix, sn }) → { bars:[{hPct,hasTurn,ordinal,hasBridge,hasMeasure}],
// turns } — a compact bar track sized for a card, reduced from turns the same way Overview's
// buildTrack does: bucket each turn into one of NBARS positions by its ordinal fraction, keep the
// strongest per bucket.
export const candidateWaveform = (eot, { matrix = null, sn = null } = {}) => {
  const turns = (eot && Array.isArray(eot.turns)) ? eot.turns : [];
  const unitsN = (eot && Array.isArray(eot.unitText)) ? eot.unitText.length : 0;
  if (!turns.length || unitsN <= 0) return { bars: [], turns: [] };
  const magOf = (t) => Math.max(t.bayesBits || 0, t.surprisalBits || 0);
  const peak = turns.reduce((m, t) => Math.max(m, magOf(t)), 0) || 1;
  const posOf = (t) => Math.min(NBARS - 1, Math.max(0, Math.round((t.idx / Math.max(1, unitsN - 1)) * (NBARS - 1))));
  const at = Array.from({ length: NBARS }, () => null);
  const mags = Array.from({ length: NBARS }, () => 0);
  for (const t of turns) {
    if (t.idx == null) continue;
    const bi = posOf(t);
    const frac = magOf(t) / peak;
    if (frac >= mags[bi]) { mags[bi] = frac; at[bi] = t; }
  }
  const bars = mags.map((frac, i) => {
    const t = at[i];
    const hasMeasure = !!(t && matrix && sn != null && correspondingEvidenceFor(matrix, sn, t.idx));
    return {
      hPct: Math.round(6 + frac * 94), hasTurn: !!t, ordinal: t ? t.idx : null,
      hasBridge: !!(t && t.bridge != null), hasMeasure,
    };
  });
  return { bars, turns };
};

// markPayload(row, turn, { eot, matrix, docId }) → the shared evidence-modal payload for one turn,
// built with the SAME buildMark contract Overview's marks resolve through (evidence.js). Referent
// resolution (linkedThreadIndexes → an openable Figure) lives in the app's entity-thread overlay and
// is not replicated here — a mark opens with its own sentence context and cross-source measure
// correspondence, not a fabricated cast list.
export const markPayload = (row, turn, { eot = null, matrix = null, docId = null } = {}) => {
  const units = (eot && eot.unitText) || [];
  const clean = (i) => (i == null || i < 0 || i >= units.length) ? '' : String(units[i] || '').replace(/\s+/g, ' ').trim();
  const sentence = clean(turn.idx);
  const peak = ((eot && eot.turns) || []).reduce((m, t) => Math.max(m, Math.max(t.bayesBits || 0, t.surprisalBits || 0)), 0) || 1;
  const frac = Math.max(turn.bayesBits || 0, turn.surprisalBits || 0) / peak;
  const mark = buildMark({
    sourceId: row.sn, idx: turn.idx, total: units.length, sentence, frac,
    hasBridge: turn.bridge != null, bridgeAxis: turn.bridgeAxis || [], docId, matrix,
  });
  return {
    sn: row.sn, sourceTitle: row.title || row.domain || row.sn, sourceLabel: row.domain || row.sn,
    origin: row.domain || 'source', line: `line ${turn.idx}`, sentence,
    contextBefore: clean((turn.idx ?? 0) - 1), contextAfter: clean((turn.idx ?? 0) + 1),
    surprises: (turn.surprises || []).map((x) => ({ op: x.op || '', text: x.text || '' })),
    bits: turn.bayesBits != null ? `${turn.bayesBits}b Δbelief` : (turn.surprisalBits != null ? `${turn.surprisalBits}b surprisal` : ''),
    pull: turn.bridge != null ? `${turn.bridge} pull${turn.bridgeAxis ? ` (${turn.bridgeAxis.join('—')})` : ''}` : '',
    mark,
  };
};
