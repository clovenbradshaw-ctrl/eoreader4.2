# The self-read weld — the Step 0 measurement, and the gate it licensed

This records the read-only measurement that gated the self-read weld — the missing
piece named first in the long-form gap list: *"After a paragraph is produced, nothing
yet re-reads it back through the grounder to check whether the wave that produced it
would recognize its own output as consistent with where the fold actually is. Without
this, drift between what the log says happened and what the prose claims happened can
open up and go uncaught within a single generation pass."* And the projection-sketch
question that went with it: whether a weld, once built, would actually **catch** that
drift was untested.

Per the house discipline (the Born-frame precedent, `docs/born-frame-measurement.md`):
the cheap read-only measurement ran first, it could have come back negative, and only
the signals that cleared the gate were wired. Step 0 came back **positive for two of
the three drift families and negative for the third** — so a weld was built from the
signals that discriminate, and the blind spots are on the record as organs to extend,
not thresholds to tune.

What was built and shipped:

- **Step 0 — the probe.** `eoreader4-eval/self-read-weld-probe.mjs`. Read-only; no
  behavior change. Measures, over the worked corpus, whether any read-only re-read
  signal discriminates drifted paragraphs from faithful ones — among paragraphs that
  **passed the walk's birth gate**, because that is exactly the population the
  existing floor misses.
- **The weld.** `src/weave/longgen/weld.js` (`selfRead`), wired into the walk
  (`src/weave/longgen/walk.js`, option `selfRead`, default **on**; off restores the birth
  gate alone, byte-identical). Deterministic tests in `tests/self-read-weld.test.js`;
  the full suite is green both ways.
- **The loop, end to end.** `eoreader4-eval/walk-e2e.drive.mjs` drives the walk with a
  real CPU talker over a real document, weld on — long-form generation demonstrated on
  the metal, transcript below. A completion talker (`createCpuCompleter` in
  `eoreader4-eval/mechanics/harness.mjs`) was added for it; the finding on why is
  recorded in §"The talker must complete, not chat."

## What the probe measures

The walk binds a paragraph once, at birth, against its own slice —
`bindAndVeto`, a lexical overlap per claim with a bound-fraction floor
(`REBIND_THRESHOLD = 0.5`). Drift that keeps the slice's **words** while changing what
the prose **claims** rides through that gate. The probe builds faithful paragraphs
(three consecutive figure-dense sentences of the document itself — verbatim, so they
pass the birth gate by construction) and applies one controlled perturbation each,
the drift modes a talker actually produces:

| perturbation | the drift it models |
| --- | --- |
| `entity-swap` | two admitted figures exchange places — relations claimed between the wrong endpoints |
| `negation-flip` | one polarity flips — the prose claims the opposite |
| `number-drift` | one quantity moves — a magnitude the fold never served |
| `offfold-splice` | a sentence from elsewhere in the same document — true content, wrong position in the fold |
| `crossdoc-splice` | a sentence from a different document — contamination from outside the fold |

A perturbed variant is measured **only if it still passes the birth gate**. The gate
(the Born-probe discipline): a signal is a weld candidate only if it fires on
drifted-passing paragraphs and not on faithful ones — the reported number is the
DISCRIMINATION, never the raw fire rate, because a signal that fires everywhere is an
off switch.

Five read-only signals, all from organs already built: the edge-grain re-read
(`factCheck` — contradicted / unsupported), the propositional witness (`groundSpans`),
the whole-fold re-bind (`bindCitations` against everything the walk drank, not just
the slice), and the quantity check. Plus, measured beside them, the **shipped weld**
(`selfRead`) — the composite as actually wired, with its conservatisms.

## Result

```
corpus: metamorphosis-excerpt, esker, metamorphosis-full
faithful paragraphs: 24    false-positive baseline: weld 0.0% (raw organ trio 4.2%)

THE BIRTH GATE CATCHES 0.0% OF EVERY DRIFT MODE (n=90 perturbed variants, all pass)

                     shipped weld: fires    DISCRIMINATION
  crossdoc-splice    n=24    95.8%          +95.8
  number-drift       n=8     87.5%          +87.5
  offfold-splice     n=24    75.0%          +75.0
  entity-swap        n=15     0.0%          +0.0
  negation-flip      n=19     0.0%          +0.0

  edge-grain re-read (factCheck), all modes:  contradicted fires 0.0% everywhere;
  unsupported peaks at 13.3% (entity-swap). Coverage: of ~40–50 claimed sentences
  per mode, ~20% resolve to checkable edges; the rest are INDETERMINATE
  (unresolved endpoints — narrative prose, pronouns, non-SVO clauses).
```

