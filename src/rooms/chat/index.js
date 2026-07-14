// EO: CON·SIG(Network,Field → Link,Entity, Binding,Making) — the E2EE room bus
// chat/index.js — the one entrance to the chat holon. It composes the three parts
// (opfs-store · crypto · client) into a single reactive controller the surface
// renders, and owns the choreography that turns "type a message" into an encrypted
// Matrix event the recipients can read:
//
//   send:     ensure a Megolm session for the room → share its key with every member
//             device over Olm (to-device) → PUT the m.room.encrypted event
//   receive:  /sync → decrypt inbound Olm to-device (m.room_key) and import the key →
//             decrypt m.room.encrypted timeline events → fold into the room timeline
//
// A message is only ONE kind of thing that rides this rail. The same Megolm envelope
// carries ANY app event (`sendRoomEvent` / `onRoomEvent`), so the room is a general
// end-to-end-encrypted BUS between the people in it: the shared vault ships its blocks
// on it (rooms/archive/room-vault.js) and lightweight signals (`sendSignal`) travel the
// same way. Only the room's members hold the Megolm key, so only they can read any of
// it. Room lifecycle (`createRoom` / `invite` / `join`) makes a shared workspace a real,
// invitable Matrix room.
//
// Reactive like the reader app (rooms/reader/app.js): subscribe once, re-render on
// emit. Signed-out it is inert; it only comes alive once the shared archive/matrix
// session (window.EO.matrix) is live, reusing that identity — no second login.
//
// `Olm` is injected (the browser passes the vendored, initialised window.Olm). Nothing
// here imports libolm or touches the DOM, so the whole controller runs under test.
import { createOpfsStore } from './opfs-store.js';
import { createChatCrypto } from './crypto.js';
import { createMatrixClient } from './client.js';

const OLM_ALGO = 'm.olm.v1.curve25519-aes-sha2';
const MEGOLM_ALGO = 'm.megolm.v1.aes-sha2';
const SIGNAL_TYPE = 'org.eoreader.signal';   // lightweight room signals (presence, "saved X", …)
const MIN_OTK_KEEP = 20;   // keep the homeserver stocked with this many one-time keys

