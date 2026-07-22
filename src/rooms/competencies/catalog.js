// EO: EVA·CON·SEG·INS(Lens,Link → Entity,Network,Void, Binding·Dissecting·Making·Clearing) — the competency catalog + install fold
// catalog.js — a competency is an installable FACULTY: the human-facing front door to
// organogenesis (metabolism/soma.js grows organs under scarcity; here a PERSON installs one
// deliberately). A competency is, formally, the same object an organ is — a CONTRACT that
// claims one or more diagonal cells of the cube (metabolism/organ.js) — so installing one is
// not a new abstraction; it is choosing which cell of the desert the body grows into.
//
// Everything here is a PURE FOLD over one small state — the set of installed competency ids —
// exactly the codebase's law: the install-set is the source of truth and every view (the body,
// the upkeep, the occupancy) is a recomputed projection of it. Install is reversible; uninstall
// is its inverse; nothing is asserted the checkpoint can't witness.
//
// THREE GATES, all borrowed, not invented:
//   1. the CHECKPOINT — every claimed cell must be well-formed on the cube AND must not
//      FABRICATE from the Void (SYN·Ground, the desert cell). This is the constitution's own
//      wellFormedOrgan (metabolism/constitution.js) — the difference between an organ and a tumor.
//   2. REQUIRES — a competency that needs another faculty present cannot install before it (the
//      helix runs Existence → Structure → Interpretation; you cannot trace a paradigm you cannot
//      yet bind a citation for).
//   3. the BUDGET — every installed faculty costs upkeep every turn, forever (organ.js UPKEEP_BY_OP);
//      scarcity pays for the organs, so the body may grow only what it can feed.

import { cellOf, glyphOf, OPERATORS } from '../../core/index.js';
import { UPKEEP_BY_OP, FOUNDING_ORGANS, createOrgan, wellFormedOrgan, CONSTITUTION } from '../../metabolism/index.js';

const round = (x) => Math.round(x * 1000) / 1000;

// The body ships with the founding organs already wired (metabolism/organ.js FOUNDING_ORGANS):
// the five faculties a reader has before it installs anything. They appear in the catalog as
// BUILT-IN competencies — pre-installed, never uninstallable — so the surface shows the whole
// body in one place: the founders on their five cells, the extensions growing into the desert.
const FOUNDER_META = Object.freeze({
  'soma.sense':  { id: 'entity-spotting',   name: 'Entity spotting',   blurb: 'Instantiate the entities a source names — the people, places, and things the reading is about.' },
  'soma.forage': { id: 'attribution',        name: 'Attribution',        blurb: 'Attribute a candidate mention to an entity — the retrieval that proposes what a name refers to.' },
  'soma.bind':   { id: 'citation-binding',   name: 'Citation binding',   blurb: 'Bind a claim to the passage that witnesses it — the central operator, the citation that holds.' },
  'soma.judge':  { id: 'fact-check',         name: 'Fact-check',         blurb: 'Evaluate a reading under a frame — the gate that lets nothing be asserted the record cannot witness.' },
  'soma.render': { id: 'void-keeping',       name: 'Void-keeping',       blurb: 'Hold an unbound thread as an open question — you may dwell in the Void, and never fabricate from it.' },
});

const FOUNDER_COMPETENCIES = Object.freeze(FOUNDING_ORGANS.map((o) => {
  const meta = FOUNDER_META[o.holon] || { id: o.kind, name: o.kind, blurb: '' };
  return Object.freeze({
    id: meta.id, name: meta.name, blurb: meta.blurb,
    cells: Object.freeze([Object.freeze({ op: o.op, grain: o.grain })]),
    requires: Object.freeze([]),
    builtin: true, forbidden: false, kind: o.kind,
  });
}));

