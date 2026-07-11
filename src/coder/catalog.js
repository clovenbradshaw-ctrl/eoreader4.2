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
});

// The catalog is a closed set — membership is the whole of the `unknown-surface`
// check (docs/eot-coder-roadmap.md §4: "the catalog is a closed vocabulary").
export const SURFACE_NAMES = Object.freeze(Object.keys(CATALOG));
export const hasSurface = (name) => Object.prototype.hasOwnProperty.call(CATALOG, name);
export const surfaceOf = (name) => (hasSurface(name) ? CATALOG[name] : null);
