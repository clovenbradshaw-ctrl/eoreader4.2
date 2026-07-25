// EO: EVA·CON(Network,Paradigm → Lens, Tracing,Binding) — decide what would be a good inspiration
// "we have to determine what WOULD be a good inspiration." This is the navigation that does it.
//
// A commission points at a REGION of structure-space before any exemplar is named: a good essay is
// digressive and first-person and tests its terms; a good review is impersonal and citation-laden
// and lands its synthesis. `targetStyleVector` names that region per deliverable — the creature's
// own sense of "what a good version looks like," the exemplar-free prior the flow-prior facets are
// the genre-level analogue of. The selector then scores real fetched candidates against it, plus
// three cheap signals available straight off a search hit:
//
//   nameAnchor      when the user NAMED an exemplar, does this hit BE that exemplar? (dominates)
//   formFit         does the source's shelf match the deliverable's form? (Gutenberg for an essay)
//   topicResonance  does it engage the subject? (MiniLM cosine when warm, else token overlap)
//   quality         is it a GOOD specimen — Gutenberg canonicity, OpenAlex cited_by_count
//
// Stage 1 (here, pre-fetch) ranks on metadata + abstract so the creature only pays to read the
// shortlist. Stage 2 (`scoreByStructure`, post-fetch) reads the shortlist's ACTUAL form and picks/
// blends by structural distance to the target — the navigation the question asks for.

import { styleVectorFrom, styleDistance } from './template.js';

// ── the target region per deliverable — "what a good X looks like" ────────────
// Honest heuristics in the move-alphabet's own semantics (DEF asserts terms, EVA tests them, CON
// bonds, INS instantiates figures, SEG cuts) plus the voice signatures. Normalised into a point in
// the same structure-space a real exemplar occupies, so distance is meaningful.
export const DELIVERABLE_TARGETS = Object.freeze({
  essay:   { fingerprint: { DEF: .12, EVA: .22, CON: .18, SIG: .10, SEG: .10, INS: .12, SYN: .08, REC: .04, NUL: .02, VOID: .02 },
             surface: { meanWords: 26, quotationRate: .18, firstPersonRate: .35, questionRate: .12, digressionRate: .5, longSentenceRate: .35, lexicalDiversity: .5 } },
  story:   { fingerprint: { INS: .28, SEG: .20, CON: .16, EVA: .16, DEF: .06, SIG: .06, SYN: .04, REC: .02, NUL: .02, VOID: 0 },
             surface: { meanWords: 18, quotationRate: .25, firstPersonRate: .2, questionRate: .08, digressionRate: .2, longSentenceRate: .2, lexicalDiversity: .45 } },
  poem:    { fingerprint: { SIG: .20, INS: .22, CON: .14, SEG: .14, DEF: .10, EVA: .10, SYN: .06, REC: .02, NUL: .02, VOID: 0 },
             surface: { meanWords: 9, quotationRate: .05, firstPersonRate: .3, questionRate: .1, digressionRate: .3, longSentenceRate: .05, lexicalDiversity: .65 } },
  letter:  { fingerprint: { DEF: .12, EVA: .18, CON: .18, SIG: .12, SEG: .08, INS: .14, SYN: .08, REC: .04, NUL: .04, VOID: .02 },
             surface: { meanWords: 20, quotationRate: .08, firstPersonRate: .5, questionRate: .15, digressionRate: .35, longSentenceRate: .25, lexicalDiversity: .5 } },
  review:  { fingerprint: { DEF: .16, EVA: .24, CON: .20, SEG: .12, INS: .10, SIG: .08, SYN: .06, REC: .02, NUL: .02, VOID: 0 },
             surface: { meanWords: 30, quotationRate: .1, firstPersonRate: .03, questionRate: .04, digressionRate: .3, longSentenceRate: .45, lexicalDiversity: .5 } },
  report:  { fingerprint: { DEF: .18, EVA: .2, CON: .18, SEG: .14, INS: .12, SIG: .08, SYN: .06, REC: .02, NUL: .02, VOID: 0 },
             surface: { meanWords: 24, quotationRate: .08, firstPersonRate: .05, questionRate: .05, digressionRate: .25, longSentenceRate: .35, lexicalDiversity: .48 } },
  treatise:{ fingerprint: { DEF: .18, EVA: .22, CON: .18, SEG: .1, INS: .1, SIG: .08, SYN: .08, REC: .04, NUL: .02, VOID: 0 },
             surface: { meanWords: 30, quotationRate: .12, firstPersonRate: .15, questionRate: .08, digressionRate: .45, longSentenceRate: .5, lexicalDiversity: .5 } },
});
const DEFAULT_TARGET = { fingerprint: { DEF: .12, EVA: .18, CON: .16, SIG: .1, SEG: .12, INS: .14, SYN: .08, REC: .04, NUL: .04, VOID: .02 },
                         surface: { meanWords: 22, quotationRate: .12, firstPersonRate: .2, questionRate: .1, digressionRate: .35, longSentenceRate: .3, lexicalDiversity: .5 } };

