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
  'You are the USER who asked the question, judging whether the assistant\'s ANSWER actually SATISFIED you.',
  'Score SATISFACTION, not mere grounding. A fluent answer that dodges your need is unsatisfying; a blunt answer that resolves it is satisfying; a correct "the source does not say" when it genuinely does not is satisfying, not a dodge.',
  'Judge: did it resolve my intent, is it usable and honest, would I trust it again. Be demanding but fair.',
  'Return ONLY compact JSON: {"satisfied": 0.0-1.0, "resolved": true|false, "critique": "one sentence — what would have satisfied me more"}',
].join('\n');

// buildChallengeMessages / buildSatisfactionMessages — the exact message lists handed to generate().
// Pure and exported so a test pins the shape without a network.
export const buildChallengeMessages = ({ material = null, persona = null } = {}) => {
  const sys = persona ? `${CHALLENGE_SYSTEM}\nYour user type for this session: ${persona}.` : CHALLENGE_SYSTEM;
  const src = material ? `\n\nSOURCE (ask about this):\n${excerpt(material)}` : '';
  return [{ role: 'system', content: sys }, { role: 'user', content: `Pose your question now.${src}` }];
};

export const buildSatisfactionMessages = ({ question, answer, intent = null, persona = null } = {}) => {
  const sys = persona ? `${SATISFACTION_SYSTEM}\nYour user type: ${persona}.` : SATISFACTION_SYSTEM;
  const body = `YOUR QUESTION:\n${question || '(none)'}${intent ? `\n\nWHAT YOU WANTED:\n${intent}` : ''}\n\nTHE ASSISTANT'S ANSWER:\n${answer || '(no answer)'}\n\nHow satisfied are you?`;
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
    // evaluate the answer's SATISFACTION as that user. Returns null when dry-run.
    async evaluate({ question, answer, intent = null, persona: lens = null } = {}) {
      const text = await send(buildSatisfactionMessages({ question, answer, intent, persona: lens ?? persona }));
      if (!text) return null;
      const v = parseJSON(text);
      if (!v || v.satisfied == null) return null;
      return Object.freeze({ satisfied: clamp01(v.satisfied), resolved: !!v.resolved, critique: v.critique ? String(v.critique).slice(0, 240) : null });
    },
    budget: budgetState,
    armed: () => armed,
    arm(fn) { if (typeof fn === 'function') generate = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    model,
  });
};

// runChallengeCycle — the loop, in one call: Claude poses a challenge, the SYSTEM UNDER EVOLUTION
// answers it, Claude scores satisfaction. `answerer(challenge) → Promise<string>` is the system's
// output (a local model configured by the champion genome — the frozen leaf the surfer works
// through; Claude judges, it does not answer its own exam). Returns the full record, or null if the
// challenger is dry-run. The satisfaction feeds fitness.observe as the un-authored `validated` anchor.
export const runChallengeCycle = async ({ challenger, answerer, material = null, persona = null } = {}) => {
  if (!challenger || typeof answerer !== 'function') return null;
  const ch = await challenger.challenge({ material, persona });
  if (!ch) return null;
  let answer = '';
  try { answer = await answerer(ch); } catch { answer = ''; }
  const sat = await challenger.evaluate({ question: ch.question, answer, intent: ch.intent, persona });
  return Object.freeze({
    question: ch.question, intent: ch.intent, difficulty: ch.difficulty,
    answer: String(answer || ''),
    satisfaction: sat,                                  // { satisfied, resolved, critique } or null
    // the outcome fields fitness.observe consumes — satisfaction IS the un-authored anchor.
    outcome: sat ? Object.freeze({ validated: sat.satisfied, covered: sat.resolved ? 1 : 0.5, delivered: !!answer }) : null,
  });
};

// ── helpers ───────────────────────────────────────────────────────────────────
const excerpt = (m) => { const t = typeof m === 'string' ? m : (m?.text ?? `${m?.title ?? ''} ${m?.extract ?? ''}`); return String(t).slice(0, 1200); };
const clamp01 = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0);
// parseJSON — pull the first JSON object out of a model's reply (it may wrap it in prose or a fence).
const parseJSON = (text) => {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { /* fall through to extraction */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; } }
  return null;
};
