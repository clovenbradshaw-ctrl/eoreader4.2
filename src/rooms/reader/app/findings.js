// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// findings + provenance (the graph tab, honest)
import { discourseDag, assertedDag } from '../../../surfer/dag/index.js';
import { shaShort } from './util.js';

export const installFindings = (appCtx) => {
  // ── findings + provenance (the graph tab, honest) ──────────────────────────
  const findings = () => {
    const t = appCtx.topic();
    const claims = [];
    const passages = new Map();
    let contradictions = 0;
    for (const m of t?.messages || []) {
      if (m.role !== 'assistant') continue;
      for (const b of m.bound || []) {
        if (!b.claim) continue;
        const cite = (m.cites || []).find((c) => b.citation && String(b.citation).includes(String(c.idx)));
        claims.push({
          id: `C${claims.length + 1}`, text: b.claim, msgId: m.id,
          status: b.citation ? 'Supported' : 'Uncited',
          sn: cite?.sn || null, reg: cite?.reg || null, quote: cite?.text || '',
        });
      }
      for (const v of m.verdicts || []) {
        if (/contradict/i.test(v.verdict)) {
          contradictions++;
          const hit = claims.find((c) => c.text === v.claim);
          if (hit) hit.status = 'Contested';
        }
      }
      for (const c of m.cites || []) {
        if (!passages.has(`${c.docId}:${c.idx}`)) {
          passages.set(`${c.docId}:${c.idx}`, {
            id: `P${passages.size + 1}`, idx: c.idx, sn: c.sn, reg: c.reg, text: c.text, docId: c.docId,
          });
        }
      }
    }
    // How much of the record an abstention actually SEARCHED — the total passages (sentences)
    // across the topic's sources, not the cited count. `passages` above is passages that ended
    // up QUOTED, so it is 0 on an honest abstention; reporting that as "0 passages on record"
    // reads as an empty record when the sources are in fact full of text the turn looked through.
    // `recordPassages` is the scope the abstention names, so "the record does not say" can point
    // at what it searched. The docs are already parsed for the active topic, so this is a cheap sum.
    let recordPassages = 0;
    try { for (const d of appCtx.topicDocs()) recordPassages += (d && d.sentences && d.sentences.length) || 0; } catch { /* keep 0 */ }
    return {
      claims: claims.slice(-24), passages: [...passages.values()].slice(-32),
      contradictions,
      stats: { claims: claims.length, passages: passages.size, sources: appCtx.topicSources().length, recordPassages, contradictions },
    };
  };

  const provenance = () => {
    const t = appCtx.topic();
    const f = findings();
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

  const dagFor = (snId, which = 'discourse') => {
    const src = appCtx.sourceBySn(snId);
    const doc = src && appCtx.docFor(src);
    if (!doc) return null;
    return which === 'asserted' ? assertedDag(doc) : discourseDag(doc);
  };

  Object.assign(appCtx, { dagFor, findings, provenance });
};
