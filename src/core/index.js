// EO: NUL·SIG·INS·SEG·CON·SYN·DEF·EVA·REC(Void,Field,Network,Lens → Entity,Network,Lens,Paradigm, Clearing,Making,Composing) — barrel
// The core holon: the genome. Everything depends on it; it depends on nothing.
// The evo allowlist boundary from eoreader3 — "MAY NOT touch: projectGraph,
// the nine-operator vocabulary, the append-only log" — is this module.

export { MODES, DOMAINS, GRAINS, OPERATORS, isOperator,
         operatorsByMode, operatorsByDomain } from './operators.js';
export { createLog, isLog } from './log.js';
export { eoAddressOfEvent, eoNotation } from './address.js';
export { projectGraph, projectionStats, DEFAULT_PROJECTION_RULES } from './project.js';
// The Conversation Fold (conversation-fold.js): a projection over the conversation
// event log, sibling to projectGraph, that carries the STANCE forward so a turn
// inherits what it's doing (continuation-by-default) instead of re-classifying a
// bare string. See docs/conversation-fold.md.
export { projectFold, routeStance, stanceDescOf, isExplicitCompose, composeKind,
  composeSubject, transitionPrompt, foldRules, clearFoldMemo, VERDICTS as FOLD_VERDICTS,
  COMPOSE_VERBS, COMPOSE_KINDS } from './conversation-fold.js';
// The ontological asterisk (asterisk.js): identity held open as a question. The
// read-only measurement (latentAsterisks), the EVA convergence/conflict decision
// (evaluateSameAs, discriminatorIndex), the identity attention frontier
// (identityFrontier), and the shared norm2 key (normLabel). Genome-level because
// identity — like the void it reuses — is the system's primitive, not a faculty's.
export { latentAsterisks, evaluateSameAs, discriminatorIndex, identityFrontier, normLabel } from './asterisk.js';
export { VERDICTS } from './verdicts.js';
export { STANCES, TERRAINS, stanceOf, terrainOf, grainOfStance, grainOfTerrain,
         cellOf, DIAGONAL_CELLS, coherence, isDiagonal, terrainInfo,
         SIGNATURES, signatureOf,
         OPERATOR_ALIASES, STANCE_ALIASES, aliasOperator, aliasStance, aliasCellKey } from './cube.js';
// The two floors (reshape §1/§2). The bare unit is the input membrane (the floor
// of ingestion); the proposition is the first emergent product (the floor of
// meaning). Both frozen as contracts here, in the genome everything depends on.
export { makeUnit, isUnit, sameUnit, streamDistance, unitStream, isOrdered } from './unit.js';
export { PROPOSITION_SLOTS, makeProposition, isProposition, propositionOfEdge } from './proposition.js';
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
export { surpriseAt, forwardDist, noveltyAmplitude, noveltyFromLensEntropy, NOVELTY_RESERVE } from './surprise.js';
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
  PRIMITIVES, DISJOINT_PRIMITIVES, typeOf, isFunctional, isSymmetric,
  relationPrior, areDisjoint, functionalClash, checkRelationConflict, checkRelationAgree,
  isObjectFunctional, objectFunctionalClash, checkObjectFunctionalConflict,
  attributesConflict,
} from './relation-types.js';
// The learning layer (reshape §5): one defeasible ledger, priors + learned, same
// slot. It lives in the core because the built-in reading knowledge is inherited
// sediment, the same substance the DEF·EVA·REC loop deposits while reading.
export { createConventions } from './conventions/index.js';
// The geometry, made first-class (add-on 2). The cognition triad (perceiver · surfer ·
// enactor, the surfer in the middle), the three faces (Act · Site · Stance) and the
// operator(Site, Stance) notation, and holonic Site addressing (which place an
// operation lands on, by path and hashId, grain preserved).
export { COGNITION, COGNITION_ORDER, facultyOfOperator, facultyOf } from './cognition.js';
export { FACES, facesOf, notate, notateHolon, cellAt, cellsOf, siteStanceAt } from './faces.js';
export { holonId, parseHolon, holonLevels, depthOf, parentOf, leafOf, joinHolon, containsHolon } from './holon.js';
