// EO: EVA·DEF(Network,Link → Lens, Binding,Tracing) — the witness diversity of a proposition (first-class)
// Witness diversity — HOW MANY, and HOW DIFFERENT, are the witnesses behind a proposition.
//
// The proposition (proposition.js) is the floor of MEANING — a distinction the core found.
// This module is the floor of its STANDING: the diversity of the witnesses that hold that
// distinction up. A proposition asserts *that* something is so; its diversity says *on how
// many independent voices, through how many channels of the world*, it rests. One is a claim;
// two independent voices is corroboration; two SENSES is cross-modal — the paper and the tape
// both holding the fact, channels that never touched.
//
// This was already MEASURED, but scattered and recomputed: reflect.js inlined the tier ladder
// per answer-relation; corroboration.js counted distinct VOICES per answer; witnessesForProps
// reported spans/origins per document proposition — three sites, three half-shapes, no shared
// object. Here the measure becomes a CURRENCY, the same move proposition.js made for meaning:
// one frozen descriptor, four named dimensions and a derived tier, that ANY proposition can
// carry and any faculty can read. reflect.js and corroboration.js now MINT this instead of
// re-deriving it, so the ladder is defined once and the diversity of a proposition travels with
// it — first-class, not a number recomputed at each consumer.
//
// Pure and model-free: the dimensions are counts over witness descriptors, the tier is a total
// order over the counts. Runs in a unit test exactly as in the browser — no imports, no state.

// ── The four dimensions of witness diversity ──────────────────────────────────────────────
// The named axes a proposition's witnesses vary along. Each is a COUNT of something distinct;
// together they are the shape of "how well-witnessed, how diversely". They are orthogonal on
// purpose — a claim can be witnessed by many SPANS of one document (high spans, one origin) or
// by two documents in two SENSES (two origins, two senses) — and the tier reads across them.
export const WITNESS_DIMENSIONS = Object.freeze([
  'spans',    // distinct witnessing SPANS within a source — two sentences of one memo, not one hit
  'origins',  // distinct independent ROOT documents — a doc and the note taken off it fold to one
  'voices',   // distinct meaningfully-distinct SOURCES-OF-RECORD — mirrors and reprints collapsed
  'senses',   // distinct SENSE-CHANNELS the world was read through — text, sight, hearing, tabular…
]);

// ── The tier ladder — the epistemic rung a proposition's witnesses reach ────────────────────
// A total order, weakest → strongest. The rung is DERIVED from the dimensions (diversityTier),
// never set by hand, so "corroborated" always means the same thing wherever it is read. The two
// bottom rungs distinguish the two ways a proposition can lack a witness in the world: nothing at
// all (unwitnessed), or only the engine's OWN notes (interpretation — reafference, which cannot
// corroborate the engine). The top rung is cross-modal: two voices through two senses.
export const DIVERSITY_TIERS = Object.freeze([
  'unwitnessed',    // 0 — no witness of any kind
  'interpretation', // 1 — witnessed only through the enactor door (the engine's own reading)
  'single-source',  // 2 — one voice in the world holds it
  'corroborated',   // 3 — ≥2 meaningfully-distinct voices, one sense
  'cross-modal',    // 4 — ≥2 voices through ≥2 senses: independent channels of the world
]);

// tierRank(tier) → its index in the ladder (0..4), or -1 for an unknown tier. The comparable
// scalar behind moreDiverse — a strength, not a label.
export const tierRank = (tier) => DIVERSITY_TIERS.indexOf(tier);

// senseCount(senses) → how many DISTINCT senses, accepting the three shapes callers hold: a Set
// (reflect's witnessesOf), an array (a serialized diversity), or a bare number. A total, honest
// about whatever it was handed.
const senseCount = (senses) =>
  senses instanceof Set ? senses.size
  : Array.isArray(senses) ? new Set(senses).size
  : Number.isFinite(senses) ? senses
  : 0;

