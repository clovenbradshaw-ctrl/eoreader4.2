// EO: EVA(Lens,Atmosphere → Lens, Binding·Tending) — the hard-oracle witness audit, offline and budgeted
// The faithfulness axis of the judgment scoreboard (The Work v2 #1) — the one axis a
// deterministic check cannot cover: does the WITNESS a DEF carries, read against the WHOLE
// held source, actually earn the verdict? That question is a hard-oracle question (the source
// is the phenomenon — finite, held, decidable; metabolism/judge.js's line), so the auditor
// holds the complete document. And it is LEGITIMATE ONLY OFFLINE: a hard oracle in the live
// path is the exact stamp-with-no-grammar the DEF substrate exists to forbid. Here it grades
// the eval battery, nothing else.
//
// KEY NEVER IN THE TAB (judge.js discipline, verbatim): this module BUILDS Messages API
// request bodies and hands them to an injected `call` transport. No transport / not armed →
// dry-run: the request is formed and inspectable, nothing is sent, the audit returns nulls,
// and the deterministic score stands alone. The budget caps calls and tokens BEFORE spending;
// exhausted → dry until refilled. The oracle's own verdict is advisory beside the
// deterministic scoreboard — it never gates, it flags DEFs whose witness may not earn their
// verdict, for a human (or a later judge increment) to re-judge.

import { VERDICTS } from '../core/verdicts.js';
import { JUDGE_MODEL } from './judge.js';

export const ORACLE_MODEL = JUDGE_MODEL;

// The audit schema — a typed re-judgment, never a scalar: `supports` says whether the witness
// earns the verdict over the full source; `shouldBe` is the verdict the oracle would mint
// instead (one of the five, INDETERMINATE welcome); one sentence of rationale.
const AUDIT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['supports', 'shouldBe', 'rationale'],
  properties: {
    supports:  { type: 'boolean', description: 'does the witness, read against the WHOLE source, earn the verdict' },
    shouldBe:  { type: 'string', enum: Object.values(VERDICTS), description: 'the verdict the full source actually supports (indeterminate is a legitimate answer)' },
    rationale: { type: 'string', description: 'one sentence, no more' },
  },
});

const SYSTEM = [
  'You audit one JUDGMENT made by a small reading system. The judgment (a DEF) carries a typed VERDICT,',
  'the GRAIN it cut at, the SUBJECT it judged, and a WITNESS — the derivation that supposedly earned the verdict.',
  'You hold the COMPLETE source. Rule whether the witness, read against the WHOLE source, earns the verdict:',
  'a citation must actually predicate the claim, a reference verdict must match who the source is about,',
  'an absence verdict must survive a scan of everything the source does hold.',
  'INDETERMINATE is a legitimate verdict — a judgment that honestly suspends is well-shaped, not wrong;',
  'never mark a correct suspension unsupported. Return the JSON verdict only.',
].join('\n');

const txt = (s) => (typeof s === 'string' ? s : (s && (s.text || s.quote)) || '');

// buildWitnessAuditRequest — the exact Messages API body for one DEF's audit. Frozen,
// inspectable, sent nowhere by itself.
export const buildWitnessAuditRequest = ({ question, document = null, def, model = ORACLE_MODEL, effort = 'low' } = {}) => {
  const source = document != null
    ? `\n\nSOURCE (complete — you hold ALL of it):\n${txt(document)}`
    : '';
  const content = `QUESTION:\n${question || '(none)'}\n\nTHE JUDGMENT (DEF):\n`
    + `verdict: ${def?.verdict}\ngrain: ${def?.grain}\nsubject: ${def?.of}\n`
    + `witness: ${JSON.stringify(def?.witness ?? null)}${source}`;
  return Object.freeze({
    model,
    max_tokens: 512,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema: AUDIT_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
};

// parseWitnessAudit — pull the typed audit out of a Messages API response (parsed_output, a
// JSON text block, a JSON string, or an already-parsed object). Null when nothing parseable.
export const parseWitnessAudit = (res) => {
  if (!res) return null;
  let v = res;
  if (res.parsed_output && typeof res.parsed_output === 'object') v = res.parsed_output;
  else if (Array.isArray(res.content)) {
    const t = res.content.find((b) => b && b.type === 'text');
    if (t) { try { v = JSON.parse(t.text); } catch { return null; } }
  } else if (typeof res === 'string') { try { v = JSON.parse(res); } catch { return null; } }
  if (!v || typeof v !== 'object' || typeof v.supports !== 'boolean') return null;
  return Object.freeze({
    supports: !!v.supports,
    shouldBe: Object.values(VERDICTS).includes(v.shouldBe) ? v.shouldBe : null,
    rationale: typeof v.rationale === 'string' ? v.rationale.slice(0, 240) : null,
  });
};

// createDefOracle — the gated, budgeted auditor. `call(requestBody) → Promise<response>` is
// the injected transport; absent → dry-run, every audit null, every request kept inspectable.
// The budget is enforced BEFORE spending and debited AFTER (judge.js's send discipline).
export const createDefOracle = ({ model = ORACLE_MODEL, effort = 'low', call = null, enabled = false, budget = {} } = {}) => {
  let armed = !!enabled;
  const cap = typeof budget === 'number' ? { calls: budget, tokens: null } : { calls: 50, tokens: null, ...budget };
  let spentCalls = 0, spentTokens = 0;
  const lastRequests = [];

  const affordable = () => (cap.calls == null || spentCalls < cap.calls) && (cap.tokens == null || spentTokens < cap.tokens);
  const budgetState = () => Object.freeze({
    calls: { spent: spentCalls, cap: cap.calls ?? null },
    tokens: { spent: spentTokens, cap: cap.tokens ?? null },
    exhausted: !affordable(),
  });
  const usageOf = (request, response) => {
    const u = response && response.usage;
    if (u && (u.input_tokens != null || u.output_tokens != null)) {
      return (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0);
    }
    return Math.ceil(JSON.stringify(request || {}).length / 4) + 512;
  };
  const send = async (request) => {
    lastRequests.push(request); if (lastRequests.length > 64) lastRequests.shift();
    if (!armed || typeof call !== 'function') return null;
    if (!affordable()) return null;
    spentCalls += 1;
    try {
      const response = await call(request);
      spentTokens += usageOf(request, response);
      return response;
    } catch { return null; }   // an outage never breaks the battery
  };

  return Object.freeze({
    // audit — one typed re-judgment per DEF; nulls where dry / exhausted / unparseable.
    async audit({ question, document, defs = [] } = {}) {
      const out = [];
      for (const def of defs) {
        const response = await send(buildWitnessAuditRequest({ question, document, def, model, effort }));
        out.push(Object.freeze({ of: def?.of ?? null, verdict: def?.verdict ?? null, audit: response ? parseWitnessAudit(response) : null }));
      }
      return Object.freeze(out);
    },
    requests: () => lastRequests.slice(),
    budget: budgetState,
    affordable,
    arm(fn) { if (typeof fn === 'function') call = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    armed: () => armed,
    model,
  });
};
