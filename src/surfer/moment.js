// EO: SEG·EVA·SIG(Field,Network → Field,Lens, Dissecting,Tracing,Binding) — video moment retrieval
// Moment retrieval — a described moment → the spans that witness it, or an honest INDETERMINATE.
//
// This is the payoff of the whole video read: the transcript lays what was HEARD on the clock, the
// retina + CV lay what was SEEN on the clock, and every one of them is a span-anchored ANNOTATION on
// the same timeline. A query ("the moment the councilmember says the developer's name", "every vehicle
// parked here longer than ten minutes", "the man in the blue jacket") is then a search over that one
// index that returns TIME, not a document.
//
// The literature calls this video moment retrieval / temporal grounding, and the usual shape is a
// top-k of frames that "look like" the query. This is the opposite discipline on three axes, because
// the use is accountability work where a false "found it" is a liability:
//
//   • WITNESSED, not trusted. Every candidate carries the exact annotations that made it — which
//     words, which detected concepts, which OCR'd text, at which spans, from which witness — so the
//     hit is contestable ("here is why", not "the model said so"). Grounding by construction.
//   • ABSTAINS. A candidate is only a MATCH when the evidence clears a bar (all the query's salient
//     terms met, or an exact tracked-entity hit, or corroboration across ≥2 independent kinds). Weak
//     evidence returns INDETERMINATE — a marked maybe — never a confident wrong span. Six honest
//     maybes beat one false certainty.
//   • FIGURE-LEVEL, not frame-level. Because CV concepts coref across cuts into tracked entities
//     upstream (perceiver/equivalence.js), a query that resolves to an ENTITY pulls ALL of that
//     figure's appearances — including shots where the label differs or the figure is turned away —
//     which a per-frame appearance match can never do.
//
// The query is DECOMPOSED by a proposer that commits nothing (a small model when supplied, a lexical
// fallback otherwise) into terms + a structured filter (kinds, a minimum duration). The matcher then
// merges the matching annotations into candidate moments with in/out points, scores them, and lets
// the enactor's discipline — evidence or abstention — decide the verdict.
//
// Everything here is PURE — annotations in, ranked witnessed candidates out, no model and no browser —
// so the retrieval logic is pinned by a browserless test. The expensive proposals (CV, ASR) are made
// upstream and land here as plain annotations; this only relates what the record already witnesses.

const NORM = /[^\p{L}\p{N}']/gu;
export const normTerm = (s) => String(s || '').toLowerCase().replace(NORM, '');
const terms = (s) => String(s || '').toLowerCase().split(/\s+/).map((t) => t.replace(NORM, '')).filter(Boolean);

// Stopwords the decomposition drops so a query's SALIENT terms are what coverage is measured against
// ("the man in the blue jacket" → man, blue, jacket). Kept tiny and generic on purpose.
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is', 'are', 'was',
  'were', 'with', 'that', 'this', 'there', 'here', 'it', 'its', 'for', 'from', 'by', 'as', 'be',
  'when', 'where', 'who', 'what', 'someone', 'something', 'anyone', 'anything', 'show', 'me', 'find',
  'every', 'any', 'all', 'longer', 'more', 'than', 'over', 'least', 'minutes', 'minute', 'seconds',
  'second', 'mins', 'min', 'sec', 'secs', 'hours', 'hour']);

// ── the annotation: one span-anchored thing the record witnesses ─────────────────────────────────
// { span:[start,end] (seconds), kind, text, terms:[normalized], entityId?, witness, confidence?, dur? }
//   kind ∈ said (transcript) · seen (a detected concept/object) · text (OCR, on-screen text)
//         · concept (a scene caption) · dwell (a persistence interval) · shot (structure)
// The adapters below derive annotations from the docs the reader already holds — a projection of the
// same append-only logs, not a parallel store.

