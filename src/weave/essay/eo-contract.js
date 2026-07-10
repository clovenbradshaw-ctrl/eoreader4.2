// EO contracts for the essay holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/essay/carry.js': contract({ ops: ['SYN', 'NUL', 'SEG'], targets: ['Field', 'Link'], products: ['Field'], stances: ['Composing', 'Clearing'], note: 'the doorway carry / chunk' }),
  'src/weave/essay/driver.js': contract({ ops: ['SYN', 'CON', 'EVA', 'DEF'], targets: ['Field', 'Network', 'Link'], products: ['Network', 'Link', 'Lens'], stances: ['Composing', 'Binding', 'Making'], note: 'runEssay — section loop / writer' }),
  'src/weave/essay/events.js': contract({ ops: ['INS', 'DEF'], targets: ['Void'], products: ['Entity', 'Kind'], stances: ['Making', 'Dissecting'], note: 'EssayEvent constructors + kinds' }),
  'src/weave/essay/gates.js': contract({ ops: ['EVA'], targets: ['Field', 'Link'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'five coherence gates' }),
  'src/weave/essay/index.js': contract({ ops: ['SYN', 'CON', 'EVA', 'DEF'], targets: ['Field', 'Network', 'Link'], products: ['Network', 'Link', 'Lens'], stances: ['Composing', 'Binding', 'Making'], note: 'barrel' }),
  'src/weave/essay/live.js': contract({ ops: ['NUL', 'SIG'], targets: ['Network'], products: ['Void'], stances: ['Clearing', 'Binding'], note: 'live panel re-projection' }),
  'src/weave/essay/project.js': contract({ ops: ['SYN', 'CON'], targets: ['Field', 'Network'], products: ['Network'], stances: ['Composing', 'Tracing'], note: 'projectEssay — the log fold' }),
  'src/weave/essay/proposition.js': contract({ ops: ['INS', 'EVA', 'SIG'], targets: ['Field', 'Entity'], products: ['Entity', 'Lens'], stances: ['Making', 'Binding'], note: 'typed proposition payload' }),
  'src/weave/essay/reconcile.js': contract({ ops: ['EVA'], targets: ['Network'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'global reconciliation pass' }),
  'src/weave/essay/renderers.js': contract({ ops: ['NUL', 'EVA'], targets: ['Link'], products: ['Void', 'Lens'], stances: ['Clearing', 'Binding'], note: 'surface renderers + validator' }),
  'src/weave/essay/spine.js': contract({ ops: ['SYN', 'CON', 'SEG'], targets: ['Field', 'Network'], products: ['Network'], stances: ['Composing', 'Tracing', 'Dissecting'], note: 'the spine DAG' }),
  'src/weave/essay/terms.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Link'], products: ['Lens'], stances: ['Binding', 'Tending'], note: 'term-overlap / polarity checks' }),
});
