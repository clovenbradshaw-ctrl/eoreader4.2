// EO contracts for the replay holon — the Act/Site/Stance faces of every module, with the
// Site face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The replay holon is the "watching something get read" surface: an ingest organ returns a
// distribution, never a decision, and the collapse happens here at read time against a
// switchable corpus. The fold (collapse.js) is pure on (scene, enabled, cursor) — the same
// fold-decides discipline as enactor/enact/replay.js and projectGraph.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/replay/collapse.js': contract({ ops: ['SEG', 'EVA'], targets: ['Network', 'Field'], products: ['Lens', 'Atmosphere'], stances: ['Unraveling', 'Tracing'], note: 'the read-time collapse fold — distribution × corpus → chosen word, pure on (scene, enabled, cursor)' }),
  'src/rooms/replay/index.js': contract({ ops: ['INS', 'NUL', 'SEG'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing', 'Dissecting'], note: 'barrel — the replay room entrance' }),
  'src/rooms/replay/scene.js': contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Field'], stances: ['Making', 'Tending'], note: 'the worked reading — a hand-authored distribution (community meeting read against a corpus)' }),
  'src/rooms/replay/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the Replay DOM surface — transport, facing page, distribution popover, source switches' }),
});
