// EO: DEF·SEG(Network,Void → Lens,Field, Dissecting,Binding) — the answer's typed frame
// organs/out/speech/schema.js — STRUCTURE, the structural sibling of shape.js's tonal FORM.
//
// shape.js (turn/) measures whether a draft READS like a `lookup` answer — its
// register, its move-grammar — and by law it NEVER gates: "form is a smoke alarm,
// taste is not refusable." That leaves a gap. The draft can read perfectly like a
// summary and still be shapeless as an ARTEFACT: a wall of prose with no named slots,
// a claim with no witness sitting beside a claim with three, nothing a surface can
// arrange and nothing an auditor can point at. Tone is measured; STRUCTURE is not.
//
// This module is the missing half. It is a BARE RENDERER (add-on 3 §1), symmetric with
// segment.js: segment.js cuts the model's murmur INTO candidate propositions; this
// arranges the propositions the enactor gate COMMITTED (enactor/gate.js runGate →
// `committed`, each pincited by enactor/ground/spans.js) into a typed FRAME. It does
// no judging — the gate already collapsed what the record witnesses; VOIDed the rest.
// It only decides WHERE each surviving claim lands, and renders the frame.
//
// Two laws, inherited from the faculties this sits between:
//
//   witnessed-or-absent (from the gate).  A slot is filled by a claim that carries a
//     witness (`sources` non-empty) or it is not filled at all. An unwitnessed claim
//     is DROPPED here exactly as the gate refuses to collapse an ungrounded
//     proposition — grounding is the SELECTION of speech, not a flag after it. There
//     is no "structured but unsourced" state: the frame cannot hold one.
//
//   unfillable-is-void (from answerability).  When a REQUIRED slot has no witnessed
//     claim to fill it, the frame does not degrade to a charming near-miss. It renders
//     the typed absence — the void verdict's own receipt when one was measured
//     (enactor/answer/void.js), else the fixed conscience token (enactor/gate.js
//     VOID_TOKEN). The "less interested in responding to any random thing" posture is
//     this law, made structural: an answer with nothing to seat is an absence, said
//     plainly, not a mood emitted to fill the turn.
//
// STRUCTURE stands ABOVE tone. A grounded `answer` frame has no "playful" variant and
// no "dry" one; those tonal intents (data/exemplars.jsonl) are not response KINDS, and
// they collapse out of the response space here — register, if it survives at all, is a
// thin post-filter over an already-seated frame, never a thing that decides what the
// frame holds. See docs/response-structure.md.
//
// Pure and model-free: no embedder, no backend, no DOM, no throw. Inert (returns null)
// when there is neither a claim to seat nor an absence to report — the caller keeps
// whatever path it was on, the same continuous degradation the router keeps.

import { VOID_TOKEN } from '../../../enactor/index.js';

// ── The cite, in the house format ────────────────────────────────────────────────
// `[s3]` for one witness, `[s3, s7]` for several — byte-identical to the mechanical
// answerers (enactor/answer/mechanical.js) so a schema-rendered line is indistinguish-
// able from a hand-mechanical one at the surface. Dedup + sort so a claim witnessed
// twice cites once, in reading order.
const citeOf = (sources) => {
  const xs = [...new Set((sources || []).filter((s) => Number.isInteger(s) && s >= 0))].sort((a, b) => a - b);
  return xs.length ? ` [${xs.map((s) => `s${s}`).join(', ')}]` : '';
};

// A claim is WITNESSED when it carries at least one real sentence index. This is the
// single gate the frame applies — the structural echo of the enactor gate's support
// factor (a claim the record cannot witness has support 0 and cannot collapse).
export const isWitnessed = (claim) =>
  !!claim && Array.isArray(claim.sources) && claim.sources.some((s) => Number.isInteger(s) && s >= 0);

