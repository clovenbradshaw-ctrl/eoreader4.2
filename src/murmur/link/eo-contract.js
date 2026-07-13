// EO contracts for the murmur/link holon — the connective nominator (spec §9.4, phase 4).
// A recognition impression ("we've read this before") becomes a reafferent CANDIDATE connection
// between two reading loci. The INS renders a candidate; it is INS'd into a READ side-channel
// (nominations()/subscribe), never the log — so the §9 firewall holds exactly as it does for the
// live-feel broadcast: murmur POINTS, only the document (via the promotion gate) witnesses. Every
// candidate is `fromEnactor` → canWitness(prov)===false (the §8 type law). Validated by
// tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/link/index.js': contract({ ops: ['INS', 'SIG', 'NUL'], targets: ['Void', 'Entity', 'Atmosphere'], products: ['Entity', 'Field'], stances: ['Making', 'Tending', 'Clearing'], note: 'the connective nominator — a recognition impression → a reafferent CANDIDATE connection between two reading loci (phase 4). canWitness(prov)===false; only the document promotes it' }),
});
