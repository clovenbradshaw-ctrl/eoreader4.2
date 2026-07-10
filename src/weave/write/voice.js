// EO: SIG·SYN·EVA(Paradigm,Kind → Atmosphere,Lens, Tending,Composing,Binding) — personality + trained register (lens-port Track E)
// voice.js — PERSONALITY and the trained register (spec-the-lens-port.md, Track E).
//
// Personality is the λ-term of the steering equation, and it is literally the Horizon's
// DEPARTURE from σ. ρ cold-starts at σ (the corpus prior) and departs as the conversation
// accumulates a self; project that departure to tokens through the eigen-lenses:
//
//   personality(token) = Σ_i (λ_i − 1/d) · ⟨lens_i | token⟩
//
// λ_i are ρ's Born weights (its eigenvalues), 1/d the maximally-mixed baseline in d
// dimensions, and ⟨lens_i | token⟩ the lens realised in token space through the bridge. The
// claim made mechanical: when ρ = σ every λ_i = 1/d, every coefficient (λ_i − 1/d) = 0, the
// bias is identically zero, and the voice is characterless by construction. A Horizon that
// has read and committed carries a standing tilt; resetState / a re-ground returns ρ → σ and
// the voice forgets who it was. This reuses the very ρ and eigen-lenses the Significance
// column builds (core/spectral.js) — the column reads the spectrum, the port writes from it.

import { eigenLenses } from '../../core/index.js';

// personalityDirection(rho) → the departure-weighted eigen-lens sum, a single direction in
// the significance basis: Σ_i (λ_i − 1/d) · lens_i. Zero vector when ρ is maximally mixed
// (ρ = σ at cold start), non-zero exactly to the degree ρ has left the ground.
export const personalityDirection = (rho) => {
  if (!Array.isArray(rho) || !rho.length) return [];
  const d = rho.length;
  const dir = new Array(d).fill(0);
  for (const { weight, lens } of eigenLenses(rho)) {
    const c = weight - 1 / d;
    if (Math.abs(c) < 1e-12 || !Array.isArray(lens)) continue;
    for (let k = 0; k < d && k < lens.length; k++) dir[k] += c * lens[k];
  }
  return dir;
};

const dot = (a, b) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

// projectPersonality({ rho, figureActivations, conceptMap, scale }) → Map<tokenId, delta>.
// Each figure carries an activation in the significance basis (its significance vector); its
// personality bias is that activation's alignment with the departure direction, landed on the
// figure's word-initial token through the bridge. The lossy figure→token projection is the
// known hard part (spec "The bridge"); first-token biasing is the standard trick and the trie
// the fallback for multi-token names. Empty when ρ = σ (direction is the zero vector).
export const projectPersonality = ({ rho, figureActivations, conceptMap, scale = 1 } = {}) => {
  const map = new Map();
  if (!conceptMap || !figureActivations) return map;
  const dir = personalityDirection(rho);
  if (!dir.length || dir.every(x => x === 0)) return map;   // characterless by construction
  const entries = figureActivations instanceof Map ? figureActivations.entries() : Object.entries(figureActivations);
  for (const [label, act] of entries) {
    if (!Array.isArray(act)) continue;
    const token = conceptMap.firstTokenOf(label);
    if (token == null) continue;
    const delta = dot(dir, act) * scale;
    if (delta) map.set(token, (map.get(token) || 0) + delta);
  }
  return map;
};

// ── the contrastive register cartridge (the trained term) ────────────────────────────────
// If the register should be LEARNED rather than hand-listed, it is contrastive: the per-token
// logit difference between an expert and an anti-expert (or a plain prompt against an ornate
// one) IS the steering vector — proxy-tuning at the logit level, no weight touched. Live dual-
// decode is two forward passes per step (too expensive on the CPU target), so the difference
// is frozen offline (scripts/distill-voice.mjs) into one small swappable auditable vector.
//
//   cartridge = { meta: {...}, tokens: { "<id>": delta, ... } }
export const loadVoiceCartridge = (json) => {
  const tokens = json?.tokens && typeof json.tokens === 'object' ? json.tokens : {};
  const map = new Map();
  for (const [id, delta] of Object.entries(tokens)) {
    const t = Number(id);
    if (Number.isInteger(t) && Number.isFinite(delta) && delta) map.set(t, delta);
  }
  return Object.freeze({ meta: json?.meta || null, bias: map, size: map.size });
};

