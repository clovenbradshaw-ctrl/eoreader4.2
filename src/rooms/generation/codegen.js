// EO: SYN·CON·EVA(Network,Lens → Lens,Network, Composing,Binding,Tracing) — Build mode
// codegen.js — the generation surface's Build mode: one model call to propose
// intents (intents.js), then the real, unmodified coder pipeline (src/coder/
// build.js) — mask disposes what the model proposed, the checkpoint reads the
// remaining typed errors, repair mends what it can within its cap, the signed
// ledger records the whole assembly. Nothing about the pipeline is loosened
// for a model-sourced proposal versus a hand-built one in the tests — the
// model is exactly the "one input arrow" build.js already named as the seam,
// wired here for the first time.

import { build } from '../../coder/index.js';
import { buildIntentMessages, parseIntents } from './intents.js';

// proposeIntents({ task, model, signal }) -> { intents, dropped, error, raw }
// One call: the model drafts the JSON, parseIntents keeps only what is even
// shaped like an intent. `raw` rides along so a surface can show exactly what
// came back — including when parsing dropped everything.
export const proposeIntents = async ({ task = '', model = null, signal = null } = {}) => {
  if (!model) throw new Error('proposeIntents: no model connected');
  const messages = buildIntentMessages(task);
  const raw = await model.phrase(messages, { maxTokens: 1400, signal });
  const parsed = parseIntents(raw);
  return { ...parsed, raw };
};

// runFromIntents(intents, opts) -> build()'s own { ok, assemblies, vetoes,
// ledger, report, provisioned }. Exposed so a person can hand-edit the
// proposed JSON in the surface and re-run the SAME pipeline without another
// model call — the checkpoint is what disposes, not a second round of asking.
export const runFromIntents = (intents, opts = {}) => build(intents, {}, opts);

// runCodegen({ task, model, signal }) -> propose, then build in one step —
// the surface's "Generate" button before a person has anything to edit.
export const runCodegen = async ({ task = '', model = null, signal = null } = {}) => {
  const { intents, dropped, error, raw } = await proposeIntents({ task, model, signal });
  const buildResult = intents.length ? runFromIntents(intents) : null;
  return { intents, dropped, parseError: error, raw, buildResult };
};
