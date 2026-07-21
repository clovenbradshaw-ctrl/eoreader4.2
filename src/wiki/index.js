// EO: SYN·SIG(Kind → Network,Field, Composing,Binding) — the wiki holon barrel
// Terrain-typed article templates (docs/terrain-typed-templates.md). An article is typed
// by its Site face position — Void, Entity, Kind, Field, Link, Network, Atmosphere, Lens,
// Paradigm — not by what its subject is "made of". One invariant nine-operator spine,
// nine terrain profiles. Everything here is a read-time projection over an append-only
// event log; nothing is stored.
//
//   terrains  the five knobs per terrain + the identity/merge rule (identityKey)
//   spine     the invariant nine-operator spine + sectionFor(op, terrain)
//   edges     the typed edge grammar (G/S/M) + admissibility + the cardinality checkpoint
//   absence   the TYPED absence of each terrain — the headline content
//   naming    self-generating designators (cheap-first, model-call gated)
//   project   renderArticle(eventLog, terrain, asOf) — the article as a view
//   migrate   propose/apply terrain migration (append-only, supersession not overwrite)
//   render    the narrow-panel + hero HTML view
//   network-article  a corpus-level Network article — sources linked by what they
//             corroborate, built bottom-up from Link members (docs/terrain-typed-templates.md)
//   from-profile  adapter: the live reader's entityProfile() packet → an article
//             (docs/entity-panel-terrain-hero.md) — the one non-engine module in this
//             holon; it exists only to feed renderArticle from a pre-existing data shape.

export { TERRAINS, TERRAIN_NAMES, profileOf, identityKeyOf, sameArticle, foldFacets } from './terrains.js';
export { SPINE, HELIX_POSITION, slotOf, contractOf, sectionFor, sectionsOf } from './spine.js';
export { EDGE_TYPES, STORES, NON_TERRAIN_NODES, admissible, emittableFrom, isProjectedEdge,
         edgesInStore, cardinalityCheck, diagnoseFailure } from './edges.js';
export { NUL_STATES, absenceProfile, headlineAbsence, absenceIsSubject } from './absence.js';
export { deriveName, nameArticle, namingPrompt, needsGeneration } from './naming.js';
export { renderArticle, ledeAt } from './project.js';
export { proposeMigration, applyMigration, migrationPathsFrom } from './migrate.js';
export { articleView, renderArticleHTML, promoteToHero, accentOf, WIKI_PANEL_CSS } from './render.js';
export { buildSourceLinks, topologyOf, buildNetworkArticle, networkGraphData } from './network-article.js';
export { profileToEventLog, articleFromProfile } from './from-profile.js';
