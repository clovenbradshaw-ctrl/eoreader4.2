// EO: SYN·EVA(Network → Network, Composing,Tracing) — projectReport — the pure fold
// research/project.js — projectReport: a pure fold of the ResearchEvent log into
// the sectioned report (docs/deep-research-log.md).
//
// THIS is the whole thesis in one function: the report is projectReport(log).
// The outline is the frame tree; the ordering is significance (earned, read off
// the eva/rec record, never assigned); the evidence is the pin + extract spans,
// embedded; coverage is the cube fold; the questions band and the VERIFY line
// are the ask and phrase events verbatim. It never severs the claim-to-span
// link, so clickable exact-citation is not a feature added afterward — it is
// the log made visible.
//
// Pure on (log, cursor) alone — no clock, no model, no module state — and
// memoized by (log, cursor) the way frame/project.js memoizes the frame stack:
// safe because the log is append-only, so a longer log is a strict extension.
// Re-projecting the same log yields a byte-identical report (the provenance-
// integrity test pins this).

import { RKIND } from './events.js';
import { OPERATORS, GRAINS } from '../../core/operators.js';
import { coherence, terrainOf } from '../../core/cube.js';

const memo = new WeakMap(); // log → Map(cursor → report)

export const projectReport = (log, cursor = null) => {
  const at = cursor == null ? log.length : Math.max(0, Math.min(log.length, cursor));
  let byCursor = memo.get(log);
  if (byCursor?.has(at)) return byCursor.get(at);
  const report = computeReport(log, at);
  if (!byCursor) { byCursor = new Map(); memo.set(log, byCursor); }
  byCursor.set(at, report);
  return report;
};

