// EO — feed-specific reader ingest helpers. Keeps app/ingest.js under the section size ratchet.
import { fetchFeed, isFeed } from '../../../organs/ingest/index.js';
import { nowIso, domainOf } from './util.js';

export const addFeedSource = (appCtx, feed, url) => {
  if (!feed?.admitted?.doc || !feed?.admitted?.record) return null;
  return appCtx.addSource({
    title: feed.admitted.record.title, url: feed.admitted.record.url || url,
    text: feed.admitted.doc.text, kind: 'feed', record: feed.admitted.record, doc: feed.admitted.doc,
    feed: { meta: feed.meta, pointers: feed.pointers || [] },
  });
};

export const fetchFeedSource = async (appCtx, url, { client, signal, raw = null } = {}) => {
  const bound = { ...client, fetchUrl: (u, o = {}) => client.fetchUrl(u, { signal, ...o }) };
  const feedClient = raw == null ? bound : { ...bound, fetchUrl: async () => ({ text: raw }) };
  const feed = await fetchFeed(url, { client: feedClient, admit: true, fetched_at: nowIso() });
  return addFeedSource(appCtx, feed, url);
};

export const ingestFeed = (appCtx, url) => {
  const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return appCtx.runCancellable({ kind: 'fetch', label: `Reading feed ${domainOf(norm)}…` },
    (signal) => fetchFeedSource(appCtx, norm, { client: appCtx.client, signal }));
};

export { isFeed };
