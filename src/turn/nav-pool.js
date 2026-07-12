// EO: SIG·INS(Field → Atmosphere, Tending,Making) — the time-boxed navigation pool
// Extend the shape library's navigation with the corpus pool (data/nav-corpus.jsonl,
// tools/nav-sample.mjs) under a WALL-CLOCK BUDGET — the "minute on a shitty laptop"
// contract. The pool is round-robin interleaved across its five sources at build time,
// so however far the budget reaches, coverage is breadth-first: the first N items span
// every source, not the head of one.
//
// The pool navigates; it never becomes a target. Each embedded prompt gets a
// TRANSFERRED intent — the intent vote of its nearest exemplar prompts — at half an
// exemplar's vote weight, and the library holds nav entries apart from exemplars
// (shape.js: never `best`, never a targetExemplar, never a sample to imitate).
//
// MORE EFFICIENT THE MORE IT OPERATES: with a persistent-cache embedder
// (model/embed-cache.js) the already-embedded prefix is a cache race, not a spend —
// `embedIfCached` probes memory/IndexedDB without computing. Each session's budget
// therefore starts where the last one stopped: session 1 embeds ~the first minute's
// worth, session 2 races through those and extends, until the whole pool is resident
// and load cost is one IndexedDB sweep.

const NAV_URL = new URL('../../data/nav-corpus.jsonl', import.meta.url).href;

const parseJsonl = (text) => {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed line */ }
  }
  return out;
};

const dot = (a, b) => {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

// The transferred label: the weighted intent vote of the k nearest exemplar prompts
// (vectors are unit-norm, so dot is cosine). Null below a floor similarity — a corpus
// prompt near NO exemplar teaches navigation nothing about Cleo's intents and is
// better left out of the vote than guessed.
const transferIntent = (vec, exemplars, { k = 3, floor = 0.35 } = {}) => {
  const scored = [];
  for (const e of exemplars) if (e.promptVec) scored.push({ e, sim: dot(vec, e.promptVec) });
  if (!scored.length) return null;
  scored.sort((a, b) => b.sim - a.sim);
  const top = scored.slice(0, k).filter((s) => s.sim >= floor);
  if (!top.length) return null;
  const votes = {};
  for (const { e, sim } of top) votes[e.intent] = (votes[e.intent] || 0) + sim;
  let intent = null, best = -Infinity;
  for (const key of Object.keys(votes)) if (votes[key] > best) { best = votes[key]; intent = key; }
  return { intent, sim: top[0].sim };
};

// extendLibraryWithNavPool(library, embedder, opts) → { embedded, cached, labelled,
// skipped, total, exhausted, ms }. Fetches the pool, then walks it in file order
// (already breadth-first): cache-probe first (free), compute only while the budget
// holds, transfer a label, and feed the library. Degrades to a no-op — never throws,
// never blocks the boot longer than the budget plus one in-flight embed.
export const extendLibraryWithNavPool = async (library, embedder, {
  url = NAV_URL,
  budgetMs = 60_000,
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  onProgress = null,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) => {
  const out = { embedded: 0, cached: 0, labelled: 0, skipped: 0, total: 0, exhausted: false, ms: 0 };
  if (!library?.addNavEntries || !embedder?.embed || !fetchImpl) return out;
  let records;
  try {
    const res = await fetchImpl(url);
    if (!res || !res.ok) return out;
    records = parseJsonl(await res.text());
  } catch { return out; }
  out.total = records.length;

  const t0 = now();
  const entries = [];
  for (const r of records) {
    if (typeof r?.text !== 'string' || !r.text.trim()) { out.skipped++; continue; }
    let vec = null;
    // Free path first: a vector any prior session already computed costs no budget.
    if (embedder.embedIfCached) {
      try { vec = await embedder.embedIfCached(r.text); } catch { vec = null; }
    }
    if (vec) out.cached++;
    else if (now() - t0 < budgetMs) {
      try { vec = await embedder.embed(r.text); out.embedded++; } catch { out.skipped++; continue; }
    } else { out.exhausted = true; break; }
    const label = transferIntent(vec, library.lib);
    if (!label) { out.skipped++; continue; }
    out.labelled++;
    entries.push({
      id: r.id, source: r.source, intent: label.intent, transferred: true,
      promptVec: vec, user_turn: r.text, weight: 0.5,
    });
    if (onProgress && (out.cached + out.embedded) % 100 === 0) {
      onProgress({ done: out.cached + out.embedded, total: out.total, embedded: out.embedded, cached: out.cached });
    }
  }
  library.addNavEntries(entries);
  out.ms = Math.round(now() - t0);
  return out;
};
