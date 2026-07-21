// EO: SIG(Lens → Lens, Tending) — Question Result, the mounted web-search result page.
// A web search is a durable question result: direct verdict objects first, a convergence tally, a
// compact meaning projection, an inspectable claim ledger, then provisional sources. It deliberately
// avoids the older modal review's recipes, identity workbench, source network, waveforms, JSON, and
// prose.
import { el, renderCandidateCard } from './research-review-cards.js';
import { ensureStyle } from './research-review-style.js';
import { mountSolarSystem, mountSolarExplorer } from './solar-system.js';
import { questionMeaningData } from './question-result.js';

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

// renderConvergence(doc, ledger) → the tally strip (spec §22.4's own suggested phrasing: "3
// supported · 1 contested · 2 unresolved"). single_source and void share the "unresolved" bucket —
// neither is a settled read, and the spec is explicit that "settled" is the wrong word for either.
const renderConvergence = (doc, ledger) => {
  const supported = ledger.filter((c) => c.verdict === 'supported').length;
  const contested = ledger.filter((c) => c.verdict === 'contested').length;
  const unresolved = ledger.filter((c) => c.verdict === 'single_source' || c.verdict === 'void').length;
  const total = Math.max(1, supported + contested + unresolved);
  const box = el(doc, 'div', 'eo-qr__convergence');
  box.appendChild(el(doc, 'div', 'eo-rr__section', 'Convergence'));
  const stats = el(doc, 'div', 'eo-qr__convergenceStats');
  const stat = (n, label, cls) => {
    const s = el(doc, 'div', 'eo-qr__convergenceStat');
    s.appendChild(el(doc, 'div', `eo-qr__convergenceN eo-qr__convergenceN--${cls}`, String(n)));
    s.appendChild(el(doc, 'div', 'eo-qr__convergenceLbl', label));
    return s;
  };
  stats.appendChild(stat(supported, 'supported', 'supported'));
  stats.appendChild(stat(contested, 'contested', 'contested'));
  stats.appendChild(stat(unresolved, 'unresolved', 'unresolved'));
  box.appendChild(stats);
  const bar = el(doc, 'div', 'eo-qr__convergenceBar');
  [[supported, 'supported'], [contested, 'contested'], [unresolved, 'unresolved']].forEach(([n, cls]) => {
    if (!n) return;
    const seg = el(doc, 'div', `eo-qr__convergenceSeg eo-qr__convergenceSeg--${cls}`);
    seg.style.width = `${Math.round((n / total) * 100)}%`;
    bar.appendChild(seg);
  });
  box.appendChild(bar);
  const parts = [];
  if (supported) parts.push(`supported on ${supported} claim${supported === 1 ? '' : 's'}`);
  if (contested) parts.push(`contested on ${contested} claim${contested === 1 ? '' : 's'}`);
  if (unresolved) parts.push(`${unresolved} claim${unresolved === 1 ? '' : 's'} unresolved`);
  if (parts.length) box.appendChild(el(doc, 'div', 'eo-qr__convergenceSummary', `${parts.join(' · ')}.`));
  return box;
};

// renderVoidCard(doc, view, ledger, { onSearchMore }) → the scoped-void answer (spec §6.4): never
// "no answer exists", only "the active record does not establish it" — plus whatever near-miss
// material the ledger already found, labeled as related, not as an answer.
const renderVoidCard = (doc, view, ledger, { onSearchMore } = {}) => {
  const card = el(doc, 'section', 'eo-rr__verdict eo-rr__verdict--void');
  card.appendChild(el(doc, 'div', 'eo-rr__verdictKicker', 'NOT ESTABLISHED BY THESE SOURCES'));
  card.appendChild(el(doc, 'div', 'eo-rr__verdictText', view.query));
  const selectedCount = (view.rows || []).filter((r) => !view.excludedSns.has(r.sn)).length;
  card.appendChild(el(doc, 'div', 'eo-rr__verdictMeta', `None of the ${selectedCount} active source${selectedCount === 1 ? '' : 's'} clearly addresses this.`));
  const related = ledger.filter((c) => c.id !== 'void-0' && c.text).slice(0, 3);
  if (related.length) {
    const ev = el(doc, 'div', 'eo-rr__evidence');
    ev.appendChild(el(doc, 'div', 'eo-rr__evidenceHead', 'RELATED MATERIAL ON RECORD'));
    for (const c of related) ev.appendChild(el(doc, 'div', 'eo-rr__evidenceSilent', c.text));
    card.appendChild(ev);
  }
  if (onSearchMore) {
    const btn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', 'Search for more sources');
    btn.addEventListener('click', onSearchMore);
    card.appendChild(btn);
  }
  return card;
};

