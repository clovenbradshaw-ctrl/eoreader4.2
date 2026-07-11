// EO contracts for the coder — the Act/Site/Stance faces of the plain text → EOT →
// code pipeline (docs/eot-coder-roadmap.md). Validated by tests/contracts.test.js
// against the cube's coherence guard. See docs/eot-coder-checkpoint.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/coder/checkpoint.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Entity'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the assembly checkpoint — Appendix B typed errors read off the algebra (enactor door)' }),
  'src/coder/catalog.js': contract({ ops: ['DEF'], targets: ['Lens'], products: ['Paradigm'], stances: ['Dissecting'], note: 'the closed surface catalog + catalog-gap report — a pre-built vocabulary, never generated' }),
  'src/coder/mask.js': contract({ ops: ['SEG', 'EVA'], targets: ['Lens'], products: ['Paradigm'], stances: ['Unraveling', 'Tracing'], note: 'the semantic emission mask — the token-block errors made unsamplable (Stage 1)' }),
  'src/coder/emit.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'constrained emission — the model proposes, the mask disposes (Stage 1)' }),
  'src/coder/repair.js': contract({ ops: ['REC', 'EVA'], targets: ['Lens', 'Network'], products: ['Network'], stances: ['Composing', 'Binding'], note: 'the repair agent — typed errors consumed within the cap, else veto (Stage 3)' }),
  'src/coder/ledger.js': contract({ ops: ['INS', 'CON', 'SIG'], targets: ['Entity', 'Link'], products: ['Network'], stances: ['Making', 'Binding', 'Tending'], note: 'the signed build ledger + human-readable report — provenance as the product (Stage 4)' }),
  'src/coder/build.js': contract({ ops: ['SYN', 'CON', 'EVA', 'REC'], targets: ['Network', 'Lens'], products: ['Lens', 'Network'], stances: ['Composing', 'Binding', 'Tracing'], note: 'the pipeline mouth — perceive → emit → checkpoint → repair → ledger → report' }),
  'src/coder/index.js': contract({ ops: ['EVA', 'SIG', 'DEF', 'SEG', 'SYN', 'CON', 'REC'], targets: ['Network', 'Entity', 'Lens'], products: ['Lens', 'Paradigm', 'Network'], stances: ['Binding', 'Tracing', 'Dissecting', 'Unraveling', 'Composing'], note: 'barrel' }),
});
