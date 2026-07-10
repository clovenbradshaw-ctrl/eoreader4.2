// EO: EVA·INS·DEF(Void,Lens → Lens,Atmosphere, Making·Binding·Dissecting) — Claude as the user
// metabolism/challenger.js — put a frontier model in charge of output-SATISFACTION evaluation, and
// let it challenge the system the way a normal user would.
//
// judge.js grades FAITHFULNESS to a held source — decidable, but narrow: it rewards the clerk (well-
// grounded, never past the citation) and cannot see whether the answer actually HELPED. This module
// is the other anchor the essays reach for: a stand-in USER. Claude does two un-authored things the
// population cannot game because they sit outside it:
//   challenge()  — pose a realistic query the way a real user would: a genuine need, varied, sometimes
//                  hard or adversarial. "Doing what a normal user would be doing." Optionally grounded
//                  in foraged material (forage.js), so the challenge is about something real.
//   evaluate()   — score the answer's SATISFACTION in [0,1] as that user: did it resolve the need,
//                  was it usable, would the user come back — not merely was every clause groundable.
// The satisfaction score is the fitness anchor (fitness.js `validated`): the population evolves toward
// configurations whose output a demanding simulated user is satisfied by. It is the frontier judge as
// the environment — it selects by feeding and starving, and it NEVER touches a weight (the firewall).
//
// KEY NEVER IN THE TAB (same posture as judge.js / the claude backend): this module does not hold a
// key or call the network. It BUILDS messages and hands them to an injected `generate(messages) →
// string` — the `claude` model backend's phrase() with the user's own key, or a test stub, or a
// proxy. No generate / not armed / out of budget → dry-run: returns null, and the evolve loop falls
// back to its offline signal. A call budget caps spend so wiring Claude up can never run away.

export const CHALLENGER_MODEL = 'claude-opus-4-8';

// A normal user, made explicit: varied needs, real stakes, and a refusal to be impressed by fluent
// nonsense. The persona knob lets a pool sample different user types (a skeptic, a hurried skimmer,
// a domain expert), so the population is not selected against one taste alone.
const CHALLENGE_SYSTEM = [
  'You are a REAL USER of a document-reading assistant — not its author, not its cheerleader. Pose ONE question you would genuinely want answered.',
  'Behave like a normal user challenging the tool: ask what you actually need, sometimes something hard, ambiguous, or that the source may not fully support (a good tool will then say so).',
  'If given SOURCE material, ask about THAT material specifically. If not, ask a realistic standalone question.',
  'Return ONLY compact JSON: {"question": "...", "intent": "what you are really trying to accomplish, one line", "difficulty": "easy|medium|hard"}',
].join('\n');

const SATISFACTION_SYSTEM = [
  'You are the USER who asked the question. You are judging how well the assistant turned the SOURCES it retrieved into GROUNDED, FLOWING output — NOT whether those sources are true about the world.',
  'CRITICAL: do NOT fact-check against your own knowledge. You are not the oracle of reality here. If the retrieved sources are wrong or thin, that is not the assistant\'s fault to answer for. Judge ONLY what the assistant DID with what it found:',
  '  grounded  — is every claim in the answer supported by the provided SOURCES (not invented, not smuggled in from outside knowledge)? A confident claim the sources do not support is UNGROUNDED, however true it sounds.',
  '  flowing   — is the output readable, coherent prose (or a clean instance of whatever format was asked for), not a heap of disconnected fragments or quotes?',
  '  resolved  — does it actually address the question, and honestly say where the sources fall short (a faithful "the sources do not cover X" is a WIN, not a dodge)?',
  'Return ONLY compact JSON: {"grounded": 0.0-1.0, "flowing": 0.0-1.0, "satisfied": 0.0-1.0, "resolved": true|false, "critique": "one sentence — what would make it more grounded or better-formed"}',
  'satisfied is your overall read of the output\'s quality AS A RENDERING OF ITS SOURCES — grounded and well-formed and responsive.',
].join('\n');

