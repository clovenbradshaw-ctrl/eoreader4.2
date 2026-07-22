// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines").
// Wires the web organ's Four Gates (organs/in/web.js, docs/the-web-organ-spec.md) into
// the LIVE ingest path. Every web-kind source's turning points (the significance spine
// readIngest already computed — no second salience model invented for this) are judged
// for custody: gross magnitude (the document's own Bayesian surprise) modulated by the
// MDL explanatory-gain test against the session's independently-sourced priors, then a
// seeded sample. The fold lands as typed INTAKE DEFs on one session-long judgment log —
// same organ the tests exercise, driven for real instead of only under test — and a
// summary rides on the source itself (src.intake), so it persists, exports, and shows
// in the console trail exactly like every other per-source record (registry.js).
import { collapseDecision, provenanceBundle } from '../../../organs/in/index.js';
import { recordIntakeDefs } from '../../../turn/index.js';
import { createJudgmentLog } from '../../../core/index.js';
import {
  SERVICES, createWitnessQueue, saveTriggerRequest, availabilityRequest, parseAvailability, cdxRequest,
} from '../../../attest/index.js';
import { domainOf, nowIso } from './util.js';

// The keep-criterion's gross-magnitude factor wants a [0,1] salience read; bayesBits
// (D_KL, the significance channel a turning point already carries) is the honest,
// already-derived measure. 6 bits of belief-shift ≈ full confidence; squashed, not capped.
const squashMagnitude = (bits) => Math.max(0, Math.min(1, Number(bits || 0) / 6));

const DECISIONS_CAP = 60;    // a per-source summary is capped like every other audit slice (pipeline.js)
const PRIORS_CAP = 500;      // the session's independent-record pool never grows unbounded

