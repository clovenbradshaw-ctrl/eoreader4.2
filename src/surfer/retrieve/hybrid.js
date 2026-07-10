// EO: CON·SEG·SIG(Field,Network → Field, Binding,Dissecting,Tracing) — fuse + reserve + trim
// Hybrid: lexical first (fast, mechanical), semantic to fill if available.
// Dedup by sentence index, then FUSE the two channels by concordance.
//
// The old fusion max-pooled — kept the larger of the lexical and semantic score
// and discarded the other. That throws away the AGREEMENT signal: two weak-but-
// concordant retrievers (lex 0.5, sem 0.5) are better evidence than one strong
// channel alone, and keep-the-larger structurally cannot say so — it reports 0.5
// either way. The fold then surfs a cursor seeded on this ranking, so a sentence
// both readers point at should outrank one only a single reader found.
//
// We fuse by a noisy-OR — the standard concordance posterior over two channels
// read as independent evidence of relevance: P = 1 − (1−lex)(1−sem). Agreement
// compounds (0.5, 0.5 → 0.75); a lone strong channel is preserved (0.9, 0 → 0.9);
// a lone weak one stays weak (0.3, 0 → 0.3). The semantic cosine is clamped to
// [0,1] first — a negative cosine is dissimilarity, i.e. no evidence, not anti-
// evidence that should pull a lexical hit down.

import { retrieveLexical }  from './lexical.js';
import { retrieveSemantic } from './semantic.js';
import { isReferenceChrome } from './chrome.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The concordance posterior over two channels read as independent evidence of
// relevance: noisy-OR. Agreement compounds, a lone strong channel is preserved,
// a lone weak one stays weak. This is what max-pool could not express.
export const fuseConcordance = (lex, sem) =>
  1 - (1 - clamp01(lex)) * (1 - clamp01(sem));

// Which organ does the SEMANTIC channel read? Retrieval is only as semantic as
// its vectors. The hash organ always reports warm and measuresMeaning:false, so a
// "hybrid" retrieve over it fuses two LEXICAL channels — spelling twice — and a
// paraphrased question with no shared surface words sinks (the recall failure the
// audit measured: "job" never reaching "travelling salesman"). When a meaning organ
// (MiniLM) is LIVE, the semantic channel reads MEANING; until then retrieval falls
// back to the hash organ, so it never blocks on a model download that may never
// arrive — the substrate's degrade-never-fail discipline. The semantic channel also
// no-ops on a cold embedder (semantic.js gates on isWarm), so this only ever upgrades.
export const pickRetrievalEmbedder = ({ embedder, geometricEmbedder } = {}) =>
  (geometricEmbedder && geometricEmbedder.measuresMeaning && geometricEmbedder.isWarm?.())
    ? geometricEmbedder
    : embedder;

// Trim the verbatim excerpts the talker is SHOWN to the relevant few. The fold has
// already read EVERY span into the impression (the notes); the talker does not need
// the long tail of weak or significance-only (surfed, score 0) spans pasted in
// verbatim — that tail is the noise that makes a small model weave a baggy answer
// touching all of it. Keep the top few by score, above a floor relative to the best;
// always keep at least the strongest. Binding still runs over the FULL span set, so
// trimming the display never costs a citation.
export const selectExcerpts = (spans = [], { max = 5, ratio = 0.4, floor = 0.1 } = {}) => {
  // Reference/nav chrome (archive lines, "↑ …" refs, quoted titles, a bare "Name – Descriptor" nav
  // title) is not answer content — shown to the talker it is noise it weaves into, cited it points
  // the reader at apparatus. Drop it before ranking. If EVERY span is chrome the set was apparatus;
  // keep the original ranking then (thin-but-honest beats inventing a filter result from nothing).
  const clean = spans.filter((s) => !isReferenceChrome(s.text));
  const pool  = clean.length ? clean : spans;
  const ranked = [...pool].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (ranked.length <= 1) return ranked;
  const top = ranked[0].score || 0;
  const cut = Math.max(floor, top * ratio);
  const kept = ranked.filter(s => (s.score || 0) >= cut).slice(0, max);
  return kept.length ? kept : ranked.slice(0, 1);
};

