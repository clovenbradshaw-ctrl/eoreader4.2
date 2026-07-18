// EO: SIG(Field → Lens, Tending) — the binvis launcher, the reader room's app-glue
// The seam between the pure binvis surface (src/surfaces/binvis — Aldo Cortesi's byte-structure
// render) and a real loaded document. The surface holon knows only bytes; THIS knows how to get
// the bytes of any source the reader holds (app.sourceOriginalExport — a PDF/audio/video's true
// bytes, or a text source's own text as UTF-8) and paints the picture beside a source picker, a
// layer switch, a legend, and a live byte readout. One entrance:
//   mountBinvis(el, { app, sn, layer })  — drop the surface into any element. Returns { destroy, show }.
// The surface reads the record, paints, wires clicks through callbacks, and logs nothing.

import { renderToContainer, LAYERS, DEFAULT_LAYER } from '../../surfaces/binvis/index.js';
import { bytesOfSource, readingSignificance, MAX_BYTES } from './binvis-data.js';

// Re-exported so the byte/signal seam stays reachable as one holon's public surface (tests +
// any consumer import from here); the implementations live in binvis-data.js.
export { bytesOfSource, readingSignificance };

const STYLE_ID = 'eo-binvis-style';

const CSS = `
.eo-binvis__body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px}
.eo-binvis__row{display:flex;flex-direction:column;gap:5px}
.eo-binvis__lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5f6d82}
.eo-binvis select{background:#0f1420;color:#dce4f0;border:1px solid #263042;border-radius:7px;padding:7px 9px;font:inherit;width:100%}
.eo-binvis__layers{display:flex;gap:6px;flex-wrap:wrap}
.eo-binvis__layer{padding:6px 10px;border:1px solid #263042;border-radius:999px;background:#0f1420;color:#9fb0c6;font:600 11.5px/1 inherit;cursor:pointer}
.eo-binvis__layer.on{background:#1b2740;color:#eaf1fb;border-color:#3f5680}
.eo-binvis__layer:disabled{opacity:.42;cursor:not-allowed}
.eo-binvis__stage{display:flex;justify-content:center;padding:6px;background:#05070c;border:1px solid #161d2b;border-radius:10px}
.eo-binvis__stage canvas{border-radius:4px;background:#05070c}
.eo-binvis__cap{font-size:11px;color:#8b98ad;text-align:center}
.eo-binvis__read{min-height:34px;font-size:11.5px;color:#aeb9cb;background:#0f1420;border:1px solid #1c2333;border-radius:8px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
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

// mountBinvis — the surface itself, into `el`. Reusable (launcher below, or a dc tab). Pass
// `pickSource: false` to lock the surface to one source and drop the picker — the source-viewer
// tab already IS a single source, so its Structure tab scopes here and re-scopes via `show(sn)`.
export const mountBinvis = (host, { app, sn = null, layer = DEFAULT_LAYER, display = 340, pickSource = true } = {}) => {
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

    // source picker — omitted when the surface is locked to one source (a source-viewer tab)
    if (pickSource) {
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
    }

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
      const sig = curLayer === 'significance';
      cap.textContent = sig ? 'reading the reading…' : 'reading bytes…'; stage.innerHTML = '';
      legend.innerHTML = ''; note.textContent = '';

      // The significance layer paints over the reading's OWN text bytes + a per-byte signal (this
      // is the meaning-keyed layer); every other layer paints over the source's raw bytes.
      let bytes, truncated = false, total = 0, media = false, signal = null, sigMeta = null;
      if (sig) {
        sigMeta = readingSignificance(app, curSn);
        if (my !== token) return;
        if (!sigMeta || !sigMeta.bytes.length) {
          try { handle && handle.destroy(); } catch {} handle = null;
          stage.appendChild(el(doc, 'div', 'eo-binvis__empty',
            'Significance keys to the reading the perceiver maintains. This source has no reading yet — open it in Reader or EoT once, and its meaning-map appears here.'));
          cap.textContent = 'significance · no reading-keyed signal yet';
          return;
        }
        bytes = sigMeta.bytes; total = sigMeta.bytes.length; truncated = sigMeta.truncated; signal = sigMeta.signal;
      } else {
        const r = await bytesOfSource(app, curSn);
        if (my !== token) return;   // a newer pick/layer won
        bytes = r.bytes; truncated = r.truncated; total = r.total; media = r.media;

        // Nothing to draw — say so plainly rather than paint a blank 1×1 mosaic that reads as a
        // loaded-but-empty file (media that lost its bytes gets the reason; else the honest note).
        if (total === 0) {
          try { handle && handle.destroy(); } catch {} handle = null;
          stage.appendChild(el(doc, 'div', 'eo-binvis__empty', media
            ? "This clip's original bytes aren't available in this session — a large file kept playable only for this tab, or evicted since. Reimport it to see its byte structure."
            : 'This source carries no bytes yet — nothing to visualise. Once it has text or an original file, its structure appears here.'));
          cap.textContent = '0 B · nothing to render';
          return;
        }
      }

      const onHover = (info) => {
        if (!info) { read.textContent = 'Hover the mosaic to name the bytes under the pointer.'; return; }
        const cls = info.length === 1 ? '' : ' · ' + info.length + ' bytes';
        const meaning = (sig && signal) ? ` · significance ${Math.round((signal[info.offset] || 0) * 100)}%` : '';
        read.textContent = `offset ${hex(info.offset)} (${info.offset.toLocaleString()})${cls}${meaning}`;
      };
      handle = renderToContainer(bytes, stage, { layer: curLayer, signal, display, onHover, onNavigate: onHover });
      const sc = handle.scene;
      const per = sc.bucket === 1 ? '1 byte / pixel' : `≈ ${sc.bucket.toLocaleString()} bytes / pixel`;
      cap.textContent = sig
        ? `${sigMeta.units.toLocaleString()} units · ${sigMeta.turns} turning point${sigMeta.turns === 1 ? '' : 's'}${truncated ? ' (head sampled)' : ''} · ${sc.side}×${sc.side} Hilbert`
        : `${kb(total)}${truncated ? ' (head sampled)' : ''} · ${sc.side}×${sc.side} Hilbert · ${per}`;
      if (sc.legendKind === 'gradient' && sc.gradient) {
        const bar = el(doc, 'div', 'eo-binvis__bar');
        bar.style.background = `linear-gradient(90deg,${sc.gradient.map((s) => `rgb(${s.color.join(',')}) ${Math.round(s.at * 100)}%`).join(',')})`;
        legend.appendChild(bar);
        const ends = el(doc, 'div', 'eo-binvis__ends');
        const [loLbl, hiLbl] = sig ? ['flat — ran steady', 'high — the reading turned'] : ['low entropy — ordered', 'high — packed'];
        ends.appendChild(el(doc, 'span', null, loLbl)); ends.appendChild(el(doc, 'span', null, hiLbl));
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
        ? (sig ? `Showing the reading's first ${kb(MAX_BYTES)}.` : `Showing the first ${kb(MAX_BYTES)} of ${kb(total)}.`)
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
