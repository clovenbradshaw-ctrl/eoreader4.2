// EO: SIG(Lens → Lens, Tending) — Question Result: the Meaning-projection adapter
// (docs/EOReader_Question_Result_Update_Spec.md §10, §27.3, §33; docs/EO_MVP_Integration_Guide.md).
//
// TWO AXES, ONE TREE. The integration guide (§0) pins the whole reader room to two distinct axes:
//   · the reading (holonic)  — paradigm ⊃ atmosphere ⊃ lens, the cube's Interpretation face
//                              (core/cube.js: Pattern=Paradigm, Ground=Atmosphere, Figure=Lens).
//                              This is the stable, load-bearing structure.
//   · the standing (grounding) — how a claim SITS against the sources: corroborated · contested ·
//                              single-source · void. Secondary metadata, tallied by Convergence,
//                              never re-inflated into a loud verdict chip.
// `buildLedger` (the list projection) and `holonMeaningData` (the orbit projection) are the SAME
// holon tree in two shapes — build both from one walk so a click in either re-centres the other.
// `assembleQuestionResult` scopes the claims to the active sources, groups them under their frame,
// assigns each group its standing (verdictForGroup), and reports the convergence tally = Σ standings.
//
// NON-GENERATIVE (spec §28): every visible string is a claim's own words, a source/frame label, or
// fixed interface vocabulary. Nothing here writes prose. The base spans a claim drills down to are
// its verbatim witnessing passages, each resolvable to an exact source jump by anchor.js.
//
// ── the older adapter, kept verbatim ────────────────────────────────────────────────────────────
// questionMeaningData(view, ledger) turns the ALREADY-COMPUTED question result (research-review-
// corpus.js's `researchReview()` view, plus research-review-surface.js's own `ledgerFromView`
// output) into the {nodes, edges, centreId} shape mountSolarSystem (solar-system.js) renders. It
// mints no new claim and runs no fresh analysis — every node and edge here resolves to a proposition
// group (a ledger row) or a source that already witnesses one, per spec §10's "no free-floating
// co-occurrence edge" rule.
//
// Scope, not a general entity web: unlike wiki.js's tieredData/topicTieredData (which read the
// WHOLE topic), this reads only the CURRENT ledger — already scoped to the current source selection
// by ledgerFromView (its support/contest/candidate rosters only ever name non-excluded sns). So a
// source toggle that recomputes the ledger recomputes this map too, with no separate filtering step
// (spec §33: "no stale edge may remain merely because it existed before the toggle").
//
// Tier mapping (solar-system.js's own convention: 0=source, 1=bonded figure, 2=claim):
//   tier 2 (meaning, orbiting) — the ledger's own non-void claims, capped at `limit`. Verdict is
//     encoded on the node's own color (solar-system.js draws no edges at the meaning level at all,
//     so a claim-to-source line is not how this can show), not by size — never implying certainty
//     from a bigger body.
//   tier 1 (structure, bonded) — the sources that witness at least one shown claim, bonded straight
//     to the question. A bond is solid when it corroborates a SUPPORTED or CONTESTED claim, dashed
//     when every claim it touches is single-source/candidate-only (spec §10's solid=corroborated,
//     dashed=candidate/single-source relation).
//   centre — a synthetic "question" node, never an entity, so onPivot (entity-only) never fires on
//     it; clicking it just selects in place, same as clicking the sun anywhere else in this renderer.

import { diversityOf } from '../../core/index.js';
import { canon } from './anchor.js';

const VERDICT_COLOR = {
  supported: '#1D9E75',
  contested: '#D97A34',
  single_source: '#7F77DD',
  no_commit: '#9AA0AD',
};

