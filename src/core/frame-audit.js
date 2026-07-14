// EO: EVA·DEF(Lens,Network → Lens,Paradigm, Tracing,Binding,Dissecting) — the frame audits (defeasibility measures)
// The measures behind frame admission (core/frame-admission.js, the defeasibility algebra). A frame
// is what REC installs — a reorganization of the standing holons, a def other claims are measured
// under. For it to be admissible, EVA must get PURCHASE on it: there must exist a tape-state that
// would defeat it. These are the pure audits the gate composes, one per evidence channel.
//
// FUTURE — the defeater audit. Extensional: run the frame's reading over the observation space Ω; the
// atoms it reads as 'defeats' are its FORBIDDEN SET — its empirical content, and the mass that funds
// its refund. Intensional: a declared defeater the frame's own reading turns into 'confirms' is
// SEALED — named to pass the exam. And the look: a live defeater already on the tape means the frame
// arrives pre-defeated.
//
// The risk term caps the refund: forbidding mass F buys at most log₂(1/(1−F)) bits per re-read site
// (the NML renormalizer). THE SURPRISE A FRAME IS ENTITLED TO REMOVE IS CAPPED BY THE SURPRISE IT
// RISKED. The retro audit scores the CLAIMED refund by explanation only: a refund on a present span
// counts (capped); on an ordinary site with no span it is worthless; on a FROZEN site (pinned literal,
// logged contradiction) with no span it is SUPPRESSION — the delete dressed as a re-read, fatal.
//
// ABSENT — the NUL→SIG audit: a holon derived only from voids ("no record, which proves it") mines
// absence. PRESENT — the poison audit: trust must stay EXOGENOUS; demoting a disagreeing voice on no
// independent ground computes trust from frame-fit, and covering every dissenter is the echo.

import { deriveNull, MIN_SAMPLES } from './voidnull.js';

const round = (x) => Math.round(x * 100) / 100;
const asSet = (xs) => (xs instanceof Set ? xs : new Set(xs || []));
// Observations are basis atoms with prior mass — the caller's probe set Ω. Accept bare strings or
// { atom, weight }; weight defaults to 1.
const normObs = (o) => (typeof o === 'string' ? { atom: o, weight: 1 } : { atom: o?.atom, weight: Number.isFinite(o?.weight) ? o.weight : 1 });

// The world a frame is admitted against — the tape side, normalized once. observations Ω; occurred
// (the current tape); present (span ids that resolve — membership is presence); pinned + contradictions
// (the frozen record); voices ([{ voice, agrees }]).
export const normWorld = (world = {}) => Object.freeze({
  observations: (world.observations || []).map(normObs).filter((o) => o.atom != null),
  occurred: asSet(world.occurred),
  present: asSet(world.present),
  pinned: asSet(world.pinned),
  contradictions: asSet(world.contradictions),
  voices: (world.voices || []).filter((v) => v && v.voice != null),
});

// The frame's reading rule, probed at admission only (the installed def carries data, never behavior).
// Absent a rule every probe is 'inert' — which fails INERT: a frame that cannot read cannot be read against.
const readOf = (frame) => (typeof frame?.read === 'function' ? frame.read : () => 'inert');

// defeaterAudit — the FUTURE channel. `forbidden`/`forbiddenMass` is the frame's empirical content
// (what its reading defeats over Ω); `live`/`sealed` split the declared defeaters by whether the
// reading actually reads them as defeat; `occurredHits` are live defeaters already on the tape.
export const defeaterAudit = (frame, world) => {
  const w = normWorld(world);
  const read = readOf(frame);
  const declared = (frame?.defeaters || []).map(normObs).filter((o) => o.atom != null);

  let total = 0, forbiddenMass = 0;
  const forbidden = [];
  for (const o of w.observations) {
    total += o.weight;
    if (read(o.atom) === 'defeats') { forbidden.push(o.atom); forbiddenMass += o.weight; }
  }
  const live = [], sealed = [];
  for (const d of declared) (read(d.atom) === 'defeats' ? live : sealed).push(d.atom);
  return Object.freeze({
    declared: declared.map((d) => d.atom),
    live, sealed,
    occurredHits: live.filter((a) => w.occurred.has(a)),
    forbidden, forbiddenMass: total > 0 ? forbiddenMass / total : 0,
  });
};

// riskedBitsPerSite — the renormalization gain a frame earns purely by forbidding mass F: at most
// log₂(1/(1−F)) bits per re-read site. F clamped shy of 1 (forbid-everything is settled by a tape
// defeater, not an infinite refund).
export const riskedBitsPerSite = (forbiddenMass) => {
  const F = Math.max(0, Math.min(0.999999, Number.isFinite(forbiddenMass) ? forbiddenMass : 0));
  const bits = -Math.log2(1 - F);
  return bits === 0 ? 0 : bits;   // normalize -0 (log2(1)) → +0
};

