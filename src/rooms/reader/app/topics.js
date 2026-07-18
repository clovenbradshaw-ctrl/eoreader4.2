// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// topics — a nested tree within a workspace (Notion's pages / sub-pages)
import { formulateSearchQuery, readDiscourse } from '../../../turn/index.js';
import { deriveTopicTitle, isDefaultTopicTitle, DEFAULT_TOPIC_TITLE } from '../topic-name.js';
import { nowIso } from './util.js';

export const installTopics = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── topics — a nested tree within a workspace (Notion's pages / sub-pages) ────
  const topicById = (id) => state.topics.find((t) => t.id === id) || null;
  // Every topic strictly below `id` in the tree — the guard against a move that would
  // fold a topic under one of its own descendants (a cycle out of the tree).
  const topicDescendants = (id) => {
    const out = [];
    // `seen` guards the walk against a cyclic parentId chain in restored state (a
    // self-parent bricked every later move with a stack overflow); expandAncestors
    // carries the same guard as its counter.
    const seen = new Set([id]);
    const walk = (pid) => { for (const t of state.topics) if ((t.parentId ?? null) === pid && !seen.has(t.id)) { seen.add(t.id); out.push(t.id); walk(t.id); } };
    walk(id);
    return out;
  };
  // Un-fold a topic's whole ancestor chain, so a freshly made or moved sub-topic is
  // never hidden inside a collapsed parent the moment it appears.
  const expandAncestors = (id) => {
    let t = topicById(id), guard = 0;
    while (t && guard++ < 200) { if (t.collapsed) t.collapsed = false; t = t.parentId ? topicById(t.parentId) : null; }
  };

  const topicNew = (title = DEFAULT_TOPIC_TITLE, { silent = false, parentId = null, workspaceId = null } = {}) => {
    const wsId = workspaceId || state.activeWorkspaceId || (state.workspaces[0] && state.workspaces[0].id) || null;
    // `named` — was this title CHOSEN (passed in as a real name, or set by a manual rename)?
    // While false the topic auto-names itself from its content (topicAutoName); a chosen
    // name is never overwritten.
    // scopeDisabled: sn's of this topic's sources that are OFF the evidence scope — a source
    // stays a member (sourceSns) but is excluded from every cross-source computation
    // (topicSources filters it out) until re-enabled. savedScopes: named snapshots of
    // scopeDisabled a user can re-apply later ("Primary sources only", "Before July 2025").
    const t = { id: `t${++appCtx.tn}`, title, created: nowIso(), workspaceId: wsId, parentId: parentId ?? null, collapsed: false, named: !isDefaultTopicTitle(title), sourceSns: [], messages: [], memo: '', scopeDisabled: [], savedScopes: [] };
    state.topics.push(t);
    state.activeTopicId = t.id;
    if (t.parentId) expandAncestors(t.parentId);   // a sub-topic opens its ancestors
    if (!silent) { logIt('open', isDefaultTopicTitle(title) ? 'New topic created' : `New topic — ${title}`); appCtx.persist(); emit('topics'); }
    return t;
  };
  const topic = () => state.topics.find((t) => t.id === state.activeTopicId) || state.topics[0];
  const setTopic = (id) => { if (state.topics.find((t) => t.id === id)) { state.activeTopicId = id; appCtx.releaseParsesOutsideTopic(); appCtx.deepWake(); appCtx.persist(); emit('topics'); } };
  const topicRename = (id, title) => { const t = topicById(id); if (t && title) { t.title = title; t.named = true; appCtx.persist(); emit('topics'); } };
  // AUTO-NAMING. A topic still wearing the "New topic" placeholder names itself from what
  // it holds — its first question, else its first source (topic-name.js) — the moment
  // either lands. Recomputed on every such event while un-`named`: the derivation reads
  // only the topic's FIRST question/source, so the title upgrades exactly once per kind
  // (source-derived → question-derived) and never jitters as the topic grows. A manual
  // rename (topicRename) pins the title for good.
  const topicAutoName = (t, { silent = false } = {}) => {
    if (!t || t.named) return;
    const title = deriveTopicTitle({ messages: t.messages, sources: (t.sourceSns || []).map(appCtx.sourceBySn).filter(Boolean) });
    if (!title || title === t.title) return;
    t.title = title;
    if (!silent) { appCtx.persist(); emit('topics'); }
  };
  // The conversational THREAD a topic belongs to — its ancestors' settled messages, then its
  // own, in the order the user lived them. The topic-per-question model (askQuestion) files
  // every follow-up as a CHILD quest, so a child's own `messages` hold only the new question:
  // the thread the user experienced IS the ancestor chain. Reading history off the lineage is
  // what lets the discourse machinery — readDiscourse, the clarify/awaiting fold, resolveQuery,
  // formulateSearchQuery, the sense disambiguator — resolve a pronoun follow-up ("what did he
  // do?") to the figure the previous quest was about. Without it every follow-up woke
  // amnesiac: the referent never bound, the turn abstained referent-ambiguous, and the
  // VERBATIM pronoun query went to the web and admitted whatever matched its words — the
  // exported "what did he do?" run pulled "What Did Jack Do?" and the Waco siege into the
  // record. Settled turns only (!pending, has text). A stopped/errored reply is DROPPED while
  // its question is KEPT: the boilerplate ("The turn stalled — …") is not conversation, and an
  // unanswered question left standing is exactly an OPEN intent for the next turn to resolve
  // against (dialogue-state.js). Cycle-guarded like topicDescendants; capped to the newest
  // THREAD_CAP messages (foldConversation budgets further downstream).
  const THREAD_CAP = 16;
  const topicThread = (t) => {
    const chain = [];
    const seen = new Set();
    for (let node = t; node && !seen.has(node.id); node = node.parentId ? topicById(node.parentId) : null) {
      seen.add(node.id);
      chain.unshift(node);
    }
    const out = [];
    for (const tp of chain) {
      for (const m of tp.messages || []) {
        if (!m || m.pending || !m.text) continue;
        if (m.role === 'assistant' && (m.route === 'stopped' || m.route === 'error')) continue;
        out.push(m);
      }
    }
    return out.slice(-THREAD_CAP);
  };
  // Re-parent a topic (null = the workspace root). Rejects a cycle (into itself or a
  // descendant) and a cross-workspace move — a topic tree never spans workspaces.
  const topicMove = (id, parentId = null) => {
    const t = topicById(id); if (!t) return;
    const np = parentId ?? null;
    if (np === id || topicDescendants(id).includes(np)) return;
    const p = np ? topicById(np) : null;
    if (p && p.workspaceId !== t.workspaceId) return;
    t.parentId = np;
    if (np) expandAncestors(np);
    appCtx.persist(); emit('topics');
  };
  const topicToggleCollapse = (id) => { const t = topicById(id); if (t) { t.collapsed = !t.collapsed; appCtx.persist(); emit('topics'); } };
  const topicDelete = (id) => {
    const gone = topicById(id); if (!gone) return;
    const parentId = gone.parentId ?? null;
    // Lift the direct children up one level (the subtree rises rather than vanishing).
    for (const t of state.topics) if ((t.parentId ?? null) === id) t.parentId = parentId;
    state.topics = state.topics.filter((t) => t.id !== id);
    // A workspace is never left without a topic. Deleting its LAST topic is allowed —
    // it opens a fresh one in the same workspace rather than being blocked, so the last
    // topic resets instead of being un-deletable (the whole app keeps this invariant:
    // see workspaceNew / setWorkspace / workspaceDelete). We land on a same-workspace
    // sibling when one survives; otherwise on the fresh replacement.
    if (state.activeTopicId === id) {
      const sib = state.topics.find((t) => t.workspaceId === gone.workspaceId);
      state.activeTopicId = (sib || topicNew('New topic', { silent: true, workspaceId: gone.workspaceId })).id;
    } else if (!state.topics.some((t) => t.workspaceId === gone.workspaceId)) {
      // Deleted the last topic of a workspace we weren't viewing — keep it populated too,
      // without stealing focus from the topic on screen (topicNew makes its topic active).
      const keep = state.activeTopicId;
      topicNew('New topic', { silent: true, workspaceId: gone.workspaceId });
      state.activeTopicId = keep;
    }
    appCtx.persist(); emit('topics');
  };
  // The topic forest of a workspace (default: active), nested by parentId in creation
  // order. Each node: { topic, depth, children }.
  const topicTree = (workspaceId = null) => {
    const wsId = workspaceId || state.activeWorkspaceId;
    const inWs = state.topics.filter((t) => (t.workspaceId ?? null) === (wsId ?? null));
    const build = (parentId, depth) => inWs
      .filter((t) => (t.parentId ?? null) === (parentId ?? null))
      .map((t) => ({ topic: t, depth, children: build(t.id, depth + 1) }));
    return build(null, 0);
  };
  // A flat pre-order walk of the forest for an indented sidebar render, HIDING the
  // subtree under any collapsed node. Each row: { topic, depth, hasChildren, collapsed }.
  const topicRows = (workspaceId = null) => {
    const out = [];
    const walk = (nodes) => { for (const n of nodes) {
      const hasChildren = n.children.length > 0;
      out.push({ topic: n.topic, depth: n.depth, hasChildren, collapsed: !!n.topic.collapsed });
      if (hasChildren && !n.topic.collapsed) walk(n.children);
    } };
    walk(topicTree(workspaceId));
    return out;
  };

  // ── evidence scope — a topic-wide, persistent source toggle ────────────────
  // A source stays a MEMBER of the topic (sourceSns) even when its scope toggle is off;
  // scopeDisabled only drops it from topicSources() (registry.js) — the read EVERY
  // cross-source computation (findings, entities, the graph's network/crosswalk/compare
  // kinds…) is built from. Flipping one source's toggle therefore recomputes every one of
  // those views, not just the chip that shows the toggle.
  const topicScopeDisabledSns = (id) => { const t = topicById(id); return t && Array.isArray(t.scopeDisabled) ? t.scopeDisabled.slice() : []; };
  const topicScopeSummary = (id) => {
    const t = topicById(id);
    const total = t ? t.sourceSns.length : 0;
    const disabled = t ? topicScopeDisabledSns(id).filter((sn) => t.sourceSns.includes(sn)).length : 0;
    return { total, active: total - disabled, disabled };
  };
  // A cheap read of what's IN the current view — entities, shared (cross-source) entities,
  // findings — taken before/after a scope change so the consequence toast ("Excluded X — N
  // entities, M findings… removed") names exactly what changed, not just that something did.
  const _scopeImpactSnapshot = () => {
    let entities = 0, sharedEntities = 0, findings = 0;
    try { const rows = appCtx.entities?.() || []; entities = rows.length; sharedEntities = rows.filter((r) => r.sourceCount > 1).length; } catch { /* best-effort */ }
    try { findings = appCtx.findings?.()?.stats?.claims || 0; } catch { /* best-effort */ }
    return { entities, sharedEntities, findings };
  };
  const setSourceScopeEnabled = (id, sn, enabled) => {
    const t = topicById(id); if (!t || !t.sourceSns.includes(sn)) return null;
    if (!Array.isArray(t.scopeDisabled)) t.scopeDisabled = [];
    const was = t.scopeDisabled.includes(sn);
    if (enabled === !was) return null;   // already in the requested state
    const before = enabled ? null : _scopeImpactSnapshot();   // only disabling removes anything to report
    t.scopeDisabled = enabled ? t.scopeDisabled.filter((x) => x !== sn) : [...t.scopeDisabled, sn];
    appCtx.persist(); emit('topics'); emit('sources');
    if (!before) return { sn, enabled, removed: null };
    const after = _scopeImpactSnapshot();
    return { sn, enabled, removed: {
      entities: Math.max(0, before.entities - after.entities),
      sharedEntities: Math.max(0, before.sharedEntities - after.sharedEntities),
      findings: Math.max(0, before.findings - after.findings),
    } };
  };
  const setTopicScopeAll = (id, enabled) => {
    const t = topicById(id); if (!t) return;
    t.scopeDisabled = enabled ? [] : t.sourceSns.slice();
    appCtx.persist(); emit('topics'); emit('sources');
  };
  const invertTopicScope = (id) => {
    const t = topicById(id); if (!t) return;
    const dis = new Set(t.scopeDisabled || []);
    t.scopeDisabled = t.sourceSns.filter((sn) => !dis.has(sn));
    appCtx.persist(); emit('topics'); emit('sources');
  };
  // Named scopes — a saved snapshot of scopeDisabled a user can re-apply later ("Primary
  // sources only", "Before July 2025"). Reversible: applying one only edits scopeDisabled.
  const saveTopicScope = (id, name) => {
    const t = topicById(id); const label = String(name || '').trim().slice(0, 60);
    if (!t || !label) return null;
    if (!Array.isArray(t.savedScopes)) t.savedScopes = [];
    const scope = { id: `sc${++appCtx.scn}`, name: label, disabledSns: (t.scopeDisabled || []).slice(), created: nowIso() };
    t.savedScopes.push(scope);
    appCtx.persist(); emit('topics');
    return scope;
  };
  const applyTopicScope = (id, scopeId) => {
    const t = topicById(id); if (!t) return;
    const scope = (t.savedScopes || []).find((s) => s.id === scopeId); if (!scope) return;
    t.scopeDisabled = scope.disabledSns.filter((sn) => t.sourceSns.includes(sn));
    appCtx.persist(); emit('topics'); emit('sources');
  };
  const deleteTopicScope = (id, scopeId) => {
    const t = topicById(id); if (!t) return;
    t.savedScopes = (t.savedScopes || []).filter((s) => s.id !== scopeId);
    appCtx.persist(); emit('topics');
  };

  Object.assign(appCtx, {
    setTopic, topic, topicAutoName, topicById, topicDelete, topicMove, topicNew, topicRename, topicRows, topicThread, topicToggleCollapse, topicTree,
    topicScopeDisabledSns, topicScopeSummary, setSourceScopeEnabled, setTopicScopeAll, invertTopicScope, saveTopicScope, applyTopicScope, deleteTopicScope,
  });
};
