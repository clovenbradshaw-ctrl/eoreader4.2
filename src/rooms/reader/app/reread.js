// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines").
// re-read: deliberate source refresh with preserve/overwrite/context choices.
import { htmlToText, admitWebSource, searchAndAdmit, webContentHash, emitEot } from '../../../organs/ingest/index.js';
import { projectGraph } from '../../../core/index.js';
import { nowIso, nowMs, domainOf, shaShort, bytesOf } from './util.js';

export const installReread = (appCtx) => {
  const { client, emit, logIt, state } = appCtx;

  const replaceSourceReading = (src, { title = null, url = null, text, kind = null, record = null, doc = null } = {}) => {
    const body = String(text || '').trim();
    if (!src || !body) throw new Error('nothing to record — the re-read had no readable text');
    src.history = Array.isArray(src.history) ? src.history : [];
    src.history.push({ at: nowIso(), action: 'overwritten', title: src.title, url: src.url, sha: src.sha, bytes: src.bytes, note: 'manual re-read overwrite' });
    if (src.history.length > 24) src.history.splice(0, src.history.length - 24);
    const hash = record?.content_hash || webContentHash(body);
    src.title = title || record?.title || src.title || url || 'Untitled';
    src.url = url || record?.url || src.url || null;
    src.domain = src.url ? domainOf(src.url) : src.domain;
    src.kind = kind || src.kind || 'web';
    src.retrieved = nowIso(); src.recordedAt = nowMs();
    src.sha = hash; src.bytes = bytesOf(body); src.text = body;
    src.docId = src.docId || `doc-${shaShort(hash)}`;
    src._doc = doc || null; src._eot = null; src._nlDoc = null; src.summary = null;
    appCtx.deepReaders.delete(src.docId);
    if (doc) { try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { src.entCount = 0; } }
    else src.entCount = null;
    logIt('record', `Re-read and overwrote ${src.reg} — ${src.title}`, src.reg);
    appCtx.persist(); emit('sources');
    setTimeout(() => {
      try {
        const d = appCtx.docFor(src);
        const props = d?.log ? emitEot(d.log).lines.length : 0;
        logIt('eot', `Re-encoded ${src.reg} after re-read — ${props} propositions`, src.reg);
      } catch (e) { logIt('skip', `Re-read EoT failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
      appCtx.sourceSummary(src.sn).catch(() => {});
      appCtx.autoEntitySummaries(src);
    }, 0);
    return src;
  };

  const reReadSource = (sn, opts = {}) => {
    const mode = opts.mode || 'preserve';
    const withContext = !!opts.context || mode === 'context';
    const overwrite = mode === 'overwrite';
    const src = appCtx.sourceBySn(sn);
    if (!src) return Promise.resolve(null);
    const owningTopic = state.topics.find((t) => (t.sourceSns || []).includes(src.sn));
    const targetTopicId = opts.topicId || owningTopic?.id || state.activeTopicId;
    return appCtx.runCancellable({ kind: 'fetch', label: `Re-reading ${src.title || src.reg}…` }, async (signal) => {
      let text = src.text || '';
      let title = src.title || src.url || 'Untitled';
      let url = src.url || null;
      let record = null;
      let doc = null;
      if (src.url) {
        const raw = (await client.fetchUrl(src.url, { signal })).text || '';
        title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || title;
        text = htmlToText(raw) || text;
        const admitted = admitWebSource({ url: src.url, title, text, fetched_at: nowIso(), engine: 'feed-proxy:reread' });
        doc = admitted.doc; record = admitted.record; url = record.url || src.url; text = doc.text; title = record.title || title;
      }
      const reread = overwrite
        ? replaceSourceReading(src, { title, url, text, kind: src.kind, record, doc })
        : appCtx.addSource({ title: `${title} (re-read ${new Date().toISOString().slice(0, 10)})`, url, text, kind: src.kind || 'web', record, doc, parentSn: src.parentSn || null, topicId: targetTopicId });
      const extras = [];
      if (withContext && (src.url || title)) {
        const query = opts.query || `${title} ${src.domain || ''}`.trim();
        const admitted = await searchAndAdmit(query, { client, k: 3, kind: 'auto', fetchPages: true, signal, onAdmit: () => appCtx.stallGuard?.feed() });
        for (const a of admitted || []) {
          if (!a?.doc || !a?.record) continue;
          try { extras.push(appCtx.addSource({ title: a.record.title || a.item?.title, url: a.record.url || a.item?.url || null, text: a.doc.text, kind: 'web', record: a.record, doc: a.doc, topicId: targetTopicId })); }
          catch { /* duplicate/empty context source */ }
        }
        logIt('search', `Added context for re-read — ${query}`, `${extras.length} source${extras.length === 1 ? '' : 's'}`);
      }
      logIt('record', `Manual re-read complete — ${overwrite ? 'overwrite' : 'preserve'}${withContext ? ' + context' : ''}`, reread?.reg || src.reg);
      return { source: reread, extras };
    });
  };

  Object.assign(appCtx, { reReadSource });
};
