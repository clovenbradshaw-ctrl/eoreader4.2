// EO contracts for the dashboard holon — the live-metric surface: pin an element on a web page and
// watch it. The Act/Site/Stance faces of every module, the Site face split into targets (what it
// reads) and products (what it writes). Validated by tests/contracts.test.js against the cube's
// coherence guard. See docs/eo-for-coders.md and docs/dashboards.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/dashboard/index.js': contract({ ops: ['NUL', 'SIG', 'EVA'], targets: ['Field'], products: ['Lens', 'Void'], stances: ['Binding', 'Clearing'], note: 'barrel' }),
  'src/rooms/dashboard/spec.js': contract({ ops: ['SIG', 'EVA'], targets: ['Field'], products: ['Lens'], stances: ['Binding', 'Tending'], note: 'watch spec + append-only reading log + projections' }),
  'src/rooms/dashboard/extract.js': contract({ ops: ['EVA', 'DEF'], targets: ['Field'], products: ['Lens'], stances: ['Binding', 'Dissecting'], note: 'pulled string -> value (reuses data/values.js)' }),
  'src/rooms/dashboard/select.js': contract({ ops: ['EVA', 'DEF'], targets: ['Field'], products: ['Lens'], stances: ['Binding', 'Dissecting'], note: 'clicked element -> selector; selector -> value' }),
  'src/rooms/dashboard/render.js': contract({ ops: ['NUL'], targets: ['Field'], products: ['Void'], stances: ['Clearing'], note: 'reading log -> tiles (pure HTML)' }),
  'src/rooms/dashboard/store.js': contract({ ops: ['SIG', 'NUL'], targets: ['Field'], products: ['Lens', 'Void'], stances: ['Binding', 'Tending'], note: 'watches + reading logs, persisted' }),
  'src/rooms/dashboard/picker.js': contract({ ops: ['NUL', 'SIG'], targets: ['Field'], products: ['Void', 'Lens'], stances: ['Clearing', 'Binding'], note: 'point-and-click element picker' }),
  'src/rooms/dashboard/mount.js': contract({ ops: ['SIG', 'NUL'], targets: ['Field'], products: ['Void', 'Lens'], stances: ['Binding', 'Clearing'], note: 'dashboard surface + launcher + refresh cycle' }),
});
