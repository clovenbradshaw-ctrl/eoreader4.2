# Deviation waveform — reading surface spec

> Status: draft
> Suggested location: `docs/deviation-waveform.md`
> Consumes: `s.field`, local-band strain, `coref.js`, terrain/register segmentation, `voidnull.js` (`deriveNull`)
> Related: `docs/individuation-gate.md`, `docs/model-as-contracted-part.md`

## Summary

The deviation waveform is a continuous, per-span rendering of where a document breaks
from its own established pattern, computed entirely from signals the modelless read
already produces. It is the primary navigation surface for Study mode and the reason
the reader doesn't have to read a document linearly to find the part that matters. No
generation happens anywhere in this feature — every mark on the waveform traces back
to a statistic the kernel can show its work for, which makes it the clearest single
expression of the project's accountable-loss commitment: nothing is asserted that
can't be pointed at.

## Design principles

- **Modelless detection.** All signals below derive from existing pipeline outputs
  (`s.field`, coref, terrain/register). No LLM is in the detection path. If a small
  model appears anywhere in this surface, its only permitted role is captioning a
  span the modelless layer already flagged — never deciding what gets flagged.
- **Accountable loss.** Every rendered point has a retrievable basis. What's not
  shown is not silently dropped — it's queryable (see Typed-discard access, below).
- **No numeric readouts.** Analogue rendering only: filled areas, arc-fill gauges,
  word labels. Numbers imply a precision the underlying statistics don't have.
- **Precision over recall.** A false peak costs more trust than a missed one. When
  in doubt, de-emphasize rather than flag.
- **Provenance over synthesis.** Every mark is a pointer into the source span, one
  interaction away. The waveform never paraphrases what it's pointing at.

## Problem with a single surprise signal

Raw per-sentence surprise (`s.field`) against a general-language background conflates
two different questions: is this document's register unusual in general, and is this
specific span unusual for this document. Legal boilerplate is uniformly improbable
against ordinary English — so a single global-surprisal line flatlines high across
an entire contract and fails to isolate the one clause that actually deviates. The
fix is to stop collapsing this into one number before it reaches the reader.

## Signal model

Two continuous signals render as separate traces, plus two discrete event types
layered on top:

```
Span {
  id
  frame_id            // structural/terrain unit this span belongs to
  baseline_surprisal  // improbability vs. general/corpus background model
  local_strain        // deviation vs. this frame's own rolling local baseline
  confidence          // sample-size-derived, via deriveNull — not a constant
  novelty             // recency-decayed familiarity, not a one-time flag
}

Turn {
  boundary_position
  frame_from, frame_to
  strain_delta        // magnitude of register change at the boundary
  emphasized: bool    // true only if strain_delta clears the turn-salience null
}

Echo {
  span_a, span_b
  similarity
  distance            // document-distance between the two spans
  salience            // must clear the same competence-gain gate as ingestion
}
```

`baseline_surprisal` and `local_strain` are never algebraically merged into one
number before display. Keeping them decomposed is what lets a reader tell "unusual
in general" apart from "unusual for this text."

## Frame-aware baselines

A rolling local-strain window computed across raw document position will misread an
expected structural discontinuity — a new contract section, a new narrator's voice —
as a content anomaly. `local_strain` windows must reset or re-weight at the
boundaries the existing terrain/register segmentation already identifies, not slide
blindly across token position. The waveform's structural bands (x-axis) are exactly
these terrain units — contract sections, deposition speaker turns, narrator frames —
pulled from existing segmentation output, not a new detector.

A consequence: a register change at a structural boundary is tagged as a `Turn`
(discrete event) rather than folded into the continuous `local_strain` line as if
it were an in-frame anomaly. Turns and strain are different event types with
different meanings and different rendering.

## Confidence and cold start

Early in any window, sample size is small and `local_strain` estimates are
unreliable. Any span below a sample-size threshold renders in a visibly
de-emphasized state — reduced-opacity fill, dashed boundary — rather than a
confident-looking line that's really noise from three sentences. The threshold
itself is a Born null via `deriveNull`, consistent with how thresholds are already
derived in the individuation gate, not a hand-set constant.

## Novelty decay

A returning entity or topic shouldn't flatten permanently to "expected" after its
first mention. `novelty` decays with distance-since-last-mention, so material
reintroduced after a long gap — a callback — recovers partial salience instead of
registering as fully familiar.

## Domain-dependent utility

This is the load-bearing distinction the feature has to get right, and it's
genre-dependent:

