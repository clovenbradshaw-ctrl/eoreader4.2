// EO contracts for the reader holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/reader/app.js': contract({ ops: ['CON', 'INS'], targets: ['Network', 'Void'], products: ['Entity', 'Link'], stances: ['Making', 'Binding'], note: 'the reader session controller' }),
  'src/rooms/reader/boot.js': contract({ ops: ['CON', 'SIG'], targets: ['Network', 'Field'], products: ['Link'], stances: ['Binding', 'Tending'], note: 'the surface↔engine membrane' }),
  'src/rooms/reader/chat-export.js': contract({ ops: ['NUL', 'SEG'], targets: ['Field'], products: ['Void'], stances: ['Clearing', 'Dissecting'], note: 'chat + audit export renderer' }),
  'src/rooms/reader/eo-gen.js': contract({ ops: ['EVA', 'DEF'], targets: ['Lens', 'Link'], products: ['Lens', 'Atmosphere'], stances: ['Tracing', 'Making'], note: 'browser grounding seam' }),
  'src/rooms/reader/eo/chorus.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Paradigm'], products: ['Paradigm'], stances: ['Tracing'], note: 'chorus Born-measure reader' }),
  'src/rooms/reader/eo/embed.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Atmosphere'], stances: ['Tending'], note: 'MiniLM meaning embedder organ' }),
  'src/rooms/reader/eo/phasepost.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Kind'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'geometric cell classifier' }),
  'src/rooms/reader/eo/vision.js': contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Atmosphere'], stances: ['Making', 'Tending'], note: 'Florence-2 vision organ eye' }),
  'src/rooms/reader/import-file.js': contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Field'], stances: ['Making', 'Tending'], note: 'file import router (organs)' }),
  'src/rooms/reader/model-entry.js': contract({ ops: ['INS', 'SYN', 'DEF'], targets: ['Field', 'Network'], products: ['Entity', 'Lens'], stances: ['Making', 'Composing'], note: 'barrel: models + longgen' }),
  'src/rooms/reader/monologue-surface.js': contract({ ops: ['NUL', 'EVA'], targets: ['Atmosphere', 'Network'], products: ['Void'], stances: ['Clearing', 'Tending'], note: 'inner-monologue surface' }),
  'src/rooms/reader/reading-surface.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'reading-JSONL DOM surface' }),
  'src/rooms/reader/section-answer.js': contract({ ops: ['SEG', 'DEF'], targets: ['Field', 'Link'], products: ['Field', 'Lens'], stances: ['Dissecting', 'Making'], note: 'section headings by field-shift' }),
  'src/rooms/reader/tiered-graph.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'tiered graph SVG renderer' }),
  'src/rooms/reader/transcript-export.js': contract({ ops: ['NUL', 'SEG'], targets: ['Field'], products: ['Void'], stances: ['Clearing', 'Dissecting'], note: 'transcript export renderer' }),
});
