// EO: SEG·SIG·INS·CON·NUL·DEF·EVA·REC(Void,Field,Entity,Network → Field,Void,Entity,Network,Lens,Kind,Paradigm, Dissecting,Making,Binding,Composing,Tracing,Clearing) — the structural-memory & cross-source-binding holon
// The one entrance for structural memory and cross-source binding (spec §0). It assembles the pure
// leaves — the format-blind detector (signals), the pattern:* entity (pattern), the promotion /
// demotion pipeline (promotion), cross-source binding (binding), the reference state machine
// (reference), recursive nesting (nesting), the web-fetch scope guard (fetch-scope), and container
// segmentation (segment) — and wires them to the append-only log.
//
// Every leaf below is PURE — it DECIDES and returns tuples. This module is the ONLY one that appends,
// so Law 1 (core/log.js) is satisfied by this file's contract, exactly as referents/index.js is the
// append site for the referent leaves. No new operator is introduced anywhere in the holon (§0): a
// pattern is minted by INS, bonded by CON (instantiates), promoted/retired by REC, adjudicated by
// EVA, held in DEF-superposition, cut by SEG — the nine already in the vocabulary.
//
// The clock and id-source are INJECTED (codebase convention: no Date.now / random in logic). A
// content anchor is a pure deterministic hash of a shape, so two organs that see the same shape mint
// the same anchor and reuse one pattern — cross-organ reuse with no registry to sync.

import { detectStructure, boundaryProposals, SIGNALS, toUnits } from './signals.js';
import { makePattern, makePatternCorroboration, makeInstantiates, withCorroboration, withStatus, patternId, isPattern, PATTERN_STATUS, DEFAULT_PROMOTION_THRESHOLD, INSTANTIATES } from './pattern.js';
import { evaluatePromotion, evaluateDemotion, adjudicatePatternConflict, distinctWitnessDocs } from './promotion.js';
import { bindAcrossSources, crossSourceCut, resolveSuperposition, makeSign, makeRegistryEntry } from './binding.js';
import { classifyReference, resolveReference, transition, detectCycles, typedCycleStates, isCyclic, REF_STATES, REF_HANDLING } from './reference.js';
import { nestTurn, isLeafFrame, descentGrade, shouldDescend, corroborationDensity, childAddress, addressDepth, addressSegments } from './nesting.js';
import { mayFetch, markFetchedWitness, guardCorroboration, guardRuledOut, foldFetchedIntoConflict, FETCHED } from './fetch-scope.js';
import { segmentContainer, flattenZones, maxDepthReached } from './segment.js';

// ── re-exports: the pure surface ──────────────────────────────────────────────────────────────────
export {
  // §3 detector
  detectStructure, boundaryProposals, SIGNALS, toUnits,
  // §2 pattern entity
  makePattern, makePatternCorroboration, makeInstantiates, withCorroboration, withStatus, patternId, isPattern, PATTERN_STATUS, DEFAULT_PROMOTION_THRESHOLD, INSTANTIATES,
  // §4 promotion / demotion
  evaluatePromotion, evaluateDemotion, adjudicatePatternConflict, distinctWitnessDocs,
  // §6 cross-source binding
  bindAcrossSources, crossSourceCut, resolveSuperposition, makeSign, makeRegistryEntry,
  // §7 reference state machine
  classifyReference, resolveReference, transition, detectCycles, typedCycleStates, isCyclic, REF_STATES, REF_HANDLING,
  // §8 nesting / termination / economic guardrail
  nestTurn, isLeafFrame, descentGrade, shouldDescend, corroborationDensity, childAddress, addressDepth, addressSegments,
  // §9 web-fetch scope boundary
  mayFetch, markFetchedWitness, guardCorroboration, guardRuledOut, foldFetchedIntoConflict, FETCHED,
  // §5 container segmentation
  segmentContainer, flattenZones, maxDepthReached,
};

const EMIT = Object.freeze({ src: 'src/perceiver/structure/index.js' });

// contentAnchor(obj) → "@<hash>" — a pure, deterministic content hash of a shape (FNV-1a over the
// stable-stringified object). No randomness, no clock: the SAME shape always mints the SAME anchor,
// which is what lets two organs reuse one pattern (§2). Not cryptographic — a content address.
export const contentAnchor = (obj) => {
  const s = stableString(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `@${(h >>> 0).toString(16).padStart(8, '0')}`;
};
const stableString = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableString).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableString(v[k])}`).join(',')}}`;
};

