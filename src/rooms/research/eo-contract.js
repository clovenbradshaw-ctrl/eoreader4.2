// EO contracts for the research holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/research/driver.js': contract({ ops: ['SYN', 'EVA', 'REC'], targets: ['Field', 'Network'], products: ['Network', 'Paradigm'], stances: ['Composing', 'Tracing'], note: 'runGroundedResearch — the writer' }),
  'src/rooms/research/events.js': contract({ ops: ['INS', 'NUL'], targets: ['Void'], products: ['Entity'], stances: ['Making', 'Clearing'], note: 'ResearchEvent constructors / log' }),
  'src/rooms/research/index.js': contract({ ops: ['DEF', 'SYN', 'CON', 'EVA', 'REC', 'SIG', 'INS', 'NUL'], targets: ['Void', 'Field', 'Network'], products: ['Entity', 'Network', 'Paradigm', 'Void', 'Atmosphere'], stances: ['Making', 'Clearing', 'Composing', 'Tracing', 'Tending'], note: 'barrel' }),
  'src/rooms/research/live.js': contract({ ops: ['NUL', 'SIG'], targets: ['Network', 'Entity'], products: ['Void', 'Atmosphere'], stances: ['Clearing', 'Tending'], note: 'liveView — live process view' }),
  'src/rooms/research/project.js': contract({ ops: ['SYN', 'EVA'], targets: ['Network'], products: ['Network'], stances: ['Composing', 'Tracing'], note: 'projectReport — the pure fold' }),
  'src/rooms/research/render.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'report → HTML renderer' }),
  'src/rooms/research/session.js': contract({ ops: ['NUL', 'SIG'], targets: ['Network'], products: ['Void', 'Atmosphere'], stances: ['Clearing', 'Tending'], note: 'session state / chat reply' }),
  'src/rooms/research/surface.js': contract({ ops: ['NUL', 'SIG'], targets: ['Void', 'Network'], products: ['Void'], stances: ['Clearing', 'Tending'], note: 'mountResearchSurface — the DOM UI' }),
});
