// EO: SYN·INS·EVA(Field,Network,Atmosphere → Network,Paradigm,Lens, Composing,Making,Tracing) — barrel
// The commission holon — the creature that drafts a multi-response piece, decides what to read for
// inspiration, hunts it on the open internet (Project Gutenberg first, the open academic archives
// for scholarly form), reads its EOT STRUCTURE off the reading, and shapes each response
// semiotically toward that structure — carried across turns.
//
// One entrance. Sub-modules:
//   brief.js      read the ask → { deliverable, exemplar, topic, register }        (DIFFERENTIATE)
//   template.js   an exemplar reading → the EOT StyleTemplate (grammar·arc·voice)  (the STRUCTURE)
//   inspire.js    navigate structure-space to decide what would be a good model    (the CHOICE)
//   hunt.js       fetch the chosen exemplar(s) from the libraries, role-tagged      (the READING)
//   shape.js      thread the template into the generation loop                      (the SHAPING)
//   plan.js       draft the multi-response spine, arced to the exemplar             (the PLAN)
//   commission.js the orchestrator, resumable across responses                      (the CLOSURE)

export {
  readCommission, describeBrief,
} from './brief.js';

export {
  extractStyleTemplate, styleVectorOf, styleVectorFrom, styleDistance, describeTemplate,
  blendTemplates, surfaceOf, arcOf, fingerprintOf, PHASE_OPS, STYLE_DIMS,
} from './template.js';

export {
  targetStyleVector, chooseInspiration, rankCandidates, scoreCandidate, scoreByStructure,
  nameAnchor, formFit, qualityPrior, topicResonance, DELIVERABLE_TARGETS,
} from './inspire.js';

export {
  huntCandidates, fetchExemplar, huntQueries, libraryKindsFor, STYLE_ROLE,
} from './hunt.js';

export {
  shapeOptions, styleGuidance, arcBiasAt, shapeTrace,
} from './shape.js';

export {
  draftPlan, describePlan,
} from './plan.js';

export {
  openCommission, confirmCommission, advanceCommission, nextResponseOptions,
  currentSection, serializeCommission, resumeCommission, excerptForTemplate,
} from './commission.js';
