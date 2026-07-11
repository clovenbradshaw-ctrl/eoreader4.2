// A compact in-memory Matrix homeserver for tests — just enough of the Client-Server
// API for the chat holon's E2EE loop to run two real clients against each other:
// device/one-time-key publication and claim, room membership, timeline sends, and
// to-device delivery, all routed by access token. It returns a `fetch` each client
// can be constructed with; no network, no ports.
export const createFakeHomeserver = ({ base = 'https://hs.test' } = {}) => {
  const tokens = new Map();                 // token -> { userId, deviceId }
  const deviceKeys = new Map();             // userId -> deviceId -> device_keys object
  const otks = new Map();                   // userId -> deviceId -> [ { keyId, obj } ]
  const rooms = new Map();                  // roomId -> { members:Set, timeline:[event] }
  const toDevice = new Map();               // userId -> deviceId -> [ content-with-type ]
  const syncPos = new Map();                // token -> { timeline: idx, td: drained flag }
  const mediaStore = new Map();             // mediaId -> Uint8Array (opaque ciphertext)
  const accountData = new Map();            // userId -> type -> object
  let eventSeq = 0;
  let mediaSeq = 0;

  const register = (token, userId, deviceId) => {
    tokens.set(token, { userId, deviceId });
    syncPos.set(token, { timelineIdx: {} });
  };
  const joinRoom = (roomId, userId) => {
    const r = rooms.get(roomId) || { members: new Set(), timeline: [] };
    r.members.add(userId); rooms.set(roomId, r);
  };

  const jsonRes = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const bytesRes = (status, bytes) => ({ ok: status < 400, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => ({}) });

  const fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const path = u.pathname;
    const auth = (opts.headers && opts.headers.Authorization) || '';
    const token = auth.replace(/^Bearer /, '');
    const who = tokens.get(token);
    if (!who) return jsonRes(401, { errcode: 'M_UNKNOWN_TOKEN', error: 'bad token' });

    // ── Media repository (raw bytes, not JSON) ──
    if (path === '/_matrix/media/v3/upload') {
      const mediaId = `m${mediaSeq++}`;
      const raw = opts.body instanceof Uint8Array ? opts.body : new Uint8Array(opts.body || []);
      mediaStore.set(mediaId, raw);
      return jsonRes(200, { content_uri: `mxc://${base.replace(/^https?:\/\//, '')}/${mediaId}` });
    }
    let dm = path.match(/\/_matrix\/(?:client\/v1|media\/v3)\/(?:media\/)?download\/[^/]+\/([^/]+)$/);
    if (dm) {
      const bytes = mediaStore.get(dm[1]);
      if (!bytes) return jsonRes(404, { errcode: 'M_NOT_FOUND', error: 'no media' });
      return bytesRes(200, bytes);
    }

    const body = opts.body ? JSON.parse(opts.body) : null;
    const P = '/_matrix/client/v3';

    // Account data: PUT/GET /user/{userId}/account_data/{type}
    let ad = path.match(new RegExp(`${P}/user/([^/]+)/account_data/([^/]+)$`));
    if (ad) {
      const uid = decodeURIComponent(ad[1]); const type = decodeURIComponent(ad[2]);
      const um = accountData.get(uid) || {};
      if (opts.method === 'PUT') { um[type] = body; accountData.set(uid, um); return jsonRes(200, {}); }
      if (um[type]) return jsonRes(200, um[type]);
      return jsonRes(404, { errcode: 'M_NOT_FOUND', error: 'no account data' });
    }

    // POST /keys/upload
    if (path === `${P}/keys/upload`) {
      if (body.device_keys) {
        const dm = deviceKeys.get(who.userId) || {}; dm[who.deviceId] = body.device_keys; deviceKeys.set(who.userId, dm);
      }
      if (body.one_time_keys) {
        const um = otks.get(who.userId) || {}; const pool = um[who.deviceId] || [];
        for (const [kid, obj] of Object.entries(body.one_time_keys)) pool.push({ keyId: kid, obj });
        um[who.deviceId] = pool; otks.set(who.userId, um);
      }
      const pool = (otks.get(who.userId) || {})[who.deviceId] || [];
      return jsonRes(200, { one_time_key_counts: { signed_curve25519: pool.length } });
    }

    // POST /keys/query
    if (path === `${P}/keys/query`) {
      const out = {};
      for (const uid of Object.keys(body.device_keys || {})) out[uid] = deviceKeys.get(uid) || {};
      return jsonRes(200, { device_keys: out });
    }

    // POST /keys/claim
    if (path === `${P}/keys/claim`) {
      const out = {};
      for (const [uid, devs] of Object.entries(body.one_time_keys || {})) {
        out[uid] = {};
        for (const deviceId of Object.keys(devs)) {
          const pool = (otks.get(uid) || {})[deviceId] || [];
          const taken = pool.shift();
          if (taken) out[uid][deviceId] = { [taken.keyId]: taken.obj };
        }
      }
      return jsonRes(200, { one_time_keys: out });
    }

    // GET /rooms/{id}/joined_members
    let m = path.match(new RegExp(`${P}/rooms/([^/]+)/joined_members$`));
    if (m) {
      const roomId = decodeURIComponent(m[1]);
      const r = rooms.get(roomId) || { members: new Set() };
      const joined = {}; for (const uid of r.members) joined[uid] = { display_name: uid };
      return jsonRes(200, { joined });
    }

    // PUT /rooms/{id}/send/{type}/{txn}
    m = path.match(new RegExp(`${P}/rooms/([^/]+)/send/([^/]+)/([^/]+)$`));
    if (m) {
      const roomId = decodeURIComponent(m[1]); const type = decodeURIComponent(m[2]);
      const r = rooms.get(roomId) || { members: new Set(), timeline: [] };
      const eventId = `$ev${eventSeq++}`;
      r.timeline.push({ type, content: body, sender: who.userId, event_id: eventId, origin_server_ts: eventSeq });
      rooms.set(roomId, r);
      return jsonRes(200, { event_id: eventId });
    }

    // PUT /sendToDevice/{type}/{txn}
    m = path.match(new RegExp(`${P}/sendToDevice/([^/]+)/([^/]+)$`));
    if (m) {
      const type = decodeURIComponent(m[1]);
      for (const [uid, devs] of Object.entries(body.messages || {})) {
        const um = toDevice.get(uid) || {};
        for (const [deviceId, content] of Object.entries(devs)) {
          const q = um[deviceId] || []; q.push({ type, sender: who.userId, content }); um[deviceId] = q;
        }
        toDevice.set(uid, um);
      }
      return jsonRes(200, {});
    }

    // GET /sync
    if (path === `${P}/sync`) {
      const pos = syncPos.get(token);
      // drain to-device for this device
      const um = toDevice.get(who.userId) || {}; const q = um[who.deviceId] || [];
      const tdEvents = q.splice(0, q.length);
      // new timeline events per room since last sync
      const join = {};
      for (const [roomId, r] of rooms.entries()) {
        if (!r.members.has(who.userId)) continue;
        const idx = pos.timelineIdx[roomId] || 0;
        const fresh = r.timeline.slice(idx);
        pos.timelineIdx[roomId] = r.timeline.length;
        if (fresh.length || idx === 0) join[roomId] = { timeline: { events: fresh }, state: { events: [] } };
      }
      return jsonRes(200, { next_batch: `b${eventSeq}`, to_device: { events: tdEvents }, rooms: { join } });
    }

    // GET /joined_rooms
    if (path === `${P}/joined_rooms`) {
      const joined = [...rooms.entries()].filter(([, r]) => r.members.has(who.userId)).map(([id]) => id);
      return jsonRes(200, { joined_rooms: joined });
    }

    return jsonRes(404, { errcode: 'M_UNRECOGNIZED', error: path });
  };

  const sessionFor = (userId, deviceId, token) => {
    register(token, userId, deviceId);
    return { identity: () => ({ homeserver: base, token, userId, deviceId }) };
  };

  return { fetch, sessionFor, joinRoom, register, mediaStore };
};
