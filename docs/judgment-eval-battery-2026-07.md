# The judgment scoreboard — scoring DEFs as DEFs (2026-07-13)

"The Work, v2" #1: the instrument between the substrate (§0, the judgment log) and the
judges it will re-judge (#2 binding, #3 reference, #4 void). It scores whether the DEFs a
turn mints are *well-formed judgments* — grain-matched, witness-carrying, correctly
INDETERMINATE when the witness is lacking, and stable under further reading — never whether
the prose was fluent, and never verdict-vs-frozen-gold: a gold verdict here may be
"indeterminate is correct," so correct suspension scores as correct and confident guessing
against it is the counted failure.

Harness: `tools/judgment-battery.mjs` over `tests/fixtures/judgment-specimens.js`, driving
`src/metabolism/defharness.js` → the real `runTurn` pipeline, offline (scripted stub talker,
hash embedder), twice per specimen — a partial parse then the full corpus. Scorer:
`src/metabolism/defscore.js`. Falsifiers: `tests/judgment-eval.test.js`.

## The metrics (canonical)

- `confident(v) := v ≠ indeterminate` — the four typed commitments.
- Per gold row (projected verdict `p`, accept set `A`):
  `correct ⇔ p ∈ A`; `underconfident ⇔ p = indeterminate ∧ indeterminate ∉ A`;
  otherwise `confident-wrong`. A gold whose subject was judged only at another grain is
  `wrong-grain`; one no DEF matched is `unjudged` — both are shape gaps, reported beside,
  never mixed into the rates.
- **Headline 1 — CWR(grain) = confidentWrong / (correct + confidentWrong + underconfident).**
  Underconfidence is reported and never penalized: underconfident-and-wrong routes to VOID;
  confident-and-wrong ships a bad citation.
- **Headline 2 — overturnRate = overturned / committed**, where a transition between the
  partial and full reads is classed by verdict polarity (`corroborated +1`;
  `contradicted / unsupported / off_diagonal −1`; `indeterminate 0`):
  `stable` (same verdict) · `strengthened` (0→±1, the transition a well-shaped DEF is built
  for) · `retreated` (±1→0) · `drifted` (same sign, different verdict) · `overturned`
  (polarity flip — including `unsupported→corroborated`: a confident negative on a half-read
  source was a premature commitment; the correct partial verdict was suspension).
  `committed` counts subjects the partial read typed confidently and the full read still
  holds; subjects only in one read are `emergent` / `dropped`, counted, not classified.
- **Shape** (over `all()`, not the projection): malformed DEFs (`no-witness` — the oracle
  trap; unknown verdict/grain) and anonymous (`of == null`) events.
- The merge (`mergeRuns`) replays partial-then-full onto one log through `judge()`/`revise()`
  — the substrate's revision rail exercised end-to-end; the merged projection must equal the
  full read's, every revised subject chained by `revises`.

The witness-audit oracle (`src/metabolism/def-oracle.js`) covers the one axis a deterministic
check cannot — does the witness *earn* the verdict over the whole source — and is a HARD
ORACLE holding the full document: legitimate for eval, forbidden in the live path. It is
keyless and dry-run by default (requests form; nothing sends without an injected transport;
budget enforced before spending). The battery CLI can never arm it.

Why deterministic-first: `tools/evalkit/LOCAL-RUN-FINDINGS.md` — deterministic assertions
agreed with hand labels 19/20 (95%); a local 7B LLM judge 20/39 (51%), and 17 of its 19
disagreements were invented failures.

## The specimens

| id | what it pins | gold | ratchet |
|---|---|---|---|
| `dolphins-unsupported-predicate` | on-topic words, unsupported predicate (the binder regression, pinned in `tests/bind-referent.test.js`) | pods claim ∈ {unsupported, indeterminate}; size claim corroborated | **true** |
| `entailed-paraphrase` | an entailed paraphrase naming the source's figures must cite | claim corroborated | **true** (clean today via honest suspension — see findings) |
| `elvis-referent-diffuse` | two recorded senses, undiscriminating question — suspension is correct | referent* indeterminate; the "1954" claim indeterminate | false — **#3's target** |
| `two-bushes` | short name fitting two incomparable fuller names — abstain, never the loudest | referent* indeterminate | **true** |
| `unstated-evaluation` | the corpus describes, never ranks — "best" is unsupported and the missing ranking is an absence | "best" claim ∈ {unsupported, indeterminate}; field* unsupported | false — **#2's and #4's target** |
| `not-in-corpus` | a figure the corpus never mentions | field* unsupported | **true** |

`ratchet: true` = zero confident-wrong, zero wrong-grain/unjudged, zero malformed **today**
— the regression floor, enforced by `tests/judgment-eval.test.js` on every run. Do not flip
a bit without a battery run proving it.

## First run — the recorded baseline (2026-07-13, `node tools/judgment-battery.mjs`)

```
grain          judged  correct  conf-wrong  underconf  CWR     unjudged  wrong-grain
claim               5        2           2          1     0.4         0            0
referent            2        2           0          0       0         0            0
field               1        1           0          0       0         1            0
overall             8        5           2          1    0.25         1            0

stability: 11 stable · 1 strengthened · 1 retreated · 0 drifted · 0 OVERTURNED (rate 0)
           · 3 emergent · 4 dropped
shape:     18 DEFs · 0 malformed · 0 anonymous
```

Deterministic: two `--json` runs byte-identical.

### What the baseline says (the targets, by work item)

1. **`elvis-referent-diffuse` — claim CWR 0.5 (#3, and #2's grammar).** The reference judge
   already suspends (`referent:* → indeterminate`, the honest abstention §0 predicted), but
   the binder then corroborates *"Elvis recorded his first single in 1954"* against the
   Presley sentence anyway — the diffusion leaks at the output grain even when the input
   grain abstained. Retyped reference (#3) must carry the suspension into what the binder
   may be born from.
2. **`unstated-evaluation` — claim CWR 1 (#2) and the field gap (#4).** *"The bottlenose is
   the best dolphin"* cites CORROBORATED off the shared discriminating figure while no span
   ranks anything — overlap standing in for "says", the exact cut #2 retypes. And no field
   DEF measures the missing ranking: the absence of an evaluation is invisible to the
   three-clause void measure — #4's evaluation void, `unjudged` on record.
3. **`entailed-paraphrase` — underconfident, not wrong.** On a real parsed doc the referent
   reading does NOT rescue the paraphrase (it does on the hand-built fixture doc in
   `bind-referent.test.js`) — the claim rides INDETERMINATE. Honest suspension, so the
   specimen ratchets, but the row is #2's rescue-direction target: after typed binding the
   entailed paraphrase should read `corroborated`.
4. **The refusal path mints no DEF of absence.** Gate-terminated turns (`unanswerable`)
   refuse in prose without logging a field DEF (`not-in-corpus` only fires `answerVoid` on
   the larger corpus; `unstated-evaluation` never does). Where the turn *acts on* an absence
   it should *log* the absence — #4's seam.

## Honest edges

- **Predication is thin.** The harness runs without a classifier, so the geometric fact-check
  degrades to `indeterminate` and no predication-grain golds can be authored yet; the column
  waits on #2 (which types predication mechanically) or a classifier-armed harness.
- Specimen corpora are tuned empirically (the diffuse gate, the void's null measurement, and
  the answerability floor all have thresholds); `--specimen <id>` + `--json` is the tuning
  loop. A leading capitalized interrogative ("Which…") reads as an unresolvable named
  referent and gates the turn — question phrasing matters.
- The two-parse comparison holds only for subjects both parses judge; gate-terminated full
  runs drop the partial's claim subjects (`two-bushes`: 4 dropped/emergent). Reported, not
  hidden.
- The stability read is two points (partial, full), not a curve; `mergeRuns` gives the
  revise-chain the scoreboard needs, but a multi-hop reading would need more cuts.
