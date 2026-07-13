// EO: NUL·SIG(Field → Void,Lens, Clearing,Binding) — the point-and-pick element selector
// dashboard/picker.js — the no-code heart: render a pulled page and let the user CLICK the exact
// number, price, or status they want, and hand back a durable handle to it. There is no code for
// the user to write — they hover, the element under the cursor lights up, they click, and the
// picker reads its address (select.js buildSelector) and its current value (extract.js readValue).
//
// The page is rendered in a SANDBOXED iframe with `allow-same-origin` but deliberately WITHOUT
// `allow-scripts`: none of the fetched page's JavaScript runs (so an untrusted page can't act),
// yet — because the srcdoc iframe shares this origin — the parent can read its document to
// resolve what was clicked and inject the hover highlight. Presentation only; the reading logic
// it calls is what the tests pin.

import { buildSelector, extractFromDoc, labelFor } from './select.js';
import { readValue, inferKind } from './extract.js';
import { WATCH_KINDS } from './spec.js';

const STYLE_ID = 'eo-dash-picker-style';
const CSS = `
.eo-pick{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff}
.eo-pick-hint{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 12px;background:#111827;color:#fff;font:13px/1.4 system-ui,sans-serif}
.eo-pick-hint b{color:#a5b4fc}
.eo-pick-hint .eo-pick-close{margin-left:auto;background:transparent;border:1px solid #374151;color:#cbd5e1;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px}
.eo-pick-frame{flex:1;min-height:0;position:relative;background:#fff}
.eo-pick-frame iframe{width:100%;height:100%;border:0;background:#fff}
.eo-pick-frame.eo-pick-busy::after{content:"Loading the page…";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7280;font:14px system-ui,sans-serif}
.eo-pick-confirm{flex:0 0 auto;display:none;flex-direction:column;gap:8px;padding:11px 12px;border-top:1px solid #e6e8ec;background:#f8fafc;font:13px system-ui,sans-serif;color:#1b1f24}
.eo-pick-confirm.eo-pick-open{display:flex}
.eo-pick-picked{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.eo-pick-picked .eo-pick-val{font-size:19px;font-weight:800}
.eo-pick-picked .eo-pick-kind{font-size:11px;color:#6b7280;background:#eef2ff;color:#4338ca;border-radius:5px;padding:1px 7px;font-weight:650}
.eo-pick-sel{font:11px ui-monospace,Menlo,monospace;color:#6b7280;word-break:break-all;background:#fff;border:1px solid #e6e8ec;border-radius:6px;padding:4px 7px}
.eo-pick-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.eo-pick-row label{font-size:11px;color:#6b7280;display:flex;flex-direction:column;gap:3px}
.eo-pick-row input,.eo-pick-row select{padding:6px 8px;border:1px solid #dde0e5;border-radius:7px;font:inherit;background:#fff;color:inherit}
.eo-pick-row input.eo-pick-label{min-width:150px;flex:1}
.eo-pick-actions{display:flex;gap:8px;margin-left:auto}
.eo-pick-actions button{padding:7px 14px;border-radius:8px;border:0;font-weight:650;cursor:pointer;font-size:13px}
.eo-pick-add{background:#4338ca;color:#fff}
.eo-pick-add:hover{background:#3730a3}
.eo-pick-cancel{background:#fff;border:1px solid #dde0e5;color:#6b7280}
`;

