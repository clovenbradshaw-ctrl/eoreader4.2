// EO: SEG(Field → Dissecting) — the pipeline surface's parameter inspector
// pipeline-inspector.js — the right-hand panel: one selected node's full parameter form (plus a
// source picker when it's a Source node), or, when several nodes are multi-selected (shift-click),
// only the parameter keys they share, edited ONCE and applied to every selected node at once —
// "set parameters on a whole series of nodes". Split out of pipeline-surface.js to stay under the
// repo's 250-line god-module ceiling; see pipeline-canvas.js for the sibling split.
import { kindOf, paramsFor } from './pipeline-nodes.js';
import { el } from './pipeline-dom.js';

const commonParamKeys = (nodes) => {
  if (!nodes.length) return [];
  const sets = nodes.map((n) => (kindOf(n.kind)?.params || []));
  const first = sets[0];
  return first.filter((p) => sets.every((s) => s.some((q) => q.key === p.key && q.type === p.type)));
};

const renderField = (p, value, onChange) => {
  const wrap = el('div', 'eo-pipe-field');
  wrap.appendChild(el('label', null, p.label));
  let input;
  if (p.type === 'select') {
    input = document.createElement('select');
    for (const opt of (p.options || [])) {
      const o = document.createElement('option'); o.value = opt; o.textContent = opt;
      if (opt === value) o.selected = true;
      input.appendChild(o);
    }
    input.onchange = () => onChange(input.value);
  } else {
    input = document.createElement('input');
    input.type = p.type === 'number' ? 'number' : 'text';
    input.value = value == null ? '' : value;
    input.onchange = () => onChange(p.type === 'number' ? Number(input.value) : input.value);
  }
  wrap.appendChild(input);
  return wrap;
};

const renderSourcePicker = (ctx, g, node) => {
  const wrap = el('div', 'eo-pipe-field');
  wrap.appendChild(el('label', null, 'Source'));
  let sources = [];
  try { sources = (ctx.engine.app && ctx.engine.app.workspaceSources && ctx.engine.app.workspaceSources()) || []; } catch { sources = []; }
  const search = el('input');
  search.placeholder = 'Search sources…';
  search.style.cssText = 'width:100%;padding:6px 8px;border-radius:6px;border:1px solid #E0E0E6;font-size:12.5px;box-sizing:border-box;margin-bottom:6px';
  const list = el('div');
  const draw = (q) => {
    list.innerHTML = '';
    const filtered = sources.filter((s) => !q || String(s.title || '').toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    if (!filtered.length) { list.appendChild(el('div', 'eo-pipe-empty', 'no sources')); return; }
    for (const s of filtered) {
      const row = el('div', 'eo-pipe-src-row', `${s.title || s.sn} · ${s.kind || ''}`);
      if (s.sn === node.sourceSn) row.style.background = '#EEEBFE';
      row.onclick = () => ctx.engine.setSourceSn(g.id, node.id, s.sn);
      list.appendChild(row);
    }
  };
  search.oninput = () => draw(search.value);
  draw('');
  wrap.append(search, list);
  return wrap;
};

export const renderInspector = (ctx) => {
  const { inspector } = ctx.dom;
  inspector.innerHTML = '';
  const g = ctx.graph();
  if (!g) { inspector.appendChild(el('div', 'eo-pipe-empty', 'no surface open')); return; }
  const selNodes = g.nodes.filter((n) => ctx.state.selection.has(n.id));
  if (!selNodes.length) {
    inspector.appendChild(el('div', 'eo-pipe-empty', 'Select a node to edit its parameters. Shift-click to select a whole series and edit them together.'));
    return;
  }
  if (selNodes.length === 1) {
    const node = selNodes[0];
    const kind = kindOf(node.kind);
    const title = el('div', null, kind ? kind.label : node.kind);
    title.style.cssText = 'font-weight:700;margin-bottom:10px;font-size:13px';
    inspector.appendChild(title);
    if (kind && kind.id === 'source') inspector.appendChild(renderSourcePicker(ctx, g, node));
    const params = paramsFor(node, kind);
    for (const p of (kind ? kind.params : [])) {
      inspector.appendChild(renderField(p, params[p.key], (v) => ctx.engine.setParams(g.id, [node.id], { [p.key]: v })));
    }
    const del = el('button', null, 'Delete node');
    del.style.cssText = 'margin-top:8px;padding:6px 11px;border-radius:7px;border:1px solid #F0C9C2;background:#FBEDEA;color:#B23A2E;cursor:pointer;font-size:12px';
    del.onclick = () => { ctx.engine.removeNode(g.id, node.id); ctx.state.selection.delete(node.id); };
    inspector.appendChild(del);
  } else {
    inspector.appendChild(el('div', 'eo-pipe-batch-note', `${selNodes.length} nodes selected — parameters shared across all of them apply to every selected node.`));
    for (const p of commonParamKeys(selNodes)) {
      const values = new Set(selNodes.map((n) => paramsFor(n, kindOf(n.kind))[p.key]));
      const shown = values.size === 1 ? [...values][0] : '';
      inspector.appendChild(renderField(p, shown, (v) => ctx.engine.setParams(g.id, selNodes.map((n) => n.id), { [p.key]: v })));
    }
  }
};