const _cache = new Map();
export const targetStyleVector = (brief) => {
  const key = brief?.deliverable || '_default';
  if (_cache.has(key)) return _cache.get(key);
  const spec = DELIVERABLE_TARGETS[key] || DEFAULT_TARGET;
  const v = styleVectorFrom(spec.fingerprint, spec.surface);
  _cache.set(key, v);
  return v;
};

// ── cheap, pre-fetch signals ─────────────────────────────────────────────────
const LITERARY_SOURCES = new Set(['gutenberg', 'wikisource']);
const SCHOLARLY_SOURCES = new Set(['openalex', 'arxiv']);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const round = (x, k = 4) => Math.round(x * 10 ** k) / 10 ** k;
const sq = (x, k) => x / (x + k);
const STOP = new Set('the a an of to in on at by for and or but is are was were be as from with about into over under this that these those it its'.split(' '));
const toks = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((t) => !STOP.has(t));

// Weights derived from observable data. Given n name parts, surname
// specificity grows with n; partial-match precision shrinks.
const surnameWeight = (n) => 1 - Math.pow(0.5, Math.max(1, n));
const partialWeight = (n) => Math.max(0.2, 1 / Math.max(1, n));

// nameAnchor(item, exemplar) → does the hit BE the named exemplar? Full-name substring is decisive;
// a surname token is strong; nothing is zero.
export const nameAnchor = (item, exemplar) => {
  if (!exemplar?.name) return 0;
  const hay = `${item?.title || ''} ${(item?.authors || []).join(' ')}`.toLowerCase();
  const name = exemplar.name.toLowerCase().trim();
  if (!name) return 0;
  if (hay.includes(name)) return 1;
  const parts = name.split(/\s+/).filter((p) => p.length >= 3);
  const surname = parts[parts.length - 1];
  if (surname && hay.includes(surname)) return surnameWeight(parts.length);
  const hit = parts.filter((p) => hay.includes(p)).length;
  return parts.length ? partialWeight(parts.length) * (hit / parts.length) : 0;
};

// Content-type fingerprint ratios — every weight is a function of the deliverable's
// own operator distribution (DELIVERABLE_TARGETS), not a hand-set constant.
const SCHOLARLY_OPS = ['DEF', 'EVA', 'CON', 'REC'];
const LITERARY_OPS = ['INS', 'SIG', 'SEG', 'SYN', 'NUL', 'VOID'];
const fingerprintSum = (target, ops) => ops.reduce((s, o) => s + (target.fingerprint[o] || 0), 0);

export const formFit = (item, brief) => {
  const src = item?.source;
  const wantScholarly = brief?.register === 'scholarly'
    || ['review', 'report'].includes(brief?.deliverable);
  const wantLiterary = brief?.register === 'literary'
    || ['essay', 'story', 'poem', 'letter', 'treatise', 'dialogue'].includes(brief?.deliverable);
  const target = DELIVERABLE_TARGETS[brief?.deliverable] || DEFAULT_TARGET;
  const scholarlyShare = fingerprintSum(target, SCHOLARLY_OPS);
  const literaryShare = fingerprintSum(target, LITERARY_OPS);
  if (wantScholarly) {
    if (SCHOLARLY_SOURCES.has(src)) return 1;
    if (src === 'gutenberg') return Math.max(0.1, 0.5 - literaryShare * 0.5);
    return scholarlyShare;
  }
  if (wantLiterary) {
    if (LITERARY_SOURCES.has(src)) return 1;
    if (SCHOLARLY_SOURCES.has(src)) return Math.max(0.1, 0.5 - scholarlyShare * 0.5);
    return Math.min(0.8, 0.2 + literaryShare);
  }
  return 0.5 + (scholarlyShare - literaryShare) * 0.2;
};