const clip = (s, n) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export const questionMeaningData = (view, ledger, { limit = 6 } = {}) => {
  const rows = view.rows || [];
  const sourceLabel = (sn) => { const r = rows.find((x) => x.sn === sn); return (r && (r.title || r.domain)) || sn; };

  // ledgerFromView already sorts contested > supported > single_source > void and already scopes
  // support/contest/candidate to the current (non-excluded) selection — this only reads that.
  const claims = (ledger || [])
    .filter((c) => c.verdict !== 'void' && (c.support.length || c.contest.length || c.candidate.length))
    .slice(0, limit);

  const nodes = [{ id: 'q', tier: 1, kind: 'question', label: clip(view.query || 'Question', 40), color: '#D7D2F2' }];
  const sourceNodes = new Map(); // sid -> node
  const bonds = new Map();      // sid -> { solid, codes:Set }

  claims.forEach((c) => {
    nodes.push({ id: `c:${c.id}`, tier: 2, kind: 'claim', label: clip(c.text, 60), color: VERDICT_COLOR[c.verdict] || VERDICT_COLOR.single_source });
    const solid = c.verdict === 'supported' || c.verdict === 'contested';
    const sns = new Set([...c.support, ...c.contest, ...c.candidate].map((w) => w.sn));
    for (const sn of sns) {
      const sid = `s:${sn}`;
      if (!sourceNodes.has(sid)) sourceNodes.set(sid, { id: sid, tier: 1, kind: 'source', label: clip(sourceLabel(sn), 26), ref: { sn } });
      const b = bonds.get(sid) || { solid: false, codes: new Set() };
      b.solid = b.solid || solid; b.codes.add(c.verdict);
      bonds.set(sid, b);
    }
  });

  nodes.push(...sourceNodes.values());
  const edges = [...bonds.entries()].map(([sid, b]) => ({
    a: 'q', b: sid, tier: 1, gl: b.solid ? '●' : '○', code: [...b.codes].join('/'), dashed: !b.solid,
  }));

  return {
    nodes, edges, centreId: 'q',
    countsLabel: `${claims.length} claim${claims.length === 1 ? '' : 's'} · ${sourceNodes.size} source${sourceNodes.size === 1 ? '' : 's'}`,
  };
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// The holonic reading layer — the reader room's own two-projection tree (integration guide §0/§4).
// ════════════════════════════════════════════════════════════════════════════════════════════════

// The standing axis (the grounding read) — how a claim SITS against the active sources. Muted
// metadata by design: a small dot-label on a claim, tallied by Convergence, never a headline chip.
export const STANDINGS = Object.freeze({
  corroborated:    { key: 'corroborated',  label: 'CORROBORATED',  color: '#3F9D6D', bucket: 'settled' },
  contested:       { key: 'contested',     label: 'CONTESTED',     color: '#D97A34', bucket: 'contested' },
  'single-source': { key: 'single-source', label: 'SINGLE SOURCE', color: '#9AA0C0', bucket: 'void' },
  void:            { key: 'void',           label: 'VOID',          color: '#9AA0AD', bucket: 'void' },
});
export const standingColor = (s) => (STANDINGS[s] || STANDINGS.void).color;

// The frame axis (the holonic reading) — the cube's Interpretation face, three depths.
export const FRAME_TIERS = Object.freeze(['paradigm', 'atmosphere', 'lens']);
const TIER_COLOR = { paradigm: '#F0A02A', atmosphere: '#7C74E6', lens: '#35C98F', void: '#9AA0AD' };

// Distinct independent origins of a witness roster. Honesty rule (spec §30.4): a source's own host
// is a publisher cluster, so N documents from one host are NOT N origins — diversityOf collapses
// them. We hand it {origin: host||sn} per witness and read back its origin tally; distinct sns is
// the floor when no host is known.
const originsOf = (witnesses = []) => {
  const ws = witnesses.filter(Boolean);
  if (!ws.length) return 0;
  let tally = 0;
  try { tally = diversityOf(ws.map((w) => ({ origin: w.host || w.sn || w.origin }))).origins || 0; } catch { /* fall through */ }
  const distinctSns = new Set(ws.map((w) => w.sn ?? w.origin).filter((x) => x != null)).size;
  return Math.max(tally, distinctSns);
};

// verdictForGroup(group) — the product-verdict adapter (spec §34). A group is one normalized claim
// with its support/contest rosters (each a list of witnesses {sn, host?, unit?, quote?}). The
// verdict reads independent ORIGINS, never passage/mention count:
//   contested      — an answer-bearing voice on each side.
//   corroborated   — ≥2 independent origins agree.
//   single-source  — exactly one answer-bearing voice.
//   void           — nothing answer-bearing in scope.
// Single-source is never dressed up as corroborated just because one document repeats itself.
export const verdictForGroup = (group = {}) => {
  const support = group.support || [];
  const contest = group.contest || [];
  const supOrigins = originsOf(support);
  const conOrigins = originsOf(contest);
  let standing = 'void';
  if (conOrigins >= 1 && supOrigins >= 1) standing = 'contested';
  else if (supOrigins >= 2) standing = 'corroborated';
  else if (supOrigins === 1) standing = 'single-source';
  return { standing, supportOrigins: supOrigins, contestOrigins: conOrigins };
};

// One base span — a single verbatim witnessing passage, carrying exactly what anchor.js needs to
// resolve it to an exact source jump (anchorFor → resolveAnchor). This is the floor of the descent.
const spanRef = (w) => ({ sn: w.sn ?? null, docId: w.docId ?? null, unit: Number.isInteger(w.unit) ? w.unit : null, quote: String(w.quote || w.text || '').trim(), host: w.host || null });

// Group raw claim rows into normalized claims. Rows are the claims.js shape
// ({ text, sn, unit, quote, docId, host?, contests? }) or the seed shape. Two rows fold together
// when their canon text matches (docId-blind — cross-source agreement is the whole point); a row
// flagged `contests:true` lands in the contest roster instead of support.
const groupClaims = (rows = []) => {
  const byText = new Map();
  for (const r of rows) {
    const text = String(r.text || r.quote || '').trim();
    if (!text) continue;
    const k = canon(text);
    if (!byText.has(k)) byText.set(k, { text, support: [], contest: [], rows: [], standing: null, rival: null, op: null });
    const g = byText.get(k);
    g.rows.push(r);
    // A row is a positive assertion by its source; `contests:true` marks a within-group counter-
    // witness (a genuine same-claim dispute). Cross-frame opposition (a rival reading) is carried
    // instead by an explicit `standing:'contested'` + `rival`, since it isn't the same claim.
    (r.contests ? g.contest : g.support).push(spanRef(r));
    if (r.standing && !g.standing) g.standing = r.standing;
    if (r.rival && !g.rival) g.rival = r.rival;
    // The manner the claim was asserted in (core/operators.js's Act face: DEF/CON/SIG) — every
    // witnessing row of the same proposition was parsed under the same operator, so the first one
    // present wins; absent when the row carries none (an older/seed shape never fabricates one).
    if (r.op && !g.op) g.op = r.op;
  }
  return [...byText.values()];
};

// buildLedger(reading) — the LIST projection of the holon tree (integration guide §4). It walks the
// frame tree (paradigm ⊃ atmosphere ⊃ lens), attaches each frame's grouped claims with their
// standing, and flattens to an ordered node list the outline renders directly. When `reading.frames`
// is absent (the engine has no interpretive-frame classifier yet), every claim degrades to a single
// default paradigm — honest structure, never a fabricated worldview.
//
//   reading = {
//     query,
//     frames: [ { id, tier, label, color?, parentId?, claims:[row], children?:[frame] } ]  // tree OR flat
//              | null,
//     claims: [ row ],   // ungrouped fallback when frames is null
//   }
export const buildLedger = (reading = {}) => {
  const nodes = [];
  const byId = {};
  const roots = [];

  // Normalize a frame's claims to flat witness rows. Two authoring shapes both work: a claim with a
  // `rows:[witness]` array (one claim, many witnessing passages — the natural real-data shape), and a
  // bare witness row that already carries { text, sn, unit, quote } (the ungrouped fallback).
  const expandRows = (claims) => {
    const out = [];
    for (const c of claims || []) {
      if (Array.isArray(c.rows) && c.rows.length) {
        for (const r of c.rows) out.push({ ...r, text: c.text ?? r.text, standing: c.standing, rival: c.rival, contests: r.contests });
      } else {
        out.push(c);
      }
    }
    return out;
  };

  const emit = (frame, parentId, tierIdx) => {
    const tier = frame.tier || FRAME_TIERS[Math.min(tierIdx, 2)];
    const groups = groupClaims(expandRows(frame.claims));
    const claims = groups.map((g, i) => {
      const derived = verdictForGroup(g);
      // An explicitly-provided standing (a seed, or a future frame classifier) wins over the
      // mechanical derivation — this is how a cross-frame rival reads as CONTESTED without faking a
      // same-claim split. Absent one, the standing is derived from independent origins alone.
      const standing = frame.void ? 'void' : (g.standing && STANDINGS[g.standing] ? g.standing : derived.standing);
      const { supportOrigins, contestOrigins } = derived;
      // A void frame carries no base spans — there is no evidence, which is precisely what void means.
      const spans = frame.void ? [] : [...g.support, ...g.contest].filter((s) => s.quote && s.sn);
      const sourceIds = [...new Set(spans.map((s) => s.sn).filter(Boolean))];
      const passages = spans.length;
      const rivalOrigins = g.rival ? (Array.isArray(g.rival.sns) ? g.rival.sns.length : 1) : contestOrigins;
      const meta = frame.void ? 'asked, not answerable'
        : standing === 'contested' ? `${Math.max(1, supportOrigins)} vs ${Math.max(1, rivalOrigins)}`
        : standing === 'corroborated' ? `${passages} passage${passages === 1 ? '' : 's'} · ${supportOrigins} origin${supportOrigins === 1 ? '' : 's'}`
        : `${passages} passage${passages === 1 ? '' : 's'}`;
      return {
        id: `${frame.id}-c${i}`, frameId: frame.id, text: g.text,
        standing,
        meta, origins: Math.max(supportOrigins, contestOrigins, 1),
        sourceIds, spanRefs: spans, support: g.support, contest: g.contest, rival: g.rival || null,
        op: g.op || null,
      };
    });
    const node = {
      id: frame.id, tier, parentId: parentId || null,
      label: frame.label || 'Reading',
      color: frame.color || TIER_COLOR[frame.void ? 'void' : tier] || TIER_COLOR.void,
      void: !!frame.void, claims,
    };
    nodes.push(node); byId[frame.id] = node;
    if (!parentId) roots.push(frame.id);
    for (const child of frame.children || []) emit(child, frame.id, tierIdx + 1);
  };

  let frames = reading.frames;
  if (!frames || !frames.length) {
    // No frame tree — one default paradigm carrying every claim, so the reading still stands.
    frames = [{ id: 'reading', tier: 'paradigm', label: 'The reading', claims: reading.claims || [] }];
  } else if (frames.some((f) => f.parentId)) {
    // Flat frame list with parentId links → rebuild the tree, then walk it.
    const idx = new Map(frames.map((f) => [f.id, { ...f, children: [] }]));
    const top = [];
    for (const f of idx.values()) { const p = f.parentId && idx.get(f.parentId); if (p) p.children.push(f); else top.push(f); }
    frames = top;
  }
  for (const f of frames) emit(f, null, 0);
  return { nodes, byId, roots, query: reading.query || '' };
};

// holonMeaningData(ledger, opts) — the ORBIT projection of the SAME tree, in the {nodes, edges,
// spans, centreId} shape mountSolarSystem renders (integration guide §3; reuse the SVG, don't
// reimplement it). It maps the holon onto the renderer's Powers-of-Ten descent so a click goes all
// the way down:
//   meaning level (tier 2, orbiting)   — the claims, coloured by their frame's paradigm so the two
//                                        readings read as distinct clusters; verdict rides the muted
//                                        ledger, not the body size (never imply certainty from size).
//   structure level (tier 1, bonded)   — the interpretive frames themselves (paradigm/atmosphere/
//                                        lens), bonded question → frame → subframe.
//   existence level (tier 0, the floor) — the raw base spans table; onSpan(span) resolves to a
//                                        source jump. THIS is "click down into the base spans".
// centre is a synthetic question entity so the sun is the question and every claim orbits it.
export const holonMeaningData = (ledger, { query = '', centreId = 'q' } = {}) => {
  const nodes = [{ id: 'q', tier: 1, kind: 'entity', label: clip(query || ledger.query || 'Question', 40), color: '#D7D2F2', ref: null }];
  const edges = [];
  const spans = [];
  const spansByClaim = {};
  const paradigmOf = (node) => { let n = node; while (n && n.tier !== 'paradigm' && n.parentId) n = ledger.byId[n.parentId]; return n; };

  for (const node of ledger.nodes) {
    // the frame itself, as a bonded structure body
    nodes.push({ id: `f:${node.id}`, tier: 1, kind: 'frame', label: clip(node.label, 26), color: node.color, ref: null });
    edges.push({ a: node.parentId ? `f:${node.parentId}` : 'q', b: `f:${node.id}`, tier: 1, gl: node.void ? '∅' : '⊂', code: node.tier, dashed: !!node.void });
    const para = paradigmOf(node);
    for (const c of node.claims) {
      const cid = `c:${c.id}`;
      nodes.push({ id: cid, tier: 2, kind: 'claim', label: clip(c.text, 60), color: (para && para.color) || node.color, ref: c.sourceIds[0] ? { sn: c.sourceIds[0] } : null, op: c.op || null });
      spansByClaim[c.id] = c.spanRefs;
      c.spanRefs.forEach((s, i) => { if (s.quote) spans.push({ idx: s.unit != null ? s.unit : `${c.id}.${i}`, text: s.quote, sn: s.sn, claimId: c.id }); });
    }
  }
  return {
    nodes, edges, spans, spansByClaim, centreId,
    countsLabel: `${Object.keys(spansByClaim).length} claim${Object.keys(spansByClaim).length === 1 ? '' : 's'} · ${spans.length} span${spans.length === 1 ? '' : 's'}`,
  };
};

// assembleQuestionResult(input) — scope → group → verdict → ledger + meaning + convergence
// (spec §28.1, §33; integration guide §0). One source of truth: a source toggle mutates
// `activeSourceIds`, and re-running this recomputes the answer, the ledger, the convergence tally,
// AND the orbit from the same scope — no stale edge survives a toggle (spec §33).
//
//   input = { query, frames?, claims?, sources:[{sn,active,...}], activeSourceIds? }
export const assembleQuestionResult = (input = {}) => {
  const sources = input.sources || [];
  const active = input.activeSourceIds
    ? new Set(input.activeSourceIds)
    : new Set(sources.filter((s) => s.active !== false).map((s) => s.sn));

  // Scope EVERYTHING to the active set before any judgement — the selector is an input to the
  // whole result, not a display filter applied after (spec §33). A claim's WITNESS ROWS are what
  // scope filters: drop the out-of-scope witnesses, and drop the claim only when none survive (a
  // void frame's row carries no sn and always survives — the question stays asked).
  const inScope = (row) => row.sn == null || active.has(row.sn);
  const scopeClaim = (c) => {
    if (Array.isArray(c.rows)) { const rows = c.rows.filter(inScope); return rows.length ? { ...c, rows } : null; }
    return inScope(c) ? c : null;
  };
  const scopeFrame = (f) => ({
    ...f,
    claims: (f.claims || []).map(scopeClaim).filter(Boolean),
    children: (f.children || []).map(scopeFrame),
  });
  const frames = input.frames ? input.frames.map(scopeFrame) : null;
  const claims = (input.claims || []).filter(inScope);

  const ledger = buildLedger({ query: input.query, frames, claims });
  const meaning = holonMeaningData(ledger, { query: input.query });

  // Convergence = Σ of the standings currently in scope (integration guide §0: "just Σ of the
  // standings in the current scope"). single-source and void both read as not-yet-settled.
  const tally = { settled: 0, contested: 0, void: 0 };
  for (const node of ledger.nodes) for (const c of node.claims) tally[(STANDINGS[c.standing] || STANDINGS.void).bucket]++;

  // Independent origins across the whole scoped result (honest cross-host collapse).
  const allWitnesses = [];
  for (const node of ledger.nodes) for (const c of node.claims) for (const s of c.spanRefs) allWitnesses.push(s);
  const independentOrigins = originsOf(allWitnesses);

  return {
    query: input.query || '',
    sourceScope: { active: active.size, total: sources.length, independentOrigins },
    convergence: tally,
    ledger,
    meaning,
    activeSourceIds: active,
  };
};
