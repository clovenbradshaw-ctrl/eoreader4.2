// EO: DEF(Lens → Paradigm, Dissecting) — the closed surface catalog
// The catalog is a CLOSED vocabulary (docs/eot-coder-roadmap.md §1 non-goal:
// "not a catalog we generate"). Each surface is a pre-built, tested component
// with a contract region on the cube: its home terrains (the Site face — where
// its data must live), the operators it fires (Act), and the stances it accepts
// (Stance — the interactions it supports). The checkpoint reads this map to
// decide `unknown-surface`, `terrain-mismatch`, and `stance-violation` — three of
// the four errors that the decoder cannot mask locally because they depend on the
// room's actual fields (docs/eo-for-coders.md Appendix B, docs/code-organ.md).
//
// A surface the catalog LACKS is a catalog gap, reported (`unknown-surface`),
// never invented. Widening the catalog is a human, once-off act (roadmap Stage 2):
// build the surface, contract it, test it, add it here.

// Ten surfaces — the roadmap's "ten catalog surfaces" (§Stage 1). Terrains and
// stances are real cube coordinates (core/cube.js): terrains ∈ {Void,Entity,Kind,
// Field,Link,Network,Atmosphere,Lens,Paradigm}, stances ∈ {Clearing,Dissecting,
// Unraveling,Tending,Binding,Tracing,Cultivating,Making,Composing}.
export const CATALOG = Object.freeze({
  board:    Object.freeze({ home: Object.freeze(['Entity', 'Field']),  ops: Object.freeze(['INS', 'DEF', 'SEG']), stances: Object.freeze(['Making', 'Dissecting']) }),
  graph:    Object.freeze({ home: Object.freeze(['Link', 'Network']),  ops: Object.freeze(['CON', 'SYN']),        stances: Object.freeze(['Binding', 'Composing', 'Tracing']) }),
  calendar: Object.freeze({ home: Object.freeze(['Entity', 'Kind']),   ops: Object.freeze(['INS', 'DEF']),        stances: Object.freeze(['Making', 'Dissecting']) }),
  card:     Object.freeze({ home: Object.freeze(['Entity']),           ops: Object.freeze(['NUL']),               stances: Object.freeze(['Binding']) }),
  reader:   Object.freeze({ home: Object.freeze(['Field', 'Lens']),    ops: Object.freeze(['NUL', 'CON', 'EVA']), stances: Object.freeze(['Tending', 'Binding', 'Dissecting']) }),
  table:    Object.freeze({ home: Object.freeze(['Entity', 'Field']),  ops: Object.freeze(['INS', 'DEF', 'SEG']), stances: Object.freeze(['Making', 'Dissecting', 'Tracing']) }),
  chart:    Object.freeze({ home: Object.freeze(['Network', 'Lens']),  ops: Object.freeze(['EVA', 'SYN']),        stances: Object.freeze(['Tracing', 'Composing']) }),
  list:     Object.freeze({ home: Object.freeze(['Entity']),           ops: Object.freeze(['INS', 'SEG']),        stances: Object.freeze(['Making', 'Dissecting']) }),
  form:     Object.freeze({ home: Object.freeze(['Entity', 'Field']),  ops: Object.freeze(['INS', 'DEF']),        stances: Object.freeze(['Making']) }),
  map:      Object.freeze({ home: Object.freeze(['Entity', 'Field']),  ops: Object.freeze(['INS', 'SIG']),        stances: Object.freeze(['Making', 'Tending']) }),
  // Stage 2 (docs/eot-coder-roadmap.md) — the catalog widens by human, once-off
  // acts. Each new surface is admissible only if its contract fits the existing
  // cube (no tenth operator); these two do.
  timeline: Object.freeze({ home: Object.freeze(['Entity', 'Kind']),   ops: Object.freeze(['INS', 'SEG']),        stances: Object.freeze(['Making', 'Tracing']) }),
  gallery:  Object.freeze({ home: Object.freeze(['Entity']),           ops: Object.freeze(['INS', 'NUL']),        stances: Object.freeze(['Making', 'Binding']) }),
});

// The catalog is a closed set — membership is the whole of the `unknown-surface`
// check (docs/eot-coder-roadmap.md §4: "the catalog is a closed vocabulary").
export const SURFACE_NAMES = Object.freeze(Object.keys(CATALOG));
export const hasSurface = (name) => Object.prototype.hasOwnProperty.call(CATALOG, name);
export const surfaceOf = (name) => (hasSurface(name) ? CATALOG[name] : null);

// The catalog-gap report (roadmap Stage 2): the coder telling us what it cannot
// build. Given the checkpoint findings from a build, the distinct `unknown-surface`
// requests become a prioritized backlog — the surfaces a human should build next,
// ranked by how often they were reached for. A gap is REPORTED, never invented.
export const reportCatalogGaps = (findings = []) => {
  const counts = new Map();
  for (const f of findings) {
    if (f?.error !== 'unknown-surface') continue;
    const name = String(f.address ?? '').split('.').pop() || f.address;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Object.freeze([...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([surface, requests]) => Object.freeze({ surface, requests })));
};
