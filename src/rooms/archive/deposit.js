// EO: INS·CON(Entity,Field → Link, Making,Binding) — authenticated checkpoint deposit
// archive/deposit.js — what the optional Matrix login unlocks: pushing a recorded
// source to Archive.org as a permanent CHECKPOINT, under the caller's identity.
//
// Two properties the surrounding constraints demand:
//   · IDENTITY — the ingest webhook rejects anything without a valid homeserver
//     token (its "Verify Matrix ID" node), so this module is inert until matrix.js
//     has a live session. Archiving to a permanent public record is gated behind a
//     real, attributable identity, by design.
//   · IDEMPOTENCE — the deposit is CONTENT-ADDRESSED (checkpoints.js): the archive
//     identifier is a hash of the bytes, so re-archiving unchanged content overwrites
//     one item in place rather than spawning a new one on every click. We post to the
//     `archiveo-cases` webhook, the variant that honors a client-supplied identifier
//     (the plain `archiveo` webhook mints a fresh UUID server-side, which is exactly
//     the duplicate-per-upload spam we want to avoid). A local ledger lets us skip the
//     upload entirely when this content is already archived.
//
// The three consent acknowledgements the plain webhook enforces server-side are kept
// here as a CLIENT precondition — archiving to a permanent commons should be a
// deliberate, acknowledged act. Everything is injectable and non-throwing: a fault
// becomes { ok:false, stage, error }, mirroring the webhook's own envelope.

import { checkpointId, checkpointUrl, contentHash } from './checkpoints.js';

// The checkpoint webhook — honors a client identifier (idempotent). A sibling of the
// feed proxy the reader already speaks to, on the same n8n instance.
export const ARCHIVE_CASES_WEBHOOK = 'https://n8n.intelechia.com/webhook/archiveo-cases';
// The consent/redaction webhook — validates server-side but mints its own UUID per
// upload (not idempotent). Kept for reference / non-checkpoint use.
export const ARCHIVE_WEBHOOK = 'https://n8n.intelechia.com/webhook/archiveo';

// The three acknowledgements before a permanent deposit: it is permanent, may expose
// private matter, and you hold the rights.
export const REQUIRED_CONSENT = Object.freeze(['permanence', 'privacy', 'rights']);

// The four kinds the webhook accepts.
export const KINDS = Object.freeze(['source', 'dataset', 'document', 'media']);

// The archive.org mediatype derived from the mime — mirrors the webhook's mapping.
export const archiveMediatype = (mime) => {
  const m = String(mime || '');
  if (m.startsWith('video/')) return 'movies';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || m.startsWith('text/')) return 'texts';
  return 'data';
};

// Normalize a consent value (array | comma string | JSON string | truthy object) to
// a clean string array — the shapes the webhook's normalizeConsent also accepts.
const toConsent = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch { /* fall through */ } }
    if (s.includes(',')) return s.split(',').map((x) => x.trim()).filter(Boolean);
    return s ? [s] : [];
  }
  if (typeof raw === 'object') return Object.keys(raw).filter((k) => !!raw[k]);
  return [];
};

// Which required acknowledgements are still missing — the surface gates the button
// on this being empty.
export const missingConsent = (raw) => {
  const have = new Set(toConsent(raw));
  return REQUIRED_CONSENT.filter((r) => !have.has(r));
};

const todayIso = (date) => {
  if (date) return String(date).slice(0, 10);
  try { return new Date().toISOString().slice(0, 10); } catch { return ''; }
};
const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// The cases webhook reads metadata off the query string; the file rides as a
// multipart `file` part. Build the URL, dropping empty params.
const casesUrl = (endpoint, q) => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v != null && v !== '') usp.set(k, String(v));
  return endpoint + (endpoint.includes('?') ? '&' : '?') + usp.toString();
};

const tokenOf = (session, token) => {
  if (token) return String(token);
  if (session && typeof session.token === 'function') return session.token();
  if (session && typeof session === 'object' && session.accessToken) return String(session.accessToken);
  return null;
};

