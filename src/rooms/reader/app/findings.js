// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// findings + provenance (the graph tab, honest)
import { discourseDag, assertedDag } from '../../../surfer/dag/index.js';
import { inferSignificance } from '../../../surfer/fold/index.js';
import { crossSourceConflicts, comparisonMatrix as buildComparisonMatrix } from '../../../enactor/factcheck/index.js';
import { claimsFromDoc, claimPhrase, rankFragility, buildChronology } from '../../../perceiver/index.js';
import { recordClaims } from '../claims.js';
import { shaShort } from './util.js';

export const installFindings = (appCtx) => {
  // The cross-source pass (P3) — do the topic's SOURCES disagree with EACH OTHER, not
  // just an answer with the sources? The two answer-vetoes are answer-vs-graph, so a
  // record whose sources put a different magnitude on the same measure ("18,000 homes"
  // vs "9,000") read as green until an answer happened to repeat the clash. This asks
  // it directly, so the Findings lens and the conflict banner reflect the record
  // contesting ITSELF. Memoized on a cheap signature (which sources, how many sentences
  // each) so it recomputes only when the source set changes, never on every render.
  let _xsMemo = { sig: null, val: [] };
  const sourceConflicts = () => {
    const srcs = appCtx.topicSources();
    const sig = srcs.map((s) => `${s.sn}:${(appCtx.docFor(s)?.sentences || []).length}`).join('|');
    if (_xsMemo.sig === sig) return _xsMemo.val;
    let val = [];
    try {
      const entries = srcs
        .map((s) => ({ doc: appCtx.docFor(s), source: s.sn, label: s.title }))
        .filter((e) => e.doc && e.doc.admission);
      val = crossSourceConflicts(entries).conflicts;
    } catch { val = []; }
    _xsMemo = { sig, val };
    return val;
  };

  // The cross-source comparison matrix (enactor/factcheck/comparison.js) — one row per
  // measured thing the corpus states, one column per source, each cell the value that
  // source states (and the value it revised from). Built on the SAME reading the conflict
  // banner runs, so the grid behind the "1 conflict" count is always the whole spread, not
  // just the clashes. Memoized on the same source signature as sourceConflicts.
  let _cmMemo = { sig: null, val: null };
  const comparisonMatrix = () => {
    const srcs = appCtx.topicSources();
    const sig = srcs.map((s) => `${s.sn}:${(appCtx.docFor(s)?.sentences || []).length}`).join('|');
    if (_cmMemo.sig === sig) return _cmMemo.val;
    let val = { rows: [], sources: [], counts: { rows: 0, measures: 0, conflicts: 0, sources: 0 } };
    try {
      const entries = srcs
        .map((s) => ({ doc: appCtx.docFor(s), source: s.sn, label: s.title || s.reg || s.sn,
          date: appCtx.srcTimeMs ? appCtx.srcTimeMs(s) : null }))
        .filter((e) => e.doc && e.doc.admission);
      val = buildComparisonMatrix(entries);
    } catch { /* keep the empty matrix */ }
    _cmMemo = { sig, val };
    return val;
  };

  // Entity summaries attributable to this topic's sources — the summary mint's resolver
  // (claims.js summaryClaims). A summary carries the docId of the lead instance it was composed
  // over (toplines.js stamps it); older records without one are skipped until a regeneration.
  const topicEntitySummaries = () => {
    const bySrc = new Map(appCtx.topicSources().map((s) => [s.docId, s]));
    const out = [];
    for (const sum of Object.values(appCtx.state.summaries.entities || {})) {
      const src = sum?.docId ? bySrc.get(sum.docId) : null;
      if (src) out.push({ summary: sum, sn: src.sn, reg: src.reg, docId: src.docId });
    }
    return out;
  };

  // ── findings + provenance (the graph tab, honest) ──────────────────────────
  // The findings PROJECTION (docs/search-and-pins.md): claims from every mint the machinery runs —
  // the reading's own topline (composed on record), the entity toplines, murmur's promoted
  // connections, and the turns — not just the last few chat answers. Display ids (C1, P1) stay
  // positional and per-render; the durable identity is each row's `key` (claims.js claimKey).
  // Memoized on a cheap signature — the topic id, the same per-source doc signature
  // sourceConflicts/comparisonMatrix use, the message count, and the last message's id/pending/
  // cite-count (a turn completing or a new one starting is the only thing that should invalidate
  // this). recordClaims() below re-derives claims from every message + source doc on each call,
  // real work that index.html's Logic class alone calls 5+ times per render, including on every
  // keystroke in an unrelated input, so it recomputed unconditionally on every render.
  let _findingsMemo = { sig: null, val: null };
  const findings = () => {
    const t = appCtx.topic();
    const srcs = appCtx.topicSources();
    const msgs = t?.messages || [];
    const last = msgs[msgs.length - 1];
    const sig = [
      t ? t.id : '',
      srcs.map((s) => `${s.sn}:${(appCtx.docFor(s)?.sentences || []).length}`).join('|'),
      msgs.length,
      last ? `${last.id}:${!!last.pending}:${(last.cites || []).length}` : '',
      Object.keys(appCtx.state.summaries.entities || {}).length,
    ].join('~');
    if (_findingsMemo.sig === sig) return _findingsMemo.val;
    const val = _computeFindings(t, msgs);
    _findingsMemo = { sig, val };
    return val;
  };
  const _computeFindings = (t, msgs) => {
    const proj = recordClaims({
      messages: msgs,
      sources: appCtx.topicSources(),
      docFor: (s) => appCtx.docFor(s),
      entitySummaries: topicEntitySummaries(),
    });
    const claims = proj.claims.map((c, i) => ({ ...c, id: `C${i + 1}` }));
    const contradictions = proj.contradictions;
    const passages = new Map();
    const addPassage = (docId, unit, sn, reg, text) => {
      if (docId == null || !Number.isInteger(unit) || !text) return;
      const k = `${docId}:${unit}`;
      if (!passages.has(k)) passages.set(k, { id: `P${passages.size + 1}`, idx: unit, sn, reg, text, docId });
    };
    // Cited passages keyed by their SOURCE-LOCAL unit (cite.unit; composite idx only as a legacy
    // fallback for messages recorded before units rode the cite), then every mint quote.
    for (const m of msgs) {
      if (m.role !== 'assistant') continue;
      for (const c of m.cites || []) addPassage(c.docId, Number.isInteger(c.unit) ? c.unit : c.idx, c.sn, c.reg, c.text);
    }
    for (const c of claims) addPassage(c.docId, c.unit, c.sn, c.reg, c.quote);
    // How much of the record an abstention actually SEARCHED — the total passages (sentences)
    // across the topic's sources, not the cited count. `passages` above is passages that ended
    // up QUOTED, so it is 0 on an honest abstention; reporting that as "0 passages on record"
    // reads as an empty record when the sources are in fact full of text the turn looked through.
    // `recordPassages` is the scope the abstention names, so "the record does not say" can point
    // at what it searched. The docs are already parsed for the active topic, so this is a cheap sum.
    let recordPassages = 0;
    try { for (const d of appCtx.topicDocs()) recordPassages += (d && d.sentences && d.sentences.length) || 0; } catch { /* keep 0 */ }
    // Source-vs-source contradictions (the record contesting itself) — kept SEPARATE
    // from the answer-level `contradictions` so the memo-lock and per-claim "Contested"
    // math (both answer-grain) are unchanged, while the banner and the Findings lens can
    // report a disagreement that exists whether or not anyone has asked a question yet.
    const xs = sourceConflicts();
    return {
      claims: claims.slice(-24), passages: [...passages.values()].slice(-32),
      contradictions, sourceConflicts: xs,
      stats: { claims: claims.length, passages: passages.size, sources: appCtx.topicSources().length, recordPassages, contradictions, sourceConflicts: xs.length },
    };
  };

  // `precomputed` lets a caller that already ran findings() this render (index.html's _vals(),
  // which needs the claims list AND the provenance DAG off the same reading) hand it straight
  // in, instead of provenance() re-running the whole recordClaims pass a second time.
  const provenance = (precomputed = null) => {
    const t = appCtx.topic();
    const f = precomputed || findings();
    const srcs = appCtx.topicSources();
    const usedSns = new Set(f.passages.map((p) => p.sn).filter(Boolean));
    const shown = srcs.filter((s) => usedSns.has(s.sn) || usedSns.size === 0).slice(0, 8);
    const nodes = { memo: { id: 'M1', title: t?.title || 'This topic' }, claims: f.claims.slice(-8), passages: [], sources: shown, files: [] };
    const passBySn = new Map();
    for (const p of f.passages) {
      if (!p.sn || !shown.find((s) => s.sn === p.sn)) continue;
      passBySn.set(p.id, p);
    }
    nodes.passages = [...passBySn.values()].slice(-12);
    nodes.files = shown.map((s, i) => ({ id: `F${i + 1}`, sn: s.sn, sha: shaShort(s.sha), bytes: s.bytes }));
    const edges = [];
    for (const c of nodes.claims) {
      edges.push({ kind: 'cite', from: 'M1', to: c.id });
      const p = nodes.passages.find((x) => x.sn === c.sn && (!c.quote || x.text === c.quote)) ||
                nodes.passages.find((x) => x.sn === c.sn);
      if (p) edges.push({ kind: c.status === 'Contested' ? 'against' : 'ground', from: c.id, to: p.id });
    }
    for (const p of nodes.passages) {
      if (p.sn) edges.push({ kind: 'extract', from: p.id, to: p.sn });
    }
    nodes.sources.forEach((s, i) => edges.push({ kind: 'fixity', from: s.sn, to: nodes.files[i].id }));
    return { nodes, edges };
  };

  // A single source's claim count, read directly off its own doc — independent of the topic's
  // evidence scope, so a source card can state what a source contributes even while its
  // evidence-scope toggle is off (setSourceScopeEnabled only ever touches topicSources()).
  const sourceClaimCount = (snId) => {
    const src = appCtx.sourceBySn(snId);
    const doc = src && appCtx.docFor(src);
    if (!doc?.log) return 0;
    try { return claimsFromDoc(doc).length; } catch { return 0; }
  };

  const dagFor = (snId, which = 'discourse') => {
    const src = appCtx.sourceBySn(snId);
    const doc = src && appCtx.docFor(src);
    if (!doc) return null;
    return which === 'asserted' ? assertedDag(doc) : discourseDag(doc);
  };

  // ── FRAGILITY — which contested claims are load-bearing (perceiver/fragility.js) ──────
  // Every claim a doc asserts, tagged with its source and rendered to a phrase — the footprint a
  // contested subject would carry down with it.
  const docClaims = (doc, sn) => (doc?.log ? claimsFromDoc(doc) : []).map((c) => ({
    subject: c.subject, object: c.object || null, text: claimPhrase(c), source: sn,
  }));
  // The tensions INSIDE one doc — the significance engine's contradictions (text affirms & denies).
  const docContradictions = (doc, sn) => {
    let edges = [];
    try { edges = inferSignificance(doc); } catch { edges = []; }
    return edges.filter((e) => e.kind === 'contradicts').map((e) => ({ subject: e.srcLabel, kind: 'contradiction', description: e.body, source: sn }));
  };
  // Source scope — the tensions inside one document, ranked by footprint.
  const fragilitySource = (snId) => {
    const src = appCtx.sourceBySn(snId);
    const doc = appCtx.referentDocFor ? (appCtx.referentDocFor(src) || appCtx.docFor(src)) : appCtx.docFor(src);
    if (!doc?.log) return null;
    return { scope: 'source', sn: snId, title: src?.title || null, ...rankFragility(docClaims(doc, snId), docContradictions(doc, snId)) };
  };
  // Topic scope — cross-source magnitude disagreements + every source's tensions, ranked by how
  // much of the WHOLE corpus hangs off the contested subject.
  const fragilityTopic = () => {
    const srcs = appCtx.topicSources();
    const claims = [], contested = [], entries = [];
    for (const s of srcs) {
      const doc = appCtx.referentDocFor ? appCtx.referentDocFor(s) : appCtx.docFor(s);
      if (!doc?.log) continue;
      entries.push({ doc, source: s.sn, label: s.title });
      claims.push(...docClaims(doc, s.sn));
      contested.push(...docContradictions(doc, s.sn));
    }
    let conflicts = [];
    try { conflicts = crossSourceConflicts(entries).conflicts; } catch { conflicts = []; }
    for (const c of conflicts) contested.push({
      subject: c.subject || c.measureLabel || c.measure, kind: 'magnitude',
      description: `${c.measureLabel || c.measure}: ` + (c.values || []).map((v) => `${v.raw}${v.sourceLabel ? ` (${v.sourceLabel})` : ''}`).join(' vs '),
      sources: c.sources,
    });
    return { scope: 'topic', sources: srcs.map((s) => ({ sn: s.sn, title: s.title || null })), ...rankFragility(claims, contested) };
  };

  // ── CHRONOLOGY — the order events are TOLD vs. HAPPENED (perceiver/chronology.js) ─────
  const sentencesOf = (doc) => (Array.isArray(doc?.sentences) ? doc.sentences : []);
  const chronoDoc = (s) => (appCtx.referentDocFor ? (appCtx.referentDocFor(s) || appCtx.docFor(s)) : appCtx.docFor(s));
  // Source scope — one document's own telling vs. its dated events.
  const chronologySource = (snId) => {
    const src = appCtx.sourceBySn(snId);
    const doc = src && chronoDoc(src);
    if (!doc) return null;
    const items = sentencesOf(doc).map((text, i) => ({ order: i, text }));
    return { scope: 'source', sn: snId, title: src?.title || null, ...buildChronology(items) };
  };
  // Topic scope — one corpus timeline; each source's sentences keep a global order (source, then
  // sentence), so a filing that dates an event earlier than another still sorts into place.
  const chronologyTopic = () => {
    const srcs = appCtx.topicSources();
    const items = [];
    srcs.forEach((s, si) => { const doc = chronoDoc(s); if (!doc) return; sentencesOf(doc).forEach((text, i) => items.push({ order: si * 100000 + i, text, source: s.sn })); });
    return { scope: 'topic', sources: srcs.map((s) => ({ sn: s.sn, title: s.title || null })), ...buildChronology(items) };
  };

  Object.assign(appCtx, { dagFor, findings, provenance, comparisonMatrix, topicEntitySummaries, sourceClaimCount, fragilitySource, fragilityTopic, chronologySource, chronologyTopic });
};
