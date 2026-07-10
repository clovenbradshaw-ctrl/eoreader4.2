// EO contracts for the model holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/model/coders.js': contract({ ops: ['NUL', 'INS', 'SEG'], targets: ['Kind'], products: ['Kind', 'Entity'], stances: ['Clearing', 'Making'], note: 'coder catalog + registration' }),
  'src/model/echo.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity'], stances: ['Making', 'Clearing'], note: 'echo backend, verbatim excerpts' }),
  'src/model/embed-hash.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Atmosphere'], stances: ['Tending'], note: 'hash embedder' }),
  'src/model/embed.js': contract({ ops: ['SIG', 'INS'], targets: ['Field'], products: ['Atmosphere', 'Entity'], stances: ['Tending', 'Making'], note: 'MiniLM semantic embedder' }),
  'src/model/index.js': contract({ ops: ['INS', 'SYN', 'SIG'], targets: ['Field'], products: ['Entity', 'Field'], stances: ['Making', 'Tending'], note: 'barrel' }),
  'src/model/interface.js': contract({ ops: ['INS'], targets: ['Kind'], products: ['Entity'], stances: ['Making'], note: 'backend registry + createModel' }),
  'src/model/prompt.js': contract({ ops: ['SYN', 'DEF', 'SEG'], targets: ['Field'], products: ['Field', 'Lens'], stances: ['Dissecting', 'Composing'], note: 'grounded prompt assembler + frame' }),
  'src/model/stream.js': contract({ ops: ['NUL', 'SEG'], targets: ['Field'], products: ['Void', 'Field'], stances: ['Clearing', 'Dissecting'], note: 'streaming surfacer wrapper' }),
  'src/model/structure.js': contract({ ops: ['SYN', 'INS'], targets: ['Field', 'Network'], products: ['Entity'], stances: ['Composing', 'Making'], note: 'structure backend, graph retelling' }),
  'src/model/webllm.js': contract({ ops: ['INS', 'EVA'], targets: ['Field', 'Atmosphere'], products: ['Entity'], stances: ['Making', 'Tending'], note: 'webllm WebGPU backend' }),
  'src/model/wllama.js': contract({ ops: ['INS'], targets: ['Field'], products: ['Entity'], stances: ['Making'], note: 'wllama CPU/WASM backend' }),
});
