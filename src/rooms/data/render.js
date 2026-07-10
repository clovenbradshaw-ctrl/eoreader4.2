// EO: NUL(Field → Void, Clearing) — table->HTML renderer
// data/render.js — a table rendered as a table (the document-explorer mockup):
// a clean grid with a row index, uppercase column heads, and a Raw view. Cells
// carry data-row/data-col so a chat answer can light the exact cells it computed
// over. Pure string work over the ingestTable doc (columns/records).

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';

export const renderDataFragment = (table, { view = 'table' } = {}) => {
  const cols = (table.columns || []).map(String);
  if (view === 'raw') {
    const lines = [cols.join(',')].concat((table.records || []).map((r) => cols.map((c) => csvCell(r.cells[slug(c)])).join(',')));
    return `<div class="dt-scroll"><pre class="dt-raw">${esc(lines.join('\n'))}</pre></div>`;
  }
  const head = `<tr><th class="dt-rownum">#</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const body = (table.records || []).map((r, i) =>
    `<tr data-row="${i}"><td class="dt-rownum">R${i + 1}</td>${cols.map((c) => {
      const v = r.cells[slug(c)] == null ? '' : r.cells[slug(c)];
      return `<td class="dt-cell" data-row="${i}" data-col="${esc(c)}" title="${esc(c)}: ${esc(v)}">${esc(v)}</td>`;
    }).join('')}</tr>`).join('');
  return `<div class="dt-scroll"><table class="dt-table"><thead>${head}</thead><tbody>${body}</tbody></table>
    <div class="dt-note"><span class="dt-swatch"></span>Cells a chat answer computed over are lit green. Click any cell to see its record.</div></div>`;
};

const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export const dataStatLine = (table) => {
  const nR = (table.records || []).length, nC = (table.columns || []).length;
  return `${nR} row${nR === 1 ? '' : 's'} · ${nC} column${nC === 1 ? '' : 's'} · immutable`;
};

export const DATA_CSS = `
.dt-surface{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;font-family:var(--doc-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);color:#1b1f24}
.dt-bar{flex:0 0 auto;display:flex;align-items:center;gap:11px;padding:11px 16px;border-bottom:1px solid #e6e8ec;background:#fff}
.dt-glyph{width:30px;height:30px;flex:0 0 auto;border-radius:8px;background:#eef2ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font-size:15px}
.dt-title{font-size:15px;font-weight:800;line-height:1.2}
.dt-stat{font-size:11.5px;color:#9aa1ab;margin-top:2px}
.dt-toggle{margin-left:auto;display:flex;gap:2px;background:#eef0f3;border-radius:8px;padding:3px}
.dt-toggle button{font-size:12px;font-weight:600;color:#5a626d;background:transparent;border:none;border-radius:6px;padding:5px 13px;cursor:pointer}
.dt-toggle button.on{color:#4338ca;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dt-x{width:28px;height:28px;flex:0 0 auto;border:1px solid #dde0e5;background:#fff;border-radius:8px;color:#9aa1ab;font-size:15px;cursor:pointer}
.dt-x:hover{background:#f7f8fa;color:#1b1f24}
.dt-scroll{flex:1;min-height:0;overflow:auto;padding:16px 18px 40px}
.dt-table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.dt-table th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9aa1ab;padding:8px 12px;border-bottom:1px solid #e6e8ec;white-space:nowrap;position:sticky;top:-16px;background:#fff}
.dt-table td{padding:9px 12px;border-bottom:1px solid #f0f1f3;color:#1b1f24;vertical-align:top}
.dt-rownum{color:#9aa1ab;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dt-table tbody tr:hover td{background:#fafbfc}
.dt-cell{cursor:pointer;border-radius:3px}
.dt-cell.lit{background:rgba(21,128,61,.12);box-shadow:inset 2px 0 0 #15803d}
.dt-cell.lit:hover{background:rgba(21,128,61,.16)}
.dt-note{margin-top:14px;font-size:11.5px;color:#9aa1ab;display:flex;align-items:center;gap:7px}
.dt-swatch{width:11px;height:11px;border-radius:3px;background:rgba(21,128,61,.14);border:1px solid rgba(21,128,61,.4);display:inline-block}
.dt-raw{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;color:#1b1f24;white-space:pre;margin:0}
.dt-pop{position:fixed;z-index:2147483001;max-width:300px;background:#1b1f24;color:#e8eaed;border-radius:9px;padding:10px 12px;font-size:12px;line-height:1.5;box-shadow:0 12px 32px rgba(0,0,0,.34)}
.dt-pop b{color:#fff}
`;
