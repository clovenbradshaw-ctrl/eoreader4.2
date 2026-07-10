// EO contracts for the tasks holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/frame/tasks/constants.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Network'], stances: ['Clearing'], note: 'runaway guards (re-export)' }),
  'src/frame/tasks/events.js': contract({ ops: ['INS'], targets: ['Void'], products: ['Entity'], stances: ['Making'], note: 'TaskEvent constructors (re-export)' }),
  'src/frame/tasks/grain.js': contract({ ops: ['DEF', 'EVA'], targets: ['Entity', 'Paradigm'], products: ['Lens'], stances: ['Dissecting', 'Binding'], note: 'cube reading of nodes (re-export)' }),
  'src/frame/tasks/index.js': contract({ ops: ['SEG', 'INS', 'SYN'], targets: ['Field', 'Network'], products: ['Network', 'Entity'], stances: ['Unraveling', 'Making', 'Composing'], note: 'barrel' }),
  'src/frame/tasks/learn.js': contract({ ops: ['REC', 'SEG'], targets: ['Field'], products: ['Paradigm'], stances: ['Composing', 'Unraveling'], note: 'learn shape from examples' }),
  'src/frame/tasks/node.js': contract({ ops: ['SYN', 'NUL'], targets: ['Network'], products: ['Field', 'Network'], stances: ['Composing', 'Clearing'], note: 'status rollup + output fold (re-export)' }),
  'src/frame/tasks/project.js': contract({ ops: ['SYN', 'CON'], targets: ['Field'], products: ['Network'], stances: ['Composing', 'Tracing'], note: 'log->graph projection (re-export)' }),
  'src/frame/tasks/runner.js': contract({ ops: ['SEG', 'INS', 'SYN'], targets: ['Field', 'Network'], products: ['Network', 'Entity', 'Field'], stances: ['Unraveling', 'Making', 'Composing'], note: 'runTaskGraph driver' }),
  'src/frame/tasks/spec.js': contract({ ops: ['DEF', 'SEG', 'REC'], targets: ['Void', 'Field', 'Paradigm'], products: ['Kind', 'Network', 'Paradigm'], stances: ['Dissecting', 'Unraveling', 'Composing'], note: 'task creator: request->spec->plan' }),
  'src/frame/tasks/templates.js': contract({ ops: ['NUL'], targets: ['Paradigm', 'Void'], products: ['Void', 'Paradigm'], stances: ['Tending'], note: 'templates store (JSON persist)' }),
});
