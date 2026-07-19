// EO: SYN·EVA·SIG(Entity,Field → Network,Lens, Composing) — the talker's turn on a nameless body
// Name the nameless, merge the synonyms (optional, model-backed). The unnamed-referent read
// (unnamed-referent.js) named each body by its own dominant description and abstained on two
// world-knowledge judgments: is "the creature" the name a reader would give, and are
// "the monster"/"the wretch" the SAME figure? A talker knows both. `proposeReferentNames` lets it
// PROPOSE — rename a body, fold synonyms onto one — returning proposals of the shape admission
// consumes, so a caller hands the result straight back as the pipeline's `nameReferent`. TOTAL:
// any model fault or unparseable reply and the mechanical labels stand (no-worse-than-mechanics).
// The model proposes; only the caller admits — nothing here writes to the log.

import { unnamedReferentId as idFor } from './unnamed-referent.js';

const SYSTEM_NAME = 'You name the nameless figures a reader found in a text. Each figure has no '
  + 'proper name — only a description the text repeats. Given each description and example '
  + 'sentences, give the figure the shortest natural name a reader would use, and say which '
  + 'descriptions are the SAME figure. Reply with ONLY a JSON array, no prose.';

const parseJsonArray = (text) => {
  const s = String(text || '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try { const v = JSON.parse(s.slice(a, b + 1)); return Array.isArray(v) ? v : null; }
  catch { return null; }
};

export const proposeReferentNames = async (proposals, { model, sentences = [], maxSamples = 6 } = {}) => {
  if (!Array.isArray(proposals) || !proposals.length || !model || typeof model.phrase !== 'function')
    return proposals || [];
  const samplesOf = (p) => (p.mentions || []).slice(0, maxSamples).map((i) => String(sentences[i] || '')).filter(Boolean);
  const ask = proposals.map((p) => ({ id: p.id, description: p.label, samples: samplesOf(p) }));
  let decided;
  try {
    const reply = await model.phrase([
      { role: 'system', content: SYSTEM_NAME },
      { role: 'user', content: 'Figures:\n' + JSON.stringify(ask)
          + '\n\nReturn JSON: [{"id": <the id>, "name": <short name>, "sameAs": <id of the figure this one IS, or null>}]' },
    ], { maxTokens: 400 });
    decided = parseJsonArray(reply);
  } catch { decided = null; }
  if (!decided) return proposals;

  const byId = new Map(proposals.map((p) => [p.id, p]));
  const rename = new Map(), sameAs = new Map();
  for (const d of decided) {
    if (!d || !byId.has(d.id)) continue;
    if (d.name && typeof d.name === 'string' && d.name.trim()) rename.set(d.id, d.name.trim());
    if (d.sameAs && byId.has(d.sameAs) && d.sameAs !== d.id) sameAs.set(d.id, d.sameAs);
  }
  // Fold each synonym onto its canonical body (following sameAs to a fixpoint), carrying the
  // merged surface forms so the admission can SYN them. A body no one folded stands alone.
  const canonOf = (id) => { const seen = new Set(); let c = id; while (sameAs.has(c) && !seen.has(c)) { seen.add(c); c = sameAs.get(c); } return c; };
  const merged = new Map();
  for (const p of proposals) {
    const c = canonOf(p.id);
    let g = merged.get(c);
    if (!g) { const base = byId.get(c); merged.set(c, g = { ...base, mergedFrom: [], surfaces: [...(base.surfaces || [])] }); }
    if (p.id !== c) {
      g.mergedFrom.push({ id: p.id, label: p.label });
      g.mentions = [...new Set([...(g.mentions || []), ...(p.mentions || [])])].sort((a, b) => a - b);
      g.count = g.mentions.length; g.mass = g.count;
      for (const s of (p.surfaces || [])) if (!g.surfaces.includes(s)) g.surfaces.push(s);
    }
  }
  const result = [];
  for (const [id, g] of merged) {
    const label = rename.get(id) || g.label;
    result.push({ ...g, id: idFor(label), label, describedAs: g.label !== label ? g.label : undefined });
  }
  result.sort((a, b) => b.mass - a.mass || (a.label < b.label ? -1 : 1));
  return result;
};
