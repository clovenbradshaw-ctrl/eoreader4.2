// EO: EVA·DEF(Network,Field → Lens, Tracing,Binding) — Research Review: a search result becomes
// a provisional, inspectable corpus, not a ranked list of links (docs/research-review.md).
//
// Three source states already exist implicitly in the app (a web hit is DISCOVERED the moment
// search() returns it; it is REVIEWED the moment it is fetched and admitted to the S-registry;
// it is ADMITTED the moment its sn joins a topic's sourceSns — see docs/research-review.md for the
// full wiring). This module is the pure read over a REVIEWED candidate set: what do the fetched
// pages actually establish, how do they connect, which are the same voice wearing different URLs,
// and where do they agree or disagree. The corpus-selection half (recipes, stats, the one
// entrance) lives beside it in research-review-corpus.js (the god-module ratchet, ~250 lines/file).
//
// Pure and model-free: (candidate rows, entities, comparison matrix) in, computed structure out —
// runs in a unit test exactly as it does in the browser. No frontier LLM is invited into any of
// this; every sentence the reading produces is assembled from the numbers computed here.

import { witnessDescriptor, sameWitness } from '../../enactor/ground/index.js';

// ── term profiling (evidence areas) ──────────────────────────────────────────────────────────

const STOP = new Set(('the a an and or but if then than that this these those of to in on for with as by from '
  + 'at is are was were be been being it its their there here they them he she his her you your we our i not '
  + 'no also into over under after before between about which who what when where how more most some such '
  + 'can could should would will shall may might do does did have has had said says say').split(' '));

// topTerms(text, n) → the n most frequent salient tokens (length ≥ 4, not a stopword) — the same
// term-frequency reduction turn/research.js's profileOf uses for curiosity, reused here to name
// what a candidate is actually ABOUT rather than trusting its title.
export const topTerms = (text, n = 10) => {
  const counts = new Map();
  const toks = String(text || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
  for (const t of toks) {
    const w = t.replace(/^'+|'+$/g, '');
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([term, count]) => ({ term, count }));
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let hit = 0; for (const x of a) if (b.has(x)) hit++;
  return hit / (a.size + b.size - hit);
};

// ── duplicate / derivative clusters ───────────────────────────────────────────────────────────

// clusterDuplicates(rows) → [{ members:[row…], origin:row, derivative:[row…] }] — union-find over
// sameWitness (enactor/ground/corroboration.js): identity facts only (id/hash/host/byline), never
// a content-similarity guess (see that module's header for why). `origin` is the earliest retrieved
// member; the rest are flagged derivative — "possible derivative cluster", never asserted as
// proven, since a shared host can also just be one publisher's two independent stories.
export const clusterDuplicates = (rows) => {
  const xs = (rows || []).filter(Boolean);
  const n = xs.length;
  const parent = xs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const desc = xs.map((r) => witnessDescriptor(r));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (sameWitness(desc[i], desc[j])) parent[find(j)] = find(i);
  const groups = new Map();
  for (let i = 0; i < n; i++) { const root = find(i); let g = groups.get(root); if (!g) groups.set(root, g = []); g.push(xs[i]); }
  return [...groups.values()].map((members) => {
    const sorted = members.slice().sort((a, b) => (a.retrieved || '').localeCompare(b.retrieved || ''));
    return { members: sorted, origin: sorted[0], derivative: sorted.slice(1) };
  });
};

// independentOriginCount(rows) → how many MEANINGFULLY DISTINCT voices the set holds — clusters.length.
export const independentOriginCount = (rows) => clusterDuplicates(rows).length;

// clusterOf(sn, clusters) → the cluster a source belongs to, or null.
export const clusterOf = (sn, clusters) => (clusters || []).find((c) => c.members.some((m) => m.sn === sn)) || null;

// matchReason, applyIndependentOverrides, identityCandidates, connectionNarrative, and sourceNetwork
// live in research-review-network.js (the god-module ratchet, ~250 lines/file) — the connections/
// identity/network half of this read, over the same clusters/areas computed here.

// ── evidence areas ────────────────────────────────────────────────────────────────────────────

// evidenceAreas(rows) → [{ label, terms:[…], sns:[…], sourceCount, independentOrigins }] — a greedy
// clustering of candidates by shared salient terms (Jaccard over each row's top terms), NOT an
// invented editorial taxonomy: the label is the shared vocabulary itself, so it stays inspectable —
// click an area, see exactly which words put these sources in it. The overlap floor is derived from
// the observed pairwise overlaps in THIS candidate set (mean + one spread above it), never a single
// hand-picked constant, so a tight corpus and a scattershot one get different, honest floors.
export const evidenceAreas = (rows, { maxAreas = 8, minMembers = 1 } = {}) => {
  const xs = (rows || []).filter((r) => r && r.text);
  if (!xs.length) return [];
  const terms = xs.map((r) => new Set(topTerms(r.text, 12).map((t) => t.term)));
  const n = xs.length;
  const overlaps = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const ov = jaccard(terms[i], terms[j]);
    if (ov > 0) overlaps.push(ov);
  }
  let floor = 0.14;                          // the honest floor when there is nothing to derive from
  if (overlaps.length >= 3) {
    const mean = overlaps.reduce((a, b) => a + b, 0) / overlaps.length;
    const spread = Math.sqrt(overlaps.reduce((a, b) => a + (b - mean) ** 2, 0) / overlaps.length);
    floor = Math.max(0.1, mean + spread * 0.5);
  }
  const used = new Set();
  const areas = [];
  const order = xs.map((_, i) => i).sort((a, b) => terms[b].size - terms[a].size);
  for (const seed of order) {
    if (used.has(seed)) continue;
    const memberIdx = [seed];
    used.add(seed);
    for (let j = 0; j < n; j++) {
      if (used.has(j) || j === seed) continue;
      if (jaccard(terms[seed], terms[j]) >= floor) { memberIdx.push(j); used.add(j); }
    }
    if (memberIdx.length < minMembers) continue;
    const tally = new Map();
    for (const i of memberIdx) for (const t of terms[i]) tally.set(t, (tally.get(t) || 0) + 1);
    const label = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t);
    const members = memberIdx.map((i) => xs[i]);
    areas.push({
      label: label.join(' · ') || 'general',
      terms: label,
      sns: members.map((r) => r.sn),
      sourceCount: members.length,
      independentOrigins: independentOriginCount(members),
    });
  }
  areas.sort((a, b) => b.sourceCount - a.sourceCount);
  return areas.slice(0, maxAreas);
};

