// EO contracts for the murmur/steer holon — impression → attention/confidence modulation (spec
// §4a, §10). The commit-INS is Figure-grain (a definite thing rendered) — but INS'd into the
// log's STEER channel, not the render-to-screen adapter, which is why the §9 firewall holds:
// murmur's INS terminates at the projection's steer reader, never at the surface. Steer is never
// evidence (spec §9.2). Validated by tests/contracts.test.js.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/murmur/steer/index.js': contract({ ops: ['INS', 'EVA', 'SIG'], targets: ['Void', 'Entity', 'Atmosphere'], products: ['Entity', 'Field'], stances: ['Making', 'Binding', 'Tending'], note: 'barrel' }),
  'src/murmur/steer/collapse.js': contract({ ops: ['EVA', 'INS'], targets: ['Void', 'Atmosphere'], products: ['Void', 'Atmosphere'], stances: ['Binding', 'Making'], note: 'the Born-rule collapse — ψ=√(s·d), P=|ψ|²=s·d, commit ⇐ sample(P) (squaring gates noise, sampling guards rumination)' }),
  'src/murmur/steer/event.js': contract({ ops: ['INS', 'SIG'], targets: ['Void', 'Entity'], products: ['Entity', 'Field'], stances: ['Making', 'Tending'], note: 'the steer event + its projection re-weighting {towardAnchor, awayFromCluster, biasStrength} — a physics bias, decays, never a witness' }),
});
