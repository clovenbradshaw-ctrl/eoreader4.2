// EO contracts for the murmur holon root — the Act/Site/Stance faces of the barrel, the config,
// and the membrane. Validated by tests/contracts.test.js against the cube's coherence guard
// (docs/eo-for-coders.md Law 1). murmur is the peripheral sense: a SIG lifted continuously out of
// the fold geometry that, on a Born-rule collapse, gets INS'd into the log's STEER channel — never
// the render-to-screen adapter, which is why the §9 firewall holds. The sub-holons (sense, valence,
// steer, narrate, audit) carry their own manifests.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/index.js': contract({ ops: ['SIG', 'INS', 'EVA', 'DEF', 'NUL'], targets: ['Field', 'Void', 'Entity', 'Atmosphere'], products: ['Void', 'Entity', 'Atmosphere', 'Field', 'Lens'], stances: ['Tending', 'Making', 'Binding', 'Dissecting', 'Clearing'], note: 'barrel — createMurmur wires sense→valence→(Born-rule)steer→narrate→audit, audit-only by default' }),
  'src/murmur/config.js': contract({ ops: ['NUL'], targets: ['Kind'], products: ['Kind'], stances: ['Clearing'], note: 'murmur config — thresholds, decay, membrane flags (canAppendLog/canEditPrompt must stay false)' }),
  'src/murmur/membrane.js': contract({ ops: ['DEF', 'NUL'], targets: ['Atmosphere', 'Void'], products: ['Atmosphere'], stances: ['Dissecting', 'Clearing'], note: 'the firewall invariants — no impression to log/prompt; steer is never evidence (spec §9)' }),
});
