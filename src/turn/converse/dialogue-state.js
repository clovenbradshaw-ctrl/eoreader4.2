// EO: EVA·DEF·SIG(Field,Entity → Lens,Paradigm, Dissecting,Binding,Tracing) — dialogue state / operator-addressed resolver
// Dialogue state — the conversation read as a reading-line, addressed in the nine
// operators (docs/operators.md). This is NOT a new ontology bolted onto the side: it is
// the same genome the document reading already speaks, turned on the turns. A turn is an
// event; the conversation is its projection; the state is read off it at read time.
//
// The completeness is by construction. Every turn resolves to one of the nine operators,
// so there is no dialogue-state element that is not already an operator — the failure the
// hand-picked-ledger sketch had (it dropped REC, and it had no name for the stalled turn)
// cannot recur, because the vocabulary is closed.
//
//                Existence            Structure          Interpretation
//   Differentiate NUL  hold/stall     SEG  re-split       DEF  settled fact  → common ground
//   Relate        SIG  attribute      CON  bond (coref)   EVA  open question → open intent
//   Generate      INS  referent in    SYN  the fold       REC  learned rule  → conventions
//
// The Interpretation column is what the two minds HOLD — common ground (firm DEF), open
// intent (un-collapsed EVA), and the conventions the thread has taught (REC). The
// Existence/Structure columns are the referential substrate it is about — and NUL, the
// hold/stall, is where the audit conversation died: "he … surveillance" is an INS that
// should CON-bind to the warm figure but stalls; "find what I'm talking about" is a turn
// that is PURE NUL — it points back at an unresolved referent and carries no Figure of its
// own. The old retrieval path had no representation for NUL, so a stalled reference fell
// through to literal token retrieval and matched "Find a Song by Lyrics". Naming the
// operator is the fix: a NUL turn resolves against the open intent and the warm referent,
// never against its own deictic words.
//
// Two provenance channels (docs/conversational-provenance.md): the USER side and the
// SYSTEM side. "What the user knows vs what the system knows" is this axis, not a new
// store. The DELTA is the surprise between the two readings — a user-side EVA the system
// has not grounded to a firm DEF — anchored on the warm CON figure. That is the operative
// target of a turn: not its literal words, the gap it is trying to close.

import { contentWords, needsContext, conversationalFocus } from './focus.js';
import { conversationCast } from './reference.js';

// ── Operator vocabulary (the Interpretation/Existence cells a USER turn can realize) ──
// A turn's illocutionary act, read as one operator. Only the cells a single user turn can
// land in appear here; CON/SYN/INS are read off the cast and the fold, not classified.
export const OP = Object.freeze({
  EVA: 'EVA',   // opens a frame to evaluate — a question seeking new ground → open intent
  SIG: 'SIG',   // asks an attribute OF the warm figure ("his name") — leans on the referent
  DEF: 'DEF',   // the user asserts a fact — a settled definition, their side
  SEG: 'SEG',   // a correction / redirect ("no, the musician") — re-splits the last frame
  NUL: 'NUL',   // a hold/stall — confusion, an evidence demand, a pure deictic with no Figure
});