// coverageDots(sourceCount, max) → 0..5 filled dots — a coarse, honest read of "how covered", never
// a fabricated percentage. Scales to the biggest area in THIS set so the busiest area always reads full.
export const coverageDots = (sourceCount, max) => {
  if (!max || !sourceCount) return 0;
  return Math.max(1, Math.round((sourceCount / max) * 5));
};

// ── connections (shared referents + derivative links) ────────────────────────────────────────

const REF_STOP = new Set('the and for that this with from into over their there they them then than when what which while day time year years part end city state department agency'.split(' '));
const refCore = (label) => {
  const toks = String(label || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!toks.length) return '';
  const core = toks.length > 1 ? toks[toks.length - 1] : toks[0];
  return (core.length < 3 || REF_STOP.has(core)) ? '' : core;
};

// referentCoreGroups(rows, entityRows) → [{ core, sns:[…], chip:{label,docId,entId} }] — one group
// per referent CORE (the shared-vocabulary reduction refCore does), each carrying which reviewed
// candidates mention it and a representative display chip. The shared substrate under BOTH
// sharedReferentLinks (pairs, for connections) and identityCandidates (the reviewable list, for
// §7.3) — one grouping computed once and read two ways, so a confirmed/rejected identity decision
// and a drawn connection line can never disagree about which referent they mean.
export const referentCoreGroups = (rows, entityRows) => {
  const sns = new Set((rows || []).map((r) => r.sn));
  const coreMap = new Map();
  for (const e of entityRows || []) {
    const core = refCore(e.label); if (!core) continue;
    let g = coreMap.get(core); if (!g) coreMap.set(core, g = { core, sns: new Set(), rep: null });
    for (const i of e.instances || []) if (sns.has(i.sn)) g.sns.add(i.sn);
    const len = String(e.label || '').length;
    if (e.docId && e.entId && (!g.rep || len > g.rep.len)) g.rep = { label: e.label, docId: e.docId, entId: e.entId, len };
  }
  return [...coreMap.values()]
    .filter((g) => g.rep && g.sns.size)
    .map((g) => ({ core: g.core, sns: [...g.sns], chip: { label: g.rep.label, docId: g.rep.docId, entId: g.rep.entId } }));
};

// sharedReferentLinks(rows, entityRows) → [{ a, b, sharedCount, shared:[{label,docId,entId}] }] —
// two candidates are linked when they name the same referent (grouped by referent core, since raw
// cross-source coref does not run here — "Frankenstein" in one source and "Victor" in another stay
// distinct entity rows without cross-source coref). Mirrors the Results-landing precedent
// (index.html's sfrLinks) but scoped to an arbitrary candidate set, not the whole record.
export const sharedReferentLinks = (rows, entityRows) => {
  const groups = referentCoreGroups(rows, entityRows);
  const pairs = new Map();
  for (const g of groups) {
    const list = g.sns; if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const key = [String(list[i]), String(list[j])].sort().join('|');
      let pr = pairs.get(key);
      if (!pr) pairs.set(key, pr = { a: list[i], b: list[j], shared: [] });
      pr.shared.push(g.chip);
    }
  }
  return [...pairs.values()]
    .map((p) => ({ ...p, sharedCount: p.shared.length }))
    .sort((a, b) => b.sharedCount - a.sharedCount);
};