Full output: run the probe (§Reproducing). Three findings and two negatives:

1. **The gap is real and total.** The birth gate catches none of the five drift
   modes — 0.0% across 90 perturbed variants. The design document's claim ("drift can
   open up and go uncaught") is not hypothetical; every modelled drift rode through
   the existing floor.

2. **A weld is buildable from organs already on hand — for contamination and
   quantity drift.** Three signals, each synchronous, deterministic, and model-free,
   OR'd per sentence, catch 75–96% of splices and number drift at a **0.0%**
   false-positive baseline. Nothing new had to be invented; the organs existed, they
   had just never been pointed back at the system's own output.

3. **Edge grain adds nothing here today — because of coverage, not judgment.** This
   doubles as the small edge-grain-vs-span-grain test the resolver work wanted. The
   edge-grain re-read (`factCheck`) resolves only ~20% of narrative claims to
   checkable edges, and even a resolved swapped-entity claim usually finds *some*
   document edge between the swapped pair (both figures are connected — the graph
   witnesses the wrong-but-adjacent relation). Its best discrimination (+13.3,
   unsupported on entity-swap) is a fraction of the span-grain trio's. The intuition
   that edge-grain resolution is where citation precision comes from is **not
   supported at current parser coverage** — the resolver's claim-edge coverage is the
   binding constraint, and until it rises, rebuilding the resolution path around edges
   buys expense, not precision.

4. **Negative: a polarity flip is invisible to every read-only organ.** Best
   discrimination +1.1. Nothing in the re-read path — binder, witness, edge check —
   reads negation. `parseRelations` carries no polarity on the talker side and
   `checkRelationAgree` compares relation primitives, not polarity. This is the
   drift mode the weld does NOT cover, on the record. The unexplored refinement
   closest to the directive: polarity-aware relation agreement (the document edge
   already carries a `polarity` field in `projectGraph`; the talker parse does not —
   that is the seam).

5. **Negative: a figure swap is caught weakly raw (+22.5 composite) and not at all by
   the shipped weld.** A swapped-entity sentence still cites against its own slice
   (the swap keeps every other word), so the weld's conservatism (§below) suppresses
   the one signal that fired. Catching it needs claim-edge coverage (finding 3) — the
   same seam, one fix.

## The weld as shipped

`selfRead(text, { slice, pool, doc })` — one verdict per sentence, three reasons:

- **number** — a quantity the sentence carries that its slice does not (+87.5).
- **refold** — no citable contact anywhere in the fold, not just the slice; gated by
  the witness module's own content-term floor so a connective ("And then it was
  over.") is scaffolding, never contamination (+54.2 on crossdoc).