// renderAnswerExcerpt(doc, answer, onOpenSource, verify) → the primary direct answer: a verbatim,
// attributed excerpt from the candidate research-review-corpus.js leadExcerpt ranked highest
// against the query (its own token-space Born rule, embedder-free) and unlike a verdict card it
// needs no multi-source structure to be worth showing, which is exactly why it leads: for a
// single-source or lightly-sourced question (most of them), a verdict card built off
// evidenceMatrix's proposition rows has only a term-cluster label to show ("american · armstrong ·
// first"), not a sentence.
//
// `answer.confident` is leadExcerpt's own salience-vs-void admission test (boundedNull over the
// WHOLE reviewed reach) — when it did not clear, this is a mechanical BEST GUESS, not a settled
// read, and is framed that way rather than dressed up as an answer: the kicker and caption shift to
// "of what was reviewed, this reads closest" — a reader describing their own best-effort pick, not
// an error banner. `answer.onTopic` (real, nonzero salience, even without clearing the void)
// distinguishes "this is the field's closest lead" from a corpus that shares no vocabulary with the
// question at all. `verify` (optional: { verifying, onVerify }) offers the one bounded,
// user-triggered escalation this app allows: the local model WEIGHING this exact field
// (app/research-review-actions.js reviewVerifyAnswer) — it may confirm or refute the badge, never
// rewrite the quoted text.
const renderAnswerExcerpt = (doc, answer, onOpenSource, verify = null) => {
  const box = el(doc, 'div', 'eo-rr__answer');
  const kicker = answer.confident ? 'IN THE SOURCE’S OWN WORDS' : 'OF WHAT WAS REVIEWED, THIS READS CLOSEST';
  box.appendChild(el(doc, 'div', 'eo-rr__answerKicker', kicker));
  box.appendChild(el(doc, 'p', 'eo-rr__answerText', answer.text + (answer.truncated ? '…' : '')));
  const attrLabel = [answer.title, answer.domain].filter(Boolean).join(' · ') || answer.sn;
  const attr = el(doc, 'button', 'eo-rr__answerSrc', attrLabel);
  attr.addEventListener('click', () => { if (onOpenSource) onOpenSource(answer.sn); });
  box.appendChild(attr);
  if (!answer.confident) {
    const caption = answer.modelChecked
      ? 'The local model could not confirm this passage answers the question — read it as the closest lead, not a verdict.'
      : answer.onTopic
        ? 'This is the closest a term-overlap read found among what was reviewed — not a confirmed answer, worth a second look.'
        : 'Nothing reviewed appears to address this question directly — this is the least-unrelated source on hand.';
    box.appendChild(el(doc, 'div', 'eo-rr__caution', caption));
    if (!answer.modelChecked && verify && verify.onVerify) {
      const btn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', verify.verifying ? 'Checking…' : 'Check with local model');
      btn.disabled = !!verify.verifying;
      btn.addEventListener('click', verify.onVerify);
      box.appendChild(btn);
    }
  }
  return box;
};

