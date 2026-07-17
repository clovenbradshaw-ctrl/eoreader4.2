// EO: DEF(Field → Field, Clearing) — the tabular perceiver (docs/omnimodal-waveform.md §4.3)
// Turns an ingestTable doc (organs/in/table.js) into a Reading. Nothing in the
// tree z-scores a numeric column or tracks a multichannel regime today — every
// cell is stored as a raw string (table.js's own comment says so). This
// perceiver is that missing numeric layer: detect which columns are actually
// numeric, z-score them per column so every channel sits on a comparable scale,
// and read each row's channel vector as its `field`.
//
// No dedicated regime-boundary detector is added here — the invariant core's
// own change-point detection (buildFramesAndTurns) already finds a shift in
// the field alone, so an airmass change reads as a Turn without any
// tabular-specific segmentation code, the same way a document with no chapter
// headings falls back to pure core detection in the text perceiver.

import { deriveClusterRadius, clusterUnits, referentsAndSightingsFromClusters } from '../shared/cluster.js';
import { cosineMetric } from '../../weave/waveform/index.js';

const VOCAB = Object.freeze({ FOREGROUND: 'driving the regime', PRESENT: 'measurable', LATENT: 'building offscreen' });

// Strip common formatting ($, thousands commas, %, whitespace) before parsing
// — table.js stores every cell as a raw string, so "$2,900" and "58%" need to
// read as numbers before they can be a channel at all.
const parseNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,$%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// A column is a numeric CHANNEL only if most of its non-empty cells actually
// parse as numbers — a mixed or categorical column (names, ids, free text)
// stays out of the field entirely rather than injecting NaN-derived noise.
const detectNumericColumns = (records, keys, { minCoverage = 0.8 } = {}) => {
  const numeric = [];
  for (const k of keys) {
    let parsed = 0, total = 0;
    for (const r of records) {
      const v = r.cells[k];
      if (v === '' || v == null) continue;
      total++;
      if (parseNum(v) != null) parsed++;
    }
    if (total > 0 && parsed / total >= minCoverage) numeric.push(k);
  }
  return numeric;
};

const zScoreStats = (records, numericKeys) => {
  const stats = {};
  for (const k of numericKeys) {
    const vals = records.map((r) => parseNum(r.cells[k])).filter((v) => v != null);
    const mean = vals.reduce((s, x) => s + x, 0) / (vals.length || 1);
    const variance = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length || 1);
    stats[k] = { mean, std: Math.sqrt(variance) || 1 };
  }
  return stats;
};

// buildTabularReading — `doc` is whatever ingestTable returned: `.records`
// (`{id, index, cells}`), `.keys` (the slugged column keys). `opts.minCoverage`
// / `opts.minMembers` tune the numeric-column detector and the regime
// clusterer respectively.
export const buildTabularReading = (doc, opts = {}) => {
  const records = doc.records || [];
  const keys = doc.keys || [];
  const numericKeys = detectNumericColumns(records, keys, opts);
  const stats = zScoreStats(records, numericKeys);

  const units = records.map((r, i) => {
    const field = numericKeys.map((k) => {
      const v = parseNum(r.cells[k]);
      const s = stats[k];
      return v == null ? 0 : (v - s.mean) / s.std;
    });
    return { id: r.id, ordinal: i, span: { rowIndex: i, cells: r.cells }, field };
  });

  const radius = units.length > 1 ? deriveClusterRadius(units, cosineMetric) : 0;
  const clusters = units.length > 1
    ? clusterUnits(units, cosineMetric, radius, { minMembers: opts.minMembers ?? 2 })
    : [];
  const { referents, sightings } = referentsAndSightingsFromClusters(units, cosineMetric, clusters, radius, {
    keyPrefix: 'regime', displayPrefix: 'regime',
  });

  return {
    units,
    metric: cosineMetric,
    segments: [],
    referents,
    sightings,
    vocab: VOCAB,
    resolve: (span) => ({ rowIndex: span.rowIndex, cells: span.cells }),
    meta: { modality: 'tabular', perceiverVersion: '1.0.0', numericColumns: numericKeys },
  };
};