// ── The schemas — one typed frame per cube task ───────────────────────────────────
// The four tasks are the register turn/intent.js already reads off the question as
// physics (its TASK_CUBE). Each task's FRAME is the slots a grounded answer of that
// kind seats its claims in, named by the cube cell the task occupies:
//
//   answer  · Existence × Figure → Entity      one fact at one place, one witness.
//   list    · Structure × Pattern → Network     a set of members, each witnessed.
//   explain · Interpretation × Figure → Lens    one figure read under a frame: the
//                                                figure, then the reasoning steps.
//   summary · Interpretation × Pattern → Paradigm  the whole read as one frame: the
//                                                framing claim, its supports, an
//                                                optional tension it must not smooth over.
//
// `card` is the slot's cardinality — 'one' (exactly one claim), 'many' (one or more),
// 'opt' (zero or one). `required` slots, unfilled, make the frame UNFILLABLE → void.
// The ~22 exemplar intents (data/exemplars.jsonl) map ONTO these four plus the void
// family (docs/response-structure.md §taxonomy): synthesis/notice-pattern → summary;
// connect-passages/expand-on-prior → explain; lookup → answer; and the stance moves
// (name-tension, correction-of-self) ride as the optional `tension` slot, not as their
// own free-form reply.
export const TASK_SCHEMA = Object.freeze({
  answer: Object.freeze({
    cube: 'Existence × Figure → Entity', level: 1,
    slots: Object.freeze([
      Object.freeze({ role: 'fact',     card: 'one', required: true }),
      Object.freeze({ role: 'reorient', card: 'opt', required: false }),
    ]),
  }),
  list: Object.freeze({
    cube: 'Structure × Pattern → Network', level: 2,
    slots: Object.freeze([
      Object.freeze({ role: 'member', card: 'many', required: true }),
    ]),
  }),
  explain: Object.freeze({
    cube: 'Interpretation × Figure → Lens', level: 3,
    slots: Object.freeze([
      Object.freeze({ role: 'figure', card: 'one',  required: true }),
      Object.freeze({ role: 'step',   card: 'many', required: true }),
    ]),
  }),
  summary: Object.freeze({
    cube: 'Interpretation × Pattern → Paradigm', level: 3,
    slots: Object.freeze([
      Object.freeze({ role: 'frame',   card: 'one',  required: true }),
      Object.freeze({ role: 'support', card: 'many', required: false }),
      Object.freeze({ role: 'tension', card: 'opt',  required: false }),
    ]),
  }),
});

export const isKnownTask = (task) => Object.prototype.hasOwnProperty.call(TASK_SCHEMA, task);

// Seat the witnessed claims into the task's slots. Claims may carry an explicit
// `role`; those that don't are seated positionally into the required slots in order
// (the first unfilled 'one'/'opt' slot, or the trailing 'many' slot). Unwitnessed
// claims never reach a slot — they are dropped and counted. Returns the filled slots
// (in schema order) and the drop count.
const seat = (schema, claims) => {
  const witnessed = [];
  let dropped = 0;
  for (const c of claims || []) {
    if (isWitnessed(c)) witnessed.push(c); else dropped++;
  }

  const bucket = new Map(schema.slots.map((s) => [s.role, []]));
  const roleSet = new Set(schema.slots.map((s) => s.role));
  const positional = [];
  for (const c of witnessed) {
    if (c.role && roleSet.has(c.role)) bucket.get(c.role).push(c);
    else positional.push(c);
  }

  // Positional fill: walk the slots, giving a 'one'/'opt' slot the next single claim
  // if still empty, and pouring the remainder into the first 'many' slot.
  const manySlot = schema.slots.find((s) => s.card === 'many');
  for (const s of schema.slots) {
    if (s.card === 'many') continue;
    if (bucket.get(s.role).length === 0 && positional.length) bucket.get(s.role).push(positional.shift());
  }
  if (manySlot && positional.length) bucket.get(manySlot.role).push(...positional);

  const slots = schema.slots.map((s) => {
    let claimsHere = bucket.get(s.role);
    if (s.card === 'one' || s.card === 'opt') claimsHere = claimsHere.slice(0, 1);   // 'one'/'opt' hold at most one
    return { role: s.role, card: s.card, required: s.required, filled: claimsHere.length > 0, claims: claimsHere };
  });
  return { slots, dropped };
};

// Is every REQUIRED slot filled? An unfilled required slot is the trigger for the
// unfillable-is-void law.
const requiredMet = (slots) => slots.every((s) => !s.required || s.filled);

// Render one claim as a sentence carrying its cite. The claim text is the raw
// proposition (no inline cite); the cite is appended in the house format.
const line = (claim) => `${String(claim.text || '').trim()}${citeOf(claim.sources)}`;

