// EO: DEF·SEG(Lens → Paradigm,Network, Dissecting,Unraveling) — plan/code/fix prompts + parse
// code-prompts.js — the three model calls the Code tab's loop makes, and the
// defensive parse on each reply. Mirrors intents.js's discipline exactly
// (narrow prompt, never trust the shape back, never throw into the caller)
// applied to a different output alphabet: a short feature plan, then a single
// self-contained runnable document, then the same document corrected against
// real console/error output the sandbox actually observed.

// ── Plan ─────────────────────────────────────────────────────────────────

export const PLAN_SYSTEM_PROMPT = `You plan a single self-contained web app or script before it is written — never the code itself yet. Respond with ONLY a JSON object, nothing else (no markdown fence, no commentary):

{ "summary": "one sentence naming what this builds", "features": ["...", "..."], "checks": ["...", "..."] }

"features" is an ordered checklist of what the implementation must include (3 to 7 short items — the actual steps, in the order they should be built). "checks" is a short list of concrete, observable behaviors that prove it works once it runs (what a person should be able to see or click). Keep both lists short and specific to the request.`;

export const buildPlanMessages = (task = '') => [
  { role: 'system', content: PLAN_SYSTEM_PROMPT },
  { role: 'user', content: String(task || '').trim() || 'a small useful web app' },
];

const unfence = (s) => {
  const m = String(s || '').match(/```(?:json|html?)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
};

const firstObjectSpan = (s) => {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
};

// parsePlan(raw) -> { plan, error }. Never throws. `plan` is null when the
// reply carried nothing shaped like a plan; `error` names why.
export const parsePlan = (raw = '') => {
  const text = unfence(raw);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* try the fallback span */ }
  if (parsed == null) {
    const span = firstObjectSpan(text);
    if (span) { try { parsed = JSON.parse(span); } catch { /* genuinely unparseable */ } }
  }
  const features = Array.isArray(parsed?.features) ? parsed.features.map(String).filter(Boolean) : [];
  if (!parsed || typeof parsed !== 'object' || !features.length) {
    return { plan: null, error: 'the model\'s reply did not contain a usable plan' };
  }
  const checks = Array.isArray(parsed.checks) ? parsed.checks.map(String).filter(Boolean) : [];
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  return { plan: Object.freeze({ summary, features: Object.freeze(features), checks: Object.freeze(checks) }), error: null };
};

// ── Code (first draft, and the fix retry) ───────────────────────────────────

const CODE_RULES = `Write ONE complete, self-contained, runnable HTML document. Inline all CSS and JS directly in the document — no external requests, no imports, no build step, no placeholders or TODOs. Respond with ONLY the code, in a single \`\`\`html fenced block and nothing else.`;

export const buildCodeMessages = (task, plan) => [
  { role: 'system', content: CODE_RULES },
  { role: 'user', content: `Task: ${task}\n\nPlan:\n${planAsText(plan)}\n\nWrite the document now.` },
];

// buildFixMessages — the retry: the failing document plus what the sandbox
// actually observed when it ran, so the correction targets the real fault
// rather than a re-guess from the plan alone.
export const buildFixMessages = (task, plan, prevCode, errors) => [
  { role: 'system', content: CODE_RULES },
  { role: 'user', content: `Task: ${task}\n\nPlan:\n${planAsText(plan)}\n\nYour previous document:\n\`\`\`html\n${prevCode}\n\`\`\`\n\nWhen it ran, the console reported these errors:\n${errors.map((e) => `- ${e.text}`).join('\n')}\n\nFix them and return the complete corrected document the same way.` },
];

const planAsText = (plan) => plan
  ? [plan.summary, ...plan.features.map((f) => `- ${f}`)].filter(Boolean).join('\n')
  : '(no plan — build from the task alone)';

// parseCodeBlock(raw) -> string. Never throws, never returns null — a reply
// with no fence at all is still handed back trimmed, so the sandbox verify
// step has something concrete to fail honestly against rather than nothing
// to run at all.
export const parseCodeBlock = (raw = '') => {
  const m = String(raw || '').match(/```(?:html?)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : raw).trim();
};