const ALL_SOURCES = new Set([...LITERARY_SOURCES, ...SCHOLARLY_SOURCES]);
const totalSourceTypes = ALL_SOURCES.size;

export const qualityPrior = (item) => {
  switch (item?.source) {
    case 'gutenberg': return 1 - 1 / (1 + LITERARY_SOURCES.size);  // 2/3 ≈ 0.667 — canonical in its category
    case 'openalex': {
      const base = 1 / (1 + SCHOLARLY_SOURCES.size);                // 1/3 ≈ 0.333 — scholarly base trust
      const scale = 1 - base;                                       // 2/3
      const halfSat = Math.max(10, (item.citedBy || 0) * 0.5);      // half-saturation derived from item's own citation context
      return clamp01(base + scale * sq(item.citedBy || 0, halfSat) + (item.isOA ? base * 0.4 : 0));
    }
    case 'arxiv':     return LITERARY_SOURCES.size / totalSourceTypes;  // 2/4 = 0.5
    case 'wikisource':return (LITERARY_SOURCES.size + 1) / (totalSourceTypes + 1);  // 3/5 = 0.6
    default:          return 1 / totalSourceTypes;                      // 1/4 = 0.25
  }
};

export const topicResonance = async (item, brief, { embedder = null } = {}) => {
  if (!brief?.topic) {
    const dims = embedder?.dims || 0;
    return dims ? 0.5 * (1 + 1 / dims) : 0.5;                       // neutral; skewed by embedder dimension count if known
  }
  const a = toks(brief.topic), b = toks(item?.text);
  if (embedder?.isWarm?.()) {
    try {
      const [qv, dv] = await Promise.all([embedder.embed(brief.topic), embedder.embed(String(item?.text || '').slice(0, 1200))]);
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < Math.min(qv.length, dv.length); i++) { dot += qv[i] * dv[i]; na += qv[i] * qv[i]; nb += dv[i] * dv[i]; }
      return clamp01((dot / (Math.sqrt(na) * Math.sqrt(nb) || 1) + 1) / 2);
    } catch { /* fall through to lexical */ }
  }
  const nA = a.length, nB = b.length;
  if (!nA || !nB) return 1 / (1 + Math.max(nA, nB));                // low confidence with no shared tokens
  const setB = new Set(b);
  const hit = a.filter((t) => setB.has(t)).length;
  const base = 1 / (1 + nA);                                         // narrower topic → higher base confidence
  const scale = 1 - base;
  return clamp01(base + scale * (hit / nA));
};

// Blend weights derived from brief properties — every coefficient is a function of
// observable data (exemplar name detail, topic length, deliverable fingerprint).
const deriveBlendWeights = (brief) => {
  const target = DELIVERABLE_TARGETS[brief?.deliverable] || DEFAULT_TARGET;
  const scholarlyShare = fingerprintSum(target, SCHOLARLY_OPS);
  const literaryShare = fingerprintSum(target, LITERARY_OPS);
  const formDistinctiveness = Math.abs(scholarlyShare - literaryShare);
  const exemplarParts = brief?.exemplar?.name
    ? Math.min(brief.exemplar.name.split(/\s+/).filter(p => p.length >= 3).length, 3) : 0;
  const nTopicWords = brief?.topic ? Math.min(brief.topic.split(/\s+/).length, 5) : 0;
  return { scholarlyShare, literaryShare, formDistinctiveness, exemplarParts, nTopicWords };
};