// cartridgeBias(cartridge, scale) → Map<tokenId, delta> ready to stack as a finite contributor.
export const cartridgeBias = (cartridge, scale = 1) => {
  const map = new Map();
  if (!cartridge?.bias) return map;
  for (const [t, d] of cartridge.bias) map.set(t, d * scale);
  return map;
};

// ── THE PANTHEON (spec-the-pantheon.md) ──────────────────────────────────────────────────
// The λ-term factored along the cube's Act axis: one cartridge per face-value, summed at the
// cell the turn lands on. The corpus proved the three axes independent (max pairwise ARI 0.096),
// which is the precise condition that licenses SUMMING the faces rather than enumerating 27 cells.
// Each god is a CONTRASTIVE vector — expert (toward) minus anti-expert (against) — so both poles
// are named here for the offline bake (scripts/distill-voice.mjs). The λ cap is asymmetric by
// RISK: tightest on Apollo (SIG), which claims the most and colors the least; loosest on Thoth
// (DEF), whose lean toward bareness reinforces the void rather than fighting it.
//
// Order is the real progression: ground (NUL SIG), structural middle (INS SEG CON SYN), landing
// act (DEF EVA REC).
export const PANTHEON = Object.freeze({
  NUL: { god: 'Chaos',     group: 'Existence',    cap: 0.8,
         toward: 'marks absence plainly — "the record does not say", "no span supports this", "this is unestablished"; states the edge of the known and stops.',
         against: 'confident completion — "presumably", "it stands to reason", "likely"; the reflex to fill silence with inference.' },
  SIG: { god: 'Apollo',    group: 'Existence',    cap: 0.4,
         toward: 'interpretive and illuminating — "this reads as", "the effect is", "the register here is"; names the frame the material is seen through.',
         against: 'flat literalism — bare paraphrase, "the text says X" with no reading, refusal to interpret.' },
  INS: { god: 'Janus',     group: 'Existence',    cap: 0.7,
         toward: 'introduces and orients — present-tense, low-jargon, definite; names a thing on first use and defines it before building on it.',
         against: 'mid-stream assumption — undefined jargon, "as established", "recall that"; treating the reader as already inside.' },
  SEG: { god: 'Terminus',  group: 'Structure',    cap: 0.7,
         toward: 'sharp and contrastive — "whereas", "unlike", "distinct from"; parallel structure setting two things against each other.',
         against: 'conflation — "roughly the same", "more or less", hedged equivalence smoothing two things into one.' },
  CON: { god: 'Harmonia',  group: 'Structure',    cap: 0.7,
         toward: 'connective and threaded — "because", "which leads to", "and so", "in turn"; follows one line of consequence; narrative over list.',
         against: 'disjointed enumeration — bare "also", "additionally", "separately"; facts stacked without relation.' },
  SYN: { god: 'Hermes',    group: 'Structure',    cap: 0.7,
         toward: 'paraphrastic and plain — "in other words", "that is", "put simply"; trades the technical word for the everyday one.',
         against: 'jargon retention — "more precisely" followed by more terminology; restating in harder words than the original.' },
  DEF: { god: 'Thoth',     group: 'Significance', cap: 1.0,
         toward: 'terse and factual — exact figures, dates, definite articles; one fact per clause; no adjectives, no hedging, no flourish.',
         against: 'ornate qualification — adjectival padding, "it could be argued that", "in some sense"; narrative around a fact that should stand bare.' },
  EVA: { god: 'Themis',    group: 'Significance', cap: 0.7,
         toward: 'evaluative and conditional — "the span supports X but not Y", "this holds only insofar as"; ties confidence to evidence; grades rather than asserts.',
         against: 'flat over-commitment — "clearly", "obviously", "without question"; stating a graded thing as binary.' },
  REC: { god: 'Mnemosyne', group: 'Significance', cap: 0.7,
         toward: 'revisionary — "on closer reading", "this supersedes the earlier", "revising that"; names the correction explicitly.',
         against: 'silent overwrite — pretending the first reading never happened, "as I said" when you did not, flat re-assertion with no acknowledgment of change.' },
});

// loadPantheon(json) → Map<op, { god, cap, bias:Map<tokenId,delta> }>. The data file ships the
// BAKED vectors per face-value (empty until distilled); the god identity + cap come from PANTHEON.
export const loadPantheon = (json) => {
  const bank = new Map();
  const gods = json?.gods && typeof json.gods === 'object' ? json.gods : {};
  for (const [op, meta] of Object.entries(PANTHEON)) {
    const bias = new Map();
    const tokens = gods[op]?.tokens;
    if (tokens && typeof tokens === 'object') {
      for (const [id, d] of Object.entries(tokens)) {
        const t = Number(id);
        if (Number.isInteger(t) && Number.isFinite(d) && d) bias.set(t, d);
      }
    }
    bank.set(op, { god: meta.god, cap: meta.cap, bias });
  }
  return bank;
};

