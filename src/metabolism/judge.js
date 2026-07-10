// EO: EVA(Lens,Atmosphere → Lens, Binding·Dissecting·Tending) — the external judge
// metabolism/judge.js — the un-authored anchor: a stronger external model (Claude) as
// the fitness judge, on the way to better LOCAL generation.
//
// The Goodhart defense in fitness.js needs part of the fitness anchored in something the
// system CANNOT author. This is it. A stronger model grades the LOCAL model's answer, and
// its verdict becomes the `validated` signal fitness.js already accepts. Genomes then
// evolve toward allocations whose local output an external judge rates highly — the
// judge's standard is distilled into the genome. So the judge is a SCAFFOLD: you run it
// "for a while," and once local generation is good enough you remove it (fitness falls
// back to the authored estimate, now trained to track the standard).
//
// CONTENT BOUNDARY. The judge SEES the turn's content — question, answer, cited spans —
// because grading requires it. It EMITS only a scalar verdict. Only that scalar reaches
// fitness, and fitness scalars never enter the genome or the persisted chain. So the
// judge reads content while the DNA-only invariant on the permanent record still holds.
//
// KEY NEVER IN THE TAB. This is a browser app with no client-side secret. The judge does
// not call the API directly — it BUILDS a Messages API request and hands it to an injected
// `call` transport (a proxy that forwards to Claude with the key server-side, the same
// shape as the archive webhook). No `call` / not armed → dry-run: the request is formed
// and inspectable, nothing is sent, `grade` returns null, and fitness stays honestly
// unanchored (provisional). The judge's own API cost is the operator's, not the
// organism's metabolic energy — it is development scaffolding, outside the envelope.

export const JUDGE_MODEL = 'claude-opus-4-8';   // the external standard (see claude-api skill: default Opus 4.8)
// A cheaper tier (claude-haiku-4-5 / claude-sonnet-5) is a reasonable choice for a
// high-frequency judge; left to the operator, since downgrading for cost is their call.

// The verdict schema — the judge returns a scalar, never free-form prose that could drift.
// `validated` is the un-authored quality in [0,1]; `covered` guards the anti-dodge term
// (did the answer address the question, not just ground something easy); `grounded` flags
// whether every claim was supported by the cited spans.
const VERDICT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['validated', 'covered', 'grounded', 'rationale'],
  properties: {
    validated: { type: 'number', description: 'overall quality of the answer in [0,1]' },
    covered:   { type: 'number', description: 'fraction of the question actually answered in [0,1]' },
    grounded:  { type: 'boolean', description: 'is every claim supported by the cited passages' },
    rationale: { type: 'string', description: 'one sentence, no more' },
  },
});

const SYSTEM = [
  'You are an impartial grader for a small local language model answering questions strictly from cited passages.',
  'Grade the ANSWER on three axes and return the JSON verdict only:',
  '  validated — overall quality in [0,1]: is the answer correct, well-supported, and responsive to the QUESTION?',
  '  covered   — in [0,1]: how much of what the QUESTION asked did the answer actually address? An answer that dodges the hard part, or hedges into a safe non-answer, covers little even if what it does say is true.',
  '  grounded  — true only if every claim in the answer is supported by the PASSAGES; unsupported claims make it false and should lower validated.',
  'Reward answers that are BOTH grounded AND responsive. Do not reward thrifty non-answers. Judge the answer, not its length. One sentence of rationale.',
].join('\n');

