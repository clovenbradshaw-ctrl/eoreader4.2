// EO: SEG·SYN·EVA·REC·DEF(Field,Link,Network → Field,Network,Lens,Paradigm, Dissecting,Composing,Tracing,Clearing) — barrel
// surfer — the SURFER faculty, the middle of the cognition triad (add-on 2 §A).
//
// Structure · navigate/find. The surfer is the relating function: it moves through
// the field the perceiver constituted and finds the relations that bear, between the
// perceiver (Existence · constitute) and the enactor (Significance · judge/commit).
// It is the MIDDLE by construction, not by arrangement — relating is what sits
// between bringing-into-being and committing-to-surface. Its own three axes (focus,
// cursor, frame) are themselves an Existence, a Structure, and a Significance: the
// triad goes all the way down.
//
// Extracted from the fused read/ holon: the surfer (navigate) and the perceiver
// (constitute) were intertwined there. The dependency now runs ONE way — the surfer
// rides the perceiver's reading — so the perceiver no longer reaches back into the
// surfer (the membrane the probe's fused-holon detector demanded). Answerability
// lives here: relating the question to what answers it, and reporting when nothing
// does (the field is VOID) is the surfer's own negative result.

export { surfFold } from './surf.js';
// Salience by the Born rule against the activated conversation thread: the thread as a sparse
// term state, a span's |⟨T|s⟩|² its salience, the same noise null deciding where the surfer's
// return stops being salient. Embedder-free — the term space, not a learned embedding.
export { threadBasis, bornSalience, figureSalience, linkSalience, linksBySentence, salienceField } from './salience.js';
// Trajectory — the arc of one identity's relations across a sequence, segmented at the surf's
// frame-breaks, with the change read off as an end-to-end delta. The omnimodal "what changed":
// it reads only operator events (identity · relation · order · turn), never words, so the same
// synthesis summarises a story, a video track, an audio motif, or a sensor regime.
export { trajectory, speakTrajectory } from './trajectory.js';
// Site typing — which of the 9 cube terrains a locus IS, read off the operators that landed
// there and the grain, never words. Closes the gap where the Structure row (Field/Link/
// Network) was never created: a CON bond is a Link, a regularity of links a Network, ambient
// connectivity a Field. Modality-blind — the same typing for text, video, audio, or sensors.
export { siteTerrain, siteTerrainAt, bondTerrain, arcTerrain } from './terrain.js';
// The Significance column's Ground terrain (cube.md #5): the Atmosphere pass and the
// shared significance-basis projection every pass reads off. Pure on vectors past the
// projection — omnimodal for free. The corpus prior is INJECTED, never imported, so the
// surfer stays acyclic (it never reaches into classify).
export { atmosphereOf, atmosphereFromActivations, projectUnit, projectUnits,
         centroidBasis, corpusSigma } from './atmosphere.js';
