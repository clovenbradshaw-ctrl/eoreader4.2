// EO: DEF·EVA(Kind → Lens,Paradigm, Dissecting,Binding) — the three-questions fold
// terrain.js — the whole plain interface, spelled as arithmetic.
//
// The plain surface (docs, "eoreader — the plain version") shows the person exactly
// three questions when they click a highlighted thing, never more, never a menu, never
// a mode. This module is why that is *forced* rather than curated:
//
//   The person never chooses a terrain, because the thing they clicked already IS one.
//   A name is an Entity. An arrow is a Link. A quoted phrase is a Lens.
//
// A terrain sits in exactly one Domain (core/cube.js), and a Domain has exactly three
// operators — one per Mode (core/operators.js: operatorsByDomain returns 3). So the
// three questions are not a design choice; they are the three operators of the clicked
// thing's domain, wearing plain-English coats. Change the corpus, change the counts —
// never the count of questions. That is the restraint the person feels. It is
// `operatorsByDomain(domainOf(terrain)).length === 3`.
//
// This is a pure fold: (kind) → three addressed questions. No DOM, no state. The surface
// (surface.js) reads it to draw the popover; tests/plain-terrain.test.js pins that the
// three questions of a kind are EXACTLY the three operators of its domain — the §9 claim.

import { OPERATORS, operatorsByDomain } from '../../core/operators.js';
import { terrainInfo } from '../../core/cube.js';

// ── The three kinds of thing a person can click, and the one terrain each already is. ──
// name → Entity, connection → Link, idea → Lens. Everything else is derived: the domain
// from the terrain (core/cube), the three operators from the domain (core/operators).
export const KINDS = Object.freeze(['name', 'connection', 'idea']);

const TERRAIN_OF_KIND = Object.freeze({ name: 'Entity', connection: 'Link', idea: 'Lens' });

// The plain-English coat each operator wears in each domain, plus the stance the design
// (§9 of the plain-version doc) reads it under and a hint for whether it opens a card of
// its own. The label is the ONLY thing the person sees; op/terrain/stance are the address
// underneath, surfaced nowhere in the UI but pinned by the tests and used by the surface
// to route the click. Order within a kind follows the doc's popover, not the helix.
const QUESTIONS = Object.freeze({
  // A name is an Entity (Existence). Its three operators: SIG · INS · NUL.
  name: Object.freeze([
    Object.freeze({ op: 'SIG', terrain: 'Entity', stance: 'Binding',  label: 'Where does this come up?',    view: 'occurrences' }),
    Object.freeze({ op: 'INS', terrain: 'Entity', stance: 'Making',   label: 'Show me the actual ones',     view: 'instances' }),
    Object.freeze({ op: 'NUL', terrain: 'Void',   stance: 'Tending',  label: "What's never said about it",  view: 'blindspots' }),
  ]),
  // A connection is a Link (Structure). Its three operators: CON · SEG · SYN.
  connection: Object.freeze([
    Object.freeze({ op: 'CON', terrain: 'Link',    stance: 'Binding',    label: 'What else connects here?',   view: 'neighbors' }),
    Object.freeze({ op: 'SEG', terrain: 'Link',    stance: 'Dissecting', label: 'What does this split?',      view: 'split' }),
    Object.freeze({ op: 'SYN', terrain: 'Network', stance: 'Composing',  label: "What's the bigger picture?", view: 'picture' }),
  ]),
  // An idea is a Lens (Interpretation). Its three operators: DEF · EVA · REC.
  idea: Object.freeze([
    Object.freeze({ op: 'DEF', terrain: 'Lens',     stance: 'Dissecting', label: 'People mean different things by this', view: 'meanings' }),
    Object.freeze({ op: 'EVA', terrain: 'Lens',     stance: 'Binding',    label: 'Does it hold up?',                     view: 'holds' }),
    // The ✱ card no other tool has — a REC scan, one sentence of English (doc §4).
    Object.freeze({ op: 'REC', terrain: 'Paradigm', stance: 'Composing',  label: 'When people changed their minds',      view: 'shifts', star: true }),
  ]),
});

// The terrain a kind of thing already is (name → Entity, …), or null off-domain.
export const terrainOfKind = (kind) => TERRAIN_OF_KIND[kind] ?? null;

// The domain a kind sits in — derived, never chosen: the clicked thing IS a terrain, and
// a terrain sits in exactly one domain (core/cube.js). name → Existence, connection →
// Structure, idea → Interpretation.
export const domainOfKind = (kind) => {
  const info = terrainInfo(terrainOfKind(kind));
  return info ? info.domain : null;
};

// The three operator ids a domain affords — one per Mode. This is the arithmetic the
// whole interface leans on: exactly three, always three.
export const operatorsOfKind = (kind) => {
  const domain = domainOfKind(kind);
  return domain ? operatorsByDomain(domain).map((o) => o.id) : [];
};

// THE FOLD. A clicked thing of `kind` → its exactly-three questions, each an addressed
// operator wearing a plain-English label. `counts` optionally supplies the per-thing
// tallies the popover shows to the right of each question (the "12 / 7 / 3"); it maps a
// question `view` (or op) to a number. Missing counts are simply absent — never zero-
// padded, because a question with nothing behind it should read as blank, not as "0".
export const questionsFor = (kind, counts = {}) => {
  const base = QUESTIONS[kind];
  if (!base) return [];
  return base.map((q) => {
    const count = counts[q.view] ?? counts[q.op];
    const glyph = OPERATORS[q.op]?.glyph ?? '·';
    return Object.freeze({
      ...q,
      glyph,
      count: (typeof count === 'number') ? count : null,
    });
  });
};

// A one-line address for a question, in the cube's own idiom — SIG(Entity, Binding) —
// exactly the strings the plain-version doc's §9 "what it is" column lists. Surfaced
// nowhere the person can see; used by tests and by the audit trail if wired.
export const addressOf = (q) => `${q.op}(${q.terrain}, ${q.stance})`;
