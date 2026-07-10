// EO: NUL·SEG(Field → Field, Clearing,Dissecting) — what the model would be fed
// buildFeed — what a message would hand the model, without sending it.
//
// The turn is a fold of named stages (pipeline.js). The model is touched at one
// stage only — `llm`. Everything the model is FED is assembled by the stages
// before it: route → converse → retrieve → fold → prompt. buildFeed runs exactly
// those and stops at the threshold of generation, handing back the assembled
// context. So the feed is not a reconstruction of what the model sees — it IS
// what the model sees, one stage short of seeing it.
//
// Nothing is generated and nothing mutates: no llm, no bind, no veto, no audit
// turn. It is the turn pipeline read as an instrument — write a message, see the
// graph it activates and the prompt it would build, before any model is warmed.

import { stages } from './stages.js';

// `route` can short-circuit (smalltalk / math / who / confirm) — a mechanical
// answer that never reaches a model. buildFeed honours that: the loop stops on
// `terminate`, and the caller reads `ctx.mechanical` to show "answered
// mechanically, no model feed". Otherwise the four assembling stages run in full.
const FEED_STAGES = ['route', 'converse', 'retrieve', 'fold', 'answerable', 'prompt'];

export const buildFeed = async ({ question, doc = null, embedder, history = [] }) => {
  let ctx = { question, doc, model: null, embedder, history };
  for (const name of FEED_STAGES) {
    if (ctx.terminate) break;       // a mechanical short-circuit feeds no model
    ctx = await stages[name](ctx);
  }
  return ctx;
};
