# Co-reading — the reflection at the reader's place

> Deep reading surfs to the place of most interest and reflects there. Idle, that place is the
> document's *own* steepest structure — a seed only varies which void the walk starts from.
> Co-reading points the same mechanism at **you**: where you read becomes the salience thread,
> so "most interesting" is re-weighted toward the passage under your eye, and the reflection
> fires in the margin of *that* place — a companion glancing up and noticing, not a narrator.

This is the `coReadAt` composition in the `surfer` holon (`src/surfer/co-read.js`), the app seam
`app.coReadAt(src, position)` (`src/rooms/reader/app/deep.js`), and the `positionThread` /
`reflectAt` primitives it stands on. It is not a new engine — it is
[deep reading](./deep-reading.md) tethered to the human.

## The mechanism already existed, pointed the wrong way

`deep-reading.js` is "the reflection at the place of most interest." The place is not a router's
choice — the reading measures where its own field is steepest (Bayesian surprise) and steps
there. The load-bearing line was always this: *with a live conversation thread the peak is
re-weighted by salience — "most interesting" means most interesting to what is being discussed*
(`surfer/salience.js`, the Born rule). Idle, that thread was a chat query, or — in `idle.js` —
a random seed (I5, "noise steers"). Co-reading replaces the seed with the reader's position.
**You become the salience thread.** Where you settle re-weights where the reading's attention
lands, and where the reading finds the place steep, it thinks *there*, with you.

## The three moves

| move | what | from |
|---|---|---|
| **your position → the thread** | the passage under the eye becomes the activated `\|T⟩` state — the focused sentence weighted fullest, the sentences around it γ-decayed by distance; its figures resolve against the doc | `surfer/salience.js` `positionThread` |
| **salience → the peak** | the surfer's peak, re-weighted by the position-thread (the same `\|⟨T\|s⟩\|²` the eigen-lens uses, over the position basis) | `surfer/surf.js` thread conditioning |
| **deepRead at the peak** | fold the peak, reflect, and the **firewall** — one reflection in the margin of that place | `fold/deep-reading.js` `deepReading` |

A live chat thread (or a lens filter) composes in via `combineThreads`: "where you are" and
"what is being discussed" pull on the same `|T⟩` together.

## The firewall — why a margin-thought is showable

Every co-read reflection is exactly what a deep-reading reflection is: an **enacted EVA**,
**reafference** (`fromEnactor`), band **void**, `grounded:false`, and `canWitness(prov) === false`
**by type** (§8, `core/provenance.js`). `projectGraph` deliberately skips EVA, so a margin-thought
can *never* launder into a fact the document is claimed to say. That is the property that lets the
reading's own thinking render right there in the margin without ever being mistaken for what you
read: witnessed claims live in the text (grounded, solid); the reading's own thoughts live in the
margin, ghosted, marked "mine" — the two never blur, because the type keeps them apart.

## The governor — where it stays quiet

The reflection fires **only where the place beats the reach's own band** (the surprise is real,
not the flat between peaks). Below the band, `coReadAt` returns null — the companion stays quiet
rather than narrate every paragraph (rumination, the architecture's named worst failure). And it
**habituates**: the caller's `visited` set means dwelling on a place already read never re-fires
the thought. The app reuses the at-rest deep reader, so co-reading and idle deep reading share
*one* habituation memory — a place read at rest is not re-read when the eye lands on it, and vice
versa.

## The reading-mode ladder — "how much is on screen"

The margin is not always on: it is the middle rung of a density ladder the reader cycles, each rung
strictly more than the last. The rung is a body class on the open book (`applyReadingMode`), so it
flips live with no reload.

| rung | on screen | body class |
|---|---|---|
| **Paper** | clean prose, nothing ambient (the default — kills the dashboard) | `eo-mode-paper` |
| **Companion** | + co-read margin-thoughts where the reader dwells | `eo-mode-companion` |
| **Lit** | + the lenses (the Link lens: entity links on) | `eo-mode-lit` |

Lenses are folded into the top rung. The **Link** lens is wired (it reuses the reader's existing
entity-link layer, `eo-links-on`); **Void** (named-but-unexplained) and **Atmosphere** (tension
tint) are scaffolded as further lenses the top rung will light once their per-span data is threaded
through — the CSS hooks and the body class are already there.

## The seams

- **Engine, testable, no DOM** — `coReadAt(doc, position, { surf, reflect, thread, visited, … })`
  is a pure governed pass; `createDeepReader(...).reflectAt(anchor, { thread })` is the same pass on
  the standing reader, sharing its habituation. `positionThread` / `combineThreads` /
  `sentenceIndexOfText` are pure reads over the doc's own token sets and entity labels —
  embedder-free.
- **App, the human seam** — `app.coReadAt(src, position)` reflects at a sentence index;
  `app.coReadHere(src, visibleText)` resolves the *text* the surface reports (the block at the top
  of the viewport — the reflowed book carries no sentence index) to that index and reflects there.
  Either streams the note into `state.reflections` marked `positioned:true` with the `anchorText` it
  hangs beside, emits `reflections`, and never competes with an active turn.
- **Presentation** — three DOM helpers on the reader iframe (`reader-render.js`, called like
  `applyThemeVars`/`scrollToText`): `applyReadingMode(doc, mode, {links})` sets the rung;
  `topVisibleText(doc)` is the position signal; `renderMarginNotes(doc, notes)` lays the ghosted,
  "mine"-marked, `data-canwitness="false"` notes beside their blocks (matched by text, floated into
  the gutter on wide viewports, inline below the passage otherwise). The surface (`index.html`)
  wires a **dwell** handler — a co-read fires when the reader settles (scroll stops for a beat), not
  on every tick — and re-lays the margin on each fresh reflection.

## Tests

- `tests/co-reading.test.js` — `positionThread` shape and emptiness; `combineThreads`;
  `sentenceIndexOfText` (visible text → sentence index, reflow/case/smart-quote tolerant); `coReadAt`
  reflects near the reader, the firewall holds, the peak is tethered to position, the governor
  stays quiet below band, habituation, chat-thread composition; `reflectAt` shares habituation.
- The presentation DOM helpers (`applyReadingMode` / `topVisibleText` / `renderMarginNotes`) are
  verified in a real browser against a mounted book iframe (mode classes flip, notes match their
  anchor block and carry the "mine" / `data-canwitness="false"` firewall marking, Paper hides them).
- `tests/co-reading-app.test.js` — `app.coReadAt` drives a `positioned` margin-thought into
  `state.reflections`, firewalled, emits `reflections`, is a safe no-op on bad input, and shares
  habituation with at-rest deep reading.
