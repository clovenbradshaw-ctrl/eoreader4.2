// EO: EVA(Lens,Atmosphere → Lens, Binding·Dissecting·Tending) — the fold/plan judge
// metabolism/fold-plan-judge.js — grade the two stages BEFORE the answer: did the fold carry
// what the plan needed, did the plan cover what the task needed. judge.js grades the finished
// answer against a held source; challenger.js grades the finished answer's satisfaction. Neither
// looks INSIDE the pipeline — calibration mode (calibrate.js, docs/calibration-mode.md) needs to,
// because a bad final answer can come from a bad fold (missing information), a bad plan (right
// information, wrong shape), or a bad chunk prompt, and the breeder (proposer.js) can only name
// the right dial to move if the critique names which stage failed.
//
// The reference is the IDEAL: a frontier model's own direct answer to the task, with no
// fold/plan/chunk-prompt constraint at all — the ceiling lift.js already wants. The fold and the
// plan are graded by how much of what the ideal answer needed, they carried forward.
//
// Same posture as judge.js / challenger.js / proposer.js: no key, no network, in this module. It
// BUILDS a Messages API request and hands it to an injected `call(request) → response`. Dry-run
// (unarmed / no transport / out of budget) → grade returns null and the loop's critique for that
// axis is simply absent, never a fabricated verdict standing in for a missing one.

import { JUDGE_MODEL } from './judge.js';

export { JUDGE_MODEL as FOLD_PLAN_JUDGE_MODEL };

// ── the FOLD verdict: did it carry what the ideal answer needed, and how much of it was noise ──
const FOLD_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['sufficient', 'salience', 'rationale'],
  properties: {
    sufficient: { type: 'boolean', description: 'does the FOLD carry every fact the IDEAL answer relies on' },
    salience:   { type: 'number', description: 'fraction of the FOLD that was actually relevant to the task, in [0,1] — a bloated fold scores low even if sufficient' },
    missing:    { type: 'string', description: 'one fact the IDEAL used that the FOLD lacks; empty string if none' },
    rationale:  { type: 'string', description: 'one sentence' },
  },
});

const FOLD_SYSTEM = [
  'You grade a FOLD — the slice of information a small local model was handed before it planned an answer — against an IDEAL answer a frontier model produced directly from the full source, unconstrained.',
  'sufficient: true iff every fact the IDEAL answer actually relies on is present somewhere in the FOLD (a fold that omits a fact the ideal needed is insufficient, however much else it contains).',
  'salience: what fraction of the FOLD is content the TASK actually needed — a fold that is sufficient but padded with irrelevant material scores low here, not on sufficiency.',
  'missing: name ONE concrete fact (if any) the ideal answer used that the fold does not carry. Empty string if the fold is sufficient.',
  'Return the JSON verdict only.',
].join('\n');

