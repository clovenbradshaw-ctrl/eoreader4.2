// EO contracts for the waveform holon (docs/omnimodal-waveform.md) — the Act/Site/Stance
// faces of every module, with the Site face split into targets (what it reads) and
// products (what it writes). Validated by tests/contracts.test.js against the cube's
// coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/waveform/index.js': contract({ ops: ['SEG', 'SIG', 'CON', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Dissecting', 'Tending', 'Binding', 'Tracing'], note: 'barrel' }),
  'src/weave/waveform/metric.js': contract({ ops: ['EVA'], targets: ['Field'], products: ['Field'], stances: ['Tracing'], note: 'shared field arithmetic — cosine metric, robust mean, EWMA, novelty curve' }),
  'src/weave/waveform/frames.js': contract({ ops: ['SEG', 'EVA'], targets: ['Field'], products: ['Field', 'Lens'], stances: ['Dissecting', 'Tracing'], note: 'frame/turn detection — confirmed structural boundaries against a Born null' }),
  'src/weave/waveform/echo.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Network'], stances: ['Tending'], note: 'motif recurrence — chance-similarity and competence-gain gates' }),
  'src/weave/waveform/cast.js': contract({ ops: ['CON', 'SEG', 'EVA'], targets: ['Network'], products: ['Entity', 'Network'], stances: ['Dissecting', 'Tracing', 'Binding'], note: 'cast presence + gate wiring — synthesizes a coupling graph and reads the individuation gate off it' }),
  'src/weave/waveform/build.js': contract({ ops: ['EVA'], targets: ['Network', 'Field'], products: ['Lens'], stances: ['Tracing'], note: 'the invariant core — buildWaveform assembles baseline/strain/frames/turns/echo/cast into a WaveformModel' }),
});
