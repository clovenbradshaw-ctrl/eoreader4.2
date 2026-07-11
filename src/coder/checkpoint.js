// EO: EVA·SIG(Network,Entity → Lens, Binding,Tracing) — the assembly checkpoint
// The wedge (docs/eot-coder-roadmap.md §4): issue detection as a consequence of
// the algebra, not a linter bolted onto a generator. Given an ASSEMBLY (a room, a
// link, a surface, or an app) with its declared contract, the catalog, and the
// prior context (what has already been INS'd), this fold reads off the full
// Appendix B typed-error taxonomy — each defect with its FACE, its ADDRESS, its
// fix, and the EARLIEST point that could catch it (docs/eo-for-coders.md App. B).
//
//   A general coding agent finds issues by running the code. The EOT coder finds a
//   whole class of issues without running anything — and hands you the address.
//
// The module is deliberately the SINGLE SOURCE OF TRUTH the roadmap's Stage 1 mask
// must derive from: `detectionPoint(error)` classifies each error as token- /
// parse- / checkpoint-detectable exactly as §4's table does, so the constrained
// decoder and this checkpoint can never drift (roadmap Stage 1 risk: "the mask
// must be derivable from the same kernel source as the checkpoint").
//
// Pure and non-throwing — a malformed assembly surfaces its whole worklist of
// findings, the way core/contract.js surfaces a contract's whole error list,
// instead of crashing on the first defect.

import { coherence } from '../core/cube.js';
import { contract, isContract } from '../core/contract.js';
import { CATALOG, hasSurface } from './catalog.js';

// ── The taxonomy (docs/eo-for-coders.md Appendix B + roadmap §4) ─────────────
// For each typed error: the face that fails, its severity, the EARLIEST point
// that can catch it, the roadmap stage that owns it, and the fix. `detectableAt`
// is load-bearing: `token`/`parse` errors migrate INTO the decoder at Stage 1
// (they become unrepresentable); `checkpoint` errors depend on facts the decoder
// cannot see locally (the room's fields, the container, the whole envelope) and
// stay here, where the Stage 3 repair agent consumes them.
export const ERROR_TAXONOMY = Object.freeze({
  'grain-mixed':         Object.freeze({ face: 'all three',  severity: 'error', detectableAt: 'token',      stage: '1',   fix: 'make all three faces target the same grain; the common cause is a Figure operator aimed at a Ground terrain' }),
  'desert-cell':         Object.freeze({ face: 'Act + Site', severity: 'error', detectableAt: 'token',      stage: '1',   fix: 'instantiate (INS) parts first, then synthesize; no contract may include the desert cell (SYN at Ground)' }),
  'dependency':          Object.freeze({ face: 'Act (helix)',severity: 'error', detectableAt: 'token',      stage: '1',   fix: 'read the helix: does the target exist (INS)? is the schema defined (DEF)? emit assemblies in helix order' }),
  'contract-violation':  Object.freeze({ face: 'any',        severity: 'error', detectableAt: 'token',      stage: '1',   fix: 'narrow the emission, or deliberately widen the contract with a logged !REC; never assume width' }),
  'unknown-surface':     Object.freeze({ face: 'catalog',    severity: 'error', detectableAt: 'token',      stage: '1',   fix: 'a catalog gap; report it rather than inventing a surface' }),
  'unassembled':         Object.freeze({ face: 'Law 2',      severity: 'error', detectableAt: 'parse',      stage: '1',   fix: 'close the assembly with !EVA before continuing; emissions past a boundary are rejected whole' }),
  'terrain-mismatch':    Object.freeze({ face: 'Site',       severity: 'error', detectableAt: 'checkpoint', stage: '0/3', fix: 'add the needed fields to the room (and re-checkpoint it) or choose a different surface' }),
  'stance-violation':    Object.freeze({ face: 'Stance',     severity: 'error', detectableAt: 'checkpoint', stage: '0/3', fix: 'the surface does not support that engagement; a chart cannot receive Making' }),
  'narrowing-violation': Object.freeze({ face: 'composition',severity: 'error', detectableAt: 'checkpoint', stage: '0/3', fix: 'narrow the part, or !REC the container upward through each level explicitly' }),
  'closure-violation':   Object.freeze({ face: 'composition',severity: 'error', detectableAt: 'checkpoint', stage: '0/3', fix: 'recompute: the app contract is derived from the parts, not invented' }),
});

