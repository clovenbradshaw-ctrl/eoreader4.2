// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// SEARCH — the sibling of ask()
import { parseText } from '../../../perceiver/parse/index.js';
import { searchAndAdmit } from '../../../organs/ingest/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { createSpeculativeWeb } from '../../../turn/index.js';
import { shaShort } from './util.js';

export const installSearch = (appCtx) => {
  const { client, emit, logIt, state } = appCtx;
  // Speculative web prefetch (docs/web-search.md — the quarantine discipline). `search` is the
  // SAME fetch+admit primitive fillSearchTopic runs on Enter, so a warmed entry is byte-identical
  // to a live one; store/rawStore stay null, so priming touches the network and builds records but
  // NEVER mutates the topic graph — that only happens when a take() feeds addSource below.
  const specWeb = createSpeculativeWeb({
    search: (query, opts = {}) => searchAndAdmit(query, { client, ...opts }),
  });
  // specPrime(text) — warm the web for the in-progress query, gated to web mode `auto` (standing
  // authorization). The UI calls this behind a typing-settled debounce, never on every keystroke.
  const specPrime = (text) => {
    if (appCtx.webMode && appCtx.webMode() !== 'auto') return null;
    return specWeb.prime(text, { k: 3, kind: 'auto', fetchPages: true });
  };
  // Drop the quarantine (e.g. web mode leaves `auto`): warmed-but-unused fetches author nothing.
  const specClear = () => specWeb.clear();
  // ── SEARCH — the sibling of ask() ──────────────────────────────────────────
  // ask() answers a question over the record; searchTopic() does the opposite motion — it GROWS
  // the record. A query typed in the search box is not answered: we open a dedicated "search
  // topic" on the left, named for the query, and pull the top salient web sources straight into
  // it. No results popup, no model. This is the deliberately thin version — the seams for the
  // full chat/search/parse pipeline are left OPEN, not wired:
  //   • formulateSearch — where a query PLANNER ("figure out the best way to search it": pick the
  //     source, rephrase, decompose) will sit. Today it is the identity.
  //   • topic.kind='search' / topic.query — a tag the sidebar and a future re-run/refine can read.
  //   • fetchPages+admit is the SAME primitive the chat's web loop stands on, so when the planner
  //     and parse steps land they slot in around this call rather than replacing it.
  const formulateSearch = (raw) => String(raw || '').trim();   // SEAM: query planning plugs in here

  // Pull the top salient web sources for `query` INTO an existing search topic `t`. Extracted so
  // both the first run and a resume (after a reload interrupted the search) fill the SAME topic —
  // addSource dedups by content hash, so re-running against a half-filled topic just tops it up.
  const fillSearchTopic = async (t, query, k, signal) => {
    let count = 0, first = null;
    // Take the speculative prefetch first — if the user's typing warmed this exact (normalized)
    // query, its admitted docs are already here and we skip the round-trip. A miss (or a query the
    // prefetch never saw) falls back to a live fetch. Same shape either way, so the admit loop below
    // is unchanged. This is the ONLY place a quarantined fetch hardens into a real source.
    const admitted = (await specWeb.take(query)) || await searchAndAdmit(query, { client, k, kind: 'auto', fetchPages: true, signal });
    for (const a of admitted || []) {
      if (!a?.doc || !a?.record) continue;
      try {
        const s = appCtx.addSource({
          title: a.record.title || a.item?.title, url: a.record.url || a.item?.url || null,
          text: a.doc.text, kind: 'web', record: a.record, doc: a.doc,
        });
        // addSource files a NEW source into the active (search) topic itself, but a hit that was
        // already recorded elsewhere returns as a dedup WITHOUT joining this topic — link it
        // explicitly so the search topic always contains the results it pulled (a source may
        // belong to many topics). Idempotent for the fresh sources addSource already added.
        if (s) { if (!t.sourceSns.includes(s.sn)) t.sourceSns.push(s.sn); count++; first = first || s; }
      } catch { /* empty page or dup — skip, keep pulling the next salient hit */ }
    }
    return { count, first };
  };

  const searchTopic = (raw, { k = 3 } = {}) =>
    appCtx.runCancellable({ kind: 'search', label: `Searching the web — ${String(raw || '').trim()}` }, async (signal) => {
      const rawQuery = String(raw || '').trim();
      if (!rawQuery) return { topic: null, count: 0, first: null };
      const query = formulateSearch(rawQuery);
      // Open the search topic FIRST and make it active, so every admitted source nests under it
      // (addSource files into the current topic). Tagged as search-origin for later refine/re-run.
      // Remember where we were, so a fruitless search can fall back rather than strand the reader.
      const prevActive = state.activeTopicId;
      const t = appCtx.topicNew(rawQuery, { workspaceId: state.activeWorkspaceId });
      t.kind = 'search'; t.query = rawQuery; t.searchQuery = query; t.named = true;
      // A durable job keyed to THIS search topic: a reload while the search is still fetching resumes
      // it into the same topic (fillSearchTopic re-runs the admit; dedup keeps it idempotent).
      const jid = appCtx.beginJob({ kind: 'search', query, k, topicId: t.id });
      let count = 0, first = null;
      try {
        ({ count, first } = await fillSearchTopic(t, query, k, signal));
        appCtx.settleJob(jid, 'done');
      } catch (e) {
        appCtx.settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90));
        // Tidy an empty search topic (nothing landed before the error/Stop), then re-throw. Guard on
        // the topic's OWN sources, not `count` — a mid-loop throw may have filed some before failing;
        // those keep the topic (matching the pre-refactor finally, which counted inside the loop).
        if (!t.sourceSns.length) { appCtx.topicDelete(t.id); if (prevActive && appCtx.topicById(prevActive)) appCtx.setTopic(prevActive); }
        throw e;
      }
      // Nothing landed — empty result or a Stop before the first hit. Don't strand an empty search
      // topic in the sidebar: drop it and return the reader to where they were.
      if (!count) {
        appCtx.topicDelete(t.id);
        if (prevActive && appCtx.topicById(prevActive)) appCtx.setTopic(prevActive);
        logIt('search', `Search "${rawQuery}"`, 'no sources'); return { topic: null, count: 0, first: null };
      }
      logIt('search', `Search topic "${rawQuery}"`, `${count} source${count === 1 ? '' : 's'}`);
      appCtx.persist(); emit('topics'); emit('sources');
      return { topic: t, count, first };
    });

  const ingestText = (text, title = 'Pasted text') => {
    // unnamedReferents: true — the reader's ordinary reading (see registry.js#docFor); a nameless
    // recurring figure ("the creature") reaches the Source Index instead of vanishing.
    const doc = parseText(String(text), { docId: `doc-${shaShort(webContentHash(text))}`, unnamedReferents: true });
    return appCtx.addSource({ title, text: String(text), kind: 'text', doc });
  };

  Object.assign(appCtx, { fillSearchTopic, ingestText, searchTopic, specPrime, specClear });
};
