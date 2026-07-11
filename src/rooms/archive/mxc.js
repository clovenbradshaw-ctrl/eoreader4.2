// EO: SIG·CON(Network → Link, Binding,Tending) — the Matrix media repository client
// archive/mxc.js — upload and download RAW BYTES to the homeserver's content
// repository (the "media store"), under the existing Matrix identity. This is the
// transport half of the encrypted vault: the vault encrypts a blob (file-crypto.js),
// hands the CIPHERTEXT here to be stored, and gets back an `mxc://` URI it records in
// the block chain. The homeserver only ever sees opaque encrypted bytes.
//
// Kept separate from chat/client.js on purpose: that speaks the JSON Client-Server
// API; media is raw octet-streams on the media endpoints, a different content type and
// a different base path. Injectable `fetch`, non-throwing envelopes ({ ok, ... }).

// Parse an mxc:// URI into its parts. `mxc://hs.example/AbCd123` →
// { server:'hs.example', mediaId:'AbCd123' }, or null if malformed.
export const parseMxc = (uri) => {
  const m = /^mxc:\/\/([^/]+)\/([^/?#]+)/.exec(String(uri || ''));
  return m ? { server: m[1], mediaId: m[2] } : null;
};

// createMediaStore({ session, fetch }) → the media client. `session` is the shared
// archive/matrix session (identity() → { homeserver, token }).
export const createMediaStore = ({
  session,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
} = {}) => {
  const id = () => (session && session.identity ? session.identity() : null);

  // Upload ciphertext bytes. Returns { ok, mxc } — the content URI to keep.
  const upload = async (bytes, { contentType = 'application/octet-stream', filename = 'blob.bin' } = {}) => {
    const who = id();
    if (!who || !who.token) return { ok: false, error: 'not signed in' };
    if (!fetchImpl) return { ok: false, error: 'no network' };
    const url = `${who.homeserver}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`;
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': contentType },
        body: bytes,
      });
    } catch { return { ok: false, error: 'network' }; }
    if (res.ok === false || res.status >= 400) return { ok: false, status: res.status, error: await errText(res) };
    let j = null; try { j = await res.json(); } catch { /* ignore */ }
    const mxc = j && j.content_uri;
    if (!mxc) return { ok: false, error: 'no content_uri' };
    return { ok: true, mxc };
  };

  // Download the bytes behind an mxc:// URI. Tries the authenticated client-v1 media
  // endpoint first (required by modern homeservers), then the legacy media-v3 path.
  // Returns { ok, bytes: Uint8Array }.
  const download = async (mxc) => {
    const who = id();
    if (!who || !who.token) return { ok: false, error: 'not signed in' };
    if (!fetchImpl) return { ok: false, error: 'no network' };
    const parts = parseMxc(mxc);
    if (!parts) return { ok: false, error: 'bad mxc uri' };
    const paths = [
      `/_matrix/client/v1/media/download/${encodeURIComponent(parts.server)}/${encodeURIComponent(parts.mediaId)}`,
      `/_matrix/media/v3/download/${encodeURIComponent(parts.server)}/${encodeURIComponent(parts.mediaId)}`,
    ];
    let lastErr = 'download failed';
    for (const path of paths) {
      let res;
      try {
        res = await fetchImpl(who.homeserver + path, { method: 'GET', headers: { Authorization: 'Bearer ' + who.token } });
      } catch { lastErr = 'network'; continue; }
      if (res.ok === false || res.status >= 400) { lastErr = await errText(res); continue; }
      try {
        const buf = await res.arrayBuffer();
        return { ok: true, bytes: new Uint8Array(buf) };
      } catch { lastErr = 'unreadable body'; }
    }
    return { ok: false, error: lastErr };
  };

  return Object.freeze({ upload, download, parseMxc });
};

const errText = async (res) => {
  try { const j = await res.json(); if (j && (j.error || j.errcode)) return String(j.error || j.errcode); }
  catch { /* not json */ }
  return `request failed (${res && res.status})`;
};
