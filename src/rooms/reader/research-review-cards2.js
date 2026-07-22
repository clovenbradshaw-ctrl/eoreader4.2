// EO: SIG(Lens → Lens, Tending) — Research Review surface: the repeating DOM parts for the newer
// sections (§7 identity review / typed network / evidence matrix, §9 gap-directed research, §7.4
// cluster actions). Split out of research-review-cards.js under the god-module ratchet (~250
// lines/file) — same discipline: pure DOM builders, no app state read here.
import { el } from './research-review-cards.js';

// renderIdentityRow(doc, candidate, ctx) → one §7.3 identity-review row. `candidate`:
// { key, label, sns, state }. ctx: { titleOf(sn), onSet(key, decision|null) }.
export const renderIdentityRow = (doc, c, ctx) => {
  const row = el(doc, 'div', 'eo-rr__idRow');
  row.appendChild(el(doc, 'span', null, `“${c.label}” in ${c.sns.map((sn) => ctx.titleOf(sn)).join(' · ')}`));
  row.appendChild(el(doc, 'span', 'eo-rr__areaN', c.state === 'aligned' ? 'Aligned' : c.state === 'separate' ? 'Kept separate' : 'Candidate match'));
  const confirm = doc.createElement('button'); confirm.type = 'button';
  confirm.className = 'eo-rr__idRowBtn' + (c.state === 'aligned' ? ' eo-rr__idRowBtn--on' : '');
  confirm.textContent = 'Same referent';
  confirm.addEventListener('click', () => ctx.onSet(c.key, c.state === 'aligned' ? null : 'aligned'));
  row.appendChild(confirm);
  const reject = doc.createElement('button'); reject.type = 'button';
  reject.className = 'eo-rr__idRowBtn' + (c.state === 'separate' ? ' eo-rr__idRowBtn--on' : '');
  reject.textContent = 'Different';
  reject.addEventListener('click', () => ctx.onSet(c.key, c.state === 'separate' ? null : 'separate'));
  row.appendChild(reject);
  return row;
};

// renderNetworkEdgeRow(doc, edge, ctx) → one §7.2 typed connection row. ctx: { titleOf(sn), onOpen(sn) }.
export const renderNetworkEdgeRow = (doc, edge, ctx) => {
  const row = el(doc, 'div', 'eo-rr__netRow');
  row.appendChild(el(doc, 'span', 'eo-rr__netType', edge.type));
  const mkName = (sn) => { const b = el(doc, 'button', 'eo-rr__openLink', ctx.titleOf(sn)); b.addEventListener('click', () => ctx.onOpen(sn)); return b; };
  row.appendChild(mkName(edge.a));
  row.appendChild(el(doc, 'span', null, '↔'));
  row.appendChild(mkName(edge.b));
  if (edge.label) row.appendChild(el(doc, 'span', 'eo-rr__areaN', edge.label));
  return row;
};

const CELL_LABEL = { supports: 'supports', contests: 'contests', revises: 'revises', silent: '—', 'candidate correspondence': 'corresponds' };
const cellClass = (state) => `eo-rr__cell--${String(state || 'silent').replace(/\s+/g, '-')}`;

// renderMatrixTable(doc, matrixView, ctx) → the §7.1 evidence matrix: rows are aligned evidence
// objects, columns are the SELECTED candidates (matrixView.sources — evidenceMatrix() is already
// scoped to the current proposed-corpus selection). ctx: { titleOf(sn), onOpenCell(row, sn, cell) }.
export const renderMatrixTable = (doc, matrixView, ctx) => {
  const table = doc.createElement('table');
  table.className = 'eo-rr__table';
  const thead = doc.createElement('thead');
  const hr = doc.createElement('tr');
  hr.appendChild(el(doc, 'th', null, 'Evidence'));
  for (const s of matrixView.sources) hr.appendChild(el(doc, 'th', null, s.label || s.source));
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = doc.createElement('tbody');
  for (const row of matrixView.rows) {
    const tr = doc.createElement('tr');
    tr.appendChild(el(doc, 'td', null, row.label));
    for (const s of matrixView.sources) {
      const cell = row.cells[s.source] || { state: 'silent' };
      const td = doc.createElement('td');
      td.className = cellClass(cell.state);
      td.textContent = cell.display || CELL_LABEL[cell.state] || cell.state;
      if (cell.state !== 'silent' && ctx.onOpenCell) { td.style.cursor = 'pointer'; td.addEventListener('click', () => ctx.onOpenCell(row, s.source, cell)); }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
};

// renderGapArea(doc, area, ctx) → one gap-directed-research area row with its narrowly-scoped
// search actions (§9). ctx: { onSearch(templateKey) }.
const GAP_ACTIONS = [
  ['dataset', 'Search for primary dataset'], ['opposing', 'Search for opposing evidence'],
  ['government', 'Search government records'], ['academic', 'Search academic literature'],
  ['measure', 'Search by missing measure'],
];
export const renderGapArea = (doc, area, ctx) => {
  const row = el(doc, 'div', 'eo-rr__gapArea');
  row.appendChild(el(doc, 'span', null, area.label));
  row.appendChild(el(doc, 'span', 'eo-rr__areaN', `${area.sourceCount} source${area.sourceCount === 1 ? '' : 's'} · ${area.independentOrigins} origin${area.independentOrigins === 1 ? '' : 's'}`));
  for (const [key, label] of GAP_ACTIONS) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'eo-rr__btn eo-rr__btn--sm'; b.textContent = label;
    b.addEventListener('click', () => ctx.onSearch(key));
    row.appendChild(b);
  }
  return row;
};

// renderClusterActions(doc, cluster, ctx) → the §7.4 derivative-cluster batch actions.
// ctx: { onAction(action), onToggleDiff(), diffOpen, onMarkIndependent(sn) }.
export const renderClusterActions = (doc, cluster, ctx) => {
  const wrap = el(doc, 'div', 'eo-rr__clusterActions');
  const mk = (label, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'eo-rr__btn eo-rr__btn--sm'; b.textContent = label; b.addEventListener('click', fn); return b; };
  wrap.appendChild(mk('Keep origin only', () => ctx.onAction('keep-origin')));
  wrap.appendChild(mk('Keep reporting perspectives', () => ctx.onAction('keep-all')));
  wrap.appendChild(mk(ctx.diffOpen ? 'Hide differences' : 'Review differences', () => ctx.onToggleDiff()));
  for (const d of cluster.derivative) wrap.appendChild(mk(`Mark “${d.title || d.sn}” independent`, () => ctx.onMarkIndependent(d.sn)));
  return wrap;
};
