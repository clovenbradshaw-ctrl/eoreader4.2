// EO: NUL·SIG(Network → Void, Clearing,Binding) — live panel re-projection
// essay/live.js — the real-time projection: the workspace, not a percentage.
//
// Progress is not a bar. If the spine can revise, the denominator moves, so
// "section 3 of 8" is a lie the moment section 4 splits — and a smooth bar
// hides instability, the signal most worth seeing. liveView is a pure
// re-projection of the same event log the essay is (projectEssay), reshaped
// for a two-lane panel: the commitment state foregrounded (spine, carry
// debts, the active fold's lit spans), the prose ambient below. A thread
// closing is information; tokens streaming is theater.
//
// Because it is a fold over an append-only log, the whole build replays —
// scrub `cursor` to watch how the essay was constructed after the fact:
// provenance for the writing process itself, not only the sources.

import { EKIND } from './events.js';
import { projectEssay } from './project.js';

export const liveView = (log, cursor = null) => {
  const p = projectEssay(log, cursor);
  const last = p.cursor > 0 ? log[p.cursor - 1] : null;
  return Object.freeze({
    cursor: p.cursor,
    thesis: p.thesis,

    // The spine lane — each section in its state; when a revision fires you
    // watch it restructure. The restructuring is the true progress signal.
    spineLane: p.sections.map((s) => Object.freeze({
      id: s.id, intent: s.intent, state: s.state, order: s.order,
      dependsOn: s.dependsOn, commitments: s.commitments.length, vetoed: s.vetoed.length,
    })),
    revisions: p.revisions,

    // The carry lane — thesis fixed at the top, open threads as visible
    // debts, the ledger growing.
    carryLane: Object.freeze({
      thesis: p.thesis,
      priorClaim: p.carry ? p.carry.priorClaim : '',
      debts: p.openThreads.map((th) => Object.freeze({ id: th.id, text: th.text, dueBy: th.dueBy, deferrals: th.deferrals })),
      ledgerSize: p.carry ? p.carry.ledger.length : 0,
    }),

    // The active fold — which spans are lit right now, attention made
    // visible; a re-lit dependency is the prior section pulsing.
    foldLane: p.activeFold,

    // Convergence reads as coherence: churn early, settling late. A section
    // that will not settle is underdetermined (or the spine is wrong) — the
    // visible cue for a human to step in at the next seam.
    churn: p.churn,

    // The prose lane, ambient below the state — each entry in its slot's own
    // modality, with the seam that led into it.
    proseLane: p.sections
      .filter((s) => s.state === 'accepted')
      .map((s) => Object.freeze({
        sectionId: s.id, prose: s.prose, terminalClaim: s.terminalClaim,
        modality: s.modality, surface: s.surface, seam: s.seam,
      })),

    findings: p.findings,
    verify: p.verify,
    lastEvent: last ? describeEvent(last) : null,
  });
};

// One-line narration per event kind, for the state lane's ticker.
export const describeEvent = (e) => {
  switch (e.kind) {
    case EKIND.PLAN: return `spine drafted — ${e.spine.sections.length} sections under "${e.spine.thesis}"`;
    case EKIND.ENTER: return `entered ${e.sectionId}${e.deps.length ? ` (deps: ${e.deps.join(', ')})` : ''}`;
    case EKIND.RELIT: return `re-illuminated ${e.dependsOn.join(', ')} for ${e.sectionId}`;
    case EKIND.SPANS: return `${e.spanIds.length} spans lit for ${e.sectionId}`;
    case EKIND.PROPOSE: return `claim proposed — "${e.claim}"`;
    case EKIND.BIND: return `claim bound to ${e.spanRefs.join(', ')} — "${e.claim}"`;
    case EKIND.VETO: return `candidate vetoed (${e.reason}) — "${e.claim}"`;
    case EKIND.THREAD_OPEN: return `thread opened${e.dueBy ? ` (due by ${e.dueBy})` : ''} — "${e.text}"`;
    case EKIND.THREAD_PAY: return `thread ${e.threadId} paid by ${e.sectionId}`;
    case EKIND.THREAD_DEFER: return `thread ${e.threadId} deferred to ${e.dueBy}`;
    case EKIND.REVISE: return `spine revised — ${e.op}${e.sectionIds.length ? ` (${e.sectionIds.join(', ')})` : ''}`;
    case EKIND.ACCEPT: return `${e.sectionId} accepted — "${e.terminalClaim}"`;
    case EKIND.CHECKPOINT: return `carry checkpointed at ${e.sectionId}`;
    case EKIND.FINDING: return `finding: ${e.finding}${e.sectionId ? ` at ${e.sectionId}` : ''}`;
    default: return e.kind;
  }
};
