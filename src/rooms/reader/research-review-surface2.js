// EO: SIG·INS(Lens,Void → Entity,Void, Tending,Making) — Research Review: the newer sections (§7
// evidence matrix / source network / identity review, §9 gap-directed research, §7.4 derivative-
// cluster actions). Split out of research-review-surface.js under the god-module ratchet (~250
// lines/file) — same idiom: each function renders ONE section from the computed view and a handlers
// object, appending nothing itself; research-review-surface.js's render() calls these and appends
// the result. No app state read here.
import { el } from './research-review-cards.js';
import {
  renderIdentityRow, renderNetworkEdgeRow, renderMatrixTable, renderGapArea, renderClusterActions,
} from './research-review-cards2.js';

const section = (doc, label, body) => {
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', label));
  wrap.appendChild(body);
  return wrap;
};

// renderToolbarSection(doc, view, ctx) → the refine-search / add-URL row. A small presentational
// unit, homed here (not research-review-surface.js) to keep that file under the god-module ratchet.
// ctx: { onRefine(query), onAddUrl(url) }.
export const renderToolbarSection = (doc, view, ctx) => {
  const toolbar = el(doc, 'div', 'eo-rr__toolbar');
  const input = doc.createElement('input'); input.type = 'text'; input.value = view.query; input.placeholder = 'Refine search…';
  toolbar.appendChild(input);
  const refineBtn = el(doc, 'button', 'eo-rr__btn', 'Refine search');
  refineBtn.addEventListener('click', () => ctx.onRefine(input.value.trim()));
  toolbar.appendChild(refineBtn);
  const urlInput = doc.createElement('input'); urlInput.type = 'text'; urlInput.placeholder = 'Add URL…'; urlInput.style.maxWidth = '220px';
  toolbar.appendChild(urlInput);
  const addUrlBtn = el(doc, 'button', 'eo-rr__btn', 'Add URL');
  addUrlBtn.addEventListener('click', () => { const u = urlInput.value.trim(); if (u) ctx.onAddUrl(u); urlInput.value = ''; });
  toolbar.appendChild(addUrlBtn);
  return toolbar;
};

// renderEvidenceMatrixSection(doc, view, ctx) → §7.1. Columns are the CURRENT proposed-corpus
// selection (view.evidenceMatrix is already scoped to it) — the header states that scope so a
// reader never mistakes it for "every reviewed candidate".
export const renderEvidenceMatrixSection = (doc, view, ctx) => {
  const m = view.evidenceMatrix;
  if (!m || !m.rows.length || !m.sources.length) return null;
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', `Evidence matrix — ${m.sources.length} selected candidate${m.sources.length === 1 ? '' : 's'}`));
  wrap.appendChild(renderMatrixTable(doc, m, { onOpenCell: (row, sn) => ctx.onOpenSource(sn) }));
  return wrap;
};

// renderSourceNetworkSection(doc, view, ctx) → §7.2, typed edges. A capped, always-visible LIST —
// the structured-list alternative §15 requires for every graph is the primary view here; a
// force-directed visual layout is not built (docs/research-review.md "what is next").
export const renderSourceNetworkSection = (doc, view, ctx) => {
  const net = view.network;
  if (!net || !net.edges.length) return null;
  const shown = ctx.expanded ? net.edges : net.edges.slice(0, 8);
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', `Source network — ${net.total} connection${net.total === 1 ? '' : 's'}`));
  const list = el(doc, 'div');
  for (const edge of shown) list.appendChild(renderNetworkEdgeRow(doc, edge, { titleOf: ctx.titleOf, onOpen: ctx.onOpenSource }));
  wrap.appendChild(list);
  if (net.edges.length > shown.length || (net.truncated && ctx.expanded)) {
    const more = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', ctx.expanded ? 'Show fewer' : `Show all ${net.total}`);
    more.addEventListener('click', ctx.onToggleExpand);
    wrap.appendChild(more);
  }
  return wrap;
};

// renderIdentityReviewSection(doc, view, ctx) → §7.3, confirm/reject cross-source referent matches.
export const renderIdentityReviewSection = (doc, view, ctx) => {
  const ids = view.identity;
  if (!ids || !ids.length) return null;
  const wrap = doc.createDocumentFragment();
  const unresolved = ids.filter((c) => c.state === 'candidate').length;
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', `Identity review — ${unresolved} unresolved`));
  const list = el(doc, 'div');
  for (const c of ids) list.appendChild(renderIdentityRow(doc, c, { titleOf: ctx.titleOf, onSet: ctx.onSet }));
  wrap.appendChild(list);
  return wrap;
};

// renderDerivativeClustersSection(doc, view, ctx) → §7.4. Every cluster with a derivative gets its
// batch actions; "Review differences" expands each member's title + a short excerpt inline — a real
// diff, not a fabricated semantic comparison.
export const renderDerivativeClustersSection = (doc, view, ctx) => {
  const clusters = view.clusters.filter((c) => c.derivative.length > 0);
  if (!clusters.length) return null;
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', `Derivative clusters — ${clusters.length}`));
  for (const c of clusters) {
    const head = el(doc, 'div', 'eo-rr__cardRow', `${c.origin.title || c.origin.sn} — apparent origin for ${c.derivative.length} other${c.derivative.length === 1 ? '' : 's'}`);
    wrap.appendChild(head);
    wrap.appendChild(renderClusterActions(doc, c, {
      diffOpen: ctx.diffOpenSet.has(c.origin.sn),
      onAction: (action) => ctx.onAction(c.origin.sn, action),
      onToggleDiff: () => ctx.onToggleDiff(c.origin.sn),
      onMarkIndependent: ctx.onMarkIndependent,
    }));
    if (ctx.diffOpenSet.has(c.origin.sn)) {
      const diff = el(doc, 'div');
      for (const m of c.members) {
        const row = el(doc, 'div', 'eo-rr__cardRow');
        row.appendChild(el(doc, 'span', 'eo-rr__cardLbl', m.title || m.sn));
        row.appendChild(el(doc, 'span', null, String(m.text || '').slice(0, 160).trim() + (String(m.text || '').length > 160 ? '…' : '')));
        diff.appendChild(row);
      }
      wrap.appendChild(diff);
    }
  }
  return wrap;
};

// renderGapDirectedSection(doc, view, ctx) → §9: Strong/Partial/Missing tiers, each thin area
// carrying its narrowly-scoped search actions. Results land in the SAME review (ctx.onSearch).
export const renderGapDirectedSection = (doc, view, ctx) => {
  const g = view.gaps;
  if (!g || (!g.strong.length && !g.partial.length && !g.missing.length)) return null;
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'eo-rr__section', 'What the corpus covers'));
  const tier = (label, mark, areas, actionable) => {
    if (!areas.length) return;
    const t = el(doc, 'div', 'eo-rr__gapTier');
    t.appendChild(el(doc, 'div', 'eo-rr__gapTierLabel', label));
    for (const a of areas) {
      if (actionable) t.appendChild(renderGapArea(doc, a, { onSearch: (key) => ctx.onSearch(a, key) }));
      else t.appendChild(el(doc, 'div', 'eo-rr__gapArea', `${mark} ${a.label}`));
    }
    wrap.appendChild(t);
  };
  tier('Strong', '✓', g.strong, false);
  tier('Partial', '△', g.partial, false);
  tier('Missing / thin', '○', g.missing, true);
  return wrap;
};
