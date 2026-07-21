// EO: NUL·SIG·INS·SEG·CON·SYN·DEF·EVA·REC(Void,Field,Network,Lens → Entity,Network,Lens,Paradigm, Clearing,Making,Composing) — barrel
// The core holon: the genome. Everything depends on it; it depends on nothing.
// The evo allowlist boundary from eoreader3 — "MAY NOT touch: projectGraph,
// the nine-operator vocabulary, the append-only log" — is this module.

export { MODES, DOMAINS, GRAINS, OPERATORS, isOperator, glyphOf,
         operatorsByMode, operatorsByDomain, operatorForMode, MODE_MANNER, mannerOf } from './operators.js';
export { createLog, isLog } from './log.js';
export { eoAddressOfEvent, eoNotation } from './address.js';
export { projectGraph, projectionStats, DEFAULT_PROJECTION_RULES } from './project.js';
// The Conversation Fold moved to the frame holon (frame/conversation-fold.js):
// it projects over the conversation log THROUGH the frame spine (events/project/
// bind), so keeping it here made core import upward — the one thing core may
// never do ("core cannot import anything", docs/architecture.md). Import it from
// the frame entrance. See docs/conversation-fold.md.
// The ontological asterisk (asterisk.js): identity held open as a question. The
// read-only measurement (latentAsterisks), the EVA convergence/conflict decision
// (evaluateSameAs, discriminatorIndex), the identity attention frontier
// (identityFrontier), and the shared norm2 key (normLabel). Genome-level because
// identity — like the void it reuses — is the system's primitive, not a faculty's.
export { latentAsterisks, evaluateSameAs, discriminatorIndex, identityFrontier, normLabel } from './asterisk.js';
export { VERDICTS } from './verdicts.js';
// The EVA resolution face — the generator core/verdicts.js's vocabulary is a lossy projection
// of (spec:verdict-space-taxonomy): Bearing × Determinacy → verdict, and the map back down to
// what today's code actually ships.
export { BEARING, DETERMINACY, RESOLUTION_FACE, DEF_EXPORT_CELL, verdictOf, cellOfVerdict,
         LEGAL_VERDICTS, SHIPPED_FOLD } from './resolution-face.js';
// The judgment DEF — every same-vs-other verdict, logged as a revisable judgment, not a flag.
export { GRAINS as DEF_GRAINS, makeDef, createJudgmentLog, isVerdict, isGrain } from './def.js';
// The Cut — the atomic same/other judgment a DEF's witness decomposes into (the typed cut).
export { CUT_KINDS, GROUNDS, makeCut, foldCuts, groundsOut, violatesB1, makeRuledOut,
  isCutKind, isCutVerdict } from './cut.js';
export { STANCES, TERRAINS, stanceOf, terrainOf, grainOfStance, grainOfTerrain,
         cellOf, DIAGONAL_CELLS, coherence, isDiagonal, terrainInfo,
         SIGNATURES, signatureOf,
         OPERATOR_ALIASES, STANCE_ALIASES, aliasOperator, aliasStance, aliasCellKey } from './cube.js';
// The two floors (reshape §1/§2). The bare unit is the input membrane (the floor
// of ingestion); the proposition is the first emergent product (the floor of
// meaning). Both frozen as contracts here, in the genome everything depends on.
export { makeUnit, isUnit, sameUnit, streamDistance, unitStream, isOrdered } from './unit.js';
export { PROPOSITION_SLOTS, makeProposition, isProposition, propositionOfEdge } from './proposition.js';
// The witness diversity of a proposition, made first-class (docs/witness-diversity.md): the
// proposition is the floor of MEANING; this is the floor of its STANDING — how many independent
// voices, through how many senses, hold the distinction up. A frozen currency (four named
// dimensions and a derived tier ladder) that any proposition can carry and any faculty can read;
// reflect.js and corroboration.js MINT it instead of re-deriving the ladder. Genome-level because
// the standing of a claim, like the claim itself, is the system's currency, not any one faculty's.
export { WITNESS_DIMENSIONS, DIVERSITY_TIERS, tierRank, diversityTier, makeDiversity,
         emptyDiversity, EMPTY_DIVERSITY, isDiversity, diversityOf, withVoices, mergeDiversity,
         moreDiverse, attachDiversity, diversityOfProposition } from './witness.js';
// The generation side's formal notation (SPEC §1/§3): the event op(Site, Resolution,
// Provenance, t), the two independent tiers of identity (hashId existence + Resolution
// how-definitely), and the me-ness type law (two doors, indexical reload). The writer
// (src/write/) reasons over these; they live in the genome because the event vocabulary
// and the self/world line are the system's, not any one faculty's.
export { BANDS, makeResolution, firm, voidRes, isFirm, isVoid, weaker, effectiveRes,
         makeSite, siteNotation, HASHID_RE, isHashId, mintHash, fillsTwoSlots,
         makeEvent, sitesOf } from './event.js';
export { PERCEIVER, ENACTOR, DOORS, EXAFFERENCE, REAFFERENCE, READ_BACK,
         provenance, fromPerceiver, fromEnactor, reenter, classify,
         canOrient, canWitness, isReadBackOfPriorSelf, isMine,
         serializeProvenance, restoreProvenance, restoreOnReload } from './provenance.js';
// The holder root and the nested-belief type (SPEC §1, §9, §20, Update 4). The system
// never holds another holder's belief — it holds its belief ABOUT another's, rooted
// always at the INSTRUMENT, which is the provenance that bars the inference from
// becoming a fact. The honesty rule is read off canWitness, not asserted. Genome-level
// because the holder root and the self/world line are the system's, not any faculty's.
export { INSTRUMENT, READER, isSelf, holderOf, STATUS,
         makeBelief, selfBelief, isBelief, isModeled, canAnchor, beliefValue,
         beliefNotation } from './holder.js';
