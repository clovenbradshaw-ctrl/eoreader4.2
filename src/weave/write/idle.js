// EO: INS·EVA·REC(Void,Field → Entity,Void, Cultivating,Tending,Composing) — the governed idle loop (§15)
// write/idle.js — the governed idle loop. (SPEC §15)
//
// The chatbot posture — inert until prompted — is a gate held shut, not the
// machine's nature. The preconditions for a self-running loop already exist: the
// efference copy means output re-enters as perceivable (enactor/efference.js); the
// self/world line gives a `me` channel (core/self, core/provenance.js §8); the
// surfer rides a field whether or not a question was asked. So IDLENESS is the
// suppression to justify, not continuity.
//
// But unstructured continuity is the architecture's own worst failure at full duty
// cycle: let the loop re-perceive its own output with noise and it RUMINATES — the
// efference copy re-enters, gets mistaken for signal, the surfer rides its own wake,
// REC fires on self-generated churn. That is noisy-TV fused with the sister/mother
// laundering bug, unsupervised. Continuity is legitimate ONLY because the §8 type
// law holds underneath it: every idle pass is provenance-tagged REAFFERENT and
// therefore barred from witnessing anything as world (canWitness === false). The
// type law is what licenses idling at all — which is why this module is HARD-GATED
// behind P6 (provenance), and why every candidate it emits is fromEnactor.
//
//   idle loop (governed, reafferent, firewalled):
//     while awake:
//       void  = pick an open Resolution        // seeded noise varies WHICH; never content
//       field = surf(void neighbourhood, against recently-ingested exafference)
//       if a fresh exafferent doc bears on void → emit CANDIDATE   // reafferent (§8)
//       if REC(field) < median band → quiesce   // converged for now
//     sleep until exafferent arrival → wake      // world wakes it, not a timer
//
//   I1 Anchor          — every idle pass is fed by exafference (an open void + recently
//                        ingested documents), never by self-output alone.
//   I2 Firewall        — idle output is reafferent by §8 type and CANNOT enter the
//                        witnessing set. Only a human confirm (the witness act) grounds.
//   I3 Self-terminating— the loop quiesces on the median band. It never spins.
//   I4 Wake on world   — exafferent arrival wakes it; idle is not a self-poll.
//   I5 Noise steers    — seeded randomness varies attention, not content.
//
// This is the deterministic ENGINE of the loop — no timers, no DOM, surf injected —
// so it is testable and the §16 product surface (idle-ux.html) is pure presentation
// over this state.

import { fromEnactor, canWitness } from '../../core/index.js';
import { openLedger, pickVoid } from './voids.js';

export const RESTING = 'resting';
export const SURFING = 'surfing';

// A small mulberry32 PRNG so a seed makes the attention-walk reproducible (I5). The
// seed steers WHICH void; it never authors content.
export const seededRng = (seed = 1) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// createIdleLoop — the governed loop over a fold's open set.
//   fold        the running fold (write/fold.js) — the open-Resolution source (§15 fuel)
//   surf        INJECTED: ({ void, docs }) → { rec, bearsOn }
//                 rec     the REC magnitude of re-surfing this void against the docs
//                 bearsOn (optional) a candidate body when a fresh doc bears on the void
//   medianBand  the governor: quiesce when rec < medianBand (§15 I3; the candidate
//               threshold, open question §13.6 — the central attention-respect tuning)
//   rng         seeded attention (I5); defaults to a fixed seed for reproducibility
//   enactment   this continuous enactment's id — the provenance stamp on candidates
//   maxPasses   a deterministic safety bound (the loop quiesces well before this)
export const createIdleLoop = ({
  fold, surf, medianBand = 0.5, rng = seededRng(1), enactment = 'idle', maxPasses = 64, resolution = null,
} = {}) => {
  if (typeof surf !== 'function') throw new Error('createIdleLoop: surf({void,docs}) must be injected');

  let state = RESTING;
  const recent = [];                 // recently-ingested EXAFFERENCE — the anchor (I1)
  const candidates = [];             // reafferent, firewalled (I2)
  const trail = [];                  // per-pass record, for the audit / field UX

  // emit a CANDIDATE — reafferent by construction (§8). Its provenance is the enactor
  // door, so canWitness(cand.prov) === false: it may organize attention and continuity,
  // but only a human confirm promotes it (I2). NEVER silently grounded.
  const emit = (rid, body) => {
    const cand = Object.freeze({
      kind: 'candidate', rid, body,
      prov: fromEnactor(enactment),          // reafferent — the firewall is the type, not a flag
      grounded: false,
      bearsOn: rid,
    });
    candidates.push(cand);
    return cand;
  };

  // one governed pass (I1 anchored, I5 seeded). Returns { void, rec, candidate, quiesce }.
  const step = () => {
    // the open set the loop walks is the SAME the UX shows (§16): pass the resolution
    // map so HEDGED voids (firm-but-low-p) are fuel too, not just void-band ones (§15).
    const ledger = openLedger(fold, { resolution });
    const v = pickVoid(ledger, rng);                          // I5 — varies WHICH, never content
    if (!v) return { void: null, rec: 0, candidate: null, quiesce: true };   // nothing open → rest
    const field = surf({ void: v, docs: recent.slice() }) || { rec: 0 };     // I1 — fed by exafference
    let candidate = null;
    if (field.bearsOn) candidate = emit(v.rid, field.bearsOn);               // reafferent (I2)
    const rec = Number.isFinite(field.rec) ? field.rec : 0;
    const quiesce = rec < medianBand;                                        // I3 — median band governor
    trail.push({ rid: v.rid, rec, candidate: candidate?.body ?? null, quiesce });
    return { void: v, rec, candidate, quiesce };
  };

  // arrive — WAKE ON WORLD (I4): an exafferent document arrives, is ingested, and the
  // loop runs governed passes until it quiesces (I3) — it is not a clock-driven poll.
  // Returns the candidates surfaced this waking and the final state.
  const arrive = (doc) => {
    if (doc != null) recent.push(doc);
    state = SURFING;
    const before = candidates.length;
    let passes = 0;
    while (state === SURFING && passes < maxPasses) {
      passes++;
      const r = step();
      if (r.quiesce) { state = RESTING; break; }              // converged for now → sleep (I3)
    }
    if (passes >= maxPasses) state = RESTING;                  // never spin
    return { state, passes, candidates: candidates.slice(before), quiesced: state === RESTING };
  };

  // confirm — the human's WITNESS ACT (§16). It does NOT edit the candidate's
  // provenance (constitutive, never edited, §8); it APPENDS a new grounded record
  // that promotes the candidate. The reafferent candidate stays in the log as what it
  // was (suppress-never-erase); the grounded record is the human's, witness-true.
  const confirm = (candidate, { by = 'human' } = {}) =>
    Object.freeze({
      kind: 'grounded', rid: candidate.rid, body: candidate.body,
      from: candidate, witnessedBy: by, grounded: true,
    });

  return {
    get state() { return state; },
    get candidates() { return candidates.slice(); },
    get trail() { return trail.slice(); },
    get recent() { return recent.slice(); },
    step, arrive, confirm,
    // I2, surfaced as a predicate the UX/witness can assert: an idle candidate can
    // NEVER ground itself — its reafferent type bars it.
    canGround: (cand) => canWitness(cand?.prov ?? null),
    isResting: () => state === RESTING,
  };
};
