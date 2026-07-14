// EO contracts for the converse holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/turn/converse/cast.js': contract({ ops: ['DEF', 'EVA', 'REC'], targets: ['Entity', 'Field'], products: ['Entity', 'Paradigm'], stances: ['Dissecting', 'Binding', 'Composing'], note: 'conversation cast (source-activation memory)' }),
  'src/turn/converse/dialogue-state.js': contract({ ops: ['EVA', 'DEF', 'SIG'], targets: ['Field', 'Entity'], products: ['Lens', 'Paradigm'], stances: ['Dissecting', 'Binding', 'Tracing'], note: 'dialogue state / operator-addressed resolver' }),
  'src/turn/converse/focus.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field'], products: ['Lens'], stances: ['Binding', 'Tending'], note: 'conversation-aware retrieval (regex path)' }),
  'src/turn/converse/gender.js': contract({ ops: ['SIG', 'EVA'], targets: ['Atmosphere', 'Entity'], products: ['Lens', 'Link'], stances: ['Tending', 'Binding'], note: 'pronoun gender agreement (role/spouse read)' }),
  'src/turn/converse/history.js': contract({ ops: ['SEG', 'NUL'], targets: ['Field'], products: ['Field'], stances: ['Clearing', 'Dissecting'], note: 'session-register fold' }),
  'src/turn/converse/index.js': contract({ ops: ['EVA', 'SIG', 'DEF', 'SEG', 'REC', 'NUL'], targets: ['Field', 'Entity', 'Atmosphere', 'Link'], products: ['Lens', 'Entity', 'Atmosphere', 'Paradigm', 'Field'], stances: ['Binding', 'Tending', 'Dissecting', 'Tracing', 'Composing', 'Clearing'], note: 'barrel' }),
  'src/turn/converse/provenance.js': contract({ ops: ['SIG', 'EVA'], targets: ['Entity', 'Atmosphere'], products: ['Atmosphere', 'Lens'], stances: ['Tending', 'Binding'], note: 'conversational provenance / talker deposition' }),
  'src/turn/converse/reference.js': contract({ ops: ['DEF', 'SIG', 'EVA'], targets: ['Entity', 'Field', 'Link'], products: ['Entity', 'Atmosphere'], stances: ['Binding', 'Dissecting', 'Tracing'], note: 'reference by reading / referent resolver' }),
});
