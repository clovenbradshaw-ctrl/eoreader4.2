// EO contracts for the chorus holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/chorus/born.js': contract({ ops: ['SIG', 'EVA'], targets: ['Field', 'Lens'], products: ['Field', 'Lens'], stances: ['Tending', 'Tracing'], note: 'the Born measure' }),
  'src/weave/chorus/fold.js': contract({ ops: ['INS'], targets: ['Field', 'Lens'], products: ['Entity'], stances: ['Making'], note: 'fold-voice minter' }),
  'src/weave/chorus/governor.js': contract({ ops: ['SEG'], targets: ['Field'], products: ['Field'], stances: ['Clearing'], note: 'coverage governor' }),
  'src/weave/chorus/index.js': contract({ ops: ['NUL', 'SEG', 'SIG', 'CON', 'EVA', 'INS'], targets: ['Field', 'Kind', 'Network'], products: ['Field', 'Network', 'Entity', 'Lens'], stances: ['Tending', 'Clearing', 'Making'], note: 'barrel' }),
  'src/weave/chorus/levels.js': contract({ ops: ['SEG', 'SIG'], targets: ['Field', 'Network'], products: ['Network'], stances: ['Unraveling', 'Tracing'], note: 'level governor, sketch' }),
  'src/weave/chorus/marginals.js': contract({ ops: ['SEG', 'SIG'], targets: ['Field', 'Kind'], products: ['Lens'], stances: ['Unraveling', 'Tending'], note: 'face marginals' }),
  'src/weave/chorus/probe.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'gate-zero probes' }),
  'src/weave/chorus/render.js': contract({ ops: ['CON', 'SEG'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Binding', 'Dissecting'], note: 'the render (weighted map)' }),
  'src/weave/chorus/vox.js': contract({ ops: ['NUL'], targets: ['Entity'], products: ['Void'], stances: ['Clearing'], note: 'vox leaf (out-organ)' }),
});
