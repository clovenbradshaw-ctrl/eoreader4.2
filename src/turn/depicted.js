// EO: SEG(Field → Field, Dissecting) — the depicted-move reduction
// Response text -> its move sequence, with the enacted register masked. The ONE place
// "depicted" and "masked" are decided: the fit tool (tools/shape-fit.mjs), the audit
// export (tools/shape-audit.mjs), and the runtime draft scorer (turn/shape-grammar.js)
// all read the same reduction, so they can never drift apart.
//
// DEF/EVA/REC are the enacted (cognition) register — the reader's own frame-forming,
// testing, and breaking (perceiver/predict/movelog.js's ENACTED stream), not anything
// depicted in the text. Masked out here, before any grammar is fit or scored, so a
// fitted shape is structurally incapable of carrying a judgment: its alphabet has no
// column for one.
import { parseText } from '../perceiver/parse/index.js';
import { buildMoveLog, MOVE_ALPHABET } from '../perceiver/predict/index.js';

export const ENACTED_MASK = new Set(['DEF', 'EVA', 'REC']);
export const DEPICTED_ALPHABET = MOVE_ALPHABET.filter((op) => !ENACTED_MASK.has(op));

const isDepicted = (m) => m.register === 'content' && !ENACTED_MASK.has(m.op);

// text -> the FULL move-log (every register, every op), each move tagged `kept` — whether
// it survives into a fitted grammar. The audit export prints this; the depicted sequence
// below is its kept-only projection. `raw` (the underlying log event) is dropped at this
// boundary: it carries a wall-clock stamp, and the reduction's contract is DETERMINISTIC
// form — same text, byte-identical sequence — which the fit's reproducibility and the
// audit's replayability both stand on.
export const parseToMoves = (text, docId) => {
  const doc = parseText(text, { docId });
  const { moves } = buildMoveLog(doc);
  return moves.map(({ raw, ...m }) => ({ ...m, kept: isDepicted(m) }));
};

// The depicted-only sequence a grammar is fit on / a draft is scored by.
export const depictedMoves = (text, docId) => parseToMoves(text, docId).filter((m) => m.kept);
