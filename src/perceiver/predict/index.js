// EO: EVA·SYN·SEG(Network,Field → Lens,Atmosphere, Tracing,Composing) — barrel
// The predict holon — the Cursor Predictor.
//
// A grounded, testable predictor over the next MOVE (an operator firing with a Site
// and a Resolution), not the next word. The prediction space is the ten-symbol move
// alphabet, the prior is a fusion of recurrence from the log, structure from the
// fold, and a small move-grammar learned once — no model call, no ingested corpus,
// because the prediction is over a small grammar conditioned on a log you already
// have (read/predict.js is the OPEN, model-driven prediction this stands apart from).
//
// Two stages, kept separate (§5): this holon predicts the MOVE and is tested on it
// alone — predicted vs actual, surprise, sharpness, recomputed causally at each
// cursor. The realizer that renders a predicted move into prose is a later piece,
// built and tested only after move-prediction is grounded and sharp where it should.

export { MOVE_ALPHABET, buildMoveLog, moveNotation, symbolOf } from './movelog.js';
export { recurrencePrior } from './recurrence.js';
export { structuralPrior } from './structure.js';
export { learnGrammar, grammarPrior, DEFAULT_GRAMMAR } from './grammar.js';
export { predictNextMove } from './predictor.js';
export {
  scoreSeries, persistenceAccuracy, marginalAccuracy, shuffleMoves,
} from './evaluate.js';
// The grain-nested predictor: the flat note n-gram (Figure) composed with a
// learned phrase model (Pattern), with boundary-surprise routed up through the
// task graph's grain-coherence. → grained.js
export {
  predictGrained, gradeGrained, predictionTaskGraph,
  predictionFrameLog, predictionFrameStack,
  prefixOverlap, phraseSimilarity, surpriseBoundaries,
} from './grained.js';
// Learned phrase segmentation — the SEG cut derived from the note grain's own
// surprise (signal-set threshold), so the grain-nested predictor needs no
// hand-fed boundaries. → segment.js
export {
  learnBoundaries, learnBoundariesFromSurprise, segmentationScore,
} from './segment.js';
