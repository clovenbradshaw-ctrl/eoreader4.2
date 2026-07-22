# Search → Answer: the concept-first descent

**Status:** proposal for build. Targets `eoreader4.2` @ `e2bfb0d`.
**Touches:** `src/rooms/reader/search-surface.js` (the assembler), `src/rooms/reader/app/record-search.js` (the call site + providers), `src/surfer/levels.js` (abstraction routing — already built), `src/surfer/fold/significance.js` (auditable inference — already built), `src/surfer/answerable.js` (the void gate — already built). Model-free. One-shot.

---

## 0. The one idea

Today the search surface picks **one** template (concordance *or* cast *or* contrast) and shows it. The change is to stop picking and start **stacking**: one question yields one **answer object** rendered as a **dashboard that descends** — the most conceptual reading at the top ("at a glance"), the structure it's built from in the middle, the exact source lines at the bottom. Scrolling down *is* zooming from significance into evidence.

Two hard rules carry over from the current surface and must not regress:

1. **Model-free and therefore unfabricatable.** The assembler computes nothing new; it *realizes* what the fold already decided (entities minted, claims graded, connections inferred-with-provenance). `(query, providers) → answer object`, pure, unit-testable. An LLM never runs in this path.
2. **Every item traces down.** Each card at every layer carries a path to its originating spans. A concept with no trace is not rendered — or is rendered explicitly as *unsupported*, never as fact.

The reader "is not here to be told; they are here to see" — that framing is already in `search-surface.js`. This spec finishes it.

---

## 1. What this is *not*

- Not a chatbot, not a thread. One question, one answer object. (Threading seam in §9.)
- Not prose-first. Prose is an **optional, downstream** render of the answer object (§6), never the answer itself.
- Not "here's where this string appeared." A concordance is the *bottom* layer, not the answer.
- Not a new judgment. No operator, no claim, no connection is minted here that the reading didn't already commit with provenance.

---

## 2. The answer object (the shape people can see)

The assembler returns one JSON object. This object **is** the deliverable: it renders as the dashboard (§7) and it is viewable raw (§6). Everything downstream — including any prosification — consumes this and only this.

```
AnswerObject {
  question:  string,
  domain:    'meaning' | 'cast' | 'both',   // levels.routeDomain(question)
  answerable:{ void: boolean, reason?: string },  // surfer/answerable.js
  scope:     { rail: SourceRow[], signalCount, total },  // unchanged, from the scan

  glance:    Card[],   // LAYER 1 — significance. the conceptual answer.
  pieces:    Card[],   // LAYER 2 — structure. what it's built from.
  sources:   Occurrence[],  // LAYER 3 — existence. the originating lines.

  thin:      boolean,  // the honest "not much here" flag
  empty:     boolean,
}

Card {
  layer:   'glance' | 'pieces',
  kind:    'connection' | 'contradiction' | 'corroboration'  // inferred (§5)
         | 'claim' | 'figure' | 'theme',                     // witnessed structure
  label:   string,          // PLAIN language — no framework vocab (§7)
  standing:'witnessed' | 'inferred',   // the audit distinction, visible
  status?: 'stated' | 'corroborated' | 'contested',
  weight:  number,
  trace:   Trace[],         // REQUIRED, non-empty — where this comes from
}

Trace { sn, reg, docId, lo, hi, quote }   // resolves to a highlighted span
```

The invariant a test pins: **every Card has a non-empty `trace`.** A card that cannot trace does not exist.

---

## 3. The three layers (internal names → plain UI labels)

The descent is significance → structure → existence internally. The reader **never sees those words.** UI labels are plain:

| internal | UI label (the page) | what fills it | drawn from |
|---|---|---|---|
| Significance | **At a glance** | the conceptual answer: inferred connections, contested points, the load-bearing claims and themes | `fold/significance.js` `readSignificance` + contested claims from `record.claims` |
| Structure | **The pieces** | the cast/figures, claims by standing, the relationships the answer rests on | `record.entities` (cast), `record.claims` (by standing), `relationsOf` |
| Existence | **In the sources** | every verbatim occurrence, highlighted; the exact lines | the occurrence scan (`search-surface-scan.js`), unchanged |

A reader scanning only the top gets the consultant's title slide. Scrolling is descending the same answer into its evidence. Nothing at the top is true that isn't shown to be true below it.

---

## 4. Question intake & abstraction routing

The query is a **question**, not just a string. Routing decides what leads.