// buildChallengeMessages / buildSatisfactionMessages — the exact message lists handed to generate().
// Pure and exported so a test pins the shape without a network.
export const buildChallengeMessages = ({ material = null, persona = null } = {}) => {
  const sys = persona ? `${CHALLENGE_SYSTEM}\nYour user type for this session: ${persona}.` : CHALLENGE_SYSTEM;
  const src = material ? `\n\nSOURCE (ask about this):\n${excerpt(material)}` : '';
  return [{ role: 'system', content: sys }, { role: 'user', content: `Pose your question now.${src}` }];
};

export const buildSatisfactionMessages = ({ question, answer, intent = null, sources = null, persona = null } = {}) => {
  const sys = persona ? `${SATISFACTION_SYSTEM}\nYour user type: ${persona}.` : SATISFACTION_SYSTEM;
  // the retrieved SOURCES are shown so grounding is judged against THEM (what the crawler got), not
  // against the evaluator's own knowledge. Absent → it can still judge flow/responsiveness.
  const src = sources ? `\n\nSOURCES THE ASSISTANT RETRIEVED (judge grounding against THESE, not your own knowledge):\n${excerpt(sources, 2400)}` : '';
  const body = `YOUR QUESTION:\n${question || '(none)'}${intent ? `\n\nWHAT YOU WANTED:\n${intent}` : ''}${src}\n\nTHE ASSISTANT'S ANSWER:\n${answer || '(no answer)'}\n\nHow well did it render its sources into grounded, flowing output?`;
  return [{ role: 'system', content: sys }, { role: 'user', content: body }];
};

