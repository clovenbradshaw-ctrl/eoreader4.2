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
  renderDerivativeClustersSection, renderGapDirectedSection, renderToolbarSection,
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
  let netExpanded = false, advanced = false;
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

    // header — plain and short: the query, a bare source count, done. The detailed corpus-analysis
    // stats (independent origins, source types, …) move into "Show research tools" below; a reader
    // asking "who is Neil Armstrong" has no use for them at the top of the page.
    root.appendChild(el(doc, 'div', 'eo-rr__crumb', 'Research Review'));
    const titleRow = el(doc, 'div'); titleRow.style.cssText = 'display:flex;align-items:flex-start;gap:10px';
    titleRow.appendChild(el(doc, 'div', 'eo-rr__title', view.topic.title || view.query));
    const closeBtn = el(doc, 'button', 'eo-rr__closeBtn', '×'); closeBtn.setAttribute('aria-label', 'Close Research Review'); closeBtn.addEventListener('click', () => onClose());
    titleRow.appendChild(closeBtn);
    root.appendChild(titleRow);
    root.appendChild(el(doc, 'div', 'eo-rr__stats', `${view.stats.sourceCount} source${view.stats.sourceCount === 1 ? '' : 's'} found`));

    // THE ANSWER — a verbatim excerpt from the top source's own opening text, plainly attributed.
    // Model-free, same discipline as everything else here: this quotes, it never composes. For a
    // "who is X" / "what is Y" question the lead source's own lead paragraph already IS the answer.
    if (view.answer) {
      const ans = el(doc, 'div', 'eo-rr__answer');
      ans.appendChild(el(doc, 'p', 'eo-rr__answerText', view.answer.text + (view.answer.truncated ? '…' : '')));
      const attrLabel = [view.answer.title, view.answer.domain].filter(Boolean).join(' · ') || view.answer.sn;
      const attr = el(doc, 'button', 'eo-rr__answerSrc', attrLabel);
      attr.addEventListener('click', () => openSource(view.answer.sn));
      ans.appendChild(attr);
      root.appendChild(ans);
    }

    // corpus recipes/knobs computed regardless of whether the recipe UI itself is shown below —
    // the "recommended" card filter and the admit footer both read curRecipe.
    const curRecipeKey = view.topic.review.recipe;
    const curRecipe = view.recipes[curRecipeKey] || view.recipes.balanced;
    const recommendedSns = new Set(curRecipe ? curRecipe.sns : []);
    const linksBySn = new Map();
    const pushLink = (sn, l) => { let a = linksBySn.get(sn); if (!a) linksBySn.set(sn, a = []); a.push(l); };
    for (const l of view.links) { pushLink(l.a, l); pushLink(l.b, l); }

    // SOURCES — always visible, compact by default (just enough to pick and open one); the filter
    // row only matters once there is a recipe/area to filter BY, so it lives behind "advanced" too.
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Sources'));
    const filterRow = el(doc, 'div', 'eo-rr__filters');
    for (const [key, label] of FILTERS) {
      const b = el(doc, 'button', 'eo-rr__filter' + (filter === key ? ' eo-rr__filter--on' : ''), label);
      b.addEventListener('click', () => { filter = key; render(); });
      filterRow.appendChild(b);
    }
    filterRow.style.display = advanced ? '' : 'none';
    root.appendChild(filterRow);

    const activeFilter = advanced ? filter : 'all';
    const activeAreaFilter = advanced ? areaFilter : null;
    const cardsWrap = el(doc, 'div', 'eo-rr__cards');
    const visible = view.cards.filter((c) => {
      if (activeAreaFilter && !view.areas.find((a) => a.label === activeAreaFilter)?.sns.includes(c.row.sn)) return false;
      if (activeFilter === 'recommended') return recommendedSns.has(c.row.sn);
      if (activeFilter === 'primary') return c.role.primary;
      if (activeFilter === 'duplicates') return c.role.isDerivative || c.role.isOrigin;
      return true;
    });
    for (const card of visible) {
      cardsWrap.appendChild(renderCandidateCard(doc, card, {
        checked: !view.excludedSns.has(card.row.sn), compact: !advanced,
        onToggle: (sn) => { app.reviewToggleExclude(curTopicId, sn); announce('Selection updated'); render(); },
        onOpen: openSource, onOpenMark: openMark, connections: linksBySn.get(card.row.sn) || [],
        waveform: view.waveforms && view.waveforms[card.row.sn],
      }));
    }
    root.appendChild(cardsWrap);

    // ADVANCED — everything a real corroboration question needs (recipes, the evidence map,
    // connections, disagreements, gap-directed search) and a simple factual lookup never does.
    // Collapsed by default; nothing here is removed, only deferred behind one click.
    const advToggle = el(doc, 'button', 'eo-rr__advToggle');
    advToggle.setAttribute('aria-expanded', String(advanced));
    advToggle.textContent = advanced ? 'Hide research tools ▴' : 'Show research tools ▾';
    advToggle.addEventListener('click', () => { advanced = !advanced; render(); });
    root.appendChild(advToggle);

    const advWrap = el(doc, 'div', 'eo-rr__advWrap');
    advWrap.style.display = advanced ? '' : 'none';

    // toolbar — refine search, add URL
    advWrap.appendChild(renderToolbarSection(doc, view, {
      onRefine: (q) => { if (!q) return; app.reviewStart(q).then((t) => { if (t) { curTopicId = t.id; render(); } }); },
      onAddUrl: (u) => { app.reviewAddUrl(curTopicId, u).then(() => render()); },
    }));

    // corpus recipes
    const recipeRow = el(doc, 'div', 'eo-rr__recipes');
    for (const [key, label] of RECIPES) {
      const b = el(doc, 'button', 'eo-rr__recipe' + (curRecipeKey === key ? ' eo-rr__recipe--on' : ''), label);
      b.addEventListener('click', () => { app.reviewApplyRecipe(curTopicId, key); announce(`${label} recipe applied`); render(); });
      recipeRow.appendChild(b);
    }
    advWrap.appendChild(recipeRow);
    if (curRecipe) advWrap.appendChild(el(doc, 'div', 'eo-rr__why', curRecipe.why));

    // the detailed corpus stats the header used to carry
    advWrap.appendChild(el(doc, 'div', 'eo-rr__stats',
      `${view.stats.independentOrigins} independent origin${view.stats.independentOrigins === 1 ? '' : 's'} · ${view.stats.sourceTypeCount} source type${view.stats.sourceTypeCount === 1 ? '' : 's'} · No frontier LLM used`));

    // research reading
    advWrap.appendChild(el(doc, 'div', 'eo-rr__section', 'Research reading'));
    const reading = el(doc, 'div', 'eo-rr__reading');
    for (const line of view.reading) reading.appendChild(el(doc, 'p', null, line));
    advWrap.appendChild(reading);

    // evidence map
    if (view.areas.length) {
      advWrap.appendChild(el(doc, 'div', 'eo-rr__section', 'Evidence map'));
      for (const a of view.areas) advWrap.appendChild(renderArea(doc, a, { active: areaFilter === a.label, onClick: (label) => { areaFilter = areaFilter === label ? null : label; render(); } }));
    }

    // what the corpus covers (§9 gap-directed research)
    const gapSec = renderGapDirectedSection(doc, view, {
      onSearch: (area, key) => { app.reviewExpand(curTopicId, { template: key, area }).then((n) => { announce(`${n || 0} candidate${n === 1 ? '' : 's'} added`); render(); }); },
    });
    if (gapSec) advWrap.appendChild(gapSec);

    // how the sources connect
    if (view.narrative.length) {
      advWrap.appendChild(el(doc, 'div', 'eo-rr__section', 'How the sources connect'));
      const nar = el(doc, 'div', 'eo-rr__narrative');
      for (const line of view.narrative) nar.appendChild(el(doc, 'p', null, line));
      advWrap.appendChild(nar);
    }
    const netSec = renderSourceNetworkSection(doc, view, {
      titleOf: titleFor, onOpenSource: openSource, expanded: netExpanded,
      onToggleExpand: () => { netExpanded = !netExpanded; render(); },
    });
    if (netSec) advWrap.appendChild(netSec);
    const clusterSec = renderDerivativeClustersSection(doc, view, {
      titleOf: titleFor, diffOpenSet,
      onAction: (originSn, action) => { app.reviewClusterAction(curTopicId, originSn, action); render(); },
      onToggleDiff: (originSn) => { if (diffOpenSet.has(originSn)) diffOpenSet.delete(originSn); else diffOpenSet.add(originSn); render(); },
      onMarkIndependent: (sn) => { app.reviewToggleIndependent(curTopicId, sn); render(); },
    });
    if (clusterSec) advWrap.appendChild(clusterSec);

    // identity review (§7.3)
    const idSec = renderIdentityReviewSection(doc, view, {
      titleOf: titleFor,
      onSet: (key, decision) => { app.reviewSetIdentity(curTopicId, key, decision); render(); },
    });
    if (idSec) advWrap.appendChild(idSec);

    // agreements / disagreements (measure prose) + the unified evidence matrix (§7.1)
    if (view.topic.review && app.comparisonMatrix) {
      let matrix = null; try { matrix = app.comparisonMatrix(); } catch { matrix = null; }
      if (matrix && matrix.rows.length) {
        advWrap.appendChild(el(doc, 'div', 'eo-rr__section', 'Agreements and disagreements'));
        for (const row of matrix.rows.slice(0, 10)) advWrap.appendChild(renderMeasureRow(doc, row, matrix.sources, { onOpen: openSource }));
      }
    }
    const matrixSec = renderEvidenceMatrixSection(doc, view, { onOpenSource: openSource });
    if (matrixSec) advWrap.appendChild(matrixSec);

    // discovered — not yet reviewed
    if (view.discovered.length) {
      advWrap.appendChild(el(doc, 'div', 'eo-rr__section', `Discovered — not yet reviewed (${view.discovered.length})`));
      const disc = el(doc, 'div', 'eo-rr__discovered');
      for (const item of view.discovered.slice(0, 8)) {
        const row = el(doc, 'div', 'eo-rr__discoveredRow');
        row.appendChild(el(doc, 'span', null, item.title || item.url));
        disc.appendChild(row);
      }
      advWrap.appendChild(disc);
      const moreBtn = el(doc, 'button', 'eo-rr__btn', `Review ${Math.min(6, view.discovered.length)} more`);
      moreBtn.addEventListener('click', () => { app.reviewMore(curTopicId, 6).then(() => render()); });
      advWrap.appendChild(moreBtn);
    }
    root.appendChild(advWrap);

    // footer — selected corpus preview (§5.7, scoped to the current selection) + admission. Plain
    // "N selected" by default; the jargon-heavy breakdown only once "research tools" is open.
    const s = view.selectedStats || view.stats;
    const kept = view.rows.map((r) => r.sn).filter((sn) => !view.excludedSns.has(sn));
    const footer = el(doc, 'div', 'eo-rr__footer');
    let footerText = `${kept.length} selected`;
    if (advanced) {
      footerText += ` · ${s.independentOrigins} origin${s.independentOrigins === 1 ? '' : 's'} · `
        + `${s.sharedReferents} shared referent${s.sharedReferents === 1 ? '' : 's'} · ${s.comparablePropositions ?? 0} comparable proposition${s.comparablePropositions === 1 ? '' : 's'} · `
        + `${s.comparableMeasures} measure${s.comparableMeasures === 1 ? '' : 's'} · ${s.disagreements} disagreement${s.disagreements === 1 ? '' : 's'} · `
        + `${s.unresolvedIdentityCount ?? 0} unresolved identity match${s.unresolvedIdentityCount === 1 ? '' : 'es'}`;
    }
    footer.appendChild(el(doc, 'div', 'eo-rr__footerStats', footerText));
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
