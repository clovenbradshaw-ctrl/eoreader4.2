// EO contracts for the code-holon perceiver — the Act/Site/Stance faces of every
// module, with the Site face split into targets (what it reads) and products
// (what it writes). Validated by tests/contracts.test.js against the cube's
// coherence guard. See docs/eo-for-coders.md and docs/code-holons.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/perceiver/code/scope.js': contract({ ops: ['EVA'], targets: ['Network'], products: ['Lens'], stances: ['Tracing'], note: 'lexical scope resolution over code facts — the shared binding walk' }),
  'src/perceiver/code/fingerprint.js': contract({ ops: ['SIG'], targets: ['Entity'], products: ['Entity'], stances: ['Binding'], note: 'the five-hash fingerprint — what might survive movement or cosmetic change' }),
  'src/perceiver/code/holon.js': contract({ ops: ['SEG', 'INS'], targets: ['Field'], products: ['Entity'], stances: ['Dissecting', 'Making'], note: 'holon admission — which structural facts earn persistent identity' }),
  'src/perceiver/code/identity.js': contract({ ops: ['CON', 'EVA'], targets: ['Entity'], products: ['Link', 'Lens'], stances: ['Binding', 'Tracing'], note: 'witness/anchor/fingerprint identity reconciliation across an edit' }),
  'src/perceiver/code/change-reading.js': contract({ ops: ['DEF', 'EVA'], targets: ['Lens'], products: ['Lens'], stances: ['Dissecting', 'Tracing'], note: 'the three-axis ChangeReading + the equivalence ladder' }),
  'src/perceiver/code/nul.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Void'], stances: ['Clearing'], note: 'the typed NUL ledger — parse gaps, dynamic binding, missing dependencies' }),
  'src/perceiver/code/propagation.js': contract({ ops: ['CON', 'SIG'], targets: ['Network'], products: ['Network', 'Lens'], stances: ['Binding', 'Tracing'], note: 'typed dependency edges + the soundness-gate staleness propagation' }),
  'src/perceiver/code/events.js': contract({ ops: ['SIG', 'SYN'], targets: ['Entity', 'Link'], products: ['Network'], stances: ['Tending', 'Composing'], note: 'the typed operator event log — a reconciliation pass narrated in the nine-operator roster' }),
  'src/perceiver/code/index.js': contract({ ops: ['SEG', 'INS', 'CON', 'EVA'], targets: ['Void', 'Field'], products: ['Entity', 'Lens'], stances: ['Dissecting', 'Making', 'Binding', 'Tracing'], note: 'readCodeChange — the code-holon perceiver\'s one mouth' }),
});
