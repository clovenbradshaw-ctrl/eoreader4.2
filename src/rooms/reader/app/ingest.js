// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// ingest: URL / search / file / paste
import { htmlToText, searchAndAdmit } from '../../../organs/ingest/index.js';
import { admitWebSource } from '../../../organs/ingest/index.js';
import { fetchGithubRepo } from '../../../organs/ingest/index.js';
import { fetchGutenbergBook, gutenbergIdOf } from '../../../organs/ingest/index.js';
import { fetchYoutubeTranscript, youtubeIdOf } from '../../../organs/ingest/index.js';
import { LIBRARIES, surfaceCard } from '../../../organs/ingest/index.js';
import { FULL_TEXT } from './net.js';
import { nowIso, domainOf } from './util.js';
import { fetchFeedSource, ingestFeed as runIngestFeed, isFeed } from './feed.js';

export const installIngest = (appCtx) => {
  const { client, emit, logIt, state } = appCtx;
  // ── ingest: URL / search / file / paste ───────────────────────────────────
  // The two cancellable-op controllers, declared here (not just in the chat section) so `stop()`
  // reaches ANY long op, not only a chat turn — that is what makes the Stop button universal. A chat
  // turn owns `abort` + its `stallGuard` (armed in ask/answerFromWeb, below); every OTHER long op —
  // a URL fetch, a web search, a page/file import — owns `opAbort`, armed through `runCancellable`.
  // Kept separate so an ingest started over the top of a live turn can't clobber the turn's signal
  // (and vice-versa); `stop()` trips whichever are in flight.
  // (abort lives on ctx — the newest turn's controller; chat arms it, runOp shares it)
  // (stallGuard lives on ctx — armed beside abort)
  appCtx.opAbort = null;
  const setBusy = (busy) => { state.busy = busy; emit('busy'); };

  // runCancellable(busy, fn) — the seam that makes Stop universal for the non-turn ops. It arms a
  // fresh abort the Stop button can trip (via `stop()`), shows the busy label, hands `fn` the signal
  // to thread into the actual fetch (so a hung proxy is cut loose, not just the chat turn), and
  // clears busy + abort when it settles. Every guard is gated on THIS op still being the current one,
  // so a `stop()` — or a second op started over the top — can never have the loser's finally clear
  // the winner's state. `fn(signal, progress)`: `progress(busy)` re-labels the pill mid-op (a
  // multi-step file import), itself gated so a superseded op can't repaint the pill after it lost.
  const runCancellable = async (busy, fn) => {
    const ac = new AbortController();
    appCtx.opAbort = ac;
    setBusy(busy);
    try {
      return await fn(ac.signal, (next) => { if (appCtx.opAbort === ac) setBusy(next); });
    } finally {
      if (appCtx.opAbort === ac) { appCtx.opAbort = null; setBusy(null); }
    }
  };

  const ingestUrl = (url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Reading ${domainOf(norm)}…` }, async (signal) => {
      // Open a durable job FIRST — a reload while the proxy is still fetching picks the URL back up
      // (a re-fetch dedups by content hash, so a page that actually landed is a no-op on resume).
      const jid = appCtx.beginJob({ kind: 'url', url: norm });
      // A URL that names a WHOLE THING rather than a generic page — a Gutenberg book, a YouTube
      // video's captions — is read by its own deliberate fetcher and admitted straight away.
      // Gutenberg falls through to the generic page path below when the id can't be recovered (a
      // Gutenberg URL is still a normal readable page either way); YouTube does NOT — the raw watch
      // page is near-entirely JS-hydrated chrome, so a video whose captions can't be pulled reports
      // the real reason instead of admitting a broken, unplayable "video" source.
      const bound = { ...client, fetchUrl: (u, o = {}) => client.fetchUrl(u, { signal, ...o }) };
      const admitWhole = (admitted) => {
        if (!admitted?.doc || !admitted?.record) return null;
        const src = appCtx.addSource({
          title: admitted.record.title, url: admitted.record.url || norm,
          text: admitted.doc.text, kind: 'web', record: admitted.record, doc: admitted.doc,
        });
        appCtx.settleJob(jid, 'done');
        return src;
      };
      try {
        if (gutenbergIdOf(norm) != null) {
          const src = admitWhole(await fetchGutenbergBook(norm, { client: bound, fetched_at: nowIso() }));
          if (src) return src;
        }
        if (youtubeIdOf(norm) != null) {
          const src = admitWhole(await fetchYoutubeTranscript(norm, { client: bound, fetched_at: nowIso() }));
          if (src) return src;
          throw new Error('No captions available for this video — YouTube may not have any, or is briefly blocking the fetch. Try again shortly.');
        }
        const feedSrc = await fetchFeedSource(appCtx, norm, { client, signal });
        if (feedSrc) { appCtx.settleJob(jid, 'done'); return feedSrc; }
        const raw = (await client.fetchUrl(norm, { signal })).text;
        if (isFeed(raw)) {
          const src = await fetchFeedSource(appCtx, norm, { client, signal, raw });
          if (src) { appCtx.settleJob(jid, 'done'); return src; }
        }
        const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
        const text = htmlToText(raw);
        const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
        const src = appCtx.addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc });
        appCtx.settleJob(jid, 'done');
        return src;
      } catch (e) {
        appCtx.settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90));
        throw e;
      }
    });
  };

  const dress = (items) => (items || []).map((it) => ({ ...it, surface: surfaceCard(it) }));

  const search = (query, { kind = 'auto', k = 8 } = {}) =>
    runCancellable({ kind: 'search', label: `Searching the web — ${query}` }, async (signal) => {
      const items = await client.search(query, { kind, k, signal });
      logIt('search', `Web search "${query}"`, `${items.length} results`);
      return dress(items);
    });

  const searchLibrary = (libId, query, { k = 12 } = {}) => {
    const lib = LIBRARIES[libId];
    return search(query, { kind: lib ? lib.kind : 'auto', k });
  };

  // ingestRepo(ref) → the deliberate "ingest all code" path: pull a repo's source through the code
  // organ and admit the whole codebase as one reading + register it. Mirrors webSearchAdmit's
  // addSource wiring so the codebase lands in the S-registry like any source.
  const ingestRepo = (ref, opts = {}) =>
    runCancellable({ kind: 'fetch', label: `Ingesting ${ref}…` }, async (signal) => {
      // A signal-bound view of the client so a Stop cancels the in-flight tree/blob fetches.
      const bound = { ...client, fetchUrl: (u, o = {}) => client.fetchUrl(u, { signal, ...o }) };
      const res = await fetchGithubRepo(ref, { ...opts, client: bound });
      if (!res?.doc || !res?.record) return null;
      try {
        return appCtx.addSource({
          title: res.record.title, url: res.record.url || null,
          text: res.doc.text, kind: 'web', record: res.record, doc: res.doc,
        });
      } catch { return null; /* dup — the codebase still read */ }
    });

  const ingestFeed = (url) => runIngestFeed(appCtx, url);

  const recordHit = (item, query = null) =>
    runCancellable({ kind: 'fetch', label: `Reading ${item.title || item.url}…` }, async (signal) => {
      const full = FULL_TEXT[item.source] || FULL_TEXT[item.kind];
      let text = '';
      try { text = full ? await full(client, item) : htmlToText((await client.fetchUrl(item.url, { signal })).text); } catch (e) { if (signal.aborted) throw e; /* else fall through */ }
      if (!text) text = item.text || item.title || '';
      const { doc, record } = admitWebSource({
        url: item.url, title: item.title, text,
        retrieval_query: query, engine: `web:${item.source || item.kind || 'search'}`, fetched_at: nowIso(),
      });
      return appCtx.addSource({ title: item.title, url: item.url, text: doc.text, kind: 'web', record, doc });
    });

  // The page's own HTML, fetched through the same proxy chain ingest uses — for the source
  // viewer's native "Native" tab, which renders the REAL website (sanitized + sandboxed by the
  // surface) rather than the reduced text. Browser only; in Node (no fetch) client.fetchUrl
  // throws, which the surface catches into the tab's error state.
  const fetchPage = (url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Loading ${domainOf(norm)}…` }, async (signal) => {
      const res = await client.fetchUrl(norm, { signal });
      // Report the REAL page URL, never `res.url`: fetchUrl goes through the feed proxy, so
      // res.url is the proxied `…/feed?url=…` address. The Native tab feeds this straight into
      // the render's injected <base href>, and a proxy base makes every relative stylesheet/
      // image (/w/load.php, /static/…) resolve against the proxy host — a blank, image-broken
      // page. `norm` is the site's own URL, so its assets resolve against the site. (4.1 based
      // the native render on the page URL for exactly this reason.)
      return { html: res.text || '', url: norm, ok: res.ok !== false };
    });
  };

  // Following a link INSIDE a source's native view: fetch the target page once, render it in place
  // (the raw HTML rides back for the Native iframe), AND record it as a SUB-OBJECT of `parentSn` —
  // one site stays one source, every page you click through logged beneath it (dedup keeps a
  // re-visit a no-op on the registry). Returns { html, url, childSn } — childSn null if the page had
  // no readable text (nothing to record) or admission failed; the page still renders either way.
  const navigatePage = (parentSn, url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Loading ${domainOf(norm)}…` }, async (signal) => {
      const res = await client.fetchUrl(norm, { signal });
      const raw = res.text || '';
      const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
      let childSn = null;
      try {
        const text = htmlToText(raw);
        if (text && text.trim()) {
          const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
          const child = appCtx.addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc, parentSn });
          childSn = child.sn;
        }
      } catch { /* un-admittable (empty/dup-of-parent) — still render the page */ }
      // Report the site's own URL for the iframe <base href> (not the proxied res.url), same as
      // fetchPage — so the rendered page's relative assets resolve against the real site.
      return { html: raw, url: norm, childSn, ok: res.ok !== false };
    });
  };

  // Fold / unfold a source's sub-objects in the sidebar (persisted with the source).
  const sourceToggleCollapse = (id) => {
    const s = appCtx.sourceBySn(id); if (!s) return;
    s.collapsed = !s.collapsed; appCtx.persist(); emit('sources');
  };

  // webSearchAdmit(query, opts) → the fetch+admit primitive the turn's web loop consumes.
  // Search a source (or auto-route), pull each hit's FULL page through the proxy chain
  // (fetchPages), admit it as a frozen web source (websource.js), AND register it in the
  // S-registry so its cited spans resolve to a real chip and it persists with the topic —
  // a fetched page becoming "a normal prose source that joins the answer scope"
  // (docs/web-search.md). Returns the admitted [{ item, doc, record }] for the turn to
  // stand on; addSource dedupes by content hash and never overwrites, so re-fetching the
  // same page is a no-op on the registry while the doc still rides the turn.
  const webSearchAdmit = async (query, opts = {}) => {
    // `register: false` — fetch+admit+return the pages for GROUNDING, but do NOT save them as sources.
    // The multi-hop curiosity walk passes this so a page it fetches while chasing a lead is read, yet
    // only saved if the walk KEEPS it on topic (via onKeep → saveWalkDoc). Single-shot paths
    // (verify/corroborate/follow-up) leave it true and save every admitted page, as before.
    const { register = true, ...searchOpts } = opts;
    // Each fetched+admitted page re-arms the no-progress watchdog: a hop pulling five full pages
    // through the proxy is slow but ALIVE, and without this beat the 45s stall guard was aborting
    // the whole turn mid-walk ("the web lookup stalled"). onAdmit is set AFTER the spread so the
    // stall feed always runs — the caller still tunes k/kind/fetchPages, but can't drop the beat.
    const admitted = await searchAndAdmit(query, {
      client, k: 5, kind: 'auto', fetchPages: true, ...searchOpts, onAdmit: () => appCtx.stallGuard?.feed() });
    if (register) for (const a of admitted || []) {
      if (!a?.doc || !a?.record) continue;
      try {
        appCtx.addSource({
          title: a.record.title || a.item?.title, url: a.record.url || a.item?.url || null,
          text: a.doc.text, kind: 'web', record: a.record, doc: a.doc,
        });
      } catch { /* empty page or dup — the doc still grounds the turn */ }
    }
    return admitted || [];
  };

  // saveWalkDoc(doc) — record ONE page the curiosity walk kept on topic. The gated sibling of
  // webSearchAdmit's eager save: the walk fetches with `register:false` (nothing saved at fetch
  // time), then hands back each KEPT hop's docs through onKeep, and only those land as sources. So a
  // strayed namesake page (Louis Armstrong under a Neil Armstrong ask) is read for grounding but
  // never fills the sidebar. Dedup, persistence and the EoT read are addSource's, unchanged.
  const saveWalkDoc = (doc) => {
    if (!doc || !doc.text) return;
    try {
      appCtx.addSource({
        title: doc.web?.title || doc.title || null,
        url: doc.web?.url || doc.web?.final_url || null,
        text: doc.text, kind: 'web', doc,
        record: doc.web?.content_hash ? { content_hash: doc.web.content_hash, title: doc.web.title, url: doc.web.url } : null,
      });
    } catch { /* empty page or dup — the doc still grounded the turn */ }
  };

  // The meaning embedder for the walk's relevance leash: MiniLM when it is warm, else null (the walk
  // falls back to the token-space leash, offline-safe). With it, a hop's page is scored for MEANING
  // against the topic, so a same-surname namesake reads as off-topic despite the shared word — the
  // Louis-vs-Neil separation the bag-of-words frame could never make (drops the off-topic sources).
  const walkEmbed = () => (appCtx.minilm?.isWarm?.() ? (t) => appCtx.minilm.embed(t) : null);

  Object.assign(appCtx, { fetchPage, ingestFeed, ingestRepo, ingestUrl, navigatePage, recordHit, runCancellable, saveWalkDoc, search, searchLibrary, setBusy, sourceToggleCollapse, walkEmbed, webSearchAdmit });
};
