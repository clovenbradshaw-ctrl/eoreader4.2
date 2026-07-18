// EO: SIG(Lens → Lens, Tending) — Research Review, the mounted surface (docs/research-review.md).
// Search results become a provisional, inspectable corpus before anything is admitted to a real
// topic. Vanilla DOM, own CSS-in-JS, no framework — the same room idiom as binvis-surface.js:
//   mountResearchReview(host, { app, topicId, onClose, onOpenSource, onOpenMark }) → { show, destroy }
// The engine (research-review.js / research-review-corpus.js) computes everything; this only
// paints it and wires clicks through app.review* calls. The newer §7/§9 sections (evidence matrix,
// source network, identity review, derivative-cluster actions, gap-directed research) render
// through research-review-surface2.js — split out under the god-module ratchet (~250 lines/file).
import { el, renderCandidateCard, renderArea, renderMeasureRow } from './research-review-cards.js';
import {
  renderEvidenceMatrixSection, renderSourceNetworkSection, renderIdentityReviewSection,
  renderDerivativeClustersSection, renderGapDirectedSection,
} from './research-review-surface2.js';
import { ensureStyle } from './research-review-style.js';

const RECIPES = [['balanced', 'Balanced'], ['primary', 'Primary evidence'], ['smallest', 'Smallest sufficient'], ['perspectives', 'Perspectives'], ['contradiction', 'Contradiction-seeking'], ['historical', 'Historical']];
const FILTERS = [['all', 'All'], ['recommended', 'Recommended'], ['primary', 'Primary'], ['duplicates', 'Duplicates']];