// The §4 table, addressable: which errors migrate to the decoder (token/parse)
// and which stay at the checkpoint. This IS the branch's roadmap, as data.
export const detectionPoint = (error) => ERROR_TAXONOMY[error] ?? null;
export const MIGRATES_TO_DECODER = Object.freeze(
  Object.keys(ERROR_TAXONOMY).filter((e) => ERROR_TAXONOMY[e].detectableAt !== 'checkpoint'));
export const STAYS_AT_CHECKPOINT = Object.freeze(
  Object.keys(ERROR_TAXONOMY).filter((e) => ERROR_TAXONOMY[e].detectableAt === 'checkpoint'));

// ── helpers ──────────────────────────────────────────────────────────────────
const asContract = (c) => (c == null ? null : isContract(c) ? c : contract(c));
const uniq = (xs) => [...new Set(xs)];
const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

const finding = (error, address, message, extra = {}) => {
  const t = ERROR_TAXONOMY[error];
  return Object.freeze({
    error, address, message,
    face: t.face, severity: t.severity, detectableAt: t.detectableAt, stage: t.stage, fix: t.fix,
    ...extra,
  });
};

// ── The checkpoint over one assembly ─────────────────────────────────────────
// assembly = {
//   kind:      'room' | 'link' | 'surface' | 'app'   (informational)
//   id:        string                                (the assembly's address root)
//   contract:  contract | { ops, terrains, stances } (its declared region; optional)
//   events:    [{ op, terrain?, stance?, grain?, id?, ref? }]   the emitted events
//   closed:    boolean          did an !EVA close the assembly? (Law 2)
//   surface:   string           for surface assemblies — the catalog key
//   room:      { terrains: [] } the terrains the surface's room actually provides
//   parts:     [contract]       for app/composition — the child contracts
//   container: contract         the container this part must narrow within
// }
// context = { catalog?, instances?: iterable<id>, rooms?: iterable<id>, container? }
export const checkpoint = (assembly, context = {}) => {
  const findings = [];
  const introduced = [];
  const id = assembly?.id ?? '<anon>';
  const catalog = context.catalog ?? CATALOG;
  const at = (suffix) => (suffix == null ? id : `${id}.${suffix}`);

  // What already exists — prior INS'd instances and prior rooms. A reference into
  // this set is grounded; a reference outside it is a dependency defect.
  const known = new Set([...(context.instances ?? []), ...(context.rooms ?? [])]);

  const events = Array.isArray(assembly?.events) ? assembly.events : [];
  const declared = asContract(assembly?.contract);

  // ── Law 2 — an assembly that emitted events must close with !EVA ─────────────
  if (events.length && assembly?.closed === false)
    findings.push(finding('unassembled', at(),
      `assembly '${id}' emitted ${events.length} event(s) with no !EVA checkpoint`));

  // ── Per-event, walked in emit order (so a use before its INS is caught) ───────
  events.forEach((ev, i) => {
    const evAt = at(ev.id ?? ev.ref ?? `e${i}`);

    // grain-mixed — the coherence guard (core/cube.js). Act, Site, Stance must
    // agree on grain; a disagreement is the confabulation the algebra forbids.
    const coh = coherence(ev);
    if (!coh.ok && /grain|mode-mismatch|domain-mismatch/.test(coh.reason ?? ''))
      findings.push(finding('grain-mixed', evAt, `${ev.op}: ${coh.reason}`));

    // desert-cell — SYN resolving at Ground (SYN·Field·Cultivating), empty across
    // 41 languages. It should never be sampled and never checkpoint-pass.
    if (ev.op === 'SYN' && (ev.grain === 'Ground' || ev.stance === 'Cultivating' || ev.terrain === 'Field'))
      findings.push(finding('desert-cell', evAt,
        'SYN at Ground (SYN·Field·Cultivating) is empty across all languages'));

    // dependency — a reference to something not yet INS'd (helix out of order).
    if (ev.ref != null && !known.has(ev.ref))
      findings.push(finding('dependency', evAt, `references '${ev.ref}', which has not been INS'd`));

    // contract-violation — a well-formed event fired outside its part's region.
    if (declared) {
      const out = [];
      if (ev.op && !declared.ops.includes(ev.op)) out.push(`op ${ev.op}`);
      if (ev.terrain && !declared.terrains.includes(ev.terrain)) out.push(`terrain ${ev.terrain}`);
      if (ev.stance && !declared.stances.includes(ev.stance)) out.push(`stance ${ev.stance}`);
      if (out.length) findings.push(finding('contract-violation', evAt,
        `${out.join(', ')} outside the declared contract of '${id}'`));
    }

    // an INS/SIG that names an id introduces it — later events (here and
    // downstream) may reference it.
    if ((ev.op === 'INS' || ev.op === 'SIG') && ev.id != null) {
      known.add(ev.id);
      introduced.push(ev.id);
    }
  });

  // ── Surface assembly — the three catalog-dependent checks ────────────────────
  if (assembly?.surface != null) {
    if (!hasSurface(assembly.surface)) {
      findings.push(finding('unknown-surface', at(assembly.surface),
        `surface '${assembly.surface}' is not in the catalog`));
    } else {
      const surf = catalog[assembly.surface];
      const roomTerrains = assembly.room?.terrains ?? [];

      // terrain-mismatch — the surface's home terrain has no data in its room.
      const missing = surf.home.filter((t) => !roomTerrains.includes(t));
      if (missing.length) findings.push(finding('terrain-mismatch', at(assembly.surface),
        `surface '${assembly.surface}' needs ${missing.join(', ')}; the room provides ${roomTerrains.join(', ') || '—'}`));

      // stance-violation — an interaction the surface's contract does not accept.
      for (const [i, ev] of events.entries()) {
        if (ev.stance && !surf.stances.includes(ev.stance))
          findings.push(finding('stance-violation', at(ev.id ?? `e${i}`),
            `surface '${assembly.surface}' does not accept ${ev.stance}`));
      }
    }
  }

  // ── Composition — narrowing (part vs container) and closure (app vs parts) ────
  const container = asContract(context.container ?? assembly?.container);
  if (container && declared) {
    const out = [];
    for (const op of declared.ops) if (!container.ops.includes(op)) out.push(`op ${op}`);
    for (const t of declared.terrains) if (!container.terrains.includes(t)) out.push(`terrain ${t}`);
    for (const s of declared.stances) if (!container.stances.includes(s)) out.push(`stance ${s}`);
    if (out.length) findings.push(finding('narrowing-violation', at(),
      `part '${id}' claims ${out.join(', ')} its container does not permit`));
  }

  const parts = (assembly?.parts ?? []).map(asContract).filter(Boolean);
  if (parts.length && declared) {
    const env = {
      ops: uniq(parts.flatMap((p) => p.ops)),
      terrains: uniq(parts.flatMap((p) => p.terrains)),
      stances: uniq(parts.flatMap((p) => p.stances)),
    };
    if (!setEq(declared.ops, env.ops) || !setEq(declared.terrains, env.terrains) || !setEq(declared.stances, env.stances))
      findings.push(finding('closure-violation', at(),
        `app '${id}' contract is not the envelope of its ${parts.length} part(s)`));
  }

  return Object.freeze({
    id,
    ok: findings.every((f) => f.severity !== 'error'),
    findings: Object.freeze(findings),
    introduced: Object.freeze(introduced),
  });
};

// ── The watchmaker chain — checkpoint a sequence, threading what each set-down
// leaves behind. Stopping mid-chain leaves valid, provisioned assemblies (the
// interruptibility property, roadmap §1). A room's id becomes reachable to every
// later assembly; an INS'd instance becomes a legal reference downstream — so a
// link that precedes its room is a `dependency`, and the same link after it is
// clean. Order is the helix, made operational.
export const checkpointChain = (assemblies, context = {}) => {
  const instances = new Set(context.instances ?? []);
  const rooms = new Set(context.rooms ?? []);
  const results = [];
  for (const a of assemblies ?? []) {
    const r = checkpoint(a, { ...context, instances, rooms });
    results.push(r);
    for (const gid of r.introduced) instances.add(gid);
    if (a?.kind === 'room' && a?.id != null) rooms.add(a.id);
  }
  return Object.freeze({
    ok: results.every((r) => r.ok),
    results: Object.freeze(results),
    instances: Object.freeze([...instances]),
    rooms: Object.freeze([...rooms]),
  });
};
