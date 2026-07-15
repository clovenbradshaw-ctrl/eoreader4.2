// EO: SEG·SYN·EVA(Network → Network,Lens, Dissecting,Composing,Tracing) — the cross-source summary fold; referent-safe
// fold/summary-cross.js — fold ONE FIGURE ACROSS SEVERAL SOURCES without collapsing
// referents that merely share a name.
//
// The failure this exists to prevent is the Armstrong collapse (PR #196): Neil
// Armstrong and Louis Armstrong, each discussed in several sources, each leaving a
// standalone bare-"Armstrong" node in its own source (the within-document surname
// merge is correctly DEFEATED when a source also names Janet or Lucille Armstrong) —
// and a label-keyed cross-source fold then unions those bare nodes into one entity
// that walks on the Moon and records West End Blues. The entity explorer fixed this
// at the row level (rooms/reader/entity-merge.js); this module applies the same
// referent discipline at the FOLD level, where summaries are made, and additionally
// MEASURES it: corefCollapseReport says, for any grouping, whether two incomparable
// full names ended up folded together, and summaryAttributionErrors says, for any
// produced summary, whether a claim exclusive to one referent was attributed to the
// other. The discipline and the metric ship together so a bench can falsify the
// discipline rather than trust it.
//
// The grouping rules, shared with entity-merge but at label level, on the shared
// name-variant brain (perceiver/parse/name-variants.js):
//   · full names cluster by clusterAnchors — subsequence containment with sticky
//     abstention ("George Bush" folds into NEITHER George H. nor George W.);
//   · a single-token label whose token is CONTESTED (borne by ≥2 distinct full-name
//     anchors anywhere in the corpus) attaches to the earliest-introduced full-name
//     bearer IN ITS OWN SOURCE, and to nothing when its source has none — it can
//     never cross sources on its own;
//   · a single-token label that is not contested folds with the unique anchor that
//     carries it (Iran, Apollo — unchanged);
//   · every display label in the merged packet is rewritten REFERENT-SAFE: a bare
//     contested token shows as its group's full anchor, so no line the talker reads
//     can be about "Armstrong" unqualified while two Armstrongs are in play.

import { figureSurface, rankProperties } from '../../perceiver/index.js';
import { nameTokens, clusterAnchors, distinctReferentCount } from '../../perceiver/parse/index.js';
import { pickLeadProperty } from './summary.js';

const stem = (w) => String(w || '').toLowerCase().replace(/(?:es|s)$/, '');
const isMulti = (label) => nameTokens(label).length >= 2;

// Every admitted label of a doc with its projection root, mentions, and first sighting.
const admittedRows = (doc) => {
  const rows = [];
  if (!doc?.admission?.admitted) return rows;
  for (const [label, id] of doc.admission.admitted) {
    const mentions = doc.mentions?.get?.(id) || [];
    rows.push({ label, id, mentions: mentions.length, firstIdx: mentions[0] ?? Infinity });
  }
  return rows;
};

