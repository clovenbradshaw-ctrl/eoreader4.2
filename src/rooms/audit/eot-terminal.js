// EO: NUL(Void,Atmosphere → Void, Clearing) — EOT ledger terminal drawer (DOM)
// The EOT terminal — the ledger, surfaced as a live feed in the running app.
//
// docs/eot-ledger.md. A classic terminal drawer: newest at the bottom, auto-
// tailing, every operation the app performs printed as one EOT line the moment it
// happens — a read, a search, a route, a prompt, a generation, a bind, a veto. It
// reads the ledger (audit/eot-ledger.js) and nothing else; it holds no state the
// ledger doesn't. Because it mounts its own DOM under <body>, outside the React
// root, a re-render never clobbers it.
//
// The door is shown, not just stored: perceiver lines (the world it read — they
// witness) run green; enactor lines (the model's own act — they cannot witness)
// run amber. Click a line to unfold its verbatim payload (the load-bearing prompt
// and output). Export the whole session as a `.eot` document or a `.jsonl` trail.
//
// Pure DOM, no framework, no build step. mountEotTerminal(ledger, opts) → handle.

const ESC = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Print the faces (docs/spec-good-watchmaker.md, migration step 1). The ledger
// line shows the Act face (the operator) alone; this reads the other two off the
// same record — operator(Site, Stance), via the caller-INJECTED notate() at the
// operator's grain — so the terminal a human tails under deadline shows where each
// operation LANDS and HOW it resolves, not just what it does. Injected rather than
// imported: the audit holon is "a pure ring buffer with no transitive imports
// outside itself" (docs/architecture.md), so core's notate() comes in through
// opts.notate; without it the line simply omits the faces. Coherent by
// construction; '?' (never rendered) only if the record carries no operator.
const faceOf = (rec, notate) => {
  if (typeof notate !== 'function') return null;
  try { const f = notate({ op: rec.op }); return f && f !== '?' ? f : null; }
  catch { return null; }
};

// The holonic address of what a line concerns — organ.document.record.parameter, the
// same four-fold "where in the machine" the strip trails on its own rows. Read straight
// off the ledger record, never stamped twice: `organ` is the acting faculty (a murmur
// voicing names itself; otherwise the door — perceiver read the world, enactor is the
// model's own act); `document` is the source/query the op touched (slugged) else the
// session; `record` is the target/minted site; `parameter` is the operand's leaf field.
const slugish = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const leafParam = (rec) => {
  const o = rec.operand || {};
  if (o.relation) return String(o.relation);
  if (o.designation) return String(o.designation);
  if (o.key) return String(o.key);
  if (o.type) return String(o.type);
  if (o.same_as) return 'identity';
  if (Array.isArray(o.parts)) return 'parts';
  if (o.old_terms || o.new_terms) return 'rule';
  if (o.to != null && rec.op !== 'CON') return String(o.to);
  if (o.value !== undefined) return 'value';
  return rec.kind || String(rec.op || '').toLowerCase() || 'op';
};
const addressOf = (rec) => {
  if (!rec) return '';
  const organ = rec.kind === 'murmur' ? 'murmur' : (rec.door === 'perceiver' ? 'perceiver' : 'enactor');
  const raw = rec.raw || {};
  const src = raw.source || raw.query || (Array.isArray(raw.urls) && raw.urls[0]) || null;
  const document = src ? slugish(src) : 'session';
  const record = rec.target ? String(rec.target) : 'session';
  return [organ, document, record, leafParam(rec)].map((s) => String(s).slice(0, 40)).join('.');
};

// Which stream a line belongs to — the terminal's filter bucket. The DOOR is the
// §8 type law (perceiver = the world it read · enactor = the model's own act), but
// the peripheral sense (kind:'murmur') rides the enactor door AND fires continuously,
// so lumped in with real acts it both hides the sparse route/prompt/generate lines
// and, over a session, floods them off the ring. We split it out as its own bucket:
// 'read · world', 'act · model', and 'murmur · sense' each filter independently, so
// the console shows EVERYTHING — and everything EXCEPT the murmur — not one or the
// other. Murmur is still reafferent (its door is unchanged); this is a view, not a law.
export const eotBucket = (rec) => (rec && rec.kind === 'murmur' ? 'murmur' : (rec && rec.door) || 'enactor');