// buildStructure({ log, now, mintId }) → the holon's append API. `now` is the injected clock (→ a
// timestamp); `mintId` is the injected id-source (→ a fresh opaque id). Both default to inert stubs so
// a pure caller can drive the API in a test without a real clock, but a live caller injects the
// engine's. Every method DECIDES via a pure leaf, then appends the decision — nothing decides at the
// seam.
export const buildStructure = ({ log, now = () => null, mintId = null } = {}) => {
  let n = 0;
  const nextId = mintId || (() => `struct-${n++}`);
  const ts = () => now();
  const append = (event) => log?.append ? log.append(event, EMIT) : Object.freeze({ ...event });

  return {
    // §3 — observe structure over a blob, logging each CLM as a SIG at the self-aware register. A CLM
    // is NEVER committed as a SEG/INS here — only proposed (kind stays on the payload).
    observeStructure(blob, { docId = 'doc' } = {}) {
      const detection = detectStructure(blob);
      for (const c of detection.clms)
        append({ op: 'SIG', kind: 'clm', register: 'clm', proposal: true, signal: c.signal, proposes: c.kind, docId, at: c.at, score: c.score, t: ts() });
      if (detection.void)
        append({ op: 'NUL', kind: 'structure-void', docId, verdict: 'unsupported', note: 'no confident boundary — detector VOID (§3)', t: ts() });
      return detection;
    },

    // §2/§4 — mint or reuse a pattern for a detected shape, add one cross-document corroboration
    // (with its mandatory ruled-out-other), and fire a promotion REC if the threshold is crossed.
    corroboratePattern(pattern, { witness_span, source_doc, ruled_out_other, agent, params } = {}) {
      const anchor = pattern.anchor ?? contentAnchor(pattern.def?.detection_params ?? {});
      const witness = makePatternCorroboration({ witness_span, source_doc, ruled_out_other, agent, ts: ts(), params });
      const next = withCorroboration({ ...pattern, anchor }, witness);
      // The instantiates edge — the span SAYS it matched the pattern (§2), distinct from part-of.
      if (witness_span != null)
        append({ ...makeInstantiates({ span: witness_span, pattern: next, confidence: 0.6, ruled_out_other, agent }), docId: source_doc, t: ts() });
      const decision = evaluatePromotion(next);
      if (decision.fires) { append({ ...decision.fires, t: ts() }); return { pattern: withStatus(next, PATTERN_STATUS.PROMOTED, decision.fires.reason), decision }; }
      return { pattern: next, decision };
    },

    // §4 — demotion: feed a promoted pattern the EVA verdicts of new instances; fire a revise/retire
    // REC when the failure rate exceeds noise.
    reviewPattern(pattern, evaResults, opts = {}) {
      const decision = evaluateDemotion(pattern, evaResults, opts);
      if (decision.fires) { append({ ...decision.fires, t: ts() }); return { pattern: withStatus(pattern, decision.fires.to, decision.fires.reason), decision }; }
      return { pattern, decision };
    },

    // §6 — bind a mention across sources. Logs the INS binding, or the DEF-superposition, or the fresh
    // SIG — whichever the three-sub-cut fold decided. Never a forced merge/split.
    bindMention(mention, candidates, opts = {}) {
      const decision = bindAcrossSources(mention, candidates, opts);
      if (decision.binding) append({ ...decision.binding, ruled_out_other: decision.ruled_out_other, docId: mention.source_doc, t: ts() });
      else if (decision.superposition) append({ ...decision.superposition, docId: mention.source_doc, t: ts() });
      else if (decision.sign) append({ op: 'SIG', kind: 'sign', ...decision.sign, t: ts() });
      return decision;
    },

    // §5 — segment a multi-document container into a (possibly nested) zone tree, logging the meta-SEG
    // and each child-frame INS. Returns the tree; maxDepthReached is logged as a queryable fact (§8).
    segment(blob, opts = {}) {
      const tree = segmentContainer(blob, opts);
      append({ op: 'SEG', kind: 'container-seg', address: tree.address, zones: tree.zones.length, depthReached: maxDepthReached(tree), t: ts() });
      for (const z of tree.zones)
        if (z.kind === 'child-frame') append({ op: 'INS', kind: 'child-frame', address: z.address, t: ts() });
        else if (z.kind === 'void') append({ op: 'NUL', kind: 'zone-void', address: z.address, note: z.note, t: ts() });
      return tree;
    },

    // §7 — resolve a reference through its typed state, logging the CON/SYN/SEG it becomes. Cycles are
    // logged as typed SEG states, never descended into.
    resolveRef(ref, graph = {}) {
      const r = resolveReference(ref, graph);
      append({ ...r.event, t: ts() });
      return r;
    },
    markCycles(edges) {
      const states = typedCycleStates(edges);
      for (const s of states) append({ ...s, t: ts() });
      return states;
    },

    // handles for tests / callers
    _nextId: nextId,
    contentAnchor,
  };
};
