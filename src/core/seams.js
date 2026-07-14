// EO: CON(Network → Link, Binding) — the declared cross-holon seams
// The seam registry — every import that reaches PAST a holon's entrance, declared.
//
// The holon law (docs/holons.md, docs/architecture.md) is one entrance: outside a
// holon's boundary only its index.js is visible. The kernel's stance on crossings
// (docs/eo-for-coders.md §7.5, core/contract.js) is that a crossing is legal but
// must be DECLARED — the sin was crossing silently. This registry applies that
// stance to the import graph, and tests/boundaries.test.js enforces it: no
// undeclared crossing ever lands, no declared seam goes stale.
//
// The 2026-07 compliance pass (docs/eo-compliance-2026-07.md) found 205 silent
// crossings, declared the survivors here, then healed every one: each deep import
// now rides its holon's entrance, with the entrance re-exporting what its
// neighbors legitimately need. What remains is the declared floor — each row a
// crossing that CANNOT ride an entrance, with the reason on the row. A new deep
// import fails loudly until it is either routed through the entrance or
// deliberately declared here, in review, the same way:
//
//   ['src/<importer>.js', 'src/<holon>/<internal>.js', 'why the entrance will not do'],
export const SEAMS = Object.freeze([
  ['src/rooms/reader/boot.js', 'src/core/contracts.js',
    'Law 1 at emit: the conformance registry aggregates every holon\'s manifest, so it cannot ride core\'s entrance — core imports nothing; only the assembly membrane may load it'],
].map(Object.freeze));

// The seam set, keyed "from → to", for the boundary test's membership check.
export const seamKey = (from, to) => `${from} → ${to}`;
export const SEAM_SET = Object.freeze(new Set(SEAMS.map(([f, t]) => seamKey(f, t))));
