// Re-export shim: the depicted-move reduction moved into the runtime at
// src/turn/depicted.js (the draft scorer needs it live in the browser). The fit and
// audit tools keep importing from here; the definition lives in one place.
export { ENACTED_MASK, DEPICTED_ALPHABET, parseToMoves, depictedMoves } from '../../src/turn/depicted.js';
