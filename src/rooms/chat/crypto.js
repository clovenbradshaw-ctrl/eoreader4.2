// EO: INS·CON(Void,Field → Entity,Link, Making,Binding) — the E2EE key material
// chat/crypto.js — a thin, injectable wrapper over libolm (the audited Olm/Megolm
// primitive, vendored at vendor/olm). This is the ONLY place raw key material lives.
// It owns three kinds of secret and pickles every one of them into the OPFS store
// (opfs-store.js) so an E2EE session survives a reload without ever re-deriving keys:
//
//   · the Olm Account   — this device's long-term identity (curve25519 + ed25519)
//                          and its published one-time keys
//   · Olm Sessions      — the 1:1 ratchets to each peer device, used ONLY to hand a
//                          room's Megolm key to that device (m.room_key, to-device)
//   · Megolm Sessions   — the group ratchets that actually encrypt room messages;
//                          one OUTBOUND per room we send to, many INBOUND (one per
//                          (room, sender device, session) we receive)
//
// libolm itself is not imported here — the `Olm` namespace is INJECTED (the browser
// passes the vendored `window.Olm` after `Olm.init()`; tests load the same artifact
// and pass it). That keeps this module DOM-free, WASM-free at import time, and lets
// the whole tree run under `node --test` against the real crypto.
//
// Honest scope note: this is the transport-and-message E2EE core (device identity,
// key sharing over Olm, Megolm message encryption) with durable OPFS storage. Device
// verification UX, cross-signing, and encrypted key backup are deliberately NOT here
// yet — see docs/element-e2ee.md for the follow-up surface.

// The pickle key encrypts every pickle at rest. In a browser with no user passphrase
// there is no secret to hide it behind, so — like every browser Matrix client — we
// generate one random key and persist it beside the pickles; it defends against a
// casual reader of the file, not against code running on this origin. An injected
// `pickleKey` (e.g. derived from a passphrase) overrides this and is never persisted.
const PICKLE_KEY_STORE = 'crypto/pickle-key';
const ACCOUNT_STORE = 'crypto/account';
const OTK_PUBLISHED_STORE = 'crypto/otk-published';
const outboundKey = (roomId) => `megolm/out/${roomId}`;
const inboundKey = (roomId, sessionId) => `megolm/in/${roomId}|${sessionId}`;
const olmSessionKey = (theirIdentityKey) => `olm/session/${theirIdentityKey}`;

const randomPickleKey = () => {
  // The platform CSPRNG (Web Crypto) — present in the browser and Node ≥ 20.
  const bytes = new Uint8Array(32);
  const wc = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (wc && typeof wc.getRandomValues === 'function') wc.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) & 0xff; // last resort
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