// senseList(senses) → the distinct senses as a frozen, sorted array — the serializable form the
// currency stores (a Set does not survive JSON, and the order must be stable for equality).
const senseList = (senses) => {
  const xs = senses instanceof Set ? [...senses]
    : Array.isArray(senses) ? senses
    : [];
  return Object.freeze([...new Set(xs.filter(Boolean))].sort());
};

// ── diversityTier — the ladder, defined ONCE ────────────────────────────────────────────────
// The rung a proposition's witnesses reach, from its dimensions. This is the single definition
// the whole engine reads through; reflect.js used to inline it. It keys the corroboration rungs
// on VOICES (mirror-collapsed sources), not raw origins, so two Wikipedia mirrors — two origins,
// one voice — read as single-source, not corroborated: the refinement corroboration.js makes and
// reflect.js could not. `origins` still floors "is there any source at all" (voices ≤ origins,
// and a witness with an unknown voice key still counts as one source). `reafferent` (enactor-door
// witnesses) only ever reaches the interpretation rung — the engine's notes cannot witness the
// engine. Voices default to origins when no distinct-voice key was measured, so a caller that only
// has origins gets the honest same-as-origins reading.
export const diversityTier = ({ origins = 0, voices, senses = 0, reafferent = 0 } = {}) => {
  const v = Number.isFinite(voices) ? voices : origins;   // no voice measure → voices are origins
  const s = senseCount(senses);
  if (v >= 2 && s >= 2) return 'cross-modal';
  if (v >= 2) return 'corroborated';
  if (origins >= 1 || v >= 1) return 'single-source';
  if (reafferent > 0) return 'interpretation';
  return 'unwitnessed';
};

// ── makeDiversity — mint the currency ───────────────────────────────────────────────────────
// Construct the frozen witness-diversity descriptor from its dimensions. The tier and its rank
// are DERIVED here, so a diversity object is internally consistent by construction — you cannot
// hold a "corroborated" tier over one voice. Frozen like the proposition it stands behind: once
// measured, a diversity is a fact about what the witnesses were, not a mutable tally.
//   spans      distinct within-source witnessing spans (0 when measured across sources only)
//   origins    distinct independent root documents
//   voices     distinct meaningfully-distinct sources (defaults to origins)
//   senses     distinct sense-channels — a Set, an array, or a count in; a sorted array out
//   reafferent enactor-door (engine's-own-notes) witnesses — never a source, only a rung floor
export const makeDiversity = ({ spans = 0, origins = 0, voices, senses = 0, reafferent = 0 } = {}) => {
  const v = Number.isFinite(voices) ? voices : origins;
  const tier = diversityTier({ origins, voices: v, senses, reafferent });
  return Object.freeze({
    spans, origins, voices: v, senses: senseList(senses), reafferent,
    tier, rank: tierRank(tier),
  });
};

// The zero of the currency — a proposition nothing witnesses. `emptyDiversity()` returns a fresh
// (already-frozen) instance; EMPTY_DIVERSITY is the shared constant for the common case.
export const emptyDiversity = () => makeDiversity({});
export const EMPTY_DIVERSITY = emptyDiversity();

// isDiversity(x) → is this the currency — the four dimensions, a known tier, a rank that agrees?
// The membrane test a consumer asks before trusting a value as a diversity reading.
export const isDiversity = (x) =>
  !!x && typeof x === 'object' &&
  Number.isFinite(x.spans) && Number.isFinite(x.origins) && Number.isFinite(x.voices) &&
  Array.isArray(x.senses) && Number.isFinite(x.reafferent) &&
  DIVERSITY_TIERS.includes(x.tier) && x.rank === tierRank(x.tier);