// The shared significance primitives — modality-agnostic, used by every faculty, so
// they live in the genome, not in any one of them. The derived null (the Born-rule
// VOID boundary, voidnull.js) and the one surprise (D_KL over a γ-decayed profile,
// surprise.js): a perceiver reads forward surprise, a surfer derives a null, an
// enactor's gate derives a null, the probe derives a null — one engine, one home.
export { deriveNull, boundedNull, createNoiseFloor, extremeValueZ, MIN_SAMPLES,
         DEF, SEG } from './voidnull.js';
// The density operator (spectral.js): the ONE interpretive object the Significance
// column reads off — ρ = Σ wₖ sₖ |vₖ⟩⟨vₖ|, its eigen-lenses (Born weights), its von
// Neumann entropy (the NPOV / predictive-uncertainty scalar), the Umegaki relative
// entropy (the Atmosphere departure), and the projector commutator (the Paradigm
// incommensurability). Pure on vectors — never an embedder, never a modality — so the
// column is omnimodal for free, and shaped to feed deriveNull (the Born rule) above.
export { buildDensity, eigenLenses, vonNeumann, relEntropy, commutator,
         projectorFrom, symmetricEig, applyStance, SIG, REC, EVA, NUL, CON } from './spectral.js';
// The one segmentation operator, named (docs/segment-by-significance.md): the public
// face of SEG (the 1-D curve case) and buildDensity→eigenLenses→DEF (the graph/
// community case), plus the switch arm neither covered alone — is a dominant-group
// CHANGE a real boundary, null-gated the same way a score-curve peak is.
export { segmentCurve, segmentGroups, segmentSwitches } from './segment.js';
export { surpriseAt, forwardDist, forwardScore, feltSurprise, noveltyAmplitude, noveltyFromLensEntropy, NOVELTY_RESERVE } from './surprise.js';
// The connectivity surprise — the structural sibling of surpriseAt. The mass channel
// moves on what arrived; this one moves on how a bond COLLAPSES the prior separation
// between its (coref-resolved) endpoints, the structural reveal the mass KL is blind to.
// Modality-agnostic: it reads only CON/SIG bonds and the SYN-merge identity quotient.
export { bridgeSurprise, BRIDGE_DINF } from './bridge.js';
// The shared relation ontology — relation primitives, their disjointness and
// symmetry. The perceiver constitutes with it, but the factcheck, the enactor, the
// answer reader and the input organs all read it too, so it lives in the genome,
// not in any one faculty (its only dependency is VERDICTS, imported down).
export {
  PRIMITIVES, DISJOINT_PRIMITIVES, typeOf, operatorsOf, isFunctional, isSymmetric,
  relationPrior, areDisjoint, functionalClash, checkRelationConflict, checkRelationAgree,
  isObjectFunctional, objectFunctionalClash, checkObjectFunctionalConflict,
  attributesConflict, quantitiesConflict,
} from './relation-types.js';
// The learning layer (reshape §5): one defeasible ledger, priors + learned, same
// slot. It lives in the core because the built-in reading knowledge is inherited
// sediment, the same substance the DEF·EVA·REC loop deposits while reading.
export { createConventions, induceAttributionFrames } from './conventions/index.js';
// The geometry, made first-class (add-on 2). The cognition triad (perceiver · surfer ·
// enactor, the surfer in the middle), the three faces (Act · Site · Stance) and the
// operator(Site, Stance) notation, and holonic Site addressing (which place an
// operation lands on, by path and hashId, grain preserved).
export { COGNITION, COGNITION_ORDER, facultyOfOperator, facultyOf } from './cognition.js';
export { FACES, facesOf, notate, notateHolon, cellAt, cellsOf, siteStanceAt } from './faces.js';
// The shared Stance-face reading instrument (docs/universalizing-stance-face.md): the
// one module every caller that needs to know "how something should resolve" asks,
// instead of a hand-rolled copy of the null-vs-epsilon branch.
export { readStanceFace, clearedComponents, cellForGrain, makeStanceCapability } from './stance-face.js';
export { holonId, parseHolon, holonLevels, depthOf, parentOf, leafOf, joinHolon, containsHolon } from './holon.js';

// (seam healing) re-exported so the module stays behind the entrance
export { STANCE_NAMES, TERRAIN_NAMES, contract, isContract, notateContract, DESERT_CELL, HELIX } from './contract.js';
export { supersedeEntries, costOfSuperseding, standing, statusOf, unsettledRefs } from './supersede.js';
// the witness axis of coref/identity resolution (docs/coreference-timeline.md consumes TIER to
// render a SynonymEdge's tier — resolved/engine/mixed/model)
export { TIER, needsWitness, SPECTRUM, spectrumOf, classifyResolutions } from './resolution-spectrum.js';
// FoldTrace (docs/fold-trace-spec.md, docs/coil-surfaces.md §1) — the cube-labeled
// projection of a WaveformModel, and the nearest-fold lookup every scrubber-driven
// surface (poincare.js, operator-clock) reads instead of re-deriving its own.
export { buildFoldTrace, nearestFoldIndex } from './fold-trace.js';
// The shared cache shape every projectX(log, ...) fold in the tree needs — one slot
// per log keyed by (length, sig) for a frame-parametrized fold, or one slot per
// cursor kept forever for a cursor-bounded fold (memo-log.js).
export { memoizeOnLog, memoizeOnLogAt, canonicalJSON } from './memo-log.js';
export { STOPWORDS } from './stopwords.js';
