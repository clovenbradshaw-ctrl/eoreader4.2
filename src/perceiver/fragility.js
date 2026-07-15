// EO: EVA·SEG·REC(Network,Lens → Lens,Paradigm, Tracing,Dissecting,Composing) — the fragility fold
// fragility.js — which contested claims are LOAD-BEARING.
//
// A record disagrees with itself in places: two sources put different magnitudes on one measure,
// or one text both affirms and denies a bond (the significance engine's contradictions). Not all
// disputes matter equally — a contested fact about a figure the rest of the record barely touches
// is cheap to be wrong about; a contested fact about a figure everything else leans on is a
// load-bearing wall. This fold ranks the contested by their FOOTPRINT: how much of the record is
// attached to the same subject and would be thrown into question if the contested claim is wrong.
//
// HONEST FLOOR, not entailment. The footprint is what the record attaches to a subject (its
// incident claims across the corpus), not what logically follows — the engine cannot prove
// entailment, so it reports dependence the record actually wrote down and says so. Pure: given the
// corpus claims and the contested items, it ranks; it reads no graph and runs no model.

const defaultNorm = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').replace(/(?:ies|es|s)$/, '');

// Rank contested items by footprint. `claims` are the corpus's claims, each { subject, object?,
// text, source? } (the app builds them from figure-fold's claimsFromDoc). `contested` are the
// disputes, each { subject, kind, description, ... } (magnitude conflicts and contradictions).
// Returns each contested item with its `load` (distinct incident claims), `sources` touched, and
// the `dependents` — the specific lines that hang off the same subject — ranked most-fragile first.
export const rankFragility = (claims, contested, { norm = defaultNorm, maxDependents = 8 } = {}) => {
  const incident = new Map();
  const add = (k, c) => { if (!k) return; const a = incident.get(k); if (a) a.push(c); else incident.set(k, [c]); };
  for (const c of claims || []) {
    const s = norm(c.subject);
    add(s, c);
    if (c.object) { const o = norm(c.object); if (o && o !== s) add(o, c); }
  }
  const items = (contested || []).map((item) => {
    const inc = incident.get(norm(item.subject)) || [];
    const seen = new Set(), dependents = [];
    for (const c of inc) { const t = String(c.text || '').trim(); if (t && !seen.has(t)) { seen.add(t); dependents.push(t); } }
    const sources = new Set(inc.map((c) => c.source).filter((x) => x != null));
    return { ...item, load: dependents.length, sources: sources.size, dependents: dependents.slice(0, maxDependents) };
  });
  items.sort((a, b) => (b.load - a.load) || (b.sources - a.sources));
  return { items, metric: { contested: items.length, loadBearing: items.filter((i) => i.load > 0).length } };
};
