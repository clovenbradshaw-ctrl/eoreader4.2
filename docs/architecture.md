# Architecture — a nest of holons over a durable log

## The single fact

> The append-only event log is the source of truth.
> Everything you see is a recomputed projection of it.

All state is derived. No file mutates state outside its own holon. No
holon imports another's internals — only its `index.js`. The graph,
retrieval scores, citations, audit, UI — every one is a fold of the log.

## The spine

```
                                ┌────────────────────────────┐
     text ──[ingest]──┐         │ project (memoized)         │
                      ▼         │ events,frame → graph       │
              ┌───────────┐     └────────────────────────────┘
              │ append-   │              ▲
              │ only log  ├──────────────┘
              │ (events)  │
              └───────────┘
                      │
     question ───┼─► route ─► converse ─► retrieve ─► fold ─► prompt ─► llm ─► bind ─► factcheck ─► veto ─► answer
                      │        │         │           │        │       │        │      │       │
                      ▼        └─────────┴───────────┴────────┴───────┴────────┴──────┴───────┴──► audit
```

## The two principles, in code

**The low sets the possibility for the high.**

- `core` cannot import anything; it only exposes the operator vocabulary,
  the log, the address, and the projection. Every other holon imports
  from `core` only.
- `parse` emits events. Until it emits an `INS` for an entity,
  `retrieve` cannot return that entity's sentence as a citable span. The
  parser's admission gate (two sightings) is therefore a hard ceiling
  on what the model can be cited for.
- The model never invents citations. `bindCitations` (in `ground`)
  mechanically re-cites the draft against the retrieved spans. If a claim
  isn't lexically supported by a span, no citation tag is attached. The
  lexical gate is an idf-weighted overlap against `MIN_OVERLAP` (a frequent
  token can't out-pad a rare, discriminating one); among the spans that
  clear it, the γ-field posterior at the cursor — the same warmth the
  fact-checker grounds endpoints on — tilts the citation toward the warm
  referent. Both priors flatten to plain overlap when no document is given.

**The high sets the probabilities for the low.**

- `projectGraph` takes a `frame` parameter. The turn pipeline passes a
  frame derived from the current conversation focus; this re-weights
  edges and entity priorities. Same log, different projection.
- The grounding envelope (in `ground`) filters which retrieved spans
  count as evidence. The model is steered toward grounded spans by
  prompt assembly, but the spans themselves come from a lower holon.
- The audit's history shapes routing. Frequent mechanical-route hits
  on a doc type biases the next turn to try the cheaper path sooner.

## What is a holon here?

A module is a holon when:

1. It exposes a single `index.js`.
2. Every other module either uses it (via `index.js`) or doesn't — but
   nothing reaches inside.
3. It has its own test file that exercises it with stubs for everything
   outside its boundary (the model is a fake; the embedder is hash-based).
4. It can be replaced — swap `parse/` for a richer NLP pipeline, swap
   `retrieve/` for a BM25 over IndexedDB — and the test for that holon
   keeps passing.
5. It survives interruption. Crash in the middle of a parse? The events
   already appended are still there. The user re-opens; everything
   recomputes from the durable log.

## Optimization patterns (each tied to a holon)

| Pattern | Holon | Why it's safe |
|---|---|---|
| Memoize projection on `(log.length, frameSig)` | `core` | log is append-only |
| Cache sentence embeddings on the doc | `ingest` | doc is immutable post-parse |
| One query embedding per turn | `turn` | the query is the turn's invariant |
| Per-claim retrieve cache inside the converge loop | `ground` | claim text is the cache key |
| Stable grounded system prompt | `model/prompt.js` | enables backend prefix cache |
| Mechanical path before model load | `turn/stages.js#route` | model never warms when unnecessary |

## Anti-patterns avoided

- **Decompose god modules.** Prefer small, single-purpose leaves over
  sprawling orchestrators. (The mechanical ~250-line ratchet that once
  enforced this was retired — it fought legitimate explanatory prose and
  a line count is a poor proxy for the thing that matters, cohesion.)
- **No 760-line orchestrator.** The turn pipeline is a list of named
  pure stages (`turn/stages.js`).
- **No silent feedback loops.** Every cross-holon influence is explicit
  (the `frame` parameter, the audit ring).
- **No dead code paths.** Anything imported is called by something live.
  The covenant: if you add a backend, register it in `model/index.js`;
  if you add a stage, list it in `turn/pipeline.js`; if you add a veto,
  add it to `ground/veto.js#VETOES`.