// buildJudgeRequest — the exact Messages API body. Adaptive thinking + low effort (a fast,
// cheap grader), a structured JSON verdict (output_config.format), a tight token cap.
export const buildJudgeRequest = ({ question, answer, spans = [], model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const passages = (spans || []).slice(0, 8)
    .map((s, i) => `[${i + 1}] ${typeof s === 'string' ? s : (s.text || s.quote || '')}`).join('\n') || '(none cited)';
  const content = `QUESTION:\n${question || '(none)'}\n\nANSWER:\n${answer || '(none)'}\n\nPASSAGES:\n${passages}`;
  return Object.freeze({
    model,
    max_tokens: 512,
    system: SYSTEM,
    thinking: { type: 'adaptive' },                 // judging groundedness is a reasoning task
    output_config: { effort, format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
};

// parseVerdict — pull the scalar verdict out of a Messages API response (defensive: the
// response may be the raw API JSON from a proxy, or an already-parsed object). Returns a
// clamped verdict, or null if nothing parseable came back (→ fitness stays provisional).
export const parseVerdict = (res) => {
  if (!res) return null;
  let v = res;
  if (res.parsed_output && typeof res.parsed_output === 'object') v = res.parsed_output;
  else if (Array.isArray(res.content)) {
    const text = res.content.find((b) => b && b.type === 'text');
    if (text) { try { v = JSON.parse(text.text); } catch { return null; } }
  } else if (typeof res === 'string') { try { v = JSON.parse(res); } catch { return null; } }
  if (typeof v.validated !== 'number' && typeof v.covered !== 'number') return null;
  const clamp01 = (x, d) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : d);
  return Object.freeze({
    validated: clamp01(v.validated, undefined),
    covered: clamp01(v.covered, undefined),
    grounded: !!v.grounded,
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// The test battery the judge AUTHORS. The external model doesn't only grade the local
// output — it sets the exam: a set of questions plus a gradeable rubric each answer is
// held to. Authoring the tests with the stronger model, then grading local answers against
// them, is how the judge's standard is distilled into the genome. Same transport, same
// budget — authoring spends API too.
const TESTS_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['tests'],
  properties: {
    tests: {
      type: 'array', description: 'evaluation cases',
      items: {
        type: 'object', additionalProperties: false, required: ['question', 'rubric', 'difficulty'],
        properties: {
          question: { type: 'string', description: 'a question answerable strictly from the passages' },
          rubric: { type: 'string', description: 'one line: what a correct, grounded answer must contain' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
      },
    },
  },
});

const AUTHOR_SYSTEM = [
  'You write evaluation cases for a small local model that answers strictly from provided passages.',
  'Given source PASSAGES, produce test cases: each a QUESTION answerable from the passages and a one-line RUBRIC stating what a correct, grounded answer must contain.',
  'Span the range: some easy (a single passage), some hard (synthesis across passages, or a claim the passages do NOT support so a good model abstains). Never ask what the passages cannot answer without marking the rubric "should abstain".',
  'Return the JSON only.',
].join('\n');

export const buildAuthorRequest = ({ passages = [], n = 5, model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const body = (passages || []).slice(0, 16)
    .map((s, i) => `[${i + 1}] ${typeof s === 'string' ? s : (s.text || s.quote || '')}`).join('\n') || '(none)';
  return Object.freeze({
    model, max_tokens: 1024, system: AUTHOR_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema: TESTS_SCHEMA } },
    messages: [{ role: 'user', content: `Write ${n} test cases from these PASSAGES:\n${body}` }],
  });
};

// usageOf — read the API response's own token accounting when present, else a cheap
// estimate (~4 chars/token) so the budget debits honestly even without usage fields.
const usageOf = (request, response) => {
  const u = response && response.usage;
  if (u && (u.input_tokens != null || u.output_tokens != null)) {
    return (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0);
  }
  const inChars = JSON.stringify(request || {}).length;
  const outChars = response && Array.isArray(response.content)
    ? response.content.reduce((s, b) => s + (b && b.text ? b.text.length : 0), 0) : 512 * 4;
  return Math.ceil(inChars / 4) + Math.ceil(outChars / 4);
};

// createJudge — the gated, BUDGETED grader + test-author. `call(requestBody) → Promise<response>`
// is the injected transport (a proxy to Claude); null → dry-run.
//
// THE JUDGE HAS ITS OWN BUDGET, separate from the organism's metabolic energy: the judge is
// external development scaffolding, and a per-turn API call must never silently burn spend.
// `budget` caps calls and/or tokens; when exhausted the judge goes dry-run (skips the API,
// returns null → fitness stays provisional) until refilled. So wiring the judge up can never
// run away with the API — the cap is the safeguard the essay's "for a while" needs to be safe.
export const createJudge = ({ model = JUDGE_MODEL, effort = 'low', call = null, enabled = false, budget = {} } = {}) => {
  let armed = !!enabled;
  const cap = typeof budget === 'number' ? { calls: budget } : { calls: 200, tokens: null, ...budget };
  let spentCalls = 0, spentTokens = 0;
  const lastRequests = [];

  const affordable = () => (cap.calls == null || spentCalls < cap.calls) && (cap.tokens == null || spentTokens < cap.tokens);
  const budgetState = () => Object.freeze({
    calls: { spent: spentCalls, cap: cap.calls ?? null, remaining: cap.calls == null ? null : Math.max(0, cap.calls - spentCalls) },
    tokens: { spent: spentTokens, cap: cap.tokens ?? null, remaining: cap.tokens == null ? null : Math.max(0, cap.tokens - spentTokens) },
    exhausted: !affordable(),
  });

  // send — the one metered path to the API. Enforces the budget BEFORE spending, debits AFTER.
  const send = async (request) => {
    lastRequests.push(request); if (lastRequests.length > 64) lastRequests.shift();
    if (!armed || typeof call !== 'function') return { response: null, reason: 'dry-run' };
    if (!affordable()) return { response: null, reason: 'budget-exhausted' };   // the safeguard: stop calling
    spentCalls += 1;
    try {
      const response = await call(request);
      spentTokens += usageOf(request, response);
      return { response, reason: 'ok' };
    } catch { return { response: null, reason: 'error' }; }   // an outage must not break the loop
  };

  return Object.freeze({
    // grade one turn against the standard. Async. null when not armed / out of budget / no answer.
    async grade({ question, answer, spans } = {}) {
      const { response } = await send(buildJudgeRequest({ question, answer, spans, model, effort }));
      return response ? parseVerdict(response) : null;
    },
    // author an evaluation battery from source passages. The judge sets the exam.
    async authorTests({ passages, n = 5 } = {}) {
      const { response } = await send(buildAuthorRequest({ passages, n, model, effort }));
      if (!response) return null;
      let v = response;
      if (Array.isArray(response.content)) { const t = response.content.find((b) => b && b.type === 'text'); if (t) { try { v = JSON.parse(t.text); } catch { return null; } } }
      return Array.isArray(v.tests) ? v.tests : null;
    },
    buildRequest: (turn) => buildJudgeRequest({ ...turn, model, effort }),
    requests: () => lastRequests.slice(),
    budget: budgetState,              // the API budget — read it in vitals so spend is visible
    affordable,
    refill(cals = 0, toks = 0) { spentCalls = Math.max(0, spentCalls - cals); spentTokens = Math.max(0, spentTokens - toks); return budgetState(); },
    arm(fn) { if (typeof fn === 'function') call = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    armed: () => armed,
    model,
  });
};
