// EO: NUL(Field → Void, Clearing) — data view mount
// data/surface.js — mount a table into any element: the document-explorer's
// data view. Table / Raw toggle; click a cell for its record; a chat answer can
// light the cells it computed over. Framework-free, docked by the reader like the
// document surface.

import { renderDataFragment, dataStatLine, DATA_CSS } from './render.js';

let _css = false;
const injectCss = (doc) => { if (_css) return; const s = doc.createElement('style'); s.setAttribute('data-dt-surface', ''); s.textContent = DATA_CSS; doc.head.appendChild(s); _css = true; };
const slug = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';

export const mountDataSurface = (el, opts = {}) => {
  const D = el.ownerDocument || document;
  injectCss(D);
  const table = opts.table || { columns: [], records: [] };
  let view = 'table';

  el.classList.add('dt-surface');
  el.innerHTML = `
    <div class="dt-bar">
      <span class="dt-glyph">▦</span>
      <div style="min-width:0;flex:1">
        <div class="dt-title">${String(opts.name || 'table').replace(/</g, '&lt;')}</div>
        <div class="dt-stat"></div>
      </div>
      <div class="dt-toggle">
        <button data-view="table">Table</button>
        <button data-view="raw">Raw</button>
      </div>
      ${opts.onClose ? '<button class="dt-x" title="Close">✕</button>' : ''}
    </div>
    <div class="dt-body"></div>`;

  const body = el.querySelector('.dt-body');
  const statEl = el.querySelector('.dt-stat');
  statEl.textContent = dataStatLine(table);

  const render = () => {
    body.innerHTML = renderDataFragment(table, { view });
    for (const b of el.querySelectorAll('.dt-toggle button')) b.classList.toggle('on', b.dataset.view === view);
  };

  let _pop = null;
  const closePop = () => { if (_pop) { _pop.remove(); _pop = null; } };
  const showCell = (td) => {
    closePop();
    const ri = +td.dataset.row, col = td.dataset.col;
    const rec = table.records[ri];
    if (!rec) return;
    const val = rec.cells[slug(col)] == null ? '' : rec.cells[slug(col)];
    const pop = D.createElement('div');
    pop.className = 'dt-pop';
    pop.innerHTML = `<div style="font-weight:700;color:#7ee2a8;margin-bottom:4px">▦ Cell record</div><b>${esc(col)}</b> · row ${ri + 1}<div style="margin-top:5px;font-size:14px;color:#fff">${esc(val)}</div>`;
    D.body.appendChild(pop);
    const r = td.getBoundingClientRect();
    pop.style.left = Math.min(r.left, (D.defaultView.innerWidth || 1200) - 320) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    _pop = pop;
    setTimeout(() => D.addEventListener('click', closePop, { once: true }), 0);
  };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view],.dt-x,.dt-cell');
    if (!t) return;
    if (t.classList.contains('dt-x')) { opts.onClose && opts.onClose(); return; }
    if (t.dataset.view) { view = t.dataset.view; render(); return; }
    if (t.classList.contains('dt-cell')) { showCell(t); return; }
  });

  render();

  return {
    el, table,
    // light the exact cells a chat answer computed over (each {row, col})
    highlightCells: (cells) => {
      for (const c of el.querySelectorAll('.dt-cell.lit')) c.classList.remove('lit');
      for (const c of cells || []) {
        if (c.col) { const td = el.querySelector('.dt-cell[data-row="' + c.row + '"][data-col="' + (window.CSS ? CSS.escape(c.col) : c.col) + '"]'); if (td) td.classList.add('lit'); }
        else { for (const td of el.querySelectorAll('.dt-cell[data-row="' + c.row + '"]')) td.classList.add('lit'); }
      }
    },
    destroy: () => { closePop(); el.innerHTML = ''; el.classList.remove('dt-surface'); },
  };
};
