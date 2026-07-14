// EO: SIG·CON(Network,Field → Link, Binding,Tending) — the Matrix transport
// chat/client.js — a small, hand-rolled Matrix Client-Server transport, cut in the
// same DOM-free, injectable style as archive/matrix.js (which it deliberately does
// NOT duplicate: it borrows that module's identity — the { homeserver, token,
// userId, deviceId } — and only adds the messaging verbs archive/matrix never
// needed). It speaks exactly the endpoints E2EE chat requires and nothing more:
//
//   · GET  /sync                          — the long-poll that streams rooms + to-device
//   · PUT  /rooms/{id}/send/{type}/{txn}   — send a (already-encrypted) room event
//   · POST /keys/upload                    — publish this device's keys + one-time keys
//   · POST /keys/query                     — look up a user's devices
//   · POST /keys/claim                     — claim a one-time key to start an Olm session
//   · PUT  /sendToDevice/{type}/{txn}      — hand a room key to specific devices
//   · POST /createRoom                     — open a room (a shared workspace)
//   · POST /rooms/{id}/invite              — invite a user into a room
//   · POST /rooms/{id}/join                — accept an invite / join a room
//
// The crypto lives in crypto.js; this module is pure transport and never sees a key.
// Every call returns { ok, ... } and never throws (a network fault is a value, not an
// exception), so the sync loop and the send path degrade instead of crashing.

const CS = '/_matrix/client/v3';

// A monotonic-ish transaction id source for idempotent sends. Seeded off a counter
// plus the caller-supplied clock so retries reuse ids but distinct sends do not.
const makeTxnIds = (now) => {
  let n = 0;
  return () => `eo${(typeof now === 'function' ? now() : Date.now())}-${n++}`;
};

// createMatrixClient({ session, fetch, now }) → the transport. `session` is the live
// archive/matrix session (identity() gives { homeserver, token, userId, deviceId }).
export const createMatrixClient = ({
  session,
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  now = null,
} = {}) => {
  const nextTxn = makeTxnIds(now);
  let syncing = false;
  let nextBatch = null;

  const id = () => (session && session.identity ? session.identity() : null);

  // One authenticated request. Returns { ok, status, body } — body parsed as JSON
  // when possible. A thrown fetch (offline) becomes { ok:false, status:0 }.
  const req = async (method, path, { body = null, query = null } = {}) => {
    const who = id();
    if (!who || !who.token) return { ok: false, status: 401, body: { error: 'not signed in' } };
    if (!fetchImpl) return { ok: false, status: 0, body: { error: 'no network' } };
    let url = who.homeserver + path;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: 'Bearer ' + who.token,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      return { ok: false, status: 0, body: { error: 'network' } };
    }
    let parsed = null;
    try { parsed = await res.json(); } catch { /* empty / non-json */ }
    return { ok: res.ok !== false && res.status < 400, status: res.status, body: parsed };
  };

  // ── Device & key endpoints ──

  const uploadKeys = ({ deviceKeys = null, oneTimeKeys = null } = {}) => {
    const body = {};
    if (deviceKeys) body.device_keys = deviceKeys;
    if (oneTimeKeys) body.one_time_keys = oneTimeKeys;
    return req('POST', `${CS}/keys/upload`, { body });
  };

  // Query the devices of a set of users. `users` is a map userId -> [] (all devices).
  const queryKeys = (users) =>
    req('POST', `${CS}/keys/query`, { body: { device_keys: users } });

  // Claim one one-time key per device. `oneTimeKeys` is userId -> deviceId -> algorithm.
  const claimKeys = (oneTimeKeys) =>
    req('POST', `${CS}/keys/claim`, { body: { one_time_keys: oneTimeKeys } });

  // ── Messaging ──

  const joinedRooms = () => req('GET', `${CS}/joined_rooms`);
  const roomMembers = (roomId) => req('GET', `${CS}/rooms/${encodeURIComponent(roomId)}/joined_members`);

  const sendEvent = (roomId, type, content) =>
    req('PUT', `${CS}/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(type)}/${nextTxn()}`, { body: content });

  // ── Room lifecycle — the places people stand together ──

  // Open a room (a shared workspace). `invite` is a list of user ids to invite at
  // creation; `encrypted` turns on m.room.encryption so the timeline is E2EE-native.
  // Returns { ok, roomId } — the caller records the room id on the workspace.
  const createRoom = async ({ name = null, invite = [], encrypted = true, topic = null } = {}) => {
    const body = { preset: 'private_chat', visibility: 'private' };
    if (name) body.name = String(name);
    if (topic) body.topic = String(topic);
    if (Array.isArray(invite) && invite.length) body.invite = invite.filter(Boolean).map(String);
    if (encrypted) body.initial_state = [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }];
    const r = await req('POST', `${CS}/createRoom`, { body });
    return { ok: r.ok, status: r.status, roomId: r.body && r.body.room_id, error: r.ok ? null : ((r.body && r.body.error) || 'createRoom failed') };
  };

  // Invite a user into a room — the "add someone to a workspace" verb.
  const invite = (roomId, userId) =>
    req('POST', `${CS}/rooms/${encodeURIComponent(roomId)}/invite`, { body: { user_id: String(userId) } });

  // Join a room we were invited to (or a public one). Idempotent server-side.
  const joinRoom = (roomId) =>
    req('POST', `${CS}/rooms/${encodeURIComponent(roomId)}/join`, { body: {} });

  // Send a to-device message. `messages` is userId -> deviceId -> content (or "*").
  const sendToDevice = (type, messages) =>
    req('PUT', `${CS}/sendToDevice/${encodeURIComponent(type)}/${nextTxn()}`, { body: { messages } });

  // ── Sync ──

  // One /sync round. Returns { ok, data } where data is the raw sync response; the
  // caller (index.js) drains rooms + to_device and folds them into state.
  const syncOnce = async ({ timeout = 30000, fullState = false } = {}) => {
    const query = { timeout: String(timeout) };
    if (nextBatch) query.since = nextBatch;
    if (fullState && !nextBatch) query.full_state = 'true';
    const r = await req('GET', `${CS}/sync`, { query });
    if (r.ok && r.body && r.body.next_batch) nextBatch = r.body.next_batch;
    return { ok: r.ok, status: r.status, data: r.body };
  };

  // The long-poll loop. `onSync(data)` is awaited each round; the loop stops when
  // stop() is called or the session goes away. A failed round backs off, so a flaky
  // network retries without hammering the homeserver.
  const startSync = (onSync, { timeout = 30000 } = {}) => {
    if (syncing) return () => stopSync();
    syncing = true;
    (async () => {
      let backoff = 1000;
      // First sync is a fast snapshot; subsequent ones long-poll.
      let first = true;
      while (syncing) {
        const r = await syncOnce({ timeout: first ? 0 : timeout });
        if (!syncing) break;
        if (r.ok && r.data) {
          backoff = 1000; first = false;
          try { await onSync(r.data); } catch { /* surface's problem, keep syncing */ }
        } else {
          if (r.status === 401) { syncing = false; break; }   // token died — stop cleanly
          await new Promise((res) => setTimeout(res, backoff));
          backoff = Math.min(backoff * 2, 30000);
        }
      }
    })();
    return () => stopSync();
  };
  const stopSync = () => { syncing = false; };
  const isSyncing = () => syncing;
  const resetSince = () => { nextBatch = null; };

  return Object.freeze({
    uploadKeys, queryKeys, claimKeys,
    joinedRooms, roomMembers, sendEvent, sendToDevice,
    createRoom, invite, joinRoom,
    syncOnce, startSync, stopSync, isSyncing, resetSince,
  });
};
