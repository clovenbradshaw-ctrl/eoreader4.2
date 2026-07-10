// EO: EVA(Field,Link → Lens, Binding,Tracing) — five coherence gates
// essay/gates.js — the coherence gates a consolidated section must pass.
//
// A section is not accepted on grounding alone. After consolidation the
// surviving commitments face five gates; a hard failure sends the section
// back to explore once with the failing gate as an added corrective, and a
// section that still fails is recorded as a finding — never silently shipped.
//
// Every gate is a MEASUREMENT over the commitments, the carry, and the
// re-illuminated dependencies — term overlap and polarity (terms.js), no
// model in the loop. Soft failures (repeats) name drops rather than failing
// the section.

import { termsOf, termSimilarity, contradicts, repeats, claimSimilarity } from './terms.js';
import { propsConflict } from './proposition.js';

export const GATE_IDS = Object.freeze([
  'spine-advance', 'ledger-consistency', 'thread-accounting', 'dependency-coherence', 'handoff',
]);

export const GATE_DEFAULTS = Object.freeze({
  advanceFloor: 0.2,    // a commitment must make this much contact with the intent
  depFloor: 0.1,        // some commitment must touch the re-lit dependency material
  contradictSim: 0.5,   // ledger contradiction: shared vocabulary, flipped polarity
  repeatSim: 0.8,       // ledger repeat: near-identical, same polarity
});

const maxSimTo = (targetTerms, claims) => {
  let best = 0;
  for (const c of claims) {
    const { sim } = termSimilarity(termsOf(c.claim ?? c), targetTerms);
    if (sim > best) best = sim;
  }
  return best;
};

// Gate 1 — spine advance. The section serves ITS intent; answering a
// different question fails however well grounded.
const spineAdvance = ({ section, commitments }, th) => {
  if (!commitments.length) return { gate: 'spine-advance', pass: false, hard: true, reason: 'no commitments survived consolidation' };
  const sim = maxSimTo(termsOf(section.intent), commitments);
  return sim >= th.advanceFloor
    ? { gate: 'spine-advance', pass: true }
    : { gate: 'spine-advance', pass: false, hard: true, reason: `commitments do not advance the intent (contact ${sim.toFixed(2)} < ${th.advanceFloor})` };
};

// Gate 2 — ledger consistency. Contradiction with a bound claim is a hard
// fail; repetition WITHOUT NEW GROUNDING is a soft fail — the repeat is named
// in `drops` and compressed out, not a section-killer. A repeat that binds to
// new spans is corroboration and rides.
const ledgerConsistency = ({ commitments, carry }, th) => {
  const drops = [];
  for (const c of commitments) {
    for (const l of carry.ledger) {
      // Two contradiction readings: string (flipped polarity over shared
      // vocabulary) and numeric (the typed payloads report the same relation
      // at the same time with disjoint quantities — proposition.js).
      if (contradicts(c.claim, l.claim, { simFloor: th.contradictSim })
        || (claimSimilarity(c.claim, l.claim).sim >= th.contradictSim && propsConflict(c.prop, l.prop))) {
        return {
          gate: 'ledger-consistency', pass: false, hard: true,
          reason: `"${c.claim}" contradicts bound claim "${l.claim}" (${l.sectionId})`,
          against: l, claimId: c.claimId,
        };
      }
      if (repeats(c.claim, l.claim, { simFloor: th.repeatSim })) {
        const known = new Set(l.spanRefs || []);
        const fresh = (c.spanRefs || []).some((r) => !known.has(r));
        if (!fresh) drops.push(c.claimId);
      }
    }
  }
  return { gate: 'ledger-consistency', pass: true, drops: [...new Set(drops)] };
};

// Gate 3 — thread accounting. Threads due by this section are paid or
// explicitly deferred with a new due point; a due thread may not be dropped
// silently. The driver computes `paid`/`deferred`; the gate holds it to them.
const threadAccounting = ({ due = [], paid = [], deferred = [] }) => {
  const covered = new Set([...paid, ...deferred.map((d) => d.id)]);
  const dropped = due.filter((th) => !covered.has(th.id));
  return dropped.length
    ? { gate: 'thread-accounting', pass: false, hard: true, reason: `due thread(s) unaccounted: ${dropped.map((d) => d.id).join(', ')}` }
    : { gate: 'thread-accounting', pass: true };
};

// Gate 4 — dependency coherence. The section coheres with its re-illuminated
// declared dependencies — the real texture from the log, not only the
// compressed carry. Zero contact with every declared dependency fails.
const dependencyCoherence = ({ section, commitments, deps = [] }, th) => {
  if (!section.dependsOn.length) return { gate: 'dependency-coherence', pass: true };
  if (!deps.length) return { gate: 'dependency-coherence', pass: true }; // nothing re-lit to measure against
  const depClaims = deps.flatMap((d) => d.commitments || []);
  if (!depClaims.length) return { gate: 'dependency-coherence', pass: true };
  let best = 0;
  for (const c of commitments) {
    const sim = maxSimTo(termsOf(c.claim), depClaims);
    if (sim > best) best = sim;
  }
  return best >= th.depFloor
    ? { gate: 'dependency-coherence', pass: true }
    : { gate: 'dependency-coherence', pass: false, hard: true, reason: `no contact with declared dependencies (${section.dependsOn.join(', ')})` };
};

// Gate 5 — handoff. The section ends on a terminal claim the next section's
// intent can pick up; this writes priorClaim for the next carry. Empty is the
// hard fail; the strength against the next intent is reported, not enforced —
// the next section's own spine-advance gate is the enforcement.
const handoff = ({ terminalClaim, nextIntent = null }) => {
  if (!String(terminalClaim ?? '').trim()) {
    return { gate: 'handoff', pass: false, hard: true, reason: 'no terminal claim to hand off' };
  }
  const strength = nextIntent
    ? termSimilarity(termsOf(terminalClaim), termsOf(nextIntent)).sim
    : null;
  return { gate: 'handoff', pass: true, strength };
};

// Run all five. `pass` is the AND of hard gates; `drops` collects the soft
// ledger repeats to compress out of the accepted set.
export const runGates = (ctx, thresholds = {}) => {
  const th = { ...GATE_DEFAULTS, ...thresholds };
  const results = [
    spineAdvance(ctx, th),
    ledgerConsistency(ctx, th),
    threadAccounting(ctx, th),
    dependencyCoherence(ctx, th),
    handoff(ctx, th),
  ];
  const failures = results.filter((r) => !r.pass);
  const drops = results.flatMap((r) => r.drops || []);
  return { pass: failures.length === 0, results, failures, drops };
};