- **witness** — the per-span propositional verdict (`groundSpans`): an assertion
  grounded to the void. **Doubly gated**: the witness deny fires only when the
  sentence ALSO has no citable contact with its own slice. The reason is a
  false-positive mode Step 0's verbatim-faithful population could not see and the
  first live run did: the SVO reader parses a legitimate paraphrase ("awoke … to find
  himself transformed") to **zero propositions**, `anyWitnessed` is vacuously false,
  and the sentence reads as void. `citationHolds` keeps its strict reading of the
  empty parse — the dolphin-salad fabrications that motivated the gate are themselves
  empty-parse cases, and the span-grounding tests pin that behavior — so the
  conservatism lives weld-side, where a false strike costs authored prose rather than
  a footnote. A sentence the birth gate's own measure certifies against the slice is
  never struck on witness alone.

The act mirrors `evaSplice`: strike the fired sentences, keep the welded rest,
re-gate the result so its sources stay accurate (`action: 'weld'` in the trace);
everything struck → the beat holds as NUL. Drift is never folded into the running
document — and because the prior paragraph is the next beat's retrieval cue, a struck
sentence also never steers the next slice. That is the compounding path the design
document worried about, cut at its first link. Whether drift that *survives* the weld
(a paraphrase distortion, a polarity flip) compounds across a long run remains
unmeasured — that projection stays a projection until a multi-paragraph drift-chain
probe exists.

## The loop, end to end — long-form generation goes

`eoreader4-eval/walk-e2e.drive.mjs`, SmolLM2-360M base (q8, cpu), metamorphosis
excerpt, weld on:

```
demand 4 → wrote 4   complete: true

¶1 (salvage, bound 1, cites s16)  Gregor's sister cleaned the floor and learned which
   leftovers her brother preferred.
¶2 (splice, bound 0.75, cites s19 s3 s4)  The mother protested, fearing that clearing
   the room would abandon hope of Gregor's recovery. A picture hung on the wall above
   the table where Gregor had sat to read. The alarm clock showed that Gregor had
   overslept the early train.
¶3 (splice, bound 0.6, cites s31 s6 s7)  She declared that the family could not keep
   torturing themselves by calling the thing Gregor. The chief clerk arrived and asked
   why Gregor had missed the train. Gregor tried to answer, but only a strange
   twittering noise came from behind the door.
¶4 (salvage, bound 1, cites s33 s9)  Grete said they must get rid of it, for keeping
   it would destroy the whole family. Her father drove Gregor back into the room with
   a heavy walking stick.
```

Four paragraphs, each a continuation of the last, each citing 1–3 spans, every claim
grounded, the design filled. The talker is sampled (temperature 0.4), so runs vary in
how much of each continuation binds; the floor and the weld hold on every variant. One
sampled run shipped *"Her father drove Gregor back to their home in the city"* — a
paraphrase distortion that binds lexically, carries no foreign number, and cites its
own slice: exactly the open gap findings 4–5 name. The loop goes; the floor is honest
about what it cannot yet see.

### The talker must complete, not chat

The first e2e run wrote 0 of 4. The instruct-tuned harness talker
(SmolLM2-360M-Instruct through its chat template) answered the walk's continuation
frame in the assistant register — *"Here's a revised version with some minor
adjustments for clarity and flow: … I made a few changes …"* — editing the prompt
instead of continuing the document. The grounding floor held every such beat as NUL,
which is the floor doing its job. The walk's render (`src/weave/longgen/render.js`) is a
document that trails off on a seed for a model to **complete**; the matching organ is
a base model with no chat template. `createCpuCompleter` is that organ, with the
walk's `minTokens` floor wired as `min_new_tokens` (greedy closes a connective seed in
one clause otherwise) and temperature 0.4 (0.7 wanders off the record and the floor
trims every paragraph back to its seed). The app's own 3B talker is not chat-templated
into an assistant frame either — the harness now matches the deployment shape.

## What stays deferred, on the record

- **Register / style priors.** The flow-prior derivation for the essay register (and
  per-grain exemplar harvesting) is descoped by direction: get long-form generation
  going first, stylize as needed. No corpus in the target register exists in-repo;
  the pipeline (`tools/flow/`) is ready when one does.
- **Polarity.** Finding 4. The seam is talker-side polarity in `parseRelations` plus a
  polarity comparison in `checkRelationAgree`.
- **Claim-edge coverage.** Findings 3 and 5 are one seam: until the talker-claim
  parser resolves more than ~20% of narrative claims to edges, neither the edge-grain
  weld signal nor edge-grain citation re-stitching can pay for itself. Measure
  coverage first if this is picked up — the probe's per-mode coverage line is the
  instrument.
- **The retrieval side of the weld.** `docs/paragraph-at-a-time.md` message 4 (enrich
  the SURF with self, predict the retrieval need) remains the `refold` seam. This
  measurement built the GATE side; the two are complementary and share the name only.
- **The drift-chain probe.** Whether weld-surviving drift compounds across a long run
  (the projection-sketch question) — a multi-paragraph probe with seeded drift at
  paragraph k, measuring displacement at k+1…n.

## Reproducing

```
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/self-read-weld-probe.mjs   # Step 0
node --test tests/self-read-weld.test.js                                                     # the weld, deterministic
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/walk-e2e.drive.mjs          # the loop, on the metal
```

The probe needs the live MiniLM organ (for the edge-grain column's classifier); the
weld itself and its tests are model-free. The e2e driver downloads the base completion
talker on first run. All three write nothing and change no behavior; the one behavior
change in this work is the weld itself, `selfRead: true` in the walk, tested both ways.
