// EO — one section of the reader session controller (rooms/reader/app.js): IDEA TRANSMISSION.
// Watch a claim change hands — a claim first voiced by one figure that a later figure voices
// too is an idea propagating through the cast, and where the later voice inverts it the idea
// mutated. Offered at BOTH scopes: one source (document time = sentence order) and the whole
// topic (corpus time = source order, then sentence order).
//
// Rides the same learned machinery as Rashomon: each figure's claims are read through the
// document's learned speech ledger and time-stamped per quote (figure-fold); "the same idea" is
// the model-free lexical floor unless MiniLM is warm, in which case the learned proposition-
// equivalence widens it to paraphrases and inversions (perceiver/idea-transmission.js).

import { projectGraph } from '../../../core/index.js';
import { perspectiveOf, scanQuotes, parseFold, claimsFromDoc, traceTransmission, transmissionFloor } from '../../../perceiver/index.js';

const SRC_STRIDE = 100000;   // global-time offset per source so the topic timeline stays ordered

export const installTransmission = (appCtx) => {
  const speechOf = (doc) => doc?.conventions?.isAttributionVerb;
  const warm = () => (appCtx.minilm?.isWarm?.() ? appCtx.minilm : null);
  const run = async (streams) => { const e = warm(); return e ? traceTransmission(streams, { embedder: e }) : transmissionFloor(streams); };

  // The agents a doc names — the figures with a VOICE, read once from the quote scan (the same
  // seam perspectiveOf uses). Formerly the shared voicesInDoc installed by rashomon; inlined here
  // now that rashomon is gone and transmission is its only remaining consumer.
  const agentsInDoc = (doc) => {
    const out = new Map();
    if (!doc?.log || !Array.isArray(doc.sentences)) return out;
    const g = projectGraph(doc.log); const rep = g.representative || ((x) => x);
    const labelOf = (id) => doc.admission?.labelOf?.(id) || g.entities.get(id)?.label || id;
    for (const s of doc.sentences) {
      for (const q of scanQuotes(s, { isSpeech: speechOf(doc), admission: doc.admission })) {
        const id = q.speakerId ? rep(q.speakerId) : null;
        const key = id || (q.speakerLabel ? `~${q.speakerLabel.toLowerCase()}` : null);
        if (!key) continue;
        const row = out.get(key) || { id, label: id ? labelOf(id) : q.speakerLabel, quotes: 0 };
        row.quotes += 1; out.set(key, row);
      }
    }
    return out;
  };

  // One figure's timed claims in one doc: parse each quote on its own so every claim carries the
  // document sentence index the figure said it in (+ a global offset for the corpus timeline).
  const claimsFor = (doc, voice, offset) => {
    const p = perspectiveOf(doc, [voice.id].filter((x) => x != null), { isSpeech: speechOf(doc) });
    const claims = [];
    for (const q of p.quotes) {
      const qd = parseFold(q.text, voice.label);
      for (const c of claimsFromDoc(qd)) claims.push({ docIdx: offset + (q.idx ?? 0), claim: c });
    }
    return claims;
  };

  // The figures worth tracing — those with a voice — capped so a crowded document stays a few
  // parse-loops, not hundreds.
  const voices = (doc, cap = 16) => [...agentsInDoc(doc).values()]
    .filter((v) => v.id).sort((a, b) => b.quotes - a.quotes).slice(0, cap);

  // ── Source scope — ideas circulating within ONE document ────────────────────────────
  const transmissionSource = async (sn) => {
    const src = appCtx.sourceBySn(sn);
    const doc = appCtx.referentDocFor(src) || appCtx.docFor(src);
    if (!doc?.log) return null;
    const streams = voices(doc).map((v) => ({ label: v.label, claims: claimsFor(doc, v, 0) })).filter((s) => s.claims.length);
    return { scope: 'source', sn, title: src?.title || null, ...(await run(streams)) };
  };

  // ── Topic scope — ideas circulating ACROSS the corpus ───────────────────────────────
  // One figure's stream is unioned over every source it speaks in; claims keep a global time so
  // the origin is the earliest voicing anywhere in the topic, and hops follow the corpus forward.
  const transmissionTopic = async () => {
    const srcs = appCtx.topicSources();
    const byLabel = new Map();
    srcs.forEach((src, si) => {
      const doc = appCtx.referentDocFor(src);
      if (!doc?.log) return;
      for (const v of voices(doc)) {
        const claims = byLabel.get(v.label) || [];
        for (const c of claimsFor(doc, v, si * SRC_STRIDE)) claims.push(c);
        byLabel.set(v.label, claims);
      }
    });
    const streams = [...byLabel].map(([label, claims]) => ({ label, claims })).filter((s) => s.claims.length);
    return { scope: 'topic', sources: srcs.map((s) => ({ sn: s.sn, title: s.title || null })), ...(await run(streams)) };
  };

  Object.assign(appCtx, { transmissionSource, transmissionTopic });
};
