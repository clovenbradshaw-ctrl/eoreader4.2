// EO contracts for the generation holon — the Act/Site/Stance faces of every
// module, with the Site face split into targets (what it reads) and products
// (what it writes). Validated by tests/contracts.test.js against the cube's
// coherence guard. See docs/eo-for-coders.md.
//
// The generation room: three leaf-model surfaces (docs/model-as-contracted-
// part.md, docs/longform-generation.md). Write drives weave/essay's runEssay
// over pasted source material; Build drives src/coder's build() over a
// model-proposed set of EOT intents; Code plans, writes, sandbox-runs, and
// self-corrects one self-contained document. surface.js drives all three and
// paints what they decide.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/generation/index.js': contract({ ops: ['SYN', 'CON', 'EVA', 'INS'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Binding', 'Tracing', 'Making'], note: 'barrel — the generation room entrance' }),
  'src/rooms/generation/model-connect.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'connect to the active model backend (eo_backend) for the generation surface' }),
  'src/rooms/generation/ground-pool.js': contract({ ops: ['SEG', 'SIG'], targets: ['Field'], products: ['Field'], stances: ['Clearing', 'Tending'], note: 'source text → a ranked ground pool of spans (SEG splits, SIG scores)' }),
  'src/rooms/generation/longform.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'topic + outline + source text → a grounded essay, via weave/essay runEssay' }),
  'src/rooms/generation/intents.js': contract({ ops: ['DEF', 'SEG'], targets: ['Lens'], products: ['Paradigm', 'Network'], stances: ['Dissecting', 'Unraveling'], note: 'the EOT-intent prompt schema (closed catalog vocabulary) + defensive parse of the model reply' }),
  'src/rooms/generation/codegen.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens', 'Network'], stances: ['Composing', 'Binding', 'Tracing'], note: 'propose intents from the model (intents.js), then run them through the coder pipeline (src/coder build)' }),
  'src/rooms/generation/util.js': contract({ ops: ['NUL', 'SIG'], targets: ['Field'], products: ['Void', 'Kind'], stances: ['Clearing', 'Tending'], note: 'esc/oneLine — tiny DOM-string + error-message helpers shared across this room\'s surfaces' }),
  'src/rooms/generation/styles.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'the generation surface\'s CSS, as data' }),
  'src/rooms/generation/write-panel.js': contract({ ops: ['SYN', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Tracing'], note: 'the Write tab — markup + the generate/copy actions, driving weave/essay runEssay' }),
  'src/rooms/generation/build-panel.js': contract({ ops: ['SYN', 'EVA'], targets: ['Network', 'Lens'], products: ['Lens', 'Network'], stances: ['Composing', 'Tracing'], note: 'the Build tab — markup + the propose/build actions, driving codegen.js and src/coder' }),
  'src/rooms/generation/sandbox-run.js': contract({ ops: ['INS', 'EVA'], targets: ['Lens'], products: ['Entity', 'Lens'], stances: ['Making', 'Tracing'], note: 'run a generated document in a sandboxed iframe and read back console/error output' }),
  'src/rooms/generation/code-prompts.js': contract({ ops: ['DEF', 'SEG'], targets: ['Lens'], products: ['Paradigm', 'Network'], stances: ['Dissecting', 'Unraveling'], note: 'plan/code/fix prompts for the Code tab, and the defensive parse of each reply' }),
  'src/rooms/generation/codewrite.js': contract({ ops: ['SYN', 'EVA', 'REC'], targets: ['Lens', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Tracing', 'Binding'], note: 'plan → generate → sandbox-verify → fix loop, capped' }),
  'src/rooms/generation/code-panel.js': contract({ ops: ['SYN', 'EVA'], targets: ['Lens', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Tracing'], note: 'the Code tab — plan/generate actions, live sandboxed preview, copy/download' }),
  'src/rooms/generation/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the generation room DOM surface — Write / Build / Code tabs, live progress, model status chip' }),
});
