# Terrain-Typed Article Templates

An article schema in which the template is chosen by **Site face position**, not by
subject-matter category. Wikipedia types an article by what its subject is *made of* — a
person gets a career section, a city gets a climate table — so it has exactly one shape,
Entity, and it makes a Field, an Atmosphere, or a Lens look like a denser thing. EO
already names nine terrains (the cube's Site face, `core/cube.js`), each with its own
identity conditions, evidentiary requirements, and ways of failing. The template follows
the terrain.

> Status key: ● landed on this branch · ◐ instrumented, measurement open · ○ future work.

The build is a new holon, `src/wiki/`. One invariant spine, nine terrain profiles,
everything a **read-time projection** over an append-only event log — nothing stored.

---

## The invariant spine ●

Every article, at every terrain, has the same nine slots — the nine operators, in helix
order (`src/wiki/spine.js`, `SPINE`). Helix order is the dependency order, **not** the
reading order: the lede is DEF at helix position 7, so it is resolved last and rendered
first, the same discipline that says a Wikipedia lede is written last.

| Op | Slot | What it holds |
|---|---|---|
| NUL ∅ | Not established | What is absent, retracted, or unknown. **Never blank.** |
| SIG ○ | Registration | The infobox — address + when it entered the record. |
| INS ● | Attestations | Concrete spans with full provenance. |
| SEG ｜ | Extent | Inside, outside, where the cut is contested. |
| CON ⋈ | Relations | Typed edges to other articles. |
| SYN △ | Composition | The whole this is part of. |
| DEF ⊢ | Lede | The terms that hold, and who set them. |
| EVA ⊨ | Disputes | Judgments rendered against those terms. |
| REC ↬ | Reframings | Occasions on which the frame itself changed. |

`sectionFor(operator, terrain)` resolves an operator to the section(s) it fills at a
terrain — most fill one, some fill more (Atmosphere has two CON sections, Lens has three).
SIG is the infobox **except** in the Ground column, where it is promoted to a
"Measurement behavior" section (the Ground diagnostic — it gets bigger when you measure
it — is itself the evidence).

## The five knobs ●

A terrain profile (`src/wiki/terrains.js`, `TERRAINS`) sets five things; everything else
is shared: **identity condition** (`identityKey`, the merge rule), **section profile**,
**render order**, **admissible/required edges**, and **characteristic failure**.

### Identity conditions — the merge rule

`identityKey(article)` is the *only* place terrain-specific dedupe lives. The Ground
column keys on a region + interval; the Figure column on a referent; the Pattern column on
a criterion or a commitment.

| Terrain | Two mentions are the same article when |
|---|---|
| Void | Same region and same interval. |
| Entity | Same named referent with spatiotemporal continuity. |
| Kind | Same **membership criterion** (same members, different criteria → two Kinds). |
| Field | Same region and same relation type. |
| Link | Same endpoint set and relation type (ordered if asymmetric). |
| Network | Same member set and topology. |
| Atmosphere | Same region and same interpretive community. |
| Lens | Same holder, target, and occasion. |
| Paradigm | Same commitment set. |

`sameArticle(a, b)` is terrain-match ∧ key-match. Cross-terrain never merges here — that
is what migration is for.

## Typed absence — the headline content ●

Every article carries a "Not established" section, and the whole point of the framework is
that absence is **not one blank**. `src/wiki/absence.js` makes the typing first-class.

Two axes cross. The three cross-cutting NUL **states** (§8): `never-set` (nobody looked),
`cleared` (recorded, then retracted/superseded — the log keeps the ghost), `unknown`
(someone looked and could not establish it — a *positive* finding). And the terrain's
**characteristic** absences — the shapes of not-established this terrain, often only this
terrain, can carry.

For eight of the nine terrains the Entity-shaped "infobox + prose" layout *buries* the
most interesting thing the article carries. So the hero render **leads with the typed
absence**:

- **Void** — *What this region does not contain.* Absence is the whole subject.
- **Field** — *The rules nobody has stated.* Unwritten is the field's substance.
- **Atmosphere** — *What this place makes expensive to say.* The readings people avoid
  without being told to — the strongest evidence the atmosphere is doing work.
- **Lens** — *A reading resting on no span.* The empty warrant is itself a finding.
- **Paradigm** — *Cases the paradigm did not fit.* The anomaly register: an accumulating
  absence with predictive value (it crosses a threshold and REC fires).

`headlineAbsence(terrain)` returns the one the renderer leads with; `absenceProfile`
returns the full typology. A **structurally sparse** slot (the desert cell, SYN × Ground)
is a fourth thing and is *not* filed under NUL — the renderer marks it as expectedly
empty, not a TODO.

## The edge grammar ●

`src/wiki/edges.js` — three families, distinguished by which store they live in, and that
distinction is the integrity rule, not decoration:

- **G · Evidence** (`attested_by`, `asserted_by`, `documented_in`, `characterized_by`) —
  provenance; what makes a claim checkable.
- **S · Structural** (`instance_of`, `endpoint_of`, `member_of`, `situated_in`,
  `obtains_over`, `composes`) — SEG/CON/SYN made persistent, with the cardinalities of §6.
- **M · Significance** (`reads`, `held_by`, `instances`, `anomaly_for`, `defines`,
  `supersedes`) — **never stored.** Projected at read time from DEF/EVA/REC. A stored M
  edge *is* the violation the architecture exists to prevent.

`admissible(edge, src, tgt)` gates by domain/range terrain. `cardinalityCheck(article)`
runs as an **EVA checkpoint, not a write-time guard** — an article is allowed to be
malformed and to know it. It counts M-required edges (Lens `reads`/`held_by`, Paradigm
`instances`) against the *projected* pool and flags any M edge found in the *stored* pool
as `stored-significance`. `defines` is the DEF-capture edge: an actor holding many outbound
`defines` while appearing only as an evaluator is now a query, not an intuition.

## The read-time projection ●

`renderArticle(eventLog, terrain, asOf)` (`src/wiki/project.js`) is a projection over the
log — **never stored**, a fresh frozen object every call. The three read-side functions of
the Experience Engine tuple ⟨G,S,M | π,γ,σ⟩ do the work: **γ** decides what is visible at
`asOf`; **σ** picks which of several competing DEF events is the current lede (priors move
to Reframings, append-only); **π** supplies the attestation footnotes. If `renderArticle`
ever cached its own output the Meant-Graph would have been stored — so it does not.

## Terrain migration ●

An article can change terrain (`src/wiki/migrate.js`). A Void that gets named and bounded
becomes an Entity; a Field whose rules get written down becomes a Network; a Lens enough
people adopt becomes an Atmosphere, and one that hardens into a way of reading everything
becomes a Paradigm. This is the *"as soon as something becomes targeted it becomes an
Entity"* dynamic, made explicit. Migration obeys **supersession, not overwrite**:
`applyMigration` appends a REC event and a `supersedes` edge pointing from the new address
to the old, and touches nothing else. `proposeMigration` is read-only and runs across the
whole dataset as a probe — three failed Void→Entity namings logged in a row is the *Emanon
finding*, not a maintenance backlog.

## Self-generating names ●

Everyone arrives with a name for an Entity; almost nothing arrives with one for a Field, an
Atmosphere, or a Lens — those terrains are *addresses*, not named referents, so they name
themselves (`src/wiki/naming.js`). Two-stage, efficient by design:

1. `deriveName(article)` — pure, sync, free. Composes a designator from the identity facets
   the article already carries (a Lens is *"<holder>'s reading of <target>"*; a Void is
   *"Absence in <region> (<interval>)"*). Covers the common case with no model.
2. `nameArticle(article, { generate })` — asks the injected model **only** when the cheap
   derivation is incomplete. `needsGeneration(article)` makes that a query, so a caller can
   batch the few that need generation and leave the rest free.

## The narrow-panel + hero render ●

`src/wiki/render.js` renders an article two ways from the one projection: **panel** (the
reader's narrow right-hand inspector column — terse, lede then sections in render order,
sparse slots marked) and **hero** (promoted to headline content — a full-bleed card that
*leads with the typed absence*). `promoteToHero(article)` is a pure re-render; promotion
never re-reads or re-stores. Deliberately not Wikipedia's chrome — no infobox rail, no
citation superscript farm; the terrain sets the shape. `WIKI_PANEL_CSS` is scoped and
theme-aware. See `probes/wiki-terrain-demo.html` for all nine rendered.

---

## The entity bias this corrects

The reader collapses "subject" onto Entity at three chokepoints (audit against
`src/rooms/reader/`):

- **The node shape** — a graph node is `{ id, tier, label, kind, ref }` with `kind ∈
  {source, entity, claim, doc}` (`tiered-graph.js:43`, `app.js:2715/2756`). There is no
  `terrain` field; a Field or Atmosphere has nowhere to live.
- **The identity model** — coreference/merge is name-string equality
  (`entityKey = label.trim().toLowerCase()`, `app.js:2583/2769`). Proper-noun semantics
  baked into the dedupe.
- **The "what does this mean" lookup** — every selected node is shipped to
  `wikiReferent({ label, … })` (`app.js:2689`, `wiki-referent.js`), which keys on
  proper-noun form and Wikipedia coref. A non-entity terrain has no encyclopedia referent.

The terrain typing already exists one layer up and is unused by the reader:
`siteTerrain` / `siteTerrainAt` in `src/surfer/terrain.js`, backed by `terrainOf` in
`core/cube.js`. `src/wiki/` supplies the article-layer alternative — a node's `terrain`
governs its identity (`identityKey`), its shape (`sections`), its name (`deriveName`), and
its meaning (the typed absence), so the other eight terrains can be reified as first-class
pages. Wiring the reader's node model and inspector onto `src/wiki/` is the integration
step. ○

## Probes before build ◐

`node probes/wiki-terrain-census.mjs [articles.json]` (§10). Cheap, read-only, allowed to
come back negative and stop the work.

- **Probe 3 (run first).** Terrain distribution. The corpus predicts Entity is the gravity
  well and the Ground column (Void/Field/Atmosphere) is sparse. *Falsifier: a flat
  distribution → the dataset is not behaving like language; stop.*
- **Probe 4.** The desert holds — SYN content near-zero for Void/Field/Atmosphere.
  *Falsifier: they fill readily → the desert cell is a corpus artifact or the annotators
  are filing something else under SYN. Both are worth more than the build.*
- Probes 1–2 (terrain-assignment agreement; section-profile discrimination) need an
  annotated dataset and are not yet run. ○

## Files

```
src/wiki/terrains.js   the nine profiles + the identity/merge rule (identityKey)
src/wiki/spine.js      the invariant nine-operator spine + sectionFor
src/wiki/edges.js      the typed edge grammar (G/S/M) + the cardinality checkpoint
src/wiki/absence.js    the TYPED absence of each terrain — the headline content
src/wiki/naming.js     self-generating designators (cheap-first, model-call gated)
src/wiki/project.js    renderArticle(eventLog, terrain, asOf) — the article as a view
src/wiki/migrate.js    propose/apply terrain migration (supersession, not overwrite)
src/wiki/render.js     the narrow-panel + hero HTML view
src/wiki/index.js      the holon barrel
tests/wiki.test.js     the regression guard
probes/wiki-terrain-census.mjs   §10 probes 3 & 4
probes/wiki-terrain-demo.html    all nine terrains rendered, panel + hero
```