// defaultPantheonBank() → the bank with EMPTY baked vectors: god identities + caps, no steering.
// Auto-mount still names which gods WOULD mount (the Given-Log) and the λ term is a no-op until a
// baked data/pantheon.json is loaded — production stays at "μ-only relevance + void gate, λ off"
// (the lens-port spec's smallest honest first test) until the bake lands.
export const defaultPantheonBank = () => loadPantheon({ gods: {} });

// capNorm(map, budget) → scale a token-bias map so its L2 norm ≤ budget. THE BUDGET (Track B): a
// Born-weighted sum of several cartridges can clear the degeneracy cliff even when each alone is
// safe, so the summed personality vector is capped before it enters the stack — the hard ceiling
// over Born-weighting, without which a triple-stacked turn collapses into the ModelOracle of tone.
export const capNorm = (map, budget) => {
  if (!(budget > 0)) return map;
  let n2 = 0;
  for (const d of map.values()) n2 += d * d;
  const n = Math.sqrt(n2);
  if (n <= budget) return map;
  const s = budget / n;
  for (const [t, d] of map) map.set(t, d * s);
  return map;
};

// mountPersonality({ cell, weights, banks|bank, tilt, budget }) → { bias, mounted }. Read the
// cell address — act (Track A), mode + resolution (Stance, Track C), grain (the thin Site layer,
// Track D) — and the Born weight of each coordinate, look up each coordinate's cartridge, and form
// the Born-weighted, cap-bounded, budget-capped sum, plus the standing ρ-departure tilt. The faces
// are SUMMED (not enumerated) because the cube's axes are independent. `banks` is a per-axis map
// { act, mode, resolution, grain }; the legacy `bank` is an alias for the Act bank alone. Returns
// the λ contribution and the mounted-set for the Given-Log.
const MOUNT_AXES = ['act', 'mode', 'resolution', 'grain'];
export const mountPersonality = ({ cell = {}, weights = {}, banks = null, bank = null, tilt = null, budget = 6, dialMul = null } = {}) => {
  const B = banks || (bank ? { act: bank } : {});
  const acc = new Map();
  const mounted = [];
  const add = (bias, scale) => { for (const [t, d] of bias) acc.set(t, (acc.get(t) || 0) + d * scale); };

  for (const axis of MOUNT_AXES) {
    const b = B[axis]; if (!b) continue;
    // a coordinate may name SEVERAL cartridges (Significance mounts Apollo + Themis together).
    const keys = Array.isArray(cell[axis]) ? cell[axis] : (cell[axis] ? [cell[axis]] : []);
    for (const key of keys) {
      if (!b.has(key)) continue;
      const e = b.get(key);
      // The plain-language dial (Track E) scales a cartridge's weight as a STANDING preference — but
      // a LOCKED coordinate (NUL-on-VOID) ignores it: you cannot dial abstention into a confident
      // register. The dial never names a god; it only nudges the mix the field already chose.
      const locked = axis === 'act' && !!cell.locked;
      const dm = (dialMul && !locked) ? (dialMul.get(`${axis}:${key}`) ?? 1) : 1;
      const w = (Number.isFinite(weights[axis]) ? weights[axis] : 1) * e.cap * dm;   // Born weight × risk cap × dial
      add(e.bias, w);
      mounted.push({ axis, key, god: e.god || e.label || key, weight: round(w), locked });
    }
  }
  if (tilt && tilt.size) { add(tilt, Number.isFinite(weights.tilt) ? weights.tilt : 1); mounted.push({ axis: 'tilt', weight: round(weights.tilt ?? 1) }); }

  capNorm(acc, budget);
  return { bias: acc, mounted };
};