// two-digit clock off the record's epoch ms (no argless Date — ms is on the record)
const clock = (ms) => {
  try { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
  catch { return '--:--:--'; }
};

// light syntax paint over one already-escaped EOT line: the sigils that carry the
// operator, plus the dimmed `@agent ~ts` trailer.
const paint = (eot) => {
  let s = ESC(eot);
  s = s.replace(/(\s@[^\s]+)/g, '<span class="eotl-prov">$1</span>')
       .replace(/(\s~[^\s]+)/g, '<span class="eotl-prov">$1</span>');
  s = s.replace(/^(!(?:sig|clm|seg|syn|eva|rec|nul))\b/, '<span class="eotl-flag">$1</span>');
  s = s.replace(/( : | -&gt; | = | == | \| | &lt;- | =&gt; )/g, '<span class="eotl-sig">$1</span>');
  return s;
};

const CSS = `
.eotl-root{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;height:42vh;min-height:180px;
  display:none;flex-direction:column;background:#0b0f14;color:#c7d0da;
  font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  border-top:1px solid #1e2a37;box-shadow:0 -12px 40px rgba(0,0,0,.45);}
.eotl-root.eotl-open{display:flex;}
.eotl-hdr{display:flex;align-items:center;gap:10px;padding:7px 12px;background:#0f151d;border-bottom:1px solid #1a2532;flex:0 0 auto;flex-wrap:wrap;}
.eotl-title{font-weight:700;color:#e6edf4;letter-spacing:.02em;display:flex;align-items:center;gap:7px;}
.eotl-dot{width:8px;height:8px;border-radius:50%;background:#2ea043;box-shadow:0 0 6px #2ea043;}
.eotl-dot.eotl-paused{background:#8b949e;box-shadow:none;}
.eotl-sub{color:#8b98a8;font-weight:400;}
.eotl-spacer{flex:1 1 auto;}
.eotl-chip{border:1px solid #24303d;background:#121a24;color:#8b98a8;border-radius:6px;padding:3px 9px;cursor:pointer;font:inherit;font-size:11px;}
.eotl-chip:hover{border-color:#33455a;color:#c7d0da;}
.eotl-chip.eotl-on{background:#182634;color:#e6edf4;border-color:#2f6feb;}
.eotl-chip.eotl-perc.eotl-on{border-color:#2ea043;color:#7ee787;}
.eotl-chip.eotl-enac.eotl-on{border-color:#d29922;color:#f0c674;}
.eotl-chip.eotl-murm.eotl-on{border-color:#8a6fbf;color:#c4b3ff;}
.eotl-in{background:#0b1017;border:1px solid #24303d;color:#c7d0da;border-radius:6px;padding:3px 8px;font:inherit;font-size:11px;width:150px;}
.eotl-in::placeholder{color:#8b98a8;}
.eotl-btn{border:1px solid #24303d;background:#121a24;color:#a9b4c2;border-radius:6px;padding:3px 9px;cursor:pointer;font:inherit;font-size:11px;}
.eotl-btn:hover{border-color:#33455a;color:#e6edf4;}
.eotl-body{flex:1 1 auto;overflow-y:auto;padding:6px 0 10px;scroll-behavior:auto;}
.eotl-row{display:grid;grid-template-columns:44px 62px 14px 1fr;gap:8px;padding:1px 12px;white-space:pre-wrap;word-break:break-word;cursor:default;}
.eotl-row:hover{background:#0f1620;}
.eotl-seq{color:#727f90;text-align:right;user-select:none;}
.eotl-time{color:#7d8a99;user-select:none;}
.eotl-door{text-align:center;font-weight:700;user-select:none;}
.eotl-perc .eotl-door{color:#2ea043;}
.eotl-enac .eotl-door{color:#d29922;}
.eotl-murm .eotl-door{color:#8a6fbf;}
.eotl-line{color:#c7d0da;}
.eotl-perc .eotl-line{color:#c9d8cd;}
.eotl-murm .eotl-line{color:#b9b2cc;}
.eotl-murm .eotl-addr{color:#5f567a;}
.eotl-sig{color:#79c0ff;}
.eotl-flag{color:#ff7b72;font-weight:700;}
.eotl-prov{color:#7d8a99;}
.eotl-face{color:#8a6fbf;font-style:italic;}
.eotl-kind{color:#7d8a99;}
.eotl-addr{color:#556072;font-size:11px;opacity:.85;}
.eotl-perc .eotl-addr{color:#4d6a56;}
.eotl-enac .eotl-addr{color:#6a6150;}
.eotl-raw{grid-column:3 / -1;margin:3px 0 5px;padding:7px 9px;background:#070b10;border:1px solid #1a2532;border-radius:6px;color:#8b98a8;font-size:11px;max-height:200px;overflow:auto;display:none;}
.eotl-row.eotl-x .eotl-raw{display:block;}
.eotl-row.eotl-clk{cursor:pointer;}
.eotl-empty{color:#8b98a8;padding:14px 16px;}
.eotl-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147482999;display:inline-flex;align-items:center;gap:7px;
  background:#0b0f14;color:#c7d0da;border:1px solid #24303d;border-radius:9px;padding:8px 12px;cursor:pointer;
  font:12px/1 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 4px 14px rgba(0,0,0,.35);}
.eotl-fab:hover{border-color:#2f6feb;color:#e6edf4;}
.eotl-fab .eotl-fdot{width:7px;height:7px;border-radius:50%;background:#2ea043;box-shadow:0 0 6px #2ea043;}
.eotl-badge{background:#182634;border-radius:20px;padding:1px 7px;color:#9db3d0;font-size:11px;min-width:14px;text-align:center;}
/* Phone (the reader's <760px tier has a bottom nav row + chat composer along the
   bottom, and the chat launcher FAB on the right): collapse to a dot+badge handle on
   the LEFT edge instead of a text pill, so it never covers the launcher or the nav. */
@media (max-width:759px){
  /* Left edge, clear of the chat launcher on the right; raised above the tallest bottom
     cluster (nav row + chat composer) + safe area so it never covers the composer. */
  .eotl-fab{right:auto;left:0;bottom:calc(118px + env(safe-area-inset-bottom));border-radius:0 10px 10px 0;padding:8px 9px;opacity:.82;}
  .eotl-fab .eotl-fab-lbl{display:none;}
  .eotl-root{padding-bottom:env(safe-area-inset-bottom);}
}
`;

export const mountEotTerminal = (ledger, { hotkey = true, startOpen = false, notate = null, fab = true } = {}) => {
  if (typeof document === 'undefined' || !ledger) return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'eotl-root';
  root.setAttribute('role', 'log');
  root.setAttribute('aria-label', 'EOT event ledger');
  root.innerHTML = `
    <div class="eotl-hdr">
      <span class="eotl-title"><span class="eotl-dot" data-live></span>EOT<span class="eotl-sub">· event ledger</span></span>
      <span class="eotl-chip eotl-flt eotl-on" data-door="all">all</span>
      <span class="eotl-chip eotl-flt eotl-perc" data-door="perceiver">▸ read · world</span>
      <span class="eotl-chip eotl-flt eotl-enac" data-door="enactor">◂ act · model</span>
      <span class="eotl-chip eotl-flt eotl-murm" data-door="murmur">∿ murmur · sense</span>
      <input class="eotl-in" data-find placeholder="filter…" />
      <span class="eotl-spacer"></span>
      <span class="eotl-btn" data-act="pause">pause</span>
      <span class="eotl-btn" data-act="eot">export .eot</span>
      <span class="eotl-btn" data-act="jsonl">.jsonl</span>
      <span class="eotl-btn" data-act="clear">clear</span>
      <span class="eotl-btn" data-act="close">close ▾</span>
    </div>
    <div class="eotl-body" data-body><div class="eotl-empty">No operations yet — read a source or ask a question, and the machine will print itself here.</div></div>`;
  document.body.appendChild(root);

  // The floating opener. Optional (fab:false) so a host that already owns a launcher — the
  // murmur strip opens this terminal on click — isn't given a second bottom-corner button
  // beside the audit console's. The drawer + its handle work identically either way.
  let fabEl = null;
  if (fab) {
    fabEl = document.createElement('button');
    fabEl.className = 'eotl-fab';
    fabEl.type = 'button';
    fabEl.innerHTML = `<span class="eotl-fdot"></span><span class="eotl-fab-lbl">EOT ledger</span><span class="eotl-badge" data-badge>0</span>`;
    document.body.appendChild(fabEl);
  }

  const body = root.querySelector('[data-body]');
  const badge = fabEl ? fabEl.querySelector('[data-badge]') : null;
  const liveDot = root.querySelector('[data-live]');
  const findInput = root.querySelector('[data-find]');

  const state = { open: !!startOpen, paused: false, door: 'all', find: '', count: 0, stuck: true };

  const matches = (rec) => {
    if (state.door !== 'all' && eotBucket(rec) !== state.door) return false;
    if (state.find) {
      const hay = `${rec.eot} ${rec.kind || ''} ${rec.agent} ${JSON.stringify(rec.raw || '')}`.toLowerCase();
      if (!hay.includes(state.find)) return false;
    }
    return true;
  };

  const rowEl = (rec) => {
    const el = document.createElement('div');
    const b = eotBucket(rec);
    el.className = `eotl-row eotl-${b === 'perceiver' ? 'perc' : b === 'murmur' ? 'murm' : 'enac'}`;
    const glyph = b === 'perceiver' ? '▸' : b === 'murmur' ? '∿' : '◂';
    const raw = rec.raw && Object.keys(rec.raw).length
      ? `<pre class="eotl-raw">${ESC(JSON.stringify(rec.raw, null, 2))}</pre>` : '';
    if (raw) el.classList.add('eotl-clk');
    const face = faceOf(rec, notate);
    const faceSpan = face
      ? ` <span class="eotl-face" title="operator(Site, Stance) — where it lands · how it resolves">${ESC(face)}</span>`
      : '';
    el.innerHTML =
      `<span class="eotl-seq">${rec.seq}</span>` +
      `<span class="eotl-time">${clock(rec.ts)}</span>` +
      `<span class="eotl-door" title="${b} · ${rec.witness ? 'can witness' : 'cannot witness'}">${glyph}</span>` +
      `<span class="eotl-line">${paint(rec.eot)}${faceSpan}${rec.kind ? ` <span class="eotl-kind">· ${ESC(rec.kind)}</span>` : ''}` +
      ` <span class="eotl-addr" title="organ.document.record.parameter — where in the machine this lands">${ESC(addressOf(rec))}</span></span>` +
      raw;
    if (raw) el.addEventListener('click', () => el.classList.toggle('eotl-x'));
    return el;
  };

  // Re-render the whole visible set (used on filter change / clear). For the live
  // path we append a single row — the common, cheap case.
  const rebuild = () => {
    const recs = ledger.snapshot().filter(matches);
    body.innerHTML = '';
    if (!recs.length) {
      body.innerHTML = '<div class="eotl-empty">No operations match this filter.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of recs) frag.appendChild(rowEl(r));
    body.appendChild(frag);
    if (state.stuck) body.scrollTop = body.scrollHeight;
  };

  const append = (rec) => {
    if (!matches(rec)) return;
    const empty = body.querySelector('.eotl-empty');
    if (empty) body.innerHTML = '';
    body.appendChild(rowEl(rec));
    // cap the DOM at a few thousand rows so a long session stays smooth
    while (body.childElementCount > 4000) body.removeChild(body.firstChild);
    if (state.stuck) body.scrollTop = body.scrollHeight;
  };

  body.addEventListener('scroll', () => {
    state.stuck = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  });

  const setOpen = (v) => {
    state.open = v;
    root.classList.toggle('eotl-open', v);
    if (fabEl) fabEl.style.display = v ? 'none' : 'inline-flex';
    if (v) { rebuild(); }
  };

  // ── controls ──
  root.querySelectorAll('[data-door]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.door = chip.getAttribute('data-door');
      root.querySelectorAll('[data-door]').forEach(c => c.classList.toggle('eotl-on', c === chip));
      rebuild();
    });
  });
  findInput.addEventListener('input', () => { state.find = findInput.value.trim().toLowerCase(); rebuild(); });

  const download = (name, text, type) => {
    try {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* best-effort */ }
  };
  const stamp = () => { try { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); } catch { return 'session'; } };

  root.querySelector('[data-act="pause"]').addEventListener('click', (e) => {
    state.paused = !state.paused;
    e.target.textContent = state.paused ? 'resume' : 'pause';
    liveDot.classList.toggle('eotl-paused', state.paused);
    if (!state.paused) rebuild();
  });
  root.querySelector('[data-act="eot"]').addEventListener('click', () => download(`eot-ledger-${stamp()}.eot`, ledger.exportEot(), 'text/eot'));
  root.querySelector('[data-act="jsonl"]').addEventListener('click', () => download(`eot-ledger-${stamp()}.jsonl`, ledger.exportJsonl(), 'application/x-ndjson'));
  root.querySelector('[data-act="clear"]').addEventListener('click', () => { ledger.clear(); rebuild(); });
  root.querySelector('[data-act="close"]').addEventListener('click', () => setOpen(false));
  if (fabEl) fabEl.addEventListener('click', () => setOpen(true));

  // ── the live feed ──
  const unsub = ledger.subscribe((rec) => {
    state.count = ledger.size;
    if (badge) badge.textContent = String(state.count);
    if (!rec) { if (state.open) rebuild(); return; }   // a clear() notifies with null
    if (state.open && !state.paused) append(rec);
  });

  if (hotkey && typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + backtick toggles the drawer
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); setOpen(!state.open); }
    });
  }

  setOpen(state.open);
  if (badge) badge.textContent = String(ledger.size);

  return {
    root, fab: fabEl,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!state.open),
    destroy: () => { try { unsub(); } catch {} root.remove(); if (fabEl) fabEl.remove(); style.remove(); },
  };
};