const renderVerdictCard = (doc, claim, view, { expanded, onToggle, onOpenSource }) => {
  const card = el(doc, 'section', `eo-rr__verdict eo-rr__verdict--${claim.verdict}`);
  card.appendChild(el(doc, 'div', 'eo-rr__verdictKicker', claim.verdict === 'void' ? 'NOT ESTABLISHED BY THESE SOURCES' : claim.verdict === 'contested' ? 'CONTESTED' : claim.verdict === 'single_source' ? 'ONE SOURCE STATES THIS' : `SUPPORTED BY ${claim.origins} INDEPENDENT ORIGIN${claim.origins === 1 ? '' : 'S'}`));
  card.appendChild(el(doc, 'div', 'eo-rr__verdictText', claim.text));
  if (claim.row && claim.row.readingSource) card.appendChild(el(doc, 'div', 'eo-rr__answerSrc', `— according to ${sourceLabel(claim.row.readingSource, view)}`));
  card.appendChild(el(doc, 'div', 'eo-rr__verdictMeta', `${claim.standing} standing · ${claim.support.length} support · ${claim.contest.length} contest · ${claim.silent.length} source${claim.silent.length === 1 ? '' : 's'} silent`));
  const btn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', expanded ? 'Hide evidence' : (claim.verdict === 'contested' ? 'Compare evidence' : 'Show evidence'));
  btn.addEventListener('click', onToggle); card.appendChild(btn);
  if (expanded) {
    const ev = el(doc, 'div', 'eo-rr__evidence');
    const appendRoster = (title, list) => {
      if (!list.length) return;
      ev.appendChild(el(doc, 'div', 'eo-rr__evidenceHead', title));
      for (const w of list) {
        const row = el(doc, 'button', 'eo-rr__evidenceRow', `${w.sn} · ${sourceLabel(w.sn, view)}${w.cell?.display ? ' · ' + w.cell.display : ''}`);
        row.addEventListener('click', () => { if (onOpenSource) onOpenSource(w.sn); });
        ev.appendChild(row);
      }
    };
    appendRoster('SUPPORTING EVIDENCE', claim.support); appendRoster('CONTESTING EVIDENCE', claim.contest); if (claim.silent.length) ev.appendChild(el(doc, 'div', 'eo-rr__evidenceSilent', `Silent: ${claim.silent.map((sn) => sourceLabel(sn, view)).join(' · ')}`)); card.appendChild(ev);
  }
  return card;
};

// renderMeaningDetail(doc, node, { ledger, nodes, view, onOpenSource }, onPivot) → the meaning
// explorer's bottom-sheet content for whichever body is currently focused: what it is, which other
// bodies in THIS map you can pivot to next (every other node — the map is flat, sun + claims, so
// there's no deeper hierarchy to route through), and — for a claim — the real sources that support
// or contest it, each opening straight to that passage via the same onOpenSource every other source
// row in this surface already uses. Never fabricates a quote or a relation the ledger doesn't have.
const renderMeaningDetail = (doc, node, { ledger, nodes, view, onOpenSource }, onPivot) => {
  const wrap = el(doc, 'div', 'eo-mx-sheetBody');
  const head = el(doc, 'div', 'eo-mx-sheetHead');
  const dot = el(doc, 'span', 'eo-mx-dot'); dot.style.background = node.color || '#D7D2F2'; dot.style.color = node.color || '#D7D2F2';
  head.appendChild(dot);
  head.appendChild(el(doc, 'span', 'eo-mx-sheetLabel', node.label));
  wrap.appendChild(head);

  const claim = (node.kind === 'claim' && node.id.startsWith('c:')) ? ledger.find((c) => c.id === node.id.slice(2)) : null;
  const about = claim
    ? (claim.verdict === 'contested' ? `Contested — ${claim.origins} independent origin${claim.origins === 1 ? '' : 's'} disagree.`
      : claim.verdict === 'supported' ? `Supported by ${claim.origins} independent origin${claim.origins === 1 ? '' : 's'}.`
      : claim.verdict === 'single_source' ? 'Stated by one source only — nothing else corroborates it yet.'
      : 'Not established by these sources.')
    : 'The question this map is scoped to — every claim here orbits it.';
  wrap.appendChild(el(doc, 'div', 'eo-mx-about', about));

  const pivots = nodes.filter((n) => n.id !== node.id);
  if (pivots.length) {
    wrap.appendChild(el(doc, 'span', 'eo-mx-pivotLabel', 'PIVOT TO'));
    const row = el(doc, 'div', 'eo-mx-pivotRow');
    for (const p of pivots) {
      const chip = el(doc, 'button', 'eo-mx-pivotChip', p.label);
      chip.style.setProperty('--pv-color', p.color || '#D7D2F2');
      chip.addEventListener('click', () => onPivot(p.id));
      row.appendChild(chip);
    }
    wrap.appendChild(row);
  }

  if (claim) {
    const roster = [...claim.support.map((w) => ({ ...w, tag: 'supports' })), ...claim.contest.map((w) => ({ ...w, tag: 'contests' }))];
    if (roster.length) {
      wrap.appendChild(el(doc, 'span', 'eo-mx-srcLabel', `IN THE SOURCES · ${roster.length}`));
      const list = el(doc, 'div', 'eo-mx-srcList');
      for (const w of roster) {
        const rowBtn = el(doc, 'button', 'eo-mx-srcRow');
        const idLine = el(doc, 'span');
        idLine.appendChild(el(doc, 'span', 'eo-mx-srcId', w.sn));
        idLine.appendChild(el(doc, 'span', 'eo-mx-srcHost', sourceLabel(w.sn, view)));
        rowBtn.appendChild(idLine);
        if (w.cell && w.cell.display) rowBtn.appendChild(el(doc, 'div', 'eo-mx-srcQuote', w.cell.display));
        rowBtn.addEventListener('click', () => onOpenSource && onOpenSource(w.sn));
        list.appendChild(rowBtn);
      }
      wrap.appendChild(list);
    }
  }
  return wrap;
};

