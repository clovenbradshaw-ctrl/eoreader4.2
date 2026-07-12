// EO contracts for the murmur/sense holon — the continuous, cheap, geometric felt sense (spec §5).
// The sense-SIG reads Ground-grain, Tending-stance: continuous, low-figure, watchful — a signal
// lifted out of the fold geometry, mostly unattended, superposed in the audit stream. No language
// model runs here. Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/sense/index.js': contract({ ops: ['SIG', 'NUL'], targets: ['Field', 'Void', 'Atmosphere'], products: ['Void', 'Atmosphere'], stances: ['Tending', 'Clearing'], note: 'barrel' }),
  'src/murmur/sense/geometry.js': contract({ ops: ['SIG', 'NUL'], targets: ['Field', 'Void'], products: ['Void', 'Atmosphere'], stances: ['Tending', 'Clearing'], note: 'the pre-verbal felt sense — drift/concentration/novelty from fold geometry (dot products, no model)' }),
  'src/murmur/sense/centroid.js': contract({ ops: ['SIG', 'NUL'], targets: ['Void', 'Atmosphere'], products: ['Atmosphere'], stances: ['Tending', 'Clearing'], note: 'the running session-topic centroid + deictic-follow-up fallback — the drift anchor (spec §5, §14)' }),
});