// createChallenger — the gated, budgeted user-model. `generate(messages, opts) → Promise<string>`
// is the injected transport (the `claude` backend's phrase, a proxy, or a stub); null → dry-run.
export const createChallenger = ({ generate = null, enabled = false, budget = {}, model = CHALLENGER_MODEL, persona = null } = {}) => {
  let armed = !!enabled;
  const cap = typeof budget === 'number' ? { calls: budget } : { calls: 100, ...budget };
  let spentCalls = 0;

  const affordable = () => cap.calls == null || spentCalls < cap.calls;
  const budgetState = () => Object.freeze({ calls: spentCalls, cap: cap.calls ?? null, remaining: cap.calls == null ? null : Math.max(0, cap.calls - spentCalls), exhausted: !affordable() });

  // the one metered path — enforce the budget before spending, so Claude can never run away.
  const send = async (messages) => {
    if (!armed || typeof generate !== 'function') return null;
    if (!affordable()) return null;
    spentCalls += 1;
    try { return await generate(messages, { maxTokens: 400 }); }
    catch { return null; }   // an outage must not stall the evolve loop
  };

  return Object.freeze({
    // pose a realistic user challenge — optionally about foraged material. Returns null when dry-run.
    async challenge({ material = null, persona: lens = null } = {}) {
      const text = await send(buildChallengeMessages({ material, persona: lens ?? persona }));
      if (!text) return null;
      const v = parseJSON(text);
      if (!v || !v.question) return null;
      return Object.freeze({ question: String(v.question), intent: v.intent ? String(v.intent) : null, difficulty: v.difficulty || 'medium' });
    },
    // evaluate how well the answer RENDERS ITS SOURCES into grounded, flowing output — holding the
    // retrieved `sources` so grounding is judged against them, never the evaluator's own knowledge.
    // Returns { grounded, flowing, satisfied, resolved, critique } or null when dry-run.
    async evaluate({ question, answer, intent = null, sources = null, persona: lens = null } = {}) {
      const text = await send(buildSatisfactionMessages({ question, answer, intent, sources, persona: lens ?? persona }));
      if (!text) return null;
      const v = parseJSON(text);
      if (!v || (v.satisfied == null && v.grounded == null)) return null;
      const grounded = v.grounded != null ? clamp01(v.grounded) : null;
      const flowing = v.flowing != null ? clamp01(v.flowing) : null;
      // satisfied defaults to the mean of grounded+flowing when the model reported only the parts.
      const satisfied = v.satisfied != null ? clamp01(v.satisfied)
        : (grounded != null && flowing != null ? Math.round(((grounded + flowing) / 2) * 1000) / 1000 : clamp01(grounded ?? flowing));
      return Object.freeze({ grounded, flowing, satisfied, resolved: !!v.resolved, critique: v.critique ? String(v.critique).slice(0, 240) : null });
    },
    budget: budgetState,
    armed: () => armed,
    arm(fn) { if (typeof fn === 'function') generate = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    model,
  });
};

// runChallengeCycle — the loop, in one call: Claude poses a challenge, the SYSTEM UNDER EVOLUTION
// RESEARCHES and answers it, Claude scores how well it turned its RETRIEVED SOURCES into grounded,
// flowing output. `answerer(challenge)` returns the system's output — either a string, or
// `{ answer, sources }` where `sources` is what it actually retrieved (the web pages / spans it
// grounded on). The sources are handed to the evaluator so grounding is judged against THEM, never
// the evaluator's own knowledge — the goal is not "is the crawl true?" but "did EOReader render what
// it found into grounded, flowing prose?". Claude judges; it does not answer its own exam. The
// composite `satisfied` feeds fitness.observe as the un-authored `validated` anchor.
export const runChallengeCycle = async ({ challenger, answerer, material = null, persona = null } = {}) => {
  if (!challenger || typeof answerer !== 'function') return null;
  const ch = await challenger.challenge({ material, persona });
  if (!ch) return null;
  let answer = '', sources = null, trail = null, arrivals = null;
  try {
    const out = await answerer(ch);
    if (out && typeof out === 'object') { answer = out.answer ?? ''; sources = out.sources ?? null; trail = out.trail ?? null; arrivals = out.arrivals ?? null; }
    else { answer = out ?? ''; }
  } catch { answer = ''; }
  const sat = await challenger.evaluate({ question: ch.question, answer, intent: ch.intent, sources, persona });
  return Object.freeze({
    question: ch.question, intent: ch.intent, difficulty: ch.difficulty,
    answer: String(answer || ''), sources: sources || null, trail: trail || null,
    // the outcome fields fitness.observe consumes. The judge's grounded+flowing satisfaction
    // feeds `validated`; the answerer's arrival sequences ride as `arrivals` so metabolize
    // can grade the genome's predictions against the held-out world (`predicted` — the
    // truth seam), which OUTRANKS the judge's taste as the anchor when both are present.
    satisfaction: sat,                                  // { grounded, flowing, satisfied, resolved, critique } or null
    outcome: (sat || arrivals) ? Object.freeze({
      ...(sat ? { validated: sat.satisfied, covered: sat.resolved ? 1 : 0.5, grounded: sat.grounded != null ? Math.round(sat.grounded * 3) : undefined, claimed: sat.grounded != null ? 3 : undefined } : {}),
      ...(arrivals ? { arrivals } : {}),
      delivered: !!answer,
    }) : null,
  });
};

// ── helpers ───────────────────────────────────────────────────────────────────
const excerpt = (m, max = 1200) => { const t = typeof m === 'string' ? m : Array.isArray(m) ? m.map((x) => (typeof x === 'string' ? x : `${x?.title ?? ''} ${x?.text ?? x?.extract ?? ''}`)).join('\n\n') : (m?.text ?? `${m?.title ?? ''} ${m?.extract ?? ''}`); return String(t).slice(0, max); };
const clamp01 = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0);
// parseJSON — pull the first JSON object out of a model's reply (it may wrap it in prose or a fence).
const parseJSON = (text) => {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { /* fall through to extraction */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; } }
  return null;
};
