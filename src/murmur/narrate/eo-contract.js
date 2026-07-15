// EO contracts for the murmur/narrate holon — the tiny LM that puts words to a twitch (spec §6).
// Wakes only when the sense crosses a threshold; refractory-gated; ≤32 tokens; audit-only. Never
// queried for facts (spec §9.5) — its output is a register confirmation and a phrase for audit/
// steer legibility, full stop. Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/narrate/index.js': contract({ ops: ['INS', 'NUL'], targets: ['Void', 'Atmosphere'], products: ['Entity'], stances: ['Making', 'Clearing'], note: 'barrel' }),
  'src/murmur/narrate/narrator.js': contract({ ops: ['INS', 'NUL'], targets: ['Void', 'Atmosphere'], products: ['Entity'], stances: ['Making', 'Clearing'], note: 'the tiny-LM mutter — pluggable backend, refractory-gated, ≤32 tokens, audit-only, never consulted for truth' }),
  'src/murmur/narrate/voice.js': contract({ ops: ['INS', 'NUL', 'SEG', 'CON'], targets: ['Void', 'Atmosphere'], products: ['Entity'], stances: ['Making', 'Clearing'], note: 'the model-free inner voice — turns the geometry into first-person oppositions (prose, not gauges); audit-only, never a fact' }),
});
