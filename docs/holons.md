# Holons — Koestler's watchmakers, applied

Koestler's parable, from *The Ghost in the Machine*:

> Hora builds watches from stable sub-assemblies. An interruption costs
> him at most one assembly; the rest persist. Tempus builds the watch
> monolithically. Any interruption collapses the whole and he never
> finishes.
>
> The stable intermediate form — the *holon* — is what survives
> interruption and what selection can act on.

The eoreader3 codebase was Hora at the data layer (the append-only log)
and Tempus at the code layer (`engine.js` 14,693 lines, `app.jsx` 5,029
lines, `runGroundedScope` a single 760-line function). The tests had
already decomposed the problem into `binding`, `relation`, `coref`,
`roles`, `site`, `eoaddress`, `distance-gravity`, `cross-source` — pinning
sub-assemblies that did not exist as modules.

eoreader4 cuts the source along the seams the tests already drew.

## A holon, here, is a module that

1. **Has one entrance.** Only `index.js` is imported by other holons.
2. **Has one boundary.** Inside, files import from each other freely;
   outside, they are invisible.
3. **Has its own tests.** The tests stub everything across the boundary
   (model is a fake, embedder is hash-based) so a failure is *local*.
4. **Is swappable.** Replace it with a different implementation of the
   same interface — the rest of the system does not know.
5. **Is whole at its own scale.** It runs, has meaning, and can be reasoned
   about without reference to its neighbours.
6. **Survives interruption.** Crash mid-parse? The events already appended
   are still in the log. Re-open the page; everything recomputes.

## The cut

From the eoreader3 selection (`text-chat-mechanics-map.md` §7) — the
recommended sub-assemblies, now realised as modules:

| Recommended (eoreader3) | Realised (eoreader4) |
|---|---|
| `eo-core` — log, operators, project, address | `src/core/` |
| `parse` — extractEoGraph + per-sentence emitters | `src/parse/` |
| `retrieve` — retrieve, retrieveScope, hybrid | `src/surfer/retrieve/` |
| `fold` — folds, impression, terrains | `src/surfer/fold/` |
| `read` — the three reading levels, the surfer | `src/read/` (incl. `surf.js`) |
| `enact` — the significance loop, reader calibration | `src/enactor/enact/` |
| `converse` — conversational provenance, the session fold | `src/turn/converse/` (incl. `history.js`) |
| `answer` — mechanical answerers | `src/enactor/answer/` |
| `ground` — bindCitations + veto battery | `src/enactor/ground/` |
| `runGroundedScope → named pipeline` | `src/turn/stages.js` (and `pipeline.js`, `intent.js`) |

The modules eoreader3 already did right — `shape.js`, `composition.js`,
`addressee.js`, `compute.js` — were the template: pure, dependency-injected,
fully exercised in Node with fakes. eoreader4 makes every holon that.

## Why this also makes the app faster

A fast app is a *small dependency graph in the hot path*. When the holons
are real, each can be optimized in isolation:

- The hot lexical retrieval path imports only `core` and `parse/tokenize`.
  It has no transitive dependency on the embedder, the model, the audit, or
  React.
- The mechanical answerers (`answer/`) execute before the model is even
  loaded — and they can, because they import nothing from `model/`.
- The audit (`audit/`) is a pure ring buffer with no transitive imports
  outside itself; rendering the audit panel costs only a DOM update.

If you can name the holon that runs, you can name the cost of running it.
That is how the data already is. This is the code admitting the same.
