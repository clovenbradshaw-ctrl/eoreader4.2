// EO: EVA·SIG(Field,Network → Lens, Tracing,Tending) — the evidence-modal contract.
//
// The waveform → universal source-navigation surface: whatever mark a user clicks (a turn on
// the per-source waveform, an event on the topic-level waveform), it resolves to ONE of these
// before any modal opens. The modal always has the same five regions — locator, native preview,
// why it surfaced, context/connections, destinations — no matter which modality the mark came
// from. This module only ever assembles that shape from data the caller already computed
// (turns, the cross-source comparison matrix, claims); it detects nothing new and reads no
// source text itself.
//
// Every rendered mark needs:
//   { sourceId, unitStart, unitEnd, sourceLocator, signalType, confidence, explanation,
//     referents, propositions, correspondingEvidence }
// `sourceLocator` is modality-specific (here: { sentIdx, charStart, charEnd }); the rest of the
// modal contract is invariant across every modality a perceiver adds later.

// The same 0.55 / 0.28 split the waveform bars already colour by (index.html's buildTrack) —
// reused here as words, not a second detector, so the modal never disagrees with the bar it
// was opened from.
const CONFIDENCE_HIGH = 0.55;
const CONFIDENCE_MEDIUM = 0.28;

export const confidenceBand = (frac) => {
  const f = Number(frac) || 0;
  return f > CONFIDENCE_HIGH ? 'High confidence' : f > CONFIDENCE_MEDIUM ? 'Medium confidence' : 'Low confidence';
};

// The mark's kind, named from which channel actually fired — never an invented interior state
// (docs/deviation-waveform.md's "critical restraint": describe what was measured).
export const kindLabel = ({ hasBridge = false } = {}) => (hasBridge ? 'Referents drawn together' : 'Local departure');

export const explanationFor = ({ hasBridge = false, bridgeAxis = [] } = {}) => {
  const axis = (bridgeAxis || []).filter(Boolean);
  if (hasBridge && axis.length) {
    return `The local field departs from the surrounding passage, and ${axis.join(' and ')} are drawn into the same turn.`;
  }
  if (hasBridge) return 'The local field departs from the surrounding passage, drawing two referents into the same turn.';
  return 'The local field departs from the surrounding passage here.';
};

// Cross-source correspondence — src/enactor/factcheck/comparison.js already pivots every bound
// value to measure×source; a mark corresponds to a row iff its own source's cell in that row was
// read out of this exact sentence. Returns null (not an empty object) so a caller can gate the
// whole "Also appears in" region on one falsy check.
export const correspondingEvidenceFor = (matrix, sn, idx) => {
  if (!matrix || !Array.isArray(matrix.rows) || sn == null || idx == null) return null;
  for (const row of matrix.rows) {
    const mine = (row.cells || []).find((c) => c && c.source === sn && c.sentIdx === idx);
    if (!mine) continue;
    const others = (row.cells || []).filter((c) => c && c.source !== sn);
    if (!others.length) continue;
    return {
      measure: row.measure, measureLabel: row.measureLabel, reading: row.reading, conflict: !!row.conflict,
      entries: others.map((c) => ({ source: c.source, sourceLabel: c.sourceLabel, display: c.display, text: c.text, sentIdx: c.sentIdx })),
    };
  }
  return null;
};

// Best-effort propositions overlapping this passage — claims.js's durable rows, matched on the
// (docId, unit) pair a citation click already resolves through.
export const propositionsFor = (claims, docId, idx) => {
  if (!Array.isArray(claims) || docId == null || idx == null) return [];
  return claims
    .filter((c) => c && c.docId === docId && c.unit === idx)
    .map((c) => ({ key: c.key || c.claimKey || null, text: c.text || c.quote || '', status: c.status || c.standing || null }));
};

export const citationFor = ({ sourceLabel = '', sourceTitle = '', line = '', sentence = '' } = {}) => {
  const src = [sourceLabel, sourceTitle].filter(Boolean).join(' · ');
  const loc = line ? ` (${line})` : '';
  return sentence ? `${src}${loc} — "${sentence}"` : `${src}${loc}`;
};

// buildMark — the technical contract every clickable mark resolves to. This source only ever
// emits text marks (sentIdx locators); other perceivers (src/perceiver/*/waveform.js) can
// populate the same shape once their surfaces wire up a click handler, without the modal itself
// changing.
export const buildMark = ({
  sourceId = null, idx = null, total = null, sentence = '', frac = 0,
  hasBridge = false, bridgeAxis = [], referents = [], claims = [], docId = null, matrix = null,
} = {}) => {
  const confidence = Math.max(0, Math.min(1, Number(frac) || 0));
  return {
    sourceId, unitStart: idx, unitEnd: idx,
    sourceLocator: { sentIdx: idx, charStart: 0, charEnd: String(sentence || '').length },
    signalType: 'turn',
    confidence,
    confidenceLabel: confidenceBand(confidence),
    kindLabel: kindLabel({ hasBridge }),
    explanation: explanationFor({ hasBridge, bridgeAxis }),
    referents,
    propositions: propositionsFor(claims, docId, idx),
    correspondingEvidence: correspondingEvidenceFor(matrix, sourceId, idx),
    locatorLabel: (Number.isInteger(idx) && Number.isInteger(total) && total > 0) ? `TEXT · PASSAGE ${idx + 1} OF ${total}` : '',
  };
};
