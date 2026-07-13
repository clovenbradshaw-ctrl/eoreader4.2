// EO contracts for the murmur/learn holon — SELF-GUIDED LEARNING (docs/murmur.md).
// At rest the peripheral sense WANDERS: it traces the engine's one surprise INWARD to the most
// interesting place in the reading (EVA·Field), composes a curiosity walk when a note points
// outward to the web (SYN·Network), renders a mutter + a learning NOTE (INS·Atmosphere/Entity),
// and decays what it has turned over (NUL). Every note is reafferent by construction
// (`fromEnactor`) → canWitness(prov) === false: the murmur's own notebook, a toggleable graph
// layer, NEVER a citable fact and never injected into the answer prompt. Validated by
// tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/learn/index.js': contract({ ops: ['EVA', 'SYN', 'INS', 'NUL'], targets: ['Field', 'Network', 'Void'], products: ['Field', 'Entity', 'Atmosphere'], stances: ['Tracing', 'Composing', 'Making', 'Clearing'], note: 'self-guided learning — at rest, curiosity (the one surprise pointed inward) picks the most interesting place, mutters it, keeps a reafferent NOTE (canWitness===false), and, when licensed, seeds one outward web lead' }),
});
