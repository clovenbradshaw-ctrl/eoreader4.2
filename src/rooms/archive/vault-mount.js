// EO: SIG·INS(Field → Entity, Making,Binding) — the media vault's DOM surface
// archive/vault-mount.js — a self-contained panel + floating launcher for the
// encrypted media vault (archive/vault.js), in the same isolated, vanilla-DOM idiom
// as the chat launcher (rooms/chat/mount.js): boot drops a 🗄 button into the page,
// it appears only when a Matrix session is live, and opening it lazily starts the
// vault. Presentation only — the engine (save/open/verify) is what the tests exercise.
//
// The panel can save typed text OR an uploaded file (stored encrypted, only the
// ciphertext leaving the browser), lists the chain newest-first, opens an item back
// (text inline, binary as a download), and shows a live integrity badge from verify().
const STYLE_ID = 'eo-vault-style';
const CSS = `
.eo-vault{display:flex;flex-direction:column;height:100%;min-height:320px;font:14px/1.5 system-ui,sans-serif;color:inherit}
.eo-vault__save{display:flex;flex-direction:column;gap:6px;padding:10px;border-bottom:1px solid rgba(128,128,128,.25)}
.eo-vault__save textarea{width:100%;min-height:52px;resize:vertical;padding:8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit}
.eo-vault__row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.eo-vault__row button{padding:7px 12px;border-radius:8px;border:0;background:#7c3aed;color:#fff;cursor:pointer}
.eo-vault__row button[disabled]{opacity:.5;cursor:default}
.eo-vault__list{flex:1;overflow:auto;padding:6px 10px;display:flex;flex-direction:column;gap:6px}
.eo-vault__item{border:1px solid rgba(128,128,128,.22);border-radius:10px;padding:8px 10px}
.eo-vault__item h4{margin:0 0 2px;font-size:13px;font-weight:650;display:flex;justify-content:space-between;gap:8px}
.eo-vault__meta{font-size:11px;opacity:.6;word-break:break-all}
.eo-vault__item button{margin-top:6px;padding:4px 10px;border-radius:7px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px}
.eo-vault__open{margin-top:6px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;background:rgba(128,128,128,.1);border-radius:7px;padding:6px}
.eo-vault__badge{font-size:11px;padding:6px 12px;border-top:1px solid rgba(128,128,128,.25);opacity:.8}
.eo-vault__empty{margin:auto;opacity:.6;padding:20px;text-align:center}
`;

const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// mountVaultPanel(root, vault) → unmount. Subscribes to the vault controller and
// re-renders the chain on every emit.
export function mountVaultPanel(root, vault) {
  if (typeof document === 'undefined' || !root) return () => {};
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, cls, text) => { const e = document.createElement(t); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const wrap = el('div', 'eo-vault');
  const saveBox = el('div', 'eo-vault__save');
  const ta = el('textarea'); ta.placeholder = 'Text to save, encrypted…';
  const row = el('div', 'eo-vault__row');
  const saveBtn = el('button', null, 'Save encrypted');
  const fileBtn = el('button', null, 'Save a file…'); fileBtn.style.background = 'transparent'; fileBtn.style.border = '1px solid rgba(128,128,128,.4)'; fileBtn.style.color = 'inherit';
  const fileInput = el('input'); fileInput.type = 'file'; fileInput.style.display = 'none';
  const note = el('span', 'eo-vault__meta');
  row.append(saveBtn, fileBtn, note);
  saveBox.append(ta, row, fileInput);
  const list = el('div', 'eo-vault__list');
  const badge = el('div', 'eo-vault__badge');
  wrap.append(saveBox, list, badge);
  root.innerHTML = ''; root.appendChild(wrap);

  const setNote = (t) => { note.textContent = t || ''; };

  const doSaveText = async () => {
    const text = ta.value; if (!text.trim()) return;
    saveBtn.disabled = true; setNote('encrypting…');
    const r = await vault.save(text, { name: 'note', mime: 'text/plain' });
    saveBtn.disabled = false;
    setNote(r.ok ? (r.deduped ? 'already saved (same content)' : 'saved') : `save failed: ${r.error || ''}`);
    if (r.ok) ta.value = '';
    render();
  };
  const doSaveFile = async (file) => {
    setNote(`encrypting ${file.name}…`);
    const buf = await file.arrayBuffer();
    const r = await vault.save(new Uint8Array(buf), { name: file.name, mime: file.type || 'application/octet-stream' });
    setNote(r.ok ? (r.deduped ? 'already saved (same content)' : `saved ${file.name}`) : `save failed: ${r.error || ''}`);
    render();
  };
  saveBtn.addEventListener('click', doSaveText);
  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files[0]) doSaveFile(fileInput.files[0]); fileInput.value = ''; });

  const openInto = async (block, holder) => {
    holder.textContent = 'opening…';
    const r = await vault.open(block.index);
    if (!r.ok) { holder.textContent = `⚠ ${r.error}`; return; }
    if (r.text != null) { holder.textContent = r.text; return; }
    // Binary — offer a download link built from a blob URL.
    holder.textContent = '';
    const blob = new Blob([r.bytes], { type: block.mime || 'application/octet-stream' });
    const a = el('a', null, `download ${block.name || 'file'} (${fmtBytes(r.bytes.length)})`);
    a.href = URL.createObjectURL(blob); a.download = block.name || `vault-${block.index}`;
    holder.appendChild(a);
  };

  const render = () => {
    const blocks = vault.list();
    list.innerHTML = '';
    if (!blocks.length) { list.appendChild(el('div', 'eo-vault__empty', 'Nothing saved yet.')); return; }
    for (const b of blocks) {
      const item = el('div', 'eo-vault__item');
      const h = el('h4'); h.append(el('span', null, b.name || `item #${b.index}`), el('span', null, `#${b.index}`));
      const meta = el('div', 'eo-vault__meta', `${b.mime || 'bytes'} · ${fmtBytes(b.size || 0)} · ${(b.at || '').slice(0, 19).replace('T', ' ')}`);
      const meta2 = el('div', 'eo-vault__meta', `link ${String(b.prev).slice(0, 10)}… → ${String(b.hash).slice(0, 10)}…`);
      const open = el('button', null, 'Open');
      const holder = el('div', 'eo-vault__open'); holder.style.display = 'none';
      open.addEventListener('click', () => { holder.style.display = 'block'; openInto(b, holder); });
      item.append(h, meta, meta2, open, holder);
      list.appendChild(item);
    }
  };

  const renderBadge = async () => {
    const s = vault.state;
    if (s.status !== 'live') { badge.textContent = s.error ? `not open — ${s.error}` : 'signed out'; return; }
    const v = await vault.verify();
    badge.textContent = v.ok
      ? `🔒 ${v.length} block${v.length === 1 ? '' : 's'} · chain verified${s.persistent ? ' · on OPFS' : ' · in memory'}`
      : `⚠ chain broken at block ${v.brokenAt} (${v.reason})`;
  };

  const rerender = () => { render(); renderBadge(); };
  const unsub = vault.subscribe(rerender);
  rerender();
  return () => { try { unsub(); } catch { /* ignore */ } root.innerHTML = ''; };
}

