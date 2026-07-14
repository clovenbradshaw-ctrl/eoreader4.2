// EO: SYN·DEF(Network → Kind, Composing,Unraveling) — the invariant nine-operator spine
// The spine every article shares, at every terrain (docs/terrain-typed-templates.md §2).
// Nine slots, one per operator. The terrain profiles (terrains.js) differ only in what
// each slot's SECTION contains, what it is called, and where it renders — never in the
// slots themselves. That is the whole design: one invariant spine, nine profiles.
//
// SPINE is in HELIX order, which is the dependency order, NOT the reading order. The
// lede is DEF at helix position 7: it depends on almost everything below it and is
// therefore written last, even though it renders first. Reading order is the terrain's
// `renderOrder`; the two orderings are kept apart on purpose (§2).
//
// SIG is the odd slot. Registering a difference is what an infobox does — "this is a
// distinct thing, here is its address, here is when it entered the record". So SIG is
// the infobox, not a section — EXCEPT in the Ground column (Void/Field/Atmosphere),
// where it is promoted to a "Measurement behavior" section, because the Ground
// diagnostic (it gets bigger when you measure it) is itself the evidence.

import { OPERATORS, glyphOf } from '../core/index.js';
import { TERRAINS } from './terrains.js';

// The nine slots in helix order, each with the glyph (from the operator vocabulary),
// the slot's generic name, and what it holds — the §2 table, made data.
const SLOT = (op, slot, holds) => Object.freeze({ op, glyph: glyphOf(op), slot, holds });

export const SPINE = Object.freeze([
  SLOT('NUL', 'Not established',      'What is absent, retracted, or unknown. Never blank.'),
  SLOT('SIG', 'Registration record',  'The infobox. When this became a distinct addressable item.'),
  SLOT('INS', 'Attestations',         'Concrete spans with full provenance.'),
  SLOT('SEG', 'Extent',               'What is inside, what is outside, where the cut is contested.'),
  SLOT('CON', 'Relations',            'Typed edges to other articles.'),
  SLOT('SYN', 'Composition',          'The whole this is a part of.'),
  SLOT('DEF', 'Lede',                 'The terms that hold, and who set them.'),
  SLOT('EVA', 'Disputes',             'Judgments rendered against those terms.'),
  SLOT('REC', 'Reframings',           'Occasions on which the frame itself changed.'),
]);

// Helix position (1-indexed), so DEF's position-7 discipline is checkable, not folklore.
export const HELIX_POSITION = Object.freeze(
  SPINE.reduce((m, s, i) => Object.assign(m, { [s.op]: i + 1 }), {}));

export const slotOf = (op) => SPINE.find((s) => s.op === op) || null;

// The content contract for an operator's slot — the discipline the section is held to,
// independent of terrain. project.js reads content into this shape; the terrain names
// it and orders it. `states` is meaningful only for NUL (the three absence states).
const CONTRACT = Object.freeze({
  NUL: 'Present in every article and never blank. Carries the three absence states — never-set, cleared, unknown — plus structurally-sparse slots that are not filed here.',
  SIG: 'The registration record: the address and when this entered the record. The infobox, unless the Ground column promotes it to a measurement-behavior section.',
  INS: 'Concrete attestations: spans with full provenance (source, span, who observed). The strongest evidence a Figure article can carry.',
  SEG: 'The cut: what is inside, what is outside, and where the boundary is contested. Constitutive where the article cannot exist without it (a Link needs endpoints).',
  CON: 'Typed edges to other articles — the relations this article emits and admits.',
  SYN: 'The whole this composes into. Structurally sparse in the Ground column (the desert cell); a full section elsewhere.',
  DEF: 'The lede: the terms that currently hold and who set them (the DEF that σ says is current). Rendered first, resolved last.',
  EVA: 'Judgments rendered against the terms — disputes, tests, the anomaly register.',
  REC: 'Occasions on which the frame itself changed — reframings, splits, migrations. Obeys supersession, never overwrite.',
});

export const contractOf = (op) => CONTRACT[op] || null;

// sectionFor(operator, terrain) → the section descriptor(s) the operator fills at that
// terrain, each carrying the terrain's heading text AND the operator's content
// contract. Most operators fill one section; some fill more (Atmosphere has two CON
// sections, Lens has three). Returns [] if the terrain does not exist. An operator is
// always present in the spine, so an empty result means "sparse/absent at this terrain"
// only when the terrain genuinely omits it — which the profiles never do (every spine
// operator has at least a sparse section), so callers can treat [] as "unknown terrain".
export const sectionFor = (operator, terrain) => {
  const p = TERRAINS[terrain];
  if (!p) return [];
  return p.sections
    .filter((s) => s.op === operator)
    .map((s) => Object.freeze({
      op: s.op,
      glyph: glyphOf(s.op),
      key: s.key,
      heading: s.heading,
      contract: contractOf(s.op),
      sparse: s.sparse || null,
      promoted: !!s.promoted,
      distinctive: !!s.distinctive,
      constitutive: !!s.constitutive,
      largest: !!s.largest,
      infobox: !!s.infobox,
    }));
};

// The full section list of a terrain in render order (lede first), each resolved to the
// same descriptor shape sectionFor returns. This is what a renderer walks.
export const sectionsOf = (terrain) => {
  const p = TERRAINS[terrain];
  if (!p) return [];
  return p.sections.map((s) => sectionFor(s.op, terrain).find((d) => d.key === s.key));
};

// ── self-check ────────────────────────────────────────────────────────────────────
// The spine is exactly the nine operators, in helix order, and DEF (the lede) is at
// position 7 — the invariant the whole "written last, rendered first" discipline rests
// on. A drift in either would silently move the lede or drop an operator.
{
  const ops = SPINE.map((s) => s.op);
  if (ops.length !== 9 || new Set(ops).size !== 9 || ops.some((op) => !OPERATORS[op]))
    throw new Error('wiki/spine: SPINE is not exactly the nine operators');
  if (HELIX_POSITION.DEF !== 7)
    throw new Error('wiki/spine: the lede (DEF) must sit at helix position 7');
}
