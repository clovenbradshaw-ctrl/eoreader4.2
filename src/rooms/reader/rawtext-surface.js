// EO: SIG(Field -> Lens, Tending) — the raw-text launcher, the reader room's app-glue
// The seam between the pure raw-text surface (src/surfaces/rawtext — a line-numbered,
// uninterpreted view of a string) and a real loaded document, same split as binvis-surface.js:
// the surface holon knows only text; this knows how to get a loaded source's text
// (rawtext-data.js) and paint it beside a caption line and an honest empty state.
//   mountRawText(el, { app, sn }) — drop the surface into any element. Returns { destroy, show }.

import { renderToContainer } from '../../surfaces/rawtext/index.js';
import { rawTextOfSource } from './rawtext-data.js';

export { rawTextOfSource };

const STYLE_ID = 'eo-rawtext-style';
const CSS = `
.eo-rawtext-shell{height:100%;display:flex;flex-direction:column}
.eo-rawtext-cap{flex:0 0 auto;padding:8px 14px;font:600 11px/1.4 'IBM Plex Mono',monospace;color:#8b98ad;background:#0f1420;border-bottom:1px solid #1c2333}
.eo-rawtext-stage{flex:1;min-height:0;overflow:auto;background:#0b0f18}
.eo-rawtext{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#dce4f0;padding:8px 0}
.eo-rawtext__row{display:flex}
.eo-rawtext__row:hover{background:rgba(255,255,255,.05)}
.eo-rawtext__no{flex:none;width:52px;padding:0 14px 0 0;text-align:right;color:#4d5566;user-select:none}
.eo-rawtext__src{flex:1;white-space:pre-wrap;word-break:break-word;padding-right:20px}
.eo-rawtext__note{padding:10px 14px;font:12px/1.5 'IBM Plex Mono',monospace;color:#6f7d92;border-top:1px solid #1c2333}
.eo-rawtext__empty{padding:30px 14px;text-align:center;color:#6f7d92;font-size:12.5px}
`;
const ensureStyle = (doc) => {
  if (doc.getElementById(STYLE_ID)) return;
  const st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; doc.head.appendChild(st);
};
const el = (doc, tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export const mountRawText = (host, { app, sn = null } = {}) => {
  const doc = host.ownerDocument || document;
  ensureStyle(doc);
  const root = el(doc, 'div', 'eo-rawtext-shell');
  host.appendChild(root);

  let curSn = sn, token = 0;
  const sources = () => ((app && app.state && app.state.sources) || []);
  const pick = () => {
    const list = sources();
    if (!list.length) return null;
    return list.some((s) => s.sn === curSn) ? curSn : list[list.length - 1].sn;
  };

  const render = async () => {
    root.innerHTML = '';
    if (!sources().length) {
      root.appendChild(el(doc, 'div', 'eo-rawtext__empty', 'No document loaded yet. Record a URL, import a file, or paste text — then reopen this to see its raw text.'));
      return;
    }
    curSn = pick();
    const cap = el(doc, 'div', 'eo-rawtext-cap', 'reading…');
    const stage = el(doc, 'div', 'eo-rawtext-stage');
    root.appendChild(cap); root.appendChild(stage);

    const my = ++token;
    const r = await rawTextOfSource(app, curSn);
    if (my !== token) return;   // a newer pick won while this source's text was loading

    if (r.media || !r.text) {
      stage.appendChild(el(doc, 'div', 'eo-rawtext__empty', r.media
        ? "This source is a media/binary format — see its Listen or PDF tab for the native view, or Structure for its byte layout."
        : 'This source carries no text yet — once it has one, it appears here.'));
      cap.textContent = '0 lines';
      return;
    }
    const handle = renderToContainer(r.text, stage);
    cap.textContent = `${handle.lines.toLocaleString()} line${handle.lines === 1 ? '' : 's'}${handle.truncated ? ' · showing the head' : ''}`;
  };

  render();
  const unsub = (app && app.subscribe) ? app.subscribe((kind) => { if (kind === 'record' || kind === 'source' || kind === 'log') render(); }) : () => {};
  return {
    show: (nextSn) => { if (nextSn != null) curSn = nextSn; render(); },
    destroy: () => { try { unsub(); } catch {} host.innerHTML = ''; },
  };
};