// createChatRoom({ matrix, Olm, fetch, navigator, storeRoot, deviceName }) → controller.
// `matrix` is the archive/matrix session (identity + token); `Olm` is initialised libolm.
export const createChatRoom = ({
  matrix,
  Olm = (typeof globalThis !== 'undefined' ? globalThis.Olm : null),
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  navigator: nav = (typeof navigator !== 'undefined' ? navigator : null),
  storeRoot = 'eo-chat',
  autoSync = true,
} = {}) => {
  const state = {
    status: 'idle',           // 'idle' | 'starting' | 'live' | 'error'
    error: null,
    userId: null,
    deviceId: null,
    persistent: false,        // true when keys are on OPFS (not just memory)
    rooms: [],                // [{ roomId, name, timeline: [msg], unread }]
    activeRoomId: null,
  };
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind, data = null) => { for (const fn of subs) { try { fn(kind, data); } catch { /* surface's problem */ } } };
  const setState = (patch, kind = 'state') => { Object.assign(state, patch); emit(kind); };

  let store = null, crypto = null, client = null, stopSync = null;
  const sharedByRoom = new Map();   // roomId -> Set(deviceCurve25519) already given the key
  const roomEventHandlers = new Set();   // decrypted non-message app events (vault blocks, signals)

  // Subscribe to decrypted app events on the room bus (anything that is not a chat
  // message). Each handler gets { roomId, type, content, sender, eventId, ts, mine };
  // handlers are awaited in timeline order, so a fold (the shared vault) stays ordered.
  const onRoomEvent = (fn) => { roomEventHandlers.add(fn); return () => roomEventHandlers.delete(fn); };
  const dispatchRoomEvent = async (evt) => { for (const fn of roomEventHandlers) { try { await fn(evt); } catch { /* handler's problem */ } } };

  const roomOf = (roomId) => {
    let r = state.rooms.find((x) => x.roomId === roomId);
    if (!r) { r = { roomId, name: roomId, timeline: [], unread: 0 }; state.rooms.push(r); }
    return r;
  };
  const pushMessage = (roomId, msg) => {
    const r = roomOf(roomId);
    if (msg.eventId && r.timeline.some((m) => m.eventId === msg.eventId)) return;   // dedupe
    r.timeline.push(msg);
    if (roomId !== state.activeRoomId) r.unread += 1;
    emit('timeline', roomId);
  };

  // ── Startup: hydrate keys from OPFS, publish this device, begin syncing ──

  const start = async () => {
    if (state.status === 'live' || state.status === 'starting') return { ok: true };
    const who = matrix && matrix.identity ? matrix.identity() : null;
    if (!who || !who.token) { setState({ status: 'idle', error: 'sign in first' }); return { ok: false, error: 'anon' }; }
    if (!Olm) { setState({ status: 'error', error: 'encryption library not loaded' }); return { ok: false, error: 'no-olm' }; }

    setState({ status: 'starting', error: null, userId: who.userId, deviceId: who.deviceId });
    store = await createOpfsStore({ navigator: nav, root: storeRoot });
    crypto = await createChatCrypto({ Olm, store, userId: who.userId, deviceId: who.deviceId });
    await crypto.init();
    client = createMatrixClient({ session: matrix, fetch: fetchImpl });

    // Publish this device's identity + a stock of one-time keys (best-effort).
    await publishKeys();

    if (autoSync) stopSync = client.startSync(onSync);
    setState({ status: 'live', persistent: store.persistent });
    return { ok: true };
  };

  // One manual sync round — the long-poll loop's body, exposed for a caller that
  // wants to drive syncing itself (tests, or a background-tab throttle).
  const pump = async ({ timeout = 0 } = {}) => {
    if (!client) return { ok: false };
    const r = await client.syncOnce({ timeout });
    if (r.ok && r.data) await onSync(r.data);
    return r;
  };

  const stop = () => {
    if (stopSync) { stopSync(); stopSync = null; }
    if (crypto) crypto.dispose();
    setState({ status: 'idle' });
  };

  const publishKeys = async () => {
    try {
      const otks = await crypto.oneTimeKeysPayload(MIN_OTK_KEEP);
      const r = await client.uploadKeys({ deviceKeys: crypto.deviceKeysPayload(), oneTimeKeys: otks });
      if (r.ok) await crypto.markOneTimeKeysPublished();
    } catch { /* offline — device keys publish on the next start */ }
  };

  // ── Send: share the room key, then send the encrypted event ──

  // The shared core of every send: make sure every member device holds the room's
  // Megolm key, then Megolm-encrypt `content` under `eventType` and PUT it. Returns
  // { ok, eventId } — the one place messages, vault blocks, and signals converge, so
  // "only the room can read it" is enforced identically for all three.
  const encryptAndSend = async (roomId, eventType, content) => {
    await shareRoomKey(roomId);
    const enc = await crypto.encryptRoomEvent(roomId, eventType, content);
    const r = await client.sendEvent(roomId, 'm.room.encrypted', enc);
    if (!r.ok) return { ok: false, error: (r.body && r.body.error) || 'send failed' };
    return { ok: true, eventId: r.body && r.body.event_id };
  };

  const sendMessage = async (roomId, body) => {
    if (state.status !== 'live') return { ok: false, error: 'not started' };
    const text = String(body ?? '').trim();
    if (!text) return { ok: false, error: 'empty' };
    try {
      const r = await encryptAndSend(roomId, 'm.room.message', { msgtype: 'm.text', body: text });
      if (!r.ok) return r;
      // Optimistic echo — the sync will confirm it with an event id.
      pushMessage(roomId, { sender: state.userId, body: text, ts: null, mine: true, eventId: r.eventId });
      return r;
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'encrypt failed' };
    }
  };

  // Send an arbitrary app event, Megolm-encrypted to the room — the bus the shared
  // vault and signals ride on. The inner `eventType` is hidden inside the Megolm
  // envelope (the wire event is always m.room.encrypted). Returns { ok, eventId }.
  const sendRoomEvent = async (roomId, eventType, content) => {
    if (state.status !== 'live') return { ok: false, error: 'not started' };
    try { return await encryptAndSend(roomId, String(eventType), content); }
    catch (e) { return { ok: false, error: e && e.message ? e.message : 'encrypt failed' }; }
  };

  // A lightweight signal to everyone in the room (presence, "saved X", a nudge). Just
  // an app event of type org.eoreader.signal; subscribers see it via onRoomEvent.
  const sendSignal = (roomId, kind, data = null) => sendRoomEvent(roomId, SIGNAL_TYPE, { kind: String(kind), data });

  // ── Room lifecycle — a shared workspace is an invitable Matrix room ──

  const ensureStarted = async () => (state.status === 'live' ? { ok: true } : start());

  // Open a room (a shared workspace). Returns { ok, roomId }.
  const createRoom = async (opts = {}) => {
    const s = await ensureStarted(); if (!s.ok) return s;
    const r = await client.createRoom(opts);
    if (r.ok && r.roomId) roomOf(r.roomId).name = opts.name || r.roomId;
    return r;
  };
  // Invite a user into a room — "add someone to the workspace".
  const invite = async (roomId, userId) => {
    const s = await ensureStarted(); if (!s.ok) return s;
    const r = await client.invite(roomId, userId);
    return { ok: r.ok, error: r.ok ? null : ((r.body && r.body.error) || 'invite failed') };
  };
  // Join a room we were invited to.
  const join = async (roomId) => {
    const s = await ensureStarted(); if (!s.ok) return s;
    const r = await client.joinRoom(roomId);
    if (r.ok) sharedByRoom.delete(roomId);   // membership changed — re-share keys on next send
    return { ok: r.ok, roomId, error: r.ok ? null : ((r.body && r.body.error) || 'join failed') };
  };
  // Who is currently joined to a room. Returns { ok, members: [userId] }.
  const members = async (roomId) => {
    if (state.status !== 'live') return { ok: false, members: [] };
    const r = await client.roomMembers(roomId);
    const joined = r.ok && r.body && r.body.joined ? Object.keys(r.body.joined) : [];
    return { ok: r.ok, members: joined };
  };

  // Ensure every member device of the room holds the current Megolm key. Only devices
  // not already in sharedByRoom are queried/claimed/sent, so re-sends are cheap.
  const shareRoomKey = async (roomId) => {
    const shared = sharedByRoom.get(roomId) || new Set();
    // Who is in the room?
    const membersRes = await client.roomMembers(roomId);
    const members = membersRes.ok && membersRes.body && membersRes.body.joined
      ? Object.keys(membersRes.body.joined) : [state.userId];
    // Their devices.
    const query = {}; for (const uid of members) query[uid] = [];
    const devsRes = await client.queryKeys(query);
    const deviceKeys = (devsRes.ok && devsRes.body && devsRes.body.device_keys) || {};

    // Figure out which (user, device) pairs still need the key and lack an Olm session.
    const need = [];            // { uid, deviceId, curve25519, ed25519 }
    const toClaim = {};         // uid -> deviceId -> algo
    for (const uid of members) {
      const devs = deviceKeys[uid] || {};
      for (const [deviceId, dk] of Object.entries(devs)) {
        const curve = dk.keys && dk.keys[`curve25519:${deviceId}`];
        const ed = dk.keys && dk.keys[`ed25519:${deviceId}`];
        if (!curve) continue;
        if (curve === crypto.deviceCurve25519()) continue;         // our own device — already seeded
        if (shared.has(curve)) continue;                            // already has this key
        need.push({ uid, deviceId, curve25519: curve, ed25519: ed });
        if (!crypto.hasOlmSession(curve)) { (toClaim[uid] = toClaim[uid] || {})[deviceId] = 'signed_curve25519'; }
      }
    }
    if (!need.length) { sharedByRoom.set(roomId, shared); return; }

    // Claim one-time keys and open Olm sessions for the devices that need one.
    if (Object.keys(toClaim).length) {
      const claimRes = await client.claimKeys(toClaim);
      const claimed = (claimRes.ok && claimRes.body && claimRes.body.one_time_keys) || {};
      for (const n of need) {
        if (crypto.hasOlmSession(n.curve25519)) continue;
        const otkObj = claimed[n.uid] && claimed[n.uid][n.deviceId];
        const otk = otkObj && Object.values(otkObj)[0] && Object.values(otkObj)[0].key;
        if (otk) { try { await crypto.createOutboundOlmSession(n.curve25519, otk); } catch { /* skip device */ } }
      }
    }

    // Encrypt the room key to every device we now have a session with, as a to-device
    // m.room.encrypted (Olm) message, and send them all in one call.
    const roomKey = await crypto.roomKeyContent(roomId);
    const messages = {};
    for (const n of need) {
      if (!crypto.hasOlmSession(n.curve25519)) continue;
      const payload = {
        type: 'm.room_key', content: roomKey,
        sender: state.userId, recipient: n.uid,
        recipient_keys: { ed25519: n.ed25519 },
        keys: { ed25519: crypto.deviceEd25519() },
      };
      try {
        const ciphertext = await crypto.encryptOlm(n.curve25519, payload);
        (messages[n.uid] = messages[n.uid] || {})[n.deviceId] = {
          algorithm: OLM_ALGO, sender_key: crypto.deviceCurve25519(),
          ciphertext: { [n.curve25519]: ciphertext },
        };
        shared.add(n.curve25519);
      } catch { /* skip this device */ }
    }
    if (Object.keys(messages).length) await client.sendToDevice('m.room.encrypted', messages);
    sharedByRoom.set(roomId, shared);
  };

  // ── Receive: fold a /sync response into the timelines ──

  const onSync = async (data) => {
    // 1) to-device: inbound Olm messages, chiefly m.room_key deliveries.
    const td = (data.to_device && data.to_device.events) || [];
    for (const ev of td) await handleToDevice(ev);

    // 2) room timelines.
    const joined = (data.rooms && data.rooms.join) || {};
    for (const [roomId, room] of Object.entries(joined)) {
      applyRoomName(roomId, room);
      const events = (room.timeline && room.timeline.events) || [];
      for (const ev of events) await handleRoomEvent(roomId, ev);
    }
    // Keep the homeserver stocked with one-time keys as they are consumed.
    if (typeof data.device_one_time_keys_count === 'object') {
      const left = data.device_one_time_keys_count.signed_curve25519 || 0;
      if (left < MIN_OTK_KEEP) await publishKeys();
    }
    emit('rooms');
  };

  const handleToDevice = async (ev) => {
    if (ev.type !== 'm.room.encrypted') return;
    const c = ev.content || {};
    if (c.algorithm !== OLM_ALGO) return;
    const mine = c.ciphertext && c.ciphertext[crypto.deviceCurve25519()];
    if (!mine) return;                          // not addressed to this device
    try {
      const payload = await crypto.decryptOlm(c.sender_key, mine);
      if (payload && payload.type === 'm.room_key' && payload.content) {
        await crypto.importInboundSession(payload.content);
      }
    } catch { /* undecryptable to-device message — drop it */ }
  };

  const handleRoomEvent = async (roomId, ev) => {
    if (ev.type === 'm.room.encrypted' && ev.content && ev.content.algorithm === MEGOLM_ALGO) {
      let decoded;
      try {
        decoded = await crypto.decryptRoomEvent(ev.content, roomId);
      } catch (e) {
        if (e && e.code === 'UNKNOWN_SESSION') {
          pushMessage(roomId, { sender: ev.sender, body: '🔒 (waiting for the key to this message)', ts: ev.origin_server_ts || null, undecryptable: true, eventId: ev.event_id });
        }
        return;
      }
      const { eventType, content } = decoded;
      if (eventType === 'm.room.message' && content && content.msgtype === 'm.text') {
        pushMessage(roomId, {
          sender: ev.sender, body: content.body, ts: ev.origin_server_ts || null,
          mine: ev.sender === state.userId, eventId: ev.event_id,
        });
      } else if (eventType && eventType !== 'm.room.message') {
        // A non-message app event (a vault block, a signal) — hand it to the bus. The
        // sender/eventId/ts are the AUTHENTICATED outer envelope, not the plaintext.
        await dispatchRoomEvent({
          roomId, type: eventType, content,
          sender: ev.sender, eventId: ev.event_id, ts: ev.origin_server_ts || null,
          mine: ev.sender === state.userId,
        });
      }
    } else if (ev.type === 'm.room.message' && ev.content) {
      // An unencrypted message (e.g. a non-E2EE room) — show it plainly.
      pushMessage(roomId, { sender: ev.sender, body: ev.content.body, ts: ev.origin_server_ts || null, mine: ev.sender === state.userId, eventId: ev.event_id, plaintext: true });
    }
  };

  const applyRoomName = (roomId, room) => {
    const stateEvents = (room.state && room.state.events) || [];
    for (const ev of stateEvents) {
      if (ev.type === 'm.room.name' && ev.content && ev.content.name) roomOf(roomId).name = ev.content.name;
    }
  };

  const selectRoom = (roomId) => { const r = roomOf(roomId); r.unread = 0; state.activeRoomId = roomId; emit('active', roomId); };
  const timelineOf = (roomId) => (state.rooms.find((r) => r.roomId === roomId) || { timeline: [] }).timeline;

  return Object.freeze({
    state, subscribe,
    start, stop, pump, sendMessage, selectRoom, timelineOf,
    // the encrypted room bus — arbitrary app events + lightweight signals
    sendRoomEvent, onRoomEvent, sendSignal,
    // room lifecycle — a shared workspace is an invitable room
    createRoom, invite, join, members,
    // exposed for the surface / tests
    _internals: () => ({ store, crypto, client }),
  });
};
