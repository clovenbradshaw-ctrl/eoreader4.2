// EO contracts for the models holon — the Act/Site/Stance faces of every module, with the Site
// face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The models holon is the model-manager surface: a real place to INSTALL the local talkers and
// WATCH them download (the progress bar is the actual weight fetch), CONNECT a hosted / local
// server, SET which model the reader uses, and CLEAR the disk they take. catalog.js is the pure
// description + status folds; surface.js drives the real backend load() and paints what they decide.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/models/index.js': contract({ ops: ['INS', 'SEG', 'NUL'], targets: ['Kind', 'Field'], products: ['Entity', 'Lens', 'Void'], stances: ['Making', 'Dissecting', 'Clearing'], note: 'barrel — the models room entrance' }),
  'src/rooms/models/catalog.js': contract({ ops: ['INS', 'SEG', 'EVA'], targets: ['Kind', 'Field'], products: ['Kind', 'Lens'], stances: ['Making', 'Dissecting', 'Binding'], note: 'the model catalog + status folds — what can install, its state now, whether this device can run it' }),
  'src/rooms/models/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the model-manager DOM surface — install with live progress, connect, set active, test, reclaim disk' }),
});
