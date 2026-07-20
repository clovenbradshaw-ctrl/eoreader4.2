// EO: SIG(Lens → Lens, Tending) — Question Result: the Meaning-projection adapter
// (docs/EOReader_Question_Result_Update_Spec.md §10, §27.3, §33).
//
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
