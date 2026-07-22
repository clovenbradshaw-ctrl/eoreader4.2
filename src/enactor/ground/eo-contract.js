// EO contracts for the ground holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/ground/archon.js': contract({ ops: ['EVA', 'CON'], targets: ['Link', 'Network'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the write-time source gate — admit a sentence only if it sources (archonReview)' }),
  'src/enactor/ground/bind.js': contract({ ops: ['CON'], targets: ['Field', 'Entity'], products: ['Link'], stances: ['Binding'], note: 'citation binder (bindCitations)' }),
  'src/enactor/ground/compose.js': contract({ ops: ['EVA', 'CON'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the span-grounding chain composed once — segment → groundSpans → groundSummary → supportVerdict (groundText)' }),
  'src/enactor/ground/corroboration.js': contract({ ops: ['EVA', 'DEF'], targets: ['Network', 'Link'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'meaningfully-distinct-source measure (underCorroborated)' }),
  'src/enactor/ground/index.js': contract({ ops: ['CON', 'EVA'], targets: ['Field', 'Link', 'Network'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'barrel' }),
  'src/enactor/ground/provenance.js': contract({ ops: ['EVA'], targets: ['Link', 'Network'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'per-proposition provenance (classifyProvenance)' }),
  'src/enactor/ground/reflect.js': contract({ ops: ['EVA', 'CON'], targets: ['Network', 'Link'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'answer reflection (reflectAnswer)' }),
  'src/enactor/ground/section.js': contract({ ops: ['CON', 'EVA'], targets: ['Field', 'Lens'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'per-section bind+veto (bindAndVeto)' }),
  'src/enactor/ground/spans.js': contract({ ops: ['EVA', 'CON'], targets: ['Field', 'Network'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'per-span provenance + badge (groundSpans)' }),
  'src/enactor/ground/synonym-promotion.js': contract({ ops: ['EVA', 'REC'], targets: ['Network', 'Field'], products: ['Kind', 'Paradigm'], stances: ['Binding', 'Composing'], note: 'the crosswalk that learns — a corroborated cross-source synonym pair promoted to a standing engine-tier candidate (docs/coreference-timeline.md)' }),
  'src/enactor/ground/validate.js': contract({ ops: ['EVA'], targets: ['Link', 'Lens'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the answer weighed by the reader’s own reaction, Born-measured (assessAnswer)' }),
  'src/enactor/ground/veto.js': contract({ ops: ['EVA'], targets: ['Link', 'Lens'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the veto battery (runVetoes)' }),
  'src/enactor/ground/row-veto.js': contract({ ops: ['EVA'], targets: ['Lens'], products: ['Lens'], stances: ['Binding'], note: 'the row-level veto battery — bidirectional entailment + fabrication (bidirectionallyEntails, ROW_VETOES, runRowVetoes)' }),
});
