// EO: SIG(Lens → Lens, Tending) — Research Review, the mounted surface (docs/research-review.md).
// Search results become a provisional, inspectable corpus before anything is admitted to a real
// topic. Vanilla DOM, own CSS-in-JS, no framework — the same room idiom as binvis-surface.js:
//   mountResearchReview(host, { app, topicId, onClose }) → { show(topicId), destroy }
// The engine (research-review.js / research-review-corpus.js) computes everything; this only
// paints it and wires clicks through app.review* calls.
import { el, badge, renderCandidateCard, renderArea, renderMeasureRow } from './research-review-cards.js';

const STYLE_ID = 'eo-rr-style';
const CSS = `
.eo-rr__body{padding:20px 22px 90px;overflow:auto;max-width:820px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1B22}
.eo-rr__crumb{font-size:11px;color:#9A9AA4;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace}
.eo-rr__title{font-family:'Newsreader',Georgia,serif;font-size:22px;font-weight:600;margin:2px 0 6px}
.eo-rr__stats{font-size:12px;color:#8A8A95;margin-bottom:14px}
.eo-rr__toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.eo-rr__toolbar input[type=text]{flex:1;min-width:160px;border:1px solid #E6E6EC;background:#F7F7FA;border-radius:9px;padding:8px 11px;font-size:13px;color:#1B1B22}
.eo-rr__btn{font-size:12px;font-weight:600;color:#3A3A44;background:#fff;border:1px solid #E0E0E6;border-radius:9px;padding:7px 12px;cursor:pointer}
.eo-rr__btn:hover{background:#F5F5F8}
.eo-rr__btn--accent{color:#fff;background:#6D5EF5;border-color:#6D5EF5}
.eo-rr__btn--accent:hover{background:#5B4BE6}
.eo-rr__closeBtn{margin-left:auto;width:28px;height:28px;border-radius:7px;color:#8A8A95;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer}
.eo-rr__closeBtn:hover{background:#F2F2F6}
.eo-rr__recipes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.eo-rr__recipe{font-size:11.5px;font-weight:600;border-radius:999px;padding:5px 11px;border:1px solid #EAEAEF;background:#fff;color:#4E4E58;cursor:pointer}
.eo-rr__recipe--on{background:#EEEBFE;border-color:#DED8FD;color:#5B4BE6}
.eo-rr__why{font-size:11.5px;color:#8A8A95;margin-bottom:16px}
.eo-rr__section{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.07em;color:#B4B4BE;text-transform:uppercase;display:flex;align-items:center;gap:8px;margin:22px 0 10px}
.eo-rr__section::after{content:'';flex:1;height:1px;background:#EFEFF3}
.eo-rr__reading p{font-family:'Newsreader',Georgia,serif;font-size:15px;line-height:1.6;color:#3A3A44;margin:0 0 8px}
.eo-rr__areaRow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #F4F4F8;padding:8px 4px;cursor:pointer;font:inherit}
.eo-rr__areaRow--on{background:#FBFAFF}
.eo-rr__areaLabel{flex:1;font-size:13px;color:#1B1B22;font-weight:500}
.eo-rr__dots{display:flex;gap:2px}
.eo-rr__dot{width:6px;height:6px;border-radius:50%;background:#EAEAEF}
.eo-rr__dot--on{background:#6D5EF5}
.eo-rr__areaN{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9A9AA4;white-space:nowrap}
.eo-rr__filters{display:flex;gap:6px;margin-bottom:12px}
.eo-rr__filter{font-size:11.5px;font-weight:600;border-radius:999px;padding:4px 10px;border:1px solid #EAEAEF;background:#fff;color:#8A8A95;cursor:pointer}
.eo-rr__filter--on{background:#F4F4F7;color:#1B1B22;border-color:#D8D8E0}
.eo-rr__cards{display:flex;flex-direction:column;gap:10px}
.eo-rr__card{border:1px solid #EEEEF2;border-radius:12px;padding:12px 13px}
.eo-rr__cardHead{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.eo-rr__check{flex:0 0 auto}
.eo-rr__badges{display:flex;gap:5px;flex-wrap:wrap}
.eo-rr__badge{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.03em;border-radius:5px;padding:2px 6px}
.eo-rr__badge--rec{background:#E7F6EC;color:#1E8A50}
.eo-rr__badge--prim{background:#EEEBFE;color:#5B4BE6}
.eo-rr__badge--dup{background:#FBF1DA;color:#9A6B12}
.eo-rr__badge--origin{background:#F1EFFE;color:#6D5EF5}
.eo-rr__badge--neutral{background:#F2F2F6;color:#6E6E78}
.eo-rr__cardTitle{display:block;text-align:left;background:none;border:none;font-size:14px;font-weight:600;color:#1B1B22;cursor:pointer;padding:0;margin-bottom:2px}
.eo-rr__cardTitle:hover{color:#5B4BE6}
.eo-rr__cardMeta{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9A9AA4;margin-bottom:6px}
.eo-rr__cardRow{font-size:12px;color:#4E4E58;margin-bottom:3px}
.eo-rr__cardLbl{font-weight:600;color:#3A3A44;margin-right:6px}
.eo-rr__caution{font-size:11.5px;color:#9A6B12;background:#FBF4E6;border-radius:8px;padding:6px 9px;margin-top:6px}
.eo-rr__openLink{margin-top:8px;font-size:11.5px;font-weight:600;color:#5B4BE6;background:none;border:none;cursor:pointer;padding:0}
.eo-rr__narrative p{font-size:13px;color:#4E4E58;line-height:1.5;margin:0 0 6px}
.eo-rr__measureRow{border:1px solid #EEEEF2;border-radius:10px;padding:8px 10px;margin-bottom:6px}
.eo-rr__measureRow--conflict{border-color:#F2D3CD;background:#FDF7F6}
.eo-rr__measureLabel{font-weight:600;font-size:12.5px;margin-right:8px}
.eo-rr__measureReading{font-size:11.5px;color:#8A8A95}
.eo-rr__measureCells{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.eo-rr__measureCell{font-family:'IBM Plex Mono',monospace;font-size:10.5px;background:#F7F7FA;border:1px solid #EAEAEF;border-radius:6px;padding:3px 7px;cursor:pointer}
.eo-rr__discovered{display:flex;flex-direction:column;gap:6px}
.eo-rr__discoveredRow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;color:#4E4E58;border-bottom:1px solid #F4F4F8;padding:6px 2px}
.eo-rr__footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #EAEAEF;padding:12px 22px;display:flex;align-items:center;gap:12px}
.eo-rr__footerStats{font-size:12px;color:#4E4E58;flex:1}
.eo-rr__empty{padding:40px 20px;text-align:center;color:#8A8A95;font-size:13px}
`;
const ensureStyle = (doc) => { if (doc.getElementById(STYLE_ID)) return; const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.appendChild(s); };