// From an audio-transcription doc (organs/in/audio.js): each timed word, its normalized surface the
// coref'd entity. "when is X said" resolves to the word's own [start,end].
export const saidAnnotations = (audioDoc) => {
  if (!audioDoc || !Array.isArray(audioDoc.tokens)) return [];
  const witness = audioDoc.witness || 'transcript';
  return audioDoc.tokens
    .filter((t) => t && t.norm && isFinite(t.start))
    .map((t) => ({
      span: [t.start, t.end ?? t.start], kind: 'said', text: t.text, terms: [t.norm],
      entityId: t.id || t.norm, witness, confidence: t.conf ?? null,
    }));
};

// From the persistence decomposition (organs/in/motion.js): each dwell a span the timeline holds a
// thing (or is empty). The verdict is a term, so "present-still" is queryable; `dur` powers duration.
export const dwellAnnotations = (persistence, { label = 'scene' } = {}) => {
  if (!persistence || !Array.isArray(persistence.dwells)) return [];
  return persistence.dwells.map((dw) => ({
    span: [dw.start, dw.end], kind: 'dwell',
    text: `${label} ${dw.verdict} for ${(dw.dur || 0).toFixed(1)}s`,
    terms: [dw.verdict, ...(dw.verdict === 'present-still' ? ['present', 'still', 'persists'] : dw.verdict === 'void' ? ['empty'] : [])],
    witness: persistence.cameraCompensated ? 'motion (compensated)' : 'motion (fixed-camera)',
    dur: dw.dur, confidence: dw.verdict === 'indeterminate' ? 0.4 : 0.8,
    verdict: dw.verdict,
  }));
};

// From the CV read of a shot's keyframe (eo/vision.js → scene.js), tied to the SHOT SPAN. `entityId`
// is the coref'd tracked figure (perceiver/equivalence.js) when the upstream merge assigned one, so
// the same figure across cuts is one searchable id. Shape per shot:
//   { span:[start,end], caption?, regions:[{label, entityId?, score?}], ocr?:[string], witness? }
export const seenAnnotations = (visionByShot = []) => {
  const out = [];
  for (const s of visionByShot) {
    if (!s || !Array.isArray(s.span)) continue;
    const witness = s.witness || 'vision';
    for (const r of (s.regions || [])) {
      if (!r || !r.label) continue;
      out.push({ span: s.span, kind: 'seen', text: r.label, terms: terms(r.label), entityId: r.entityId || null, witness, confidence: r.score ?? null });
    }
    if (s.caption) out.push({ span: s.span, kind: 'concept', text: s.caption, terms: terms(s.caption), witness, confidence: s.captionScore ?? null });
    for (const line of (s.ocr || [])) {
      if (line && String(line).trim()) out.push({ span: s.span, kind: 'text', text: String(line), terms: terms(line), witness, confidence: null });
    }
  }
  return out;
};

// ── the index ────────────────────────────────────────────────────────────────────────────────────
// buildMomentIndex(annotations) → a term → annotations posting list plus the annotations sorted by
// start, and the set of tracked entity ids present (for figure-level queries).
export const buildMomentIndex = (annotations = []) => {
  const anns = annotations
    .filter((a) => a && Array.isArray(a.span) && isFinite(a.span[0]))
    .map((a, i) => ({ ...a, i, terms: (a.terms || []).map(normTerm).filter(Boolean) }))
    .sort((a, b) => a.span[0] - b.span[0]);
  const byTerm = new Map();
  const entities = new Map();
  for (const a of anns) {
    for (const t of new Set(a.terms)) { if (!byTerm.has(t)) byTerm.set(t, []); byTerm.get(t).push(a); }
    if (a.entityId) { if (!entities.has(a.entityId)) entities.set(a.entityId, []); entities.get(a.entityId).push(a); }
  }
  const kinds = new Set(anns.map((a) => a.kind));
  const duration = anns.reduce((m, a) => Math.max(m, a.span[1] || a.span[0]), 0);
  return { annotations: anns, byTerm, entities, kinds, duration };
};