// crossSourceSummaryFold — entries: [{ doc, title }]; name: the figure as a reader
// would ask for it ("Armstrong", "Louis Armstrong"). Returns { referents, contested,
// collapse } where each referent is a packet the summary voices can realize.
export const crossSourceSummaryFold = (entries, {
  name, maxSpansPerDoc = 3, maxRelations = 6, maxProperties = 5, maxFigures = 8,
} = {}) => {
  const docs = (entries || []).filter((e) => e && e.doc && e.doc.log);
  if (!docs.length || !name) return { referents: [], contested: [], collapse: emptyCollapse() };

  const nTokens = nameTokens(name).map(stem);
  const touches = (label) => nameTokens(label).some((t) => nTokens.includes(stem(t)));

  // 1 — gather the name-bearing rows per source.
  const rows = [];
  docs.forEach((e, di) => {
    for (const r of admittedRows(e.doc)) {
      if (!touches(r.label)) continue;
      rows.push({ ...r, di, docId: e.doc.docId ?? String(di), title: e.title || e.doc.docId || `source ${di + 1}` });
    }
  });
  if (!rows.length) return { referents: [], contested: [], collapse: emptyCollapse() };

  // 2 — cluster the FULL names across sources (the sticky-abstention variant brain).
  const fullLabels = [...new Set(rows.filter((r) => isMulti(r.label)).map((r) => r.label))];
  const anchorOf = clusterAnchors(fullLabels);   // label → anchor label

  // 3 — contested tokens: a token borne by ≥2 distinct full-name anchors.
  const anchorsByToken = new Map();
  for (const lab of fullLabels) {
    const anchor = anchorOf.get(lab) || lab;
    for (const t of nameTokens(lab).map(stem)) {
      if (!anchorsByToken.has(t)) anchorsByToken.set(t, new Set());
      anchorsByToken.get(t).add(anchor);
    }
  }
  const contested = [...anchorsByToken.entries()].filter(([, set]) => set.size >= 2).map(([t]) => t);
  const contestedSet = new Set(contested);

  // 4 — route every row to its referent group.
  const groups = new Map();   // groupKey → { referent, members: [row], perDoc: Map(di → ids) }
  const put = (key, referent, row) => {
    let g = groups.get(key);
    if (!g) { g = { referent, members: [], docsIn: new Set() }; groups.set(key, g); }
    g.members.push(row);
    g.docsIn.add(row.di);
  };
  for (const row of rows) {
    if (isMulti(row.label)) {
      const anchor = anchorOf.get(row.label) || row.label;
      put(`a:${anchor.toLowerCase()}`, anchor, row);
      continue;
    }
    const t = stem(row.label);
    if (!contestedSet.has(t)) {
      // uncontested single token — fold with its unique full anchor when one exists,
      // else it stands as its own cross-source figure (Iran, Apollo).
      const anchors = anchorsByToken.get(t);
      if (anchors && anchors.size === 1) { const a = [...anchors][0]; put(`a:${a.toLowerCase()}`, a, row); }
      else put(`t:${t}`, row.label, row);
      continue;
    }
    // contested bare token — the earliest-introduced full-name bearer IN ITS OWN SOURCE;
    // no bearer there → a one-source group of its own, never a cross-source union.
    const bearers = rows.filter((r) => r.di === row.di && isMulti(r.label) &&
      nameTokens(r.label).map(stem).includes(t));
    if (bearers.length) {
      const first = bearers.reduce((a, b) => (b.firstIdx < a.firstIdx ? b : a));
      const anchor = anchorOf.get(first.label) || first.label;
      put(`a:${anchor.toLowerCase()}`, anchor, row);
    } else {
      put(`solo:${t}:${row.docId}`, row.label, row);
    }
  }

  // 5 — per group, fold each member source's referent neighbourhood and merge,
  // referent-safe labels throughout.
  const safeLabel = (label, group) => {
    const t = stem(String(label || '').trim());
    return (!isMulti(label) && contestedSet.has(t)) ? group.referent : label;
  };

  const referents = [...groups.values()].map((g) => {
    const perDocIds = new Map();
    for (const m of g.members) {
      if (!perDocIds.has(m.di)) perDocIds.set(m.di, new Set());
      perDocIds.get(m.di).add(m.id);
    }
    const relations = [];
    const defs = [];
    const figureCount = new Map();
    const spans = [];
    const docTitles = [];
    for (const [di, ids] of perDocIds) {
      const e = docs[di];
      const title = e.title || e.doc.docId || `source ${di + 1}`;
      docTitles.push({ docId: e.doc.docId ?? String(di), title });
      const fs = figureSurface(e.doc, [...ids]);
      for (const r of fs.relations) {
        relations.push({
          subject: safeLabel(r.src.label, g), verb: String(r.via || 'linked-to').replace(/-/g, ' '),
          object: safeLabel(r.tgt.label, g), polarity: r.polarity === '−' ? '−' : '+',
          idx: r.idx ?? null, title,
        });
      }
      for (const d of fs.defs) defs.push({ ...d, label: safeLabel(d.label, g) });
      for (const f of fs.figures) {
        const lab = safeLabel(f.label, g);
        figureCount.set(lab, (figureCount.get(lab) || 0) + (f.count || 0));
      }
      // the referent's own passages in this source — first mentions, reading order.
      const sents = e.doc.units || e.doc.sentences || [];
      const idxs = [...new Set([...ids].flatMap((id) => e.doc.mentions?.get?.(id) || []))]
        .sort((a, b) => a - b).slice(0, maxSpansPerDoc);
      for (const idx of idxs) {
        const text = String(sents[idx] ?? '').trim();
        if (text) spans.push({ idx, text, title });
      }
    }
    const properties = rankProperties(defs).slice(0, maxProperties)
      .map(({ label, value, witnesses, count, score }) => ({ label, value, witnesses, count, score }));
    const figures = [...figureCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxFigures)
      .map(([label, count]) => ({ label, count }));
    return Object.freeze({
      scope: 'cross',
      referent: g.referent,
      docs: docTitles,
      members: g.members.map((m) => ({ label: m.label, docId: m.docId, mentions: m.mentions })),
      spans, properties, figures,
      relations: dedupRelations(relations, maxRelations),
      groups: { settled: [], heldOpen: [], turns: [] },
    });
  }).sort((a, b) => b.members.reduce((s, m) => s + m.mentions, 0) - a.members.reduce((s, m) => s + m.mentions, 0));

  return { referents, contested, collapse: corefCollapseReport(referents) };
};