// Deposit a source as a permanent, content-addressed checkpoint. Requires a live
// Matrix token and the three acknowledgements; refuses locally (no wasted round-trip
// or duplicate item) when either is absent or when a `ledger` shows this exact
// content is already archived. Never throws.
//
// Returns on success { ok:true, reused, identifier, archive:{ identifier, url }, checkpoint }.
// `reused:true` means the content was already archived and nothing was uploaded.
export const depositToArchive = async ({
  session = null, token = null,
  blob = null, text = null,
  hash = null, identifier = null,
  filename = null, kind = 'document', mime = 'text/plain',
  title = null, description = '', license = 'CC-BY-4.0', tags = '', parent_identifier = '', research_id = '',
  consent = [], date = null,
  ledger = null,
  endpoint = ARCHIVE_CASES_WEBHOOK,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
} = {}) => {
  const tok = tokenOf(session, token);
  if (!tok) return { ok: false, stage: 'auth', error: 'Sign in with Matrix to archive permanently.' };

  const missing = missingConsent(consent);
  if (missing.length) return { ok: false, stage: 'consent', error: `Acknowledge: ${missing.join(', ')}`, missing };

  if (blob == null && text == null) return { ok: false, stage: 'input', error: 'Nothing to archive.' };

  // Content hash → stable identifier. A checkpoint is addressed by its bytes, so the
  // same content always lands on the same archive item (no duplicates), and the id is
  // recomputable from the content alone later. Requires text unless a hash is passed.
  const h = hash || (text != null ? contentHash(text) : null);
  if (!h) return { ok: false, stage: 'input', error: 'Cannot checkpoint binary content without a content hash.' };
  const id = identifier || checkpointId(h, { isHash: true });
  const url = checkpointUrl(id);

  // Anti-spam dedup: this exact content is already archived — point back to it, upload
  // nothing. (Idempotent even without a ledger, but the ledger saves the round-trip.)
  if (ledger && typeof ledger.has === 'function' && ledger.has(h)) {
    const prev = (typeof ledger.find === 'function' && ledger.find(h)) || null;
    return { ok: true, reused: true, identifier: id, archive: { identifier: id, url: (prev && prev.url) || url }, checkpoint: prev || { hash: h, identifier: id, url } };
  }

  if (!fetchImpl) return { ok: false, stage: 'network', error: 'No network available.' };

  const theMime = mime || 'text/plain';
  const fname = filename || (id + '.txt');
  const q = {
    identifier: id, filename: fname,
    title: title || 'EO genome checkpoint', description,
    date: todayIso(date), license,
    tags: Array.isArray(tags) ? tags.join(',') : String(tags || ''),
    mime: theMime, archiveMediatype: archiveMediatype(theMime),
    parent_identifier, research_id,
  };

  let form;
  try {
    const F = (typeof FormData !== 'undefined') ? FormData : null;
    const B = (typeof Blob !== 'undefined') ? Blob : null;
    if (!F || (!B && blob == null)) return { ok: false, stage: 'build', error: 'FormData/Blob unavailable' };
    form = new F();
    const body = blob || new B([String(text)], { type: theMime });
    form.append('file', body, fname);
  } catch (e) {
    return { ok: false, stage: 'build', error: String(e && e.message || e) };
  }

  let res;
  try {
    // No Content-Type: the runtime sets multipart/form-data + boundary from the FormData.
    res = await fetchImpl(casesUrl(endpoint, q), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' },
      body: form,
    });
  } catch (e) {
    return { ok: false, stage: 'network', error: 'Could not reach the archive.' };
  }

  let respBody = null;
  try { respBody = await res.json(); } catch { /* non-json response */ }

  if (res.ok === false || (respBody && respBody.success === false)) {
    return {
      ok: false,
      stage: (respBody && respBody.stage) || 's3_upload',
      error: (respBody && (respBody.error || (respBody.errors && respBody.errors.join('; ')))) || `archive failed (${res.status})`,
      status: res.status,
    };
  }

  const checkpoint = { hash: h, identifier: id, url, title: q.title, filename: fname, mime: theMime, at: nowIso(), bytes: text != null ? String(text).length : null };
  if (ledger && typeof ledger.record === 'function') { try { ledger.record(checkpoint); } catch { /* ledger is best-effort */ } }
  return { ok: true, reused: false, identifier: id, archive: { identifier: id, url }, checkpoint, s3_status: (respBody && respBody.s3_status) || res.status };
};
