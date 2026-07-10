// EO contracts for the enact holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/enact/index.js': contract({ ops: ['DEF', 'EVA', 'REC'], targets: ['Field', 'Entity', 'Network'], products: ['Lens', 'Paradigm'], stances: ['Making', 'Tracing', 'Composing'], note: 'enacted DEF-EVA-REC loop; barrel' }),
  'src/enactor/enact/meaning.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Atmosphere'], stances: ['Tracing'], note: 'meaning reader; 1-cos surprise' }),
  'src/enactor/enact/register.js': contract({ ops: ['EVA', 'DEF'], targets: ['Network'], products: ['Void'], stances: ['Binding', 'Dissecting'], note: 'register firewall; single-register guard' }),
  'src/enactor/enact/replay.js': contract({ ops: ['SEG', 'EVA'], targets: ['Network'], products: ['Lens', 'Paradigm'], stances: ['Unraveling', 'Tracing'], note: 'the fold; frames + loop stats' }),
  'src/enactor/enact/stance-fold.js': contract({ ops: ['DEF', 'EVA', 'REC'], targets: ['Atmosphere'], products: ['Lens', 'Paradigm'], stances: ['Making', 'Tracing', 'Composing'], note: 're-export shim; stance fold' }),
});
