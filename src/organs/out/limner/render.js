// EO: NUL(Field → Void, Clearing) — SVG renderer (deterministic template)
// organs/out/limner/render.js — stamp deterministic SVG from geometry.
//
// The last stage (docs/limner.md §9). No model involvement: a template maps the
// geometry the layout engine computed onto SVG. The visual grammar is fixed —
//   node size  ← salience          (the layout already set r)
//   edge stroke← weight
//   operator   ← stroke colour/style   (CON/SIG/SYN/… each its own hue)
//   region.kind← fill treatment     (cluster hull vs. void frontier outline)
// — and themed through CSS variables with inline fallbacks, so the same `<svg>`
// renders inline in the chat, stores to OPFS, or archives, and is BYTE-IDENTICAL
// for a given (geometry, theme). That byte-stability is what makes render_hash a
// real content address (§7).

// Operator → hue. Carried over from the underlying event (the projection read
// it); LIMNER only colours by it. `null` is a bare structural tie.
const OP_COLOR = Object.freeze({
  CON: '#6f86ff',  // the binding bond — the central operator
  SIG: '#46b39d',  // attribute
  SYN: '#b36fff',  // synthesis / merge
  DEF: '#e0a13a',  // assertion
  SEG: '#9aa3b2',  // resplit / traversal step
  REC: '#d6618f',  // learned rule
});
const opColor = (op) => OP_COLOR[op] || 'var(--limner-edge, #8a93a6)';
// Operator → canonical helix glyph (experientialontology.org) — the edge wears
// the mark of the operator that wrote it.
const OP_GLYPH = Object.freeze({ CON: '⋈', SIG: '○', SYN: '△', DEF: '⊢', SEG: '｜', REC: '⊛' });