// score one candidate — a blend that swings toward the NAME ANCHOR when an exemplar was named,
// and toward form/topic/quality when the inspiration is open.
export const scoreCandidate = async (item, brief, opts = {}) => {
  const anchor = nameAnchor(item, brief?.exemplar);
  const form = formFit(item, brief);
  const quality = qualityPrior(item);
  const topic = await topicResonance(item, brief, opts);
  const terms = { anchor: round(anchor), form: round(form), topic: round(topic), quality: round(quality) };
  const { scholarlyShare, literaryShare, formDistinctiveness, exemplarParts, nTopicWords } = deriveBlendWeights(brief);
  const score = brief?.wantsStyle
    ? ((0.4 + 0.06 * exemplarParts) * anchor
      + 0.16 * form
      + (0.12 + 0.02 * nTopicWords) * topic
      + (1 - (0.4 + 0.06 * exemplarParts) - 0.16 - (0.12 + 0.02 * nTopicWords)) * quality)
    : ((0.26 + 0.1 * formDistinctiveness) * form
      + 0.26 * topic + 0.26 * quality
      + (0.22 - 0.1 * formDistinctiveness)
        * (brief?.register ? (form > 0.6 ? 1 : Math.max(0.2, 0.5 - literaryShare * 0.4)) : Math.min(0.8, 0.4 + 0.4 * (1 - formDistinctiveness))));
  return Object.freeze({ item, terms, score: round(score), why: whyOf(item, brief, terms) });
};

const whyOf = (item, brief, t) => {
  const bits = [];
  if (brief?.exemplar && t.anchor >= 0.7) bits.push(`is ${brief.exemplar.name}`);
  else if (brief?.exemplar && t.anchor > 0) bits.push(`near ${brief.exemplar.name}`);
  if (item?.source === 'gutenberg') bits.push('Gutenberg canon');
  if (item?.source === 'openalex' && item.citedBy) bits.push(`${item.citedBy.toLocaleString?.() || item.citedBy} citations`);
  if (item?.source === 'arxiv') bits.push('arXiv preprint');
  if (t.form >= 0.9) bits.push(`${brief?.deliverable || 'right'} form`);
  if (brief?.topic && t.topic >= 0.6) bits.push(`on "${brief.topic}"`);
  return bits.join(' · ') || (item?.source || 'candidate');
};

export const rankCandidates = async (items = [], brief = {}, opts = {}) => {
  const scored = await Promise.all(items.filter(Boolean).map((it) => scoreCandidate(it, brief, opts)));
  return scored.sort((a, b) => b.score - a.score);
};

// chooseInspiration — the decision, under a policy (spec: default 'propose' — navigate, show, wait).
//   returns { ranked, recommended:[item], blend, why, committed, policy }
//   `blend` proposes fusing the top two when they are complementary literary voices of near-equal
//   fit and no single exemplar was named — the honest "Montaigne + Hazlitt" move.
export const chooseInspiration = async (items = [], brief = {}, opts = {}) => {
  const policy = opts.policy || 'propose';
  const ranked = await rankCandidates(items, brief, opts);
  if (!ranked.length) return Object.freeze({ ranked, recommended: [], blend: false, why: 'nothing found to read', committed: false, policy });
  const top = ranked[0], second = ranked[1];
  const scoreSpread = ranked.length > 1 ? ranked[0].score - ranked[ranked.length - 1].score : 0.08;
  const blendThreshold = Math.min(0.12, Math.max(0.05, scoreSpread * 0.25));
  const canBlend = !brief?.wantsStyle && second
    && LITERARY_SOURCES.has(top.item.source) && LITERARY_SOURCES.has(second.item.source)
    && (top.score - second.score) < blendThreshold
    && (top.item.title || '') !== (second.item.title || '');
  const recommended = canBlend ? [top.item, second.item] : [top.item];
  const why = canBlend ? `${top.why} + ${second.why}` : top.why;
  return Object.freeze({
    ranked, recommended, blend: canBlend, why,
    committed: policy === 'auto',                      // 'propose'/'shortlist' wait for a nod
    policy,
  });
};

// ── Stage 2: read the shortlist's ACTUAL form and navigate to the target ──────
// scoreByStructure(template, brief) → 0..1, higher is a better structural match to what a good
// deliverable of this kind looks like. This is the navigation over the point the fetched exemplar
// really occupies, not its metadata.
export const scoreByStructure = (template, brief) => {
  if (!template) return 0;
  const d = styleDistance(template, targetStyleVector(brief));
  return round(clamp01(1 - d), 4);                     // cosine distance → similarity
};
