// EO: EVA(Network → Lens, Tracing) — the Lens, a first-class selection rule over the prior
// A Lens is not a display filter. A Lens changes what is SURPRISING (docs/ground-column §1).
// It is the named, addressable selection rule over the events that CONSTITUTE the prior a line
// is read against — a filter on the prior, never a post-hoc reweighting of a computed surprise
// (L1). The line's own deposit at the cursor is NEVER filtered; only the prior is (L3, enforced
// in reading.js).
//
// A Lens is where the horizon's two coordinates live (§1.2). They are two coordinates of ONE
// thing — what the reading is allowed to expect from:
//
//   gamma    the horizon's DEPTH — how far back the γ-decayed prior still feels (reading.js).
//   horizon  the horizon's REACH — WHICH figures' past constitutes the prior. 'recency'
//            (default) admits every figure; 'entity' admits only the events of the figures the
//            line acts on — the selective frame no temporal γ can give.
//   corpus   an optional background prior seed (§3) — the Atmosphere channel's reference corpus,
//            an { name, hash } identity carried so a surprise is addressed to it (C5). INERT
//            here: no corpus loaded ⇒ the reading is byte-identical to today (C6). The reading
//            does not yet consume it; the slot exists so the Lens is the ONE object the reading,
//            the paradigm admissibility rule, and the corpus door (build step 4) all address.
//
// The Ground column is the prior column (§0): Void (NOVELTY) / Field (priorBond) / Atmosphere
// (priorProp, and the corpus seed above) — the three prior channels in reading.js. A Lens
// CONDITIONS those channels; a Paradigm is the distribution over Lenses (wiki/terrains.js,
// Paradigm.requiredEdges: instances ≥ 2).

export const DEFAULT_GAMMA = 0.7;   // matches reading.js and DEFAULT_PROJECTION_RULES.decay_gamma
export const HORIZONS = Object.freeze(['recency', 'entity']);

// normCorpus — a corpus reference is an { name, hash } identity: the corpus the surprise was
// computed against (C5, the cheap identity audit — §5). A bare string is taken as the name with
// an as-yet-unknown hash. Null / absent ⇒ no background prior (C6). Frozen so a Lens is immutable.
const normCorpus = (c) => {
  if (!c) return null;
  if (typeof c === 'string') return Object.freeze({ name: c, hash: null });
  const name = c.name != null ? String(c.name) : null;
  if (name == null) return null;
  const hash = c.hash != null ? String(c.hash) : null;
  return Object.freeze({ name, hash });
};

const isLens = (x) =>
  !!x && typeof x === 'object' && Object.isFrozen(x)
  && Number.isFinite(x.gamma) && typeof x.horizon === 'string' && ('corpus' in x);

// makeLens — normalise a loose spec into a frozen, addressable Lens. Unknown/absent fields fall
// back to the shipping reading (recency at γ=0.7), so the DEFAULT Lens leaves output byte-
// identical to today (L4). An unrecognised horizon is NOT silently promoted — it falls back to
// 'recency' rather than becoming a new default (L4).
export const makeLens = (spec = {}) => {
  if (isLens(spec)) return spec;   // already a Lens — idempotent, no re-freeze
  const gamma   = Number.isFinite(spec.gamma) ? spec.gamma : DEFAULT_GAMMA;
  const horizon = HORIZONS.includes(spec.horizon) ? spec.horizon : 'recency';
  const corpus  = normCorpus(spec.corpus);
  return Object.freeze({ gamma, horizon, corpus });
};

// The default Lens — the recency reading at γ=0.7, the one that ships today. A reading with no
// Lens named resolves to this, so it is never unaddressed (L2) and never non-default (L4).
export const DEFAULT_LENS = makeLens();

// lensId — the ADDRESS (L1/L2). A stable, human-readable identity a persisted surprise carries so
// it is never unaddressed: `<horizon>@γ<gamma>`, plus `+<name>@<hash>` when a corpus seeds the
// Atmosphere channel (C5 — the surprise carries the corpus identity it was measured against).
// Addressing is not independence: two γ over the same horizon are addressable-distinct but are NOT
// independent lenses (§2, P1) — that is the paradigm admissibility rule's concern, not the address's.
export const lensId = (lens) => {
  const l = makeLens(lens);
  let id = `${l.horizon}@γ${l.gamma.toFixed(2)}`;
  if (l.corpus) id += `+${l.corpus.name}@${l.corpus.hash || '?'}`;
  return id;
};

// resolveLens — the reading's front door. Precedence: an explicit opts.lens wins; otherwise the
// loose opts.gamma / opts.horizon / opts.corpus (the coordinates before §1.2 collapsed them into
// one Lens) build one — backward-compatible with every call that passed them separately. Always
// returns a Lens, so a reading is NEVER unaddressed (L2). No lens hints at all ⇒ DEFAULT_LENS ⇒
// byte-identical (L4).
export const resolveLens = (opts = {}) => {
  if (opts.lens != null) return makeLens(opts.lens);
  if (opts.gamma != null || opts.horizon != null || opts.corpus != null)
    return makeLens({ gamma: opts.gamma, horizon: opts.horizon, corpus: opts.corpus });
  return DEFAULT_LENS;
};
