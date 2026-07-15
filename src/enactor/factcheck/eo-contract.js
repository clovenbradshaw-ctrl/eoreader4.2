// EO contracts for the factcheck holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/factcheck/coref.js': contract({ ops: ['CON', 'EVA', 'SYN'], targets: ['Entity', 'Field'], products: ['Link', 'Atmosphere'], stances: ['Binding', 'Making'], note: 'coref-as-proposal' }),
  'src/enactor/factcheck/correspond.js': contract({ ops: ['CON', 'EVA'], targets: ['Field', 'Link', 'Network'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'edge-grounding veto / fact-checker' }),
  'src/enactor/factcheck/crosscheck.js': contract({ ops: ['EVA', 'SYN'], targets: ['Field', 'Network', 'Lens'], products: ['Lens', 'Network'], stances: ['Tracing', 'Composing'], note: 'cross-source conflict pass (P3)' }),
  'src/enactor/factcheck/index.js': contract({ ops: ['CON', 'EVA', 'SYN'], targets: ['Field', 'Link', 'Network'], products: ['Lens', 'Link'], stances: ['Binding', 'Composing'], note: 'barrel' }),
  'src/enactor/factcheck/propositions.js': contract({ ops: ['EVA', 'SYN'], targets: ['Field', 'Network', 'Lens'], products: ['Lens', 'Network'], stances: ['Binding', 'Composing'], note: 'proposition DEF-claim veto (P2)' }),
  'src/enactor/factcheck/quantities.js': contract({ ops: ['SIG', 'DEF'], targets: ['Field'], products: ['Lens'], stances: ['Tracing'], note: 'reading magnitudes + legibility out of prose' }),
});
