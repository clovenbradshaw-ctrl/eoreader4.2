// EO: SIG(Lens -> Lens, Tending) — the raw-text surface's pure render: text -> a line-numbered DOM
// The Structure tab already shows a source's raw BYTES (binvis, docs/binvis-surface.md); this is the
// storey directly above it — the source's raw TEXT, exactly as stored, one line at a time, no
// interpretation. Every character rides through `textContent`, never innerHTML, so escaping is never
// a question here the way it is for the Native tab's rendered kinds. Modality-blind like binvis:
// this module knows only a string and an element, never a Reading, a source record, or how the text
// was obtained (that seam is rooms/reader/rawtext-data.js, the one impure step, same split as binvis).

const MAX_LINES = 20000;
const MAX_CHARS = 2 * 1024 * 1024;   // 2 MB — past this a huge document is sampled, not frozen on

// buildLines(text, opts) → { lines, total, truncated }. Pure — no DOM. `total` is the number of
// lines actually returned (post-cap), so a caller never has to re-derive it from `lines.length`.
export const buildLines = (text, { maxLines = MAX_LINES, maxChars = MAX_CHARS } = {}) => {
  let s = String(text == null ? '' : text);
  let truncated = false;
  if (s.length > maxChars) { s = s.slice(0, maxChars); truncated = true; }
  let lines = s.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); truncated = true; }
  return { lines, total: lines.length, truncated };
};

const el = (doc, tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };

// renderToContainer(text, host, opts) → { destroy, lines, truncated }. Builds real DOM into `host`
// (clearing it first) — a gutter of line numbers beside the literal text, one row per line. Assigns
// class names only; the room glue owns the actual stylesheet (binvis's own split).
export const renderToContainer = (text, host, opts = {}) => {
  const doc = host.ownerDocument || document;
  const { lines, total, truncated } = buildLines(text, opts);
  host.innerHTML = '';
  const root = el(doc, 'div', 'eo-rawtext');
  const body = el(doc, 'div', 'eo-rawtext__body');
  const frag = doc.createDocumentFragment();
  lines.forEach((line, i) => {
    const row = el(doc, 'div', 'eo-rawtext__row');
    const no = el(doc, 'span', 'eo-rawtext__no'); no.textContent = String(i + 1);
    const src = el(doc, 'span', 'eo-rawtext__src'); src.textContent = line;
    row.appendChild(no); row.appendChild(src);
    frag.appendChild(row);
  });
  body.appendChild(frag);
  root.appendChild(body);
  if (truncated) {
    const note = el(doc, 'div', 'eo-rawtext__note');
    note.textContent = `Showing the first ${total.toLocaleString()} line${total === 1 ? '' : 's'}.`;
    root.appendChild(note);
  }
  host.appendChild(root);
  return { destroy: () => { host.innerHTML = ''; }, lines: total, truncated };
};