// Sources are things with activation (docs/source-activation.md). When the answer scope holds
// SEVERAL sources — a loaded document AND the web pages a search just fetched to answer THIS
// question — a flat global top-k hands every slot to the largest/loudest source: an
// 884-sentence book buries the four web pages, so the findings the search brought back never
// reach the talker (the audit's "what movies…" answered from Gregor-Samsa prose, the fetched
// adaptation pages never surfaced). A source's ACTIVATION for a query is the strength of its
// strongest evidence — its best span's fused score. This guarantees every ACTIVATED salient
// source (best span clears `activationFloor`) its single best span in the result, evicting the
// weakest NON-salient span to stay within k, capped at `maxReserve` so the loaded document is
// never fully displaced. Pure; returns the global top-k unchanged when no salient source is
// activated, so a single-source retrieve is byte-identical.
export const reserveBySource = (spans = [], originOf, isSalient, { k = 6, activationFloor = 0.15, maxReserve = null } = {}) => {
  const ranked = [...spans].sort((a, b) => (b.score || 0) - (a.score || 0));
  const docOf = (s) => originOf?.(s.idx)?.doc || null;
  const salientSpan = (s) => { const d = docOf(s); return !!(d && isSalient(d)); };
  const base = ranked.slice(0, k);
  const cap = maxReserve ?? Math.ceil(k / 2);

  // The best (strongest-scoring) span per salient source — its activation for this query.
  const bestBySource = new Map();
  for (const s of ranked) {
    const d = docOf(s);
    if (!d || !isSalient(d) || bestBySource.has(d.docId)) continue;   // ranked → first seen is best
    bestBySource.set(d.docId, s);
  }
  const activated = [...bestBySource.values()]
    .filter(s => (s.score || 0) >= activationFloor)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, cap);

  const result = [...base];
  let reserved = result.filter(salientSpan).length;
  for (const best of activated) {
    if (result.some(s => s.idx === best.idx)) continue;     // already represented
    if (reserved >= cap) break;
    let evictAt = -1, evictScore = Infinity;                // evict the weakest NON-salient base span
    for (let i = 0; i < result.length; i++) {
      if (salientSpan(result[i])) continue;
      const sc = result[i].score || 0;
      if (sc < evictScore) { evictScore = sc; evictAt = i; }
    }
    if (evictAt >= 0) { result[evictAt] = best; reserved++; }
    else if (result.length < k) { result.push(best); reserved++; }
    else break;
  }
  result.sort((a, b) => (b.score || 0) - (a.score || 0));
  return result;
};

// A soft TOPIC PRIOR over the referent field — topic-weighted retrieval. When the turn resolves a
// SUBJECT (the entity the question/conversation is about, plus its graph neighbourhood), a span
// whose NAMED referents lie entirely OUTSIDE that field is a homonym slipping in by surface form —
// the "essay about dolphins" whose reservation seated a Miami-Dolphins football span because
// "dolphin(s)" matched by spelling, not sense. Damp such a span — a MULTIPLIER (default ×0.25),
// never a gate, matching this file's degrade-never-fail discipline — so it sinks toward/below the
// activation floor and reserveBySource stops reserving it, rather than dropping it outright.
//   Two spans are always left untouched: one whose referents intersect the topic (on-topic), and
// one that names NO referent at all — a framing/definitional line ("they are marine mammals") that
// belongs to no sense and must not be penalised for it. `namedRefsOf(span)` yields the referent ids
// a span names; `topicIds` is the subject's neighbourhood — both in the projection's id-space, so
// the intersection is exact. A pure no-op — byte-identical — when no topic frame is supplied (no
// topicIds, or no namedRefsOf), so single-source and default retrieval are untouched.
export const applyTopicPrior = (spans = [], namedRefsOf, topicIds = null, { floor = 0.25 } = {}) => {
  if (!topicIds || !topicIds.size || typeof namedRefsOf !== 'function') return spans;
  return spans.map((s) => {
    const refs = namedRefsOf(s) || [];
    if (!refs.length) return s;                              // no named referent → framing, neutral
    return refs.some((id) => topicIds.has(id)) ? s : { ...s, score: (s.score || 0) * floor };
  });
};

export const retrieveHybrid = async (doc, query, embedder, k = 8, topic = null) => {
  const lex = retrieveLexical(doc, query, k);
  const sem = await retrieveSemantic(doc, query, embedder, k);
  // Skip units the document has DEF'd as sites (furniture) by their semantic
  // role — they frame, they do not answer. (read/site.js does the marking.)
  const sites = new Set(
    (doc.log.filter ? doc.log.filter(e => e.op === 'DEF' && e.key === 'role' && e.value === 'site') : [])
      .map(e => e.sentIdx),
  );

  // Gather each channel's evidence per sentence (the stronger reading per channel,
  // if a channel somehow lists an index twice).
  const channels = new Map();
  const note = (r, key) => {
    if (sites.has(r.idx)) return;
    const c = channels.get(r.idx) || { lex: 0, sem: 0, text: r.text };
    c[key] = Math.max(c[key], clamp01(r.score));
    if (!c.text) c.text = r.text;
    channels.set(r.idx, c);
  };
  for (const r of lex) note(r, 'lex');
  for (const r of sem) note(r, 'sem');

  const out = [];
  for (const [idx, c] of channels) {
    const score = fuseConcordance(c.lex, c.sem);   // concordance posterior
    const kind  = c.lex > 0 && c.sem > 0 ? 'lex+sem' : (c.lex > 0 ? 'lex' : 'sem');
    out.push({ idx, score, text: c.text, kind, lex: c.lex, sem: c.sem });
  }
  // Topic-weighted retrieval (opt-in via the caller's `topic` frame): damp off-topic homonym spans
  // BEFORE ranking, so both the top-k here and any downstream source reservation (reserveBySource)
  // see a field already biased toward the resolved subject. Null topic → byte-identical.
  const ranked = topic
    ? applyTopicPrior(out, topic.namedRefsOf, topic.topicIds, { floor: topic.floor ?? 0.25 })
    : out;
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, k);
};
