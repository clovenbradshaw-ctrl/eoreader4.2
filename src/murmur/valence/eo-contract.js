// EO contracts for the murmur/valence holon — register taxonomy + intensity + decay +
// anti-rumination (spec §7, §8). Impressions are affective before propositional; the register
// (a DEF over the geometric signature) drives action, and the working-feel ring (NUL hold + SIG
// attribute) keeps a cheap continuous loop from spiralling. Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/valence/index.js': contract({ ops: ['DEF', 'NUL', 'SIG'], targets: ['Atmosphere', 'Void', 'Entity'], products: ['Lens', 'Void', 'Entity'], stances: ['Dissecting', 'Clearing', 'Tending'], note: 'barrel' }),
  'src/murmur/valence/register.js': contract({ ops: ['DEF'], targets: ['Atmosphere'], products: ['Lens'], stances: ['Dissecting', 'Clearing'], note: 'the four registers — geometric signature → affective register (unease/surprise/drift/recognition)' }),
  'src/murmur/valence/ring.js': contract({ ops: ['NUL', 'SIG'], targets: ['Void', 'Entity'], products: ['Void', 'Entity'], stances: ['Clearing', 'Tending'], note: 'the working-feel ring — decay, no-compounding dedup, refractory, perishability (spec §8)' }),
});
