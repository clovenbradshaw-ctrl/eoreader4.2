# The terrain-typed hero, live in the entity panel

**Status:** step 1 shipped on this branch. Targets `eoreader4.2`.
**Touches:** `src/wiki/from-profile.js` (new), `src/wiki/index.js`, `src/wiki/eo-contract.js`,
`src/rooms/reader/app/wiki.js`, `src/rooms/reader/boot.js`, `index.html` (the source dossier
panel only). Model-free. Additive — nothing existing removed or changed behavior.

---

## 0. The one idea

`src/wiki/render.js` — the terrain-typed article view that leads with the typed absence
before the lede (docs/terrain-typed-templates.md) — has been finished and green (38 tests,
now 34+8=42 with this branch's addition) since before this spec existed. It has never run
in the app a person opens. The only place it rendered was `probes/wiki-terrain-demo.html`,
a standalone demo page outside the product. Live, the entity/source dossier panel
(`app/wiki.js`'s `entityWiki`) still shows only the old 4.1-era confirmed-Wikipedia-referent
lookup.

The gap was never the engine. `renderArticle` (`project.js`), the nine terrain profiles
(`terrains.js`), typed absence (`absence.js`), and the HTML view (`render.js`) are all
already built, tested, and untouched by this change. The gap was a **shape mismatch**: the
reader's live entity data (`entityProfile()` in `app/levels.js`) is a flat packet —
`{ label, defs, mentions, relations, sourceTitle }` — and `renderArticle` wants an
append-only **event log**. Nobody had written the ten lines that turn one into the other.
This spec is that adapter, wired end to end, additively, behind one flag.

---

## 1. What this is *not*

- Not a redesign of the panel. The existing Wikipedia-referent block, the contextual
  summary, and the entity DAG are untouched — this adds one more block beneath them.
- Not new terrain-detection. Every dossier subject types as `Entity` (Existence × Figure),
  the SAME terrain the reader already assigns entities elsewhere (`tieredData`,
  `topicTieredData` in `app/wiki.js` both hardcode `terrain: 'Entity'`). This reuses that
  convention rather than inventing detection for the panel. Widening to the other eight
  terrains is future work (§4), gated on a probe, not assumed here.
- Not a second engine. `profileToEventLog` performs no inference, scores nothing, and
  decides no operator firing — it relabels data the reader already computed
  (`rankProperties`' ranked `defs`, `figureSurface`'s `mentions`/`relations`) into the event
  shape `renderArticle` already knows how to fold. All judgment already happened upstream.

---

## 2. The adapter, and the one modeling decision it makes explicit

`src/wiki/from-profile.js`:

```
profileToEventLog(profile) → EventLog     // pure, sync
articleFromProfile(profile, { terrain, asOf }) → Article | null
```

Mapping:

| profile field | → | event |
|---|---|---|
| `label`, `sourceTitle` | → | one `SIG` register event, carrying `facets: { referent: label }` — the ONLY event with facets, so Entity's `identityKey`/`deriveName` resolve from real data |
| `defs[0]` (top-ranked, via `rankProperties`) | → | the `DEF` lede event |
| `defs[1:]` | → | `INS` attest events (see below — NOT `DEF`) |
| `mentions[]` | → | `INS` attest events |
| `relations[]` | → | `CON` relation events |

**The one modeling decision, stated rather than assumed:** `entityProfile()` returns several
ranked, evidentially-independent standing properties — "occupation: sea captain" and
"letter-writer" can both be true of the same figure at once. `renderArticle`'s `currentDef()`
was built for a different situation: several `DEF` events over TIME, where the latest
non-superseded one is the lede and the rest are demoted to **Reframings** (REC) — a revision
history. Folding every `defs[i]` to a `DEF` event would make `currentDef()` read `defs[1:]`
as *superseded prior framings*, which is false — they are not a history, they are concurrent
facts the record holds at once. Fabricating a reframing that never happened is worse than
not showing it, so only `defs[0]` becomes `DEF`; the rest fold in as plain `INS`
attestations — kept, visible, honestly typed as evidence rather than as a frame change.
`tests/wiki-from-profile.test.js` pins this (`no REC event is ever synthesized in v1`).

**What is honestly absent, not fabricated:** the live profile carries no "looked for and not
found" signal — it only reports properties that exist. The hero's "Not established" section
therefore renders empty in v1, not populated with an invented absence. Real absence
detection (a genuine NUL-typing pass over what a document's own conventions rule out) is
listed as future work in §4, not simulated here to make the section look busier than the
data supports.

---

## 3. Wiring (exact, all four hops)

1. **`src/wiki/from-profile.js`** (new) — the adapter above. Exported from `src/wiki/index.js`
   alongside the rest of the holon. Registered in `src/wiki/eo-contract.js`
   (`ops: ['SIG','INS','DEF','CON']` — every operator the module literally emits, per
   `tests/op-fidelity.test.js`'s static scan; not a curated subset).
2. **`src/rooms/reader/app/wiki.js`** — `heroArticleFor(docId, entId)` added beside
   `entityWiki`: calls the existing `appCtx.entityProfile(docId, entId)`, then
   `articleFromProfile(profile, { terrain: 'Entity' })`. Pure and synchronous — no cache
   needed or added, matching `project.js`'s own "never cached, a fresh projection every
   call" discipline. Exposed on `appCtx` next to `entityWiki` in the existing
   `Object.assign(appCtx, {...})` tail.
3. **`src/rooms/reader/boot.js`** — `renderArticleHTML`/`WIKI_PANEL_CSS` (pure
   string-in/string-out) exposed as `window.EO.wiki`, the same membrane pattern every other
   DOM-rendering capability crosses (`binvis`, `pdfView`, `researchReview`). The dc surface
   never imports engine internals directly — one entrance per holon, per boot.js's own
   header comment.
4. **`index.html`** — the source dossier only (`_sourceDossierVM`, the `viewer.dossier`
   panel):
   - VM: `hasWikiHero` / `setWikiHeroEl` added to the existing return object, computed
     behind one local `const WIKI_HERO_ENABLED = true` — flip it to pull the block without
     touching markup.
   - `_mountWikiHero(el, article, key)` added beside `_mountEntityDag`, same idempotent
     keyed-guard idiom (`el.__heroKey`), same fallback-to-empty on any failure.
   - Markup: one `<div ref="{{ viewer.dossier.setWikiHeroEl }}">` inside the existing
     dossier `sc-if`, directly after the entity DAG block. Nothing above it changed.

No engine internals moved. Every file touched either adds a new export or adds a field to
an existing return object — nothing removed, nothing renamed, nothing reordered ahead of it.

---

## 4. What is deliberately not built yet (the honest backlog)

- **The sidebar entity panel.** The SAME `hasWikiDesc`/Wikipedia-referent pattern this spec
  supplements also appears at five more sites in `index.html` (the mobile entity sheet, the
  web-profile card, two more desktop copies, and `viewer.dossier`'s own sibling at
  `mobile.entitySheet`). This spec wires exactly one of those six — the one with a single,
  precisely-located mount point already audited (§3.4). Extending to the other five is
  mechanical (identical VM fields, identical `_mountWikiHero` call) but each is a separate,
  unaudited insertion point in a 13k-line file; doing five more blind is exactly the kind of
  multi-site edit this repo's own discipline (cheapest step first, one flag per step) argues
  against shipping in one pass. Next step, once this one has been looked at live.
- **Terrain diversity.** A probe — run `siteTerrain({ops, recurrent, thin})`
  (`surfer/terrain.js`, already built) over a sample of real dossier subjects and see how
  often it would say something other than `Entity` — is the falsifier that would justify
  widening `heroArticleFor` past the hardcoded terrain. Until that probe runs, widening it
  would be guessing.
- **NUL / typed absence from the live record.** See §2 — genuinely future work, not stubbed.
- **The search tab.** Unrelated surface, unrelated spec (`docs/search-answer-descent.md`);
  its assembler has not been built. Not touched here.

---

## 5. Tests & verification

- `tests/wiki-from-profile.test.js` (new, 8 tests) — the adapter in isolation: exactly one
  `DEF` per profile regardless of `defs.length`; `defs[1:]` never becomes `REC`; mentions →
  `INS`; relations → `CON`; the `SIG` facet carries the referent; a thin/partial profile
  never throws; a null profile returns null, never a fabricated shell; the resulting
  article, run through the SAME `renderArticleHTML` every other terrain uses, still leads
  with the typed absence before the lede.
- `tests/contracts.test.js`, `tests/op-fidelity.test.js` — the new module's Act-face
  declaration matches what it literally emits (a static, repo-wide check; not
  hand-verified).
- Full suite (`node --test tests/*.test.js`, 3094 tests): 3093 pass, 0 fail, 1 skip
  (pre-existing, unrelated) — run both before and after this change, identical skip, zero
  new failures. Golden parity on the existing path, per the repo's own build discipline.
- **Not verified:** the actual browser render. `index.html`'s markup/VM changes are written
  against the file's own established idioms (`_mountEntityDag`'s exact guard pattern,
  `ref="{{ ... }}"` binding, the `window.EO.*` membrane) and syntax-checked in isolation,
  but this environment has no browser to load the dc-compiled surface in. First real signal
  is opening a source's dossier panel and confirming a hero block renders beneath the entity
  DAG.

---

## 6. Guardrails

- Nothing existing was removed, renamed, or reordered. Every edit is either a new file or
  an addition to an existing return object / method list.
- No new judgment is minted. `profileToEventLog` relabels already-computed data; it infers
  nothing `entityProfile()` didn't already decide.
- No absence is fabricated to fill the "Not established" section (§2).
- No reframing history is fabricated from concurrent standing properties (§2) — the
  single sharpest way this adapter could have lied, and the one it's built not to.
- One flag (`WIKI_HERO_ENABLED` in `_sourceDossierVM`) pulls the whole live surface without
  touching markup, engine code, or tests, if it needs to come back out.