// renderFeedback(doc, view, { loading, onRefine }) → the result read back as one paragraph.
// `view.reading` (research-review.js researchReading) is the machinery's own deterministic,
// falsifiable sentences — never generated — joined as-is by default (the telegram, always
// available, no model). `view.feedback` (set by reviewFeedback → weave/topline/join.js) is the
// SAME sentences after the model's join pass: reordered, connected, gated by set-containment so it
// can rearrange this result's own words but never add one. Always renders something — a thin or
// empty reading still gets researchReading's own "nothing reviewed yet" sentence.
const renderFeedback = (doc, view, { loading = false, onRefine = null } = {}) => {
  const box = el(doc, 'div', 'eo-rr__answer');
  box.appendChild(el(doc, 'div', 'eo-rr__answerKicker', 'HOW THIS RESULT READS'));
  const text = (view.feedback && view.feedback.text) || (view.reading || []).join(' ') || 'Nothing has been reviewed yet.';
  box.appendChild(el(doc, 'p', 'eo-rr__answerText', text));
  if (!view.feedback?.joined && onRefine) {
    const btn = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', loading ? 'Asking the local model…' : 'Ask local model to read this back');
    btn.disabled = loading;
    btn.addEventListener('click', onRefine);
    box.appendChild(btn);
  }
  return box;
};

