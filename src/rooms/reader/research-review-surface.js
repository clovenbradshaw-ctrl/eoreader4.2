// EO: SIG(Lens → Lens, Tending) — Question Result, the mounted web-search result page.
// A web search is a durable question result: direct verdict objects first, a compact meaning
// projection, an inspectable claim ledger, then provisional sources. It deliberately avoids the
// older modal review's recipes, identity workbench, source network, waveforms, JSON, and prose.
import { el, renderCandidateCard } from './research-review-cards.js';
import { ensureStyle } from './research-review-style.js';

const FILTERS = [['all', 'All'], ['supported', 'Supported'], ['contested', 'Contested'], ['single_source', 'One source'], ['void', 'Unknown']];
const labelForVerdict = (v) => ({ supported: 'Supported', contested: 'Contested', single_source: 'One source', void: 'Not found', no_commit: 'No commit' }[v] || v);
const norm = (s) => String(s || '').trim();
const sourceLabel = (sn, view) => ((view.rows || []).find((r) => r.sn === sn)?.title || (view.rows || []).find((r) => r.sn === sn)?.domain || sn);

const ledgerFromView = (view) => {
  const selected = new Set((view.rows || []).map((r) => r.sn).filter((sn) => !view.excludedSns.has(sn)));
  const rows = (view.evidenceMatrix && view.evidenceMatrix.rows) || [];
  const out = rows.map((row, idx) => {
    const entries = Object.entries(row.cells || {}).filter(([sn]) => selected.has(sn));
    const support = entries.filter(([, c]) => ['supports', 'revises'].includes(c.state)).map(([sn, c]) => ({ sn, cell: c }));
    const contest = entries.filter(([, c]) => c.state === 'contests').map(([sn, c]) => ({ sn, cell: c }));
    const silent = entries.filter(([, c]) => c.state === 'silent').map(([sn]) => sn);
    const candidate = entries.filter(([, c]) => c.state === 'candidate correspondence').map(([sn, c]) => ({ sn, cell: c }));
    let verdict = 'void';
    if (contest.length && support.length) verdict = 'contested';
    else if (support.length >= 2 || row.independentOrigins >= 2) verdict = 'supported';
    else if (support.length === 1 || candidate.length) verdict = 'single_source';
    return {
      id: `${row.family || 'claim'}-${idx}`,
      kind: row.family || 'state',
      text: norm(row.reading) || norm(row.label) || 'Claim',
      verdict,
      standing: candidate.length && !support.length ? 'candidate' : 'witnessed',
      support, contest, silent, candidate,
      origins: Math.max(support.length, row.independentOrigins || 0),
      row,
    };
  });
  if (!out.length) out.push({ id: 'void-0', kind: 'absence', text: view.query, verdict: 'void', standing: 'witnessed', support: [], contest: [], silent: [...selected], candidate: [], origins: 0, row: null });
  return out.sort((a, b) => ({ contested: 0, supported: 1, single_source: 2, void: 3 }[a.verdict] - { contested: 0, supported: 1, single_source: 2, void: 3 }[b.verdict]));
};

const renderVerdictCard = (doc, claim, view, { expanded, onToggle }) => {
  const card = el(doc, 'section', `eo-rr__verdict eo-rr__verdict--${claim.verdict}`);
  card.appendChild(el(doc, 'div', 'eo-rr__verdictKicker', claim.verdict === 'void' ? 'NOT ESTABLISHED BY THESE SOURCES' : claim.verdict === 'contested' ? 'CONTESTED' : claim.verdict === 'single_source' ? 'ONE SOURCE STATES THIS' : `SUPPORTED BY ${claim.origins} INDEPENDENT ORIGIN${claim.origins === 1 ? '' : 'S'}`));
  card.appendChild(el(doc, 'div', 'eo-rr__verdictText', claim.text));
  card.appendChild(el(doc, 'div', 'eo-rr__verdictMeta', `${claim.standing} standing · ${claim.support.length} support · ${claim.contest.length} contest · ${claim.silent.length} source${claim.silent.length === 1 ? '' : 's'} silent`));
  const btn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', expanded ? 'Hide evidence' : (claim.verdict === 'contested' ? 'Compare evidence' : 'Show evidence'));
  btn.addEventListener('click', onToggle); card.appendChild(btn);
  if (expanded) {
    const ev = el(doc, 'div', 'eo-rr__evidence');
    const appendRoster = (title, list) => { if (!list.length) return; ev.appendChild(el(doc, 'div', 'eo-rr__evidenceHead', title)); for (const w of list) { const row = el(doc, 'button', 'eo-rr__evidenceRow', `${w.sn} · ${sourceLabel(w.sn, view)}${w.cell?.display ? ' · ' + w.cell.display : ''}`); row.addEventListener('click', () => {}); ev.appendChild(row); } };
    appendRoster('SUPPORTING EVIDENCE', claim.support); appendRoster('CONTESTING EVIDENCE', claim.contest); if (claim.silent.length) ev.appendChild(el(doc, 'div', 'eo-rr__evidenceSilent', `Silent: ${claim.silent.map((sn) => sourceLabel(sn, view)).join(' · ')}`)); card.appendChild(ev);
  }
  return card;
};

