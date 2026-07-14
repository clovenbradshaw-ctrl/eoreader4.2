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

## The seams

- **Engine, testable, no DOM** — `coReadAt(doc, position, { surf, reflect, thread, visited, … })`
  is a pure governed pass; `createDeepReader(...).reflectAt(anchor, { thread })` is the same pass
  on the standing reader, sharing its habituation. `positionThread` / `combineThreads` are pure
  reads over the doc's own token sets and entity labels — embedder-free.
- **App, the human seam** — `app.coReadAt(src, position)` takes the sentence index the surface
  reports (where the eye has settled), reflects there, and streams the note into
  `state.reflections` marked `positioned:true` so the surface can paint it in the margin of that
  place. It emits `reflections` and never competes with an active turn.
- **Surface (presentation, follow-up)** — rendering the positioned reflection in the book's
  margin, and the lens dials over the book, are presentation over this state. The trigger binding
  above is what turns a document viewer into a reading *companion*; everything else is over it.

## Tests

- `tests/co-reading.test.js` — `positionThread` shape and emptiness; `combineThreads`; `coReadAt`
  reflects near the reader, the firewall holds, the peak is tethered to position, the governor
  stays quiet below band, habituation, chat-thread composition; `reflectAt` shares habituation.
- `tests/co-reading-app.test.js` — `app.coReadAt` drives a `positioned` margin-thought into
  `state.reflections`, firewalled, emits `reflections`, is a safe no-op on bad input, and shares
  habituation with at-rest deep reading.
