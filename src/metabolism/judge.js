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

// TWO OBJECTS, TWO KINDS OF ACCESS (the EO line: phenomenon vs noumenon). The SOURCE TEXT
// and the TRUTH are different objects, and the judge's access must differ for each.
//
//  · FAITHFULNESS TO SOURCE is the phenomenon — finite, given, HELD, decidable. Whether a
//    claim binds to a span in a text you hold is checkable: you look. So on this axis the
//    judge is a HARD ORACLE and must see the WHOLE document, not just the spans the answer
//    cited. Two reasons full access is non-negotiable: (1) certifying a REFUSAL is a claim
//    about the entire document — you can only confirm an absence if you can see everything;
//    (2) lift needs a stable, complete reference — the bare and the with-surfer answer must
//    be scored against the SAME fixed ground, or the subtraction turns to noise. Blinding
//    the judge here does not add humility, it adds error. (buildJudgeRequest, below.)
//  · INTERPRETATION is the noumenon — what the sources MEAN, at the Pattern coordinate, held
//    by no finite process, the judge included. Here the judge does NOT play oracle: its
//    reading is DEFEASIBLE and CITE-OR-VETO, and meaning is judged by a PANEL whose
//    disagreement is kept as signal, never smoothed to one gold ruling. (buildInterpretationRequest.)

// The verdict schema — the judge returns scalars, never free-form prose that could drift.
// `validated` is the un-authored quality in [0,1]; `covered` guards the anti-dodge term;
// `grounded` is the hard-oracle faithfulness over the FULL source; `abstain` certifies a
// correct refusal (the answer withheld a claim the source genuinely cannot support).
const VERDICT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['validated', 'covered', 'grounded', 'rationale'],
  properties: {
    validated: { type: 'number', description: 'overall quality of the answer in [0,1]' },
    covered:   { type: 'number', description: 'fraction of the question actually resolved in [0,1] — a correct refusal resolves it' },
    grounded:  { type: 'boolean', description: 'is every asserted claim supported SOMEWHERE in the full source' },
    abstain:   { type: 'boolean', description: 'true iff the answer correctly withheld a claim the source cannot support' },
    rationale: { type: 'string', description: 'one sentence, no more' },
  },
});

const SYSTEM = [
  'You are an impartial grader for a small local model answering strictly from a source you hold in FULL.',
  'You hold the COMPLETE source. On groundedness you are a HARD ORACLE: check the ANSWER against the WHOLE source, not only the passages it happened to cite — a claim is grounded iff some span of the source supports it, whether or not the answer quoted that span.',
  'Because you can see all of it, you can certify a REFUSAL: if the answer withheld a claim or abstained, judge whether the source TRULY lacks support. A correct withholding is a WIN, not a dodge.',
  'Return the JSON verdict only:',
  '  validated — overall quality in [0,1]: correct, well-supported, responsive to the QUESTION (a correct abstention scores high).',
  '  covered   — in [0,1]: how much of what the QUESTION asked did the answer resolve — where the right move was to withhold, correctly withholding IS resolving it.',
  '  grounded  — true iff every ASSERTED claim is supported somewhere in the full SOURCE; an unsupported assertion makes it false.',
  '  abstain   — true iff the answer correctly declined a claim the source cannot support.',
  'Reward answers that are grounded AND responsive; never reward a thrifty non-answer where the source DID support an answer. Judge the answer, not its length. One sentence of rationale.',
].join('\n');

// buildJudgeRequest — the exact Messages API body for the hard-oracle faithfulness verdict.
// `document` is the COMPLETE source; when given it is handed to the judge in full (the whole
// point — do not blind the anchor). The answer's cited spans are shown too, as what the
// answer CHOSE, distinct from what the source makes available.
export const buildJudgeRequest = ({ question, answer, spans = [], document = null, model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const cited = (spans || []).slice(0, 8).map((s, i) => `[${i + 1}] ${txt(s)}`).join('\n') || '(none cited)';
  const source = document != null
    ? `\n\nSOURCE (complete — you hold ALL of it; rule on groundedness over the whole of it):\n${txt(document)}`
    : '';
  const content = `QUESTION:\n${question || '(none)'}\n\nANSWER:\n${answer || '(none)'}\n\nCITED PASSAGES (what the answer quoted):\n${cited}${source}`;
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
    abstain: v.abstain === undefined ? null : !!v.abstain,   // a certified correct refusal, or null if unscored
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// ── Interpretation: the noumenon, judged as a glass box (defeasible · cite-or-veto · plural) ──
// What the source MEANS is not decidable by any finite process, so the judge does NOT rule on it
// as an oracle (it is itself an LLM, and would confabulate the gold). It offers a DEFEASIBLE
// reading that must be grounded in a span of the held source or VETOED — cite-or-veto, the same
// discipline the surfer runs — and meaning is assessed by a PANEL whose disagreement is kept as
// SIGNAL, never smoothed to one gold number. On meaning the judge is auditable, not trusted.
const INTERP_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['reading', 'citation', 'veto', 'rationale'],
  properties: {
    reading:  { type: 'number', description: 'how well the answer reads the source\'s meaning, [0,1] — advisory, not gold' },
    citation: { type: 'string', description: 'a quoted span of the SOURCE that grounds this verdict; empty string if you cannot ground it' },
    veto:     { type: 'boolean', description: 'true if you cannot ground your reading in the source — the reading is then WITHDRAWN, not asserted' },
    rationale:{ type: 'string', description: 'one sentence showing the span you relied on' },
  },
});