export const mountResearchReview = (host, { app, topicId, onClose = () => {}, onOpenSource = null } = {}) => {
  const doc = host.ownerDocument || document; ensureStyle(doc);
  const root = el(doc, 'div', 'eo-rr__body eo-qr'); root.setAttribute('role', 'main'); root.setAttribute('aria-label', 'Question Result'); host.appendChild(root);
  let curTopicId = topicId, filter = 'all'; const expanded = new Set(); const announce = (m) => { try { app.showToast ? app.showToast(m) : null; } catch {} };
  const render = () => {
    root.innerHTML = ''; const view = app.reviewCompute(curTopicId); if (!view) { root.appendChild(el(doc, 'div', 'eo-rr__empty', 'This question result is no longer available.')); return; }
    const ledger = ledgerFromView(view); const selectedCount = (view.rows || []).filter((r) => !view.excludedSns.has(r.sn)).length;
    root.appendChild(el(doc, 'div', 'eo-rr__crumb', 'QUESTION'));
    const titleRow = el(doc, 'div', 'eo-qr__header'); const input = doc.createElement('input'); input.value = view.query; input.setAttribute('aria-label', 'Question'); input.className = 'eo-qr__questionInput'; titleRow.appendChild(input);
    const refine = el(doc, 'button', 'eo-rr__btn', 'Search for more'); refine.addEventListener('click', () => { const q = input.value.trim(); if (q) app.reviewStart(q).then((t) => { if (t) { curTopicId = t.id; render(); } }); }); titleRow.appendChild(refine);
    const close = el(doc, 'button', 'eo-rr__closeBtn', '×'); close.setAttribute('aria-label', 'Close Question Result'); close.addEventListener('click', () => onClose()); titleRow.appendChild(close); root.appendChild(titleRow);
    const s = view.selectedStats || view.stats; root.appendChild(el(doc, 'div', 'eo-rr__stats', `Based on ${selectedCount} selected source${selectedCount === 1 ? '' : 's'} · ${s.independentOrigins} independent origin${s.independentOrigins === 1 ? '' : 's'}`));
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Direct answer'));
    for (const c of ledger.slice(0, Math.min(3, Math.max(1, ledger.length)))) root.appendChild(renderVerdictCard(doc, c, view, { expanded: expanded.has(c.id), onToggle: () => { expanded.has(c.id) ? expanded.delete(c.id) : expanded.add(c.id); render(); } }));
    const meaningRows = ledger.filter((c) => c.verdict !== 'void').slice(0, 6); if (meaningRows.length) { root.appendChild(el(doc, 'div', 'eo-rr__section', 'Meaning')); const map = el(doc, 'div', 'eo-qr__meaning'); map.appendChild(el(doc, 'div', 'eo-qr__meaningCenter', view.query)); for (const c of meaningRows) map.appendChild(el(doc, 'button', `eo-qr__meaningNode eo-qr__meaningNode--${c.verdict}`, `${c.text} · ${c.origins}`)); root.appendChild(map); }
    root.appendChild(el(doc, 'div', 'eo-rr__section', `Claims in this result · ${ledger.length}`)); const fr = el(doc, 'div', 'eo-rr__filters'); for (const [k, label] of FILTERS) { const n = k === 'all' ? ledger.length : ledger.filter((c) => c.verdict === k).length; const b = el(doc, 'button', 'eo-rr__filter' + (filter === k ? ' eo-rr__filter--on' : ''), `${label} ${n}`); b.addEventListener('click', () => { filter = k; render(); }); fr.appendChild(b); } root.appendChild(fr);
    const table = el(doc, 'div', 'eo-qr__ledger'); for (const c of ledger.filter((x) => filter === 'all' || x.verdict === filter)) { const row = el(doc, 'button', 'eo-qr__ledgerRow', ''); row.addEventListener('click', () => { expanded.has(c.id) ? expanded.delete(c.id) : expanded.add(c.id); render(); }); row.appendChild(el(doc, 'span', null, c.text)); row.appendChild(el(doc, 'b', null, labelForVerdict(c.verdict))); row.appendChild(el(doc, 'em', null, String(c.origins))); table.appendChild(row); if (expanded.has(c.id)) table.appendChild(renderVerdictCard(doc, c, view, { expanded: true, onToggle: () => { expanded.delete(c.id); render(); } })); } root.appendChild(table);
    root.appendChild(el(doc, 'div', 'eo-rr__section', `Sources · ${selectedCount} of ${(view.rows || []).length} selected`)); const cards = el(doc, 'div', 'eo-rr__cards'); for (const card of view.cards) cards.appendChild(renderCandidateCard(doc, card, { checked: !view.excludedSns.has(card.row.sn), onToggle: (sn) => { app.reviewToggleExclude(curTopicId, sn); announce('Source scope updated; verdicts recomputed.'); render(); }, onOpen: (sn) => onOpenSource ? onOpenSource(sn) : null, connections: [] })); root.appendChild(cards);
    const footer = el(doc, 'div', 'eo-rr__footer'); footer.appendChild(el(doc, 'div', 'eo-rr__footerStats', `${selectedCount} selected · candidates remain provisional until admitted`)); const admit = el(doc, 'button', 'eo-rr__btn eo-rr__btn--accent', `Add ${selectedCount} selected sources`); admit.disabled = !selectedCount; admit.addEventListener('click', () => { const target = app.reviewAdmit(curTopicId, { newTitle: view.query }); if (target) onClose(target); }); footer.appendChild(admit); root.appendChild(footer);
  };
  render(); const unsub = app.subscribe ? app.subscribe((kind) => { if (kind === 'topics' || kind === 'sources') render(); }) : () => {};
  return { show: (nextTopicId) => { curTopicId = nextTopicId; render(); }, destroy: () => { try { unsub(); } catch {} host.innerHTML = ''; } };
};