// Render the seated frame to prose — a faithful serialization of the structure, so a
// schema answer satisfies the same { route, text, sources } contract every mechanical
// answerer returns. A surface that wants richer layout reads `structure` instead
// (limner/, publish/); this text is the honest fallback.
const renderText = (task, slots) => {
  const bySlot = Object.fromEntries(slots.map((s) => [s.role, s.claims]));
  const join = (claims) => claims.map(line).join(' ');

  if (task === 'answer') {
    const fact = bySlot.fact?.[0];
    const reorient = bySlot.reorient?.[0];
    let t = line(fact);
    if (!/[.!?]$/.test(t.replace(/\s*\[s[^\]]*\]\s*$/, ''))) t += '.';
    if (reorient) t += ` ${line(reorient)}`;
    return t;
  }
  if (task === 'list') {
    const members = bySlot.member || [];
    if (members.length === 1) {
      let t = line(members[0]);
      if (!/[.!?]$/.test(t.replace(/\s*\[s[^\]]*\]\s*$/, ''))) t += '.';
      return t;
    }
    return members.map((m) => `- ${line(m)}`).join('\n');   // several members ⇒ a real list
  }
  if (task === 'explain') {
    const figure = bySlot.figure?.[0];
    const steps = bySlot.step || [];
    const head = line(figure).replace(/\s*$/, '');
    return `${/[.!?]$/.test(head.replace(/\s*\[s[^\]]*\]\s*$/, '')) ? head : head + '.'}${steps.length ? ' ' + join(steps) : ''}`;
  }
  // summary
  const frame = bySlot.frame?.[0];
  const supports = bySlot.support || [];
  const tension = bySlot.tension?.[0];
  let t = line(frame);
  if (!/[.!?]$/.test(t.replace(/\s*\[s[^\]]*\]\s*$/, ''))) t += '.';
  if (supports.length) t += ` ${join(supports)}`;
  if (tension) t += ` But ${line(tension)}`;
  return t;
};

// The typed-absence render — the unfillable-is-void law. Prefer the measured verdict's
// own receipt (enactor/answer/void.js renderAbsence produced `voidVerdict.text`); fall
// back to the fixed conscience token when no verdict was passed. Never reworded.
const renderVoid = (task, voidVerdict) => {
  const text = (voidVerdict && typeof voidVerdict.text === 'string' && voidVerdict.text.trim())
    ? voidVerdict.text.trim()
    : VOID_TOKEN;
  return Object.freeze({
    route: 'void',
    text,
    sources: [],
    structure: Object.freeze({
      task, void: true,
      slots: Object.freeze([]),
      dropped: 0,
      reason: 'a required slot had no witnessed claim to fill',
      receipt: voidVerdict?.void || null,
    }),
  });
};

// renderStructured — seat committed claims into the task's frame and render it, or
// report the typed absence.
//
//   task         one of TASK_SCHEMA's keys (turn/intent.js register). Unknown ⇒ inert.
//   claims       the enactor gate's committed propositions, each pincited:
//                { text: string, sources: number[], role?: string }. A claim with no
//                witness is DROPPED (never seated). Absent/empty ⇒ see voidVerdict.
//   voidVerdict  optional — the measured absence from enactor/answer/void.js
//                (its `text` + `void` receipt). Used only when the frame is unfillable.
//
// Returns { route, text, sources, structure } — the mechanical-answerer shape plus the
// machine-readable frame — or null when INERT (no witnessed claim AND no void verdict:
// nothing to seat, nothing measured to report, so the caller keeps its path).
export const renderStructured = ({ task, claims = [], voidVerdict = null } = {}) => {
  if (!isKnownTask(task)) return null;
  const schema = TASK_SCHEMA[task];

  const { slots, dropped } = seat(schema, claims);

  if (!requiredMet(slots)) {
    // Unfillable. Report the absence only if we have something to report — a measured
    // verdict, or at least one claim that was dropped for want of a witness (so the
    // silence is EARNED, not merely empty). A bare empty call with no verdict is inert.
    if (voidVerdict || dropped > 0) return renderVoid(task, voidVerdict);
    return null;
  }

  const rendered = slots.filter((s) => s.filled);
  const sources = [...new Set(rendered.flatMap((s) => s.claims.flatMap((c) => c.sources)))]
    .filter((s) => Number.isInteger(s) && s >= 0).sort((a, b) => a - b);

  return Object.freeze({
    route: 'structured',
    text: renderText(task, slots),
    sources,
    structure: Object.freeze({
      task,
      cube: schema.cube,
      level: schema.level,
      void: false,
      dropped,
      slots: Object.freeze(rendered.map((s) => Object.freeze({
        role: s.role, card: s.card,
        claims: Object.freeze(s.claims.map((c) => Object.freeze({
          text: String(c.text || '').trim(),
          sources: Object.freeze([...new Set(c.sources)].sort((a, b) => a - b)),
        }))),
      }))),
    }),
  });
};

// The invariant a caller (or a test) can assert on the machine-readable frame: every
// content slot of a non-void structure carries at least one witness. This is the
// witnessed-or-absent law, checkable — the property the free-prose path could not offer.
export const everySlotWitnessed = (structure) =>
  !!structure && (structure.void === true ||
    (Array.isArray(structure.slots) &&
     structure.slots.every((s) => s.claims.length > 0 &&
       s.claims.every((c) => Array.isArray(c.sources) && c.sources.length > 0))));

export { citeOf };
