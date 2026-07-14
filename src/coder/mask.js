// EO: SEG·EVA(Lens → Paradigm, Unraveling,Tracing) — the semantic emission mask
// Stage 1 of the roadmap (docs/eot-coder-roadmap.md): relocate a class of defects
// from a checkpoint we run afterward to a property of the surface we emit on. This
// is the semantic mask — "Projectional Decoding" pushed into the kernel: given a
// partially-emitted event, filter the vocabulary at each face against the cube and
// the part's contract, discarding every value whose completion would violate them.
//
// The four TOKEN-block errors of Appendix B become UNSAMPLABLE here, not merely
// rejectable downstream:
//   grain-mixed        — a face value that disagrees on grain is masked out
//   desert-cell        — SYN at Ground has no legal stance, so it cannot complete
//   contract-violation — a value outside the declared region is masked out
//   dependency         — a reference outside the known set is masked out
//
// THE INVARIANT (Stage 1's load-bearing risk): the mask must be derivable from the
// SAME kernel source as the checkpoint, or the two drift and the guarantee is void.
// So `admits()` is defined THROUGH the checkpoint (src/coder/checkpoint.js) — the
// mask cannot permit an event the checkpoint would flag with a token-block error,
// by construction. tests/coder-mask.test.js proves the face masks agree with
// `admits` exhaustively across the whole cube: the no-drift theorem, executable.

import { OPERATORS, GRAINS } from '../core/index.js';
import { coherence } from '../core/index.js';
import { TERRAIN_NAMES, STANCE_NAMES, isContract, contract } from '../core/index.js';
import { checkpoint } from './checkpoint.js';

// The closed vocabularies of the three cube faces (+ the grain axis).
export const OP_IDS = Object.freeze(Object.keys(OPERATORS));
export const FIELD_VOCAB = Object.freeze({
  op: OP_IDS,
  terrain: TERRAIN_NAMES,
  stance: STANCE_NAMES,
  grain: GRAINS,
});

// The four per-event errors the mask makes unrepresentable. `unknown-surface` and
// `unassembled` are structural (a surface name, a missing close), handled by the
// checkpoint's surface/Law-2 paths, not by per-face masking.
export const TOKEN_EVENT_ERRORS = Object.freeze(['grain-mixed', 'desert-cell', 'dependency', 'contract-violation']);
const TOKEN_SET = new Set(TOKEN_EVENT_ERRORS);

const asContract = (c) => (c == null ? null : isContract(c) ? c : contract(c));
const desertHit = (ev) => ev.op === 'SYN' && (ev.grain === 'Ground' || ev.stance === 'Cultivating' || ev.terrain === 'Field');
// The whole drafted event must sit inside the declared region — not just the face
// being filled. If an earlier face already committed out of region, every
// completion is illegal (a dead end the earlier face's mask should have blocked),
// which is exactly what the checkpoint's contract-violation says.
const eventInRegion = (ev, c) => {
  if (!c) return true;
  if (ev.op != null && !c.ops.includes(ev.op)) return false;
  if (ev.terrain != null && !c.terrains.includes(ev.terrain)) return false;
  if (ev.stance != null && !c.stances.includes(ev.stance)) return false;
  return true; // grain is not a contract axis
};

// ── admits — the ground truth, defined through the checkpoint ─────────────────
// Would appending `event` to `partial` keep it free of every token-block error?
// This routes through checkpoint(), so the mask can never permit what the
// checkpoint would reject — the single-source-of-truth invariant, by construction.
export const admits = (partial, event, context = {}) => {
  const assembly = {
    id: partial?.id ?? '_',
    contract: partial?.contract,
    events: [...(partial?.events ?? []), event],
    closed: true,
  };
  const ctx = { ...context, instances: partial?.knownRefs ?? context.instances };
  // Only judge THIS event: look at findings whose address is the appended one.
  const at = `${assembly.id}.${event.id ?? event.ref ?? `e${assembly.events.length - 1}`}`;
  return !checkpoint(assembly, ctx).findings.some((f) => TOKEN_SET.has(f.error) && f.address === at);
};

// ── The face masks — the vocabulary filter at one decode step ─────────────────
// Given the event drafted so far, the legal completions of one face: values that
// keep the event coherent (grain agreement), off the desert cell, and inside the
// declared region. `once two faces are fixed, the third is constrained to a
// computable set` (roadmap Stage 1) — this is that computation.
export const maskField = (field, draft = {}, partial = {}) => {
  const c = asContract(partial.contract);
  return Object.freeze(FIELD_VOCAB[field].filter((v) => {
    const ev = { ...draft, [field]: v };
    return coherence(ev).ok && !desertHit(ev) && eventInRegion(ev, c);
  }));
};

// The full per-step mask: the legal values for every unfixed face, given the draft.
export const maskEvent = (draft = {}, partial = {}) => Object.freeze({
  op: draft.op != null ? Object.freeze([draft.op]) : maskField('op', draft, partial),
  terrain: draft.terrain != null ? Object.freeze([draft.terrain]) : maskField('terrain', draft, partial),
  stance: draft.stance != null ? Object.freeze([draft.stance]) : maskField('stance', draft, partial),
  grain: draft.grain != null ? Object.freeze([draft.grain]) : maskField('grain', draft, partial),
});

// The reference mask — the legal targets a bond may point at: exactly the known
// set (prior INS'd instances + prior rooms). A `->` outside it is `dependency`,
// masked at the reference rather than rejected at the checkpoint.
export const legalRefs = (partial = {}, context = {}) => Object.freeze([
  ...new Set([...(partial.knownRefs ?? context.instances ?? []), ...(context.rooms ?? [])]),
]);
