// EO contracts for the answer holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/answer/index.js': contract({ ops: ['EVA', 'DEF', 'NUL'], targets: ['Void', 'Field', 'Link', 'Network', 'Entity', 'Lens'], products: ['Lens', 'Void'], stances: ['Binding', 'Dissecting', 'Clearing'], note: 'barrel' }),
  'src/enactor/answer/math.js': contract({ ops: ['EVA', 'DEF'], targets: ['Void'], products: ['Lens'], stances: ['Binding', 'Dissecting'], note: 'the math answerer (math.js)' }),
  'src/enactor/answer/mechanical.js': contract({ ops: ['EVA', 'DEF', 'NUL'], targets: ['Void', 'Field', 'Link', 'Network', 'Entity'], products: ['Lens', 'Void'], stances: ['Binding', 'Dissecting', 'Clearing'], note: 'mechanical answerers (confirm/relation/who/smalltalk)' }),
  'src/enactor/answer/metadata.js': contract({ ops: ['DEF'], targets: ['Entity'], products: ['Lens'], stances: ['Dissecting'], note: 'front-matter / metadata answerer' }),
  'src/enactor/answer/void.js': contract({ ops: ['NUL', 'DEF'], targets: ['Field', 'Lens'], products: ['Void'], stances: ['Clearing'], note: 'typed absence / void answer' }),
});