// ── the query decomposition (a proposer — commits nothing) ───────────────────────────────────────
// decomposeQuery(text, { vocab, propose }) → { terms, phrases, kinds?, minDuration?, entity? }
// A pluggable model `propose(text, {vocab})` may return the structured query; on absence or failure
// the lexical fallback stands: salient terms, a duration read ("longer than ten minutes"), and a kind
// hint ("says/heard" → said; "on screen/sign/reads" → text; "shows/wearing" → seen).
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
export const parseDuration = (text) => {
  const s = String(text || '').toLowerCase();
  // "longer than 10 minutes", "more than ten min", "over 2 minutes", "at least 90 seconds"
  const m = s.match(/(?:longer than|more than|over|at least|>=?|greater than)\s+(\d+|\w+)\s*(hour|hr|minute|min|second|sec)/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (WORD_NUM[m[1]] ?? null);
  if (n == null) return null;
  const unit = m[2];
  return unit.startsWith('hour') || unit.startsWith('hr') ? n * 3600 : unit.startsWith('min') ? n * 60 : n;
};
export const decomposeQuery = async (text, { vocab = null, propose = null } = {}) => {
  if (typeof propose === 'function') {
    try {
      const p = await propose(text, { vocab });
      if (p && Array.isArray(p.terms)) return { phrases: [], kinds: null, minDuration: null, entity: null, ...p, terms: p.terms.map(normTerm).filter(Boolean) };
    } catch { /* the proposer is best-effort; the lexical read stands */ }
  }
  const salient = terms(text).filter((t) => !STOP.has(t));
  const low = String(text || '').toLowerCase();
  let kinds = null;
  if (/\b(says?|said|spoke|heard|mentions?|utters?)\b/.test(low)) kinds = ['said'];
  else if (/\b(on screen|on-screen|sign|reads?|caption|text|label|nameplate|slide)\b/.test(low)) kinds = ['text', 'seen'];
  else if (/\b(parked|stood|standing|left|unattended|persist|remains?|stays?|idle)\b/.test(low)) kinds = ['dwell', 'seen'];
  // A vocabulary (the corpus's concept set) narrows terms to what CV can actually propose; unknown
  // terms are kept (they may hit the transcript) but flagged so the caller can warn "not in vocab".
  const outOfVocab = vocab ? salient.filter((t) => !vocab.includes(t)) : [];
  return { terms: salient, phrases: [], kinds, minDuration: parseDuration(text), entity: null, outOfVocab };
};

// ── the matcher ──────────────────────────────────────────────────────────────────────────────────
// Merge matching annotations that overlap or sit within `gap` seconds into one candidate moment, so a
// concept seen and a word said at the same time become ONE hit with two witnesses and precise in/out.
const mergeIntoMoments = (matches, gap) => {
  const sorted = matches.slice().sort((a, b) => a.ann.span[0] - b.ann.span[0]);
  const moments = [];
  for (const m of sorted) {
    const cur = moments[moments.length - 1];
    if (cur && m.ann.span[0] <= cur.out + gap) {
      cur.out = Math.max(cur.out, m.ann.span[1] || m.ann.span[0]);
      cur.witness.push(m);
    } else {
      moments.push({ in: m.ann.span[0], out: m.ann.span[1] || m.ann.span[0], witness: [m] });
    }
  }
  return moments;
};

// searchMoments(index, query, opts) → ranked witnessed candidates. Each:
//   { span:[in,out], dur, verdict:'match'|'indeterminate', score, coverage,
//     terms:[met], witness:[{ kind, text, span, witness, terms }], why }
// opts: { gap, minWitnessesForMatch, coverageForMatch, maxResults }
export const searchMoments = (index, query, opts = {}) => {
  const {
    gap = 2.5,                    // seconds between annotations still read as one moment
    coverageForMatch = 0.999,     // meeting every salient term is a match on its own
    corroborationCoverage = 0.5,  // …or half the terms, if corroborated across ≥2 kinds / witnesses
    minWitnessesForMatch = 2,
    maxResults = 50,
  } = opts;
  if (!index || !query) return [];
  const qTerms = (query.terms || []).map(normTerm).filter(Boolean);
  const wantKinds = query.kinds && query.kinds.length ? new Set(query.kinds) : null;
  const minDur = query.minDuration || null;

  // Gather the matching annotations. An entity query pulls the whole tracked figure (every span it
  // appears at), which is the figure-level search; otherwise a term query hits the posting lists.
  const hits = new Map();   // annotation.i → { ann, met:Set(terms) }
  const add = (ann, term) => {
    if (wantKinds && !wantKinds.has(ann.kind)) return;
    if (!hits.has(ann.i)) hits.set(ann.i, { ann, met: new Set() });
    if (term) hits.get(ann.i).met.add(term);
  };
  if (query.entity && index.entities.has(query.entity)) for (const ann of index.entities.get(query.entity)) add(ann, null);
  for (const t of qTerms) for (const ann of (index.byTerm.get(t) || [])) add(ann, t);

  const matches = [...hits.values()].map((h) => ({ ann: h.ann, met: [...h.met] }));
  if (!matches.length && !(query.entity && index.entities.has(query.entity))) return [];

  const moments = mergeIntoMoments(matches, gap);
  const denom = Math.max(1, qTerms.length);

  const scored = moments.map((mo) => {
    const met = new Set();
    const kinds = new Set();
    for (const w of mo.witness) { for (const t of w.met) met.add(t); kinds.add(w.ann.kind); }
    const coverage = qTerms.length ? met.size / denom : (query.entity ? 1 : 0);
    const witnessCount = mo.witness.length;
    const kindDiversity = kinds.size;
    const entityHit = !!(query.entity && mo.witness.some((w) => w.ann.entityId === query.entity));
    const dur = mo.out - mo.in;
    // The score rewards coverage first, then independent corroboration and cross-kind agreement.
    const score = coverage * (1 + Math.log2(1 + witnessCount)) * (1 + 0.35 * (kindDiversity - 1)) + (entityHit ? 0.5 : 0);
    // The verdict — the enactor's discipline made local: evidence enough for a claim, or abstain.
    let verdict = 'indeterminate';
    if (entityHit && !qTerms.length) verdict = 'match';
    else if (coverage >= coverageForMatch) verdict = 'match';
    else if (coverage >= corroborationCoverage && witnessCount >= minWitnessesForMatch && kindDiversity >= 2) verdict = 'match';
    const witness = mo.witness.map((w) => ({ kind: w.ann.kind, text: w.ann.text, span: w.ann.span, witness: w.ann.witness, terms: w.met }));
    const why = verdict === 'match'
      ? `${[...met].join(', ') || 'the tracked figure'} — witnessed by ${witnessCount} annotation${witnessCount === 1 ? '' : 's'} across ${kindDiversity} kind${kindDiversity === 1 ? '' : 's'}`
      : `partial — ${met.size}/${denom} of the described terms met (${[...met].join(', ') || 'none'}); a maybe, not a match`;
    return { span: [mo.in, mo.out], dur, verdict, score: +score.toFixed(4), coverage: +coverage.toFixed(3), terms: [...met], witness, why };
  })
  // Duration-as-a-predicate: "persisted longer than N" filters the candidates by their own span.
  .filter((c) => !minDur || c.dur >= minDur);

  // Matches first (strongest evidence), then the honest maybes; each block by score, then by time.
  scored.sort((a, b) => {
    if ((a.verdict === 'match') !== (b.verdict === 'match')) return a.verdict === 'match' ? -1 : 1;
    return b.score - a.score || a.span[0] - b.span[0];
  });
  return scored.slice(0, maxResults);
};

// One-call convenience: text query → ranked witnessed candidates over an index, decomposition and all.
export const findMoments = async (index, text, { vocab = null, propose = null, ...opts } = {}) => {
  const query = await decomposeQuery(text, { vocab, propose });
  return { query, results: searchMoments(index, query, opts) };
};