// The Stance face (Track F): how the surfer MOVES ρ at the commit, and the
// confabulation guard quantified — read the update stance off the field, refuse a
// Making the field will not bear. applyStance (the four real-symmetric primitives)
// lives on the core leaf; updateStance reads the move here.
export { updateStance, applyMeasuredStance } from './stance.js';
// The helix-aware predictor (predict the move against the frame; let a stale basis be a
// REC, not endless surprise). Runs the Existence and Structure rungs at once, reads the
// mis-framed signature off measured nulls, and re-grounds on a reframe.
export { helixPredict, helixGenerate } from './helix-predict.js';
// The persistent Horizon: memory that IS the moved density operator across turns. Cold-
// starts at σ, folds each reading in with recency decay, departs σ as it accumulates a
// self, and re-grounds (the helix turning) on a measured defeat.
export { createHorizon } from './horizon.js';
// The growing basis: the cells themselves learned, not shipped. Where the frame has no
// cell for what it keeps meeting, it composes one (REC Composing a Paradigm cell) — but
// only when misfits cohere, the signal-from-noise discipline applied to category
// formation. Re-grounding can then relocate to a frame element that did not exist.
export { createGrowingBasis } from './grow-basis.js';
// The layered generative stack: generate many layers of meaning at once (Paradigm →
// Lens → Proposition → Token), each a chain conditioned on the one above and
// independently re-groundable — coherence lives high, fluency low, the helix run forward.
export { createLayeredGenerator } from './layered-generator.js';
// The structural significance basis: ρ built from OPERATIONS (the cube's Act face read
// off the log), not embeddings — meaning as what the operators do to the field, not as
// distributional company. The embedder stays in VOX; the column reads structure.
export { OPS, RELTYPES, operatorProfiles, structuralActivations, structuralHorizon, structuralCommutator, structuralGround } from './structure-basis.js';
// Label feedback (word → concept): grow specific link-types from the recurring links the
// closed vocabulary leaves untyped, and MEASURE whether structure alone carves each one
// (deriveNull over random same-size groups) — `structureGrows` is the empirical answer to
// whether the structural basis can learn distinctions or VOX must push semantics down.
export { linkInventory, untypedVias, growLinkTypes, createLinkLearner } from './learn-links.js';
// The role of an element by ablation — "remove it and see what reading changed" — done
// structurally over operator profiles, not by subtracting embeddings. The leave-one-out the
// Born rule already runs; the last embedder dependency dissolved into the operator basis.
export { propositionRoles } from './roles.js';
// Bond-level reanalysis — the garden-path recovery as the engine's own surprisal → re-retrieve
// → reconsolidate loop, one level below the basis REC. Composes the verb oracle (HOW
// conventions), γ-recency re-retrieval (the coref kernel), and a logged REC; the mis-bond
// stays on the append-only trail, so the garden path resolves auditably.
export { reanalyze, applyReanalysis } from './reanalyze.js';
// Meaning is not extracted — it is conjectured by a self and refuted by what follows. That
// mechanism already exists, fully, in the enactor's commit loop: the gate PROPOSES a
// candidate proposition (the conjecture), EVA/REC REFUTES it against the grounded basis and
// the deriveNull line (fluent hallucination cannot collapse; VOID is the conscience), and
// the SELF is the closed loop drawn by the efference copy + the one monitor + core/self.
// learn-links/corpus-relations measure what CAN be extracted as shared convention (the HOW,
// only form); the sense is conjectured live by that existing self — not by anything here.
export { persistentFigures, coherentFigures, motionReading, detectMotion } from './motion.js';
export { fieldVerdict, fieldIsVoid, ANSWERABLE_ALPHA } from './answerable.js';
export * from './sequence.js';
// The accumulation layer — fold the sentence-grain total read into adaptive coarse units
// (chapters/books or windows), each a reading of its own (figures, graded backbone,
// inter-proposition links, and the cube's cast/meaning domain split), and surf that coarse
// spine routed by the question's domain. This is what lets a whole-book question reach the
// regions it lives in without surfing every sentence at full resolution.
export { encodeLevels, detectGrain, coarseSurf, routeDomain, CAST_OPS, MEANING_OPS } from './levels.js';
// The MODELER (faculty #2): read the narrator's evaluative OPERATION into the theory-of-mind
// graph — owner-attributed (narrator, or ambiguous under free-indirect discourse), σ-side,
// divergence-preserving. NOT the machine's endorsement (faculty #3, the read-time evaluator,
// the veto guard's sibling on the rhetoric axis), which stays out of the graph as a node.
export { attributedEvaluation, NARRATOR } from './evaluation.js';
// Autopoietic holons by the Born rule — the grain DETECTED from the reading's own cast-closure
// (ρ over the cast, its eigenlenses the self-coupled communities) rather than imposed by chapter
// markers. The lens-switch boundaries are the cast-turnover surprise, so this is also the
// multi-grain surprise encoding. `holarchy` nests coarse arcs into their scenes.
export { detectHolons, holarchy } from './holons.js';
// Assemble the surf's reading of a question into a structured, saveable result — the regions it
// reaches, the cast, the cited bonds, the argument structure, and the narrator's owner-attributed
// evaluative stance. σ-side evidence for a reader/talker to judge; the verdict is not encoded.
export { surfToAnswer } from './answer.js';
// The spiral (REC): interpretation at level n becomes Existence at level n+1 — the three-fold
// closes on itself and climbs. `promote` re-stamps a verdict as the next level's source (owner=
// self), append-only; `spiralStep` re-reads it with a query-blind cut. The firewall is FRACTAL —
// query-blindness and the provenance stamp hold self-similarly at every storey, or the spiral
// degrades to a hall of mirrors (dreaming gone wrong / opinion laundered into fact).
export { promote, spiralStep, cutIsQueryBlind, provenanceIntact, SELF } from './spiral.js';
// Metacognition: the Born rule testing whether any content COHERES into a reading (meaningfulness
// = the spectrum concentrating above the noise floor) vs. a diffuse smear — the measurable gate
// the spiral consults before promoting a verdict (provenance retained). And traceReading makes the
// reading VISIBLE in EOT as it happens, so a chat shows what it parses through, not a spinner.
export { meaningfulness, metacognize, traceReading } from './metacognition.js';
// The reader — the ρ-side self that FEELS surprise (the interpretation level's live number, the
// me-ness against the accumulated Horizon ρ). `interpret` fills interpretation.surprise on a σ-side
// surf result at read-time (firewall held); `curiosity` is meta-surprise; `curiousSurf` lets the
// surf follow what it is curious about — the surprise gradient through the material, not keywords.
export { createReader, interpret, curiousSurf } from './reader.js';