// createChatCrypto({ Olm, store, userId, deviceId, pickleKey? }) → the crypto holon's
// key controller. `Olm` is an initialised libolm namespace; `store` is an opfs-store.
// Everything is async because the store is. `init()` must be awaited before use.
export const createChatCrypto = async ({ Olm, store, userId, deviceId, pickleKey = null } = {}) => {
  if (!Olm || !store) throw new Error('createChatCrypto needs { Olm, store }');

  let PK = pickleKey;                 // the pickle key, resolved in init()
  let account = null;                 // the live Olm.Account (freed only on dispose)
  const olmSessions = new Map();      // theirIdentityKey -> live Olm.Session
  const outbound = new Map();         // roomId -> { session, sessionId, messageCount }
  const inbound = new Map();          // `${roomId}|${sessionId}` -> live InboundGroupSession

  const persistAccount = () => store.set(ACCOUNT_STORE, account.pickle(PK));

  // Resolve the pickle key: an injected one wins; otherwise reuse the persisted one
  // or mint and persist a fresh random one on first run.
  const resolvePickleKey = async () => {
    if (PK) return PK;
    PK = await store.get(PICKLE_KEY_STORE);
    if (!PK) { PK = randomPickleKey(); await store.set(PICKLE_KEY_STORE, PK); }
    return PK;
  };

  // Load the account from its pickle, or create one on first run. Idempotent.
  const init = async () => {
    await resolvePickleKey();
    account = new Olm.Account();
    const pickled = await store.get(ACCOUNT_STORE);
    if (pickled) {
      try { account.unpickle(PK, pickled); }
      catch { account.free(); account = new Olm.Account(); account.create(); await persistAccount(); }
    } else {
      account.create();
      await persistAccount();
    }
    return controller;
  };

  const identityKeys = () => JSON.parse(account.identity_keys());   // { curve25519, ed25519 }
  const deviceCurve25519 = () => identityKeys().curve25519;
  const deviceEd25519 = () => identityKeys().ed25519;

  // Sign a JSON object with this device's ed25519 key, per Matrix's canonical-JSON
  // signing (drop `signatures`/`unsigned`, sort keys). Returns the base64 signature.
  const canonicalJson = (obj) => {
    const clean = { ...obj }; delete clean.signatures; delete clean.unsigned;
    const sort = (v) => Array.isArray(v) ? v.map(sort)
      : (v && typeof v === 'object')
        ? Object.keys(v).sort().reduce((a, k) => { a[k] = sort(v[k]); return a; }, {})
        : v;
    return JSON.stringify(sort(clean));
  };
  const signJson = (obj) => {
    const sig = account.sign(canonicalJson(obj));
    return { [userId]: { [`ed25519:${deviceId}`]: sig } };
  };

  // The signed device_keys object for POST /keys/upload — this device's public
  // identity, so peers can find and trust it.
  const deviceKeysPayload = () => {
    const keys = identityKeys();
    const body = {
      user_id: userId,
      device_id: deviceId,
      algorithms: ['m.olm.v1.curve25519-aes-sha2', 'm.megolm.v1.aes-sha2'],
      keys: { [`curve25519:${deviceId}`]: keys.curve25519, [`ed25519:${deviceId}`]: keys.ed25519 },
    };
    body.signatures = signJson(body);
    return body;
  };

  // Generate `count` one-time keys and return the signed one_time_keys map for
  // /keys/upload. The keys are NOT marked published until markOneTimeKeysPublished()
  // — call it only after the homeserver has accepted the upload.
  const oneTimeKeysPayload = async (count = 20) => {
    account.generate_one_time_keys(count);
    await persistAccount();
    const otks = JSON.parse(account.one_time_keys()).curve25519 || {};
    const signed = {};
    for (const [keyId, key] of Object.entries(otks)) {
      const obj = { key }; obj.signatures = signJson(obj);
      signed[`signed_curve25519:${keyId}`] = obj;
    }
    return signed;
  };
  const markOneTimeKeysPublished = async () => {
    account.mark_keys_as_published();
    await persistAccount();
    await store.set(OTK_PUBLISHED_STORE, '1');
  };
  const maxOneTimeKeys = () => account.max_number_of_one_time_keys();

  // ── Olm 1:1 sessions — the channel that carries a room key to one peer device ──

  const loadOlmSession = async (theirIdentityKey) => {
    if (olmSessions.has(theirIdentityKey)) return olmSessions.get(theirIdentityKey);
    const pickled = await store.get(olmSessionKey(theirIdentityKey));
    if (!pickled) return null;
    const s = new Olm.Session();
    try { s.unpickle(PK, pickled); } catch { s.free(); return null; }
    olmSessions.set(theirIdentityKey, s);
    return s;
  };
  const persistOlmSession = (theirIdentityKey, session) =>
    store.set(olmSessionKey(theirIdentityKey), session.pickle(PK));

  // Establish an OUTBOUND Olm session to a peer from their identity key and a claimed
  // one-time key (from /keys/claim). Returns the session id.
  const createOutboundOlmSession = async (theirIdentityKey, theirOneTimeKey) => {
    const s = new Olm.Session();
    s.create_outbound(account, theirIdentityKey, theirOneTimeKey);
    olmSessions.set(theirIdentityKey, s);
    await persistOlmSession(theirIdentityKey, s);
    return s.session_id();
  };

  // Encrypt a payload object to a peer over the existing Olm session. Returns the
  // { type, body } ciphertext that goes under this device's curve25519 key in an
  // m.room.encrypted (algorithm m.olm.v1) to-device message.
  const encryptOlm = async (theirIdentityKey, payload) => {
    const s = olmSessions.get(theirIdentityKey) || await loadOlmSession(theirIdentityKey);
    if (!s) throw Object.assign(new Error('no Olm session'), { code: 'NO_OLM_SESSION' });
    const ct = s.encrypt(JSON.stringify(payload));
    await persistOlmSession(theirIdentityKey, s);
    return ct;   // { type: 0|1, body }
  };

  // Decrypt an inbound Olm ciphertext from a peer. A type-0 (prekey) message may
  // create a NEW inbound session against our account; a type-1 uses the existing one.
  // Returns the decrypted payload object.
  const decryptOlm = async (theirIdentityKey, ciphertext) => {
    let s = olmSessions.get(theirIdentityKey) || await loadOlmSession(theirIdentityKey);
    if (!s && ciphertext.type === 0) {
      s = new Olm.Session();
      s.create_inbound_from(account, theirIdentityKey, ciphertext.body);
      account.remove_one_time_keys(s);
      await persistAccount();
      olmSessions.set(theirIdentityKey, s);
    }
    if (!s) throw Object.assign(new Error('no Olm session for message'), { code: 'NO_OLM_SESSION' });
    const plain = s.decrypt(ciphertext.type, ciphertext.body);
    await persistOlmSession(theirIdentityKey, s);
    return JSON.parse(plain);
  };

  // ── Megolm — the group ratchet that encrypts room messages ──

  const ensureOutbound = async (roomId) => {
    if (outbound.has(roomId)) return outbound.get(roomId);
    const rec = await store.getJson(outboundKey(roomId));
    if (rec && rec.pickle) {
      const session = new Olm.OutboundGroupSession();
      try {
        session.unpickle(PK, rec.pickle);
        const live = { session, sessionId: session.session_id(), messageCount: rec.messageCount || 0 };
        outbound.set(roomId, live);
        return live;
      } catch { session.free(); }
    }
    const session = new Olm.OutboundGroupSession();
    session.create();
    const live = { session, sessionId: session.session_id(), messageCount: 0 };
    outbound.set(roomId, live);
    await persistOutbound(roomId, live);
    // Our own device must be able to read what it sends: seed the matching inbound.
    await importInboundSession({
      room_id: roomId, session_id: live.sessionId, session_key: session.session_key(),
    });
    return live;
  };
  const persistOutbound = (roomId, live) => store.setJson(outboundKey(roomId), {
    pickle: live.session.pickle(PK), messageCount: live.messageCount, sessionId: live.sessionId,
  });

  // The m.room_key content to hand to peers over Olm — the session id and the
  // ratchet's CURRENT key, in Matrix wire shape so index.js sends it verbatim.
  const roomKeyContent = async (roomId) => {
    const live = await ensureOutbound(roomId);
    return {
      algorithm: 'm.megolm.v1.aes-sha2',
      room_id: roomId,
      session_id: live.sessionId,
      session_key: live.session.session_key(),
    };
  };

  // Encrypt a room event. Returns the m.room.encrypted content (algorithm m.megolm.v1).
  const encryptRoomEvent = async (roomId, eventType, content) => {
    const live = await ensureOutbound(roomId);
    const payload = JSON.stringify({ type: eventType, content, room_id: roomId });
    const ciphertext = live.session.encrypt(payload);
    live.messageCount += 1;
    await persistOutbound(roomId, live);
    return {
      algorithm: 'm.megolm.v1.aes-sha2',
      sender_key: deviceCurve25519(),
      ciphertext,
      session_id: live.sessionId,
      device_id: deviceId,
    };
  };

  // Import a room key we received (an m.room_key content, Matrix wire shape) as an
  // inbound Megolm session. Idempotent by (room, session): re-importing is a no-op.
  const importInboundSession = async ({ room_id: roomId, session_id: sessionId, session_key: sessionKey }) => {
    const mapKey = `${roomId}|${sessionId}`;
    if (inbound.has(mapKey)) return;
    if (await store.get(inboundKey(roomId, sessionId))) {
      // already known — hydrate lazily on first decrypt, not now
      return;
    }
    const session = new Olm.InboundGroupSession();
    session.create(sessionKey);
    inbound.set(mapKey, session);
    await store.set(inboundKey(roomId, sessionId), session.pickle(PK));
  };

  const loadInbound = async (roomId, sessionId) => {
    const mapKey = `${roomId}|${sessionId}`;
    if (inbound.has(mapKey)) return inbound.get(mapKey);
    const pickled = await store.get(inboundKey(roomId, sessionId));
    if (!pickled) return null;
    const session = new Olm.InboundGroupSession();
    try { session.unpickle(PK, pickled); } catch { session.free(); return null; }
    inbound.set(mapKey, session);
    return session;
  };

  // Decrypt an m.room.encrypted (Megolm) event content for a given room. Throws with
  // code 'UNKNOWN_SESSION' when we hold no key for it (the caller can then request one).
  const decryptRoomEvent = async (content, roomId) => {
    const { session_id: sessionId, ciphertext } = content;
    const session = await loadInbound(roomId, sessionId);
    if (!session) throw Object.assign(new Error('no inbound session'), { code: 'UNKNOWN_SESSION', sessionId });
    const { plaintext } = session.decrypt(ciphertext);
    await store.set(inboundKey(roomId, sessionId), session.pickle(PK));   // ratchet advanced
    const parsed = JSON.parse(plaintext);
    return { eventType: parsed.type, content: parsed.content, roomId: parsed.room_id };
  };

  // Release all live libolm objects (WASM heap). The pickles in the store remain the
  // source of truth; a fresh init() rehydrates everything.
  const dispose = () => {
    try { account && account.free(); } catch { /* ignore */ }
    for (const s of olmSessions.values()) { try { s.free(); } catch { /* ignore */ } }
    for (const o of outbound.values()) { try { o.session.free(); } catch { /* ignore */ } }
    for (const s of inbound.values()) { try { s.free(); } catch { /* ignore */ } }
    olmSessions.clear(); outbound.clear(); inbound.clear();
    account = null;
  };

  const controller = Object.freeze({
    init,
    deviceCurve25519, deviceEd25519, identityKeys,
    signJson, deviceKeysPayload, oneTimeKeysPayload, markOneTimeKeysPublished, maxOneTimeKeys,
    createOutboundOlmSession, encryptOlm, decryptOlm, hasOlmSession: (k) => olmSessions.has(k),
    roomKeyContent, encryptRoomEvent, importInboundSession, decryptRoomEvent,
    dispose,
  });
  return controller;
};
