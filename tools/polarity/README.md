# tools/polarity — the negation-axis canon (offline QA)

A rigorously-built, cross-lingual **polarity (negation) axis** and its validation
harness. This is an **offline analysis tool** — it needs Python + sentence-
transformers and is *not* run in the browser.

```
pip install sentence-transformers numpy scikit-learn
python3 tools/polarity/polarity_axis.py --model intfloat/multilingual-e5-small
```

## What it measures — and what it does NOT

`polarity_axis.py` fits a direction that separates an **affirmative** proposition
from its **negation** (`d = mean(emb(neg) − emb(aff))` over 288 content-matched
pairs across 12 syntactic frames and 24 languages). The pairing cancels topic,
register, and length, so the axis isolates *polarity*.

Its own confound controls (`hard_cases.jsonl`, categories `valence_confound`,
`length_confound`, `antonym_not_negation`) exist to **prove the axis is negation,
not sentiment**: `HC47` ("neg polarity, positive sentiment") must score negative,
or "your axis is a valence detector wearing a costume."

## Why the runtime measure does NOT use this axis directly

`src/enactor/ground/validate.js` weighs whether the reader **approves or
disapproves** of its own draft — an *approval / valence* judgment, which is the
very thing this axis is engineered to exclude. Used as-is it would read
"This answer is a fabrication" (affirmative polarity, strong disapproval) as
*positive*.

So the runtime borrows the **method, not this axis**: `validate.js` builds a
difference-in-means **approval axis** (good-answer ↔ bad-answer, content-matched)
from the *live* MiniLM organ (an e5 direction vector would not align with the
browser embedder anyway). This canon + harness stay here as:

- a worked reference for the diff-in-means construction and its validation
  discipline (hold-out frame, hold-out language, confound controls);
- the seed for a genuinely multilingual measure if the runtime embedder ever
  goes multilingual;
- `response_particles.csv` — the cross-lingual yes/no/contradiction table behind
  the English answer-particle prior in `valenceAtoms` (note the truth-based
  ja/ko inversion a naive flip-rule gets wrong).

## Files

| file | what |
|---|---|
| `canon_pairs.jsonl` / `.csv` | 288 affirmative/negative pairs, frame- and language-tagged, confidence-graded |
| `hard_cases.jsonl` | 50 confound/edge cases (antonyms, litotes, negative concord, answer particles, …) |
| `response_particles.csv` | yes / no / contradiction particle + answer system across 50 languages |
| `polarity_axis.py` | fit the axis and try hard to prove it is NOT a length/sentiment detector |
| `build_canon.py` | regenerate the canon from the frame × language templates |