// ── Stance face (Track C) ────────────────────────────────────────────────────────────────
// Stance is Mode — the analytic / synthetic / projective triad — plus Resolution, the assert-vs-
// defeat confidence. Both have a real diction signature and bake as cartridges. The projective
// Generate stance is capped tightest (it claims the most, like Apollo); the obvious overlap to
// watch is Resolution-DEFEAT against Act-REC (walking a reading back and the defeating stance are
// nearly the same surface move) — resolveOverlap() measures it and collapses the pair if it fails.
export const STANCE = Object.freeze({
  mode: {
    Differentiate: { label: 'Differentiate', cap: 0.7, toward: 'analytic — separates, contrasts, draws the distinction', against: 'blurs categories into one' },
    Relate:        { label: 'Relate',        cap: 0.7, toward: 'synthetic — connects, integrates, finds the common thread', against: 'leaves things disjoint' },
    Generate:      { label: 'Generate',      cap: 0.4, toward: 'projective — proposes, extends, imagines forward', against: 'stays strictly descriptive' },
  },
  resolution: {
    assert: { label: 'assert', cap: 0.6, toward: 'commits the claim plainly', against: 'hedges everything' },
    defeat: { label: 'defeat', cap: 0.7, toward: 'walks a reading back — "on reflection, not that"', against: 'flatly restates without revising' },
  },
});

// ── thin Site layer (Track D) ──────────────────────────────────────────────────────────────
// Site is grain, and grain is largely WHAT YOU POINT AT — which μ (relevance) already encodes from
// the surfer's salience. Figure-grain is up-weighting the figure's tokens, which μ does, so Figure
// gets NO cartridge. Ground and Pattern carry only a thin extra diction signature on top — the
// register shift μ cannot supply — so the Site face is partial by design, not co-equal.
export const SITE_GRAIN = Object.freeze({
  Ground:  { label: 'Ground',  cap: 0.5, toward: 'diffuse and collective — the field, the whole, the ambient', against: 'narrow specifics' },
  Pattern: { label: 'Pattern', cap: 0.5, toward: 'abstract and meta — the recurring shape, the structure', against: 'the concrete instance' },
});

// Build a sub-bank { key -> { label, cap, bias } } from a reference table + a baked-tokens json.
const loadAxis = (ref, tokensByKey = {}) => {
  const bank = new Map();
  for (const [key, meta] of Object.entries(ref)) {
    const bias = new Map();
    const tokens = tokensByKey[key]?.tokens;
    if (tokens && typeof tokens === 'object') {
      for (const [id, d] of Object.entries(tokens)) {
        const t = Number(id);
        if (Number.isInteger(t) && Number.isFinite(d) && d) bias.set(t, d);
      }
    }
    bank.set(key, { label: meta.label, cap: meta.cap, bias });
  }
  return bank;
};

// loadStanceBanks(json) → { mode, resolution }; loadSiteBank(json) → grain bank. Empty vectors ⇒
// the coordinate is a no-op until baked, exactly like the Act pantheon.
export const loadStanceBanks = (json = {}) => ({
  mode: loadAxis(STANCE.mode, json?.mode || {}),
  resolution: loadAxis(STANCE.resolution, json?.resolution || {}),
});
export const defaultStanceBanks = () => loadStanceBanks({});
export const loadSiteBank = (json = {}) => loadAxis(SITE_GRAIN, json?.grain || {});
export const defaultSiteBank = () => loadSiteBank({});

// stanceFamily(name) → the Mode coordinate for a surfer stance. updateStance emits Making /
// Cultivating / Clearing; the rest map through the cube's families. Null when unknown.
const STANCE_FAMILY = { Making: 'Generate', Cultivating: 'Generate', Clearing: 'Differentiate', Binding: 'Relate', Tending: 'Relate', Dissecting: 'Differentiate' };
export const stanceFamily = (name) => STANCE_FAMILY[name] || null;

// resolveOverlap(actBank, stanceBanks, { threshold }) → the register-INDEPENDENCE gate (Track C's
// discipline). If the baked Act-REC vector and the Stance-defeat vector are too aligned in logit
// space, they encode the same "walk it back" move twice; collapse the pair by dropping the Stance-
// defeat coordinate (keep the Act god, let the other go unbaked) rather than double-count it.
// Mutates stanceBanks.resolution in place; returns { collapsed, cos }.
export const resolveOverlap = (actBank, stanceBanks, { threshold = 0.6 } = {}) => {
  const rec = actBank?.get?.('REC')?.bias;
  const defeat = stanceBanks?.resolution?.get?.('defeat')?.bias;
  if (!rec || !defeat || !rec.size || !defeat.size) return { collapsed: false, cos: 0 };
  const cos = orthogonality(rec, defeat);
  const collapsed = Math.abs(cos) > threshold;
  if (collapsed) stanceBanks.resolution.delete('defeat');   // unbaked rather than double-counted
  return { collapsed, cos: round(cos) };
};

