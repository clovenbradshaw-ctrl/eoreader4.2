// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the S-registry
import { parseText } from '../../../perceiver/parse/index.js';
import { nestComposite } from '../../../perceiver/nest.js';
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { readIngest } from '../../../organs/ingest/index.js';
import { emitEot } from '../../../organs/ingest/index.js';
import { nowIso, nowMs, domainOf, shaShort, bytesOf } from './util.js';
import { buildSourceExport } from '../source-export.js';

export const installRegistry = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── the S-registry ─────────────────────────────────────────────────────────
  const sourceBySn = (id) => state.sources.find((s) => s.sn === id);

  const metadataValue = (...vals) => vals.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
  const sourceContentType = (kind) => {
    const k = String(kind || '').toLowerCase();
    return k === 'pdf' ? 'PDF' : k === 'web' || k === 'html' ? 'Webpage' : k === 'audio' ? 'Audio'
      : k === 'video' ? 'Video' : k === 'image' ? 'Image' : k === 'table' ? 'Dataset'
        : k === 'json' ? 'JSON' : k === 'music' ? 'Music/score' : k === 'subtitle' ? 'Captions'
          : k === 'markdown' ? 'Markdown' : k === 'code' ? 'Code'
            : k === 'text' ? 'Plain text/notes' : k === 'file' ? 'File' : k || 'Document';
  };
  const inferSourceMetadata = ({ title, url = null, kind = 'web', record = null, doc = null } = {}, src = null) => {
    const md = { ...(doc?.metadata || {}), ...(record?.metadata || {}) };
    const web = doc?.web || {};
    const now = nowIso();
    return {
      title: metadataValue(md.title, record?.title, title, src?.title, url, 'Untitled'),
      author: metadataValue(md.author, md.creator, md.artist, md.composer, md.director, record?.byline, record?.author, src?.creator, src?.author),
      documentCreationDate: metadataValue(md.created, md.creation_date, md.creationDate, md['creation date'], md.produced, md.generated, md.dateCreated),
      contentCreationDate: metadataValue(md.date, md.published, md.publication_date, md.publicationDate, record?.published, web.published, src?.published),
      contentType: metadataValue(md.type, md.content_type, md.contentType, sourceContentType(kind || src?.kind)),
      lastRevised: metadataValue(md.updated, md.modified, md.revised, md.lastModified, md.last_revised, md['last revised'], record?.updated, web.updated),
      extraction: { at: now, source: 'best-effort ingest metadata' },
    };
  };
  const mergeSourceMetadata = (src, inferred) => {
    const prev = src.metadata || {};
    src.metadata = { ...inferred, ...prev, extraction: inferred.extraction || prev.extraction };
    src.metadataLog = Array.isArray(src.metadataLog) ? src.metadataLog : [];
    if (!src.metadataLog.length) src.metadataLog.push({ at: nowIso(), action: 'extracted', fields: Object.keys(inferred).filter((k) => k !== 'extraction'), note: 'Best-effort metadata extracted on ingest; every field remains editable.' });
  };
  const docFor = (src) => {   // the reading every consumer shares; nestComposite recovers its own nesting
    if (!src) return null;
    if (!src._doc) {
      // `unnamedReferents: true` — ordinary reading, not a special capability (organs/in/text.js
      // documents the intent). A figure the text only ever points at by description — Frankenstein's
      // creature ("the creature"/"the monster"/"the wretch") — is resolved off its recurring
      // descriptions and pronouns instead of vanishing, so it reaches the Source Index. Precision-
      // gated, so a document whose figures are all named parses unchanged.
      src._doc = nestComposite(parseText(src.text, { docId: src.docId, unnamedReferents: true }), { minGap: 20, unnamedReferents: true });
      try {
        const g = projectGraph(src._doc.log);
        src.entCount = g.entities?.size || 0;
      } catch { src.entCount = 0; }
      emit('sources');
    }
    return src._doc;
  };

  const addSource = ({ title, url = null, text, kind = 'web', rights = null, record = null, doc = null, parentSn = null, defer = false }) => {
    const body = String(text || '').trim();
    if (!body) throw new Error('nothing to record — the page had no readable text');
    // A caller that already parsed (web/text ingest) hands docFor's doc PRE-BUILT, bypassing
    // its lazy nesting — so nest it here too, on the same prose-shaped, non-composite docs
    // docFor would. Scoped to web/text (a scraped page, a pasted book or journal — where a
    // single file being many nested documents is the real case) and never allowed to cost the
    // ingest: a boundary-detection fault degrades to the doc exactly as handed in.
    if (doc && (kind === 'web' || kind === 'text') && !doc.isComposite && (doc.units || doc.sentences)) {
      try { doc = nestComposite(doc, { minGap: 20, unnamedReferents: true }); } catch { /* nesting is a courtesy, never a precondition */ }
    }
    const hash = record?.content_hash || webContentHash(body);
    const dup = state.sources.find((s) => s.sha === hash);
    // Re-visiting a page already recorded is a no-op on the registry, but if it now arrives UNDER a
    // parent (a link we followed inside that parent's site) and had none before, adopt it — so a
    // page first seen on its own, then reached by clicking through its site, nests where expected.
    if (dup) {
      if (parentSn && !dup.parentSn && dup.sn !== parentSn) { dup.parentSn = parentSn; appCtx.persist(); emit('sources'); }
      logIt('skip', `Already recorded — ${dup.title}`, dup.sn); return dup;
    }
    const id = `S${++appCtx.sn}`;
    const src = {
      sn: id, reg: `S-${String(appCtx.sn).padStart(4, '0')}`,
      docId: doc?.docId || `doc-${shaShort(hash)}`,
      // A file upload passes `rights: 'local file'` regardless of its modality (`kind` is the
      // reading's modality — text/pdf/table/… — not "how it arrived", so checking `kind` here used
      // to mislabel every uploaded PDF/text/table/etc. as "pasted text"). Real pasted/typed text
      // (ingestText) never sets `rights`, so it still reads as `local` and keeps its own label.
      title: title || url || 'Untitled', url, domain: url ? domainOf(url) : (rights === 'local file' ? 'local file' : 'pasted text'),
      kind, retrieved: nowIso(), recordedAt: nowMs(), sha: hash, bytes: bytesOf(body),
      rights: rights || (url ? 'web — verify before reuse' : 'local'),
      // parentSn: a page reached by following a link inside another source's site is recorded as a
      // SUB-OBJECT of that source — one site stays one source in the sidebar, its followed pages
      // nested and (by default) folded under it. collapsed governs its OWN children's fold state.
      parentSn: parentSn || null, collapsed: true,
      // folderId: which folder in the workspace Drive this source is filed under (null = root).
      // Only top-level records are filed; a followed sub-page rides with the site it hangs under,
      // so it inherits its parent's folder and is never shown as its own file in the explorer.
      folderId: parentSn ? (sourceBySn(parentSn)?.folderId || null) : null,
      text: body, entCount: null, _doc: doc || null,
      thumbnail: record?.salient_image || doc?.web?.salient_image || doc?.metadata?.salient_image || null,
    };
    mergeSourceMetadata(src, inferSourceMetadata({ title, url, kind, record, doc }, src));
    if (doc) { try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { src.entCount = 0; } }
    state.sources.push(src);
    const t = appCtx.topic();
    if (t && !t.sourceSns.includes(id)) t.sourceSns.push(id);
    if (t) appCtx.topicAutoName(t, { silent: true });   // a first source names a placeholder topic (persist/emit follow below)
    if (parentSn) {
      const par = sourceBySn(parentSn);
      logIt('nav', `Followed link on ${par ? par.domain : 'a source'} → ${src.title}`, src.reg);
    }
    logIt('record', `Recorded ${src.domain} — ${src.title}`, src.reg);
    logIt('hash', `Fixity sha ${shaShort(src.sha)} · ${src.bytes.toLocaleString()} bytes`, src.reg);
    appCtx.deepWake();   // the record grew — let the reading reflect on the new places at rest
    appCtx.persist(); emit('sources');
    // Every source is READ into EoT at the moment of record — every proposition the
    // parse admitted (any modality: the organs all land on the same spine) counted here,
    // in the canonical surface. Deferred a tick so the record lands (toast, registry)
    // before the read runs.
    //
    // Only the CHEAP half runs at record: the propositions count is a linear read of the
    // log (emitEot). The reading's THINKING layer — its turning points — is NOT computed
    // here: significanceSpine re-reads the whole log once per sampled cursor, tens of
    // seconds on a 2,500-page document, and running it eagerly froze the tab right after
    // every large import. It is left to the reading surface to compute lazily (eotFor,
    // memoised) when the reader actually opens that source. Recording never blocks the tab
    // on the full EoT read again.
    //
    // `defer` skips this tick entirely: the caller is landing the source AHEAD of its reading
    // (a big prose import parses in a CHUNKED background pass, not the synchronous sweep docFor
    // runs here) and folds the doc in with finishReading — which runs the same EoT read + summary
    // once the reading is ready. Without the skip the eager docFor here would race that background
    // pass and freeze the tab on the very sweep defer exists to avoid.
    if (!defer) setTimeout(() => {
      try {
        const d = docFor(src);
        const props = d?.log ? emitEot(d.log).lines.length : 0;
        logIt('eot', `Encoded ${src.reg} into EoT — ${props} propositions`, src.reg);
        const chapters = Array.isArray(d?.chapters) ? d.chapters.length : 0;
        const entities = Number.isFinite(src.entCount) ? src.entCount : 0;
        let findings = 0; try { findings = appCtx.findings?.().stats?.claims || 0; } catch { findings = 0; }
        logIt('record', `Recorded and analyzed without an LLM — ${src.bytes.toLocaleString()} bytes verified · ${chapters} chapters · ${entities} entity candidates · ${findings} findings · ${props.toLocaleString()} EoT operations`, src.reg);
      } catch (e) { logIt('skip', `EoT read failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
      // …and auto-compose the source's topline the moment it is recorded. Model-optional: the
      // deterministic telegram lands at once (there is a summary before any talker is warm), and a
      // loaded talker refines the join in the background. Fire-and-forget — never blocks the record.
      appCtx.sourceSummary(src.sn).catch(() => { /* a summary must never cost the record */ });
      appCtx.autoEntitySummaries(src);   // …and a topline for each of its dominant figures (telegram-only)
      appCtx.judgeWebIntake?.(src);      // …and the web organ's four gates, for a web-kind source (intake.js)
    }, 0);
    return src;
  };

  // finishReading(src, doc) — fold a background-parsed reading into a source that ALREADY landed
  // (addSource with `defer`). The source appeared in the registry the instant its text was known;
  // this attaches the entity/relation doc once the CHUNKED parse finishes, refreshes the derived
  // caches, and runs the same EoT read + summary addSource's eager tick would have — so the record
  // shows immediately and its reading catches up without ever freezing the tab. Defensive: a source
  // removed mid-parse is a no-op.
  const finishReading = (src, doc) => {
    if (!src || !doc || !sourceBySn(src.sn)) return;
    src._doc = doc;
    mergeSourceMetadata(src, inferSourceMetadata({ title: src.title, url: src.url, kind: src.kind, record: src.record, doc }, src));
    src._eot = null;
    appCtx.deepReaders.delete(src.docId);
    try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { src.entCount = 0; }
    try {
      const props = doc.log ? emitEot(doc.log).lines.length : 0;
      logIt('eot', `Encoded ${src.reg} into EoT — ${props} propositions`, src.reg);
      const chapters = Array.isArray(doc?.chapters) ? doc.chapters.length : 0;
      const entities = Number.isFinite(src.entCount) ? src.entCount : 0;
      let findings = 0; try { findings = appCtx.findings?.().stats?.claims || 0; } catch { findings = 0; }
      logIt('record', `Recorded and analyzed without an LLM — ${src.bytes.toLocaleString()} bytes verified · ${chapters} chapters · ${entities} entity candidates · ${findings} findings · ${props.toLocaleString()} EoT operations`, src.reg);
    } catch (e) { logIt('skip', `EoT read failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
    appCtx.persist(); emit('sources');
    appCtx.sourceSummary(src.sn).catch(() => { /* a summary must never cost the record */ });
    appCtx.autoEntitySummaries(src);   // …and a topline for each of its dominant figures (telegram-only)
    appCtx.judgeWebIntake?.(src);      // …and the web organ's four gates, for a web-kind source (intake.js)
  };

  // The source's reading as one EoT document (structure + thinking). Memoised on the
  // source; readIngest itself memoises per doc, so this is computed once per record.
  const eotFor = (snId) => {
    const src = sourceBySn(snId);
    if (!src) return null;
    if (!src._eot) {
      const doc = docFor(src);
      // Scale the turning-point spine to the DOCUMENT. The library default (k=12) is right for a
      // short record but starves a whole work — a novel's dozen turns are a scatter of dots on a
      // near-empty waveform, "nowhere near enough surprise to cover all of Frankenstein". Ask for
      // ~1 turning point per 20 units, floored at the old default so a short source is unchanged.
      // Long books also get a denser sampling budget so the peaks are actual content turns rather
      // than whichever sentence happened to sit on a coarse stride.
      const nUnits = ((doc && (doc.units || doc.sentences)) || []).length;
      const k = Math.max(12, Math.min(220, Math.round(nUnits / 20)));
      const budget = nUnits > 900 ? Math.min(1800, Math.max(900, Math.round(nUnits / 2))) : undefined;
      src._eot = readIngest(doc, k === 12 && budget == null ? undefined : { k, ...(budget ? { budget } : {}) });
    }
    return src._eot;
  };

  // The ANSWER's own reading as one EoT document. The source viewer's facing page reads a recorded
  // document back through the predictive stack; this hands the chat the same lens on the machine's
  // OWN reply — so "how it read it" is available for an answer, not only for its sources. Memoised
  // per (message, length) in a transient cache: it is derived, re-derives in a tick, and must never
  // ride into the persisted message (which would bloat the record with a re-computable projection).
  const _answerEot = new Map();
  const answerEot = (msg) => {
    const text = String((msg && msg.text) || '');
    if (!text.trim()) return null;
    const key = `${(msg && msg.id) || ''}:${text.length}`;
    if (_answerEot.has(key)) return _answerEot.get(key);
    let eot = null;
    try { eot = readIngest(parseText(text, { docId: `answer-${(msg && msg.id) || shaShort(webContentHash(text))}` })); }
    catch { eot = null; }
    if (_answerEot.size > 64) _answerEot.clear();   // a small, self-pruning cache — answers are transient
    _answerEot.set(key, eot);
    return eot;
  };

  // Rename a recorded source without touching its text, fixity, or folder/corpus membership.
  // If the UI is pointed at a followed sub-page, rename the top-level source it rides under —
  // the Drive only exposes top-level records as files. Blank names are ignored.
  const sourceRename = (id, title) => {
    const s = sourceBySn(id);
    if (!s) return null;
    const root = s.parentSn ? (sourceBySn(s.parentSn) || s) : s;
    const next = String(title || '').replace(/\s+/g, ' ').trim();
    if (!next) return root;
    const prev = root.title || root.reg || 'source';
    root.title = next;
    logIt('record', `Renamed source — ${prev} → ${next}`, root.reg);
    appCtx.persist(); emit('sources');
    return root;
  };

  const sourceUpdateMetadata = (id, key, value) => {
    const s = sourceBySn(id);
    if (!s) return null;
    const allowed = new Set(['title', 'author', 'documentCreationDate', 'contentCreationDate', 'contentType', 'lastRevised']);
    if (!allowed.has(key)) return s;
    const next = String(value ?? '').replace(/\s+/g, ' ').trim();
    s.metadata = { ...(s.metadata || {}), [key]: next };
    if (key === 'title' && next) s.title = next;
    s.metadataLog = Array.isArray(s.metadataLog) ? s.metadataLog : [];
    const label = ({ title: 'Title', author: 'Author', documentCreationDate: 'Document Creation Date', contentCreationDate: 'Content Creation Date', contentType: 'Content Type', lastRevised: 'Last Revised' })[key] || key;
    logIt('record', `Metadata revised — ${label}: ${next || 'blank'}`, s.reg);
    s.metadataLog.push({ at: nowIso(), action: 'revised', field: key, value: next });
    appCtx.persist(); emit('sources');
    return s;
  };

  const removeSource = (id) => {
    const gone = sourceBySn(id);
    if (gone) { appCtx.deepReaders.delete(gone.docId); try { gone._doc?.releaseEmbeddings?.(); gone._nlDoc?.releaseEmbeddings?.(); } catch { /* */ } }  // free matrices held in the global budget
    state.sources = state.sources.filter((s) => s.sn !== id);
    // A removed source's sub-objects rise to the top level rather than vanish with their parent.
    for (const s of state.sources) if (s.parentSn === id) s.parentSn = null;
    for (const t of state.topics) t.sourceSns = t.sourceSns.filter((x) => x !== id);
    appCtx.persist(); emit('sources');
  };

  // Release the derived readings stale topics no longer need. A parse (_doc), its EoT
  // reading (_eot — and readIngest's memo, a WeakMap keyed by the doc, dies with it), and the
  // deep reader pinning the doc all re-derive lazily from src.text; holding EVERY topic's
  // parses at once (each several times its text's size) is session-long growth the tab cannot
  // afford — kept warm for the last TOPIC_MRU_SIZE topics VISITED, so A→B→A skips a re-parse.
  const TOPIC_MRU_SIZE = 3, _topicMru = [], releaseParsesOutsideTopic = () => {
    const t = appCtx.topic(); if (t) { const i = _topicMru.indexOf(t.id); if (i !== -1) _topicMru.splice(i, 1); _topicMru.unshift(t.id); _topicMru.length = Math.min(_topicMru.length, TOPIC_MRU_SIZE); }
    const keep = new Set(); for (const tid of _topicMru) { const tp = state.topics.find((x) => x.id === tid); if (tp) for (const sn of tp.sourceSns) keep.add(sn); }
    for (const s of state.sources) {
      if (keep.has(s.sn)) continue;
      appCtx.deepReaders.delete(s.docId); try { s._doc?.releaseEmbeddings?.(); s._nlDoc?.releaseEmbeddings?.(); } catch { /* */ }  // free matrices; re-hydrate from the embed cache on reopen
      s._doc = null; s._eot = null; s._nlDoc = null;
    }
  };

  // Full membership regardless of evidence-scope toggle; topicSources below is the ACTIVE scope.
  const topicSourcesAll = () => { const t = appCtx.topic(); return t ? t.sourceSns.map(sourceBySn).filter(Boolean) : []; };
  const topicSources = () => { const t = appCtx.topic(); if (!t) return [];
    return t.sourceSns.map(sourceBySn).filter((s) => s && !(t.scopeDisabled || []).includes(s.sn)); };
  const topicDocs = () => topicSources().map(docFor).filter(Boolean);
  // The MEANING-layer docs for the topic — a clip's/video's figures live in its transcript, read
  // as prose on top (referentDocFor), not in the raw word/segment spans of the base organ doc. This
  // is the doc set the entity LINKER reads, so an audio or video source links the same named figures
  // the entity explorer lists (a base doc carries no `admission`, so it would link nothing).
  const topicReferentDocs = () => topicSources().map(appCtx.referentDocFor).filter(Boolean);

  const sourceExport = (snId, opts = {}) => {
    const source = sourceBySn(snId);
    if (!source) return null;
    const doc = docFor(source);
    let eot = null;
    if (opts.includeEot) { try { eot = eotFor(snId); } catch { eot = null; } }
    return buildSourceExport({ source, doc, eot, format: opts.format || 'jsonl', cursor: opts.cursor || null, baseName: opts.baseName || source.title || source.sn });
  };

  const sourceHistoryJsonl = (snId, opts = {}) => sourceExport(snId, { ...opts, format: 'jsonl' });
  const sourceCursorJson = (snId, cursor = {}, opts = {}) => sourceExport(snId, { ...opts, cursor, format: 'cursor-json' });

  Object.assign(appCtx, { addSource, answerEot, docFor, eotFor, finishReading, releaseParsesOutsideTopic, removeSource, sourceBySn, sourceRename, sourceUpdateMetadata, sourceExport, sourceHistoryJsonl, sourceCursorJson, topicDocs, topicReferentDocs, topicSources, topicSourcesAll });
};
