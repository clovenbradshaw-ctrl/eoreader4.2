// EO: INS·SIG(Void → Entity, Making,Binding) — optional Matrix account identity
// archive/matrix.js — the OPTIONAL login. A DOM-free Matrix client that trades a
// password for an access token, carries the resulting identity, and hands that
// token to the archive deposit (deposit.js) so a source can be pushed to the
// Matrix-gated ingest webhook. The reader works fully signed-out; signing in only
// unlocks the permanent archive-to-Archive.org path (the n8n `archiveo` webhook's
// "Verify Matrix ID" node validates exactly this token against the homeserver's
// whoami — see the genome-webhooks flow).
//
// Everything is injectable and offline-safe: `fetch`, `storage`, and `now` come in
// as options (the browser passes the real ones; tests pass fakes). Nothing at
// import time touches the network or the DOM. Login and logout NEVER throw — they
// return a plain { ok, ... } and move the session's status; a network fault leaves
// a persisted session standing (you stay "signed in" offline) rather than logging
// you out on a hiccup. The secret access token lives in a closure, never on the
// reactive `state` the surface renders — the surface only ever sees the user id.
//
// SECURITY: the homeserver is the identity authority. We default it server-side
// (hyphae.social, matching the webhook) and only ever discover a DIFFERENT one
// from the domain the user typed in their own @user:server — never from an
// attacker-supplied field, so no one can point us at a homeserver they control
// and forge an identity the webhook would then trust.

// The homeserver the webhook validates against (its "Verify Matrix ID" node fixes
// the same one). Overridable per session; a full @user:server discovers its own.
export const DEFAULT_HOMESERVER = 'https://hyphae.social';

const STORAGE_KEY = 'eo_matrix_session';

// Trim a homeserver to a bare origin — no trailing slash, https assumed when the
// user typed a naked domain. `https://hs/` and `hs` both land on `https://hs`.
const normalizeBase = (hs) => {
  let s = String(hs || '').trim();
  if (!s) return DEFAULT_HOMESERVER;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
};

// Split a Matrix user id into its parts. `@michael:hyphae.social` →
// { local:'michael', server:'hyphae.social' }. A bare localpart yields no server.
export const parseUserId = (raw) => {
  const s = String(raw || '').trim();
  const m = /^@?([^:@\s]+):([^\s/]+)$/.exec(s);
  if (m) return { local: m[1], server: m[2], full: `@${m[1]}:${m[2]}` };
  return { local: s.replace(/^@/, ''), server: null, full: null };
};

const isFullId = (raw) => !!parseUserId(raw).server;

// A localStorage-shaped store that never throws (browser passes the real one;
// Node/tests can pass a Map-backed fake, or none at all → an in-memory shim).
const memoryStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
};
const safeStore = (storage) => {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return memoryStore();
};

const nowIso = (now) => {
  try { return new Date(typeof now === 'function' ? now() : Date.now()).toISOString(); }
  catch { return null; }
};

// Discover the real homeserver base URL for a server_name via the well-known
// document (a homeserver may live at a different host than its name — e.g.
// hyphae.social delegating to matrix.hyphae.social). Best-effort: any failure
// falls back to https://<server_name>, which is correct for the common case.
const discoverHomeserver = async (server, fetchImpl) => {
  const fallback = normalizeBase(server);
  if (!fetchImpl) return fallback;
  try {
    const res = await fetchImpl(`https://${server}/.well-known/matrix/client`, {
      method: 'GET', headers: { Accept: 'application/json' },
    });
    if (!res || res.ok === false) return fallback;
    const j = await res.json();
    const base = j && j['m.homeserver'] && j['m.homeserver'].base_url;
    return base ? normalizeBase(base) : fallback;
  } catch { return fallback; }
};

// Pull the human-readable error out of a Matrix error body (M_FORBIDDEN etc.),
// falling back to a status-derived line. Matrix errors are { errcode, error }.
const matrixError = async (res, dflt) => {
  try {
    const j = await res.json();
    if (j && (j.error || j.errcode)) return String(j.error || j.errcode);
  } catch { /* not json */ }
  return dflt || `request failed (${res && res.status})`;
};

