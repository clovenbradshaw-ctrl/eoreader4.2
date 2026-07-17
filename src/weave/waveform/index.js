// EO: EVA·SIG(Network,Field → Lens,Field, Tracing,Tending) — barrel
// The invariant core's entrance (docs/omnimodal-waveform.md §3): the ONE public
// surface every perceiver and the render read through. `buildWaveform` is the
// pure Reading → WaveformModel fold; `cosineMetric` is the recommended default
// metric a Reading may adopt (perceivers are free to supply their own, per the
// contract, but reuse this one rather than reimplementing cosine distance three
// times over).

export { buildWaveform } from './build.js';
export { cosineMetric } from './metric.js';
