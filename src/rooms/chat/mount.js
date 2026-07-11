// EO: SIG·INS(Field → Entity, Making,Binding) — the chat panel's DOM surface
// chat/mount.js — a self-contained DOM renderer for the chat room, in the same
// vanilla-DOM idiom as reader/tiered-graph.js (the surface mounts it; it owns its own
// markup and styles, and subscribes to the controller's reactive state). Kept out of
// the engine's test path deliberately — it is pure presentation over the controller
// (index.js), which is what the tests exercise. Signed-out or before start() it shows
// a single call to action; live, it is a room list, a timeline, and a composer.
const STYLE_ID = 'eo-chat-style';
const CSS = `
.eo-chat{display:flex;height:100%;min-height:320px;font:14px/1.5 system-ui,sans-serif;color:inherit}
.eo-chat__rooms{width:200px;border-right:1px solid rgba(128,128,128,.25);overflow:auto;flex:0 0 auto}
.eo-chat__room{padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(128,128,128,.12);display:flex;justify-content:space-between;gap:8px}
.eo-chat__room[aria-selected="true"]{background:rgba(128,128,128,.15);font-weight:600}
.eo-chat__unread{background:#3b82f6;color:#fff;border-radius:10px;padding:0 7px;font-size:11px;line-height:18px}
.eo-chat__main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0}
.eo-chat__log{flex:1 1 auto;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:6px}
.eo-chat__msg{max-width:78%;padding:6px 10px;border-radius:12px;background:rgba(128,128,128,.15);align-self:flex-start;word-wrap:break-word}
.eo-chat__msg--mine{align-self:flex-end;background:#3b82f6;color:#fff}
.eo-chat__msg--locked{opacity:.6;font-style:italic}
.eo-chat__who{font-size:11px;opacity:.6;margin-bottom:2px}
.eo-chat__compose{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(128,128,128,.25)}
.eo-chat__compose input{flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit}
.eo-chat__compose button{padding:8px 14px;border-radius:8px;border:0;background:#3b82f6;color:#fff;cursor:pointer}
.eo-chat__empty{margin:auto;text-align:center;opacity:.7;padding:24px}
.eo-chat__badge{font-size:11px;opacity:.65;padding:6px 12px}
`;

// mountChat(root, controller) → an unmount function. `controller` is createChatRoom's
// return value; the mount subscribes to it and re-renders on emit.
export function mountChat(root, controller) {
  if (typeof document === 'undefined' || !root) return () => {};
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, cls, text) => { const e = document.createElement(t); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const wrap = el('div', 'eo-chat');
  const roomsEl = el('div', 'eo-chat__rooms');
  const main = el('div', 'eo-chat__main');
  const badge = el('div', 'eo-chat__badge');
  const log = el('div', 'eo-chat__log');
  const compose = el('div', 'eo-chat__compose');
  const input = el('input'); input.placeholder = 'Message (end-to-end encrypted)…'; input.disabled = true;
  const send = el('button', null, 'Send'); send.disabled = true;
  compose.append(input, send);
  main.append(badge, log, compose);
  wrap.append(roomsEl, main);
  root.innerHTML = ''; root.appendChild(wrap);

  const renderRooms = () => {
    roomsEl.innerHTML = '';
    for (const r of controller.state.rooms) {
      const row = el('div', 'eo-chat__room');
      row.setAttribute('aria-selected', String(r.roomId === controller.state.activeRoomId));
      row.append(el('span', null, r.name || r.roomId));
      if (r.unread) row.append(el('span', 'eo-chat__unread', String(r.unread)));
      row.addEventListener('click', () => { controller.selectRoom(r.roomId); renderRooms(); renderLog(); });
      roomsEl.appendChild(row);
    }
  };

  const renderLog = () => {
    const roomId = controller.state.activeRoomId;
    log.innerHTML = '';
    if (!roomId) { log.appendChild(el('div', 'eo-chat__empty', 'Pick a conversation.')); input.disabled = true; send.disabled = true; return; }
    input.disabled = false; send.disabled = false;
    for (const m of controller.timelineOf(roomId)) {
      const b = el('div', 'eo-chat__msg' + (m.mine ? ' eo-chat__msg--mine' : '') + (m.undecryptable ? ' eo-chat__msg--locked' : ''));
      if (!m.mine) b.appendChild(el('div', 'eo-chat__who', m.sender));
      b.appendChild(el('span', null, m.body));
      log.appendChild(b);
    }
    log.scrollTop = log.scrollHeight;
  };

  const renderBadge = () => {
    const s = controller.state;
    badge.textContent = s.status === 'live'
      ? `🔒 end-to-end encrypted · ${s.userId || ''}${s.persistent ? ' · keys on OPFS' : ' · keys in memory'}`
      : s.status === 'starting' ? 'connecting…'
        : s.error ? `not connected — ${s.error}` : 'signed out';
  };

  const doSend = async () => {
    const text = input.value; if (!text.trim() || !controller.state.activeRoomId) return;
    input.value = ''; await controller.sendMessage(controller.state.activeRoomId, text); renderLog();
  };
  send.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

  const unsub = controller.subscribe(() => { renderRooms(); renderLog(); renderBadge(); });
  renderRooms(); renderLog(); renderBadge();

  return () => { try { unsub(); } catch { /* ignore */ } root.innerHTML = ''; };
}

