// EO: DEF·SEG(Field → Void,Field, Clearing,Dissecting,Unraveling) — sync anchor records
// AnchorRecord — one confidence-scored correspondence point between two sources' feature
// sequences (align.js), and its pure JSONL (de)serialization. No I/O here: anchor-store.js
// owns the OPFS write, this module only knows the shape.
//
// The canonical output of a sync run is this JSONL stream, not any one export format
// (organs/out/sync/*.js project it into SRT, later TTML/SMIL/MusicXML) — so a new export
// target is a new small file, never a change to the alignment core.

export const ANCHOR_VERSION = 1;

// tA/tB are each source's OWN native position (seconds) — never resampled onto a shared
// clock, so a caller always knows which source's timeline a number belongs to.
export const makeAnchor = ({ snA, snB, tA, tB, textA, textB, score, confidence }) => ({
  v: ANCHOR_VERSION, snA, snB, tA, tB, textA, textB,
  score: round3(score), confidence: round3(confidence),
});

// The header line — the run's own self-description, so a bare JSONL file explains itself:
// which sources, what alpha was asked for, how big the decoy background was, where the
// derived born-rule line landed, and whether the whole run abstained (voidnull.js line
// non-finite, or coverage too thin) rather than force-fitting a guess.
export const makeHeader = ({ snA, snB, roleA, roleB, alpha, N, line, abstain, coverage }) => ({
  v: ANCHOR_VERSION, kind: 'sync-header', snA, snB, roleA: roleA || null, roleB: roleB || null,
  alpha, N, line: Number.isFinite(line) ? round3(line) : null,
  abstain: !!abstain, coverage: round3(coverage || 0),
});

const round3 = (x) => Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x;

export const toJsonl = (header, anchors) =>
  [JSON.stringify(header), ...anchors.map((a) => JSON.stringify(a))].join('\n') + '\n';

export const fromJsonl = (text) => {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { header: null, anchors: [] };
  const rows = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const header = rows.find((r) => r.kind === 'sync-header') || null;
  const anchors = rows.filter((r) => r.kind !== 'sync-header');
  return { header, anchors };
};
