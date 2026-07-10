# Deep reading into generation — the battery (2026-07-09)

Does reflecting at the source's surprise peaks *before* writing improve the prose? A
three-arm battery on a real CPU model (Qwen2.5-0.5B, greedy, 4 topics), same sources,
only the reflection varied. Harness: `eoreader4-eval/deep-reading-gen-battery.mjs`.

- **baseline** — walk, no deep reading
- **free** — walk + `deepRead`, model-free reflection (the deterministic inner note)
- **voiced** — walk + `deepRead`, MODEL-voiced reflection (the model reads each surprise
  peak and writes what is significant there; async lift — reflections pre-computed at the
  peaks, injected synchronously into the sync `deepReading` path)

## Result — net-negative unconditionally, positive on the churning baseline

Mean Δ vs baseline (independent metrics — not the flow/Significance signal any of this
optimizes):

| arm | maxPair ↓ | distinctTri ↑ | meanBound ↑ | chars |
|---|---|---|---|---|
| free | **+0.137** (worse) | −0.067 (worse) | **−0.158** (worse) | +976 |
| voiced | +0.084 (worse) | −0.053 (worse) | −0.095 (worse) | +557 |

Per topic:

| topic | baseline maxPair | free | voiced |
|---|---|---|---|
| dolphins | 0.00 | **0.841** | 0.594 |
| printing_press | 0.00 | 0.00 | 0.034 |
| honeybees | 0.00 | 0.005 | 0.051 |
| **volcanoes** | **0.349** | 0.053 | **0.005** |

The split is the finding. On the three already-clean baselines, the reflection **hurt** —
bloat, lower grounding, and on dolphins-free it induced churn where there was none. On the
one churning baseline (volcanoes), the voiced reflection **rescued it**: maxPair
0.349 → 0.005, distinctTri 0.79 → 0.995, grounding *up* 0.31 → 0.408 — better on every axis.

## Why

1. **`meanBound` drops because the reflection is uncitable by design** — the epistemics
   working (`docs/deep-reading.md`: a reflection is reafference, never a citable span). Content
   the model draws from it correctly counts as ungrounded, so a larger ungrounded fraction is
   the epistemic firewall showing up in the metric, not necessarily new fabrication.
2. **The reflection is a churn-breaker.** On a draft that is already developing it is extra
   rope for a weak model to drift on; on a draft that is looping, a fresh angle is exactly what
   it lacks — so it helps only where the baseline was failing.

## Consequence — reflect conditionally, not always

The battery (unconditional reflection is net-negative) and the churn detector
(`docs/deep-reading-churn-2026-07.md`: the model's reflections repeat at r=0.84 when the draft
churns) point to the same design: **gate the reflection on detected churn.** Reflect when the
draft is looping — where volcanoes shows it rescues the piece — and stay out of the way when it
is developing, where the battery shows it hurts. That is the next build: a churn-gated deep
read in the walk, then this same battery re-run with the gate.

## Honest edges

- Small model (0.5B), greedy, 4 topics — directional, not a tight effect size.
- `meanBound` conflates "drew from the (uncitable) reflection" with "fabricated"; the lexical
  binder cannot tell them apart. A provenance-aware read (`ground/provenance.js` door split)
  would separate them and is the fairer grounding metric for a reflection-wired walk.
- One clean win (volcanoes) is a single case; the gated design needs its own battery to
  confirm the conditional gain holds.

## Update — the fixes flip the sign (2026-07-09)

Two changes turned this net-negative net-**positive**: (1) the reflect prompt was rebuilt to
hand the model the surprise DECOMPOSITION it was starved of — the frame the reading held vs the
arrival it hit, branched on the confirm|strain verdict (`src/surfer/fold/reflect-prompt.js`,
`reflectionInput`); (2) `cleanReflection` gained a restatement guard, so the walk injects a
reflection ONLY when it is a genuine reaction, not an echo of the source. Re-run with a capable
reflect voice (`REFLECT_MODEL=onnx-community/Qwen2.5-1.5B-Instruct`) driving the 0.5B writer:

| arm | mean Δ maxPair ↓ | mean Δ distinctTri ↑ |
|---|---|---|
| free (model-free reflection) | +0.272 (worse) | −0.131 (worse) |
| **voiced (1.5B reactions + guards)** | **−0.129 (better)** | **+0.073 (better)** |

Per topic, the behaviour is self-gating without an explicit gate:
- **clean baseline (dolphins, maxPair 0):** voiced output is BYTE-IDENTICAL to baseline — the
  1.5B's reactions were all caught by the restatement/non-answer guards, nothing injected, no
  harm.
- **churning baseline (volcanoes, maxPair 0.349):** voiced pulls it to **0.092**, distinctness
  0.79 → 0.936 — a real reaction breaks the loop.

So a reflection that (a) is a genuine reaction, produced by a capable voice from the surprise
decomposition, and (b) is injected only when it survives the guards, **helps a churning draft
and no-ops a clean one** — the conditional behaviour every prior finding said it needed, arrived
at through the guards rather than an explicit churn gate. The model-free arm stays net-negative,
so it is the combination (real reaction + reject-unless-genuine) that flips the sign, not the
wiring alone. Caveat: n=2, and the gain is carried by the one churning topic — more churning
sources are needed to size it.
