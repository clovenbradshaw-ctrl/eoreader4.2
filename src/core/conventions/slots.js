// EO: CON·SYN·DEF·EVA·REC(Network → Kind,Paradigm, Binding,Composing) — the scale-free slot field
// The induction primitive — how a reader with NO dictionary learns which units are the same
// KIND, the way the creature in Frankenstein learned language: by watching which words keep
// which company. One operation, applied at every scale (docs/slot-induction.md):
//
//   1. a UNIT is whatever the organ streams — a word, a segment marker, a slot id from the rung
//      below, a region, a speaker turn. It is just a key; this module never inspects its meaning.
//   2. its COMPANY is who sits to its left and right (CON — co-occurrence bonds).
//   3. a SLOT is the class of units that keep the same company (SYN — units synthesised into one
//      KIND because position, the witness, cannot tell them apart). Held as a DEF, testable by
//      EVA (does this unit keep behaving like its slot?), revisable by REC.
//   4. RECURSION: replace each unit by its slot id and the stream becomes the units of the NEXT
//      rung. Determiner+noun company composes the noun-phrase slot; speeches keep the company of
//      adjacent speakers and compose the character slot. A holon: a whole that is a part, repeated.
//
// Pure and modality-neutral — units are opaque strings, so the same field runs on tokens, on
// lifted slot ids, on image-region keys, on speaker labels. No embeddings, no language, no
// Math.random / Date (deterministic, so a resumed reading is byte-identical). The coordinate
// system (the FRAME) is not supplied — it EMERGES as the highest-frequency units, which in any
// language is the closed class. Content is located against that frame.

// A boundary between readings/segments — insert it into a stream so "begins a segment" is a
// learnable company, and so no bond forms across the gap. Any sentinel not colliding with a real
// unit works; this is the conventional one.
export const BOUNDARY = '␞';   // ␞ (record separator glyph)