// The extensions — installable faculties, each claiming a DESERT cell (a cube coordinate no
// founder occupies), each a real reading capability the engine already describes (see the README
// surfaces). `requires` names the faculties that must be present first; the cell's upkeep is
// derived, never authored. Ordered roughly along the helix, cheap holds before costly reasoning.
const EXTENSION_COMPETENCIES = Object.freeze([
  { id: 'close-reading',  name: 'Close reading',            cells: [{ op: 'SEG', grain: 'Figure' }],  requires: [],
    blurb: 'Resplit a source into finer passages, so a citation can bind a phrase rather than a page.' },
  { id: 'kind-forming',   name: 'Kind forming',             cells: [{ op: 'INS', grain: 'Pattern' }], requires: ['entity-spotting'],
    blurb: 'Instantiate a kind from repeated entities — many mentions of a thing become the category it is an instance of.' },
  { id: 'motif-tracing',  name: 'Motif tracing',            cells: [{ op: 'SIG', grain: 'Pattern' }], requires: ['close-reading'],
    blurb: 'Attribute a recurrence to a kind — echoes that beat both a chance-similarity and a competence-gain null become motifs.' },
  { id: 'corroboration',  name: 'Cross-source corroboration', cells: [{ op: 'CON', grain: 'Pattern' }], requires: ['citation-binding'],
    blurb: 'Lift the citation bond into a network — the same claim, held up by independent sources through independent senses.' },
  { id: 'segment-census', name: 'Segment census',           cells: [{ op: 'SEG', grain: 'Pattern' }], requires: ['close-reading'],
    blurb: 'Resplit a regularity — deconstruct a network into the sub-structures that compose it.' },
  { id: 'contradiction-radar', name: 'Contradiction radar',  cells: [{ op: 'DEF', grain: 'Figure' }],  requires: ['fact-check'],
    blurb: 'Assert two readings of one content apart — the conflicting claims a single reading would silently average.' },
  { id: 'atmosphere-reading',  name: 'Atmosphere reading',   cells: [{ op: 'EVA', grain: 'Ground' }],  requires: ['fact-check'],
    blurb: 'Evaluate the ambient meaning-tone a corpus is read against — the prior a Lens conditions before any one claim.' },
  { id: 'long-form-synthesis', name: 'Long-form synthesis',  cells: [{ op: 'SYN', grain: 'Figure' }],  requires: ['corroboration'],
    blurb: 'Synthesize a new link the record earns — the weave that carries a moving fold across many prompts.' },
  { id: 'paradigm-shift',      name: 'Paradigm-shift detection', cells: [{ op: 'REC', grain: 'Pattern' }], requires: ['corroboration', 'contradiction-radar'],
    blurb: 'Learn a rule over corpus time — when the meaning a term is read under changes, and mark the break. The priciest faculty.' },
].map((c) => Object.freeze({ ...c, cells: Object.freeze(c.cells.map(Object.freeze)), requires: Object.freeze(c.requires), builtin: false, forbidden: false })));

// The one card that can never install — SYN resolving at Ground (SYN·Cultivating), the desert
// cell. It is in the catalog on purpose: the surface should SHOW the one forbidden move, so the
// void-law is visible, not merely obeyed. Its checkpoint refuses it, and the test pins that it
// can never be installed under any budget.
const FORBIDDEN_COMPETENCIES = Object.freeze([
  Object.freeze({
    id: 'fabricate-from-nothing', name: 'Fabricate from nothing',
    blurb: 'Synthesize a whole from the Void (SYN·Ground). The one move no faculty may make — dwell in the Void, never fabricate from it.',
    cells: Object.freeze([Object.freeze({ op: 'SYN', grain: 'Ground' })]),
    requires: Object.freeze([]), builtin: false, forbidden: true,
  }),
]);

// THE CATALOG — founders (built-in), extensions (installable into the desert), and the one
// forbidden card. The whole body plan a person can stand in front of.
export const CATALOG = Object.freeze([
  ...FOUNDER_COMPETENCIES,
  ...EXTENSION_COMPETENCIES,
  ...FORBIDDEN_COMPETENCIES,
]);

export const DEFAULT_BUDGET = 18;

const byId = new Map(CATALOG.map((c) => [c.id, c]));
export const competencyById = (id) => byId.get(id) || null;

// The founders are always in the body — the initial install-set. Everything the surface shows
// as "installed" beyond these five was chosen by a person.
export const FOUNDER_IDS = Object.freeze(FOUNDER_COMPETENCIES.map((c) => c.id));
export const initialInstalled = () => [...FOUNDER_IDS];

// Resolve a competency's declared cells to full cube cells (op × grain → stance, terrain, key).
// A null means an off-cube coordinate — carried as a checkpoint reason, never thrown.
export const cellsOf = (comp) => (comp?.cells || []).map((c) => cellOf(c.op, c.grain));

// competencyUpkeep — the energy this faculty costs the metabolism per turn: the sum of its
// cells' operator tiers (organ.js UPKEEP_BY_OP). Not a new number — the body's own cost model.
export const competencyUpkeep = (comp) =>
  round((comp?.cells || []).reduce((s, c) => s + (UPKEEP_BY_OP[c.op] ?? 1), 0));

// competencyCheckpoint — THE ISOLATION CHECKPOINT, borrowed whole from the constitution. Every
// claimed cell must resolve to a well-formed cube cell AND must not fabricate from the Void. An
// organ that cannot pass this in isolation is never wired; a competency that cannot is never
// installable. Pure; returns the worklist, never throws.
export const competencyCheckpoint = (comp) => {
  const reasons = [];
  const cells = comp?.cells || [];
  if (!cells.length) reasons.push('no-cell: the competency claims no cube coordinate');
  for (const { op, grain } of cells) {
    const cell = cellOf(op, grain);
    if (!cell) { reasons.push(`off-cube: ${op}·${grain} is not a diagonal cell`); continue; }
    const w = wellFormedOrgan({ op: cell.op, stance: cell.stance, terrain: cell.terrain });
    if (!w.ok) reasons.push(w.reason);
  }
  return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
};

// totalUpkeep — what the currently installed body costs per turn.
export const totalUpkeep = (installed = []) =>
  round(installed.reduce((s, id) => s + competencyUpkeep(competencyById(id) || { cells: [] }), 0));

