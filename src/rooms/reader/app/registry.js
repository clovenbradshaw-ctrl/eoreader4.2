// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the S-registry
import { parseText } from '../../../perceiver/parse/index.js';
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { readIngest } from '../../../organs/ingest/index.js';
import { emitEot } from '../../../organs/ingest/index.js';
import { nowIso, nowMs, domainOf, shaShort, bytesOf } from './util.js';

export const installRegistry = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── the S-registry ─────────────────────────────────────────────────────────
  const sourceBySn = (id) => state.sources.find((s) => s.sn === id);
  const docFor = (src) => {
    if (!src) return null;
    if (!src._doc) {
      src._doc = parseText(src.text, { docId: src.docId });
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
      title: title || url || 'Untitled', url, domain: url ? domainOf(url) : (kind === 'file' || kind === 'audio' || kind === 'video' ? 'local file' : 'pasted text'),
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
    };
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
      // ~1 turning point per 40 units, floored at the old default so a short source is unchanged
      // and capped so the waveform + list stay legible (and well under the spine's sampling budget).
      const nUnits = ((doc && (doc.units || doc.sentences)) || []).length;
      const k = Math.max(12, Math.min(140, Math.round(nUnits / 40)));
      src._eot = readIngest(doc, k === 12 ? undefined : { k });
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

  const removeSource = (id) => {
    const gone = sourceBySn(id);
    if (gone) appCtx.deepReaders.delete(gone.docId);   // or the deep reader keeps the removed doc resident
    state.sources = state.sources.filter((s) => s.sn !== id);
    // A removed source's sub-objects rise to the top level rather than vanish with their parent.
    for (const s of state.sources) if (s.parentSn === id) s.parentSn = null;
    for (const t of state.topics) t.sourceSns = t.sourceSns.filter((x) => x !== id);
    appCtx.persist(); emit('sources');
  };

  // Release the derived readings the active topic no longer needs. A parse (_doc), its EoT
  // reading (_eot — and readIngest's memo, a WeakMap keyed by the doc, dies with it), and the
  // deep reader pinning the doc all re-derive lazily from src.text; holding EVERY topic's
  // parses at once (each several times its text's size) is session-long growth the tab —
  // already carrying model weights — cannot afford.
  const releaseParsesOutsideTopic = () => {
    const t = appCtx.topic();
    const keep = new Set(t ? t.sourceSns : []);
    for (const s of state.sources) {
      if (keep.has(s.sn)) continue;
      appCtx.deepReaders.delete(s.docId);
      s._doc = null; s._eot = null; s._nlDoc = null;
    }
  };

  const topicSources = () => {
    const t = appCtx.topic();
    return t ? t.sourceSns.map(sourceBySn).filter(Boolean) : [];
  };
  const topicDocs = () => topicSources().map(docFor).filter(Boolean);
  // The MEANING-layer docs for the topic — a clip's/video's figures live in its transcript, read
  // as prose on top (referentDocFor), not in the raw word/segment spans of the base organ doc. This
  // is the doc set the entity LINKER reads, so an audio or video source links the same named figures
  // the entity explorer lists (a base doc carries no `admission`, so it would link nothing).
  const topicReferentDocs = () => topicSources().map(appCtx.referentDocFor).filter(Boolean);

  Object.assign(appCtx, { addSource, answerEot, docFor, eotFor, finishReading, releaseParsesOutsideTopic, removeSource, sourceBySn, sourceRename, topicDocs, topicReferentDocs, topicSources });
};
