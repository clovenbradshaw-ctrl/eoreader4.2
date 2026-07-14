// EO: INS·SIG·CON(Void,Field → Entity,Link, Making,Binding) — archive-pin: source permanence
// archive/pin.js — permanence: archive-pinned sources, evidence embedded
// (docs/deep-research-log.md).
//
// Before a source is read, resolve it to (or create) a dated web.archive.org
// snapshot and record its id + capture timestamp + content hash. Cite THAT,
// with a span anchor — a stored character offset into the snapshot, rendered as
// a #:~:text= fragment for convenience. The offset is the robust key; the
// fragment is the affordance. The source cannot move under the citation. And
// the extractive span is EMBEDDED in the report, not merely linked: if
// archive.org is unreachable the exact bytes the claim rests on are still in
// the artifact, and the link is corroboration, not the sole record.
//
// Everything here is injectable and offline-safe: `fetch` and `now` come in as
// options (tests inject fakes; the browser passes the real ones), and every
// failure degrades to a LOCAL pin — the content hash and capture time still
// stand, `snapshotUrl` is simply null. A pin never throws; permanence degrades,
// provenance does not.

import { webContentHash } from '../../organs/ingest/index.js';

const AVAILABLE = 'https://archive.org/wayback/available?url=';
const SAVE = 'https://web.archive.org/save/';

// The #:~:text= scroll-to-text fragment for a span. Long spans anchor on their
// first and last few words (the textStart,textEnd form) so the fragment stays
// short while still selecting the whole span. Pure string work.
export const spanFragment = (text) => {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D');
  const words = t.split(' ');
  if (words.length <= 8) return `#:~:text=${enc(t)}`;
  return `#:~:text=${enc(words.slice(0, 4).join(' '))},${enc(words.slice(-4).join(' '))}`;
};

// The clickable anchor for a span at a pin: the snapshot URL (or the live URL
// when unpinned) plus the text fragment. The character offsets stored on the
// span remain the robust key — this is only the affordance.
export const spanAnchor = (pin, span) => {
  const base = pin?.snapshotUrl || pin?.url || '';
  return base ? base + spanFragment(span?.text) : '';
};

// Parse a wayback availability response into { snapshotUrl, snapshotId, capturedAt }.
const closestOf = (json) => {
  const c = json?.archived_snapshots?.closest;
  if (!c?.available || !c?.url) return null;
  return {
    snapshotUrl: String(c.url).replace(/^http:/, 'https:'),
    snapshotId: c.timestamp || null,
    capturedAt: c.timestamp ? waybackIso(c.timestamp) : null,
  };
};

const waybackIso = (ts) => {
  const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
};

// Resolve a URL to a dated archive.org snapshot: try the availability API for
// an existing capture; if none and `save` is allowed, request a fresh one (the
// Save Page Now redirect names the new snapshot). Returns a plain record —
// never throws; on any failure the record is { pinned:false, reason }.
export const resolveArchivePin = async (url, { fetch: f = null, save = true, timeoutMs = 12_000 } = {}) => {
  if (!url || !f) return { pinned: false, reason: f ? 'no-url' : 'offline' };
  const guarded = async (u, opts) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try { return await f(u, { ...(opts || {}), ...(ctl ? { signal: ctl.signal } : {}) }); }
    finally { if (timer) clearTimeout(timer); }
  };
  try {
    const r = await guarded(AVAILABLE + encodeURIComponent(url));
    if (r?.ok) {
      const hit = closestOf(await r.json());
      if (hit) return { pinned: true, created: false, ...hit };
    }
  } catch { /* fall through to save */ }
  if (save) {
    try {
      const r = await guarded(SAVE + url, { method: 'GET', redirect: 'follow' });
      const landed = r?.url || '';
      const m = landed.match(/web\.archive\.org\/web\/(\d{4,14})/);
      if (r?.ok && m) {
        return {
          pinned: true, created: true,
          snapshotUrl: landed, snapshotId: m[1], capturedAt: waybackIso(m[1].padEnd(14, '0')),
        };
      }
    } catch { /* degrade below */ }
  }
  return { pinned: false, reason: 'unreachable' };
};

// Build the full pin payload for a source: the archive resolution (when a URL
// and a fetch are available) plus the LOCAL guarantees that never degrade —
// the content hash of the exact text the spans index into, and a capture time
// from the injected clock. This is what pinSource (research/events.js) records.
export const pinPayload = async ({ url = null, title = null, text = '', fetch: f = null, save = true, now = null } = {}) => {
  const resolved = url ? await resolveArchivePin(url, { fetch: f, save }) : { pinned: false, reason: 'no-url' };
  return {
    url, title,
    snapshotUrl: resolved.pinned ? resolved.snapshotUrl : null,
    snapshotId: resolved.pinned ? resolved.snapshotId : null,
    capturedAt: resolved.pinned && resolved.capturedAt ? resolved.capturedAt
      : (typeof now === 'function' ? new Date(now()).toISOString() : null),
    contentHash: webContentHash(text),
    chars: String(text || '').length,
    pinned: !!resolved.pinned,
  };
};

// Locate a span's character offsets for a sentence inside the pinned text —
// the stored offset is the robust key the report keeps even if the fragment
// affordance ever stops matching. Falls back to (0,0) when the sentence is not
// found verbatim (the embedded text still carries the claim).
export const locateSpan = (text, sentence) => {
  const t = String(text || ''), s = String(sentence || '').trim();
  const start = s ? t.indexOf(s) : -1;
  return start >= 0
    ? { start, end: start + s.length, text: s }
    : { start: 0, end: 0, text: s };
};