const dedupRelations = (relations, max) => {
  const seen = new Set();
  const out = [];
  for (const r of relations) {
    if (r.verb === 'linked to') continue;
    const key = `${r.subject}|${r.polarity}${r.verb}|${r.object}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
};

const emptyCollapse = () => Object.freeze({ groups: 0, collapsed: [], rate: 0 });

// The model-free floor for a cross-source summary: one or two plain sentences per
// referent, always the FULL anchor name, claims from its own packet only — so the
// floor is referent-safe by construction and the model voice can only match it.
export const telegramCrossSummary = (referents, { perReferent = 2 } = {}) => {
  const out = [];
  for (const r of referents || []) {
    const lines = [];
    const p = pickLeadProperty(r.properties);
    if (p) lines.push(`${r.referent} — ${String(p.value).trim().replace(/[,;]$/, '')}.`);
    const rel = (r.relations || []).find((x) => x.subject === r.referent) || r.relations?.[0];
    if (rel && lines.length < perReferent) {
      lines.push(`${rel.subject} ${rel.polarity === '−' ? 'does not ' : ''}${rel.verb} ${rel.object}.`);
    }
    if (!lines.length && r.spans?.[0]) lines.push(`${r.referent}: ${r.spans[0].text}`);
    out.push(...lines.slice(0, perReferent));
  }
  return out.map((s) => (/[.!?]$/.test(s) ? s : s + '.')).join(' ');
};

// ── the metric: did the fold collapse a referent? ────────────────────────────────────
// A group is COLLAPSED when its members' full names resolve to ≥2 distinct referents
// under the same variant brain that built the clusters — i.e. two incomparable full
// names were folded together. On a correct fold this is 0 by construction; the metric
// exists so the bench can PROVE it, and so a deliberately label-keyed fold (the old
// bug, kept as the bench's negative control) measurably fails.
export const corefCollapseReport = (referents) => {
  const collapsed = [];
  for (const r of referents || []) {
    const fulls = [...new Set((r.members || []).map((m) => m.label).filter(isMulti))];
    if (fulls.length >= 2 && distinctReferentCount(fulls) >= 2) {
      collapsed.push({ referent: r.referent, conflates: fulls });
    }
  }
  const n = (referents || []).length;
  return Object.freeze({ groups: n, collapsed, rate: n ? collapsed.length / n : 0 });
};

// ── the surface metric: did a SUMMARY cross-attribute? ───────────────────────────────
// Given the referent packets and a produced summary, look for a sentence that names
// referent A while carrying a figure EXCLUSIVE to referent B — the "Neil Armstrong
// recorded West End Blues" failure — and for a bare contested name used with no
// disambiguating token in the sentence at all.
const distinguishers = (referent, others) => {
  // the tokens of this referent's anchor that no other anchor carries ("louis", "neil")
  const mine = new Set(nameTokens(referent).map(stem));
  for (const o of others) for (const t of nameTokens(o).map(stem)) mine.delete(t);
  return mine;
};

export const summaryAttributionErrors = (text, referents, { contested = [] } = {}) => {
  const errors = [];
  const rs = (referents || []).filter((r) => r && r.referent);
  if (rs.length < 2) return { errors, ambiguous: [], checked: 0 };

  // figures exclusive to each referent (by stemmed label), the cross-attribution probes.
  // Time words are excluded: "August" admitted as a figure in one source must not turn
  // another referent's birthdate into a cross-attribution.
  const TIME_WORDS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday', 'sunday', 'spring', 'summer', 'autumn', 'fall', 'winter',
    'today', 'yesterday', 'tomorrow', 'year', 'month', 'week', 'day']);
  const figSets = rs.map((r) => new Set((r.figures || []).map((f) => stem(f.label))
    .filter((t) => t && !TIME_WORDS.has(t))));
  const exclusive = rs.map((r, i) => {
    const others = new Set();
    figSets.forEach((s, j) => { if (j !== i) for (const t of s) others.add(t); });
    return new Set([...figSets[i]].filter((t) => !others.has(t) && !nameTokens(r.referent).map(stem).includes(t)));
  });

  const sentences = String(text || '').match(/[^.!?]+[.!?]+/g) || [String(text || '')];
  const ambiguous = [];
  let checked = 0;
  // The ACTIVE referent rides across sentences: a sentence that names one referent
  // sets it; a following sentence that names none but leans on a pronoun (He wrote…,
  // His most famous…) INHERITS it — that is how a summary actually mis-attributes
  // ("Louis Armstrong was a trumpeter. He walked on the Moon."), and a per-sentence
  // check with no carry-over walks right past it.
  const PRONOUN_LEAD = /^\s*(?:he|she|they|his|her|their|it|its)\b/i;
  let active = -1;
  for (const s of sentences) {
    const sTok = new Set((s.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || []).map(stem));
    checked++;
    const namedIdx = [];
    rs.forEach((r, i) => {
      const dist = distinguishers(r.referent, rs.filter((_, j) => j !== i).map((x) => x.referent));
      if ([...dist].some((t) => sTok.has(t))) namedIdx.push(i);
    });
    const holders = namedIdx.length ? namedIdx
      : (active >= 0 && PRONOUN_LEAD.test(s) ? [active] : []);
    if (namedIdx.length) active = namedIdx[namedIdx.length - 1];
    for (const i of holders) {
      rs.forEach((other, j) => {
        if (j === i) return;
        for (const ex of exclusive[j]) {
          if (sTok.has(ex)) {
            errors.push({ sentence: s.trim(), referent: rs[i].referent, foreignFigure: ex, belongsTo: other.referent });
          }
        }
      });
    }
    // a contested bare name with no distinguishing token anywhere in the sentence
    for (const t of contested) {
      if (!sTok.has(stem(t))) continue;
      const anyDist = rs.some((r) => {
        const dist = distinguishers(r.referent, rs.filter((x) => x !== r).map((x) => x.referent));
        return [...dist].some((d) => sTok.has(d));
      });
      if (!anyDist) ambiguous.push({ sentence: s.trim(), name: t });
    }
  }
  return { errors, ambiguous, checked };
};