- `levels.routeDomain(question)` → `'meaning' | 'cast' | 'both'`. A meaning-routed question leads its **glance** layer with themes/connections/contested points; a cast-routed question leads with figures and relationships. Both layers are always assembled (cheap, and tab counts must stay honest) — routing decides **order and emphasis**, not presence.
- For corpus-scale questions (a whole book), the coarse spine already exists: `levels.encodeLevels(doc)` + `levels.coarseSurf(encoding, question)` surf a few hundred coarse units, not 30k sentences, and return the top regions with readings. The **glance** cards for a long source are built from `coarseSurf` regions, so "trace Pierre's development across the novel" reaches every region it lives in without paying the sentence-grain cost. (Measured on War and Peace in `levels.js`.)
- **The void gate runs first.** `surfer/answerable.js` measures whether the field holds an answer. If void, `answerObject.answerable = { void: true, reason }` and the glance layer renders the honest absence ("The sources don't answer this — here's what they *do* cover"), never a padded dashboard. This is the empty-state integrity that keeps a thin result from reading as a broken one.

`routeDomain` is keyword-lean today (`MEANING_MARKERS` / `CAST_MARKERS`). That is fine for v1. The falsifier in §12 measures whether it beats the current intent-word router; only a passing falsifier licenses making it the default.

---

## 5. The auditable inference layer (the differentiator)

This is the capability Control-F cannot have and an LLM cannot make honest: **connections that are not literal string matches, that still trace to something.**

`fold/significance.js` already infers, with provenance, three relations the text never states:

- **CONTRADICTS** — the same bond affirmed and denied → a **contested** point.
- **CONNECTS** — two figures that never co-occur but both bear on a shared third → a **latent connection**.
- **CORROBORATES** — the same bond asserted from two places → a **strengthened** claim.

Each is committed as a `CON` edge tagged `inferred: true`, `layer: 'connection'`, attributed to the reading (`canWitness: false`, the §8 firewall), so the fold's audit shows `factsAdded: 0, inferredAdded: N`. `readSignificance(doc)` returns them.

In the answer object these become **glance** cards with `standing: 'inferred'`. The UI marks them distinctly from `'witnessed'` cards — a quiet "inferred connection" tag — so the reader always knows which cards are *in* the text and which are the reading's own reading of how the text relates. **This is the whole auditability claim made visible:** the inference is shown, labeled, and traced to the real figures it connects — the opposite of a connection dissolved into an LLM's weights. Lead the demo here.

---

## 6. Show your work: the JSON view + the optional prosify

Two affordances, both downstream of the answer object, neither in the trust path:

1. **"See the structure" (the JSON view).** A toggle renders `AnswerObject` raw. This is the "show your work" that makes the whole thing legible: a reader sees the parts, sees every trace, and sees — without being told — that the answer already exists *before* any model touches it.
2. **"Write it up" (optional prosify).** A single, clearly-secondary action that hands the answer object to an LLM to render as paragraphs. It is **off by default**, visually downstream of the JSON, and it may only prose what the object already contains — it adds no claim, no connection, no fact. The redaction membrane (`weave/write/redact.js`) and the post-hoc veto (`enactor/ground`) still apply. The point the layout makes on its own: *you could stick this in an LLM and get prose — but the prose is the least of it, and it's the only part that can be wrong.*

The JSON view sits **between** the dashboard and the prosify button, so the sequence a reader sees top-to-bottom is: rendered answer → its structure → (optional) its write-up. The model is visibly last.

---

## 7. Rendering rules

- **Dashboard, not paragraph.** The glance layer renders as cards/tiles a reader takes in at a glance — the consultant's title slide, not an essay. Structure and sources are progressive scroll.
- **Plain language only.** No framework vocabulary reaches the page: never "operator," "terrain," "cube," "face," "fold," "significance/structure/existence," "SYN," "REC." Card labels are plain nouns and plain relations ("contested," "inferred connection," "mentioned in 4 sources"). The framework is the build discipline, never the user's vocabulary.
- **Scroll = descent.** Top is the reading; bottom is the evidence. The reader feels "zoom into where this came from," not "traverse three domains."
- **The source rail stays live.** Toggling a source re-scopes and re-pivots the whole object (already true via `enabledSns`); every layer recomputes, counts stay honest.
- **Standing is always visible.** Witnessed vs inferred, and stated/corroborated/contested, are shown, not hidden — the audit is the aesthetic.

---

## 8. Honest states

- **Void:** `answerable.void` → the glance layer says what the sources *don't* answer and offers what they *do* cover. Never padded.
- **Thin:** the object is real but sparse → `thin: true`; the UI says "these are the N things the sources support," never inflates to fill the grid.
- **Empty (no query):** the resting state, unchanged.

The rule: a sparse honest dashboard beats a full dishonest one, and this is the page where the no-fabrication promise is proven — so it must hold *here* most of all.

---

## 9. One-shot now, fold/thread later (the seam)

v1 is one-shot: `(query, providers) → AnswerObject`, no conversation state. Threading is deliberately *not* built yet, but nothing forecloses it:

- The answer object is already a pure projection of the log at a query. A **follow-up** is the same function with the prior object's `trace` set carried in as a scope prior — a fold over `(question_n, priorTraces)` — not a new mechanism. Reserve an optional `providers.priorScope` param now (unused in v1) so the signature doesn't break when threading lands.
- Because retrieval rides the coarse spine (§4), a thread is a moving fold over regions, exactly what `surfer/fold` already does for generation. The threading work is UI + carrying scope, not new physics.

Document this seam; build none of it in v1.

---

## 10. Wiring (exact)

1. **`search-surface.js`** — replace the single-template tail of `routeSurface` with the layered assembler. Keep `routeIntent`/`subjectTerms`/`castFrom`/the scan. Change: instead of choosing `template` and returning one filled slot, always fill `glance`/`pieces`/`sources` and return the `AnswerObject`. Fold the existing `concepts` array into `glance` (it was the seed of this idea).
2. **`app/record-search.js`** — in `searchTheSurface`, extend `providers` with:
   - `significance: readSignificance(docFor(primaryDoc))` (or per-source, merged),
   - `encoding`/`coarseSurf` for long sources (lazy — only when a source exceeds a grain threshold, `levels.detectGrain`),
   - `answerable` verdict for the question.
   Pass through unchanged: `sources`, `record`, `entities`, `docFor`, `scopeSignal`.
3. **Surface (index.html reader room)** — render the three layers as the hero, add the "See the structure" JSON toggle, and the secondary "Write it up" action wired to the existing model path (off by default).

No engine internals move. The assembler stays pure; the room reads `window.EO`'s existing membrane.

---

## 11. Build order

1. **The answer object + assembler** (`search-surface.js`), witnessed layers only (glance from contested claims; pieces from cast/claims; sources from the scan). Ship the `trace`-on-every-card invariant. — *the spine.*
2. **The inference layer** — wire `readSignificance` into `glance`, with the witnessed/inferred marking. — *the differentiator.*
3. **Abstraction routing** — `routeDomain` order/emphasis; `coarseSurf` glance for long sources; `answerable` void state. — *the "ask a question" upgrade.*
4. **The JSON view** — render `AnswerObject` raw. — *show your work.*
5. **Optional prosify** — secondary, downstream, off by default. — *the model, visibly last.*

Each step ships behind the previous and passes the suite before the next wires.

---

## 12. Tests & falsifiers

**Tests (pure, model-free, run in `node --test`):**
- `answer-object.test.js` — every Card in `glance`/`pieces` has non-empty `trace`; no card without a resolvable span survives.
- `descent-order.test.js` — a meaning-routed question leads glance with themes/connections; a cast-routed one leads with figures. Both layers always present.
- `inference-standing.test.js` — `readSignificance` connections land as `standing:'inferred'` and are never counted among witnessed facts (mirror `fold/audit.js`: `factsAdded 0`).
- `void-dashboard.test.js` — a question the field doesn't answer yields `answerable.void` and the "what it doesn't cover" state, not a padded grid.
- `no-framework-vocab.test.js` — assert no card `label` or UI string contains the framework lexicon (operator/terrain/cube/face/fold/significance/…). A regression guard for the front door.
- `prosify-adds-nothing.test.js` — the prosify input equals the answer object; no claim/connection appears in prose that wasn't in the object.

**Falsifiers (gate the defaults, run where a corpus + model exist):**
- `F-route` — does `routeDomain` order the glance layer better than the current intent-word router on a labeled question set? If not, keep intent-word routing and drop the domain nudge to emphasis-only.
- `F-glance` — on a question with a known conceptual answer, does the glance layer surface it above the fold without the reader scrolling? Measures whether "at a glance" is real.
- `F-thin-honesty` — on out-of-scope questions, does the surface void/thin correctly rather than fabricate a dashboard? The no-fabrication guarantee, measured on the new page.

Do not make a routing or glance default the live path until its falsifier passes. (Same discipline as `length-is-a-property-of-the-field.md`.)

---

## 13. What we are NOT doing (guardrails)

- No LLM in the assembly or trust path. Prose is optional, downstream, and adds nothing.
- No framework vocabulary on the page.
- No card without a trace. No padded empty state.
- No threading in v1 — only the reserved seam.
- No new claims, connections, or judgments minted at search time — only realized from the reading, with the witnessed/inferred line kept visible.
- Any counterfactual or hypothetical-injection capability (§14) is stretch-only, lives entirely on the far side of the model boundary in §6, and never writes a `trace` or a `standing` field — it is quarantined from the dashboard, not a fourth layer of it.

---

## 14. Stretch goal: the question as part of the physics (question-conditioned scoring, and counterfactual descent)

This section is a proposed *addition* to the spec above, not yet load-bearing on any build step in §11. It answers a question worth pre-registering now, because it cuts two different ways and the spec above only licenses one of them.

