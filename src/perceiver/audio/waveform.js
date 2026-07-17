// EO: SIG(Field → Field, Tending) — the audio perceiver (docs/omnimodal-waveform.md §4.2)
// Turns raw mono PCM into a Reading. `field` is a real spectral descriptor
// (dsp.js: FFT → log-spaced band energies), not a stand-in — this is the
// genuinely new work phase 6 called for, since nothing in the tree computed a
// content-bearing audio feature before this. Coarse segments are NOT a new
// detector: they are organs/in/acoustic.js's existing signal/noise holon
// separation, reread as Segment boundaries — the same "reuse what the modelless
// read already computes" discipline the text perceiver follows.
//
// Honesty flag carried over from the spec (§4.2): the LATENT/"implied" case —
// a theme prepared but not sounding — is the hardest call a spectral read can
// make. What ships here is a real, defensible proxy (a unit's distance to a
// motif cluster it isn't the nearest match for, at a looser band — §shared/
// cluster.js), not a captioning model's judgment call. Ship v1 on that; a
// small model may only ever CAPTION a span this layer already flagged, never
// decide latency (docs/model-as-contracted-part.md).

import { magnitudeSpectrum, logBandEnergies, nextPow2 } from './dsp.js';
import { deriveClusterRadius, clusterUnits, referentsAndSightingsFromClusters } from '../shared/cluster.js';
import { cosineMetric } from '../../weave/waveform/index.js';
import { separateHolons } from '../../organs/in/index.js';

const VOCAB = Object.freeze({ FOREGROUND: 'stated', PRESENT: 'in the texture', LATENT: 'implied' });

// The coarse segments: the existing signal/noise holon separation, converted
// from seconds into frame ordinals. Never a new detector — this IS the
// terrain/register read for audio, exactly as chapter headings are for text.
const coarseSegmentsFromHolons = (mono, sampleRate, frameDur, numFrames) => {
  let sep;
  try { sep = separateHolons(mono, sampleRate); } catch { return []; }
  const top = (sep.root && sep.root.children) || [];
  return top
    .map((h) => ({
      start: Math.max(0, Math.round(h.start / frameDur)),
      end: Math.min(numFrames, Math.round(h.end / frameDur)),
      label: h.kind === 'signal' ? 'signal' : 'noise',
      level: 'coarse',
    }))
    .filter((s) => s.end > s.start);
};

// buildAudioReading — `mono` is a Float32Array/Float64Array of PCM samples in
// [-1,1] at `sampleRate` Hz (the same shape organs/in/acoustic.js already
// takes). `opts.frameSize` (default 2048) sets the analysis window; a shorter
// final frame still gets a real, if coarser, spectrum (dsp.js pads to the next
// power of 2 rather than dropping it).
export const buildAudioReading = (mono, sampleRate, opts = {}) => {
  const frameSize = opts.frameSize || 2048;
  const numBands = opts.numBands || 16;
  const n = mono.length;
  const numFrames = n > 0 ? Math.max(1, Math.ceil(n / frameSize)) : 0;

  const units = [];
  for (let f = 0; f < numFrames; f++) {
    const start = f * frameSize, end = Math.min(n, start + frameSize);
    const frame = mono.slice(start, end);
    const fftSize = nextPow2(frame.length);
    const mag = magnitudeSpectrum(frame);
    const field = logBandEnergies(mag, sampleRate, fftSize, numBands);
    units.push({
      id: `f${f}`,
      ordinal: f,
      span: { startSec: start / sampleRate, endSec: end / sampleRate },
      field,
    });
  }

  const frameDur = frameSize / sampleRate;
  const segments = numFrames ? coarseSegmentsFromHolons(mono, sampleRate, frameDur, numFrames) : [];

  const radius = numFrames > 1 ? deriveClusterRadius(units, cosineMetric) : 0;
  const clusters = numFrames > 1 ? clusterUnits(units, cosineMetric, radius, { minMembers: opts.minMembers ?? 2 }) : [];
  const { referents, sightings } = referentsAndSightingsFromClusters(units, cosineMetric, clusters, radius, {
    keyPrefix: 'motif', displayPrefix: 'motif',
  });

  return {
    units,
    metric: cosineMetric,
    segments,
    referents,
    sightings,
    vocab: VOCAB,
    resolve: (span) => ({ startSec: span.startSec, endSec: span.endSec }),
    meta: { modality: 'audio', perceiverVersion: '1.0.0' },
  };
};
