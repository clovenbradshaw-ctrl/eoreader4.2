// EO: SIG(Field → Lens, Tending) — the binvis launcher, the reader room's app-glue
// The seam between the pure binvis surface (src/surfaces/binvis — Aldo Cortesi's
// byte-structure render) and a real loaded document. The surface holon knows only bytes;
// THIS knows how to get the bytes of any source the reader holds (app.sourceOriginalExport
// — a PDF/audio/video's true bytes, or a text source's own text as UTF-8) and paints the
// picture beside a source picker, a layer switch, a legend, and a live byte readout.
//
// Two entrances:
//   mountBinvis(el, { app, sn, layer })   — drop the surface into any element (a panel, a
//                                            future dc-surface tab). Returns { destroy, show }.
//   mountBinvisLauncher(host, { app })     — the floating launcher: a corner button that
//                                            opens the surface over whatever is loaded, so it
//                                            is visible in the main app with no dc-surface edit.
//
// Everything the surface can't assert it doesn't: this reads the record, paints, and wires
// clicks back through callbacks. It appends nothing to any log.

import { buildScene, renderToContainer, LAYERS, DEFAULT_LAYER } from '../../surfaces/binvis/index.js';

const STYLE_ID = 'eo-binvis-style';
const MAX_BYTES = 6 * 1024 * 1024;   // read at most 6 MB — past that we sample the head and say so

const CSS = `
.eo-binvis-fab{position:fixed;left:18px;bottom:66px;z-index:2147482880;display:flex;align-items:center;gap:7px;
  padding:9px 12px;border:1px solid #263042;border-radius:9px;background:#0f1420;color:#c7d2e2;cursor:pointer;
  font:600 12px/1 ui-sans-serif,system-ui,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.35)}
.eo-binvis-fab:hover{background:#151d2c;color:#eaf1fb}
.eo-binvis-fab svg{display:block}
@media (max-width:640px){.eo-binvis-fab{left:10px;bottom:calc(58px + env(safe-area-inset-bottom));padding:8px}}
.eo-binvis{position:fixed;right:0;top:0;bottom:0;width:min(430px,94vw);z-index:2147482881;display:none;
  flex-direction:column;background:#0b0f18;color:#c9d3e2;border-left:1px solid #1c2333;
  box-shadow:-8px 0 30px rgba(0,0,0,.4);font:13px/1.5 ui-sans-serif,system-ui,sans-serif}
.eo-binvis.open{display:flex}
.eo-binvis__head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #1c2333}
.eo-binvis__title{font-weight:700;font-size:13px;color:#eaf1fb;letter-spacing:.01em}
.eo-binvis__sub{font-size:11px;color:#6f7d92}
.eo-binvis__x{margin-left:auto;background:none;border:1px solid #263042;color:#8b98ad;border-radius:6px;
  width:26px;height:26px;cursor:pointer;font-size:15px;line-height:1}
.eo-binvis__x:hover{color:#eaf1fb;border-color:#3a4863}
.eo-binvis__body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px}
.eo-binvis__row{display:flex;flex-direction:column;gap:5px}
.eo-binvis__lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5f6d82}
.eo-binvis select{background:#0f1420;color:#dce4f0;border:1px solid #263042;border-radius:7px;padding:7px 9px;font:inherit;width:100%}
.eo-binvis__layers{display:flex;gap:6px;flex-wrap:wrap}
.eo-binvis__layer{padding:6px 10px;border:1px solid #263042;border-radius:999px;background:#0f1420;color:#9fb0c6;
  font:600 11.5px/1 inherit;cursor:pointer}
.eo-binvis__layer.on{background:#1b2740;color:#eaf1fb;border-color:#3f5680}
.eo-binvis__layer:disabled{opacity:.42;cursor:not-allowed}
.eo-binvis__stage{display:flex;justify-content:center;padding:6px;background:#05070c;border:1px solid #161d2b;border-radius:10px}
.eo-binvis__stage canvas{border-radius:4px;background:#05070c}
.eo-binvis__cap{font-size:11px;color:#8b98ad;text-align:center}
.eo-binvis__read{min-height:34px;font-size:11.5px;color:#aeb9cb;background:#0f1420;border:1px solid #1c2333;
  border-radius:8px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.eo-binvis__legend{display:flex;flex-direction:column;gap:4px}
.eo-binvis__leg{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#9fb0c6}
.eo-binvis__sw{width:12px;height:12px;border-radius:3px;flex:none;border:1px solid rgba(255,255,255,.12)}
.eo-binvis__bar{height:12px;border-radius:4px;border:1px solid rgba(255,255,255,.12)}
.eo-binvis__ends{display:flex;justify-content:space-between;font-size:10.5px;color:#6f7d92;margin-top:2px}
.eo-binvis__leg .n{margin-left:auto;color:#6f7d92;font-variant-numeric:tabular-nums}
.eo-binvis__note{font-size:11px;color:#6f7d92;line-height:1.5}
.eo-binvis__empty{padding:30px 12px;text-align:center;color:#6f7d92;font-size:12.5px}
`;

