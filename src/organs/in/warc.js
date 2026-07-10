// EO: NUL·SIG(Void → Entity, Clearing,Tending) — WARC adapter — frozen archived source
// The WARC adapter — the archived record as the addressable source.
//
// This is the ingest most aligned with the archive.org chain architecture: rather
// than re-fetching a civic page live (which drifts, rots, or 404s the moment a claim
// rests on it), ingest from a WARC (Web ARChive) and treat the WARC RECORD ITSELF as
// the addressable source object. The record is frozen — its `WARC-Record-ID`, its
// `WARC-Date`, its `WARC-Target-URI`, and a content hash over the payload pin exactly
// what was seen and when. A claim cites the record; the veto re-checks it against a
// byte for byte that cannot change under it.
//
// The caller iterates the WARC with warcio.js (read or write) and passes decoded
// records in; nothing is bundled. This adapter mints the frozen source descriptors
// and routes a chosen record's payload to the right sense organ — an HTML response
// through the web-page adapter, so a WARC'd page reads identically to a live scrape,
// only stable. It reuses the sourcing layer's content hash so a WARC source and a
// live web source share one provenance shape (src/ingest/websource.js).

import { webContentHash, recordIdOf } from '../ingest/websource.js';
import { ingestWebpage }              from './webpage.js';

const textOf = (rec) => {
  if (typeof rec.text === 'string') return rec.text;
  if (typeof rec.payload === 'string') return rec.payload;
  if (rec.payload && typeof rec.payload === 'object' && 'body' in rec.payload) return String(rec.payload.body ?? '');
  return '';
};
const isResponse = (rec) => !rec.warcType || /response|resource|conversion/i.test(rec.warcType);
const contentType = (rec) => String(rec.contentType || rec.httpHeaders?.['content-type'] || rec.httpHeaders?.['Content-Type'] || '');

// records: [{ warcType, targetURI, date, recordId?, contentType?, text?|payload?, httpHeaders? }]
// Returns frozen source descriptors — each the addressable, hashable thing a claim cites.
export const readWarc = (records = []) => records.filter(isResponse).map((rec, i) => {
  const body = textOf(rec);
  const hash = webContentHash(body);
  return Object.freeze({
    kind: 'warc-record/1',
    index: i,
    warcRecordId: rec.recordId || null,
    sourceId: recordIdOf(hash),               // shared shape with a live web source
    contentHash: hash,
    url: rec.targetURI || rec.url || null,
    date: rec.date || rec.warcDate || null,
    contentType: contentType(rec),
    length: body.length,
    body,
  });
});

// Ingest a single WARC source descriptor (or raw record) onto the spine. HTML/text
// responses route through the web-page adapter; the frozen provenance rides along so
// the resulting doc knows exactly which archived record it came from.
export const ingestWarc = (recordOrSource = {}, opts = {}) => {
  const src = recordOrSource.sourceId ? recordOrSource : readWarc([recordOrSource])[0];
  if (!src) return null;
  const body = src.body;
  // Convert the caller has already run (Readability+Turndown, or plain text). Prefer
  // supplied markdown; otherwise treat HTML/text body as the content to shape.
  const markdown = opts.markdown ?? (/html/i.test(src.contentType) && opts.stripHtml ? opts.stripHtml(body) : body);
  const doc = ingestWebpage({
    name: src.url || src.sourceId,
    url: src.url,
    title: opts.title,
    markdown,
    metadata: { url: src.url, date: src.date, archived: true },
  });
  doc.modality = 'warc';
  doc.provenance = { sourceId: src.sourceId, contentHash: src.contentHash, warcRecordId: src.warcRecordId, url: src.url, date: src.date, contentType: src.contentType };
  return doc;
};
