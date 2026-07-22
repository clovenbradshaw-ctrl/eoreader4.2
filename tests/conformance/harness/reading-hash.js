// readingHash / readingDiff (docs/parse-conformance-spec.md, "Shared harness").
//
// readingHash is the instrument the whole suite leans on: a canonical, order-
// independent digest of what a parse actually emitted. It operates on the `doc`
// returned by ingestText/parseText — the parse-layer substrate this spec is
// about (unit segmentation, entities.js admission, coref.js, the individuation
// gate, project.js's graph) — not the trimmed omnimodal Reading contract further
// downstream (that one gets its own, narrower `readingContractHash`, used only by
// the Tier 8 perceiver-contract tests).
import { canonicalStringify, quantizeDeep, sha256Hex, sortBy, stripVolatile } from './canon.js';
import { projectGraph } from '../../../src/core/project.js';
import { typeReferents } from '../../../src/perceiver/individuation.js';

const QUANT = 6;

// The log, in append order (order is signal — it encodes reading order — so this
// is never sorted), volatile wall-clock stripped, floats quantized.
const canonicalEvents = (doc) =>
  doc.log.snapshot().map((e) => quantizeDeep(stripVolatile(e), QUANT));

// The admitted-referent table (entities.js), order-independent by construction —
// sorted by (label) so two runs that built the same Map in a different internal
// order still hash identically.
const canonicalAdmission = (doc) => {
  const rows = [...(doc.admission ? doc.admission.admitted : new Map())]
    .map(([label, id]) => ({ label, id }));
  return sortBy(rows, (r) => [r.label, r.id]);
};

// The individuation-gate cast (individuation.js typeReferents) — the referent
// set with its type (holon/emanon/protogon/field/void), mass, rho, salience.
// Sorted by id (not left in salience order) so a float-jitter tie-break can never
// move the hash while leaving the actual cast unchanged.
const canonicalCast = (doc) =>
  sortBy(typeReferents(doc).map((c) => quantizeDeep(c, QUANT)), (c) => c.id);

// The projected graph: entities (mass) and edges (weight), both order-independent
// — sorted by their natural keys.
const canonicalGraph = (doc) => {
  const graph = projectGraph(doc.log);
  const entities = sortBy(
    [...graph.entities.values()].map((e) => ({ id: e.id, label: e.label, sightings: e.sightings })),
    (e) => e.id);
  const edges = sortBy(
    graph.edges.map((e) => quantizeDeep({
      from: e.from, to: e.to, kind: e.kind, via: e.via, sentIdx: e.sentIdx,
      coupling: e.coupling, weight: e.weight, derived: !!e.derived,
    }, QUANT)),
    (e) => [e.from, e.to, e.via, e.sentIdx]);
  return { entities, edges };
};

// The full canonical substrate object readingHash digests. Exposed (not just the
// hash) because readingDiff needs the structured form to explain WHAT changed.
export const substrateOf = (doc) => ({
  units: doc.sentences || doc.units || [],
  events: canonicalEvents(doc),
  admission: canonicalAdmission(doc),
  cast: canonicalCast(doc),
  graph: canonicalGraph(doc),
});

export const readingHash = (doc) => sha256Hex(canonicalStringify(substrateOf(doc)));

// A narrower digest over the omnimodal Reading contract object (buildTextReading /
// buildAudioReading / buildTabularReading output) — Tier 8 only. Field vectors are
// quantized so a benign float-precision difference in the embedder never breaks
// the hash; segments/referents/sightings are sorted where order is not the point.
export const readingContractHash = (reading) => {
  const units = (reading.units || []).map((u) => ({
    id: u.id, ordinal: u.ordinal, field: quantizeDeep(u.field, QUANT),
  }));
  const segments = sortBy((reading.segments || []).map((s) => ({ start: s.start, end: s.end, level: s.level, label: s.label })),
    (s) => [s.start, s.end, s.level]);
  const referents = sortBy((reading.referents || []).map((r) => ({ key: r.key, display_name: r.display_name })), (r) => r.key);
  const sightings = sortBy((reading.sightings || []).map((s) => quantizeDeep({ referent: s.referent, ordinal: s.ordinal, role: s.role, evidence: s.evidence }, QUANT)),
    (s) => [s.referent, s.ordinal, s.role]);
  return sha256Hex(canonicalStringify({ units, segments, referents, sightings, meta: reading.meta || null }));
};

// ── readingDiff — a human-readable structural diff of two substrates ─────────
//
// A hash tells you SOMETHING changed; this tells you WHAT. Built for two calls
// on the SAME document (regression / rename-isomorphism comparisons), so it
// reports units added/removed/moved, referents gained/lost, and per-referent
// metric deltas above a threshold — never a line-by-line text diff, which is
// not what any tier needs.
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

export const readingDiff = (a, b, { metricThreshold = 0.05 } = {}) => {
  const A = substrateOf(a), B = substrateOf(b);
  const diff = { units: { added: [], removed: [], changed: [] },
                 referents: { gained: [], lost: [], changed: [] },
                 edges: { added: [], removed: [] } };

  // Units — positional; a document that only appends keeps every prior index
  // identical, so a same-index text change is a real content edit, not a shift.
  const ua = A.units, ub = B.units;
  for (let i = 0; i < Math.max(ua.length, ub.length); i++) {
    if (i >= ua.length) diff.units.added.push({ index: i, text: ub[i] });
    else if (i >= ub.length) diff.units.removed.push({ index: i, text: ua[i] });
    else if (ua[i] !== ub[i]) diff.units.changed.push({ index: i, from: ua[i], to: ub[i] });
  }

  // Referents — by id, off the individuation cast (type + mass + rho + salience).
  const ca = byId(A.cast), cb = byId(B.cast);
  for (const [id, ra] of ca) {
    if (!cb.has(id)) { diff.referents.lost.push({ id, label: ra.label, type: ra.type }); continue; }
    const rb = cb.get(id);
    const massDelta = Math.abs((ra.mass || 0) - (rb.mass || 0));
    const rhoDelta = Math.abs((ra.rho || 0) - (rb.rho || 0));
    const relDelta = Math.max(massDelta / Math.max(1, ra.mass || 0), rhoDelta / Math.max(1, ra.rho || 0));
    if (ra.type !== rb.type || relDelta > metricThreshold) {
      diff.referents.changed.push({ id, label: ra.label, from: { type: ra.type, mass: ra.mass, rho: ra.rho },
                                     to: { type: rb.type, mass: rb.mass, rho: rb.rho } });
    }
  }
  for (const [id, rb] of cb) if (!ca.has(id)) diff.referents.gained.push({ id, label: rb.label, type: rb.type });

  // Edges — by (from,to,via) key, off the projected graph.
  const edgeKey = (e) => `${e.from}|${e.to}|${e.via}`;
  const ea = new Map(A.graph.edges.map((e) => [edgeKey(e), e]));
  const eb = new Map(B.graph.edges.map((e) => [edgeKey(e), e]));
  for (const [k, e] of ea) if (!eb.has(k)) diff.edges.removed.push(e);
  for (const [k, e] of eb) if (!ea.has(k)) diff.edges.added.push(e);

  diff.identical = diff.units.added.length === 0 && diff.units.removed.length === 0 && diff.units.changed.length === 0
    && diff.referents.gained.length === 0 && diff.referents.lost.length === 0 && diff.referents.changed.length === 0
    && diff.edges.added.length === 0 && diff.edges.removed.length === 0;

  return diff;
};
