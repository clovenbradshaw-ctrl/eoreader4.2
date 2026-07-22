// EO contracts for the surfaces/binvis holon (docs/binvis-surface.md) — the Act/Site/Stance
// faces of every module. Validated by tests/contracts.test.js against the cube's coherence
// guard. Same face as the waveform surface: SIG(Lens → Lens, Tending) — a render takes a
// Lens (the built picture) and yields a Lens, tending it, asserting nothing.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfaces/binvis/index.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'barrel' }),
  'src/surfaces/binvis/render.strict.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the modality-blind binvis render — buildScene + the canvas DOM adapter' }),
  'src/surfaces/binvis/curve.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the Hilbert space-filling curve (d2xy/xy2d) — the prior art, unchanged' }),
  'src/surfaces/binvis/classify.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the binvis byte-class taxonomy + palette + the layer registry' }),
  'src/surfaces/binvis/entropy.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the entropy layer — windowed Shannon entropy + the heat ramp (the second binvis view)' }),
  'src/surfaces/binvis/significance.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the significance layer colour ramp — the reading-keyed heat (the third binvis view)' }),
});
