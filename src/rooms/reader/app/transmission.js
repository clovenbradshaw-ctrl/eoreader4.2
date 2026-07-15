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

import { perspectiveOf, parseFold, claimsFromDoc, traceTransmission, transmissionFloor } from '../../../perceiver/index.js';

const SRC_STRIDE = 100000;   // global-time offset per source so the topic timeline stays ordered

export const installTransmission = (appCtx) => {
  const speechOf = (doc) => doc?.conventions?.isAttributionVerb;
  const warm = () => (appCtx.warmEmbedder ? appCtx.warmEmbedder() : null);
  const run = async (streams) => { const e = warm(); return e ? traceTransmission(streams, { embedder: e }) : transmissionFloor(streams); };

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
  // parse-loops, not hundreds. voicesInDoc is the shared quote-scan installed by rashomon.
  const voices = (doc, cap = 16) => (appCtx.voicesInDoc(doc) ? [...appCtx.voicesInDoc(doc).values()] : [])
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
