// EO contracts for the longgen holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/longgen/answerable.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Dissecting', 'Binding'], note: 'answerability gate (§3)' }),
  'src/weave/longgen/audit.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Paradigm'], products: ['Atmosphere', 'Lens'], stances: ['Tracing', 'Binding'], note: 'run audit + diagnose' }),
  'src/weave/longgen/compose.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Network'], stances: ['Tending'], note: 'back-compat face over walk' }),
  'src/weave/longgen/confine.js': contract({ ops: ['DEF', 'SIG'], targets: ['Link'], products: ['Lens'], stances: ['Dissecting', 'Binding'], note: 'holonic token confinement' }),
  'src/weave/longgen/continuation.js': contract({ ops: ['SYN', 'INS', 'EVA'], targets: ['Field', 'Atmosphere', 'Network'], products: ['Network'], stances: ['Composing', 'Making', 'Tracing'], note: 'the closure run forward' }),
  'src/weave/longgen/direction.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'predict next move (navigate)' }),
  'src/weave/longgen/field.js': contract({ ops: ['SEG', 'DEF'], targets: ['Field', 'Atmosphere', 'Paradigm'], products: ['Field'], stances: ['Unraveling', 'Clearing'], note: 'field read: turn boundaries' }),
  'src/weave/longgen/fold.js': contract({ ops: ['INS', 'EVA'], targets: ['Network', 'Paradigm'], products: ['Field', 'Lens'], stances: ['Making', 'Binding', 'Tracing'], note: 'fold prompt, best-of-n' }),
  'src/weave/longgen/generate.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Making', 'Binding'], note: 'planner on/off toggle' }),
  'src/weave/longgen/index.js': contract({ ops: ['SYN', 'INS', 'EVA'], targets: ['Field', 'Network', 'Atmosphere'], products: ['Network', 'Lens'], stances: ['Composing', 'Making', 'Tracing'], note: 'barrel' }),
  'src/weave/longgen/nul.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'hold the uncohered' }),
  'src/weave/longgen/progress.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Field'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'progress fold, how far' }),
  'src/weave/longgen/prompt.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Link'], products: ['Field', 'Link'], stances: ['Dissecting', 'Tracing'], note: 'prompt contract (§6/§9)' }),
  'src/weave/longgen/relax.js': contract({ ops: ['SYN', 'REC'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Composing', 'Making'], note: 'decision as relaxation' }),
  'src/weave/longgen/render.js': contract({ ops: ['DEF', 'SEG'], targets: ['Field'], products: ['Field'], stances: ['Dissecting', 'Clearing'], note: 'beat prompt as continuation' }),
  'src/weave/longgen/resolve.js': contract({ ops: ['CON', 'SEG'], targets: ['Field', 'Network'], products: ['Link'], stances: ['Binding', 'Dissecting'], note: 'plan->proposition resolver (§4.2)' }),
  'src/weave/longgen/shape.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field', 'Lens'], products: ['Lens'], stances: ['Unraveling', 'Tracing'], note: 'significance arc, phase bias' }),
  'src/weave/longgen/skeleton.js': contract({ ops: ['SEG'], targets: ['Field', 'Network'], products: ['Network'], stances: ['Unraveling'], note: 'output skeleton (SEG)' }),
  'src/weave/longgen/walk.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Field', 'Network'], products: ['Network'], stances: ['Composing', 'Binding', 'Tracing'], note: 'multi-paragraph walk' }),
  'src/weave/longgen/weld.js': contract({ ops: ['EVA', 'SEG'], targets: ['Field', 'Link'], products: ['Lens'], stances: ['Binding', 'Dissecting'], note: 'self-read weld' }),
});
