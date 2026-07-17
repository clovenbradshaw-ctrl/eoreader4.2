// EO: SYN·EVA·REC(Lens,Network → Network,Lens, Composing,Tracing,Binding) — plan → generate → verify → fix
// codewrite.js — the Code tab's whole loop: DEF the joint (plan, then a
// document that fulfils it), EVA the tie (does it actually run clean in the
// sandbox — code-prompts.js/sandbox-run.js do the measuring), REC when it
// doesn't (fold the real errors back in and try again, capped). This is the
// "code generation like Claude Code" arc scoped to what a browser tab can
// prove: one self-contained document, planned, written, RUN, and corrected
// against its own observed failures — never a claim of success the sandbox
// didn't verify.

import { runInSandbox } from './sandbox-run.js';
import { buildPlanMessages, parsePlan, buildCodeMessages, buildFixMessages, parseCodeBlock } from './code-prompts.js';

export const MAX_ATTEMPTS = 3;   // one first draft + two corrective passes, then an honest stop

// planCode({ task, model, signal }) -> { plan, error, raw }
// One call. `plan` is null when the reply didn't parse (see code-prompts.js
// parsePlan); the caller shows `error` and lets a person retry or just
// generate from the bare task.
export const planCode = async ({ task = '', model = null, signal = null } = {}) => {
  if (!model) throw new Error('planCode: no model connected');
  const raw = await model.phrase(buildPlanMessages(task), { maxTokens: 500, signal });
  const { plan, error } = parsePlan(raw);
  return { plan, error, raw };
};

// generateAndVerify({ task, plan, model, onAttempt, signal, verify }) -> { attempts, final }
//   attempts  every round tried, in order: { code, verify: {ok,errors,logs}, raw }
//   final     the last attempt regardless of outcome — a run that never
//             verifies clean within MAX_ATTEMPTS still returns its closest
//             try and the real errors, never a silent success
// `onAttempt(attempt, index)` fires after each round so a surface can stream
// "attempt 2: 3 errors, asking the model to fix them" as it happens, the
// same live-progress discipline the Write tab's event log holds. `verify`
// defaults to the real sandbox (runInSandbox) and is swappable so a test can
// script a fail-then-pass sequence without a DOM.
export const generateAndVerify = async ({
  task = '', plan = null, model = null, onAttempt = null, signal = null, verify: verifyCode = runInSandbox,
} = {}) => {
  if (!model) throw new Error('generateAndVerify: no model connected');
  const attempts = [];
  let prevCode = null;
  let prevErrors = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const messages = prevCode
      ? buildFixMessages(task, plan, prevCode, prevErrors)
      : buildCodeMessages(task, plan);
    const raw = await model.phrase(messages, { maxTokens: 3000, signal });
    const code = parseCodeBlock(raw);
    const verify = await verifyCode(code);
    const attempt = Object.freeze({ code, verify, raw });
    attempts.push(attempt);
    if (onAttempt) { try { onAttempt(attempt, i); } catch { /* UI hook, never fatal */ } }
    if (verify.ok) break;
    prevCode = code;
    prevErrors = verify.errors;
  }
  return { attempts: Object.freeze(attempts), final: attempts[attempts.length - 1] };
};
