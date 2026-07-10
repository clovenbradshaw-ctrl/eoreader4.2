// EO: SYN·CON(Field,Network → Network, Composing,Tracing) — projectEssay — the log fold
// essay/project.js — projectEssay: a pure fold of the EssayEvent log into the
// assembled essay and its workspace state (docs/longform-generation.md).
//
// The essay IS projectEssay(log). The structure is the spine as revised; the
// content is the commitments (claims bound to spans) and the accepted prose,
// both read off the log; the carry is the last checkpoint verbatim. The
// projection also derives what the live panel shows (live.js): section states,
// open threads as visible debts, the active fold's lit spans — flushed at each
// doorway because acceptance IS the flush — and the per-section churn whose
// settling is the convergence signal.
//
// Pure on (log, cursor) alone — no clock, no model, no module state — and
// memoized by (log, cursor) exactly as research/project.js memoizes the
// report: safe because the log is append-only, so a longer log is a strict
// extension. Re-projecting the same log yields a byte-identical essay.

import { EKIND } from './events.js';
import { makeSpine, withState, renderOrder, insert as spineInsert, split as spineSplit, merge as spineMerge, reorder as spineReorder } from './spine.js';

const memo = new WeakMap(); // log → Map(cursor → essay)

export const projectEssay = (log, cursor = null) => {
  const at = cursor == null ? log.length : Math.max(0, Math.min(log.length, cursor));
  let byCursor = memo.get(log);
  if (byCursor?.has(at)) return byCursor.get(at);
  const essay = computeEssay(log, at);
  if (!byCursor) { byCursor = new Map(); memo.set(log, byCursor); }
  byCursor.set(at, essay);
  return essay;
};