// createMatrixSession({ fetch, storage, now, homeserver, deviceName }) → the
// optional-login controller the boot bridge exposes as window.EO.matrix and the
// surface renders. Reactive like the reader app: subscribe once, re-render on emit.
export const createMatrixSession = ({
  fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  storage = null,
  now = null,
  homeserver = DEFAULT_HOMESERVER,
  deviceName = 'EO Reader',
} = {}) => {
  const store = safeStore(storage);
  const defaultBase = normalizeBase(homeserver);

  // The secret half lives here, never on `state`. `state` is what the surface sees.
  let session = null;   // { accessToken, userId, deviceId, homeserver, at }
  const state = {
    status: 'anon',     // 'anon' | 'authing' | 'live' | 'error'
    userId: null,
    deviceId: null,
    homeserver: defaultBase,
    error: null,
  };

  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = () => { for (const fn of subs) { try { fn(state); } catch { /* surface's problem */ } } };

  const setState = (patch) => { Object.assign(state, patch); emit(); };

  const applySession = (s) => {
    session = s;
    setState({
      status: 'live', userId: s.userId, deviceId: s.deviceId || null,
      homeserver: s.homeserver, error: null,
    });
  };

  const clear = () => {
    session = null;
    setState({ status: 'anon', userId: null, deviceId: null, error: null });
  };

  const persist = () => {
    try {
      if (session) store.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...session }));
      else store.removeItem(STORAGE_KEY);
    } catch { /* private mode / quota — session still stands in memory */ }
  };

  // Read a persisted session back into memory WITHOUT a network call, so a signed-in
  // user is still signed in offline and on the next boot. Returns the restored user
  // id (or null). Pair with revalidate() to lazily drop a token the server rejected.
  const restore = () => {
    let raw = null;
    try { raw = store.getItem(STORAGE_KEY); } catch { raw = null; }
    if (!raw) return null;
    let obj = null;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    if (!obj || !obj.accessToken || !obj.userId) { persistClearBad(); return null; }
    applySession({
      accessToken: String(obj.accessToken),
      userId: String(obj.userId),
      deviceId: obj.deviceId ? String(obj.deviceId) : null,
      homeserver: normalizeBase(obj.homeserver || defaultBase),
      at: obj.at || null,
    });
    return session.userId;
  };
  const persistClearBad = () => { try { store.removeItem(STORAGE_KEY); } catch { /* ignore */ } };

  // Validate the current token against the homeserver's whoami — the same check the
  // webhook makes. A DEFINITIVE 401 (bad/expired token) clears the session; a network
  // error is left alone (offline ≠ logged out). Returns { ok, userId?, error? }.
  const whoami = async () => {
    if (!session) return { ok: false, error: 'not signed in' };
    if (!fetchImpl) return { ok: true, userId: session.userId, offline: true };
    let res;
    try {
      res = await fetchImpl(`${session.homeserver}/_matrix/client/v3/account/whoami`, {
        method: 'GET', headers: { Authorization: 'Bearer ' + session.accessToken, Accept: 'application/json' },
      });
    } catch (e) {
      return { ok: false, error: 'network', offline: true };   // keep the session
    }
    if (res.status === 401) { clear(); persist(); return { ok: false, error: 'expired' }; }
    if (res.ok === false) return { ok: false, error: await matrixError(res, 'whoami failed') };
    let j = null; try { j = await res.json(); } catch { /* ignore */ }
    const uid = j && j.user_id;
    if (!uid) return { ok: false, error: 'no user' };
    if (uid !== session.userId) applySession({ ...session, userId: uid, deviceId: j.device_id || session.deviceId });
    return { ok: true, userId: uid };
  };

  // Restore, then revalidate in the background. The returned promise resolves to the
  // whoami result; callers who don't care can ignore it (boot does exactly this).
  const restoreAndRevalidate = () => {
    const uid = restore();
    if (!uid) return Promise.resolve({ ok: false, error: 'anon' });
    return whoami();
  };

  // Trade a password for a token. `id` is a localpart ("michael") or a full
  // @user:server; a full id discovers ITS OWN homeserver, otherwise the session's
  // default (or an explicitly passed `homeserver`) is used. Never throws.
  const login = async ({ id, user, password, homeserver: hsOverride = null } = {}) => {
    const who = String(id ?? user ?? '').trim();
    const pass = String(password ?? '');
    if (!who || !pass) {
      setState({ status: 'error', error: 'Enter a username and password.' });
      return { ok: false, error: 'missing credentials' };
    }
    if (!fetchImpl) {
      setState({ status: 'error', error: 'No network available for sign-in.' });
      return { ok: false, error: 'offline' };
    }

    setState({ status: 'authing', error: null });

    // Resolve the homeserver: an explicit override wins; a full @user:server
    // discovers its own; otherwise the session default.
    const parsed = parseUserId(who);
    let base;
    if (hsOverride) base = normalizeBase(hsOverride);
    else if (parsed.server) base = await discoverHomeserver(parsed.server, fetchImpl);
    else base = defaultBase;

    const body = {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: isFullId(who) ? parsed.full : parsed.local },
      password: pass,
      initial_device_display_name: deviceName,
    };

    let res;
    try {
      res = await fetchImpl(`${base}/_matrix/client/v3/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const msg = 'Could not reach ' + base + '.';
      setState({ status: 'error', error: msg, homeserver: base });
      return { ok: false, error: msg };
    }

    if (res.ok === false) {
      const msg = res.status === 403 ? 'Incorrect username or password.'
        : await matrixError(res, 'Sign-in failed.');
      setState({ status: 'error', error: msg, homeserver: base });
      return { ok: false, error: msg, status: res.status };
    }

    let j = null; try { j = await res.json(); } catch { /* ignore */ }
    if (!j || !j.access_token || !j.user_id) {
      setState({ status: 'error', error: 'Homeserver returned no token.', homeserver: base });
      return { ok: false, error: 'no token' };
    }

    applySession({
      accessToken: String(j.access_token),
      userId: String(j.user_id),
      deviceId: j.device_id ? String(j.device_id) : null,
      homeserver: base,
      at: nowIso(now),
    });
    persist();
    return { ok: true, userId: session.userId };
  };

  // Invalidate the token on the homeserver (best-effort) and clear locally. The
  // local clear ALWAYS happens, even if the network call fails — signing out must
  // never leave you stuck signed in. Never throws.
  const logout = async () => {
    const s = session;
    clear();
    persist();
    if (s && fetchImpl) {
      try {
        await fetchImpl(`${s.homeserver}/_matrix/client/v3/logout`, {
          method: 'POST', headers: { Authorization: 'Bearer ' + s.accessToken, Accept: 'application/json' },
        });
      } catch { /* token dies with the local clear regardless */ }
    }
    return { ok: true };
  };

  // The token, for the deposit path. Null when signed out — callers gate on it.
  const token = () => (session ? session.accessToken : null);
  const identity = () => (session
    ? { userId: session.userId, deviceId: session.deviceId, homeserver: session.homeserver, token: session.accessToken }
    : null);
  const isLoggedIn = () => !!session;

  return Object.freeze({
    state, subscribe,
    login, logout, whoami, restore, restoreAndRevalidate,
    token, identity, isLoggedIn,
  });
};
