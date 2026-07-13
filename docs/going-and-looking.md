# Going and looking — the search that audits itself

The deep-research room (`src/rooms/research/`) is document-chat over an
append-only `ResearchEvent` log: the report is `projectReport(log)`, the live
view is the same fold at a cursor, and the driver is the only writer. This note
adds one thing to that machine — the reason a person searches at all:

> You search because the record is silent. A good search hands you back a better
> silence.

Three mechanics turn the gather from a search **box** into a search you can
watch and trust. Each is a pure fold of the log; none is a second state.

## 1. The disproof stance — searches that try to be wrong

Every widening of the corpus is now a logged `search` event carrying a
**stance**:

- `confirm` — look for material that fits the reading.
- `disprove` — go looking for the document that would exist *only if the reading
  were wrong*: a lawsuit, a rejection, a contrary ruling, a debunking, a
  suspension (`disproofQueries`, driver.js).

`gatherCorpus` seeds roughly a third of the subject-level searches as
falsification searches and always drains them, even once the corpus target is
met — more confirm searches past the target would only pile on agreement. Each
kept source is tagged with the search that found it (`pin.via`), so a source a
disprove search turns up is traceable through to any reframing it forces.

The report folds this into `searchAudit`:

```
N of M searches trying to disprove it
```

If that number were zero, the gather would be a search for agreement — and it
would find some. When a disprove-found source forces a frame to reconceive,
that reframe is surfaced as **`storyChanges`** — *this changed the story*.

## 2. The stopping rule you can watch

The significance loop already measures, per proposition, how much each fact
surprised the frame it arrived into (the `eva` pulse). Summed per source, in the
order sources were read, that is **`stopRule.docGains`** — how much each
document changed what we knew. A *quiet* document changed almost nothing; after
`quietNeeded` quiet documents in a row the picture has stopped moving, and
`willStopIn` is that countdown:

```
two more quiet documents and it stops
```

`gatherCorpus` also stops once three searches in a row turn up nothing new — it
stops because it has stopped learning, not because it ran out of rounds. The
run stops on its own; the stop is watchable, not a page limit and not a clock.

## 3. Earlier answers need re-checking

A search that turns up a reframing is not free. Everything read under the old
reading is now in question. A promoted claim whose frame has **since** reframed
(a `rec` at a later `t`, and the claim did not itself force it) is marked
`staleAfterRec` and listed in **`recheck`**:

```
three earlier answers need re-checking
```

The report flags each inline (`re-check`) and states the count. A research tool
that only ever makes you more confident is not researching — it is collecting.

## Where it surfaces

| state | surface |
|---|---|
| A — the gap is the door | `liveView.gap` → the "nothing here answers this" card (surface.js) |
| B — while it works | `liveView.searchAudit` / `.stopRule` → the "search, audited" strip |
| C — when it's done | `render.js`: *How the search went*, *This changed the story*, *Earlier answers to re-check* |
| D — what you can ask now | `report.loop` (the three numbers) + the chat reply's honesty band (session.js) |

## The discipline held

- **Pure projection.** Every number above is a fold of the log — no clock, no
  model, no module state. Re-projecting the same log is byte-identical.
- **Offline is untouched.** The `search` events only fire when a `search` is
  injected. A model-free, pinned-sources-only run logs no searches, every pin
  carries `via: null`, and its log is byte-identical to before.
- **Nothing animates that is not an event.** The live audit strip and the report
  sections both read the same fold; there is no second source of truth.

Tests: `tests/research-search-loop.test.js`.
