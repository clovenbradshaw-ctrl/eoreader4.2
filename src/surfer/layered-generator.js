// EO: SYN·REC(Field,Paradigm → Network, Composing,Making) — layered generative stack
// The layered generative stack — generate many layers of meaning at once.
//
// An LLM predicts one stream (tokens); its layers of meaning are entangled in a hidden
// state you cannot see, steer, or re-ground separately. This generates an explicit STACK
// of layers, slow (high) to fast (low) — e.g. Paradigm → Lens → Proposition → Token —
// where each layer is a chain CONDITIONED on the layer above it:
//
//   the HIGH makes the LOW probable — each layer is a prior over the one below
//     (a "Gregor scene" makes the words Gregor/he/crawled probable);
//   the LOW makes the HIGH possible — the high symbols are abstractions OVER the low
//     (there is no "Gregor scene" without the tokens that constitute it).
//
// Coherence lives in the high layers (a slow chain persists), fluency in the low — and
// because the layers are explicit, each is INDEPENDENTLY RE-GROUNDABLE: a Paradigm REC
// relocates the top layer (the frame shifts) while the layers below keep realizing
// surface. That is the helix as a generator: the recursion that constitutes upward and
// predicts downward, run forward.
//
// PURE ON SYMBOL STREAMS: the caller supplies each layer as a per-position symbol array.
// Today those are surface proxies (a referent regex, a register count); with the embedder
// the high layers become the lens (eigenLenses of ρ) and paradigm (the basis in force) —
// the SAME stack, a meaning layer instead of a regex. Omnimodal: the bottom layer is
// tokens for text, notes for music, frames for video.

const RES = 0.5;
const sum = (m) => { let s = 0; for (const v of m.values()) s += v; return s; };
const round = (x) => Math.round(x * 1000) / 1000;

// A conditional chain for one layer: p(symbol | own-context, parent-symbol), interpolated
// backoff from (parent ∧ ctx) down to the layer's own unigram, with a novelty reserve.
const buildChain = (syms, parents, order) => {
  const uni = new Map(), cond = new Map();
  for (let i = 0; i < syms.length; i++) {
    uni.set(syms[i], (uni.get(syms[i]) || 0) + 1);
    for (let j = 0; j <= order && i - j >= 0; j++) {
      const key = `${parents[i]}${syms.slice(i - j, i).join('>')}`;
      const r = cond.get(key) || new Map(); r.set(syms[i], (r.get(syms[i]) || 0) + 1); cond.set(key, r);
    }
  }
  return { uni, cond, order };
};
const distChain = (chain, parent, ctx) => {
  const { uni, cond, order } = chain; const V = uni.size || 1; const Zu = sum(uni) + RES;
  let dist = new Map(); for (const [s, c] of uni) dist.set(s, (c + RES / V) / Zu);
  for (let j = 0; j <= Math.min(order, ctx.length); j++) {
    const r = cond.get(`${parent}${ctx.slice(ctx.length - j).join('>')}`); if (!r) continue;
    const Z = sum(r) + RES, a = (Z - RES) / (Z - RES + 1);
    const nd = new Map(); for (const s of new Set([...dist.keys(), ...r.keys()])) nd.set(s, a * (((r.get(s) || 0) + RES / V) / Z) + (1 - a) * (dist.get(s) || 0));
    dist = nd;
  }
  return dist;
};

// A token n-gram (the bottom layer), conditioned on the lowest high-layer symbol.
const mkTok = (order) => ({ uni: new Map(), g: Array.from({ length: order + 1 }, () => new Map()) });
const addTok = (m, ts, order) => { for (let i = 0; i < ts.length; i++) { m.uni.set(ts[i], (m.uni.get(ts[i]) || 0) + 1); for (let j = 1; j <= order && i - j >= 0; j++) { const c = ts.slice(i - j, i).join(' '); const r = m.g[j].get(c) || new Map(); r.set(ts[i], (r.get(ts[i]) || 0) + 1); m.g[j].set(c, r); } } };
const pTok = (m, ctx, next, order) => { if (!m) return 0; const V = m.uni.size || 1; let p = ((m.uni.get(next) || 0) + RES / V) / (sum(m.uni) + RES); for (let j = 1; j <= order && j <= ctx.length; j++) { const r = m.g[j].get(ctx.slice(ctx.length - j).join(' ')); if (!r) continue; const Z = sum(r) + RES, a = (Z - RES) / (Z - RES + 1); p = a * (((r.get(next) || 0) + RES / V) / Z) + (1 - a) * p; } return p; };