- **Low-register-variance sources** (contracts, filings, depositions, procurement
  documents) have long expected-boilerplate stretches, which makes `local_strain`
  a strong triage signal on its own — a peak reliably means "read this clause."
- **High-register-variance sources** (literary or narrative text) have no long
  expected floor to deviate from — deviation is the style, not the exception.
  Here the whole-document gauge is close to meaningless, and the useful signal
  shifts to the discrete/relational layers: `Turn` (register change) and `Echo`
  (motif recurrence), not the raw magnitude of `local_strain`.

Requirement: the aggregate gauge auto-suppresses or mutes itself when the
document's baseline-surprisal variance is too high for an expected floor to
exist. The exact variance cutoff is an open question (below), but the behavior —
don't show a confident dial where there's nothing stable to be confident against —
is not optional.

## Echo (motif recurrence)

A distinct signal from `local_strain`: lexical or structural recurrence between
two non-adjacent spans, exceeding what chance repetition of common phrasing would
predict. Renders as a dashed arc connecting the two spans — a relational,
two-point event, not a mark on the line. Echoes are gated through the same
salience criterion already specified for corpus ingestion (competence-gain /
learning-progress, not raw surprisal) so the arc doesn't fire on every repeated
common phrase. The arc carries no interpretive label — it points at a recurrence;
the reader decides what it means. This is the same modelless discipline as
everywhere else: detection is statistical, meaning-making stays human.

## Typed-discard access from the surface

Every span the pipeline evaluated and did not flag must be queryable from the
reading surface itself, not only from the backend ledger. Hovering or clicking an
unflagged span surfaces its computed `local_strain` and the local baseline it was
measured against. This is what turns "accountable loss" from a backend property
into something the reader can actually check.

## Corpus-relative baseline (optional mode)

Instead of — or alongside — a document's own local baseline, compare against a
small reference corpus of similar documents (prior vendor contracts of the same
type, for instance). Same `deriveNull` machinery, different reference
distribution. Primary motivating case: procurement and eviction-docket work,
where "this clause deviates from every other city contract of this type" is a
substantially stronger signal than deviation from a single document's own
register.

## Rendering

- No numeric axis labels, no raw scores, anywhere in the default view.
- Two traces maximum: `baseline_surprisal` as a filled, muted area (context) and
  `local_strain` as a single bold-hue line (the point). Additional signal types
  get their own glyph — ticks for turns, arcs for echoes — never a third line.
  More lines is chart-soup, not more information.
- Structural bands sit behind the waveform, always visible, always labeled in the
  document's own terms.
- Turn markers are neutral by default; only turns whose `strain_delta` clears the
  salience null render in the emphasized color. Not every section break deserves
  the same visual weight.
- One peak callout per view by default. Hierarchy over completeness — the reader
  drills in for the rest.
- Confidence zones are visibly de-emphasized, never silently omitted.
- The gauge is an arc-fill meter — no needle, no number, a word label — and mutes
  itself per the domain-dependent-utility rule above.

## Interaction

- Every mark — peak, turn, echo arc — is a navigation control. Clicking jumps the
  reading position to that span with provenance intact.
- Hovering any span, flagged or not, surfaces the typed-discard "why" readout.
- Visibility follows the existing reading-intent ladder: full waveform in Study
  mode, turn markers only in Skim mode, hidden in Read mode.

## Non-goals

- Not a summarizer. It never produces prose about what a peak means.
- Not a sentiment or emotion detector. `local_strain` is a statistical deviation
  measure; the UI should not describe it in affective language.
- Not a replacement for the cast/entity surfaces from the individuation gate. The
  two are complementary — this is span-level and continuous, the cast list is
  entity-level and cumulative — and should stay visually distinct rather than
  merged.

## Open questions

- Exact decay function for novelty recency — needs empirical tuning against known
  documents, not a guessed constant.
- The variance cutoff that decides whether a document has a strong enough
  expected floor for the aggregate gauge to render at all.
- Distance and similarity thresholds for the echo salience gate — likely its own
  `deriveNull` call, not yet specified.
- Whether corpus-relative baselines need a persistent reference-corpus store or
  can be computed per-query on the fly.

## Validation

Before tuning against abstract statistics, run the waveform against two or three
documents where the interesting span is already known — a redlined
indemnification clause, a deposition line where counsel objects — and check that
the peak actually lands there. Domain-dependent utility (above) should be
checked the same way on the literary side: does the turn marker land at an
actual, known register break, not just a chapter boundary.