const INTERP_SYSTEM = [
  'You assess whether a small model\'s ANSWER reads the meaning of a SOURCE you hold in full.',
  'You are NOT an oracle on meaning — no single reading is gold. Offer a DEFEASIBLE verdict and GROUND it: quote a span of the SOURCE that supports your judgement, or set veto=true to WITHDRAW it. A reading you cannot cite is not asserted.',
  'Where the source underdetermines the meaning, say so and lower your reading rather than inventing a gold answer. Return the JSON only.',
].join('\n');

// buildInterpretationRequest — one panelist's request. `persona` varies the lens, so a panel of
// them samples the interpretive SPREAD rather than one voice. The full source is handed over.
export const buildInterpretationRequest = ({ question, answer, document = null, persona = null, model = JUDGE_MODEL, effort = 'low' } = {}) => {
  const system = persona ? `${INTERP_SYSTEM}\nYour lens for this reading: ${persona}.` : INTERP_SYSTEM;
  const source = document != null ? `\n\nSOURCE (complete — you hold all of it):\n${txt(document)}` : '';
  return Object.freeze({
    model, max_tokens: 512, system,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema: INTERP_SCHEMA } },
    messages: [{ role: 'user', content: `QUESTION:\n${question || '(none)'}\n\nANSWER:\n${answer || '(none)'}${source}` }],
  });
};

// parseInterp — the defeasible reading. CITE-OR-VETO: a reading with no citation, or an explicit
// veto, is NOT asserted — it is withdrawn, and the panel counts it as a veto, not as a low score
// that would drag a mean down while masquerading as a judgement.
export const parseInterp = (res) => {
  const v = pickJSON(res);
  if (!v || (typeof v.reading !== 'number' && typeof v.veto !== 'boolean')) return null;
  const citation = typeof v.citation === 'string' ? v.citation.trim() : '';
  const veto = !!v.veto || citation === '';
  return Object.freeze({
    reading: Number.isFinite(+v.reading) ? Math.max(0, Math.min(1, +v.reading)) : null,
    citation: citation || null,
    veto,
    asserted: !veto && citation !== '' && Number.isFinite(+v.reading),
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// createPanel — meaning by many voices. Runs each judge's interpretation grader and KEEPS the
// disagreement: every verdict, the spread, the dissenters, the vetoes. `consensus` is a summary
// (median of the ASSERTED readings), never a replacement for the distribution it summarizes.
export const createPanel = ({ judges = [] } = {}) => Object.freeze({
  async assess({ question, answer, document } = {}) {
    const verdicts = [];
    for (const j of judges) {
      if (!j || typeof j.interpret !== 'function') continue;
      const v = await j.interpret({ question, answer, document });
      if (v) verdicts.push(v);
    }
    const asserted = verdicts.filter((v) => v.asserted).map((v) => v.reading);
    const consensus = asserted.length ? median(asserted) : null;
    const spread = asserted.length ? round(Math.max(...asserted) - Math.min(...asserted)) : 0;
    const vetoes = verdicts.filter((v) => !v.asserted).length;
    const dissent = consensus == null ? [] : verdicts
      .filter((v) => v.asserted && Math.abs(v.reading - consensus) >= 0.25)
      .map((v) => ({ reading: v.reading, rationale: v.rationale }));
    return Object.freeze({
      verdicts: Object.freeze(verdicts),        // every voice, kept — the distribution IS the result
      consensus, spread, dissent: Object.freeze(dissent),
      vetoes, n: verdicts.length,
      unanimous: verdicts.length > 0 && spread <= 0.1 && vetoes === 0,
    });
  },
});

// createJudgePool — rotation for the moving target (Van Valen). A pool of ANCHORED judges; each
// period draws a sliding, deterministic window (no RNG, replay-stable), so the panel changes
// period to period and the surfer cannot overfit a fixed evaluator — yet every judge in it still
// HOLDS THE FULL SOURCE, so every position on the moving target stays true. Move it, don't blind it.
export const createJudgePool = ({ pool = [], size = 3 } = {}) => {
  if (!Array.isArray(pool) || pool.length === 0) throw new TypeError('createJudgePool: need a non-empty pool of judges');
  const window = (period, n) => {
    const k = Math.max(1, Math.min(n ?? size, pool.length));
    const start = ((period % pool.length) + pool.length) % pool.length;
    return Array.from({ length: k }, (_, i) => pool[(start + i) % pool.length]);
  };
  return Object.freeze({
    rotate: (period = 0, n = size) => window(period, n),
    panel: (period = 0, n = size) => createPanel({ judges: window(period, n) }),
    size: () => pool.length,
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
export const createJudge = ({ model = JUDGE_MODEL, effort = 'low', call = null, enabled = false, budget = {}, persona = null } = {}) => {
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
    // grade one turn against the standard — the HARD-ORACLE faithfulness verdict. Pass the full
    // `document` so groundedness is judged over the whole source and a refusal can be certified.
    // Async. null when not armed / out of budget / no answer.
    async grade({ question, answer, spans, document } = {}) {
      const { response } = await send(buildJudgeRequest({ question, answer, spans, document, model, effort }));
      return response ? parseVerdict(response) : null;
    },
    // interpret one turn — the DEFEASIBLE, cite-or-veto reading (a panelist). Meaning, glass-box.
    async interpret({ question, answer, document, persona: lens } = {}) {
      const { response } = await send(buildInterpretationRequest({ question, answer, document, persona: lens ?? persona, model, effort }));
      return response ? parseInterp(response) : null;
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

// ── helpers ───────────────────────────────────────────────────────────────────
const txt = (s) => (typeof s === 'string' ? s : (s && (s.text || s.quote)) || '');
const round = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => { const a = xs.slice().sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : round((a[m - 1] + a[m]) / 2); };
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