const computeReport = (log, at) => {
  const frames = new Map();     // id → frame node (mutable during fold, frozen at exit)
  const frameOrder = [];
  const pins = new Map();       // pinId → pin event
  const props = new Map();      // propId → proposition (extract + accrued eva/con/rec/promote)
  const propOrder = [];
  const recs = [];
  const voids = [];
  const asks = new Map();       // askId → { ask, answer }
  const askOrder = [];
  const reads = [];
  const searches = [];          // { query, stance, found, kept, discarded } — the search audit
  const phrases = new Map();    // frameId → phrase event (one per section — last wins)
  const surprises = [];         // { t, propId, surprise, strain } — the strain pulse series

  const frameOf = (id) => frames.get(id) ?? null;

  for (let i = 0; i < at; i++) {
    const e = log[i];
    switch (e.kind) {
      case RKIND.OPEN: {
        if (!frames.has(e.id)) frameOrder.push(e.id);
        frames.set(e.id, {
          id: e.id, parentId: e.parentId ?? null, question: e.question,
          subject: [...e.subject], scope: e.scope ?? null, depth: e.depth | 0,
          children: [], terms: [...e.subject], recs: 0, strain: 0,
        });
        const p = e.parentId != null ? frameOf(e.parentId) : null;
        if (p && !p.children.includes(e.id)) p.children.push(e.id);
        break;
      }
      case RKIND.SEARCH:
        searches.push(e);
        break;
      case RKIND.PIN:
        pins.set(e.id, e);
        break;
      case RKIND.READ:
        reads.push(e);
        break;
      case RKIND.EXTRACT: {
        if (!props.has(e.id)) propOrder.push(e.id);
        props.set(e.id, {
          id: e.id, frameId: e.frameId, pinId: e.pinId, span: e.span,
          terms: [...e.terms], address: e.address ?? null, t: e.t,
          eva: null, corroboratedBy: [], contradictedBy: [],
          recForcing: false, promoted: false,
        });
        break;
      }
      case RKIND.EVA: {
        const pr = props.get(e.propId);
        if (pr) pr.eva = { verdict: e.verdict, surprise: e.surprise, strainDelta: e.strainDelta, strain: e.strain, t: e.t };
        const f = frameOf(e.frameId);
        if (f) f.strain = e.strain;
        surprises.push({ t: e.t, propId: e.propId, surprise: e.surprise, strain: e.strain });
        break;
      }
      case RKIND.CON: {
        const a = props.get(e.a), b = props.get(e.b);
        if (e.relation === 'corroborate') {
          if (a && !a.corroboratedBy.includes(e.b)) a.corroboratedBy.push(e.b);
          if (b && !b.corroboratedBy.includes(e.a)) b.corroboratedBy.push(e.a);
        } else {
          if (a && !a.contradictedBy.includes(e.b)) a.contradictedBy.push(e.b);
          if (b && !b.contradictedBy.includes(e.a)) b.contradictedBy.push(e.a);
        }
        break;
      }
      case RKIND.REC: {
        recs.push(e);
        const f = frameOf(e.frameId);
        if (f) { f.recs++; f.terms = [...e.to]; f.strain = 0; }
        for (const pid of e.forcedBy) { const pr = props.get(pid); if (pr) pr.recForcing = true; }
        break;
      }
      case RKIND.VOID:
        voids.push(e);
        break;
      case RKIND.ASK:
        if (!asks.has(e.id)) askOrder.push(e.id);
        asks.set(e.id, { ask: e, answer: null });
        break;
      case RKIND.ANSWER: {
        const q = asks.get(e.askId);
        if (q) q.answer = e;
        break;
      }
      case RKIND.PROMOTE: {
        const pr = props.get(e.propId);
        if (pr) { pr.promoted = true; pr.sectionId = e.frameId; }
        break;
      }
      case RKIND.PHRASE:
        phrases.set(e.frameId, e);
        break;
      default: break;
    }
  }

  // ── The connected loop: disproof lineage + post-reframe staleness ──────────
  // Two annotations, both pure folds over what is already recorded:
  //   fromDisprove   this proposition's source was turned up by a search issued
  //                  to prove the reading WRONG (the pin's `via.stance`). A
  //                  reframing forced by such a proposition is the moment the
  //                  story changed under a search designed to change it.
  //   staleAfterRec  this proposition was read and judged under a frame that has
  //                  SINCE reframed (a rec on its frame at a later t), and it did
  //                  not itself force that reframe. Its reading rests on an
  //                  understanding the run has moved past — an earlier answer
  //                  that needs re-checking before it is used again.
  const recTsByFrame = new Map();
  for (const rec of recs) {
    const arr = recTsByFrame.get(rec.frameId) || [];
    arr.push(rec.t); recTsByFrame.set(rec.frameId, arr);
  }
  for (const pr of props.values()) {
    pr.fromDisprove = pins.get(pr.pinId)?.via?.stance === 'disprove';
    const evaT = pr.eva?.t ?? pr.t;
    pr.staleAfterRec = !pr.recForcing && (recTsByFrame.get(pr.frameId) || []).some((rt) => rt > evaT);
  }

  // ── Significance order (earned, per section) ──────────────────────────────
  // REC-forcing spans first (the reframings, by their strain contribution),
  // then strain magnitude, then the propositions carrying the frame's
  // load-bearing DEF terms, with confirmations underneath as corroboration.
  const rankOf = (pr, frame) => {
    if (pr.recForcing) return 0;
    if (pr.eva?.verdict === 'strain') return 1;
    const load = frame && pr.terms.some((t) => frame.terms.includes(t));
    return load ? 2 : 3;
  };
  const significanceOrder = (list2) => [...list2].sort((a, b) => {
    const fa = frameOf(a.frameId), fb = frameOf(b.frameId);
    const ra = rankOf(a, fa), rb = rankOf(b, fb);
    if (ra !== rb) return ra - rb;
    const sa = a.eva?.strainDelta ?? 0, sb = b.eva?.strainDelta ?? 0;
    if (sb !== sa) return sb - sa;
    return a.t - b.t; // stable: arrival order breaks ties
  });

  // ── The coverage grid (the cube fold) ─────────────────────────────────────
  // Every extract's address folds onto the Act face (operator) × Site face
  // (terrain). Empty cells are the QA pass: each is a triaged absence (a void
  // event named it — a finding) or a gap to fill (research it). A proposition
  // whose address fails coherence (off the Object diagonal) is RESIDUE: the
  // frame is incomplete — extend, do not smooth over.
  const opCounts = {}; const terrainCounts = {}; const cellCounts = {};
  const residue = [];
  for (const op of Object.keys(OPERATORS)) opCounts[op] = 0;
  for (const pid of propOrder) {
    const pr = props.get(pid);
    const a = pr.address;
    if (!a?.op || !OPERATORS[a.op]) continue;
    opCounts[a.op] = (opCounts[a.op] || 0) + 1;
    const grain = GRAINS.includes(a.grain) ? a.grain : 'Figure';
    const terrain = a.terrain ?? terrainOf(OPERATORS[a.op].domain, grain);
    if (terrain) terrainCounts[terrain] = (terrainCounts[terrain] || 0) + 1;
    const key = `${a.op}_${terrain ?? '?'}`;
    cellCounts[key] = (cellCounts[key] || 0) + 1;
    const verdict = coherence({ op: a.op, grain: a.grain ?? undefined, terrain: a.terrain ?? undefined, stance: a.stance ?? undefined });
    if (!verdict.ok) residue.push({ propId: pid, reason: verdict.reason });
  }
  const voidedTerrains = new Set(voids.map((v) => v.terrain));
  const emptyCells = Object.keys(OPERATORS).filter((op) => !opCounts[op]).map((op) => ({
    op, label: OPERATORS[op].label,
    // Triage: a void event whose terrain names an absence covers the Existence
    // silences; anything else is simply unresearched — a gap to fill.
    triage: op === 'NUL' && voidedTerrains.size ? [...voidedTerrains].join(', ') : 'unresearched',
  }));

  // ── The convergence badge (a topic-level finding) ─────────────────────────
  // RECs growing rare → settled (the analysis converges). RECing across many
  // distinct frames → contested (turbulent, non-converging) — and the thrash
  // detector keeps genuine oscillation apart from honest turbulence: thrash is
  // repeated A→B→A alternation over few distinct frames, never a rich reading.
  const recCursors = recs.map((r) => r.t);
  const gaps = recCursors.slice(1).map((c, i) => c - recCursors[i]);
  const converging = gaps.length >= 2 ? gaps[gaps.length - 1] >= gaps[0] : recs.length <= 1;
  const termKey = (ts) => [...new Set(ts)].sort().join('|');
  const frameSeq = recs.map((r) => termKey(r.to));
  let alternations = 0;
  for (let i = 2; i < frameSeq.length; i++)
    if (frameSeq[i] === frameSeq[i - 2] && frameSeq[i] !== frameSeq[i - 1]) alternations++;
  const distinctFrames = new Set(frameSeq).size;
  const thrash = recs.length >= 4 && alternations >= 2 && distinctFrames <= Math.ceil(recs.length / 2);
  const badge = !propOrder.length ? 'open'
    : thrash ? 'thrash'
    : recs.length >= 3 && !converging ? 'contested'
    : converging && recs.length ? 'converging'
    : recs.length === 0 ? 'settled' : 'converging';
  const convergence = { recs: recs.length, distinctFrames, alternations, converging, thrash, badge };

  // ── The VERIFY line (generative honesty, from the log alone) ──────────────
  let sentTotal = 0, sentBound = 0, sentGlue = 0, sentDropped = 0;
  for (const ph of phrases.values()) {
    sentTotal += ph.sentences.length;
    sentDropped += ph.dropped;
    for (const s of ph.sentences) (s.boundTo && !s.glue) ? sentBound++ : sentGlue++;
  }
  const verify = { sections: phrases.size, sentences: sentTotal, bound: sentBound, glue: sentGlue, dropped: sentDropped };

  // ── Sections: the frame tree, each with its significance-ordered evidence ─
  const allProps = propOrder.map((id) => props.get(id));

  // ── The search audit — the disproof stance made a number ───────────────────
  // Every widening of the corpus is a logged search with a stance. The number
  // that matters is not how many it found but how many went looking to be wrong:
  // a run whose searches only ever confirm gathers agreement and stops there.
  const disproveSearches = searches.filter((s) => s.stance === 'disprove');
  const searchAudit = {
    total: searches.length,
    confirm: searches.length - disproveSearches.length,
    disprove: disproveSearches.length,
    disproveFound: disproveSearches.filter((s) => (s.kept | 0) > 0).length,
    disproveEmpty: disproveSearches.filter((s) => (s.kept | 0) === 0).length,
    kept: searches.reduce((n, s) => n + (s.kept | 0), 0),
    thrown: searches.reduce((n, s) => n + (s.discarded?.length || 0), 0),
  };

  // ── This changed the story — a reframing forced by a disprove-found source ─
  // The strongest thing a run can report: a search built to prove the reading
  // wrong turned up a source, and that source forced the frame to reconceive.
  const storyChanges = recs
    .filter((rec) => rec.forcedBy.some((pid) => props.get(pid)?.fromDisprove))
    .map((rec) => {
      const pid = rec.forcedBy.find((id) => props.get(id)?.fromDisprove);
      const pr = props.get(pid);
      return { frameId: rec.frameId, t: rec.t, from: [...rec.from], to: [...rec.to], propId: pid, pinId: pr?.pinId ?? null };
    });

  // ── Documents: kept vs set aside vs thrown out ─────────────────────────────
  // kept/setAside partition the sources that were pinned and READ (a kept source
  // put at least one claim into the report; a set-aside one was read but nothing
  // of its made the report — capped out, or the record was silent). thrown are
  // the ones a search fetched but never pinned at all — redundant or too thin to
  // ground anything. Three honest buckets, no source double-counted.
  const promotedPinIds = new Set(allProps.filter((p) => p.promoted).map((p) => p.pinId));
  const documents = {
    pinned: pins.size,
    kept: promotedPinIds.size,
    setAside: pins.size - promotedPinIds.size,
    thrown: searchAudit.thrown,
  };

  // ── The stopping rule you can watch — per-document information gain ─────────
  // How much each source, once read, moved the picture: the surprise its
  // propositions carried, summed per pin, in the order they were first read. A
  // "quiet" document changed almost nothing; after QUIET_NEEDED quiet documents
  // in a row the picture has stopped moving. willStopIn is that countdown — a
  // stopping rule you can watch approach, not a page limit and not a clock.
  const QUIET = 0.5, QUIET_NEEDED = 2;
  const gainByPin = new Map(), firstTByPin = new Map();
  for (const s of surprises) {
    const pr = props.get(s.propId); if (!pr) continue;
    gainByPin.set(pr.pinId, (gainByPin.get(pr.pinId) || 0) + Math.max(0, s.surprise));
    if (!firstTByPin.has(pr.pinId)) firstTByPin.set(pr.pinId, s.t);
  }
  const docGains = [...gainByPin.entries()]
    .sort((a, b) => (firstTByPin.get(a[0]) ?? 0) - (firstTByPin.get(b[0]) ?? 0))
    .map(([pinId, gain]) => {
      const pin = pins.get(pinId);
      return { pinId, title: pin?.title || pin?.url || pinId, gain: Math.round(gain * 1000) / 1000, quiet: gain < QUIET };
    });
  let quietTail = 0;
  for (let i = docGains.length - 1; i >= 0 && docGains[i].quiet; i--) quietTail++;
  const stopRule = { quietNeeded: QUIET_NEEDED, quietTail, willStopIn: Math.max(0, QUIET_NEEDED - quietTail), docGains };

  // ── Earlier answers that need re-checking — the cost of the search ─────────
  // A search that turns up a reframing is not free: everything read under the
  // old reading is now in question. These are the promoted claims whose frame
  // has since reframed — the earlier answers to re-check before using them.
  const recheck = allProps.filter((p) => p.promoted && p.staleAfterRec).map((p) => p.id);

  // ── The loop, as the three numbers the surface reads directly ──────────────
  const loop = {
    disprove: searchAudit.disprove, searchTotal: searchAudit.total,
    disproveFound: searchAudit.disproveFound,
    willStopIn: stopRule.willStopIn,
    recheck: recheck.length,
    storyChanged: storyChanges.length > 0,
  };

  const sections = frameOrder.map((fid) => {
    const f = frames.get(fid);
    const own = significanceOrder(allProps.filter((p) => (p.sectionId ?? p.frameId) === fid && p.promoted));
    const unpromoted = significanceOrder(allProps.filter((p) => (p.sectionId ?? p.frameId) === fid && !p.promoted));
    return {
      frameId: fid, question: f.question, depth: f.depth, parentId: f.parentId,
      terms: [...f.terms], recs: f.recs,
      propositions: own, background: unpromoted,
      voids: voids.filter((v) => v.frameId === fid),
      phrase: phrases.get(fid) ?? null,
    };
  });

  return deepFreeze({
    cursor: at,
    frames: frameOrder.map((id) => frames.get(id)),
    root: frameOrder.length ? frames.get(frameOrder[0]) : null,
    pins: [...pins.values()],
    pinById: Object.fromEntries(pins),
    propositions: allProps,
    order: significanceOrder(allProps).map((p) => p.id),
    reads, recs, voids,
    questions: askOrder.map((id) => asks.get(id)),
    coverage: { actFace: opCounts, siteFace: terrainCounts, cells: cellCounts, emptyCells, residue },
    convergence, verify, sections,
    pulse: surprises,
    // the connected loop — see the block above each field
    searches, searchAudit, storyChanges, documents, stopRule, recheck, loop,
  });
};

// Freeze the projection so no consumer can mutate what a re-projection would
// not reproduce. Shallow-freezes each level it can reach; cycles are impossible
// (the fold builds a DAG of fresh objects).
const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
};
