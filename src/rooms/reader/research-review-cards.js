// EO: SIG(Lens → Lens, Tending) — Research Review surface: the parts that repeat (a card, an
// area row, a connection line, a measure row). Pure DOM builders — each takes a document, the
// computed view (research-review-corpus.js researchReview output) or a slice of it, and a
// handlers object, and returns an element. No app state read here; research-review-surface.js
// owns the mount lifecycle and passes everything in. Split out under the god-module ratchet.

export const el = (doc, tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const fmtAgo = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d <= 0) return 'today'; if (d === 1) return '1 day ago'; if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
};

// badge(doc, label, tone) → a small pill. tone ∈ recommended|primary|duplicate|origin|neutral.
const TONE = {
  recommended: 'eo-rr__badge--rec', primary: 'eo-rr__badge--prim', duplicate: 'eo-rr__badge--dup',
  origin: 'eo-rr__badge--origin', neutral: 'eo-rr__badge--neutral',
};
export const badge = (doc, label, tone = 'neutral') => el(doc, 'span', `eo-rr__badge ${TONE[tone] || TONE.neutral}`, label);

// renderCandidateCard(doc, card, ctx) → one candidate source card (docs/research-review.md §3).
// `card` is one of researchReview()'s `cards` entries: { row, role }. `ctx`: { checked, onToggle,
// onOpen, connections: [{other, sharedCount, names}] }.
export const renderCandidateCard = (doc, card, ctx) => {
  const { row, role } = card;
  const wrap = el(doc, 'div', 'eo-rr__card');
  const head = el(doc, 'div', 'eo-rr__cardHead');
  const cb = doc.createElement('input'); cb.type = 'checkbox'; cb.checked = ctx.checked; cb.className = 'eo-rr__check';
  cb.addEventListener('change', () => ctx.onToggle(row.sn));
  head.appendChild(cb);
  const badges = el(doc, 'div', 'eo-rr__badges');
  if (ctx.checked) badges.appendChild(badge(doc, '✓ recommended', 'recommended'));
  if (role.primary) badges.appendChild(badge(doc, 'primary', 'primary'));
  if (role.isOrigin) badges.appendChild(badge(doc, 'apparent origin', 'origin'));
  if (role.isDerivative) badges.appendChild(badge(doc, 'possible duplicate', 'duplicate'));
  head.appendChild(badges);
  wrap.appendChild(head);

  const title = el(doc, 'button', 'eo-rr__cardTitle', row.title || row.domain || row.sn);
  title.addEventListener('click', () => ctx.onOpen(row.sn));
  wrap.appendChild(title);
  wrap.appendChild(el(doc, 'div', 'eo-rr__cardMeta', [row.domain, row.kind, fmtAgo(row.retrieved)].filter(Boolean).join(' · ')));

  if (role.contributes.length) {
    const c = el(doc, 'div', 'eo-rr__cardRow');
    c.appendChild(el(doc, 'span', 'eo-rr__cardLbl', 'Contributes'));
    c.appendChild(el(doc, 'span', null, role.contributes.join(' · ')));
    wrap.appendChild(c);
  }
  if (role.measures.length) {
    const m = el(doc, 'div', 'eo-rr__cardRow');
    m.appendChild(el(doc, 'span', 'eo-rr__cardLbl', 'Measures'));
    m.appendChild(el(doc, 'span', null, [...new Set(role.measures)].join(' · ')));
    wrap.appendChild(m);
  }
  if (ctx.connections && ctx.connections.length) {
    const cx = el(doc, 'div', 'eo-rr__cardRow');
    cx.appendChild(el(doc, 'span', 'eo-rr__cardLbl', 'Connects to'));
    cx.appendChild(el(doc, 'span', null, `${ctx.connections.length} other candidate${ctx.connections.length === 1 ? '' : 's'} through shared referents`));
    wrap.appendChild(cx);
  }
  if (role.isDerivative) {
    const caution = el(doc, 'div', 'eo-rr__caution', 'Shares an identity fact (host, hash, or byline) with another reviewed source — likely the same voice, not independent corroboration.');
    wrap.appendChild(caution);
  }

  const open = el(doc, 'button', 'eo-rr__openLink', 'Open source ↗');
  open.addEventListener('click', () => ctx.onOpen(row.sn));
  wrap.appendChild(open);
  return wrap;
};

// renderArea(doc, area, ctx) → one EVIDENCE MAP row. ctx: { active, onClick }.
export const renderArea = (doc, area, ctx) => {
  const row = el(doc, 'button', 'eo-rr__areaRow' + (ctx.active ? ' eo-rr__areaRow--on' : ''));
  row.addEventListener('click', () => ctx.onClick(area.label));
  row.appendChild(el(doc, 'span', 'eo-rr__areaLabel', area.label));
  const dots = el(doc, 'span', 'eo-rr__dots');
  for (let i = 0; i < 5; i++) dots.appendChild(el(doc, 'span', 'eo-rr__dot' + (i < area.dots ? ' eo-rr__dot--on' : '')));
  row.appendChild(dots);
  row.appendChild(el(doc, 'span', 'eo-rr__areaN', `${area.sourceCount} source${area.sourceCount === 1 ? '' : 's'} · ${area.independentOrigins} origin${area.independentOrigins === 1 ? '' : 's'}`));
  return row;
};

// renderMeasureRow(doc, row, cols, ctx) → one AGREEMENTS/DISAGREEMENTS row (comparisonMatrix's
// shape: `row.cells` is parallel to the matrix's own top-level `sources` column list, `cols`).
export const renderMeasureRow = (doc, row, cols, ctx) => {
  const wrap = el(doc, 'div', 'eo-rr__measureRow' + (row.conflict ? ' eo-rr__measureRow--conflict' : ''));
  wrap.appendChild(el(doc, 'span', 'eo-rr__measureLabel', row.measureLabel));
  wrap.appendChild(el(doc, 'span', 'eo-rr__measureReading', row.reading));
  const cells = el(doc, 'div', 'eo-rr__measureCells');
  row.cells.forEach((c, i) => {
    if (!c) return;
    const chip = el(doc, 'button', 'eo-rr__measureCell', `${(cols[i] && cols[i].label) || c.sourceLabel || ''}: ${c.display}`);
    chip.addEventListener('click', () => ctx.onOpen(c.source, c.text));
    cells.appendChild(chip);
  });
  wrap.appendChild(cells);
  return wrap;
};
