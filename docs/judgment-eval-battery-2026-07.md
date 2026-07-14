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
| `elvis-referent-diffuse` | two recorded senses, undiscriminating question — suspension is correct | referent* indeterminate; the "1954" claim indeterminate | **true** (#3/#2 converted) |
| `two-bushes` | short name fitting two incomparable fuller names — abstain, never the loudest | referent* indeterminate | **true** |
| `unstated-evaluation` | the corpus describes, never ranks — "best" is unsupported and the missing ranking is an absence | "best" claim ∈ {unsupported, indeterminate}; field* unsupported | false — **#4's target** (#2 converted) |
| `not-in-corpus` | a figure the corpus never mentions | field* unsupported | **true** |

`ratchet: true` = zero confident-wrong, zero wrong-grain/unjudged, zero malformed **today**
— the regression floor, enforced by `tests/judgment-eval.test.js` on every run. Do not flip
a bit without a battery run proving it.

## The recorded baseline (2026-07-14, `node tools/judgment-battery.mjs`)

```
grain          judged  correct  conf-wrong  underconf  CWR     unjudged  wrong-grain
claim               5        4           0          1       0         0            0
referent            2        2           0          0       0         0            0
field               1        1           0          0       0         1            0
overall             8        7           0          1       0         1            0

stability: 15 stable · 1 strengthened · 1 retreated · 0 drifted · 0 OVERTURNED (rate 0)
           · 3 emergent · 2 dropped
cuts:      5 graded · 4 correct · 0 MISMATCH · 1 absent · 0 ruled-out-missing (accuracy 0.8)
shape:     22 DEFs · 0 malformed · 0 B1-violations · 0 anonymous
```

Deterministic: two `--json` runs byte-identical.

The **first run** (2026-07-13) recorded **2 confident-wrong at claim grain** (claim CWR 0.4,
overall 0.25) — the Elvis "1954" bind and the "best" bind. v3 #2/#3 converted both to a located
INDETERMINATE, so the claim grain now reads **0 confident-wrong** (see below). The cut census and
the B1-violation count did not exist at the first run; both are recorded here.

### What the baseline says (converted, and the open targets)

**Converted since the first run (v3 #2/#3) — the two confident-wrongs are gone:**

1. **`elvis-referent-diffuse` — claim CWR 0.5 → 0 (#3).** The reference judge suspends
   (`referent:* → indeterminate`), and the binding now carries that suspension into its own
   witness: the argument cut cannot ground out on the unresolved "Elvis", so *"Elvis recorded his
   first single in 1954"* folds to a **located INDETERMINATE** — the diffusion no longer leaks at
   the output grain. The corpus does witness the relation, so the suspension sits at the argument
   cut, not the predicate (the located `reference-void`, §5).
2. **`unstated-evaluation` claim — CWR 1 → 0 (#2).** *"The bottlenose is the best dolphin"* no
   longer cites CORROBORATED off the shared figure: its predicate cut cannot establish
   same-or-stronger against a corpus that never ranks, so the binding is **HELD** (INDETERMINATE).
   Overlap no longer stands in for "says" — the exact cut #2 retyped.

**Still open:**

3. **`unstated-evaluation` field void — `unjudged` (#4).** The claim is handled, but no field DEF
   measures the *missing ranking*. `recordVoidDef` types an `unstated-relation` void distinctly, but
   the void measure does not fire on a describes-but-never-ranks corpus, so the absence is acted-on
   yet not logged. This is why the specimen stays un-ratcheted.
4. **`entailed-paraphrase` — underconfident, not wrong (#2's rescue direction).** On a real parsed
   doc the referent reading does NOT rescue the paraphrase (it does on the hand-built fixture doc in
   `bind-referent.test.js`) — the claim rides INDETERMINATE. Honest suspension, so the specimen
   ratchets, but the rescue is unbuilt: after typed binding the entailed paraphrase should read
   `corroborated`.
5. **The refusal path mints no DEF of absence (#4).** Gate-terminated turns (`unanswerable`) refuse
   in prose without logging a field DEF (`not-in-corpus` only fires `answerVoid` on the larger
   corpus; `unstated-evaluation` never does). Where the turn *acts on* an absence it should *log*
   the absence — #4's seam.

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
