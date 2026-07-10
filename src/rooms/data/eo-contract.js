// EO contracts for the data holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/data/index.js': contract({ ops: ['NUL', 'SIG', 'EVA'], targets: ['Field'], products: ['Lens', 'Void'], stances: ['Binding', 'Clearing'], note: 'barrel' }),
  'src/rooms/data/query.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field'], products: ['Lens'], stances: ['Binding'], note: 'table Q&A / answerTable' }),
  'src/rooms/data/render.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'table->HTML renderer' }),
  'src/rooms/data/surface.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'data view mount' }),
});