// createSlotField(opts) → the inducer. `frameSize` axes (the emergent closed class), cluster the
// `clusterTop` most-frequent units (content thins into a long tail below that), a unit must recur
// `minFreq` times to be placed, `k` nearest kept per unit, `simFloor` the least company-overlap
// that counts as the same slot. Defaults tuned on book-scale text; a caller sweeps them per rung.
export const createSlotField = ({
  frameSize = 100, clusterTop = 500, minFreq = 3, k = 10, simFloor = 0.30,
} = {}) => {
  const freq = new Map();          // unit → count
  const L = new Map(), R = new Map();   // unit → Map(neighbour → count) — left / right company
  const bump = (m, a, b) => { let mm = m.get(a); if (!mm) m.set(a, mm = new Map()); mm.set(b, (mm.get(b) || 0) + 1); };

  let _frame = null; const _vec = new Map();   // caches, invalidated on observe
  const invalidate = () => { _frame = null; _vec.clear(); };

  // observe(sequence) — accumulate frequency and left/right company over one reading. Call it
  // once per document, or many times to pool a corpus; either way the field is the union. A
  // BOUNDARY unit stops a bond forming across it (no company spans a segment break).
  const observe = (seq) => {
    for (let i = 0; i < seq.length; i++) {
      const u = seq[i];
      if (u == null || u === BOUNDARY) continue;
      freq.set(u, (freq.get(u) || 0) + 1);
      const prev = seq[i - 1], next = seq[i + 1];
      if (i > 0 && prev != null && prev !== BOUNDARY) bump(L, u, prev);
      if (i < seq.length - 1 && next != null && next !== BOUNDARY) bump(R, u, next);
    }
    invalidate();
    return field;   // chainable
  };

  // frame() — the coordinate system: the `frameSize` most frequent units. The closed class of
  // the language falls out here (the/of/and/he/was …), with no list — it is simply what recurs
  // everywhere. These are the axes every other unit's company is measured against.
  const frame = () => _frame || (_frame = new Set(
    [...freq].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, frameSize).map(([u]) => u)));

  // vector(u) — the company u keeps, as a sparse L2-normalised map over the frame. Left and right
  // are separate coordinates ('L…' / 'R…'), because "sits before the frame word" and "sits after
  // it" are different evidence — a determiner precedes nouns, an object follows verbs.
  const vector = (u) => {
    let v = _vec.get(u); if (v) return v;
    const f = frame(); v = new Map();
    const side = (tag, m) => { if (!m) return; for (const [nb, c] of m) if (f.has(nb)) v.set(tag + nb, c); };
    side('L', L.get(u)); side('R', R.get(u));
    let n = 0; for (const c of v.values()) n += c * c; n = Math.sqrt(n) || 1;
    for (const [key, c] of v) v.set(key, c / n);
    _vec.set(u, v);
    return v;
  };

  // similarity(a,b) — cosine of the two company vectors (already normalised, so a dot product).
  const similarity = (a, b) => {
    const va = vector(a), vb = vector(b);
    const [small, big] = va.size <= vb.size ? [va, vb] : [vb, va];
    let d = 0; for (const [key, c] of small) { const o = big.get(key); if (o) d += c * o; }
    return d;
  };

  // the units eligible to be placed in a slot: recurrent enough, capped to the frequent head
  // (deterministic order — count desc, then key, so the field never depends on Map insertion order).
  const placeable = () => [...freq]
    .filter(([, c]) => c >= minFreq)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, clusterTop).map(([u]) => u);

  // neighbours(u) — the units whose company most resembles u's: u's slot-mates, hottest first.
  const neighbors = (u, n = k) => {
    const pool = placeable();
    return pool.filter((x) => x !== u).map((x) => [x, similarity(u, x)])
      .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
  };

  // cluster() → { slots, slotOf }. The slots are the connected components of the MUTUAL-kNN graph
  // (u links v only when each is in the other's k-nearest AND their company overlaps ≥ simFloor).
  // Mutual-kNN is what keeps a hub ("the") from swallowing the graph, and needs no k and no seed —
  // the classes are however many the text's own geometry supports. Deterministic (union-find over
  // the sorted placeable order). Slots are returned largest-first, so slot 0 is the biggest class.
  const cluster = ({ sim = simFloor, k: kk = k } = {}) => {
    const pool = placeable();
    const knn = new Map(pool.map((u) => [u, new Set(neighbors(u, kk).filter(([, s]) => s >= sim).map(([x]) => x))]));
    const parent = new Map(pool.map((u) => [u, u]));
    const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; } return r; };
    const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
    for (const u of pool) for (const v of knn.get(u)) if (knn.get(v)?.has(u)) uni(u, v);
    const groups = new Map();
    for (const u of pool) { const r = find(u); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(u); }
    const slots = [...groups.values()].sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
    const slotOf = new Map(); slots.forEach((g, i) => g.forEach((u) => slotOf.set(u, i)));
    return { slots, slotOf };
  };

  // lift(seq, slotOf) — the RECURSION: rewrite a stream in terms of its slots, so it becomes the
  // units of the next rung up. A unit with no slot keeps its own identity (a rare content word is
  // its own kind); a BOUNDARY passes through so the rung above still sees segment breaks.
  const lift = (seq, slotOf) => seq.map((u) => {
    if (u == null || u === BOUNDARY) return u;
    const s = slotOf.get(u);
    return s == null ? u : ('§' + s);   // §<id>
  });

  const field = {
    observe, frame, vector, similarity, neighbors, cluster, lift,
    freqOf: (u) => freq.get(u) || 0,
    get size() { return freq.size; },
  };
  return field;
};

// induceSlots(sequence, opts) → { slots, slotOf, field } — the one-shot convenience: observe a
// single stream and cluster it. Use createSlotField directly to pool multiple readings or to
// climb rungs (observe(lift(seq, slotOf)) into a fresh field).
export const induceSlots = (sequence, opts = {}) => {
  const field = createSlotField(opts);
  field.observe(sequence);
  const { slots, slotOf } = field.cluster(opts);
  return { slots, slotOf, field };
};
