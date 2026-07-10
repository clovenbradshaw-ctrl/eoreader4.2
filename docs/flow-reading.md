# Flow for reading, and the omnimodal symmetry

`docs/flow-validity.md` established what flow *isn't*: a writing-quality critic. This is
what it *is* — a **modality-neutral grammar of movement**, a compact model of how a
well-formed sequence in a given register travels through shape-space — and how that
makes it useful for **reading**, symmetric with generating, and omnimodal.

## The symmetry: one prior, two directions

Reading and generating are the same operation against the same prior:

- **Reading** — perceive → trajectory → **compare** to the grammar (where does this
  reading deviate; what deserves attention; is the reading itself competent?).
- **Generating** — intend → trajectory → **conform** to the grammar (`arcTarget` steers
  the artifact toward the corpus-typical build).

The prior is the shared invariant; `spurt.js`'s reafference loop (the model re-reads its
own production, §6) is this symmetry already latent in the engine.

## What flow gives reading (three mechanisms)

1. **Expectation / facilitation.** `arcTarget(prior, t)` is a top-down prior on what
   should be accumulating at reading position `t` — early: entities introduced; late:
   relations and coref rising. A reader carrying it can allocate effort and treat
   deviation as a cue. Same call `longgen/shape.js` uses to generate, read backward.
2. **Corpus-calibrated surprise.** The per-position delta distribution upgrades
   `spurt.js`'s `deriveNull` noisy-TV guard from *within-document* to *corpus-anchored*:
   "is this transition bigger than readings of this register normally make **here**?" —
   a sharper trigger for the surfer's REC / frame-breaks than raw entropy.
3. **Self-diagnosis of the reading.** An off-manifold section may be a **failed reading**
   — missed entities, botched coref, dropped relations — not a weird text, because a
   degenerate parse yields an anomalous operator profile. Flow residual flags *where to
   re-read*. **This is validated below.**

## The evidence: flow detects and localizes a bad READING

The reading mirror of the (negative) writing test. `tools/flow/reading_probe.mjs` takes
well-parsed documents and **corrupts the reading** in a known middle region (sentences
40–60%): it drops a fraction of relations (CON events) and fragments coreference chains
(a missed link becomes a new singleton entity) — exactly how a parser fails. Then it
scores clean vs. corrupted against the register-matched prior.

Clean, monotonic dose–response (8 held-out expository docs):

| corruption | detect (Δ mean residual) | inside-region Δ | outside | inside/outside |
|---|---|---|---|---|
| 10% | 0.004 | 0.015 | ~0 | 15× |
| 30% | 0.015 | 0.061 | ~0 | 61× |
| 50% | 0.038 | 0.126 | ~0 | 116× |
| 80% | 0.057 | 0.188 | +0.001 | 188× |

The residual rises with severity **and stays pinned to the corrupted region** — the
outside-region change is ~0 at every level. Even 10% relation loss gives a 15× localized
signal. Contrast `docs/flow-validity.md`, where corrupting the *text* moved nothing.

**Why the asymmetry is real, not luck.** Bad writing is *semantic* — the operators still
fire, so it's invisible. A bad reading is *structural* — an impoverished operator log
(fewer CON, inflated entity count, broken mention concentration) is literally off the
manifold of competent readings. Flow measures structure, so it sees the structural
failure and not the semantic one. The two results are the same fact from both sides.

## Omnimodal

The only modality-specific layer is the **parse** — the adapter turning a raw stream into
the operator log. Everything above (segment at natural joints → per-section vector →
trajectory → prior → compare/steer) touches no words; `src/surfer/trajectory.js` reads
only the event log and says so. So a **flow grammar per modality-register** generalizes:

| modality | operator event | "NUL birth" (joint) |
|---|---|---|
| text | INS/CON/SEG on sentences | a re-grounding (part/chapter) |
| video | shot/motion regime on frames | a cut / establishing shot |
| audio–music | onset/harmonic event on samples | key change / downbeat |
| sensor | change-point on the stream | a regime shift |

Reading a film and reading a novel become the same act (measure the trajectory against
that medium's grammar); generating either is steering toward it. The reading
self-diagnosis above is modality-neutral too: a degraded *perception* in any medium
produces an off-manifold trajectory the same way a degraded parse does.

## The boundary (carried from the validity finding)

Flow is the **structure channel**, in every modality, in both directions. It does not
carry meaning. The honest whole system is two-channel: flow ("how it moves") ⟂ a semantic
channel ("what it means" — embeddings, the coref field). For reading, meaning tells you
*what*; flow tells you *how it's built* and *where your reading may have failed*. That
separation is exactly what lets flow be omnimodal — "how it moves" transfers across media;
"what it means" does not.
