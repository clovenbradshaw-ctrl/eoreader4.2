// EO contracts for the code organ — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/code-organ.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/organs/code/facts.js': contract({ ops: ['SEG', 'SIG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Dissecting', 'Tending', 'Making'], note: 'structural reading: source → code facts (parser membrane)' }),
  'src/organs/code/eot.js': contract({ ops: ['INS', 'DEF', 'CON'], targets: ['Field'], products: ['Entity', 'Link', 'Network'], stances: ['Making', 'Dissecting', 'Binding'], note: 'lowering: code facts → EOT surface (perceiver door)' }),
  'src/organs/code/helix.js': contract({ ops: ['SEG', 'SYN'], targets: ['Network'], products: ['Network'], stances: ['Unraveling', 'Composing'], note: 'the dependency order — helix at corpus grain (Tarjan)' }),
  'src/organs/code/issues.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Entity'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the fold: dependency-order judgments (enactor door)' }),
  'src/organs/code/index.js': contract({ ops: ['SEG', 'CON', 'SYN', 'EVA'], targets: ['Void', 'Network'], products: ['Network', 'Lens'], stances: ['Dissecting', 'Binding', 'Composing', 'Tracing'], note: 'barrel' }),
  'src/organs/code/read.js': contract({ ops: ['SEG', 'CON', 'SYN', 'EVA'], targets: ['Void', 'Network'], products: ['Network', 'Lens'], stances: ['Dissecting', 'Binding', 'Composing', 'Tracing'], note: 'readCodebase — the organ\'s mouth (a leaf the barrel and the merge share)' }),
  'src/organs/code/compose.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'the generative direction — EOT blueprint → working code, gated by the organ' }),
  'src/organs/code/python.js': contract({ ops: ['SEG', 'SIG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Dissecting', 'Tending', 'Making'], note: 'Python provider — structural reading + witnessed hazards (membrane)' }),
  'src/organs/code/fix.js': contract({ ops: ['REC', 'EVA'], targets: ['Lens'], products: ['Field'], stances: ['Composing', 'Binding'], note: 'merge issues into the preserved original (re-read verified)' }),
  'src/organs/code/widget.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'EOT blueprint → a full HTML widget, gated by the organ' }),
  'src/organs/code/harvest.js': contract({ ops: ['CON', 'SYN', 'EVA'], targets: ['Void', 'Network'], products: ['Network', 'Lens'], stances: ['Binding', 'Composing', 'Tracing'], note: 'the record\'s gaps drive the search — pieces foraged off the web' }),
  'src/organs/code/go.js': contract({ ops: ['SEG', 'SIG'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Dissecting', 'Tending'], note: 'Go provider — witnessed concurrency/aliasing hazards (membrane)' }),
  'src/organs/code/rust.js': contract({ ops: ['SEG', 'SIG'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Dissecting', 'Tending'], note: 'Rust provider — witnessed panic/identity hazards (membrane)' }),
  'src/organs/code/page.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'generic element tree → a whole page, styling foraged not hardcoded' }),
  'src/organs/code/style.js': contract({ ops: ['DEF', 'EVA', 'SIG'], targets: ['Atmosphere'], products: ['Lens', 'Atmosphere'], stances: ['Making', 'Binding', 'Tending'], note: 'holon-addressed style edits + the Atmosphere contrast checkpoint' }),
});