// ── THE DIAL (Track E): a plain-language standing preference over auto-mount ──────────────
// The gods are not a character-select screen — voice tracks what the field is doing, so the
// default is invisible. The dial is an OPTIONAL override layered on top, in plain language ("more
// terse", "more cautious", "stay concrete"), the way λ and μ already trade off. The god-names are
// the AUDIT vocabulary, never the control surface. Each preference is a set of per-cartridge weight
// multipliers (keyed "axis:key"); a locked coordinate (NUL-on-VOID) ignores the dial entirely.
export const DIAL = Object.freeze({
  terse:    { 'act:DEF': 1.6, 'act:SIG': 0.6, 'act:CON': 0.7 },   // Thoth up, ornament down
  cautious: { 'act:EVA': 1.6, 'act:SIG': 0.6 },                   // Themis up, damp the over-read
  concrete: { 'grain:Ground': 0.4, 'grain:Pattern': 0.4 },        // never drift abstract (μ carries Figure)
});

// dialMultipliers(prefs) → Map<"axis:key", factor>. `prefs` is the user's standing choice, either an
// array of active keys or a flag object { terse:true, ... }. Overlapping factors multiply.
export const dialMultipliers = (prefs) => {
  const out = new Map();
  if (!prefs) return out;
  const active = Array.isArray(prefs) ? prefs : Object.keys(prefs).filter(k => prefs[k]);
  for (const p of active) {
    const m = DIAL[p];
    if (!m) continue;
    for (const [k, f] of Object.entries(m)) out.set(k, (out.get(k) ?? 1) * f);
  }
  return out;
};

// ── BAND → CARTRIDGE: make the epistemic status audible in the prose ──────────────────────
// The directive (existence / structural-truth / interpretation) is a BAND-assignment problem the
// veto already solves — and the band is computed from PROVENANCE, never from the model's judgment
// about its own confidence (the one thing never to trust). Route register through the band so a
// fluent reader FEELS the drop from "Gregor dies" (existence, bare) to "taken together this
// suggests" (structure, assembled) to "the ending reads as liberation" (significance, perspectival)
// without a disclaimer bolted on. The cartridges do the work; the band picks them.
//
//   existence    → Thoth (DEF): bare, declarative, span-cited — no hedge, the span carries it.
//   structure    → Pattern grain + Harmonia (CON): assembled, "taken together", composed not lifted.
//   significance → Apollo (SIG) + Themis (EVA): "this reads as", "defensible but contested" — the
//                  diction announces it is a lens. Apollo is capped hardest; over-reading is its
//                  failure mode, the same caution that wants interpretation MARKED, not smuggled.
//   absence      → Chaos (NUL): the void register (and NUL-on-VOID is the governance lock).
export const BAND_CELLS = Object.freeze({
  existence:    { act: 'DEF' },
  structure:    { act: 'CON', grain: 'Pattern' },
  significance: { act: ['SIG', 'EVA'] },
  absence:      { act: 'NUL' },
});
export const bandToCell = (band) => ({ ...(BAND_CELLS[band] || {}) });

// bandOfCell(cell) → the epistemic band of a beat, read from its PROVENANCE (the surfer/plan's
// resolved spans and operator), not from the model. A single resolving span is Existence; a claim
// assembled across spans or carried by a relation (CON/SYN/SEG) is Structure; a beat with no
// resolving span is Significance (a reading — legitimate if marked, which is the point). The
// straddling B4 seam (some existence, some inference) is the hard case the spec flags; this picks
// the dominant band, and the per-beat mount leaves the finer split to the realizer's own clauses.
export const bandOfCell = (cell) => {
  const n = cell?.spans?.length || 0;
  if (!n) return 'significance';
  if (n > 1 || ['CON', 'SYN', 'SEG'].includes(cell?.op)) return 'structure';
  return 'existence';
};

// orthogonality(a, b) → cosine of two token-bias maps in logit space. The register-INDEPENDENCE
// gate (separate from the corpus's classification-independence): the obvious risk is REC vs the
// Stance-defeat cartridge encoding the same "walk it back" move twice. Bake both, measure this; if
// it is not near-zero, collapse the overlapping pair into one rather than double-count it.
export const orthogonality = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (const [t, d] of a) { na += d * d; const e = b.get(t); if (e) dot += d * e; }
  for (const d of b.values()) nb += d * d;
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const round = (x) => Math.round(x * 1e4) / 1e4;