const computeEssay = (log, at) => {
  let spine = null;
  const sections = new Map();   // id → accrued section record
  const sectionOrderSeen = [];
  const threads = new Map();    // id → { id, text, openedAt, dueBy, paidBy, deferrals }
  const revisions = [];
  const findings = [];
  let carry = null;             // last checkpoint, verbatim
  let checkpoints = 0;
  let active = null;            // the section whose workspace is open right now

  const recOf = (id) => {
    if (!sections.has(id)) {
      sections.set(id, {
        id, intent: '', state: 'pending', order: sectionOrderSeen.length, dependsOn: [],
        deps: [], relit: [], spanIds: [], proposed: [], commitments: [], vetoed: [],
        prose: null, terminalClaim: null, acceptedAt: null, sentences: [], dropped: 0,
        modality: 'text', surface: null, seam: null,
      });
      sectionOrderSeen.push(id);
    }
    return sections.get(id);
  };

  const adoptSpine = (sp) => {
    spine = sp;
    for (const s of sp.sections) {
      const r = recOf(s.id);
      r.intent = s.intent;
      r.order = s.order;
      r.dependsOn = [...s.dependsOn];
      if (s.state === 'accepted' && r.state !== 'accepted') r.state = s.state;
    }
    // A revision can remove sections (split/merge fold them away) — drop
    // records that never bound anything and are no longer on the spine.
    const live = new Set(sp.sections.map((s) => s.id));
    for (const [id, r] of sections) {
      if (!live.has(id) && !r.commitments.length && r.state !== 'accepted') sections.delete(id);
    }
  };

  for (let i = 0; i < at; i++) {
    const e = log[i];
    switch (e.kind) {
      case EKIND.PLAN:
        adoptSpine(makeSpine(e.spine));
        break;
      case EKIND.ENTER: {
        const r = recOf(e.sectionId);
        r.state = 'exploring';
        r.deps = [...e.deps];
        active = e.sectionId;
        break;
      }
      case EKIND.RELIT:
          recOf(e.sectionId).relit = [...e.dependsOn];
        break;
      case EKIND.SPANS:
        recOf(e.sectionId).spanIds = [...e.spanIds];
        break;
      case EKIND.PROPOSE:
        recOf(e.sectionId).proposed.push({ claimId: e.claimId, claim: e.claim });
        break;
      case EKIND.BIND: {
        const r = recOf(e.sectionId);
        if (r.state === 'exploring') r.state = 'consolidating';
        r.commitments.push({ claimId: e.claimId, claim: e.claim, prop: e.prop ?? null, spanRefs: [...e.spanRefs], sectionId: e.sectionId });
        break;
      }
      case EKIND.VETO: {
        const r = recOf(e.sectionId);
        r.vetoed.push({ claimId: e.claimId, claim: e.claim, reason: e.reason });
        // A veto after a bind strikes the commitment (a gate drop).
        if (e.claimId) r.commitments = r.commitments.filter((c) => c.claimId !== e.claimId);
        break;
      }
      case EKIND.THREAD_OPEN:
        threads.set(e.threadId, { id: e.threadId, text: e.text, openedAt: e.openedAt, dueBy: e.dueBy, paidBy: null, deferrals: 0 });
        break;
      case EKIND.THREAD_PAY: {
        const th = threads.get(e.threadId);
        if (th) th.paidBy = e.sectionId;
        break;
      }
      case EKIND.THREAD_DEFER: {
        const th = threads.get(e.threadId);
        if (th) { th.dueBy = e.dueBy; th.deferrals += 1; }
        break;
      }
      case EKIND.REVISE: {
        revisions.push({ op: e.op, sectionIds: [...e.sectionIds], t: e.t });
        if (!spine) break;
        const d = e.detail || {};
        if (e.op === 'insert' && d.section) adoptSpine(spineInsert(spine, d.section, { afterId: d.afterId ?? null }));
        else if (e.op === 'split' && d.of && d.into) adoptSpine(spineSplit(spine, d.of, d.into));
        else if (e.op === 'merge' && d.of && d.into) adoptSpine(spineMerge(spine, d.of, d.into));
        else if (e.op === 'reorder' && d.order) adoptSpine(spineReorder(spine, d.order));
        else if (e.op === 'replan' && d.spine) adoptSpine(makeSpine(d.spine));
        break;
      }
      case EKIND.ACCEPT: {
        const r = recOf(e.sectionId);
        r.state = 'accepted';
        r.prose = e.prose;
        r.terminalClaim = e.terminalClaim;
        r.acceptedAt = e.t;
        r.sentences = [...(e.sentences || [])];
        r.dropped = e.dropped | 0;
        r.modality = e.modality || 'text';
        r.surface = e.surface ?? null;
        r.seam = e.seam ?? null;
        if (active === e.sectionId) active = null; // the doorway flush
        if (spine) spine = withState(spine, e.sectionId, 'accepted');
        break;
      }
      case EKIND.CHECKPOINT:
        carry = e.carry;
        checkpoints += 1;
        break;
      case EKIND.FINDING:
        findings.push({ kind: e.finding, sectionId: e.sectionId, detail: e.detail, t: e.t });
        // A section that failed its gates flushes its workspace too — the
        // doorway closes either way.
        if (e.finding === 'gate-failed' && active === e.sectionId) active = null;
        break;
      default:
        break;
    }
  }

  // Render order over the spine as it stands (or discovery order pre-plan).
  const order = spine ? renderOrder(spine) : [...sectionOrderSeen];
  const secList = order.map((id) => sections.get(id)).filter(Boolean);

  const accepted = secList.filter((s) => s.state === 'accepted');
  // The TEXT PROJECTION of the whole essay: each section's prose behind its
  // seam's text form (a phrased transition leads in; a pull-quote seam reads
  // as a quote line; a divider is just the paragraph break it always was).
  // Non-text section surfaces ride on the section records for a richer
  // renderer to lay out — the assembled string is one projection, not the essay.
  const assembled = accepted.map((s) => {
    const lead = s.seam?.modality === 'text' ? `${s.seam.text} `
      : s.seam?.modality === 'pullquote' ? `> ${s.seam.text}\n\n`
      : '';
    return lead + (s.prose || '');
  }).filter(Boolean).join('\n\n');
  const ledger = accepted.flatMap((s) => s.commitments);
  const openThreads = [...threads.values()].filter((th) => !th.paidBy);

  // The active fold — one section's spans plus its re-lit dependencies;
  // empty between doorways because acceptance flushed it.
  const activeRec = active ? sections.get(active) : null;
  const activeFold = activeRec
    ? { sectionId: activeRec.id, spanIds: [...activeRec.spanIds], relit: [...activeRec.relit] }
    : null;

  // Churn — the convergence signal the panel shows. Early in a section the
  // state lane churns; as it consolidates the churn drops and it settles.
  const churn = activeRec
    ? {
        sectionId: activeRec.id,
        proposed: activeRec.proposed.length,
        bound: activeRec.commitments.length,
        vetoed: activeRec.vetoed.length,
        settling: activeRec.commitments.length > 0 && activeRec.vetoed.length <= activeRec.commitments.length,
      }
    : null;

  const totalProposed = secList.reduce((n, s) => n + s.proposed.length, 0);
  const totalVetoed = secList.reduce((n, s) => n + s.vetoed.length, 0);

  return deepFreeze({
    cursor: at,
    thesis: spine ? spine.thesis : null,
    frame: spine ? spine.frame : null,
    spine,
    order,
    sections: secList,
    assembled,
    carry,
    checkpoints,
    ledger,
    threads: [...threads.values()],
    openThreads,
    revisions,
    findings,
    activeFold,
    churn,
    verify: {
      sections: accepted.length,
      planned: secList.length,
      commitments: ledger.length,
      proposed: totalProposed,
      vetoed: totalVetoed,
      threadsOpen: openThreads.length,
      threadsPaid: [...threads.values()].filter((th) => th.paidBy).length,
      // The render's claim-grain verify, aggregated — the honest VERIFY line:
      // "N sentences, K bound, G glue, D struck after render."
      sentences: accepted.reduce((n, s) => n + s.sentences.length, 0),
      sentencesBound: accepted.reduce((n, s) => n + s.sentences.filter((x) => x.boundTo).length, 0),
      glue: accepted.reduce((n, s) => n + s.sentences.filter((x) => x.glue).length, 0),
      droppedSentences: accepted.reduce((n, s) => n + s.dropped, 0),
    },
  });
};

const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
};
