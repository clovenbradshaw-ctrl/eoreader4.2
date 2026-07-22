// EO: REC·NUL(Atmosphere → Atmosphere, Composing,Clearing) — bounded per-document embedding matrices
//
// Every ingest organ memoises a document's sentence/clause vectors PER embedder
// organ so retrieval, fold, atmosphere and form re-use them across a turn. Held on
// the doc as one Float32Array per unit, they are the single largest structure a read
// produces: a 5,000-sentence prose import is ~8 MB of MiniLM vectors, and — because
// state.sources never evicts within a topic — EVERY open source held its own, so a
// long multi-source session grew the heap without bound on a tab already carrying
// model weights.
//
// This wraps that memo with a GLOBAL budget. The per-(doc,organ) matrix is still
// computed once and cached; but across ALL documents the total number of resident
// vectors is capped, and past the cap the least-recently-used matrix is dropped.
// Dropping costs no meaning: every vector is already in the persistent embed cache
// (model/embed-cache.js — memory + IndexedDB), so re-hydrating a dropped matrix is a
// disk read, never a recompute, and retrieval returns byte-identical results. The
// budget bounds the heap over a long session without changing a single answer.
//
// The budget is generous by default (≈ the working set of a handful of large docs),
// so an ordinary corpus never evicts and current performance is unchanged; only a
// pathological session — many big sources open at once — is held to the ceiling.
//
// The resident matrices are also QUANTIZED to int8 (a quarter the Float32 footprint).
// Every reader of these vectors scores them with COSINE — semantic retrieval, the
// significance/atmosphere projection (projectUnit), the site-role pass, the impression
// query — and cosine re-normalizes both operands, so a per-vector rescale cancels
// exactly. Symmetric per-vector int8 (round(x · 127/max|x|)) preserves DIRECTION to
// ~0.4%/component, which leaves top-k rankings unchanged while cutting the held bytes
// 4×. The query vector stays full-precision Float32 (it is embedded fresh, never
// stored). Disable with setEmbeddingQuantization(false) if a magnitude-sensitive
// reader is ever added.

// Resident-vector budget across all documents. 60k MiniLM (384-dim f32) vectors ≈
// 92 MB; the hash-space copies (64-dim) are a quarter of that. Tunable at runtime.
let BUDGET = 60_000;
let resident = 0;   // total vectors currently held across every live cell
let clock = 0;      // monotonic touch counter → LRU order

// The live matrices. Each cell: { count, seq, pinned, drop }. `drop` detaches the
// cell from its owning per-doc memo so the next request recomputes it.
const cells = new Set();

/** Raise or lower the global resident-vector budget; re-evicts to fit immediately. */
export const setEmbeddingBudget = (n) => {
  BUDGET = Math.max(0, Number(n) | 0);
  evict(null);
};

/** Observability: current residency against the budget (for a memory readout). */
export const embeddingResidency = () => ({ resident, budget: BUDGET, cells: cells.size });

// int8 quantization of resident matrices (on by default). The escape hatch exists for
// a future magnitude-sensitive reader; cosine readers are unaffected either way.
let QUANTIZE = true;
export const setEmbeddingQuantization = (on) => { QUANTIZE = !!on; };

// Quantize an array of float vectors into ONE contiguous Int8Array, returned as per-unit
// subarray views (each a length-`dim` Int8Array — array-like, so every cosine caller reads
// it exactly as it read the Float32 version). Symmetric per-vector scaling to [-127, 127]
// preserves direction; the scale cancels under cosine, so retrieval is unchanged to within
// int8 rounding. A ragged or empty input (mismatched dims, no vectors) is returned as-is.
export const quantizeVectors = (vectors) => {
  if (!QUANTIZE || !Array.isArray(vectors) || vectors.length === 0) return vectors;
  const dim = vectors[0]?.length | 0;
  if (!dim) return vectors;
  for (const v of vectors) if (!v || v.length !== dim) return vectors;   // ragged → leave untouched
  const buf = new Int8Array(vectors.length * dim);
  const out = new Array(vectors.length);
  for (let r = 0; r < vectors.length; r++) {
    const v = vectors[r];
    let max = 0;
    for (let i = 0; i < dim; i++) { const a = v[i] < 0 ? -v[i] : v[i]; if (a > max) max = a; }
    const s = max > 0 ? 127 / max : 0;
    const off = r * dim;
    for (let i = 0; i < dim; i++) {
      let q = Math.round(v[i] * s);
      q = q > 127 ? 127 : q < -127 ? -127 : q;   // clamp (round can reach ±127 already; guard the edge)
      buf[off + i] = q;
    }
    out[r] = buf.subarray(off, off + dim);
  }
  return out;
};

// Drop least-recently-used cells until residency is within budget. A cell still being
// computed (`pinned`) is never dropped — a matrix mid-turn must survive to its await —
// and `keep` (the cell that just landed) is spared so a single access can't evict its
// own result.
const evict = (keep) => {
  if (resident <= BUDGET) return;
  const order = [...cells].sort((a, b) => a.seq - b.seq);
  for (const c of order) {
    if (resident <= BUDGET) break;
    if (c === keep || c.pinned) continue;
    c.drop();
    cells.delete(c);
    resident -= c.count;
  }
};

/**
 * One embedding memo for a single document. `get(organId, count, compute)` returns
 * the cached matrix Promise for that embedder organ, computing it (via `compute`)
 * only on a miss. `count` is how many vectors a full compute yields (the unit count,
 * known synchronously) — it feeds the budget. `release()` drops every matrix this
 * document holds (e.g. when the source leaves the active topic).
 */
export const createEmbeddingMemo = () => {
  const byOrgan = new Map(); // organId → cell

  return {
    get(organId, count, compute) {
      const key = organId || 'default';
      let cell = byOrgan.get(key);
      if (cell) {
        cell.seq = ++clock; // touch — most-recently-used
        return cell.promise;
      }
      cell = {
        count: Math.max(0, Number(count) | 0),
        seq: ++clock,
        pinned: true, // held until the compute resolves so an in-flight matrix can't be evicted
        drop: () => { if (byOrgan.get(key) === cell) byOrgan.delete(key); },
        promise: null,
      };
      cell.promise = Promise.resolve()
        .then(compute)
        .then(quantizeVectors)   // hold the matrix as int8; cosine readers see identical rankings
        .then((v) => { cell.pinned = false; evict(cell); return v; })
        .catch((err) => {
          // A failed compute must not wedge the slot: unregister so a retry recomputes.
          if (byOrgan.get(key) === cell) byOrgan.delete(key);
          if (cells.delete(cell)) resident -= cell.count;
          throw err;
        });
      byOrgan.set(key, cell);
      cells.add(cell);
      resident += cell.count;
      return cell.promise;
    },
    release() {
      for (const cell of byOrgan.values()) {
        if (cells.delete(cell)) resident -= cell.count;
      }
      byOrgan.clear();
    },
  };
};
