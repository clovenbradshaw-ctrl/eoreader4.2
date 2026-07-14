// EO: DEF·CON(Lens,Network → Lens,Link, Dissecting,Binding) — the two live redraws
// select.js — the arithmetic behind the only two things on the plain surface that MOVE
// when the person touches them, both kept pure so they are reversible and testable, the
// same discipline as the replay holon's collapse fold.
//
//   readAs(meanings, basis)   — the "Read it as: [everyone ▾]" dropdown (doc §3). One
//                               word, one set of documents; change the basis and the
//                               bars redraw. Nobody is told they changed the measurement
//                               basis — they just watch "surveillance" become a line item
//                               under the budget and a thing-done-to-people under the
//                               court filing. This is DEF re-read under a Lens.
//
//   centerOn(graph, nodeId)   — the "⌖ Center everything on this" button (doc §5). Nothing
//                               moves; everything is re-described from where you stand.
//                               Centered on eviction, Legal Aid reads as "who the tenant
//                               calls"; centered on Legal Aid, eviction reads as "their
//                               caseload". A change of basis, not of data — CON re-bound.
//
// Both are pure folds on plain data (no DOM, no scene import), so scene.js supplies the
// numbers and tests/plain-select.test.js pins the redraws.

// ── §3 · Read it as ─────────────────────────────────────────────────────────────────
// meanings: [{ label, by: { <basis>: weight, … } }]. The special basis 'everyone' is the
// sum over every named basis (never stored — always derived, so a source can never be
// double-counted). readAs returns the meanings that carry any weight under `basis`,
// sorted heaviest first, each with its weight and a share in [0,1] for the bar width.
export const readAs = (meanings, basis = 'everyone') => {
  const weigh = (m) => {
    if (basis === 'everyone') {
      let s = 0;
      for (const k in m.by) s += m.by[k] || 0;
      return s;
    }
    return m.by[basis] || 0;
  };
  const rows = meanings
    .map((m) => ({ label: m.label, weight: weigh(m) }))
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  const max = rows.length ? rows[0].weight : 0;
  return rows.map((r) => ({ ...r, share: max ? r.weight / max : 0 }));
};

// The bases a word can be read as — 'everyone' first, then each document that ever uses
// the word, in the order the scene lists them. Derived from the meanings so the dropdown
// can never offer a basis with nothing behind it.
export const basesOf = (meanings, order = []) => {
  const present = new Set();
  for (const m of meanings) for (const k in m.by) if (m.by[k]) present.add(k);
  const named = order.filter((k) => present.has(k));
  for (const k of present) if (!named.includes(k)) named.push(k);
  return ['everyone', ...named];
};

// ── §5 · Center everything on this ────────────────────────────────────────────────────
// graph: { nodes: { <id>: label }, roles: { "<from>|<to>": phrase } }. An undirected
// pair carries two phrases — the role each end plays as read FROM the other — so the
// picture re-describes without any edge moving. centerOn returns the center's label and
// its spokes (every node it shares a role-pair with), each spoke reading as it does from
// the center. Spokes are ordered by the scene's node order for a stable layout.
export const centerOn = (graph, centerId, order = null) => {
  const nodes = graph.nodes || {};
  const roles = graph.roles || {};
  if (!(centerId in nodes)) return null;
  const seq = order || Object.keys(nodes);
  const spokes = [];
  for (const id of seq) {
    if (id === centerId) continue;
    const role = roles[`${centerId}|${id}`];
    if (role == null) continue;                       // not connected to the center
    spokes.push({ id, label: nodes[id], role });
  }
  return { id: centerId, label: nodes[centerId], spokes };
};