// mountChatLauncher(host, { chat, matrix }) → an unmount function. A small, isolated
// floating entry point the boot bridge drops into document.body, so E2EE chat is
// reachable without touching the generated dc surface. It appears only when a Matrix
// session is live (reusing the existing archive/matrix login), opens a slide-over
// panel, lazily starts the controller (which initialises libolm on first open), and
// mounts the chat UI into it.
const LAUNCH_STYLE_ID = 'eo-chat-launcher-style';
const LAUNCH_CSS = `
.eo-chat-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:52px;height:52px;border-radius:50%;border:0;background:#3b82f6;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:22px;display:none}
.eo-chat-fab[data-live="1"]{display:block}
.eo-chat-panel{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:min(420px,92vw);height:min(560px,72vh);background:#fff;color:#1b1b22;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.32);overflow:hidden;display:none;flex-direction:column}
.eo-chat-panel[data-open="1"]{display:flex}
.eo-chat-panel__head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(128,128,128,.2);font-weight:650}
.eo-chat-panel__head button{border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit}
.eo-chat-panel__body{flex:1;min-height:0}
@media (prefers-color-scheme:dark){.eo-chat-panel{background:#1b1b22;color:#eee}}
`;

export function mountChatLauncher(host, { chat, matrix } = {}) {
  if (typeof document === 'undefined' || !host || !chat) return () => {};
  if (!document.getElementById(LAUNCH_STYLE_ID)) {
    const st = document.createElement('style'); st.id = LAUNCH_STYLE_ID; st.textContent = LAUNCH_CSS; document.head.appendChild(st);
  }
  const fab = document.createElement('button'); fab.className = 'eo-chat-fab'; fab.title = 'End-to-end encrypted chat'; fab.textContent = '💬';
  const panel = document.createElement('div'); panel.className = 'eo-chat-panel';
  const head = document.createElement('div'); head.className = 'eo-chat-panel__head';
  const title = document.createElement('span'); title.textContent = '🔒 Encrypted chat';
  const close = document.createElement('button'); close.textContent = '×'; close.title = 'Close';
  head.append(title, close);
  const body = document.createElement('div'); body.className = 'eo-chat-panel__body';
  panel.append(head, body);
  host.append(fab, panel);

  let unmountChat = null;
  const live = () => !!(matrix && matrix.isLoggedIn && matrix.isLoggedIn());
  const reflect = () => { fab.setAttribute('data-live', live() ? '1' : '0'); if (!live()) panel.setAttribute('data-open', '0'); };

  const open = async () => {
    panel.setAttribute('data-open', '1');
    const res = await chat.start();
    if (res && res.ok && chat.controller && !unmountChat) unmountChat = mountChat(body, chat.controller);
    else if (!res || !res.ok) body.textContent = 'Could not start chat' + (res && res.error ? `: ${res.error}` : '.');
  };
  fab.addEventListener('click', () => (panel.getAttribute('data-open') === '1' ? panel.setAttribute('data-open', '0') : open()));
  close.addEventListener('click', () => panel.setAttribute('data-open', '0'));

  const unsub = matrix && matrix.subscribe ? matrix.subscribe(reflect) : null;
  reflect();

  return () => {
    try { unsub && unsub(); } catch { /* ignore */ }
    try { unmountChat && unmountChat(); } catch { /* ignore */ }
    fab.remove(); panel.remove();
  };
}