export const mountResearchReview = (host, { app, topicId, onClose = () => {}, onOpenSource = null } = {}) => {
  const doc = host.ownerDocument || document; ensureStyle(doc);
  const root = el(doc, 'div', 'eo-rr__body eo-qr'); root.setAttribute('role', 'main'); root.setAttribute('aria-label', 'Question Result'); host.appendChild(root);
  // meaningFocus survives across render()'s full root.innerHTML rebuild (mountSolarSystem itself
  // remounts fresh every render — see the note below) so a click that locks the orbital camera on
  // a claim stays locked instead of snapping back to the sun the instant the click's own onSelect
  // triggers this page's next render.
  let curTopicId = topicId, filter = 'all', verifyingAnswer = false, feedbackLoading = false, meaningFocus = null; const expanded = new Set(); const announce = (m) => { try { app.showToast ? app.showToast(m) : null; } catch {} };
  const verifyAnswer = () => {
    if (verifyingAnswer || !app.reviewVerifyAnswer) return;
    verifyingAnswer = true; render();
    Promise.resolve(app.reviewVerifyAnswer(curTopicId)).catch(() => {}).then(() => { verifyingAnswer = false; render(); });
  };
  const refineFeedback = () => {
    if (feedbackLoading || !app.reviewFeedback) return;
    feedbackLoading = true; render();
    Promise.resolve(app.reviewFeedback(curTopicId)).catch(() => {}).then(() => { feedbackLoading = false; render(); });
  };
  // A claim node in the Meaning map selects, in place, the same ledger row its own text was drawn
  // from (question-result.js namespaces claim node ids "c:<ledgerRowId>") — never a modal, and never
  // hiding the other rows: the point is to bring THIS row into view, not to prune the ledger.
  const onMeaningSelect = (node) => {
    if (!node || node.kind !== 'claim' || !node.id.startsWith('c:')) return;
    const claimId = node.id.slice(2);
    filter = 'all'; expanded.add(claimId); render();
  };
  const render = () => {
    root.innerHTML = ''; const view = app.reviewCompute(curTopicId); if (!view) { root.appendChild(el(doc, 'div', 'eo-rr__empty', 'This question result is no longer available.')); return; }
    const ledger = ledgerFromView(view); const selectedCount = (view.rows || []).filter((r) => !view.excludedSns.has(r.sn)).length;
    root.appendChild(el(doc, 'div', 'eo-rr__crumb', 'QUESTION'));
    const titleRow = el(doc, 'div', 'eo-qr__header'); const input = doc.createElement('input'); input.value = view.query; input.setAttribute('aria-label', 'Question'); input.className = 'eo-qr__questionInput'; titleRow.appendChild(input);
    const refine = el(doc, 'button', 'eo-rr__btn', 'Search for more'); refine.addEventListener('click', () => { const q = input.value.trim(); if (q) app.reviewStart(q).then((t) => { if (t) { curTopicId = t.id; render(); } }); }); titleRow.appendChild(refine);
    const close = el(doc, 'button', 'eo-rr__closeBtn', '×'); close.setAttribute('aria-label', 'Close Question Result'); close.addEventListener('click', () => onClose()); titleRow.appendChild(close); root.appendChild(titleRow);
    const s = view.selectedStats || view.stats; root.appendChild(el(doc, 'div', 'eo-rr__stats', `Based on ${selectedCount} selected source${selectedCount === 1 ? '' : 's'} · ${s.independentOrigins} independent origin${s.independentOrigins === 1 ? '' : 's'}`));
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Direct answer'));
    if (view.answer) root.appendChild(renderAnswerExcerpt(doc, view.answer, onOpenSource, { verifying: verifyingAnswer, onVerify: verifyAnswer }));
    // A verdict card earns its place here only once there is real multi-source structure to
    // adjudicate (corroborated or contested) — a lone "single_source"/"void" ledger row would just
    // restate the excerpt above, worse, off a proposition-row label rather than a real sentence.
    // The full claim ledger below still lists every row, weak ones included, behind its filters.
    const structured = ledger.filter((c) => c.origins >= 2).slice(0, 3);
    for (const c of structured) root.appendChild(renderVerdictCard(doc, c, view, { expanded: expanded.has(c.id), onToggle: () => { expanded.has(c.id) ? expanded.delete(c.id) : expanded.add(c.id); render(); }, onOpenSource }));
    if (!view.answer && !structured.length) {
      root.appendChild(renderVoidCard(doc, view, ledger, {
        onSearchMore: (view.discovered && view.discovered.length && app.reviewMore) ? () => { app.reviewMore(curTopicId).then(() => render()); } : null,
      }));
    }
    root.appendChild(renderConvergence(doc, ledger));
    // Meaning — the query-conditioned EOGraph (spec §10), fed only the CURRENT ledger's non-void
    // claims and the sources that witness them (question-result.js questionMeaningData); reusing
    // mountSolarSystem rather than a bespoke SVG, same renderer the topic Graph tab uses.
    const meaningData = questionMeaningData(view, ledger);
    if (meaningData.nodes.length > 1) {
      root.appendChild(el(doc, 'div', 'eo-rr__section', 'Meaning'));
      const card = el(doc, 'div', 'eo-qr__meaningCard');
      const head = el(doc, 'div', 'eo-qr__meaningHead');
      head.appendChild(el(doc, 'span', 'eo-qr__meaningKicker', 'QUESTION-SCOPED'));
      const toggle = el(doc, 'button', 'eo-rr__btn eo-rr__btn--sm', 'Explore ›');
      toggle.addEventListener('click', () => {
        try {
          mountSolarExplorer(doc, {
            ...meaningData, subtitle: view.query,
            focusId: meaningFocus, onFocus: (id) => { meaningFocus = id; },
            onSelect: onMeaningSelect,
            onOpen: (node) => { if (node && node.ref && node.ref.sn) onOpenSource && onOpenSource(node.ref.sn); },
            renderDetail: (node, onPivot) => renderMeaningDetail(doc, node, { ledger, nodes: meaningData.nodes, view, onOpenSource }, onPivot),
          });
        } catch { announce('Meaning explorer failed to open.'); }
      });
      head.appendChild(toggle);
      card.appendChild(head);
      const stage = el(doc, 'div', 'eo-qr__meaningStage');
      card.appendChild(stage);
      root.appendChild(card);
      // Mounted AFTER the stage is attached to `root` (which is already in `host`, in the live
      // document) so solar-system.js's own root.isConnected liveness check reads correctly from
      // the first frame. This whole page rebuilds on every interaction (root.innerHTML = '' above),
      // so the map remounts on every render — it self-tears-down (see solar-system.js's own header)
      // rather than leaking a orphaned rAF loop; the live orbital drift's TIME simply restarts each
      // render, an accepted cost of this file's full-rebuild render discipline. The camera LOCK does
      // NOT restart, though: meaningFocus (above) is threaded back in as focusId, so clicking a claim
      // — which selects it, which triggers this very render() — keeps that claim centred instead of
      // snapping back to the sun on remount.
      try {
        mountSolarSystem(stage, {
          ...meaningData, width: 460, height: 190,
          focusId: meaningFocus, onFocus: (id) => { meaningFocus = id; },
          onSelect: onMeaningSelect,
          onOpen: (node) => { if (node && node.ref && node.ref.sn) onOpenSource && onOpenSource(node.ref.sn); },
        });
      } catch { stage.appendChild(el(doc, 'div', 'eo-rr__empty', 'Meaning map failed to render.')); }
    }
    root.appendChild(el(doc, 'div', 'eo-rr__section', 'Feedback'));
    root.appendChild(renderFeedback(doc, view, { loading: feedbackLoading, onRefine: app.reviewFeedback ? refineFeedback : null }));
    root.appendChild(el(doc, 'div', 'eo-rr__section', `Claims in this result · ${ledger.length}`)); const fr = el(doc, 'div', 'eo-rr__filters'); for (const [k, label] of FILTERS) { const n = k === 'all' ? ledger.length : ledger.filter((c) => c.verdict === k).length; const b = el(doc, 'button', 'eo-rr__filter' + (filter === k ? ' eo-rr__filter--on' : ''), `${label} ${n}`); b.addEventListener('click', () => { filter = k; render(); }); fr.appendChild(b); } root.appendChild(fr);
    const table = el(doc, 'div', 'eo-qr__ledger'); for (const c of ledger.filter((x) => filter === 'all' || x.verdict === filter)) { const row = el(doc, 'button', 'eo-qr__ledgerRow', ''); row.addEventListener('click', () => { expanded.has(c.id) ? expanded.delete(c.id) : expanded.add(c.id); render(); }); row.appendChild(el(doc, 'span', null, c.text)); row.appendChild(el(doc, 'b', null, labelForVerdict(c.verdict))); row.appendChild(el(doc, 'em', null, String(c.origins))); table.appendChild(row); if (expanded.has(c.id)) table.appendChild(renderVerdictCard(doc, c, view, { expanded: true, onToggle: () => { expanded.delete(c.id); render(); }, onOpenSource })); } root.appendChild(table);
    root.appendChild(el(doc, 'div', 'eo-rr__section', `Sources · ${selectedCount} of ${(view.rows || []).length} selected`)); const cards = el(doc, 'div', 'eo-rr__cards'); for (const card of view.cards) cards.appendChild(renderCandidateCard(doc, card, { checked: !view.excludedSns.has(card.row.sn), onToggle: (sn) => { app.reviewToggleExclude(curTopicId, sn); announce('Source scope updated; verdicts recomputed.'); render(); }, onOpen: (sn) => onOpenSource ? onOpenSource(sn) : null, connections: [] })); root.appendChild(cards);
    const footer = el(doc, 'div', 'eo-rr__footer'); footer.appendChild(el(doc, 'div', 'eo-rr__footerStats', `${selectedCount} selected · candidates remain provisional until admitted`)); const admit = el(doc, 'button', 'eo-rr__btn eo-rr__btn--accent', `Add ${selectedCount} selected sources`); admit.disabled = !selectedCount; admit.addEventListener('click', () => { const target = app.reviewAdmit(curTopicId, { newTitle: view.query }); if (target) onClose(target); }); footer.appendChild(admit); root.appendChild(footer);
  };
  render(); const unsub = app.subscribe ? app.subscribe((kind) => { if (kind === 'topics' || kind === 'sources') render(); }) : () => {};
  return { show: (nextTopicId) => { curTopicId = nextTopicId; render(); }, destroy: () => { try { unsub(); } catch {} host.innerHTML = ''; } };
};
