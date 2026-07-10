// EO contracts for the doc holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/doc/events.js': contract({ ops: ['INS'], targets: ['Void'], products: ['Entity'], stances: ['Making'], note: 'append-only edit-event log' }),
  'src/rooms/doc/ground.js': contract({ ops: ['CON', 'EVA'], targets: ['Field', 'Link'], products: ['Link', 'Lens'], stances: ['Binding'], note: 'the grounding check' }),
  'src/rooms/doc/history.js': contract({ ops: ['SEG', 'SYN'], targets: ['Field'], products: ['Network'], stances: ['Unraveling', 'Composing'], note: 'version-history timeline (audit)' }),
  'src/rooms/doc/index.js': contract({ ops: ['NUL', 'SEG', 'DEF', 'CON', 'EVA', 'INS', 'SYN'], targets: ['Void', 'Field', 'Link', 'Network'], products: ['Entity', 'Field', 'Link', 'Network', 'Lens', 'Void'], stances: ['Clearing', 'Dissecting', 'Unraveling', 'Binding', 'Tracing', 'Making', 'Composing'], note: 'barrel' }),
  'src/rooms/doc/project.js': contract({ ops: ['SYN'], targets: ['Field'], products: ['Network'], stances: ['Composing'], note: 'document = fold of log' }),
  'src/rooms/doc/render.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'Google-Docs page renderer' }),
  'src/rooms/doc/revise.js': contract({ ops: ['SEG', 'EVA', 'SYN'], targets: ['Field'], products: ['Field', 'Network'], stances: ['Dissecting', 'Tracing', 'Composing'], note: 'block-by-block revision core' }),
  'src/rooms/doc/surface.js': contract({ ops: ['INS', 'DEF'], targets: ['Void', 'Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'doc surface: mount + writer' }),
});