const RECIPES = [['balanced', 'Balanced'], ['primary', 'Primary evidence'], ['smallest', 'Smallest sufficient'], ['perspectives', 'Perspectives'], ['contradiction', 'Contradiction-seeking']];
const FILTERS = [['all', 'All'], ['recommended', 'Recommended'], ['primary', 'Primary'], ['duplicates', 'Duplicates']];

export const mountResearchReview = (host, { app, topicId, onClose = () => {}, onOpenSource = null } = {}) => {
  const doc = host.ownerDocument || document;
  ensureStyle(doc);
  const root = el(doc, 'div', 'eo-rr__body');
  host.appendChild(root);

  let curTopicId = topicId, filter = 'all', areaFilter = null, admitTarget = 'new', admitTargetId = null;

  const openSource = (sn) => { if (onOpenSource) onOpenSource(sn); };

  const render = () => {
    root.innerHTML = '';
    const view = app.reviewCompute(curTopicId);
    if (!view) { root.appendChild(el(doc, 'div', 'eo-rr__empty', 'This research review is no longer available.')); return; }

    // header
    root.appendChild(el(doc, 'div', 'eo-rr__crumb', 'Research Review'));
    const titleRow = el(doc, 'div'); titleRow.style.cssText = 'display:flex;align-items:flex-start;gap:10px';
    titleRow.appendChild(el(doc, 'div', 'eo-rr__title', view.topic.title || view.query));
    const closeBtn = el(doc, 'button', 'eo-rr__closeBtn', '×'); closeBtn.addEventListener('click', () => onClose());
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
      b.addEventListener('click', () => { app.reviewApplyRecipe(curTopicId, key); render(); });
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

    // how the sources connect
    if (view.narrative.length) {
      root.appendChild(el(doc, 'div', 'eo-rr__section', 'How the sources connect'));
      const nar = el(doc, 'div', 'eo-rr__narrative');
      for (const line of view.narrative) nar.appendChild(el(doc, 'p', null, line));
      root.appendChild(nar);
    }

    // agreements / disagreements
    if (view.topic.review && app.comparisonMatrix) {
      let matrix = null; try { matrix = app.comparisonMatrix(); } catch { matrix = null; }
      if (matrix && matrix.rows.length) {
        root.appendChild(el(doc, 'div', 'eo-rr__section', 'Agreements and disagreements'));
        for (const row of matrix.rows.slice(0, 10)) root.appendChild(renderMeasureRow(doc, row, matrix.sources, { onOpen: openSource }));
      }
    }

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
        checked: !view.excludedSns.has(card.row.sn), onToggle: (sn) => { app.reviewToggleExclude(curTopicId, sn); render(); },
        onOpen: openSource, connections: linksBySn.get(card.row.sn) || [],
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

    // footer — selected corpus preview + admission
    const kept = view.rows.map((r) => r.sn).filter((sn) => !view.excludedSns.has(sn));
    const footer = el(doc, 'div', 'eo-rr__footer');
    footer.appendChild(el(doc, 'div', 'eo-rr__footerStats', `${kept.length} selected · ${view.stats.independentOrigins} origins`));
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