const injectCss = (doc) => { if (doc.getElementById(STYLE_ID)) return; const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.appendChild(s); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Give the fetched HTML a <base> so its relative stylesheets and images resolve against the real
// page (visual fidelity), and neutralize any <base> the page already carries. Scripts never run
// (no allow-scripts), so this is layout only.
const prepareHtml = (html, url) => {
  let h = String(html || '');
  h = h.replace(/<base\b[^>]*>/gi, '');
  const baseTag = `<base href="${esc(url)}">`;
  if (/<head[^>]*>/i.test(h)) return h.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  if (/<html[^>]*>/i.test(h)) return h.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  return `<head>${baseTag}</head>${h}`;
};

// The hover highlight lives INSIDE the iframe document (same-origin lets us inject it): a fixed,
// pointer-transparent outline that tracks the element under the cursor, plus a tiny value chip.
const HILITE_CSS = `
.eo-pick-hilite{position:fixed;z-index:2147483000;pointer-events:none;border:2px solid #4338ca;background:rgba(67,56,202,.10);border-radius:3px;transition:all .04s linear}
.eo-pick-chip{position:fixed;z-index:2147483001;pointer-events:none;background:#111827;color:#fff;font:11px/1.3 system-ui,sans-serif;padding:2px 7px;border-radius:6px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
html.eo-pick-cursor,html.eo-pick-cursor *{cursor:crosshair !important}
`;

// mountPicker(host, { html, url, onPick, onCancel }) → unmount(). Renders the page, tracks the
// hovered element, and on click surfaces a confirm bar prefilled with the read value + a label,
// a kind, and an optional attribute. `onPick` fires with the durable spec; `onCancel` backs out.
export const mountPicker = (host, { html, url, onPick, onCancel } = {}) => {
  if (typeof document === 'undefined' || !host) return () => {};
  const D = host.ownerDocument || document;
  injectCss(D);

  host.classList.add('eo-pick');
  host.innerHTML = `
    <div class="eo-pick-hint">
      <span>👆 <b>Click</b> the number, price, or status you want to watch on the page below.</span>
      <button class="eo-pick-close" data-x>Cancel</button>
    </div>
    <div class="eo-pick-frame eo-pick-busy"><iframe sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe></div>
    <form class="eo-pick-confirm">
      <div class="eo-pick-picked"><span class="eo-pick-val">—</span><span class="eo-pick-kind"></span></div>
      <div class="eo-pick-sel"></div>
      <div class="eo-pick-row">
        <label>Name<input class="eo-pick-label" type="text" placeholder="What is this?"></label>
        <label>Read as
          <select class="eo-pick-kindsel">${WATCH_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('')}</select>
        </label>
        <label>Attribute<input class="eo-pick-attr" type="text" placeholder="(optional)" style="width:96px"></label>
        <div class="eo-pick-actions">
          <button type="button" class="eo-pick-cancel">Cancel</button>
          <button type="submit" class="eo-pick-add">Add to dashboard</button>
        </div>
      </div>
    </form>`;

  const frameWrap = host.querySelector('.eo-pick-frame');
  const iframe = host.querySelector('iframe');
  const confirm = host.querySelector('.eo-pick-confirm');
  const valEl = host.querySelector('.eo-pick-val');
  const kindChip = host.querySelector('.eo-pick-kind');
  const selEl = host.querySelector('.eo-pick-sel');
  const labelInput = host.querySelector('.eo-pick-label');
  const kindSel = host.querySelector('.eo-pick-kindsel');
  const attrInput = host.querySelector('.eo-pick-attr');

  let picked = null;   // { selector, attr, raw }
  let cleanupFrame = null;

  const cancel = () => { try { onCancel && onCancel(); } catch { /* ignore */ } };
  host.querySelector('[data-x]').addEventListener('click', cancel);
  host.querySelector('.eo-pick-cancel').addEventListener('click', cancel);

  // Re-read the confirm bar's value when the user changes the kind or attribute by hand.
  const reread = () => {
    if (!picked) return;
    const doc = iframe.contentDocument;
    const attr = attrInput.value.trim();
    const got = extractFromDoc(doc, picked.selector, attr);
    picked.attr = attr; picked.raw = got.raw;
    const rv = readValue(got.raw, kindSel.value);
    valEl.textContent = got.ok ? rv.display : `⚠ ${got.error}`;
    kindChip.textContent = kindSel.value === 'auto' ? `auto · ${rv.kind}` : rv.kind;
  };
  kindSel.addEventListener('change', reread);
  attrInput.addEventListener('input', reread);

  confirm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!picked) return;
    const spec = {
      url,
      selector: picked.selector,
      attr: attrInput.value.trim(),
      kind: kindSel.value,
      label: labelInput.value.trim(),
      raw: picked.raw,
    };
    try { onPick && onPick(spec); } catch { /* ignore */ }
  });

  // Wire the iframe once its (script-free) document is in place: inject the highlight, track the
  // hovered element, and capture the click that selects it.
  const wireFrame = () => {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    frameWrap.classList.remove('eo-pick-busy');

    const style = doc.createElement('style'); style.textContent = HILITE_CSS; (doc.head || doc.body).appendChild(style);
    doc.documentElement.classList.add('eo-pick-cursor');
    const hilite = doc.createElement('div'); hilite.className = 'eo-pick-hilite'; hilite.style.display = 'none';
    const chip = doc.createElement('div'); chip.className = 'eo-pick-chip'; chip.style.display = 'none';
    doc.body.appendChild(hilite); doc.body.appendChild(chip);

    let hovered = null;
    const place = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) { hilite.style.display = 'none'; chip.style.display = 'none'; return; }
      hilite.style.display = 'block';
      hilite.style.left = r.left + 'px'; hilite.style.top = r.top + 'px';
      hilite.style.width = r.width + 'px'; hilite.style.height = r.height + 'px';
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      chip.textContent = txt || el.tagName.toLowerCase();
      chip.style.display = 'block';
      chip.style.left = r.left + 'px';
      chip.style.top = Math.max(0, r.top - 20) + 'px';
    };
    const onMove = (e) => {
      const el = e.target;
      if (!el || el === hovered || el === hilite || el === chip || el.nodeType !== 1) return;
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'html' || tag === 'body') { hilite.style.display = 'none'; chip.style.display = 'none'; hovered = null; return; }
      hovered = el; place(el);
    };
    const onScroll = () => { if (hovered) place(hovered); };
    const onClick = (e) => {
      const el = e.target;
      if (!el || el.nodeType !== 1) return;
      e.preventDefault(); e.stopPropagation();
      const selector = buildSelector(el);
      if (!selector) return;
      const got = extractFromDoc(doc, selector, '');
      const guess = inferKind(got.raw);
      picked = { selector, attr: '', raw: got.raw };
      selEl.textContent = selector;
      labelInput.value = labelFor(el);
      kindSel.value = 'auto';
      attrInput.value = '';
      const rv = readValue(got.raw, 'auto');
      valEl.textContent = got.ok ? rv.display : `⚠ ${got.error}`;
      kindChip.textContent = `auto · ${guess}`;
      confirm.classList.add('eo-pick-open');
    };

    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('scroll', onScroll, true);
    doc.addEventListener('click', onClick, true);
    // Kill in-page navigation (a click on a link must PICK it, never sail away).
    doc.addEventListener('submit', (e) => e.preventDefault(), true);

    cleanupFrame = () => {
      try { doc.removeEventListener('mousemove', onMove, true); } catch { /* ignore */ }
      try { doc.removeEventListener('scroll', onScroll, true); } catch { /* ignore */ }
      try { doc.removeEventListener('click', onClick, true); } catch { /* ignore */ }
    };
  };

  iframe.addEventListener('load', () => { try { wireFrame(); } catch { frameWrap.classList.remove('eo-pick-busy'); } });
  iframe.srcdoc = prepareHtml(html, url);
  // Some engines don't fire `load` for srcdoc reliably — wire on next tick as a fallback.
  setTimeout(() => { if (frameWrap.classList.contains('eo-pick-busy')) { try { wireFrame(); } catch { /* ignore */ } } }, 400);

  return () => {
    try { cleanupFrame && cleanupFrame(); } catch { /* ignore */ }
    host.classList.remove('eo-pick');
    host.innerHTML = '';
  };
};