// mountVaultLauncher(host, { vault, matrix }) → unmount. The floating 🗄 entry point.
const LAUNCH_STYLE_ID = 'eo-vault-launcher-style';
const LAUNCH_CSS = `
.eo-vault-fab{position:fixed;right:20px;bottom:82px;z-index:2147483000;width:52px;height:52px;border-radius:50%;border:0;background:#7c3aed;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:20px;display:none}
.eo-vault-fab[data-live="1"]{display:block}
.eo-vault-panel{position:fixed;right:20px;bottom:146px;z-index:2147483000;width:min(420px,92vw);height:min(560px,72vh);background:#fff;color:#1b1b22;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.32);overflow:hidden;display:none;flex-direction:column}
.eo-vault-panel[data-open="1"]{display:flex}
.eo-vault-panel__head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(128,128,128,.2);font-weight:650}
.eo-vault-panel__head button{border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit}
.eo-vault-panel__body{flex:1;min-height:0}
@media (prefers-color-scheme:dark){.eo-vault-panel{background:#1b1b22;color:#eee}}
`;

export function mountVaultLauncher(host, { vault, matrix } = {}) {
  if (typeof document === 'undefined' || !host || !vault) return () => {};
  if (!document.getElementById(LAUNCH_STYLE_ID)) {
    const st = document.createElement('style'); st.id = LAUNCH_STYLE_ID; st.textContent = LAUNCH_CSS; document.head.appendChild(st);
  }
  const fab = document.createElement('button'); fab.className = 'eo-vault-fab'; fab.title = 'Encrypted media vault'; fab.textContent = '🗄';
  const panel = document.createElement('div'); panel.className = 'eo-vault-panel';
  const head = document.createElement('div'); head.className = 'eo-vault-panel__head';
  const title = document.createElement('span'); title.textContent = '🔒 Encrypted vault';
  const close = document.createElement('button'); close.textContent = '×'; close.title = 'Close';
  head.append(title, close);
  const body = document.createElement('div'); body.className = 'eo-vault-panel__body';
  panel.append(head, body);
  host.append(fab, panel);

  let unmountPanel = null;
  const live = () => !!(matrix && matrix.isLoggedIn && matrix.isLoggedIn());
  const reflect = () => { fab.setAttribute('data-live', live() ? '1' : '0'); if (!live()) panel.setAttribute('data-open', '0'); };

  const open = async () => {
    panel.setAttribute('data-open', '1');
    const res = await vault.start();
    if (res && res.ok && !unmountPanel) unmountPanel = mountVaultPanel(body, vault);
    else if (!res || !res.ok) body.textContent = 'Could not open vault' + (res && res.error ? `: ${res.error}` : '.');
  };
  fab.addEventListener('click', () => (panel.getAttribute('data-open') === '1' ? panel.setAttribute('data-open', '0') : open()));
  close.addEventListener('click', () => panel.setAttribute('data-open', '0'));

  const unsub = matrix && matrix.subscribe ? matrix.subscribe(reflect) : null;
  reflect();

  return () => {
    try { unsub && unsub(); } catch { /* ignore */ }
    try { unmountPanel && unmountPanel(); } catch { /* ignore */ }
    fab.remove(); panel.remove();
  };
}