export const buildFoldRequest = ({ task, fold, idealAnswer, model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const content = [
    `TASK:\n${taskText(task)}`,
    `IDEAL ANSWER (a frontier model, unconstrained):\n${text(idealAnswer)}`,
    `FOLD (what the local pipeline extracted before planning):\n${listText(fold)}`,
  ].join('\n\n');
  return Object.freeze({
    model, max_tokens: 400, system: FOLD_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema: FOLD_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
};

export const parseFoldVerdict = (res) => {
  const v = pickJSON(res);
  if (!v || typeof v.sufficient !== 'boolean') return null;
  return Object.freeze({
    sufficient: !!v.sufficient,
    salience: clamp01(v.salience, 0.5),
    missing: typeof v.missing === 'string' ? v.missing.slice(0, 200) : null,
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// ── the PLAN verdict: right steps, right order, right coverage ──
const PLAN_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['decomposition', 'coverage', 'ordered', 'rationale'],
  properties: {
    decomposition: { type: 'number', description: 'does the PLAN break the task into the right steps/chunks, in [0,1]' },
    coverage:      { type: 'number', description: 'if every planned step were executed perfectly, how much of the IDEAL answer would it produce, in [0,1]' },
    ordered:       { type: 'boolean', description: 'is the step order coherent — could a small model execute it step by step without a later step silently needing something an earlier step never introduced' },
    rationale:     { type: 'string', description: 'one sentence' },
  },
});

const PLAN_SYSTEM = [
  'You grade a PLAN — an ordered list of steps/chunks a small local model intends to generate, one prompt per step — against an IDEAL answer a frontier model produced directly, unconstrained.',
  'decomposition: are the steps the RIGHT grain — neither so coarse a small model\'s context window cannot hold one step\'s prompt, nor so fine the plan fragments a single idea across steps that will read as disjointed.',
  'coverage: if every step were executed perfectly, how much of what the IDEAL answer covers would the assembled output cover.',
  'ordered: could each step be generated from ONLY its own prompt plus what came before, without silently depending on something a later step introduces.',
  'Return the JSON verdict only.',
].join('\n');

export const buildPlanRequest = ({ task, plan, idealAnswer, model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const content = [
    `TASK:\n${taskText(task)}`,
    `IDEAL ANSWER (a frontier model, unconstrained):\n${text(idealAnswer)}`,
    `PLAN (ordered steps the local pipeline intends to generate, one prompt per step):\n${listText(plan)}`,
  ].join('\n\n');
  return Object.freeze({
    model, max_tokens: 400, system: PLAN_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
};

export const parsePlanVerdict = (res) => {
  const v = pickJSON(res);
  if (!v || (typeof v.decomposition !== 'number' && typeof v.coverage !== 'number')) return null;
  return Object.freeze({
    decomposition: clamp01(v.decomposition, undefined),
    coverage: clamp01(v.coverage, undefined),
    ordered: !!v.ordered,
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// createFoldPlanJudge — the gated, budgeted grader for the two pre-answer stages. Same shape as
// createJudge (judge.js): `call(request) → Promise<response>` injected; null/unarmed/out-of-budget
// → dry-run, gradeFold/gradePlan resolve null. One shared budget across both axes — a calibration
// cycle spends at most 2 judge calls (fold + plan), same accounting discipline as judge.js.
export const createFoldPlanJudge = ({ model = JUDGE_MODEL, effort = 'low', call = null, enabled = false, budget = {} } = {}) => {
  let armed = !!enabled;
  const cap = typeof budget === 'number' ? { calls: budget } : { calls: 200, ...budget };
  let spentCalls = 0;

  const affordable = () => cap.calls == null || spentCalls < cap.calls;
  const budgetState = () => Object.freeze({ calls: spentCalls, cap: cap.calls ?? null, remaining: cap.calls == null ? null : Math.max(0, cap.calls - spentCalls), exhausted: !affordable() });

  const send = async (request) => {
    if (!armed || typeof call !== 'function') return null;
    if (!affordable()) return null;
    spentCalls += 1;
    try { return await call(request); } catch { return null; }   // an outage must not break the loop
  };

  return Object.freeze({
    async gradeFold({ task, fold, idealAnswer } = {}) {
      const res = await send(buildFoldRequest({ task, fold, idealAnswer, model, effort }));
      return res ? parseFoldVerdict(res) : null;
    },
    async gradePlan({ task, plan, idealAnswer } = {}) {
      const res = await send(buildPlanRequest({ task, plan, idealAnswer, model, effort }));
      return res ? parsePlanVerdict(res) : null;
    },
    budget: budgetState,
    armed: () => armed,
    arm(fn) { if (typeof fn === 'function') call = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    model,
  });
};

// ── helpers ───────────────────────────────────────────────────────────────────
const text = (s) => (typeof s === 'string' ? s : (s && (s.text || s.answer)) || '');
const taskText = (t) => (typeof t === 'string' ? t : (t && (t.question || t.intent)) || '(none)');
const listText = (v) => {
  if (v == null) return '(empty)';
  if (typeof v === 'string') return v.slice(0, 2400);
  if (Array.isArray(v)) return v.map((x, i) => `[${i + 1}] ${typeof x === 'string' ? x : (x.text || x.quote || x.summary || x.prompt || x.title || JSON.stringify(x))}`).join('\n').slice(0, 2400);
  try { return JSON.stringify(v).slice(0, 2400); } catch { return String(v); }
};
const clamp01 = (x, d) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : d);
// pickJSON — pull an object out of a Messages API response (parsed_output, a text block of JSON,
// a JSON string, or an already-parsed object). Null when nothing parseable came back.
const pickJSON = (res) => {
  if (!res) return null;
  let v = res;
  if (res.parsed_output && typeof res.parsed_output === 'object') v = res.parsed_output;
  else if (Array.isArray(res.content)) { const t = res.content.find((b) => b && b.type === 'text'); if (t) { try { v = JSON.parse(t.text); } catch { return null; } } }
  else if (typeof res === 'string') { try { v = JSON.parse(res); } catch { return null; } }
  return v && typeof v === 'object' ? v : null;
};
