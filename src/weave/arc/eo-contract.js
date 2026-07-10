// EO contracts for the arc holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/arc/assemble.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'third fold: assemble answer' }),
  'src/weave/arc/cluster.js': contract({ ops: ['SIG', 'SYN'], targets: ['Field'], products: ['Network'], stances: ['Tending', 'Composing'], note: 'supply: bindable spans, clusters' }),
  'src/weave/arc/constants.js': contract({ ops: ['NUL'], targets: ['Atmosphere'], products: ['Atmosphere'], stances: ['Clearing'], note: 'arc thresholds and priors' }),
  'src/weave/arc/generate.js': contract({ ops: ['INS'], targets: ['Field'], products: ['Entity'], stances: ['Making'], note: 'generate one section' }),
  'src/weave/arc/index.js': contract({ ops: ['SEG', 'SIG', 'CON', 'SYN', 'INS', 'EVA', 'DEF', 'NUL'], targets: ['Void', 'Field', 'Network', 'Kind', 'Atmosphere'], products: ['Void', 'Entity', 'Kind', 'Field', 'Network', 'Lens', 'Atmosphere'], stances: ['Clearing', 'Dissecting', 'Tending', 'Binding', 'Tracing', 'Making', 'Composing'], note: 'barrel' }),
  'src/weave/arc/pipeline.js': contract({ ops: ['SYN', 'CON', 'EVA', 'NUL'], targets: ['Field', 'Network'], products: ['Network', 'Void'], stances: ['Composing', 'Binding', 'Tracing', 'Clearing'], note: 'runArc: fold section plan' }),
  'src/weave/arc/plan.js': contract({ ops: ['SEG'], targets: ['Network', 'Kind'], products: ['Field'], stances: ['Dissecting'], note: 'reconcile demand and supply' }),
  'src/weave/arc/saturation.js': contract({ ops: ['EVA'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'saturation stop-gate' }),
  'src/weave/arc/scope.js': contract({ ops: ['DEF'], targets: ['Void'], products: ['Kind'], stances: ['Dissecting'], note: 'demand: classify question scope' }),
});
