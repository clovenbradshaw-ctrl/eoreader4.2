// EO contracts for the enactor/connect holon — the connective promotion gate (phase 4). The VERIFY
// half of murmur's connective loop: it BINDS (CON) a candidate connection to the document graph,
// EVALUATES it against the exafferent witness set (EVA, via checkClaim), and INS's either a
// corroborated CON connection edge or a firewalled EVA/void margin note. A candidate can never
// witness itself (the §8 type law); only the document promotes it. Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/enactor/connect/index.js': contract({ ops: ['CON', 'EVA', 'INS'], targets: ['Field', 'Link', 'Network'], products: ['Link', 'Lens', 'Entity'], stances: ['Binding', 'Tracing', 'Making'], note: 'barrel' }),
  'src/enactor/connect/promote.js': contract({ ops: ['CON', 'EVA', 'INS'], targets: ['Field', 'Link', 'Network'], products: ['Link', 'Lens', 'Entity'], stances: ['Binding', 'Tracing', 'Making'], note: 'the promotion gate — a murmur candidate + the document graph → a corroborated CON edge (Tier 2, witnessed by checkClaim) or a firewalled EVA/void margin note (Tier 1). murmur POINTS, the document witnesses' }),
});
