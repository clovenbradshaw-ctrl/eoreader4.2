# Fold → summary battery — recorded run, 2026-07

The recorded run of `tools/fold-summary-bench.mjs` over the four-register corpus
(`tools/corpus-fetch-summary.mjs`), with a real CPU model in the loop. Pipeline
write-up: `docs/fold-summary-pipeline.md`.

**Setup.** SmolLM2-360M-Instruct (Q8_0 GGUF) behind a llama.cpp OpenAI-compatible
server, greedy decode, driven through the engine's own `openai-local` backend.
Corpus: 14 documents — academic (Einstein, Darwin, the two Wikipedia Armstrong
lives), novels (Moby-Dick, Pride and Prejudice, Metamorphosis), news (four
Wikinews stories), chat (two real `#ubuntu` IRC archives, one synthetic
two-Armstrongs chat). Seed 42. 98 single-document summaries: per document one
`full`, four cursors (head / middle / tail / seeded-random), one entity pivot
(the warmest admitted figure), one topic pivot (the document's own top terms) —
plus the cross-source Armstrong probe in both modes.

## Scoreboard

```
telegram   n=98  fabricated names 0     numbers 0     coverage 0.49  compression 0.02
model      n=98  fabricated names 0     numbers 0     coverage 0.51  compression 0.06
model via: model 59 · telegram-gated 39   (gate caught 39 fabrications)

cross[armstrong] referents kept apart: Louis Daniel Armstrong (3 sources) · Neil Alden Armstrong (4 sources)
  packet collapse rate 0 (0 collapsed of 5 groups)
  telegram attribution errors 0
  sequential  via model           · attribution errors 0 · bare-namesake ambiguity 0
  joint       via telegram-gated  · attribution errors 0 · bare-namesake ambiguity 0
```

The headline: **the raw 360M model added an unlicensed name or number in 39 of 98
conditions (40%). Every one was caught by the referential gate and the telegram
floor shipped instead, so the delivered fabrication count is 0 — by construction,
not by luck.** Where the model's output was clean (59/98) it shipped, and those
summaries carry slightly better figure coverage than the floor (0.51 vs 0.49)
at three times the floor's length — real prose instead of telegram clauses.

Per register (gate catch rate = how often the raw model fabricated):

| register | n | gated | tele coverage | clean-model coverage |
|---|---|---|---|---|
| academic | 28 | 50% | 0.45 | 0.43 |
| novel | 21 | 48% | 0.47 | 0.54 |
| news | 28 | 29% | 0.47 | 0.52 |
| chat | 21 | 33% | 0.60 | 0.63 |

A 360M model fabricates hardest on academic and literary prose and least on news
— the register where summary style most resembles its instruction tuning.

## What the gate actually caught

Three shapes, from the catch log:

- **True-but-unlicensed world knowledge.** On the *Origin of Species* excerpt the
  model wrote "…published in 1859 by **Charles Darwin** and **Alfred Russel**
  Wallace…" — correct in the world, but the excerpt (and its packet) never names
  its author. The gate is a *licensing* gate, not a truth gate: nothing ships
  that the record can't witness, which is the engine's own doctrine applied to
  summaries. Same shape: "**Galilean**" on the Einstein excerpt.
- **Wrong-referent risk.** Names imported from the model's priors that happen to
  be near the topic — exactly the class that becomes an Armstrong collapse when
  namesakes are in play.
- **Prompt echo.** "Theme: system which body **Passages**: …" — the model
  parroting the ask's scaffold; the capitalized scaffold token fails the license
  and the whole echo dies.

## The cross-source Armstrong probe

Packet level: five referent groups — Louis Daniel Armstrong (3 sources: his
Wikipedia life, the Anita O'Day obituary, the two-Armstrongs chat), Neil Alden
Armstrong (4 sources), Janet, Lucille, and the fathers kept as their own
referents. **Collapse rate 0**; the reconstructed label-keyed bug (the PR #196
failure, kept as the tests' negative control) measures 1 collapsed group, so the
metric is proven able to fail.

Sequential mode (the discipline), verbatim, via model:

> Louis Armstrong, a renowned American jazz and blues trumpeter and vocalist,
> was born in New Orleans. He received numerous accolades, including the Grammy
> Award for Best Male Vocal Performance, and was known for his performances with
> notable artists like Louis Armstrong, Dinah Washington, Thelonious Monk,
> George Shearling, and others. Neil Armstrong, the American astronaut and
> aeronautical engineer who became the first person to walk on the Moon in 1969,
> was born in Wapakoneta, Ohio. He joined NASA's Astronaut Corps in 1962 and
> later served as the commander of Apollo 11's historic lunar landing mission.

Louis keeps the trumpet, Neil keeps the Moon; 0 attribution errors. (The "with
notable artists like Louis Armstrong" clause is Anita O'Day's sentence bent
around its subject — every name is licensed by Louis's own packet, so this is a
within-referent misreading, outside the gate's jurisdiction; noted under
limitations.)

Joint mode (the hard condition): in the development run the model handed Louis
the Moon landing outright — *"…his most famous achievement is becoming the first
person to walk on the Moon during the Apollo 11 mission"* — and
`summaryAttributionErrors` caught it through the pronoun (`apollo` charged to
Louis Daniel Armstrong, belongs to Neil Alden Armstrong). In the recorded seeded
run the joint decode was gated for an unlicensed addition, so the referent-safe
floor shipped. Either way the delivered joint output carried 0 attribution
errors; the sequential mode is the default because it removes the failure by
construction rather than by detection.

## Honest limitations

- **Bare-surname routing in a both-Armstrongs source.** A chat that discusses
  both men routes its bare "Armstrong" mentions wholesale to the source's
  earliest-introduced full bearer (the `entity-merge.js` policy). Per-mention
  routing is future work; the attribution metric exists to expose what the
  policy costs.
- **Within-referent misreading.** The gate licenses record-carried names; how the
  model arranges them inside one referent's summary is still the model's. The
  floor never has this problem; the model voice buys fluency at that risk.
- **Coverage is a proxy** (last-token stem match over the packet's top figures),
  not a judged metric. The topline's judged batteries are the pattern to extend
  here if a judge model is available.

## Reproduce

```
node tools/corpus-fetch-summary.mjs
python -m llama_cpp.server --model smollm2-360m-instruct-q8_0.gguf --port 8080 --n_ctx 4096
node tools/fold-summary-bench.mjs --base http://localhost:8080/v1 --seed 42 \
  --json results.json --report report.md
```

Model-free (`node tools/fold-summary-bench.mjs`) runs the same 98 conditions on
the telegram floor alone: fabrications 0, collapse 0, attribution errors 0.
