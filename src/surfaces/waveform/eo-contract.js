// EO contracts for the surfaces/waveform holon (docs/omnimodal-waveform.md §5) — the
// Act/Site/Stance faces of every module. Validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfaces/waveform/index.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'barrel' }),
  'src/surfaces/waveform/render.strict.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the modality-blind waveform render — buildScene + the DOM adapter' }),
  'src/surfaces/waveform/skins/audio.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'restyle-only audio skin — theme/backgroundGlyph hints, never a new mark' }),
  'src/surfaces/waveform/skins/tabular.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'restyle-only tabular/meteorological skin — theme/backgroundGlyph hints, never a new mark' }),
});
