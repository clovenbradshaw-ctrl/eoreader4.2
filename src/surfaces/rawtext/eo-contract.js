// EO contracts for the surfaces/rawtext holon — the Act/Site/Stance faces of every module.
// Validated by tests/contracts.test.js against the cube's coherence guard. Same face as the
// binvis/waveform surfaces: SIG(Lens -> Lens, Tending) — a render takes a Lens (the source's
// own text) and yields a Lens, tending it, asserting nothing.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfaces/rawtext/index.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'barrel' }),
  'src/surfaces/rawtext/render.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the modality-blind raw-text render — buildLines + the line-numbered DOM adapter' }),
});