// occupiedCells — the cube keys the installed body occupies (for the desert/occupancy readout).
export const occupiedCells = (installed = []) => {
  const keys = new Set();
  for (const id of installed) for (const cell of cellsOf(competencyById(id))) if (cell) keys.add(cell.key);
  return keys;
};

// canInstall — the three gates in order (checkpoint · requires · budget), each a first-class,
// reasoned outcome, never a silent drop. `ok:false` carries WHY, so the surface can disable the
// button and say what would let it through. Pure over (installed set, budget).
export const canInstall = (installed, id, { budget = DEFAULT_BUDGET } = {}) => {
  const comp = competencyById(id);
  if (!comp) return outcome(false, `unknown: no competency '${id}'`);
  if (installed.includes(id)) return outcome(false, comp.builtin ? 'built-in: already in the body' : 'already installed');

  const check = competencyCheckpoint(comp);
  if (!check.ok) return outcome(false, check.reasons[0], { reasons: check.reasons, gate: 'checkpoint' });

  const missing = comp.requires.filter((r) => !installed.includes(r));
  if (missing.length) return outcome(false, `requires ${missing.map((r) => competencyById(r)?.name || r).join(', ')}`, { missing, gate: 'requires' });

  const after = round(totalUpkeep(installed) + competencyUpkeep(comp));
  if (after > budget) return outcome(false, `over budget: ${after} > ${round(budget)} upkeep`, { after, budget, gate: 'budget' });

  return outcome(true, null, { after, gate: null });
};

// canUninstall — a builtin founder never leaves the body; an extension leaves iff nothing still
// installed REQUIRES it (you cannot pull the citation bond out from under corroboration).
export const canUninstall = (installed, id) => {
  const comp = competencyById(id);
  if (!comp) return outcome(false, `unknown: no competency '${id}'`);
  if (!installed.includes(id)) return outcome(false, 'not installed');
  if (comp.builtin) return outcome(false, 'built-in: a founding organ is not removable');
  const dependents = installed
    .map((x) => competencyById(x))
    .filter((c) => c && !c.builtin && c.requires.includes(id))
    .map((c) => c.name);
  if (dependents.length) return outcome(false, `needed by ${dependents.join(', ')}`, { dependents });
  return outcome(true, null);
};

// install / uninstall — the PURE FOLD. Each returns the next install-set and whether it changed;
// a refused move returns the SAME set (reversible, idempotent, auditable). The array is kept in
// catalog order so the projection is deterministic.
export const install = (installed, id, opts = {}) => {
  const verdict = canInstall(installed, id, opts);
  if (!verdict.ok) return frozenResult(installed, false, verdict.reason, verdict);
  const next = CATALOG.map((c) => c.id).filter((cid) => installed.includes(cid) || cid === id);
  return frozenResult(next, true, null, verdict);
};

export const uninstall = (installed, id) => {
  const verdict = canUninstall(installed, id);
  if (!verdict.ok) return frozenResult(installed, false, verdict.reason, verdict);
  return frozenResult(installed.filter((cid) => cid !== id), true, null, verdict);
};

// projectBody — the installed set, recomputed as the body it describes: real organs on their
// cells (metabolism/organ.js createOrgan), the upkeep total, the cube occupancy, the desert left.
// This is the "recomputed projection of the source of truth" the whole codebase is built on.
export const projectBody = (installed = []) => {
  const comps = installed.map((id) => competencyById(id)).filter(Boolean);
  const organs = comps.map((c) => createOrgan({
    kind: c.id,
    cells: c.cells.map((x) => ({ op: x.op, grain: x.grain })),
    origin: c.builtin ? 'founder' : 'installed',
  }));
  const occupied = occupiedCells(installed);
  return Object.freeze({
    organs,
    upkeep: totalUpkeep(installed),
    occupied: occupied.size,
    desert: 27 - occupied.size,
    count: comps.length,
  });
};

// notateCells — a one-line cube reading of a competency's cells, for headers and chips:
//   △ SYN·Making·Link — the glyph, the operator, the stance it resolves with, the terrain it lands at.
export const cellLabels = (comp) => cellsOf(comp).map((cell, i) => {
  const decl = comp.cells[i];
  if (!cell) return { glyph: '·', op: decl.op, grain: decl.grain, stance: '?', terrain: '?', key: null };
  return { glyph: glyphOf(cell.op), op: cell.op, grain: cell.grain, stance: cell.stance, terrain: cell.terrain, key: cell.key };
});

// The constitution's own one-line reading of the boundary — what is open to growth and the one
// law beneath it — surfaced verbatim so the page never re-states the rule in its own words.
export const constitutionLine = () => CONSTITUTION.notation();

const outcome = (ok, reason, extra = {}) => Object.freeze({ ok, reason, ...extra });
const frozenResult = (installed, changed, reason, verdict) =>
  Object.freeze({ installed: Object.freeze([...installed]), changed, reason, verdict });

// A stable label for the operator column of a cell, used by the surface's cube legend.
export const opLabel = (op) => (OPERATORS[op]?.label) || op;
