// EO: SIG(Void → Field, Tending) — the generic binary perceiver
// The fallback every OTHER format falls through to: any byte sequence at all,
// with zero format-specific knowledge. Where the text/audio/tabular
// perceivers each read a structure specific to their modality (sentences,
// frames, rows), this one reads only what every binary blob has regardless of
// what it turns out to be — a byte-value distribution, an entropy, a
// printable-ASCII ratio (features.js) — chunked into fixed-size windows.
// Everything downstream (frames/turns/echo/cast) is the SAME invariant core
// every other perceiver feeds; a repeated header structure, a padded region,
// a compressed block are read exactly as a recurring motif or tracked regime
// already is for audio/tabular, via the same shared clusterer.
//
// This is the generalization the omnimodal contract was always pointed at
// (docs/omnimodal-waveform.md §0): a format nobody has written a perceiver for
// yet still produces a valid Reading, not a failure.

import { byteHistogram, shannonEntropy, printableRatio } from './features.js';
import { deriveClusterRadius, clusterUnits, referentsAndSightingsFromClusters } from '../shared/cluster.js';
import { cosineMetric } from '../../weave/waveform/index.js';

const VOCAB = Object.freeze({ FOREGROUND: 'dominant', PRESENT: 'present', LATENT: 'faint' });

const l2Normalize = (v) => {
  let norm = 0; for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
};

const asUint8Array = (bytes) => (bytes instanceof Uint8Array ? bytes
  : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
  : Uint8Array.from(bytes));

// buildBinaryReading — `bytes` is any Uint8Array/ArrayBuffer/byte-like array.
// `opts.chunkSize` (default 512) sets the fixed-window unit; `opts.numBins`
// (default 32) sets the byte-histogram resolution.
export const buildBinaryReading = (bytes, opts = {}) => {
  const buf = asUint8Array(bytes);
  const chunkSize = opts.chunkSize || 512;
  const numBins = opts.numBins || 32;
  const n = buf.length > 0 ? Math.ceil(buf.length / chunkSize) : 0;

  const units = [];
  for (let i = 0; i < n; i++) {
    const start = i * chunkSize, end = Math.min(buf.length, start + chunkSize);
    const chunk = buf.subarray(start, end);
    const hist = byteHistogram(chunk, numBins);
    const field = l2Normalize([...hist, shannonEntropy(chunk) / 8, printableRatio(chunk)]);
    units.push({ id: `b${i}`, ordinal: i, span: { startByte: start, endByte: end }, field });
  }

  const radius = n > 1 ? deriveClusterRadius(units, cosineMetric) : 0;
  const clusters = n > 1 ? clusterUnits(units, cosineMetric, radius, { minMembers: opts.minMembers ?? 2 }) : [];
  const { referents, sightings } = referentsAndSightingsFromClusters(units, cosineMetric, clusters, radius, {
    keyPrefix: 'region', displayPrefix: 'region',
  });

  return {
    units,
    metric: cosineMetric,
    segments: [],
    referents,
    sightings,
    vocab: VOCAB,
    resolve: (span) => ({ startByte: span.startByte, endByte: span.endByte }),
    meta: { modality: 'binary', perceiverVersion: '1.0.0' },
  };
};
