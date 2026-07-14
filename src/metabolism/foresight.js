// EO: EVA·SIG(Field → Lens,Atmosphere, Tracing,Binding,Tending) — foresight (surprise → selection)
// metabolism/foresight.js — the truth seam: the one surprise wired to selection.
//
// Fitness has always wanted an UN-AUTHORED anchor, and until now the operational one
// was a judge's taste — a model grading how grounded and flowing the output reads.
// Taste is the one thing reality never grades. This module gives the metabolism the
// anchor the whole design has been demanding: PREDICTIVE SKILL against a reality that
// supplies its own answer key. A candidate's reading builds a γ-decayed profile over
// the first part of what actually arrived; the held-out remainder then grades it —
// each held-out arrival is priced at −log₂ p(arrival) under the profile's own forward
// distribution (core/surprise.js forwardDist — the forward object, wired into a
// predictive score at last), and skill is how far the horizon beats the same reader
// with no horizon. Nothing here can be authored: the answer key is the rest of the
// signal, which arrived from the world.
//
// MODALITY-BLIND by the same construction as the currency itself: the arrivals are
// read off a document's own event log — INS labels and CON/SIG bonds per unit — and
// every input organ (text, music, codons, images, code) emits the same operators onto
// the same log with the same per-unit index. One more jack into the currency costs
// nothing; a melody grades a genome's gamma exactly the way a novel does.

import { forwardDist, NOVELTY_RESERVE } from '../core/index.js';

// arrivalsOfDoc — a document's log rendered as the surprise core's arrival sequence:
// one Map<atom, mass> per unit, in unit order. Atoms are the log's own vocabulary —
// an entity label (`e:...`) or an order-insensitive bond (`r:a~b`) — so the basis is
// whatever the adapter emitted, never something invented here. `cap` bounds the
// sequence so one huge source cannot dominate a grading pass.
export const arrivalsOfDoc = (doc, { cap = 240 } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label ?? e.id));
  const L = (id) => String(label.get(id) ?? id).toLowerCase();
  const byUnit = new Map();
  for (const e of events) {
    const idx = Number.isFinite(e.sentIdx) ? e.sentIdx : null;
    if (idx == null) continue;
    let atom = null;
    if (e.op === 'INS' && e.id != null) atom = `e:${L(e.id)}`;
    else if ((e.op === 'CON' || e.op === 'SIG') && e.src != null && e.via != null)
      atom = `r:${[L(e.src), e.tgt != null ? L(e.tgt) : ''].sort().join('~')}`;
    else continue;
    if (!byUnit.has(idx)) byUnit.set(idx, new Map());
    const m = byUnit.get(idx);
    m.set(atom, (m.get(atom) || 0) + 1);
  }
  return [...byUnit.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m).slice(0, cap);
};

// The predictive surprisal of one arrival under a profile's forward distribution —
// Σ mass · −log₂ p(atom), with an unseen atom priced at the reserve's share. This is
// the paired predictive channel the surprise core's header reserves ("reading scores
// the arrival under p(next)"), wired here for the first time: forwardDist is the
// FORWARD object, and grading against held-out reality is what it was for.
// In an open alphabet only a RETURN is gradeable: an atom nobody has seen carries no
// discriminative signal about memory (neither reader could have named it), so it is
// skipped for both. An atom the world already showed is the real test — the reader
// that still holds it prices it from its support; the reader that forgot it must find
// it in the reserve, split across everything it has forgotten (a prediction must name
// WHICH atom — an unsplit reserve would be a code that cannot be decoded, and amnesia
// would grade as calibration).
const surprisalBits = (profile, arrival, novelty, seen) => {
  const { dist, reserve, Z } = forwardDist(profile, { novelty });
  if (!(Z > 0)) return 0;
  const p = new Map(dist);
  const forgotten = Math.max(1, seen.size - profile.size);
  let bits = 0;
  for (const [atom, mass] of arrival) {
    if (!seen.has(atom)) continue;                       // never seen — ungradeable, for both
    const pa = Math.max(p.get(atom) ?? (reserve / forgotten), 1e-12);
    bits += (Number.isFinite(mass) ? Math.max(mass, 0) : 0) * -Math.log2(pa);
  }
  return bits;
};

// foresightOf — grade a profile's predictions against the held-out tail of the signal.
//
//   arrivals  the arrival sequence (Maps of atom → mass), e.g. arrivalsOfDoc(doc)
//   gamma     the recency kernel under test — the GENOME's gamma gene (the attention
//             horizon), so different genomes genuinely predict differently and
//             selection has something to act on
//   holdout   the fraction of the sequence reserved as the answer key (default half)
//   novelty   the reserve mass (the currency's own default)
//
// Returns { skill, predictedBits, chanceBits, steps, held, gamma } or null when the
// signal cannot be graded — too short, or nothing in the tail ever RETURNS (pure
// novelty has no answer key) — an absent anchor, never a fake one. Both readers are
// scored online and causally (score the step, then fold it): `predictedBits` is the
// γ-profile's total −log₂ p(arrival) over the tail's returns; `chanceBits` is the SAME
// predictor with NO horizon (γ = 0 — only the previous step survives), so skill
// measures exactly what the gene claims to buy: how much remembering helps. skill =
// 1 − predicted/chance, clamped to [0,1].
export const foresightOf = (arrivals = [], { gamma = 0.7, holdout = 0.5, novelty = NOVELTY_RESERVE } = {}) => {
  const steps = (arrivals || []).filter((m) => m && typeof m.size === 'number' && m.size > 0);
  if (steps.length < 4) return null;
  const cut = Math.max(1, Math.min(steps.length - 1, Math.floor(steps.length * (1 - holdout))));

  const mkFold = (g) => {
    const profile = new Map();
    return {
      profile,
      fold(arrival) {
        for (const k of profile.keys()) profile.set(k, profile.get(k) * g);
        for (const [k, v] of arrival) profile.set(k, (profile.get(k) || 0) + v);
        for (const [k, v] of profile) if (!(v > 1e-9)) profile.delete(k);
      },
    };
  };
  const model = mkFold(gamma);
  const chance = mkFold(0);                  // the no-horizon reader — last step only
  const seen = new Set();                    // the causal alphabet, shared by both readers
  const note = (arrival) => { for (const k of arrival.keys()) seen.add(k); };
  for (let i = 0; i < cut; i++) { model.fold(steps[i]); chance.fold(steps[i]); note(steps[i]); }

  let predictedBits = 0, chanceBits = 0;
  for (let i = cut; i < steps.length; i++) {
    predictedBits += surprisalBits(model.profile, steps[i], novelty, seen);
    chanceBits    += surprisalBits(chance.profile, steps[i], novelty, seen);
    model.fold(steps[i]); chance.fold(steps[i]); note(steps[i]);
  }
  if (!(chanceBits > 0)) return null;
  const skill = Math.max(0, Math.min(1, 1 - predictedBits / chanceBits));
  return Object.freeze({
    skill: round(skill),
    predictedBits: round(predictedBits),
    chanceBits: round(chanceBits),
    steps: steps.length,
    held: steps.length - cut,
    gamma,
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
