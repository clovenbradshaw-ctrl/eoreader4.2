// EO: EVA·SEG(Field,Network → Lens, Tracing,Dissecting) — the occurrence mechanics of the
// search surface (the concordance leg of search-surface.js, split out so neither file passes the
// god-module line law). This is the "best ctrl+F": every verbatim occurrence of the query terms,
// scanned across the topic's sources, highlighted in place — not a prose answer, the words
// themselves. Pure: (sources, terms, docFor) in, occurrence rows out; runs in a unit test exactly
// as it does in the browser.

export const OCC_CAP = 240;         // most occurrences carried per source before the tail is folded
const SNIP_CAP = 320;               // longest sentence carried verbatim into a row

// escRe — a literal term made regex-safe (the surface never runs it, but a caller building its own
// matcher may want it; kept beside the matcher it belongs to).
export const escRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// highlight(text, terms) → [{ s, hit }] — the text split into plain / lit segments, every term
// occurrence marked. Overlapping and adjacent hits are merged so a segment is never split mid-word.
export const highlight = (text, terms) => {
  const win = String(text || '');
  const clean = (terms || []).map((t) => String(t || '').toLowerCase()).filter(Boolean);
  if (!clean.length || !win) return [{ s: win, hit: false }];
  const low = win.toLowerCase();
  const spans = [];
  for (const t of clean) { let i = low.indexOf(t); while (i >= 0) { spans.push([i, i + t.length]); i = low.indexOf(t, i + t.length); } }
  if (!spans.length) return [{ s: win, hit: false }];
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) { if (b > last[1]) last[1] = b; } else merged.push([a, b]);
  }
  const segs = []; let at = 0;
  for (const [a, b] of merged) {
    if (a > at) segs.push({ s: win.slice(at, a), hit: false });
    segs.push({ s: win.slice(a, b), hit: true }); at = b;
  }
  if (at < win.length) segs.push({ s: win.slice(at), hit: false });
  return segs;
};

const sentencesOf = (src, docFor) => { let d = null; try { d = docFor(src); } catch { d = null; } return (d && d.sentences) || []; };
const carriesAll = (low, terms) => terms.every((t) => low.includes(t));

// scanSource(src, terms, docFor, cap) → the occurrence rows for one source: each a sentence that
// carries EVERY term, with its unit index (a door back into the source) and the lit segments.
export const scanSource = (src, terms, docFor, cap = OCC_CAP) => {
  const out = [];
  if (!terms || !terms.length) return out;
  const units = sentencesOf(src, docFor);
  for (let i = 0; i < units.length && out.length < cap; i++) {
    const raw = String(units[i]);
    if (!carriesAll(raw.toLowerCase(), terms)) continue;
    const text = raw.length > SNIP_CAP ? raw.slice(0, SNIP_CAP) + '…' : raw;
    out.push({ unit: i, text, segs: highlight(text, terms) });
  }
  return out;
};

// scanAll(sources, terms, docFor, cap) → { hits, total, counts } — every source that carries the
// query, its occurrences, and the total. `counts` (sn → n) feeds the source rail's signal read.
export const scanAll = (sources, terms, docFor, cap = OCC_CAP) => {
  const hits = []; const counts = new Map(); let total = 0;
  for (const s of sources || []) {
    const occ = scanSource(s, terms, docFor, cap);
    if (!occ.length) continue;
    counts.set(s.sn, occ.length); total += occ.length;
    hits.push({ sn: s.sn, reg: s.reg || '', title: s.title || s.domain || '(untitled source)', kind: s.kind || '', count: occ.length, occurrences: occ });
  }
  hits.sort((a, b) => b.count - a.count);
  return { hits, total, counts };
};

// sourceRail(sources, counts, scopeSignal, anyHits) → one row per source: its occurrence count and
// whether it is SIGNAL for this query. Signal is query-specific first — a source that carries the
// terms is signal — and falls back to the wheat floor (scopeSignal, the substance read from
// scope-sources.js) only when NOTHING anywhere carries the query, so a cold or vague query still
// lights the sources worth reading instead of going dark.
export const sourceRail = (sources, counts, scopeSignal, anyHits) => (sources || []).map((s) => {
  const count = counts.get(s.sn) || 0;
  const signal = anyHits ? count > 0 : (scopeSignal ? !!scopeSignal(s.sn) : true);
  return { sn: s.sn, title: s.title || s.domain || '(untitled source)', reg: s.reg || '', kind: s.kind || '', count, signal };
});