// ── the research reading paragraph ────────────────────────────────────────────────────────────

// researchReading({ rows, areas, clusters, matrix, query }) → an array of sentence strings,
// templated from the numbers above — never generated prose; every sentence names what it is
// drawn from so it stays falsifiable: coverage, dependence, disagreement, and honest silence.
export const researchReading = ({ rows = [], areas = [], clusters = [], matrix = null, query = '' } = {}) => {
  const out = [];
  const origins = clusters.length;
  if (!rows.length) { out.push(`Nothing has been reviewed for “${query}” yet.`); return out; }
  const areaNames = areas.slice(0, 5).map((a) => a.label);
  if (areaNames.length) {
    out.push(`The ${rows.length} candidate${rows.length === 1 ? '' : 's'} reviewed cover${rows.length === 1 ? 's' : ''} ${areaNames.length === 1 ? areaNames[0] : areaNames.slice(0, -1).join(', ') + ' and ' + areaNames[areaNames.length - 1]}.`);
  }
  const derivativeClusters = clusters.filter((c) => c.derivative.length > 0);
  if (derivativeClusters.length) {
    const pages = derivativeClusters.reduce((n, c) => n + c.members.length, 0);
    out.push(`${pages} of the pages reviewed trace back to just ${derivativeClusters.length} apparent origin${derivativeClusters.length === 1 ? '' : 's'} and should not be counted as independent corroboration.`);
  }
  if (origins < rows.length && rows.length > 1) {
    out.push(`${rows.length} sources reduce to ${origins} independent origin${origins === 1 ? '' : 's'}.`);
  }
  if (matrix && matrix.rows && matrix.rows.length) {
    const conflicts = matrix.rows.filter((r) => r.conflict);
    const agree = matrix.rows.filter((r) => !r.conflict && r.sourceCount >= 2);
    if (agree.length) out.push(`${agree.length} measure${agree.length === 1 ? '' : 's'} — ${agree.slice(0, 3).map((r) => r.measureLabel).join(', ')} — read consistently across the sources that state them.`);
    if (conflicts.length) out.push(`${conflicts.length} measure${conflicts.length === 1 ? '' : 's'} — ${conflicts.slice(0, 3).map((r) => r.measureLabel).join(', ')} — ${conflicts.length === 1 ? 'is' : 'are'} reported two different ways.`);
  }
  const thin = areas.filter((a) => a.independentOrigins <= 1);
  if (thin.length) out.push(`${thin.length} evidence area${thin.length === 1 ? '' : 's'} — ${thin.slice(0, 3).map((a) => a.label).join(', ')} — rest${thin.length === 1 ? 's' : ''} on a single independent origin.`);
  return out;
};

// ── structural relevance (per-candidate, never a bare percentage) ────────────────────────────

// Domain heuristics only ever ADD a label; a source with none of these signals is left unlabeled
// rather than guessed at. `.gov`/`.mil`/statistical-agency hosts and a source that is the apparent
// origin of a derivative cluster read as primary; everything else is left to the reader to judge —
// no invented authority score.
const PRIMARY_HOST_RE = /\.(gov|mil)$|(^|\.)(data|stats?)\./i;
export const isPrimary = (row, cluster) => {
  if (PRIMARY_HOST_RE.test(row.domain || '')) return true;
  if (row.kind === 'pdf' || row.kind === 'file') return true;
  if (cluster && cluster.origin && cluster.origin.sn === row.sn && cluster.derivative.length > 0) return true;
  return false;
};

// candidateRole(row, { cluster, areas, matrix }) → the structural facts a card explains itself
// with — never a generic relevance percentage (docs/research-review.md §3).
export const candidateRole = (row, { cluster, areas = [], matrix = null } = {}) => {
  const contributes = areas.filter((a) => a.sns.includes(row.sn)).map((a) => a.label);
  const measures = matrix && matrix.rows
    ? matrix.rows.filter((r) => r.cells.some((c) => c && c.source === row.sn)).map((r) => r.measureLabel)
    : [];
  const primary = isPrimary(row, cluster);
  const isDerivative = !!(cluster && cluster.origin && cluster.origin.sn !== row.sn && cluster.members.length > 1);
  const isOrigin = !!(cluster && cluster.origin && cluster.origin.sn === row.sn && cluster.derivative.length > 0);
  return { contributes, measures, primary, isDerivative, isOrigin, independent: !cluster || cluster.members.length === 1 };
};
