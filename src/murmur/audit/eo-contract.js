// EO contracts for the murmur/audit holon — the impression stream sink (spec §3). Writes
// rooms/audit ONLY: every impression flushed as marginalia tagged `impression`, promotable to
// nothing. The safe terminus for impressions that don't collapse (spec §4a). Structurally
// incapable of a grounded-event write — it refuses any record not tagged impression/steer.
// Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/audit/index.js': contract({ ops: ['INS', 'NUL', 'SIG'], targets: ['Void', 'Entity', 'Atmosphere'], products: ['Atmosphere', 'Entity'], stances: ['Making', 'Tending', 'Clearing'], note: 'barrel' }),
  'src/murmur/audit/sink.js': contract({ ops: ['INS', 'NUL', 'SIG'], targets: ['Void', 'Entity', 'Atmosphere'], products: ['Atmosphere', 'Entity'], stances: ['Making', 'Tending', 'Clearing'], note: 'the impression sink — flush working-feel to rooms/audit marginalia (tagged impression); refuses non-impression records' }),
});