const ensureStyle = (doc) => {
  if (doc.getElementById(STYLE_ID)) return;
  const st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; doc.head.appendChild(st);
};

const el = (doc, tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const hex = (n) => '0x' + n.toString(16).toUpperCase();
const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

// Pull a source's bytes: the true original bytes when the reader kept them (PDF/audio/
// video), else the admitted text as UTF-8. Returns { bytes, truncated, total }.
const bytesOfSource = async (app, sn) => {
  let bytes = null, total = 0;
  try {
    const orig = await app.sourceOriginalExport(sn);
    if (orig && orig.bytes) bytes = orig.bytes instanceof Uint8Array ? orig.bytes : new Uint8Array(orig.bytes);
    else if (orig && typeof orig.text === 'string') bytes = new TextEncoder().encode(orig.text);
  } catch { /* fall through to the registry text */ }
  if (!bytes) {
    const src = app.sourceBySn ? app.sourceBySn(sn) : null;
    bytes = new TextEncoder().encode(String((src && src.text) || ''));
  }
  total = bytes.length;
  const truncated = total > MAX_BYTES;
  if (truncated) bytes = bytes.subarray(0, MAX_BYTES);
  return { bytes, truncated, total };
};

// mountBinvis — the surface itself, into `el`. Reusable (launcher below, or a dc tab).
export const mountBinvis = (host, { app, sn = null, layer = DEFAULT_LAYER, display = 340 } = {}) => {
  const doc = host.ownerDocument || document;
  ensureStyle(doc);
  const root = el(doc, 'div', 'eo-binvis__body');
  host.appendChild(root);

  let curSn = sn, curLayer = layer, token = 0, handle = null;

  const sources = () => ((app && app.state && app.state.sources) || []);
  const pick = () => {
    const list = sources();
    if (!list.length) return null;
    return list.some((s) => s.sn === curSn) ? curSn : list[list.length - 1].sn;   // default: most recent
  };

  const render = () => {
    root.innerHTML = '';
    const list = sources();
    if (!list.length) {
      root.appendChild(el(doc, 'div', 'eo-binvis__empty', 'No document loaded yet. Record a URL, import a file, or paste text — then reopen this to see its byte structure.'));
      return;
    }
    curSn = pick();

    // source picker
    const srow = el(doc, 'div', 'eo-binvis__row');
    srow.appendChild(el(doc, 'div', 'eo-binvis__lbl', 'Document'));
    const sel = el(doc, 'select');
    for (const s of list) {
      const o = el(doc, 'option', null, `${s.title || 'source ' + s.sn}${s.kind ? '  ·  ' + s.kind : ''}`);
      o.value = String(s.sn); if (s.sn === curSn) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => { curSn = Number(sel.value); paint(); });
    srow.appendChild(sel); root.appendChild(srow);

    // layer switch
    const lrow = el(doc, 'div', 'eo-binvis__row');
    lrow.appendChild(el(doc, 'div', 'eo-binvis__lbl', 'Layer'));
    const chips = el(doc, 'div', 'eo-binvis__layers');
    for (const k of Object.keys(LAYERS)) {
      const L = LAYERS[k];
      const b = el(doc, 'button', 'eo-binvis__layer' + (k === curLayer ? ' on' : ''), L.label + (L.available ? '' : ' · soon'));
      b.title = L.blurb; b.disabled = !L.available;
      b.addEventListener('click', () => { if (!L.available) return; curLayer = k; paint(); });
      chips.appendChild(b);
    }
    lrow.appendChild(chips); root.appendChild(lrow);

    // stage + caption + readout + legend + note (filled by paint())
    const stage = el(doc, 'div', 'eo-binvis__stage'); root.appendChild(stage);
    const cap = el(doc, 'div', 'eo-binvis__cap'); root.appendChild(cap);
    const read = el(doc, 'div', 'eo-binvis__read', 'Hover the mosaic to name the bytes under the pointer.'); root.appendChild(read);
    const legend = el(doc, 'div', 'eo-binvis__legend'); root.appendChild(legend);
    const note = el(doc, 'div', 'eo-binvis__note'); root.appendChild(note);

    const paint = async () => {
      // reflect the active layer chip without a full re-render
      chips.querySelectorAll('.eo-binvis__layer').forEach((c, i) => c.classList.toggle('on', Object.keys(LAYERS)[i] === curLayer));
      const my = ++token;
      cap.textContent = 'reading bytes…'; stage.innerHTML = '';
      const { bytes, truncated, total } = await bytesOfSource(app, curSn);
      if (my !== token) return;   // a newer pick/layer won
      const onHover = (info) => {
        if (!info) { read.textContent = 'Hover the mosaic to name the bytes under the pointer.'; return; }
        const cls = info.length === 1 ? '' : ' · ' + info.length + ' bytes';
        read.textContent = `offset ${hex(info.offset)} (${info.offset.toLocaleString()})${cls}`;
      };
      handle = renderToContainer(bytes, stage, { layer: curLayer, display, onHover, onNavigate: onHover });
      const sc = handle.scene;
      const per = sc.bucket === 1 ? '1 byte / pixel' : `≈ ${sc.bucket.toLocaleString()} bytes / pixel`;
      cap.textContent = `${kb(total)}${truncated ? ' (head sampled)' : ''} · ${sc.side}×${sc.side} Hilbert · ${per}`;
      legend.innerHTML = '';
      if (sc.legendKind === 'gradient' && sc.gradient) {
        const bar = el(doc, 'div', 'eo-binvis__bar');
        bar.style.background = `linear-gradient(90deg,${sc.gradient.map((s) => `rgb(${s.color.join(',')}) ${Math.round(s.at * 100)}%`).join(',')})`;
        legend.appendChild(bar);
        const ends = el(doc, 'div', 'eo-binvis__ends');
        ends.appendChild(el(doc, 'span', null, 'low entropy — ordered')); ends.appendChild(el(doc, 'span', null, 'high — packed'));
        legend.appendChild(ends);
      } else {
        for (const L of sc.legend) {
          const row = el(doc, 'div', 'eo-binvis__leg');
          const sw = el(doc, 'span', 'eo-binvis__sw'); sw.style.background = `rgb(${L.color.join(',')})`;
          row.appendChild(sw); row.appendChild(el(doc, 'span', null, L.label));
          const pct = sc.n ? Math.round((L.count / sc.n) * 100) : 0;
          row.appendChild(el(doc, 'span', 'n', `${pct}%`));
          legend.appendChild(row);
        }
      }
      note.textContent = truncated
        ? `Showing the first ${kb(MAX_BYTES)} of ${kb(total)}.`
        : (curLayer === DEFAULT_LAYER ? "Structure layer — Aldo Cortesi's binvis byte-class colouring." : LAYERS[curLayer].blurb);
    };
    paint();
  };

  render();
  const unsub = (app && app.subscribe) ? app.subscribe((kind) => { if (kind === 'record' || kind === 'source' || kind === 'log') render(); }) : () => {};
  return {
    show: (nextSn) => { if (nextSn != null) curSn = nextSn; render(); },
    destroy: () => { try { unsub(); } catch {} try { handle && handle.destroy(); } catch {} host.innerHTML = ''; },
  };
};

// mountBinvisLauncher — the floating launcher. A corner button opens the surface as a
// right-docked panel over whatever the reader has loaded. Idempotent per host.
export const mountBinvisLauncher = (host, { app } = {}) => {
  const doc = host.ownerDocument || document;
  if (doc.querySelector('.eo-binvis-fab')) return () => {};
  ensureStyle(doc);

  const fab = el(doc, 'button', 'eo-binvis-fab');
  fab.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">'
    + '<rect x="0" y="0" width="6" height="6" rx="1" fill="#4682dc"/><rect x="8" y="0" width="6" height="6" rx="1" fill="#5abe6e"/>'
    + '<rect x="0" y="8" width="6" height="6" rx="1" fill="#d74b46"/><rect x="8" y="8" width="6" height="6" rx="1" fill="#ecedf0"/></svg>'
    + '<span>Structure</span>';
  fab.title = "Byte-structure view (Aldo Cortesi's binvis) of any loaded document";

  const panel = el(doc, 'div', 'eo-binvis');
  const head = el(doc, 'div', 'eo-binvis__head');
  const titles = el(doc, 'div');
  titles.appendChild(el(doc, 'div', 'eo-binvis__title', 'Byte structure'));
  titles.appendChild(el(doc, 'div', 'eo-binvis__sub', "binvis · Hilbert curve · structure + entropy"));
  head.appendChild(titles);
  const x = el(doc, 'button', 'eo-binvis__x', '×');
  head.appendChild(x);
  panel.appendChild(head);

  host.appendChild(fab); host.appendChild(panel);

  let surface = null;
  const open = () => {
    panel.classList.add('open');
    if (!surface) surface = mountBinvis(panel, { app });
    else surface.show();
  };
  const close = () => panel.classList.remove('open');
  fab.addEventListener('click', () => (panel.classList.contains('open') ? close() : open()));
  x.addEventListener('click', close);

  return () => { try { surface && surface.destroy(); } catch {} fab.remove(); panel.remove(); };
};