export const mountResearchReview = (host, { app, topicId, onClose = () => {}, onOpenSource = null, onOpenMark = null } = {}) => {
  const doc = host.ownerDocument || document;
  ensureStyle(doc);
  const root = el(doc, 'div', 'eo-rr__body');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Research Review');
  const live = el(doc, 'div', 'eo-rr__live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  host.appendChild(root);
  host.appendChild(live);

  let curTopicId = topicId, filter = 'all', areaFilter = null, admitTargetId = null;
  let netExpanded = false;
  const diffOpenSet = new Set();

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
  const openSource = (sn) => { if (onOpenSource) onOpenSource(sn); };
  const openMark = (sn, ordinal) => { if (!onOpenMark) return; const payload = app.reviewOpenMark ? app.reviewOpenMark(curTopicId, sn, ordinal) : null; if (payload) onOpenMark(payload); };
  const titleOf = (sn, view) => { const r = view.rows.find((x) => x.sn === sn); return (r && (r.title || r.domain)) || sn; };

  const render = () => {
    root.innerHTML = '';
    const view = app.reviewCompute(curTopicId);
    if (!view) { root.appendChild(el(doc, 'div', 'eo-rr__empty', 'This research review is no longer available.')); return; }
    const titleFor = (sn) => titleOf(sn, view);

    // header
    root.appendChild(el(doc, 'div', 'eo-rr__crumb', 'Research Review'));
    const titleRow = el(doc, 'div'); titleRow.style.cssText = 'display:flex;align-items:flex-start;gap:10px';
    titleRow.appendChild(el(doc, 'div', 'eo-rr__title', view.topic.title || view.query));
    const closeBtn = el(doc, 'button', 'eo-rr__closeBtn', '×'); closeBtn.setAttribute('aria-label', 'Close Research Review'); closeBtn.addEventListener('click', () => onClose());
    titleRow.appendChild(closeBtn);
    root.appendChild(titleRow);
    root.appendChild(el(doc, 'div', 'eo-rr__stats',
      `${view.stats.sourceCount} candidate${view.stats.sourceCount === 1 ? '' : 's'} reviewed · ${view.stats.independentOrigins} independent origin${view.stats.independentOrigins === 1 ? '' : 's'} · ${view.stats.sourceTypeCount} source type${view.stats.sourceTypeCount === 1 ? '' : 's'} · No frontier LLM used`));

    // toolbar — refine search, add URL
    const toolbar = el(doc, 'div', 'eo-rr__toolbar');
    const input = doc.createElement('input'); input.type = 'text'; input.value = view.query; input.placeholder = 'Refine search…';
    toolbar.appendChild(input);
    const refineBtn = el(doc, 'button', 'eo-rr__btn', 'Refine search');
    refineBtn.addEventListener('click', () => { const q = input.value.trim(); if (!q) return; app.reviewStart(q).then((t) => { if (t) { curTopicId = t.id; render(); } }); });
    toolbar.appendChild(refineBtn);
    const urlInput = doc.createElement('input'); urlInput.type = 'text'; urlInput.placeholder = 'Add URL…'; urlInput.style.maxWidth = '220px';
    toolbar.appendChild(urlInput);
    const addUrlBtn = el(doc, 'button', 'eo-rr__btn', 'Add URL');
    addUrlBtn.addEventListener('click', () => { const u = urlInput.value.trim(); if (!u) return; app.reviewAddUrl(curTopicId, u).then(() => render()); urlInput.value = ''; });
    toolbar.appendChild(addUrlBtn);
    root.appendChild(toolbar);

    // corpus recipes
    const recipeRow = el(doc, 'div', 'eo-rr__recipes');
    const curRecipeKey = view.topic.review.recipe;
    for (const [key, label] of RECIPES) {
      const b = el(doc, 'button', 'eo-rr__recipe' + (curRecipeKey === key ? ' eo-rr__recipe--on' : ''), label);
      b.addEventListener('click', () => { app.reviewApplyRecipe(curTopicId, key); announce(`${label} recipe applied`); render(); });
      recipeRow.appendChild(b);
    }
    root.appendChild(recipeRow);
    const curRecipe = view.recipes[curRecipeKey] || view.recipes.balanced;
    if (curRecipe) root.appendChild(el(doc, 'div', 'eo-rr__why', curRecipe.why));

    // research reading
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Research reading'));
    const reading = el(doc, 'div', 'eo-rr__reading');
    for (const line of view.reading) reading.appendChild(el(doc, 'p', null, line));
    root.appendChild(reading);

    // evidence map
    if (view.areas.length) {
      root.appendChild(el(doc, 'div', 'eo-rr__section', 'Evidence map'));
      for (const a of view.areas) root.appendChild(renderArea(doc, a, { active: areaFilter === a.label, onClick: (label) => { areaFilter = areaFilter === label ? null : label; render(); } }));
    }

    // what the corpus covers (§9 gap-directed research)
    const gapSec = renderGapDirectedSection(doc, view, {
      onSearch: (area, key) => { app.reviewExpand(curTopicId, { template: key, area }).then((n) => { announce(`${n || 0} candidate${n === 1 ? '' : 's'} added`); render(); }); },
    });
    if (gapSec) root.appendChild(gapSec);

    // how the sources connect
    if (view.narrative.length) {
      root.appendChild(el(doc, 'div', 'eo-rr__section', 'How the sources connect'));
      const nar = el(doc, 'div', 'eo-rr__narrative');
      for (const line of view.narrative) nar.appendChild(el(doc, 'p', null, line));
      root.appendChild(nar);
    }
    const netSec = renderSourceNetworkSection(doc, view, {
      titleOf: titleFor, onOpenSource: openSource, expanded: netExpanded,
      onToggleExpand: () => { netExpanded = !netExpanded; render(); },
    });
    if (netSec) root.appendChild(netSec);
    const clusterSec = renderDerivativeClustersSection(doc, view, {
      titleOf: titleFor, diffOpenSet,
      onAction: (originSn, action) => { app.reviewClusterAction(curTopicId, originSn, action); render(); },
      onToggleDiff: (originSn) => { if (diffOpenSet.has(originSn)) diffOpenSet.delete(originSn); else diffOpenSet.add(originSn); render(); },
      onMarkIndependent: (sn) => { app.reviewToggleIndependent(curTopicId, sn); render(); },
    });
    if (clusterSec) root.appendChild(clusterSec);

    // identity review (§7.3)
    const idSec = renderIdentityReviewSection(doc, view, {
      titleOf: titleFor,
      onSet: (key, decision) => { app.reviewSetIdentity(curTopicId, key, decision); render(); },
    });
    if (idSec) root.appendChild(idSec);

    // agreements / disagreements (measure prose) + the unified evidence matrix (§7.1)
    if (view.topic.review && app.comparisonMatrix) {
      let matrix = null; try { matrix = app.comparisonMatrix(); } catch { matrix = null; }
      if (matrix && matrix.rows.length) {
        root.appendChild(el(doc, 'div', 'eo-rr__section', 'Agreements and disagreements'));
        for (const row of matrix.rows.slice(0, 10)) root.appendChild(renderMeasureRow(doc, row, matrix.sources, { onOpen: openSource }));
      }
    }
    const matrixSec = renderEvidenceMatrixSection(doc, view, { onOpenSource: openSource });
    if (matrixSec) root.appendChild(matrixSec);

    // candidate sources
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Candidate sources'));
    const filterRow = el(doc, 'div', 'eo-rr__filters');
    for (const [key, label] of FILTERS) {
      const b = el(doc, 'button', 'eo-rr__filter' + (filter === key ? ' eo-rr__filter--on' : ''), label);
      b.addEventListener('click', () => { filter = key; render(); });
      filterRow.appendChild(b);
    }
    root.appendChild(filterRow);
    const recommendedSns = new Set(curRecipe ? curRecipe.sns : []);
    const linksBySn = new Map();
    const pushLink = (sn, l) => { let a = linksBySn.get(sn); if (!a) linksBySn.set(sn, a = []); a.push(l); };
    for (const l of view.links) { pushLink(l.a, l); pushLink(l.b, l); }
    const cardsWrap = el(doc, 'div', 'eo-rr__cards');
    const visible = view.cards.filter((c) => {
      if (areaFilter && !view.areas.find((a) => a.label === areaFilter)?.sns.includes(c.row.sn)) return false;
      if (filter === 'recommended') return recommendedSns.has(c.row.sn);
      if (filter === 'primary') return c.role.primary;
      if (filter === 'duplicates') return c.role.isDerivative || c.role.isOrigin;
      return true;
    });
    for (const card of visible) {
      cardsWrap.appendChild(renderCandidateCard(doc, card, {
        checked: !view.excludedSns.has(card.row.sn),
        onToggle: (sn) => { app.reviewToggleExclude(curTopicId, sn); announce('Selection updated'); render(); },
        onOpen: openSource, onOpenMark: openMark, connections: linksBySn.get(card.row.sn) || [],
        waveform: view.waveforms && view.waveforms[card.row.sn],
      }));
    }
    root.appendChild(cardsWrap);

    // discovered — not yet reviewed
    if (view.discovered.length) {
      root.appendChild(el(doc, 'div', 'eo-rr__section', `Discovered — not yet reviewed (${view.discovered.length})`));
      const disc = el(doc, 'div', 'eo-rr__discovered');
      for (const item of view.discovered.slice(0, 8)) {
        const row = el(doc, 'div', 'eo-rr__discoveredRow');
        row.appendChild(el(doc, 'span', null, item.title || item.url));
        disc.appendChild(row);
      }
      root.appendChild(disc);
      const moreBtn = el(doc, 'button', 'eo-rr__btn', `Review ${Math.min(6, view.discovered.length)} more`);
      moreBtn.addEventListener('click', () => { app.reviewMore(curTopicId, 6).then(() => render()); });
      root.appendChild(moreBtn);
    }

    // footer — selected corpus preview (§5.7, scoped to the current selection) + admission
    const s = view.selectedStats || view.stats;
    const kept = view.rows.map((r) => r.sn).filter((sn) => !view.excludedSns.has(sn));
    const footer = el(doc, 'div', 'eo-rr__footer');
    footer.appendChild(el(doc, 'div', 'eo-rr__footerStats',
      `${kept.length} selected · ${s.independentOrigins} origin${s.independentOrigins === 1 ? '' : 's'} · `
      + `${s.sharedReferents} shared referent${s.sharedReferents === 1 ? '' : 's'} · ${s.comparablePropositions ?? 0} comparable proposition${s.comparablePropositions === 1 ? '' : 's'} · `
      + `${s.comparableMeasures} measure${s.comparableMeasures === 1 ? '' : 's'} · ${s.disagreements} disagreement${s.disagreements === 1 ? '' : 's'} · `
      + `${s.unresolvedIdentityCount ?? 0} unresolved identity match${s.unresolvedIdentityCount === 1 ? '' : 'es'}`));
    const admitBtn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--accent', `Add ${kept.length} selected to topic`);
    admitBtn.disabled = !kept.length;
    admitBtn.addEventListener('click', () => {
      const target = app.reviewAdmit(curTopicId, admitTargetId ? { targetTopicId: admitTargetId } : { newTitle: view.query });
      if (target) onClose(target);
    });
    footer.appendChild(admitBtn);
    root.appendChild(footer);
  };

  render();
  const unsub = app.subscribe ? app.subscribe((kind) => { if (kind === 'topics' || kind === 'sources') render(); }) : () => {};
  return {
    show: (nextTopicId) => { curTopicId = nextTopicId; render(); },
    destroy: () => { try { unsub(); } catch {} host.innerHTML = ''; },
  };
};