// ── diversityOf — fold raw witnesses into the currency ──────────────────────────────────────
// The primary constructor from evidence: a list of witness records → the diversity they compose.
// Each witness is { origin, sense?, voice?, door? } — `origin` the root document it came through,
// `sense` the channel (senseOfModality), `voice` the meaningfully-distinct source key (a host, a
// byline, a content hash — defaults to `origin`, so absent a voice measure origins ARE voices),
// `door` 'enactor' for the engine's own notes (reafference — counted, never a source). `spans`
// rides in separately (the within-source span measure witnessesForProps already computes) since a
// span is a position in ONE source, not a witness in the list. The de-duplication is set-membership
// over the keys — no threshold, no coefficient, the same identity-fact discipline as sameWitness.
export const diversityOf = (witnesses = [], { spans = 0 } = {}) => {
  const origins = new Set();
  const voices = new Set();
  const senses = new Set();
  let reafferent = 0;
  for (const w of witnesses || []) {
    if (!w) continue;
    if (w.door === 'enactor') { reafferent += 1; continue; }   // the engine's own note — not a source
    if (w.origin != null) origins.add(w.origin);
    voices.add(w.voice != null ? w.voice : w.origin);          // voice defaults to origin
    if (w.sense) senses.add(w.sense);
  }
  return makeDiversity({
    spans, origins: origins.size, voices: voices.size, senses, reafferent,
  });
};

// withVoices(diversity, voices) → the same diversity with its VOICE count refined — the bridge
// corroboration.js crosses. reflect.js mints a diversity whose voices default to origins (it
// cannot see that two docIds are one publisher); corroboration.js later measures the distinct
// voices (mirrors and reprints collapsed) and re-mints the tier through this, downgrading a
// two-mirror "corroborated" to the "single-source" it really is. Re-derives the tier — the
// downgrade is not cosmetic.
export const withVoices = (diversity, voices) =>
  makeDiversity({
    spans: diversity?.spans ?? 0,
    origins: diversity?.origins ?? 0,
    voices,
    senses: diversity?.senses ?? 0,
    reafferent: diversity?.reafferent ?? 0,
  });

// mergeDiversity(a, b) → the diversity of the UNION of two witness sets. Counts add for the
// independent dimensions (distinct spans/origins/voices across both), senses union, reafference
// adds; the tier re-derives from the merged counts. The one honest imprecision: without the
// underlying descriptors it cannot tell that an origin in `a` is the same as one in `b`, so it may
// over-count the overlap — a caller with the raw witnesses should diversityOf(concat) instead.
// For disjoint sets (two claims' witnesses, one answer) it is exact.
export const mergeDiversity = (a, b) => {
  if (!isDiversity(a)) return isDiversity(b) ? b : EMPTY_DIVERSITY;
  if (!isDiversity(b)) return a;
  return makeDiversity({
    spans: a.spans + b.spans,
    origins: a.origins + b.origins,
    voices: a.voices + b.voices,
    senses: [...a.senses, ...b.senses],
    reafferent: a.reafferent + b.reafferent,
  });
};

// moreDiverse(a, b) → is a strictly better-witnessed than b, by tier then by voices then origins?
// The comparator for "which reading stands on more" — a total order that never ties two genuinely
// different standings. Used to pick the stronger of two diversities for one proposition.
export const moreDiverse = (a, b) => {
  const ra = a?.rank ?? -1, rb = b?.rank ?? -1;
  if (ra !== rb) return ra > rb;
  if ((a?.voices ?? 0) !== (b?.voices ?? 0)) return (a?.voices ?? 0) > (b?.voices ?? 0);
  return (a?.origins ?? 0) > (b?.origins ?? 0);
};

// ── attachDiversity — the diversity ON a proposition ────────────────────────────────────────
// Bind a diversity reading to a proposition as a first-class companion. The result is a new frozen
// object — the proposition's slots unchanged (proposition.js keeps it frozen), the diversity riding
// alongside on `.diversity`. This is the "first-class element" made concrete: a proposition and its
// standing travel as one value, so a downstream consumer reads `p.diversity.tier` off the claim
// itself rather than re-witnessing it. `isProposition(p.…)` still holds — the slots are copied through.
export const attachDiversity = (proposition, diversity) =>
  Object.freeze({ ...(proposition || {}), diversity: isDiversity(diversity) ? diversity : EMPTY_DIVERSITY });

// diversityOfProposition(p) → the diversity carried by a proposition, or the empty reading when it
// carries none. The read side of attachDiversity — a consumer never has to null-check the companion.
export const diversityOfProposition = (p) => (isDiversity(p?.diversity) ? p.diversity : EMPTY_DIVERSITY);
