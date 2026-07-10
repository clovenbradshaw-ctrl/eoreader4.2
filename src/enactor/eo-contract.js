// EO contracts for the enactor holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/basis.js': contract({ ops: ['SEG', 'SYN'], targets: ['Field', 'Network'], products: ['Network', 'Void'], stances: ['Dissecting', 'Composing'], note: 'surf → grounded basis' }),
  'src/enactor/efference.js': contract({ ops: ['INS'], targets: ['Link'], products: ['Entity'], stances: ['Making'], note: 'efference copy' }),
  'src/enactor/gate.js': contract({ ops: ['DEF', 'EVA', 'REC'], targets: ['Network', 'Link'], products: ['Lens', 'Void', 'Entity'], stances: ['Binding', 'Making', 'Composing'], note: 'the collapse / gate' }),
  'src/enactor/index.js': contract({ ops: ['DEF', 'EVA', 'REC'], targets: ['Network', 'Link'], products: ['Lens', 'Atmosphere'], stances: ['Binding', 'Making', 'Composing'], note: 'barrel' }),
  'src/enactor/monitor.js': contract({ ops: ['EVA', 'SIG'], targets: ['Link', 'Entity'], products: ['Atmosphere'], stances: ['Binding', 'Tending'], note: 'the one monitor' }),
  'src/enactor/props.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Link'], products: ['Link'], stances: ['Dissecting', 'Binding'], note: 'proposition unit + EVA measure' }),
});
