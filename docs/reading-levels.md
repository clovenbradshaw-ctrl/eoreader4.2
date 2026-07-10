# Three levels of reading

Reading is not one operation. It happens at three levels — the three domains of
the EO cube read top to bottom — and each level is a genuinely different kind of
mathematics. Each level is also a *surface*: a thing a mechanical "consciousness"
can query behind the scenes to create knowledge for the talker (the model).

```
        EO domain          operators        the math
  ┌───────────────────────────────────────────────────────────────┐
1 │ existence  (Existence)   NUL SIG INS    counting measure        │  ← raw text/regions
2 │ structure  (Structure)   SEG CON SYN    graph linear algebra    │  ← the extracted graph
3 │ significance (Interp.)   DEF EVA REC    probability + information│  ← predict & be surprised
  └───────────────────────────────────────────────────────────────┘
```

## Level 1 — existence · counting measure

The unit and the token. Presence is an indicator function; reading at this level
is **cardinality**: how many of the query's tokens are present in a unit. The
lexical retriever is exactly this — `hits / |query|`, a normalized counting
measure over a per-unit token `Set`. Zeroth-order: points, not pairs.

`NUL` lives here: a held line is *non-transformation* — it exists, untouched,
and is simply not lifted into structure. (Clearing a thing is not NUL; it is a
`DEF` to VOID — an assertion that the slot is void.)

## Level 2 — structure · graph linear algebra

Entities are nodes, relations are edges. The projection is a **fold** over the
event log into a weighted adjacency. Two pieces of algebra:

- **Union-find quotient.** `SYN` merges collapse identity classes; the graph is
  the quotient of the raw mentions by those merges.
- **Field weight.** An edge's weight is *bilinear* in the endpoint log-masses,
  scaled by the bond's **coupling**, under an exponential **γ-decay kernel** in
  reading distance from the cursor:

  ```
  w(e) = (log(1+mass_a) + log(1+mass_b)) · coupling(e) · γ^|cursor − unit(e)|
  ```

  This is a discrete convolution of the presence comb with a heat kernel: the
  weight is a *measurement of the field under a frame*, never a stored fact.
  Move the cursor, change γ, and the same events measure differently.

## Level 3 — significance · probability + information

Reading forward is prediction and surprise.

- **The integral fold (∫).** Accumulate a prior distribution over "who acts
  next" from the γ-decayed masses, with a reserve of probability for an unseen
  figure. Prediction is the **expectation** — the top of that distribution.
- **Surprise is the differential.** When the next line lands, score its
  **surprisal** under the prior: `−log₂ p(observed)`, averaged over the figures
  and bonds the line introduced, squashed to `[0,1)`. A figure the prior
  expected costs few bits; a brand-new figure against a concentrated prior costs
  many. The opening cannot be surprising — there is no prior yet.

**Two channels — surprisal is not the one to follow.** Surprisal answers "how
improbable," which is the wrong invariant for where a reading's attention goes:
TV-snow is maximally improbable yet inert. Alongside it the reader now computes
**Bayesian surprise** — `D_KL(posterior ‖ prior)` over the figure field, how far
the distribution over *who-matters* moved when the line landed. That is the
significance channel the surfer's cursor and the enacted loop ride; surprisal
stays as the named *novelty* channel. The full account — the newcomer's velocity,
the protention reserve, why the opening is zero, and the per-text calibration the
new scale needs — is in **bayesian-surprise.md**.

Every surprise is tagged by the operator that fired: `INS` (a figure enters),
`CON`/`SIG` (a new bond), `DEF` (a new assertion), `SEG` (the focus resplits off
the expected figures). `REC` records what the reader expected; `EVA` records how
it did.

**Predictive coding (the LLM in the loop).** The surprisal above is the instant,
mechanical baseline. The fuller significance pass reads the passage with the
model, asks it to *predict the next line*, and measures the **embedding
distance** between that prediction and what the document actually says next:

```
past ─model─▶ predicted next ─embed─┐
                                     ├─ cosine ─▶ surprise = 1 − similarity
actual next ──────────────────embed─┘
```

The model never decides anything; it predicts, and the prediction error is the
surprise. (`read/predict.js`.)

**Site vs figure is a role, not a list.** Chrome — furniture — is not matched
against patterns. A unit is a *site* (ground) when its semantic role is to frame
rather than carry a figure: it anchors no `INS`/`CON`/`SIG` and sits off the
document's embedding distribution. The reader DEFs its role as `site`
(`read/site.js`); retrieval and the fold skip it. The embedder reads the role,
so the judgement is only as sharp as the embedder — a weight thresholded, never
a verdict.

## The consciousness

The fold (`read/consciousness`) queries all three surfaces and integrates them
into the note the talker reads beside the verbatim spans. Existence supplies the
trusted text; structure supplies the figures and their bonds; significance
supplies what is notable here. The model receives a reading, not a span dump —
and never the burden of a decision the physics can carry as a weight.

## It is all physics, not decisions

Nothing above commits. Coreference is a weighted field; identity is a coupling
that strengthens; the graph is a measurement under a frame. Confidence is a
number that asymptotically approaches 1 as evidence concentrates — truth as a
limit, not a verdict. When a model is used to collapse referents it obeys the
same law: it does not return a choice, it emits meta-content that *weights* the
field (`createCorefField().reinforce`).

## Modality-universal

None of this is about text. `parse` is the text adapter; `ingestImage` is the
image adapter (regions → `INS`, spatial/semantic links → `CON`/`SIG`). Both emit
the same nine operators onto the same log, so all three reading levels, the
graph view and the consciousness run over an image's object graph with no change
to the spine. The reading cursor over an image is its layout reading-order;
significance predicts the next object and is surprised by one the layout did not
lead it to expect.