const runLen = (xs) => { if (!xs.length) return 0; let runs = [], cur = 1; for (let i = 1; i < xs.length; i++) { if (xs[i] === xs[i - 1]) cur++; else { runs.push(cur); cur = 1; } } runs.push(cur); return runs.reduce((a, b) => a + b, 0) / runs.length; };

// createLayeredGenerator({ layers, sentences, order, tokenOrder })
//
//   layers     top→bottom, each { name, syms: string[] (one per sentence), order? }.
//              layer 0's parent is ROOT; layer k's parent is layer k-1's symbol.
//   sentences  array of token arrays — the bottom (surface) layer.
export const createLayeredGenerator = ({ layers, sentences, order = 1, tokenOrder = 3 }) => {
  if (!layers?.length || !sentences?.length) throw new Error('layered generator needs layers and sentences');
  const L = layers.length;
  const parentsOf = (k) => (k === 0 ? sentences.map(() => 'ROOT') : layers[k - 1].syms);
  const chains = layers.map((ly, k) => buildChain(ly.syms, parentsOf(k), ly.order ?? order));

  // token model: per bottom-layer symbol, plus a global backoff
  const bottom = layers[L - 1].syms;
  const global = mkTok(tokenOrder); const bySym = {};
  sentences.forEach((ts, i) => { addTok(global, ts, tokenOrder); const c = bottom[i]; (bySym[c] || (bySym[c] = mkTok(tokenOrder))); addTok(bySym[c], ts, tokenOrder); });
  const tokDist = (sym, ctx) => {
    const set = new Set();
    for (const m of [bySym[sym], global]) for (let j = tokenOrder; j >= 1; j--) { const r = m?.g[j].get(ctx.slice(ctx.length - j).join(' ')); if (r) for (const k of r.keys()) set.add(k); }
    if (set.size < 5) for (const k of global.uni.keys()) { set.add(k); if (set.size > 150) break; }
    return [...set].map(u => ({ u, p: 0.7 * pTok(bySym[sym], ctx, u, tokenOrder) + 0.3 * pTok(global, ctx, u, tokenOrder) }));
  };

  const mkRnd = (seed) => { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const drawMap = (dist, rnd) => { const e = [...dist.entries()]; const Z = e.reduce((a, [, p]) => a + p, 0) || 1; let x = rnd() * Z; for (const [k, p] of e) { x -= p; if (x <= 0) return k; } return e.at(-1)?.[0]; };
  const drawArr = (arr, rnd) => { const Z = arr.reduce((a, r) => a + r.p, 0) || 1; let x = rnd() * Z; for (const r of arr) { x -= r.p; if (x <= 0) return r.u; } return arr.at(-1)?.u; };
  const detok = (ts) => ts.join(' ').replace(/ ([.,;:!?])/g, '$1');

  // Generate nSent sentences down the whole stack. `regroundAt` maps a sentence index to
  // a layer name to re-ground THERE (drop that layer's context to a NUL) — only that
  // layer jumps; the others continue. Each layer is independently relocatable.
  const generate = (nSent, { seed = 1, regroundAt = {} } = {}) => {
    const rnd = mkRnd(seed);
    const prev = layers.map(() => []);
    const out = [];
    for (let i = 0; i < nSent; i++) {
      const reLayer = regroundAt[i];
      const chosen = [];
      for (let k = 0; k < L; k++) {
        if (reLayer && layers[k].name === reLayer) prev[k] = [];        // re-ground this layer alone
        const parent = k === 0 ? 'ROOT' : chosen[k - 1];
        const sym = drawMap(distChain(chains[k], parent, prev[k]), rnd);
        chosen[k] = sym; prev[k] = [...prev[k], sym].slice(-(layers[k].order ?? order));
      }
      let ctx = [], n = 0; const sent = [];
      while (n++ < 40) { const w = drawArr(tokDist(chosen[L - 1], ctx), rnd); if (w == null) break; sent.push(w); ctx = [...ctx, w].slice(-tokenOrder); if (/[.!?]/.test(w) && n > 5) break; }
      const symbols = Object.fromEntries(layers.map((ly, k) => [ly.name, chosen[k]]));
      out.push({ symbols, text: detok(sent), regrounded: reLayer || null });
    }
    return out;
  };

  return Object.freeze({
    generate,
    layers: layers.map(l => l.name),
    // coherence of the SOURCE at each layer (run-length of same-symbol runs) — the
    // baseline a generated stack should roughly match per layer.
    sourceCoherence: () => Object.fromEntries(layers.map(l => [l.name, round(runLen(l.syms))])),
    coherenceOf: (gen) => Object.fromEntries(layers.map(l => [l.name, round(runLen(gen.map(g => g.symbols[l.name])))])),
  });
};
