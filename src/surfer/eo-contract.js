// EO contracts for the surfer holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/answer.js': contract({ ops: ['SYN', 'SIG'], targets: ['Network', 'Field'], products: ['Network', 'Void'], stances: ['Composing', 'Binding'], note: 'surf reading → answer object' }),
  'src/surfer/answerable.js': contract({ ops: ['EVA', 'DEF', 'NUL'], targets: ['Field', 'Entity'], products: ['Void'], stances: ['Clearing', 'Tending'], note: 'answerability — is field void' }),
  'src/surfer/atmosphere.js': contract({ ops: ['SIG', 'EVA'], targets: ['Field', 'Atmosphere'], products: ['Atmosphere'], stances: ['Tending', 'Tracing'], note: 'the Atmosphere pass' }),
  'src/surfer/evaluation.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Atmosphere'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'the modeler — narrator evaluation' }),
  'src/surfer/grow-basis.js': contract({ ops: ['REC', 'EVA'], targets: ['Paradigm', 'Void'], products: ['Paradigm'], stances: ['Composing', 'Cultivating'], note: 'the growing basis' }),
  'src/surfer/helix-predict.js': contract({ ops: ['EVA', 'REC', 'SYN'], targets: ['Field', 'Network'], products: ['Paradigm', 'Field'], stances: ['Tracing', 'Composing'], note: 'helix-aware predictor' }),
  'src/surfer/holons.js': contract({ ops: ['SEG', 'SYN', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Field'], stances: ['Unraveling', 'Composing', 'Binding'], note: 'autopoietic holons by Born rule' }),
  'src/surfer/horizon.js': contract({ ops: ['SYN', 'REC', 'EVA'], targets: ['Field', 'Lens'], products: ['Network', 'Lens'], stances: ['Composing', 'Tracing'], note: 'persistent Horizon — ρ across turns' }),
  'src/surfer/index.js': contract({ ops: ['SEG', 'SYN', 'EVA', 'REC', 'DEF'], targets: ['Field', 'Link', 'Network'], products: ['Field', 'Network', 'Lens', 'Paradigm'], stances: ['Dissecting', 'Composing', 'Tracing', 'Clearing'], note: 'barrel' }),
  'src/surfer/layered-generator.js': contract({ ops: ['SYN', 'REC'], targets: ['Field', 'Paradigm'], products: ['Network'], stances: ['Composing', 'Making'], note: 'layered generative stack' }),
  'src/surfer/learn-links.js': contract({ ops: ['REC', 'EVA'], targets: ['Link', 'Field'], products: ['Kind', 'Paradigm'], stances: ['Composing', 'Binding'], note: 'grow link-types from labels' }),
  'src/surfer/levels.js': contract({ ops: ['SEG', 'SYN', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Field'], stances: ['Unraveling', 'Composing', 'Tracing'], note: 'multi-grain coarse spine' }),
  'src/surfer/metacognition.js': contract({ ops: ['EVA', 'NUL'], targets: ['Field'], products: ['Lens', 'Void'], stances: ['Binding', 'Clearing'], note: 'meaningfulness + visible trace' }),
  'src/surfer/motion.js': contract({ ops: ['EVA', 'NUL', 'DEF'], targets: ['Field', 'Entity'], products: ['Entity', 'Void'], stances: ['Tracing', 'Clearing'], note: 'moving-shape reader (video)' }),
  'src/surfer/reader.js': contract({ ops: ['EVA', 'REC'], targets: ['Field', 'Lens'], products: ['Lens', 'Field'], stances: ['Binding', 'Tracing', 'Composing'], note: 'the reader — ρ-side surprise' }),
  'src/surfer/reanalyze.js': contract({ ops: ['REC'], targets: ['Link', 'Entity'], products: ['Lens', 'Link'], stances: ['Making'], note: 'garden-path reanalysis' }),
  'src/surfer/roles.js': contract({ ops: ['EVA'], targets: ['Field'], products: ['Lens'], stances: ['Binding'], note: 'element role by ablation' }),
  'src/surfer/salience.js': contract({ ops: ['SIG', 'EVA'], targets: ['Field', 'Link', 'Atmosphere'], products: ['Field', 'Link'], stances: ['Tending', 'Binding'], note: 'Born salience vs the thread' }),
  'src/surfer/sequence.js': contract({ ops: ['REC', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Field'], stances: ['Composing', 'Tracing'], note: 'learned-sequence reader (n-gram)' }),
  'src/surfer/spiral.js': contract({ ops: ['REC'], targets: ['Lens'], products: ['Entity', 'Paradigm'], stances: ['Composing'], note: 'the spiral — REC climbs' }),
  'src/surfer/stance.js': contract({ ops: ['EVA', 'REC', 'DEF'], targets: ['Field', 'Lens'], products: ['Lens', 'Atmosphere'], stances: ['Making', 'Cultivating', 'Clearing'], note: 'update stance + confab guard' }),
  'src/surfer/structure-basis.js': contract({ ops: ['SIG', 'SYN', 'EVA'], targets: ['Field'], products: ['Network', 'Lens'], stances: ['Composing', 'Tracing'], note: 'structural significance basis' }),
  'src/surfer/surf.js': contract({ ops: ['SEG', 'EVA', 'SYN'], targets: ['Field'], products: ['Field', 'Lens', 'Paradigm'], stances: ['Dissecting', 'Tracing', 'Composing'], note: 'the surfer core — surfFold' }),
  'src/surfer/terrain.js': contract({ ops: ['DEF'], targets: ['Field', 'Link'], products: ['Lens'], stances: ['Dissecting'], note: 'site typing by operators' }),
  'src/surfer/trajectory.js': contract({ ops: ['SYN', 'SEG'], targets: ['Link'], products: ['Network'], stances: ['Composing', 'Unraveling'], note: 'arc of an identity' }),
});
