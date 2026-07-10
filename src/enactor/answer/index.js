// EO: EVA·DEF·NUL(Void,Field,Link,Network,Entity,Lens → Lens,Void, Binding,Dissecting,Clearing) — barrel
// The answer holon: mechanical answerers that never warm the model.

export { tryMechanical, answerConfirm, answerRelation, answerWho, answerMath, answerSmalltalk } from './mechanical.js';
export { answerMath as answerMathAsync, answerMathSync, isMathQuery, evalExpression, evaluateMath, extractExpression, loadMathjs, formatNumber } from './math.js';
export { answerVoid } from './void.js';
export { answerMetadata } from './metadata.js';