export const installIntakeGate = (appCtx, { pollMs = 20000, pollAttempts = 5, temperature = 1 } = {}) => {
  const { logIt } = appCtx;
  // The session-long fold: every source's collapsed spans join the pool later sources'
  // MDL gain is measured against (§5, the independent record), and every INTAKE DEF —
  // collapsed or rejected — lands on one append-only judgment log.
  appCtx.intake = { log: createJudgmentLog(), held: new Set(), priors: [], witnessQueue: createWitnessQueue() };

  // The no-key Wayback flow (§6 tier 1), driven over the app's own proxy chain — the
  // same transport every other fetch in the session goes through, never a bespoke one.
  const witnessClient = {
    async trigger(service, url) { try { await appCtx.client.fetchUrl(saveTriggerRequest(url).url); } catch { /* best-effort */ } },
    async available(service, url) {
      try { return parseAvailability(JSON.parse((await appCtx.client.fetchUrl(availabilityRequest(url).url)).text)); }
      catch { return null; }
    },
    async cdx(service, url) {
      try { return JSON.parse((await appCtx.client.fetchUrl(cdxRequest(url).url)).text); }
      catch { return null; }
    },
  };

  // Drive the queue a bounded few steps, spaced out (captures lag minutes) — a
  // background courtesy, off the critical path: the source already landed before this
  // ever runs. Settles to 'success' (witnessed) or stays incomplete — both are honest.
  const settleWitness = async (url) => {
    for (let i = 0; i < pollAttempts; i++) {
      await appCtx.intake.witnessQueue.advance(witnessClient);
      const w = appCtx.intake.witnessQueue.get(SERVICES.IA.id, url);
      if (w && w.status === 'success') return w;
      // unref'd so a Node process (a test, a CLI run) can exit without waiting out this
      // background courtesy — a browser tab has no unref and simply ignores the call.
      if (i < pollAttempts - 1) await new Promise((r) => { const h = setTimeout(r, pollMs); h?.unref?.(); });
    }
    return appCtx.intake.witnessQueue.get(SERVICES.IA.id, url) || null;
  };

  // judgeWebIntake(src) — the four gates + keep-criterion over one web source's turning
  // points. Best-effort and additive: a fault here never touches the source already
  // recorded, it only skips the audit trail this source would otherwise have carried.
  const judgeWebIntake = (src) => {
    if (!src || src.kind !== 'web' || !src.url) return;
    let turns = [];
    try { turns = appCtx.eotFor(src.sn)?.turns || []; } catch { turns = []; }
    if (!turns.length) return;
    const lineage = domainOf(src.url) || src.sn;
    const myHash = src.sha || null;
    const candidates = turns.map((t) => ({
      address: `${myHash}#t${t.idx}`, text: t.sentence, magnitude: squashMagnitude(t.bayesBits),
      foreBits: t.surprisalBits, phase: 'assert', lineage,
    }));
    const world = { priors: appCtx.intake.priors, held: appCtx.intake.held };
    const decisions = candidates.map((c) => collapseDecision(c, world, { seed: myHash || src.sn, temperature }));
    const provenanceFor = (address) => provenanceBundle({ address }, { myHash, witness: null, spanPresentInCapture: null });
    const { defs } = recordIntakeDefs(appCtx.intake.log, decisions, { provenanceFor });

    const collapsed = decisions.filter((d) => d.fate === 'collapsed');
    const rejected = decisions.filter((d) => d.fate === 'rejected');
    const contested = decisions.filter((d) => d.contest === 'contested');
    const collapsedAddrs = new Set(collapsed.map((d) => d.address));
    for (const d of collapsed) {
      appCtx.intake.held.add(d.address);
      appCtx.intake.priors.push({ address: d.address, text: candidates.find((c) => c.address === d.address)?.text || '', lineage });
    }
    if (appCtx.intake.priors.length > PRIORS_CAP) appCtx.intake.priors.splice(0, appCtx.intake.priors.length - PRIORS_CAP);

    src.intake = {
      at: nowIso(), candidates: candidates.length,
      fates: {
        collapsed: collapsed.length, rejected: rejected.length,
        encountered: decisions.filter((d) => d.fate === 'encountered').length,
        nearMiss: decisions.filter((d) => d.fate === 'near-miss').length,
      },
      contested: contested.length,
      decisions: decisions.slice(0, DECISIONS_CAP).map((d) => ({
        address: d.address, fate: d.fate, verdict: d.verdict || null, reason: d.reason || null,
        amplitude: d.amplitude ?? null, contest: d.contest || null, ruledOut: d.ruledOut || null,
      })),
      provenance: provenanceBundle({ address: src.url }, { myHash, witness: null, spanPresentInCapture: null }),
    };
    appCtx.persist(); appCtx.emit('sources');

    const reasonCounts = {};
    for (const d of rejected) reasonCounts[d.reason] = (reasonCounts[d.reason] || 0) + 1;
    const reasonNote = Object.entries(reasonCounts).map(([r, n]) => `${n} ${r}`).join(', ');
    logIt('intake', `Intake gate — ${collapsed.length} of ${candidates.length} turning points earned custody`,
      src.reg + (rejected.length ? ` · rejected: ${reasonNote}` : '') + (contested.length ? ` · ${contested.length} contested` : ''));

    // Tier-1 witness (§6): fired ONCE per page (every span from it shares one capture),
    // never blocking — the source already landed; this only enriches its audit trail.
    appCtx.intake.witnessQueue.request({ serviceKey: 'IA', url: src.url, requested_at: nowIso() });
    settleWitness(src.url).then((w) => {
      const settled = w && w.status === 'success';
      const bundle = provenanceBundle({ address: src.url }, { myHash, witness: w, spanPresentInCapture: settled ? true : null });
      if (!src.intake) return;   // the source was removed while the witness was in flight
      src.intake.provenance = bundle;
      // A counter-DEF (log.revise) is a real re-judgment — write one only on an actual upgrade
      // (the witness succeeded). Still-incomplete-after-polling is not new information: the
      // ORIGINAL DEF's WITNESS_INCOMPLETE already said exactly that; revising to restate it would
      // be log noise, not a correction.
      if (settled) {
        for (const def of defs) {
          if (!collapsedAddrs.has(def.witness?.address)) continue;
          const spanBundle = provenanceBundle({ address: def.witness.address }, { myHash, witness: w, spanPresentInCapture: true });
          appCtx.intake.log.revise(def.of, { verdict: def.verdict, witness: { ...def.witness, provenance: spanBundle } });
        }
      }
      appCtx.persist(); appCtx.emit('sources');
      logIt('intake', settled ? `Witnessed via the Internet Archive — ${bundle.snapshot}` : `Witness incomplete — ${bundle.incomplete_reason}`, src.reg);
    }).catch(() => { /* the witness is a courtesy, never a precondition */ });
  };

  Object.assign(appCtx, { judgeWebIntake });
};
