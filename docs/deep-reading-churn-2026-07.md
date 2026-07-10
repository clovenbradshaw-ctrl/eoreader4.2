# Deep reading detects churn — the model reading its own surprises (2026-07-09)

A measured result for the deep-reading engine (`src/surfer/fold/deep-reading.js`), and the payoff
of a longer investigation into why a text-distilled "flow prior" could not tell developing
prose from churn (`../corpus-flow-structures`: the flow prior measures Existence + Structure;
quality lives in the Significance / judgment axis, which is sparse in text and dense only in
a *reading*).

The missing piece was the model **reading its own surprise and writing down what it is** — an
injected `reflect` voice on the deep reader. With it, the Significance axis becomes a strong,
clean churn detector.

## The test

For each of 16 long-form outputs (a flow-shaping A/B over 8 topics, spanning clean prose to a
pure restatement loop), run the deep reader to surf to its surprise peaks, and at each peak
have a small CPU model (Qwen2.5-0.5B) articulate — in one sentence — what is significant
there. Then measure whether the model's **own reflections repeat** (`reflectionRep`, max
pairwise trigram Jaccard among the reflection bodies) and correlate with the independent
text-churn metric (`maxPair`, repetition among the paragraphs).

| detector | correlation with churn (maxPair, n=16) |
|---|---|
| flow Existence/Structure features | ~0 — no separation |
| numeric surprise proxy (`recPerSent`) | −0.59 (partly circular with repetition) |
| **model reflections repeat (`reflectionRep`)** | **+0.84** |

The separation is nearly clean: every pure-churn output (honeybees shaped 1.0, coral shaped
1.0, photosynthesis shaped 1.0, printing_press shaped 0.65) has the model **repeating its
reflection**; every developing output sits at **0** (all reflections distinct).

## Why it works

In a churning piece the surprise peaks land on the *same restated content*, so the reader,
articulating the significance at each peak, keeps writing the same judgment. In a developing
piece the peaks land on distinct content, so the reflections differ. This is the Significance
axis with *content*: the numeric proxy only counted reframes; the model voice reads what the
reframe is *about*, and restatement is visible as the reader saying the same thing twice. It
is not circular with surface repetition — the model independently articulates "what matters
here," and only churn makes those articulations collide.

This is exactly the deep-reading ontology (`docs/deep-reading.md`): a reflection is an enacted
EVA, the reading judging a folded place against its frame. Reading the *judgments back* is the
quality signal the flow prior structurally could not carry.

## Method (reproducible)

```js
import { createDeepReader } from './src/surfer/fold/index.js';
import { surfFold } from './src/surfer/index.js';
import { parseText } from './src/perceiver/parse/index.js';
// reflect(region) → model's one-sentence "what is most significant here" (any talker)
for (const answer of outputs) {
  const doc = parseText(answer);
  const refs = createDeepReader({ doc, surf: surfFold }).arrive({ anchor: 0 }).reflections;
  const bodies = [];
  for (const r of refs) bodies.push(await reflect(r.sources.map(i => doc.sentences[i]).join(' ')));
  // reflectionRep = max pairwise trigram Jaccard among `bodies`; high ⇒ churn
}
```

(The reader is driven model-free to pick the surprise peaks — deterministic — then the model
voices a reflection per peak; `deepReading`'s `reflect` is synchronous, so the async model runs
in this two-phase form. A synchronous or pre-warmed talker could inject directly.)

## Honest edges

- **Bimodal, not linear.** `reflectionRep` is 0 for most non-egregious pieces and jumps high on
  restatement loops. It cleanly flags verbatim/near-verbatim churn (the honeybees failure); a
  moderate piece with high pairwise overlap but non-identical wording (`aqueducts` shaped, 0.62)
  reads only 0.21. It is a strong *restatement* detector, not yet a graded quality score.
- **Small model.** Qwen-0.5B; a stronger reflect voice would articulate finer distinctions.
- **Still detection.** This is a validated *detector*, not yet a generation gain. The next
  experiment is the model-in-the-loop gate: during the walk, if the reflections on the draft so
  far are repeating, the beat is churning — regenerate it — then A/B the shipped prose. The
  detector is now strong enough (r=0.84, clean on egregious churn) to be worth gating on, which
  the −0.59 proxy was not.

## Bottom line

The flow prior was blind to quality because it read the text (Existence + Structure). The deep
reader reading its own surprises — the model articulating the significance at each peak — sees
it: churn is the reader saying the same thing twice, and that is measurable at r=0.84. This is
the quality instrument the shape prior could not be, and it is the deep-reading engine's, run
with a model voice.