### 14.1 The question already IS part of the measurement — name it

The descent above can misread as "the question just routes to a fixed answer." It doesn't, and the code already proves it: `coarseSurf(encoding, question, …)` in `levels.js` scores every coarse unit as a function of the question itself — `kw` (keyword overlap with *this* question's tokens), `fig` (whether *this* question names a figure, weighted by how prominent that figure is in the unit), and `dom` (a domain nudge that only exists because `routeDomain(question)` classified *this* question as meaning- or cast-leaning). Change the question and the same document yields a different top-4 region set and a different `meaningDensity` weighting — not because the underlying reading changed, but because the *measurement the question licenses* changed. That is already "the question in the physics." §4 undersells this by describing it as "routing"; it is closer to the question acting as a **prior over which real, already-witnessed material gets surfaced and how it's weighted**.

Worth making explicit as its own concept rather than leaving it implicit in `coarseSurf`'s scoring formula: a `questionPrior` — the small set of question-derived weights (`keys`, `route`, per-figure salience) that any layer of the answer object can be re-scored against. v1's glance/pieces assembly (§10) should thread this prior through explicitly rather than re-deriving it ad hoc per layer, so a later layer (or a follow-up question, §9) can reuse the same prior instead of recomputing it. This is a small refactor of already-built code, not new physics, and it can ship inside step 3 of §11 without a separate falsifier — `F-route` already covers it.

### 14.2 The line this does NOT license: counterfactual world-injection

The Darcy-as-Godzilla case is a different animal, and it matters to be precise about why. "Assuming Mr. Darcy were actually Godzilla, how would the novel be different?" requires two things the fold cannot supply:

1. **World knowledge absent from the document.** Nothing in *Pride and Prejudice* witnesses what Godzilla is, does, or wants. There is no span to trace to — not a weak span, a *nonexistent* one. `fieldVerdict` (`answerable.js`) would be right to call the literal premise VOID: the referent never resolves in the document (§ "elsewhere").
2. **Modification of witnessed facts, not just re-weighting of them.** Re-scoring which real cards surface (14.1) never changes what a card *says*. Answering the counterfactual requires *substituting* a premise into the graph and propagating what changes — a new judgment, minted at question time, about what Darcy's bonds and claims would become under a premise the text never entertained. That is exactly the operation §0 rule 1 and §13 forbid: it is not a realization of what the reading already decided, it is a new decision.

So this is not "harder routing" — it's a categorically different capability that must never be confused with the model-free descent, or the no-fabrication guarantee this whole spec exists to protect gets quietly voided on the page that's supposed to prove it holds.

### 14.3 If this is ever built: quarantine it, don't merge it into the descent

Should a counterfactual mode become a real feature, it is a **fourth, separate thing**, wired the same way prosify already is (§6) — downstream of the model boundary, never upstream of it:

- **New top-level field, not a new Card kind:** `AnswerObject.counterfactual: null | { premise, narrative, basis }`. It never appears in `glance`/`pieces`/`sources`, is never assigned a `trace`, and is never given a `standing` of `'witnessed'` or `'inferred'` — those two values describe things the fold decided; a counterfactual is neither.
- **`basis` is the discipline that keeps it honest-*about-what-it's-not*:** the real, traced Cards (Darcy's actual witnessed bonds and claims) that the counterfactual is perturbing. The narrative names what it held fixed and what it changed against that basis, so a reader can see the seam between "this part is the real book" and "this part is invented" even inside one imaginative answer.
- **Requires a model, always, no exceptions** — this is the one place in the whole design where generation supplies the substance, not just the phrasing, and the UI must say so as loudly as it currently says "off by default" about prosify. A persistent, undismissable label ("speculative — not sourced") on any rendered counterfactual output, distinct from the quiet "inferred connection" tag in §5, which still means something *is* true, just not stated outright.
- **Recursion is the honest part of the idea, and it's the same seam as §9.** A counterfactual answer inviting a follow-up ("how would that change his sister's marriage prospects?") is a fold over `(question_n, priorPremise)`, structurally identical to the threading seam already reserved in §9 — except the "prior" being carried forward is an invented premise instead of a real trace set. Worth reserving the same `providers.priorScope` shape for it later; worth building neither now.

### 14.4 Falsifier, if this is ever scheduled

`F-counterfactual-quarantine` — on any release that ships a counterfactual mode, assert automatically (mirroring `no-framework-vocab.test.js`'s style of regression guard): no `counterfactual` output is ever copied into `glance`, `pieces`, or `sources`; no `Card` ever carries a `trace` whose span was synthesized rather than resolved from the document; the "speculative — not sourced" label is present on every render path that shows counterfactual text. Until that test exists and passes, a counterfactual mode does not ship, however good the demo of §14.1 makes it look.
