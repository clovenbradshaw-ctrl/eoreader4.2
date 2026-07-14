// EO — the reader's MATH FRONT DOOR. A pure-arithmetic turn ("what is 2+2?", "sqrt(16)*3",
// "20% of 410k", "5!") is answered by math.js — mathjs in the browser (the same CDN the model
// backends use), a dependency-free evaluator offline — so the figure is provably correct, never
// warms the model, and never touches the web. 4.1 ran this first in sendChat; 4.2 had the same
// short-circuit ONLY inside runTurn's `route`, which ask()'s empty-record web reach jumps in front
// of — so "what is 2+2?" with nothing on the record was WEB-SEARCHED instead of computed. This
// restores the true front door: ask() calls answerMathTurn before the model warm / phatic read /
// web reach, so a math question is computed instantly whether or not a source is open.
//
// The gate is strict (the module's extractExpression, inside answerMathAsync): anything carrying
// real words ("how many chapters are there?") returns null and the turn proceeds untouched — and
// answerMathAsync makes no network call on a non-math turn, so this costs only a resolved promise.
import { answerMathAsync } from '../../../enactor/answer/index.js';

// answerMathTurn(q, pending, appCtx) → true when q was a pure-math turn (pending is finalized as
// the answer), false otherwise (the caller proceeds to the normal turn). The answer carries its
// WORKING when the expression took more than one step (traceExpression: "sqrt(16) = 4", then
// "4 × 3 = 12") — the model's own cognition made visible, not a bare number — and a provenance
// line names it as computed, not spoken by a model.
export const answerMathTurn = async (q, pending, appCtx) => {
  let math = null;
  try { math = await answerMathAsync(q); } catch { return false; }
  if (!math || !math.text) return false;
  const rec = math.record;
  // The working, one bullet per step, shown when the expression took more than one reduction — a
  // bare "2 + 2 = 4" needs no expansion. A leading "• " puts each step on its own line: the answer
  // surface breaks a paragraph on a newline that precedes a bullet (rooms/reader/app/segments.js).
  const working = (rec && Array.isArray(rec.steps) && rec.steps.length > 1)
    ? '\n\n' + rec.steps.map((s) => `• ${s.text}`).join('\n') : '';
  Object.assign(pending, {
    text: `${math.text}${working}\n\nCalculated directly — no model, no web.`,
    route: 'math', mechanical: true, mathRecord: rec || null,
    modelNote: 'Calculated directly — no model, no web.', grounded: false, pending: false,
  });
  appCtx.setBusy(null);
  appCtx.logIt('claim', `Calculated "${math.text}"`, 'no model · no web');
  appCtx.persist(); appCtx.emit('messages');
  return true;
};
