// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines").
// RESEARCH REVIEW (docs/research-review.md) — the sibling of search()/searchTopic() that does NOT
// admit on fetch. Three source states: DISCOVERED (a dressed hit, title+metadata only — search()'s
// existing output), REVIEWED (fetched, admitted to the S-registry, joined to a dedicated `kind:
// 'review'` topic — a real, hashed, citable source, but not yet in any OTHER topic's sourceSns),
// ADMITTED (its sn copied into a real topic's sourceSns by reviewAdmit). The review topic itself is
// kept as the audit record — the search query, every candidate's fate, and the recipe used.
import { admitWebSource, htmlToText } from '../../../organs/ingest/index.js';
import { researchReview } from '../research-review-corpus.js';
import { FULL_TEXT } from './net.js';
import { nowIso } from './util.js';

export const installResearchReview = (appCtx) => {
  const { client, emit, logIt, state } = appCtx;

  // reviewFetchOne(item, query, signal) → fetch + admit ONE discovered hit into the S-registry,
  // joined to whichever topic is currently active. The caller is responsible for making the review
  // topic active first — mirrors ingest.js's recordHit, but never wrapped in its own runCancellable
  // so a caller can fetch many in sequence under ONE cancellable op (nesting runCancellable would
  // have the inner call's `finally` clear the outer op's busy state and abort controller).
  const reviewFetchOne = async (item, query, signal) => {
    const full = FULL_TEXT[item.source] || FULL_TEXT[item.kind];
    let text = '';
    try { text = full ? await full(client, item) : htmlToText((await client.fetchUrl(item.url, { signal })).text); }
    catch (e) { if (signal?.aborted) throw e; }
    if (!text) text = item.text || item.title || '';
    if (!String(text).trim()) return null;
    const { doc, record } = admitWebSource({
      url: item.url, title: item.title, text, retrieval_query: query,
      engine: `web:${item.source || item.kind || 'search'}`, fetched_at: nowIso(),
    });
    return appCtx.addSource({ title: item.title, url: item.url, text: doc.text, kind: 'web', record, doc });
  };

  // reviewStart(query, { discoverK, reviewK }) → opens a dedicated REVIEW topic, discovers
  // candidates (client.search, undressed — the same primitive search() wraps), fetches+admits the
  // first `reviewK` into it (Reviewed), and keeps the rest as Discovered-only stubs on the topic's
  // review record for the reader to pull in on demand (reviewMore).
  const reviewStart = (rawQuery, { discoverK = 14, reviewK = 8 } = {}) =>
    appCtx.runCancellable({ kind: 'review', label: `Researching — ${String(rawQuery || '').trim()}` }, async (signal) => {
      const query = String(rawQuery || '').trim();
      if (!query) return null;
      const prevActive = state.activeTopicId;
      const t = appCtx.topicNew(query, { workspaceId: state.activeWorkspaceId });
      t.kind = 'review'; t.query = query; t.named = true;
      t.review = {
        query, discovered: [], excludedSns: [], recipe: 'balanced', createdAt: nowIso(),
        admittedAt: null, targetTopicId: null, admittedSns: [],
      };
      const jid = appCtx.beginJob({ kind: 'review', query, topicId: t.id });
      try {
        const items = await client.search(query, { kind: 'auto', k: discoverK, signal });
        const toReview = items.slice(0, reviewK);
        t.review.discovered = items.slice(reviewK).map((it) => ({
          title: it.title, url: it.url, source: it.source, kind: it.kind, excerpt: it.excerpt || it.summary || '',
        }));
        for (const item of toReview) {
          try { await reviewFetchOne(item, query, signal); } catch (e) { if (signal.aborted) throw e; /* one bad page, keep going */ }
        }
        appCtx.settleJob(jid, 'done');
      } catch (e) {
        appCtx.settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90));
        if (!t.sourceSns.length) { appCtx.topicDelete(t.id); if (prevActive && appCtx.topicById(prevActive)) appCtx.setTopic(prevActive); }
        throw e;
      }
      // Nothing came back at all — discovered nothing AND reviewed nothing. Don't strand an empty
      // review topic in the sidebar (the same discipline searchTopic already held): drop it and
      // let the reader retry with different words, rather than open a modal with nothing in it.
      if (!t.sourceSns.length && !t.review.discovered.length) {
        appCtx.topicDelete(t.id);
        if (prevActive && appCtx.topicById(prevActive)) appCtx.setTopic(prevActive);
        logIt('review', `Research Review "${query}"`, 'nothing found');
        appCtx.persist(); emit('topics');
        return null;
      }
      logIt('review', `Research Review "${query}"`, `${t.sourceSns.length} reviewed · ${t.review.discovered.length} discovered`);
      appCtx.persist(); emit('topics'); emit('sources');
      return t;
    });

  // reviewMore(topicId, n) → pull the next `n` discovered-only stubs into Reviewed.
  const reviewMore = (topicId, n = 6) =>
    appCtx.runCancellable({ kind: 'review', label: 'Reviewing more candidates…' }, async (signal) => {
      const t = appCtx.topicById(topicId); if (!t || !t.review) return 0;
      if (state.activeTopicId !== topicId) appCtx.setTopic(topicId);
      const batch = t.review.discovered.slice(0, n);
      t.review.discovered = t.review.discovered.slice(n);
      let count = 0;
      for (const item of batch) {
        try { if (await reviewFetchOne(item, t.review.query, signal)) count++; } catch (e) { if (signal.aborted) throw e; }
      }
      appCtx.persist(); emit('topics'); emit('sources');
      return count;
    });

  // reviewAddUrl / reviewImportFile — the drawer's manual-add paths. Both delegate to the existing
  // ingest primitives (Gutenberg/YouTube/generic URL, and the file-import pipeline), the only new
  // behavior being that the review topic is made active first, so the landed source is Reviewed —
  // in the S-registry, not yet in any other topic — exactly like a fetched search hit.
  const reviewAddUrl = (topicId, url) => {
    const t = appCtx.topicById(topicId); if (!t) return Promise.resolve(null);
    if (state.activeTopicId !== topicId) appCtx.setTopic(topicId);
    return appCtx.ingestUrl(url);
  };
  const reviewImportFile = (topicId, file) => {
    const t = appCtx.topicById(topicId); if (!t) return Promise.resolve(null);
    if (state.activeTopicId !== topicId) appCtx.setTopic(topicId);
    return appCtx.ingestFile(file);
  };

  // reviewToggleExclude(topicId, sn) → the source-toggle checkbox: recomputes the working
  // selection, not the record — excludedSns is the only thing this writes.
  const reviewToggleExclude = (topicId, sn) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return;
    const ex = new Set(t.review.excludedSns);
    if (ex.has(sn)) ex.delete(sn); else ex.add(sn);
    t.review.excludedSns = [...ex]; t.review.recipe = 'custom';
    appCtx.persist(); emit('topics');
  };

  // reviewApplyRecipe(topicId, key) → set the working selection FROM a named recipe
  // (research-review-corpus.js corpusRecipes) — every non-kept source becomes excluded.
  const reviewApplyRecipe = (topicId, key) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return;
    const view = reviewCompute(topicId); if (!view || !view.recipes[key]) return;
    const keep = new Set(view.recipes[key].sns);
    t.review.excludedSns = t.sourceSns.filter((sn) => !keep.has(sn));
    t.review.recipe = key;
    appCtx.persist(); emit('topics');
  };

  // reviewAdmit(topicId, { targetTopicId, newTitle, selectedSns }) → the explicit admission act.
  // Copies the selected (non-excluded) sns into a real topic's sourceSns (a source may belong to
  // many topics — addSource's existing multi-topic discipline) and STAMPS the review topic with
  // what happened, so it stays the auditable provenance record (docs/research-review.md §11): the
  // review topic itself is never deleted on admission.
  const reviewAdmit = (topicId, { targetTopicId = null, newTitle = null, selectedSns = null } = {}) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return null;
    const excluded = new Set(t.review.excludedSns || []);
    const sns = selectedSns || t.sourceSns.filter((sn) => !excluded.has(sn));
    if (!sns.length) return null;
    let target = targetTopicId ? appCtx.topicById(targetTopicId) : null;
    if (!target) target = appCtx.topicNew(newTitle || t.review.query || t.title, { workspaceId: t.workspaceId });
    for (const sn of sns) if (!target.sourceSns.includes(sn)) target.sourceSns.push(sn);
    appCtx.topicAutoName(target, { silent: true });
    t.review.admittedAt = nowIso(); t.review.targetTopicId = target.id; t.review.admittedSns = sns.slice();
    appCtx.setTopic(target.id);
    logIt('admit', `Added ${sns.length} source${sns.length === 1 ? '' : 's'} to "${target.title}"`, target.title);
    appCtx.persist(); emit('topics'); emit('sources');
    return target;
  };

  // reviewCompute(topicId) → the whole computed screen (research-review-corpus.js researchReview),
  // scoped to this review topic's reviewed candidates. entities()/comparisonMatrix() read the
  // ACTIVE topic, so this makes the review topic active first if it drifted (e.g. the sidebar was
  // clicked elsewhere while the panel stayed open) — a read, not a navigation the reader asked for.
  const reviewCompute = (topicId) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return null;
    if (state.activeTopicId !== topicId) appCtx.setTopic(topicId);
    const rows = appCtx.topicSources().map((s) => ({
      sn: s.sn, title: s.title, domain: s.domain, url: s.url, kind: s.kind, retrieved: s.retrieved, text: s.text || '',
    }));
    let entities = [], matrix = null;
    try { entities = appCtx.entities({ merge: true, level: 'names' }) || []; } catch { entities = []; }
    try { matrix = appCtx.comparisonMatrix(); } catch { matrix = null; }
    const view = researchReview({ rows, entities, matrix, query: t.review.query });
    return { ...view, topic: t, excludedSns: new Set(t.review.excludedSns || []), discovered: t.review.discovered || [] };
  };

  Object.assign(appCtx, {
    reviewStart, reviewMore, reviewAddUrl, reviewImportFile,
    reviewToggleExclude, reviewApplyRecipe, reviewAdmit, reviewCompute,
  });
};