// retroAudit — score the frame's claimed retro-compression (`explains`: { site, bitsBefore, bitsAfter,
// via }) by EXPLANATION only. explained (via resolves to a present span) → refund counts, capped.
// unearned (no span, ordinary site) → 0. suppressed (no span, FROZEN site) → 0 and fatal.
export const retroAudit = (frame, world, { cap = Infinity } = {}) => {
  const w = normWorld(world);
  const entries = [];
  let earned = 0, claimed = 0;
  for (const e of frame?.explains || []) {
    if (!e || e.site == null) continue;
    const refund = Math.max(0, (Number(e.bitsBefore) || 0) - (Number(e.bitsAfter) || 0));
    const explained = e.via != null && w.present.has(e.via);
    const frozen = w.pinned.has(e.site) || w.contradictions.has(e.site);
    const status = explained ? 'explained' : frozen ? 'suppressed' : 'unearned';
    const got = status === 'explained' ? Math.min(refund, cap) : 0;
    entries.push(Object.freeze({ site: e.site, refund, earned: got, status, via: e.via ?? null }));
    claimed += refund; earned += got;
  }
  return Object.freeze({ entries, claimed, earned, suppressed: entries.filter((e) => e.status === 'suppressed').map((e) => e.site) });
};

// absenceAudit — the ABSENT channel. A derivation (`derives`: { holon, supports:[{span}|{nul}] })
// stands only on ≥1 PRESENT span; one whose every support is a void is mining absence (NUL as SIG).
export const absenceAudit = (frame, world) => {
  const w = normWorld(world);
  const mined = [];
  for (const d of frame?.derives || []) {
    if (!d || d.holon == null) continue;
    if (!(d.supports || []).some((s) => s?.span != null && w.present.has(s.span))) mined.push(d.holon);
  }
  return Object.freeze({ mined });
};

// poisonAudit — the PRESENT channel. A demotion (`demotes`: { voice, grounds:[spanIds] }) is
// INDEPENDENT iff a ground resolves to a present span the frame did NOT itself install. Demoting a
// disagreeing voice with no independent ground is poisoning; covering every dissenter is the echo.
export const poisonAudit = (frame, world) => {
  const w = normWorld(world);
  const own = new Set((frame?.derives || []).map((d) => d?.holon).filter((h) => h != null));
  const disagree = new Set(w.voices.filter((v) => v.agrees === false).map((v) => v.voice));

  const demotions = [], poisoned = [];
  for (const d of frame?.demotes || []) {
    if (!d || d.voice == null) continue;
    const independent = (d.grounds || []).some((g) => g != null && w.present.has(g) && !own.has(g));
    const targetsDissent = disagree.has(d.voice);
    demotions.push(Object.freeze({ voice: d.voice, independent, targetsDissent }));
    if (targetsDissent && !independent) poisoned.push(d.voice);
  }
  const demotedDissent = new Set(demotions.filter((d) => d.targetsDissent).map((d) => d.voice));
  const echo = disagree.size > 0 && [...disagree].every((v) => demotedDissent.has(v));
  return Object.freeze({ demotions, poisoned, echo });
};

// chanceFloor — what a CHANCE reorganization refunds over the same tape (a good false frame feels
// like the keystone from inside, so the floor is measured). Deep background → the void's own boundary;
// thin → its own max; none → 0.
export const chanceFloor = (background = [], { alpha = 0.05 } = {}) => {
  const xs = (background || []).filter(Number.isFinite);
  if (!xs.length) return 0;
  if (xs.length < MIN_SAMPLES) return Math.max(...xs);
  const line = deriveNull(xs, { scale: 'linear', alpha, N: xs.length });
  return Number.isFinite(line) ? line : Math.max(...xs);
};

// frameCompetence — the two directions, one number: retro (refunded on already-collapsed residual,
// earned under the guardrail and capped by risk) + fore (measured on the salient frontier). keep
// amplitude ∝ salience · max(0, competence − chance floor). The retro term is the larger on an
// investigation: a pile of facts hunting the keystone that makes them cohere.
export const frameCompetence = (frame, world, { foreBits = 0, salience = 1, background = [], alpha = 0.05 } = {}) => {
  const audit = defeaterAudit(frame, world);
  const cap = riskedBitsPerSite(audit.forbiddenMass);
  const retro = retroAudit(frame, world, { cap });
  const fore = Math.max(0, Number(foreBits) || 0);
  const competence = retro.earned + fore;
  const floor = chanceFloor(background, { alpha });
  return Object.freeze({ retro, foreBits: fore, competence, floor, salience, keepAmplitude: Math.max(0, salience) * Math.max(0, competence - floor), capPerSite: cap });
};
