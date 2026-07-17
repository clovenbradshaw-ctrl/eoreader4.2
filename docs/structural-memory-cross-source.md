# Structural Memory & Cross-Source Binding

`src/perceiver/structure/` — the holon that gives the reader **autonomous
structure discovery**, **structural memory**, and **cross-source entity
binding at indefinite nesting depth**, as an extension of the existing
primitives (append-only log, the 27-cell address space, the EOT tuple
grammar, VOID, DEF-superposition, the cut abstraction, lineup's economic
precedence). No new operator is introduced — a pattern is minted by `INS`,
bonded by `CON` (`instantiates`), promoted/retired by `REC`, adjudicated by
`EVA`, held in `DEF`-superposition, cut by `SEG`.

Every leaf is a **pure** function that *decides* and returns tuples;
`index.js` is the single append site (so Law 1 is satisfied by one
contract, exactly as `referents/index.js` is the append site for the
referent leaves). Clock and id-source are injected — no `Date.now`/random
in logic.

## The map

| § | File | What it is |
|---|---|---|
| §2 | `pattern.js` | The `pattern:*` entity class + the `instantiates` edge. Structural memory as a **graph entity**, not a side-table of learned weights, so cross-organ reuse falls out for free. `promotion_threshold` is a DEF on the pattern, never a code constant. |
| §3 | `signals.js` | The generic, **format-blind** pre-SEG detector. Six statistical/structural signals → self-aware **CLM** proposals + a **live VOID**. Presence-type signals (periodicity, field blocks, whitespace, salience, cross-reference) are decidable; the one comparative signal (topic drift) reads against the engine's derived noise null (`core/voidnull.js`). |
| §4 | `promotion.js` | The promotion/demotion pipeline. Corroboration counts **distinct documents only** (recurrence within one doc is one witness) and demands a **mandatory ruled-out-other**. Demotion is symmetric — a promoted pattern that starts failing EVA fires a revise/retire `REC` rather than calcifying. A two-pattern conflict for one zone is an ordinary `EVA`-adjudicated `DEF`-conflict. |
| §5 | `segment.js` | Container segmentation. Meta-SEG at the coarse record/document grain → zones; **library-first** match (cheap, per lineup); a zone that is itself a container is `INS`'d as a **child-frame** and the identical pass recurses; non-converging zones get an explicit **zone-level VOID**. |
| §6 | `binding.js` | Cross-source entity binding. A first mention mints a **SIG**, not an anchor. The **three sub-cuts** (`presence@NUL/SIG`, `argument@INS`, `predicate@residual`) run across frames via `core/cut.js`. A shared predicate decides identity and **rules out** the merely-lexical other; two live candidates become a **DEF-superposition** resolved later by EVA — never a forced merge/split. |
| §7 | `reference.js` | The reference state machine — seven typed states replacing a resolved/unresolved boolean. `transclusion` resolves to a `SYN`; `external-unresolved` is VOID-until-resolved (the one place a fetch is legitimate); `live-mutable` is the **OPEN** question (§11); **cycles** are a typed, detected `SEG` state. |
| §8 | `nesting.js` | Recursive nesting & termination. Depth-invariant addressing; **termination is VOID**, not a base case; the descent guardrail is **economic** (a collapse in corroboration density grades `idle` and stops by cost) — no hardcoded max-depth. Depth-reached is logged as a queryable fact. |
| §9 | `fetch-scope.js` | The web-fetch scope boundary. A fetch resolves a **specific external target** only, never structure discovery; a fetched result rides as one untrusted witness and **cannot** count toward a corroboration threshold or supply a ruled-out-other. |
| — | `index.js` | The holon entrance: re-exports the pure surface and wires `buildStructure({ log, now, mintId })` as the append seam. |

## The test protocol (§10)

`tests/structure-memory.test.js` is the acceptance backbone, one test per
numbered item:

1. **Convergence** — the detector recovers the RFC-5322 header/body split
   and indented HTML tree with no format rule, and emits a live VOID on
   structureless prose.
2. **Transfer (ingestion)** — a pattern promoted from five email documents
   recognises a chat log (both are field blocks) without being told the
   format; corroboration is cross-document; an about-witness with no
   ruled-out-other does not count.
3. **Transfer (entity binding)** — the Mr. Smith case: a shared predicate
   binds across frames and rules out the other Smith; lexical match alone
   holds a superposition; a functional-predicate clash contradicts a merge;
   a superposition resolves later by EVA.
4. **Worst-case composite** — a multi-document file segments into its
   documents; its unresolved external reference is VOID-until-resolved, its
   live-mutable reference is flagged OPEN, and an ingested target
   transitions to external-resolved.
5. **Cycle** — a self-quoting forwarded chain surfaces as a typed cycle
   state, not infinite descent.
6. **Demotion** — a promoted pattern fed failing instances fires a retire
   `REC`; within-noise failures keep it.

Plus the invariants (economic guardrail, VOID termination, the fetch scope
boundary, and a Law-1-clean append seam).

## Open questions (§11, carried, not defaulted)

- **live-mutable resolution** — snapshot-bind at capture vs. re-resolve
  live. Flagged in `REF_HANDLING[LIVE_MUTABLE].open`, not defaulted; the
  `transition` helper takes an explicit `snapshot` decision from the caller.
- **promotion threshold value** — a DEF placeholder on each pattern, not
  derived from anything principled yet.
- **economic guardrail calibration** — `maxDepthReached` is logged per
  source so the cutoff can be tuned once real depth data accumulates.
