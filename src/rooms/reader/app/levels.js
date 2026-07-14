// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// holonic levels: reading a source at the level of its meaning, or its signal
import { parseText } from '../../../perceiver/parse/index.js';
import { projectGraph } from '../../../core/index.js';
import { readThroughIndex, settledText } from '../transcript-format.js';
import { figureSurface, rankProperties } from '../../../perceiver/index.js';

export const installLevels = (appCtx) => {
  const { state } = appCtx;
  // ── holonic levels: reading a source at the level of its meaning, or its signal ──
  // A source is read at more than one HOLONIC LEVEL. Its BASE level is whatever organ
  // heard it — for a prose page that base already IS a natural-language reading, but for
  // a non-prose modality it is the raw SPANS: an audio clip's base entities are its timed
  // WORDS, an image's are its REGIONS, a table's are its CELLS. On TOP of that base the
  // natural-language content raises its own REFERENTS — the people, places and things the
  // words NAME — read by parsing the source's readable text as prose. The explorer defaults
  // to those referents (the meaning), and can drop to the base spans (the signal underneath).
  //
  // The natural-language reading is derived on demand and memoised on the source under an
  // underscore field (session-only, stripped from the snapshot; re-derives from `text`), and
  // keyed by the source's content hash so a transcript folding in later rebuilds it. Its docId
  // is the base docId suffixed `~nl`, so a referent opened from this level resolves its profile,
  // wiki and graph against the right reading (see resolveDoc).
  const NL_SUFFIX = '~nl';
  const nlDocFor = (src) => {
    if (!src || !String(src.text || '').trim()) return null;
    if (!src._nlDoc || src._nlDoc._sig !== src.sha) {
      try {
        const d = parseText(src.text, { docId: `${src.docId}${NL_SUFFIX}` });
        if (d) d._sig = src.sha;
        src._nlDoc = d || null;
      } catch { src._nlDoc = null; }
    }
    return src._nlDoc;
  };
  // A docId → { src, doc } lookup that also opens the natural-language level. Every
  // docId-keyed projection (profile, wiki, tiered graph) routes through here so an entity
  // from either level resolves to the reading it was read from.
  const resolveDoc = (docId) => {
    if (!docId) return null;
    const direct = state.sources.find((s) => s.docId === docId);
    if (direct) return { src: direct, doc: appCtx.docFor(direct) };
    if (docId.endsWith(NL_SUFFIX)) {
      const baseId = docId.slice(0, -NL_SUFFIX.length);
      const src = state.sources.find((s) => s.docId === baseId);
      if (src) return { src, doc: nlDocFor(src) };
    }
    if (docId.endsWith(LIVE_SUFFIX)) {
      const baseId = docId.slice(0, -LIVE_SUFFIX.length);
      const src = state.sources.find((s) => s.docId === baseId);
      if (src) return { src, doc: livePartialDocFor(src) };
    }
    return null;
  };
  // The REFERENT reading of a source — the meaning layer the entity explorer is about. A prose
  // source's base doc already IS that reading. A non-prose source raises its figures from the
  // readable text laid on top (nlDocFor). Crucially, a clip's figures live in its TRANSCRIPT: the
  // acoustic reading stands in `text` a placeholder SUMMARY ("## Signal separated from noise",
  // "Dynamic range 27 dB") before a word is transcribed, and parsing THAT as prose is what admitted
  // Signal/Noise/Dynamic as "referents". So an un-transcribed clip has NO referents yet (null) —
  // the panel says it is transcribing, rather than naming the summary's own capitalised words.
  const referentDocFor = (src) => {
    if (!src) return null;
    const base = appCtx.docFor(src);
    const modality = base?.modality || null;
    if (!modality || modality === 'text') return base;                       // prose: the base is the reading
    // A clip still WAITING for its words shows the live partial; a video already WATCHED (its picture
    // read as motion + born entities, motion.js) shows that reading — it is not waiting on anything.
    if ((modality === 'audio' || modality === 'video') && !base?.transcribed && !base?.watched) return livePartialDocFor(src);
    return nlDocFor(src);
  };

  // The words heard SO FAR for a clip still being transcribed — the live ASR tail if this session is
  // hearing it, else the durable twin persisted across a reload. Empty once the final transcript lands
  // (src.words takes over and base.transcribed goes true, so referentDocFor reads nlDocFor instead).
  const partialWordsOf = (src) => {
    if (!src) return [];
    const live = src._asr && Array.isArray(src._asr.words) && src._asr.words.length ? src._asr.words : null;
    const twin = src.transcription && Array.isArray(src.transcription.words) && src.transcription.words.length ? src.transcription.words : null;
    return live || twin || [];
  };
  // A LIVE natural-language reading of the SETTLED part of a partial transcript, so the figures a clip
  // names appear AS it is heard — the fix for "0 referents while a 49-minute clip transcribes". Parses
  // only the closed breath groups (transcript-format.settledText); the still-open trailing group is
  // re-read next pass, so the referent list never churns on a half-heard word. Memoised on the source by
  // how many words have settled, and docId-suffixed `~live` so resolveDoc opens a referent's profile
  // against this same reading. Null until enough has settled to name anything.
  const LIVE_SUFFIX = '~live';
  const livePartialDocFor = (src) => {
    if (!src) return null;
    const words = partialWordsOf(src);
    if (!words.length) return null;
    const through = readThroughIndex(words);
    if (through < 0) return null;
    if (!src._liveNlDoc || src._liveNlDoc._through !== through) {
      const text = settledText(words);
      if (!text || text.length < 12) { src._liveNlDoc = src._liveNlDoc && src._liveNlDoc._through === through ? src._liveNlDoc : null; return src._liveNlDoc; }
      try {
        const d = parseText(text, { docId: `${src.docId}${LIVE_SUFFIX}` });
        if (d) d._through = through;
        src._liveNlDoc = d || null;
      } catch { src._liveNlDoc = null; }
    }
    return src._liveNlDoc;
  };

  // The base-level noun for a source — what one raw span UNDER the referents IS, so the surface can
  // stop calling them "entities". A clip's base is its acoustic SEGMENTS before transcription and its
  // WORDS after (base.transcribed); other modalities name their own base. A prose source has no base
  // beneath its referents, so it genuinely counts entities.
  const BASE_NOUN = { image: 'Regions', table: 'Cells', json: 'Nodes', binary: 'Runs', music: 'Notes' };
  const baseNounOf = (src) => {
    const base = appCtx.docFor(src);
    const modality = base?.modality || null;
    if (modality === 'audio' || modality === 'video') return base?.transcribed ? 'Words' : 'Segments';
    return (modality && BASE_NOUN[modality]) || 'Entities';
  };
  const sourceBaseNoun = (sn) => baseNounOf(appCtx.sourceBySn(sn));
  // The holonic levels a source offers, meaning-first. A distinct base level exists only
  // when the organ doc is a non-prose modality AND there is readable text to lift referents
  // from; a prose source's base doc already IS its reading, so it has the one level.
  const sourceLevels = (sn) => {
    const src = appCtx.sourceBySn(sn);
    if (!src) return [];
    const base = appCtx.docFor(src);
    const modality = base?.modality || null;
    const hasText = !!String(src.text || '').trim();
    // A prose reading (parseText tags its doc `text`) IS the natural-language level — one level.
    // A genuine non-prose organ (audio/image/table/…) has a distinct base of raw spans beneath it.
    if (modality && modality !== 'text' && hasText) {
      const spanLabel = baseNounOf(src);
      return [
        { level: 'referent', label: 'Referents', hint: 'the figures the content names' },
        { level: 'span', label: spanLabel, hint: `the ${modality}'s raw ${spanLabel.toLowerCase()}` },
      ];
    }
    return [{ level: 'referent', label: 'Referents', hint: 'the figures the text names' }];
  };
  // The entities of ONE source at a chosen holonic level — the per-source pivot's rows.
  // 'referent' reads the natural-language content on top (when the base is non-prose);
  // 'span' reads the organ's own base doc. Never merged: one source, one reading.
  const sourceEntities = (sn, { level = 'referent' } = {}) => {
    const src = appCtx.sourceBySn(sn);
    if (!src) return [];
    // 'referent' reads the meaning layer (the transcript's figures for a clip) — null, so no rows,
    // until a clip is transcribed; 'span' reads the organ's own base doc (its segments / words).
    const doc = level === 'referent' ? referentDocFor(src) : appCtx.docFor(src);
    if (!doc) return [];
    const rows = appCtx.entitiesInDoc(doc, sn);
    rows.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
    return rows;
  };

  const entityProfile = (docId, entId) => {
    const resolved = resolveDoc(docId);
    const src = resolved?.src;
    const doc = resolved?.doc;
    if (!doc) return null;
    const fs = figureSurface(doc, [entId]);
    const label = doc.admission?.labelOf?.(entId) || fs.figures.find((f) => f.id === entId)?.label || entId;
    // mentions: the sentences whose INS events touch this referent
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const idxs = new Set();
    for (const e of doc.log.snapshot()) {
      if (e.op === 'INS' && rep(e.id) === rep(entId) && e.sentIdx != null) idxs.add(e.sentIdx);
    }
    const sentAt = (i) => String(doc.sentences?.[i] || '').trim();
    // Each mention's [start,end] on the clock, so a click can SEEK the clip there. A word-level
    // audio doc keeps a per-unit timing track (doc.timings[sentIdx]); a base segment carries its own
    // span on a `time` DEF ("a-b"). A prose / natural-language reading keeps neither, so its
    // mentions have no time and fall back to a text jump.
    const timings = Array.isArray(doc.timings) ? doc.timings : null;
    const propTime = (() => {
      const e = g.entities?.get?.(rep(entId)) || g.entities?.get?.(entId);
      const m = typeof e?.props?.time === 'string' && e.props.time.match(/^([\d.]+)-([\d.]+)$/);
      return m ? [+m[1], +m[2]] : null;
    })();
    const timeAt = (i) => {
      const t = timings && timings[i];
      if (t) return { t0: t[0] ?? null, t1: t[1] ?? null };
      return propTime ? { t0: propTime[0], t1: propTime[1] } : { t0: null, t1: null };
    };
    const mentions = [...idxs].sort((a, b) => a - b).slice(0, 40)
      .map((i) => ({ idx: i, text: sentAt(i), ...timeAt(i) }))
      .filter((m2) => m2.text);
    // Standing properties, ranked and deduped with their provenance (§ rankProperties):
    // what the record most strongly and specifically witnesses leads, and each property
    // carries the passages that assert it — its trail, and the DAG's edges.
    const defs = rankProperties(fs.defs).map((d) => ({
      value: d.value, idx: d.idx, count: d.count,
      score: d.score, confidence: d.confidence, polarity: d.polarity, modality: d.modality,
      witnesses: d.witnesses.map((i) => ({ idx: i, text: sentAt(i) })).filter((w) => w.text),
    }));
    return {
      label, docId, sn: src.sn, sourceTitle: src.title,
      defs, mentionCount: idxs.size,
      relations: fs.relations.map((r) => ({
        srcId: r.src.id, srcLabel: r.src.label, tgtId: r.tgt.id, tgtLabel: r.tgt.label,
        via: r.via, op: r.op, idx: r.idx, type: r.type, polarity: r.polarity,
      })),
      figures: fs.figures.map((f) => ({ entId: f.id, label: f.label, count: f.count })),
      mentions,
    };
  };

  Object.assign(appCtx, { entityProfile, referentDocFor, resolveDoc, sourceBaseNoun, sourceEntities, sourceLevels });
};