// role → node fill
const ROLE_FILL = Object.freeze({
  concept: 'var(--limner-concept, #2b3550)',
  event:   'var(--limner-event, #355070)',
  span:    'var(--limner-span, #3a5a40)',
  anchor:  'var(--limner-anchor, #43455c)',
  void:    'var(--limner-void, #1a1c26)',
});

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Trim a label so a dense graph stays legible; the full text lives in <title>.
const short = (s, n = 18) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// render(geometry, theme) → string. `theme` is advisory CSS-var overrides; the
// defaults below keep the SVG self-contained and dark-friendly.
export const render = (geom, theme = {}) => {
  const { width: W, height: H } = geom;
  const styleVars = Object.entries(theme || {})
    .map(([k, v]) => `--limner-${k}:${esc(v)};`).join('');

  const defs = `
  <defs>
    <style>
      .limner-edge{stroke-linecap:round}
      .limner-node text{font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;fill:var(--limner-label,#e7eaf2);pointer-events:none;paint-order:stroke;stroke:var(--limner-bg,#0f1117);stroke-width:3px;stroke-linejoin:round}
      .limner-elabel{font:500 9px/1 ui-sans-serif,system-ui,sans-serif;fill:var(--limner-edge-label,#9aa3b2);paint-order:stroke;stroke:var(--limner-bg,#0f1117);stroke-width:3px;stroke-linejoin:round}
      .limner-frontier{fill:var(--limner-frontier-fill,rgba(120,90,200,.10));stroke:var(--limner-frontier,#7a5ad0);stroke-dasharray:5 4;stroke-width:1.5}
      .limner-cluster{fill:var(--limner-cluster-fill,rgba(80,120,200,.08));stroke:var(--limner-cluster,#6f86ff);stroke-width:1}
    </style>
  </defs>`;

  // regions first (under everything), then edges, then nodes, then annotations.
  const regions = (geom.regions || []).map(r => {
    const d = 'M' + r.hull.map(([x, y]) => `${x},${y}`).join('L') + 'Z';
    const cls = r.kind === 'void' || r.kind === 'frontier' ? 'limner-frontier' : 'limner-cluster';
    const lx = r.hull.reduce((s, p) => s + p[0], 0) / r.hull.length;
    const ly = Math.min(...r.hull.map(p => p[1])) - 6;
    return `<path class="${cls}" d="${d}"/>` +
      (r.label ? `<text class="limner-elabel" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle">${esc(r.label)}</text>` : '');
  }).join('');

  // Graph and path edges are DIRECTED (source = the SVO subject / the step
  // before), so they get an arrowhead: the line is trimmed to the node borders
  // and a solid head sits at the target. Timelines and void tethers stay bare.
  const byId = new Map((geom.nodes || []).map(n => [n.id, n]));
  const arrows = geom.kind === 'graph' || geom.kind === 'path';
  const edges = (geom.edges || []).map(e => {
    const sw = (0.6 + 3.4 * (e.weight || 0)).toFixed(2);
    const op = e.operator;
    const dash = op == null ? ' stroke-dasharray="2 3"' : '';
    let x1 = e.x1, y1 = e.y1, x2 = e.x2, y2 = e.y2, head = '';
    if (arrows) {
      const a = byId.get(e.source), b = byId.get(e.target);
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1, d = Math.hypot(dx, dy);
      const al = 4.5 + (e.weight || 0) * 3.5, aw = 2.4 + (e.weight || 0) * 1.8;
      if (a && b && d > a.r + b.r + al + 2) {
        const ux = dx / d, uy = dy / d;
        x1 = (e.x1 + ux * (a.r + 1)).toFixed(2); y1 = (e.y1 + uy * (a.r + 1)).toFixed(2);
        const tx = e.x2 - ux * (b.r + 1), ty = e.y2 - uy * (b.r + 1);
        const bx = tx - ux * al, by = ty - uy * al;
        x2 = bx.toFixed(2); y2 = by.toFixed(2);   // the line stops at the head's base
        head = `<path d="M${tx.toFixed(2)},${ty.toFixed(2)}L${(bx - uy * aw).toFixed(2)},${(by + ux * aw).toFixed(2)}` +
          `L${(bx + uy * aw).toFixed(2)},${(by - ux * aw).toFixed(2)}Z" fill="${opColor(op)}" fill-opacity="0.85"/>`;
      }
    }
    const line = `<line class="limner-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
      `stroke="${opColor(op)}" stroke-width="${sw}" stroke-opacity="0.7"${dash}>` +
      `<title>${esc(op || 'tie')}${e.label ? ': ' + esc(e.label) : ''}</title></line>` + head;
    const glyph = OP_GLYPH[op] || '';
    if (!glyph && !e.label) return line;
    const mx = ((e.x1 + e.x2) / 2).toFixed(2), my = ((e.y1 + e.y2) / 2).toFixed(2);
    const mid = glyph + (e.label ? (glyph ? ' ' : '') + short(e.label, 14) : '');
    return line + `<text class="limner-elabel" x="${mx}" y="${my}" text-anchor="middle" style="fill:${opColor(op)}">${esc(mid)}</text>`;
  }).join('');

  const nodes = (geom.nodes || []).map(n => {
    const fill = ROLE_FILL[n.role] || ROLE_FILL.concept;
    const stroke = n.role === 'void' ? 'var(--limner-frontier,#7a5ad0)' : 'var(--limner-node-stroke,#aab3c5)';
    const dash = n.role === 'void' ? ' stroke-dasharray="3 3"' : '';
    const ty = (n.r + 12).toFixed(2);
    return `<g class="limner-node" transform="translate(${n.x},${n.y})">` +
      `<circle r="${n.r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>` +
      `<title>${esc(n.label || n.ref)} · ${esc(n.ref)}</title>` +
      (n.label ? `<text text-anchor="middle" y="${ty}">${esc(short(n.label))}</text>` : '') +
      `</g>`;
  }).join('');

  const annos = (geom.annotations || []).map(a =>
    `<text class="limner-elabel" x="${a.x.toFixed(2)}" y="${a.y.toFixed(2)}" text-anchor="middle">${esc(short(a.text, 28))}</text>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ` +
    `role="img" class="limner-svg" style="${styleVars}background:var(--limner-bg,#0f1117);border-radius:10px">` +
    defs +
    `<g class="limner-regions">${regions}</g>` +
    `<g class="limner-edges">${edges}</g>` +
    `<g class="limner-nodes">${nodes}</g>` +
    `<g class="limner-annotations">${annos}</g>` +
    `</svg>`;
};