// A correction opener — re-splits (SEG) the prior frame rather than posing a new one.
const CORRECTION = /^\s*(?:no|nope|nah|not|actually|rather|wait|i\s+mean(?:t)?)\b/i;
// A pure confusion / continuation marker — a NUL hold that asks to re-tread the prior turn.
const CONFUSION = /^\s*(?:huh|eh|hmm+|wat|what|sorry|pardon|come\s+again|really|meaning|how\s+so|in\s+what\s+way|wait(?:,?\s+what)?|say\s+(?:that\s+)?again|i\s+don'?t\s+(?:get|understand)(?:\s+(?:it|that))?)\s*[?!.…]*\s*$/i;
// An evidence demand on the prior answer ("prove it") — a NUL when it carries no query.
const EVIDENCE = /^\s*(?:prove|justify|substantiate|verify|cite|source|defend|demonstrate|back\s+(?:it|that|this)\s+up)\b/i;
// A turn ABOUT the talker's own prior statement — "what do you mean…", "you said…". Even
// when it quotes a topic term ("…first round"), the term is the prior ANSWER's, not new
// ground the user is opening: it is a NUL hold asking the system to re-tread what it said.
const ABOUT_PRIOR = /\byou\b(?:'re)?(?:\s+(?:are|were|just|had|have|keep|kept|did|do|been))?\s+(?:said|say|saying|says|asked|told|mention(?:ed|ing)?|answered|wrote|claim(?:ed|ing)?|mean(?:t|ing|s)?|stat(?:e|ed|ing)|insist(?:ed|ing)?|referring|talking|telling)\b/i;
// A third-person pronoun whose antecedent is back in the conversation, not the question.
const PRONOUN = /\b(he|him|his|she|her|hers|it|its|they|them|their|theirs)\b/;
const PRONOUN_TOKENS = new Set('he him his she her hers it its they them their theirs'.split(' '));
// Generic attribute nouns — the kind of thing asked ABOUT a referent (the SIG case).
const ATTRIBUTE = new Set((
  'name names age job jobs role roles title titles occupation profession identity ' +
  'gender nationality deal story point problem problems issue issues'
).split(/\s+/));

// REFERENCE verbs and DEICTICS — the surface of a turn that is ABOUT the conversation
// rather than about a topic. "find what I'm talking about", "show me that", "you know
// what I mean" — the content words survive the stop list (find, talking, show) yet name
// no topic. This is the hole the old needsContext fell through: it judged such a turn
// self-contained because a non-stopword token remained, and retrieved on it literally.
const REFERENCE_VERB = new Set((
  'find show point tell remind locate get bring pull mean meant talk talking talked ' +
  'say saying said ask asking asked refer referring reference look looking pointing want ' +
  'know knows knew'
).split(/\s+/));
const DEICTIC = new Set('what that this it those these thing things one ones about of'.split(/\s+/));

// An imperative REQUEST opener — the user asks for new ground (an EVA), not asserts a fact.
const REQUEST = /^\s*(?:summari[sz]e|explain|describe|list|define|outline|compare|contrast|analy[sz]e|elaborate|expand|clarify|recap|walk\s+me|break\s+(?:it|this|that)\s+down)\b/i;
// A declarative ASSERTION cue — the user offers something as fact (a DEF on their side).
const ASSERTION = /^\s*(?:i\s+(?:think|believe|feel|guess|reckon|assume|suspect|claim|know)\b|i'?d\s+say\b|in\s+my\s+(?:view|opinion)\b|imo\b|actually,|that'?s\b|this\s+is\b|it'?s\b|the\b.+\b(?:is|are|was|were)\b)/i;

// The topic-bearing words of a turn once REFERENCE verbs and deictics are also removed —
// what the turn is actually ASKING ABOUT, beyond the act of asking. Empty ⇒ the turn
// names no topic of its own and must lean on the conversation (a NUL stall).
const topicWords = (q) => contentWords(q).filter(t => !REFERENCE_VERB.has(t) && !DEICTIC.has(t) && !PRONOUN_TOKENS.has(t));

// A referential STALL: the turn carries no topic of its own — every content word is a
// reference verb or a deictic. "find what I'm talking about" → [find, talking] → []. This
// is the NUL that the literal-retrieval path turned into a song search.
export const isReferentialStall = (q) => {
  const cw = contentWords(q);
  if (cw.length === 0) return false;                         // empty handled by needsContext
  return topicWords(q).length === 0;
};

// ── classifyTurn — the operator a single USER turn realizes ──────────────────────────
// Returns { op, needsReferent, topic }. `needsReferent` is the CON the turn leaves open —
// a pronoun or a stall whose subject lives in the cast, not the question, so the retrieval
// query must be anchored on the warm figure. `topic` is its own topic words (may be empty).
export const classifyTurn = (question) => {
  const q = String(question || '').toLowerCase().trim();
  const topic = topicWords(q);

  // NUL holds that must win over a SEG correction: pure confusion ("wait, what?", "huh?")
  // and a bare continuation with no content word at all ("now?", "go on", "why?"). These
  // carry no topic of their own, so they are holds on the prior turn, never redirects.
  if (CONFUSION.test(q) || contentWords(q).length === 0)
    return { op: OP.NUL, needsReferent: true, topic };

  // SEG — a correction that redirects the last frame (carrying a possibly-new referent),
  // when its own tail carries no query of its own ("no, the musician").
  const corr = q.match(CORRECTION);
  if (corr && contentWords(q.slice(corr[0].length)).length <= 1)
    return { op: OP.SEG, needsReferent: true, topic };

  // NUL — the remaining holds: a clarification of the talker's prior statement ("what do you
  // mean first round?" — it quotes the prior answer, it does not open new ground), a bare
  // evidence demand ("prove it"), or a pure deictic with no Figure ("find what I'm about").
  const ev = q.match(EVIDENCE);
  if (ABOUT_PRIOR.test(q) ||
      (ev && contentWords(q.slice(ev[0].length)).length <= 1) ||
      isReferentialStall(q))
    return { op: OP.NUL, needsReferent: true, topic };

  // SIG — a pronoun whose only topic words are generic attributes ("what is his name?").
  if (PRONOUN.test(q) && topic.length > 0 && topic.every(t => ATTRIBUTE.has(t)))
    return { op: OP.SIG, needsReferent: true, topic };

  // A standalone question that nonetheless leads with an unbound pronoun ("how has HE been
  // criticized…") is an EVA with an open CON: the topic stands, but the subject points back.
  if (PRONOUN.test(q) && topic.length > 0)
    return { op: OP.EVA, needsReferent: true, topic };

  const isQuestion = /\?\s*$/.test(q) || /^(who|what|when|where|why|how|which|whose|whom|is|are|was|were|do|does|did|can|could|would|will|should|has|have|had)\b/.test(q);
  if (!isQuestion) {
    // An imperative REQUEST ("summarize the document", "explain X", "list the operators")
    // is an EVA — the user is asking for new ground, not asserting a fact.
    if (REQUEST.test(q)) return { op: OP.EVA, needsReferent: PRONOUN.test(q), topic };
    // DEF — a declarative the user offers as fact, with an explicit assertion cue ("I think
    // …", "the mayor is …"). Only a clear assertion is a DEF; a bare topic phrase defaults
    // to EVA below (safer — a fragment is far likelier a request than a claim).
    if (ASSERTION.test(q) && topic.length > 0)
      return { op: OP.DEF, needsReferent: PRONOUN.test(q), topic };
  }

  // EVA — the default: an open question (or request) seeking new ground.
  return { op: OP.EVA, needsReferent: PRONOUN.test(q), topic };
};

// An ABSENCE reply — the system reading came up empty. A user EVA whose answer is an
// absence is NOT settled: it stays an open intent (this is exactly the audit's surveillance
// turn, answered "I couldn't find any information"). Matches the honest-frame absence
// wordings (model/prompt.js) and the explicit unbound tag the pipeline sets.
const ABSENCE = /\b(could\s?n'?t find|did\s?n'?t? find|no information|not (?:covered|in the (?:reading|document|source))|does\s?n'?t (?:cover|say|mention)|nothing (?:came to mind|in the)|didn'?t come to mind|don'?t (?:have|see) (?:any|that)|unable to find)\b/i;
const isAbsenceReply = (m) =>
  !!(m && (m.unbound || ABSENCE.test(String(m.content || ''))));

// The first content phrase of a turn, for a compact intent label.
const brief = (s, n = 90) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…';
};

// ── dialogueState — read the whole conversation into operator-addressed state ─────────
// history: [{role, content, unbound?}]; question: the live (not-yet-in-history) turn.
// Returns the state held between the two minds, plus the live turn's operator and the
// DELTA it should close. Best-effort on the cast (a parse failure degrades to no referent,
// never throws — retrieval still has the topic channel).
export const dialogueState = (history = [], question = '') => {
  const msgs = (Array.isArray(history) ? history : []).filter(m => m && m.content);

  // The open intents and common ground, walked over USER turns paired with their reply.
  const openIntents = [];
  const commonGround = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const cls = classifyTurn(m.content);
    if (cls.op !== OP.EVA && cls.op !== OP.SIG && cls.op !== OP.DEF) continue; // NUL/SEG retarget, don't open
    const reply = msgs.slice(i + 1).find(x => x.role === 'assistant');
    const settled = !!reply && !isAbsenceReply(reply);
    const item = { turnIdx: i, op: cls.op, topic: cls.topic, text: brief(m.content) };
    if (cls.op === OP.DEF || settled) commonGround.push(item);
    else openIntents.push(item);                                              // EVA/SIG unsettled
  }

  // The warm figure the conversation is on — the active referent (the CON the cast holds).
  let activeReferent = null;
  try {
    const cast = conversationCast(history, question);
    if (cast && cast.length) activeReferent = { id: cast[0].id, label: cast[0].label, mass: cast[0].mass };
  } catch { /* parse failed — no referent; the topic channel still carries the turn */ }

  // The live turn and the gap it closes. A NUL/SEG points back at the most recent open
  // intent (the delta proper); an EVA/SIG with an open CON anchors on the warm referent;
  // a self-standing turn is its own target.
  const current = classifyTurn(question);
  const lastOpen = openIntents.length ? openIntents[openIntents.length - 1] : null;
  let delta;
  if (current.op === OP.NUL || current.op === OP.SEG)
    delta = { kind: current.op === OP.NUL ? 'stall' : 'redirect', intent: lastOpen, referent: activeReferent };
  else if (current.needsReferent)
    delta = { kind: 'anchored', intent: { topic: current.topic, text: brief(question) }, referent: activeReferent };
  else
    delta = { kind: 'standalone', intent: { topic: current.topic, text: brief(question) }, referent: null };

  return { current, openIntents, commonGround, activeReferent, delta };
};

// ── groundedThread — the conversation block for the grounded prompt ───────────────────
// Splits the prior turns into what is SETTLED (firm DEF — common ground the user already
// holds) and what is still OPEN (un-collapsed EVA). The grounded prompt restates a settled
// fact every turn because the bare "You asked: …" thread reads as a checklist; naming the
// settled ground as already-held — build on it, don't repeat it — is the suppression cue
// the closing clause alone never enforced. Only the user's own question text rides here,
// never the talker's answers (the firewall holds): the block says WHAT is settled, never
// re-feeds the reply the model would anchor on. Deduped, recency-capped.
export const groundedThread = (history = [], question = '', { maxSettled = 4, maxOpen = 4 } = {}) => {
  const st = dialogueState(history, question);
  const uniq = (xs) => [...new Set(xs)];
  return {
    settled: uniq(st.commonGround.map(i => i.text)).slice(-maxSettled),
    open:    uniq(st.openIntents.map(i => i.text)).slice(-maxOpen),
  };
};

// ── resolveQuery — the EO-native retrieval query, anchored on the delta ───────────────
// The drop-in replacement for converse/focus.js's resolveRetrievalQuery. A self-standing
// EVA passes through (never pollute a strong query). A turn with an open CON (pronoun, or a
// stall) is anchored on the open intent's topic and the warm referent — so "find what I'm
// talking about" retrieves the open surveillance question and the figure it is about, and
// "how has he…" carries the warm subject instead of dropping it.
//   The witness discipline (reference.js §7): the user's own words and the OPEN-INTENT topic
// (user-side only) always feed this; the warm referent is read off the cast, which is warmed
// by both roles — so a figure the talker NAMED in a BOUND reply can ride as a retrieval
// anchor (a referent, not a claim — it is grounded in the document, and it sharpens the
// search). What never rides is the answer's propositional CONTENT, and an UNBOUND reply
// contributes nothing to the cast at all (it is filtered before the parse). So the only
// talker influence is which grounded figure is in focus — never a claim the model could
// anchor a wrong fact on. That is the poisoning channel, and it stays closed.
export const resolveQuery = (question, history = []) => {
  const q = String(question || '');
  const st = dialogueState(history, question);
  const parts = [q];
  const add = (s) => { const t = String(s || '').trim(); if (t) parts.push(t); };

  if (st.current.op === OP.NUL || st.current.op === OP.SEG) {
    // The stall/redirect carries no topic — resolve it to the open intent it points at,
    // then the warm referent. With neither, fall back to the conversation's focus terms.
    if (st.delta.intent?.topic?.length) add(st.delta.intent.topic.join(' '));
    if (st.activeReferent) add(st.activeReferent.label);
    if (parts.length === 1) { const f = conversationalFocus(history); if (f.length) add(f.join(' ')); }
  } else if (st.current.needsReferent && st.activeReferent) {
    // An EVA/SIG with an open CON: keep its own topic, bind the dangling subject.
    add(st.activeReferent.label);
  } else if (needsContext(q)) {
    // Thin but not classified above — preserve the legacy vocabulary-bag continuity.
    const f = conversationalFocus(history); if (f.length) add(f.join(' '));
  }
  return parts.join(' ');
};

// ── discourseFrame — the discourse read a retrieval-PROMPT builder needs ───────────────
// A search prompt (one query, or a fan-out of research angles) is discourse-aware when it is
// written against WHO the conversation is on and WHAT it left open — not the latest sentence in
// isolation. This packages that read once, so every prompt builder (formulateSearchQuery,
// modelPlanner) anchors identically:
//   resolved   the deterministically discourse-anchored query (resolveQuery) — the no-model answer,
//              a pronoun/stall already bound to its subject ("who is making it?" → "…the figure")
//   subject    the warm referent the conversation is on (the cast's held figure), '' if none
//   open       the open intent the turn left dangling (its brief text), '' if none
// The answer firewall holds: `subject` is a grounded referent LABEL and `open` is the user's own
// question text — never the talker's claims. Best-effort: a parse fault degrades to the raw turn
// with no subject/open, never throws — a prompt builder can always lean on `resolved`.
export const discourseFrame = (question = '', history = []) => {
  const base = String(question || '').trim();
  try {
    const st = dialogueState(history, base);
    const resolved = resolveQuery(base, history).replace(/\s+/g, ' ').trim() || base;
    const subject = st.activeReferent?.label ? String(st.activeReferent.label).trim() : '';
    const open = st.openIntents?.length ? String(st.openIntents[st.openIntents.length - 1].text || '').trim() : '';
    return { resolved, subject, open };
  } catch { return { resolved: base, subject: '', open: '' }; }
};
