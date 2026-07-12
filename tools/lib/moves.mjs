// Shared response-text -> move-sequence reduction, used by both shape-fit.mjs (the fit)
// and shape-audit.mjs (the audit export of what the fit actually saw). One definition of
// "depicted" and "masked" so the two can never drift apart.
import { parseText } from '../../src/perceiver/parse/pipeline.js';
import { buildMoveLog, MOVE_ALPHABET } from '../../src/perceiver/predict/movelog.js';

// The enacted (cognition) ops — the reader's own frame-forming/testing/breaking
// (movelog.js's ENACTED stream), masked out before any grammar is fit so the fitted
// shape is structurally incapable of carrying a judgment.
export const ENACTED_MASK = new Set(['DEF', 'EVA', 'REC']);
export const DEPICTED_ALPHABET = MOVE_ALPHABET.filter((op) => !ENACTED_MASK.has(op));

const isDepicted = (m) => m.register === 'content' && !ENACTED_MASK.has(m.op);

// text -> the FULL move-log (every register, every op), each move tagged `kept` — whether
// it survives into the fitted grammar. This is the one place "kept" is decided; the fit
// and the audit both read it off the same tag.
export const parseToMoves = (text, docId) => {
  const doc = parseText(text, { docId });
  const { moves } = buildMoveLog(doc);
  return moves.map((m) => ({ ...m, kept: isDepicted(m) }));
};

// The depicted-only sequence the grammar is actually fit on.
export const depictedMoves = (text, docId) => parseToMoves(text, docId).filter((m) => m.kept);
