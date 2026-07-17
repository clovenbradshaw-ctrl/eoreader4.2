// EO: DEF·SEG(Lens → Paradigm,Network, Dissecting,Unraveling) — the intent prompt + parse
// intents.js — Build mode's one model call. src/coder/build.js names its own
// input arrow plainly: "intents (a model's structured proposal — the one arrow
// that needs a model, kept a named seam)". Nothing in src/coder/ ever calls a
// model; this file is that seam, closed: a prompt that hands the model the
// CLOSED catalog vocabulary (never let it invent a surface) and the cube's own
// three faces, and a defensive parser that turns its reply into the `intents`
// array build() expects — or drops what it cannot parse, never throws into the
// pipeline. Widening the model's own contract (which ops/terrains/stances it
// may propose) is a matter for docs/model-as-contracted-part.md Move 1; this
// prompt already narrows it to exactly the coder's own алphabet, so a
// hallucinated tenth operator or a stray terrain is simply not part of the
// alphabet either face will keep — the mask (src/coder/mask.js) then makes
// anything left unsound unrepresentable at emission, so this file only has
// to be honest, not perfect.

import { CATALOG, SURFACE_NAMES, OP_IDS, FIELD_VOCAB } from '../../coder/index.js';

const catalogLines = () => SURFACE_NAMES
  .map((name) => {
    const c = CATALOG[name];
    return `  - ${name}: home terrains [${c.home.join(', ')}], ops [${c.ops.join(', ')}], stances [${c.stances.join(', ')}]`;
  })
  .join('\n');

// A room + the surface it hosts (tests/coder-pipeline.test.js "a coherent app
// ships ok") — the two `kind`s a first request almost always needs.
const EXAMPLE = JSON.stringify([
  {
    id: 'cases', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'case', terrain: 'Entity', stance: 'Making' }],
  },
  { id: 'case_board', kind: 'surface', surface: 'board', room: { terrains: ['Entity', 'Field'] } },
], null, 2);

export const INTENT_SYSTEM_PROMPT = `You propose EOT build intents for a small app inside eoreader4.2 — never source code, never prose. Respond with ONLY a JSON array of intents, nothing else (no markdown fence, no commentary).

Each intent is one of:
  { id, kind: "room", contract: { ops, terrains, stances }, events: [{ op, terrain, stance, id?, ref? }] }
  { id, kind: "surface", surface: <one name from the catalog below>, room: { terrains: [...] } }
  { id, kind: "app", contract: { ops, terrains, stances }, parts: [{ ops, terrains, stances }, ...] }

The closed vocabulary — use ONLY these values, never invent a new one:
  ops:      ${OP_IDS.join(', ')}
  terrains: ${FIELD_VOCAB.terrain.join(', ')}
  stances:  ${FIELD_VOCAB.stance.join(', ')}

The closed surface catalog — a "surface" intent's \`surface\` field must name one of these, and its \`room.terrains\` must include that surface's home terrains:
${catalogLines()}

A surface intent needs no other room the request didn't ask for; a room intent's contract should be the narrowest one that admits its own events. Keep the whole proposal small — usually 1 to 4 intents.

Example, for "a case-tracking board":
${EXAMPLE}`;

export const buildIntentMessages = (task = '') => [
  { role: 'system', content: INTENT_SYSTEM_PROMPT },
  { role: 'user', content: String(task || '').trim() || 'a minimal working app' },
];

// Strip a markdown fence if the model wrapped its JSON in one anyway.
const unfence = (s) => {
  const m = String(s || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
};

// The first balanced [...] run — the fallback when the model added a stray
// sentence before or after the array despite the instruction.
const firstArraySpan = (s) => {
  const start = s.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
};

const VALID_KINDS = new Set(['room', 'surface', 'app']);

// parseIntents(raw) -> { intents, dropped, error }
// Never throws. `intents` is the array to hand build(); `dropped` counts
// entries that were not even shaped like an intent (no id, or an unknown
// kind) — those never reach constrainedEmit at all, so a malformed line is a
// silent skip here rather than a crash three modules downstream. `error` is
// set only when nothing in the reply parsed as JSON at all.
export const parseIntents = (raw = '') => {
  const text = unfence(raw);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* try the fallback span */ }
  if (parsed == null) {
    const span = firstArraySpan(text);
    if (span) { try { parsed = JSON.parse(span); } catch { /* genuinely unparseable */ } }
  }
  if (!Array.isArray(parsed)) {
    return Object.freeze({ intents: Object.freeze([]), dropped: 0, error: 'the model\'s reply did not contain a JSON array' });
  }
  let dropped = 0;
  const intents = parsed.filter((it) => {
    const ok = it && typeof it === 'object' && typeof it.id === 'string' && it.id && VALID_KINDS.has(it.kind);
    if (!ok) dropped += 1;
    return ok;
  });
  return Object.freeze({ intents: Object.freeze(intents), dropped, error: null });
};
