// EO contracts for the perceiver holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/perceiver/equivalence.js': contract({ ops: ['SYN', 'NUL', 'DEF'], targets: ['Field', 'Entity'], products: ['Kind', 'Network'], stances: ['Composing'], note: 'emergent equivalence (MNN merge)' }),
  'src/perceiver/index.js': contract({ ops: ['EVA', 'SIG', 'SYN', 'REC'], targets: ['Network', 'Field'], products: ['Lens', 'Network'], stances: ['Binding', 'Tracing', 'Composing'], note: 'barrel' }),
  'src/perceiver/parse/boundaries.js': contract({ ops: ['EVA', 'REC', 'DEF'], targets: ['Field'], products: ['Paradigm'], stances: ['Composing'], note: 'boundary induction (meaning revises syntax)' }),
  'src/perceiver/parse/chrome.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Void'], stances: ['Clearing'], note: 'degenerate-line guard' }),
  'src/perceiver/parse/clause-layer.js': contract({ ops: ['SEG'], targets: ['Field'], products: ['Field', 'Link'], stances: ['Dissecting'], note: 'clause grain layer' }),
  'src/perceiver/parse/clauses.js': contract({ ops: ['SEG'], targets: ['Field'], products: ['Field'], stances: ['Dissecting'], note: 'clause segmentation (§8)' }),
  'src/perceiver/parse/coref.js': contract({ ops: ['SIG', 'SYN'], targets: ['Entity'], products: ['Field', 'Link'], stances: ['Tending', 'Making'], note: 'coref field (referent traces)' }),
  'src/perceiver/parse/entities.js': contract({ ops: ['INS', 'SIG', 'SYN'], targets: ['Void'], products: ['Entity', 'Network'], stances: ['Making'], note: 'entity admission by gravity' }),
  'src/perceiver/parse/frame.js': contract({ ops: ['SEG'], targets: ['Field'], products: ['Field'], stances: ['Clearing'], note: 'structural frame (banner bracket)' }),
  'src/perceiver/parse/fuzzy.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Link'], stances: ['Binding'], note: 'bounded edit distance' }),
  'src/perceiver/parse/index.js': contract({ ops: ['SEG', 'INS', 'CON', 'SYN', 'DEF'], targets: ['Void', 'Field'], products: ['Network', 'Entity', 'Field'], stances: ['Composing'], note: 'barrel' }),
  'src/perceiver/parse/metadata.js': contract({ ops: ['SIG', 'REC'], targets: ['Void'], products: ['Atmosphere', 'Paradigm'], stances: ['Tending'], note: 'front-matter metadata harvest' }),
  'src/perceiver/parse/naming.js': contract({ ops: ['SYN', 'NUL'], targets: ['Field', 'Entity'], products: ['Network'], stances: ['Making'], note: 'naming-scene coref (vocative↔role)' }),
  'src/perceiver/parse/pipeline.js': contract({ ops: ['INS', 'CON', 'SYN'], targets: ['Void'], products: ['Network', 'Field'], stances: ['Composing'], note: 'parse orchestrator (text→doc)' }),
  'src/perceiver/parse/proposition.js': contract({ ops: ['SEG', 'EVA'], targets: ['Field', 'Link'], products: ['Link'], stances: ['Dissecting'], note: 'argument-span SEG (S/V/O)' }),
  'src/perceiver/parse/relations.js': contract({ ops: ['CON', 'SIG', 'DEF'], targets: ['Field', 'Entity'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'relation extraction (CON/SIG/DEF)' }),
  'src/perceiver/parse/sentences.js': contract({ ops: ['SEG', 'EVA'], targets: ['Void'], products: ['Field'], stances: ['Clearing'], note: 'sentence segmentation' }),
  'src/perceiver/parse/tokenize.js': contract({ ops: ['SEG'], targets: ['Void'], products: ['Field'], stances: ['Clearing'], note: 'the single tokenizer' }),
  'src/perceiver/predict.js': contract({ ops: ['EVA'], targets: ['Field'], products: ['Lens'], stances: ['Tracing'], note: 'predictive-coding surprise' }),
  'src/perceiver/proposition-equivalence.js': contract({ ops: ['EVA', 'SYN', 'REC'], targets: ['Link', 'Field'], products: ['Network', 'Kind'], stances: ['Composing', 'Binding'], note: 'same-assertion attest' }),
  'src/perceiver/reading.js': contract({ ops: ['REC', 'EVA'], targets: ['Network'], products: ['Lens'], stances: ['Tracing'], note: 'L3 significance (predict/surprise)' }),
  'src/perceiver/referent-nesting.js': contract({ ops: ['CON', 'SYN'], targets: ['Network', 'Entity'], products: ['Network'], stances: ['Tracing'], note: 'holonic containment address' }),
  'src/perceiver/referent.js': contract({ ops: ['EVA'], targets: ['Field'], products: ['Lens'], stances: ['Binding'], note: 'referential confidence' }),
  'src/perceiver/site.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Dissecting'], note: 'site vs figure role' }),
  'src/perceiver/spine.js': contract({ ops: ['EVA', 'SEG'], targets: ['Network', 'Field'], products: ['Field'], stances: ['Tracing'], note: 'significance spine / turning points' }),
  'src/perceiver/surfaces.js': contract({ ops: ['SIG', 'NUL'], targets: ['Network', 'Field'], products: ['Lens', 'Void'], stances: ['Binding', 'Clearing'], note: '3 reading surfaces + note render' }),
});
