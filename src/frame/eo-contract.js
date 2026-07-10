// EO contracts for the frame holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/frame/bind.js': contract({ ops: ['EVA', 'DEF', 'REC'], targets: ['Network', 'Link'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'decideBind — the bind decision' }),
  'src/frame/constants.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Void'], stances: ['Clearing'], note: 'runaway guards (depth/fanout/nodes)' }),
  'src/frame/events.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Field'], stances: ['Tending'], note: 'append-only event log (TaskEvent kinds + bind)' }),
  'src/frame/grain.js': contract({ ops: ['DEF', 'EVA'], targets: ['Network', 'Paradigm'], products: ['Lens', 'Kind'], stances: ['Dissecting', 'Binding'], note: 'the cube reading + confab guard' }),
  'src/frame/index.js': contract({ ops: ['NUL', 'SYN', 'CON', 'EVA', 'DEF', 'REC'], targets: ['Field', 'Network', 'Paradigm'], products: ['Network', 'Lens', 'Field'], stances: ['Composing', 'Binding', 'Tracing'], note: 'barrel' }),
  'src/frame/node.js': contract({ ops: ['SYN', 'EVA'], targets: ['Network'], products: ['Network', 'Field'], stances: ['Composing', 'Tracing'], note: 'statuses, rollups, leaf folds' }),
  'src/frame/project.js': contract({ ops: ['SYN', 'CON'], targets: ['Field'], products: ['Network'], stances: ['Composing', 'Tracing'], note: 'projectFrameStack — the read/fold' }),
});
