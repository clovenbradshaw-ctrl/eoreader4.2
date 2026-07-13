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
| `elvis-referent-diffuse` | two recorded senses, undiscriminating question — suspension is correct | referent* indeterminate | **true** — converted by #3 (see update below) |
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

## Update — typed reference lands (#3, same day)

`turn/reference.js` retyped the input side of the cut: per-mention sense DEFs
(`referent:mention:<term>`, minted at retrieve, model-free over the recorded entity graph —
`senseBasins` + hint discrimination + the name-variants ambiguous-short-form guard), the
resolved-ambiguous mention arming retrieval's topic damping, the fold's grounded evidence
REVISING the mention DEF on the log (`reviseMentionsWithEvidence` — the revision rail's first
live call site: confirmed / diverted / settled, as counter-DEFs), and the answerable
disposition replacing the blanket `referent-diffuse` refusal with the mention's own ASK
(`referent-ambiguous-ask`, `refuses: false`) whenever the fold diffused over a recorded
collision. The flat-field decline survives only as the no-collision fallback.

Post-#3 battery:

```
grain          judged  correct  conf-wrong  underconf  CWR     unjudged  wrong-grain
claim               4        2           1          1    0.25         0            0
referent            2        2           0          0       0         0            0
field               1        1           0          0       0         1            0
overall             7        5           1          1   0.143         1            0
stability: 0 OVERTURNED · shape: 0 malformed
```

- **`elvis-referent-diffuse` converted and ratcheted** (CWR 0.5 → 0): the turn now asks
  *"Which elvis do you mean — Elvis Presley (sun) or Elvis Costello (london)?"* instead of
  binding the ambiguous claim to the Presley sentence. No claim ships while the subject is
  unresolved — asked, not guessed. The old claim gold ("1954" → indeterminate) is retired
  with the leak it recorded; `tests/typed-reference.test.js` pins the ask.
- **`two-bushes` asks too** — the same disposition replaced its refusal-shaped decline; the
  ambiguous-short-form guard (name-variants law over basins) keeps a hint that lands on the
  held short form from counting as a resolution.
- Remaining on the board, unchanged: `unstated-evaluation`'s confident-wrong claim (#2) and
  its missing evaluation-void DEF (#4) — the claim column's CWR 0.25 is now entirely #2's.

## Update — typed binding lands (#2, same day)

`enactor/ground/predication.js` retyped the output side: a claim that TYPES (a resolved SVO
predication via `enactor/props.js`, or a copular evaluation the authored `EVAL_LEXICON`
recognizes) is judged over the PREDICATION — DEF-support (the span predicates the asserted
value of the asserted subject; kin values entail through the `typeOf` primitive projection,
so "sister" grounds "siblings" on nearly zero shared tokens), CON-support (resolved
endpoints, either orientation for a symmetric primitive, and a span predicate AT LEAST as
strong per the authored `PREDICATE_STRENGTH` order), EVA-support (a span judgment entailing
the asserted evaluation by polarity and degree). The tables' silence is INDETERMINATE —
uncited, never guessed. Untypeable claims keep the lexical floor byte-identical
(`opts.typed`, inert without a resolving admission); `score` stays the lexical amplitude.
The binder now SEEDS the `predication:<sentence>` DEF and the fact-checker's later verdict
lands as a REVISION on the same chain (`recordCorrespondenceDefs` revise-if-prior).

Post-#2 battery: **CWR 0.0 at every grain** —

```
grain          judged  correct  conf-wrong  underconf  CWR     unjudged  wrong-grain
claim               4        3           0          1       0         0            0
referent            2        2           0          0       0         0            0
field               1        1           0          0       0         1            0
overall             7        6           0          1       0         1            0
```

- **`unstated-evaluation`'s claim converts** (CWR 1 → 0): "The bottlenose is the best
  dolphin" types EVA, no span ranks the subject → uncited UNSUPPORTED, instead of citing
  CORROBORATED off the shared discriminating figure. `tests/typed-binding.test.js` pins the
  conversion, the actually-ranked positive case, both strength directions plus the silent
  residue, the witness replay, and the bind→factcheck revise chain.
- The one row still open on the whole battery is the FIELD gap: no DEF measures the missing
  ranking. That is item #4 (typed void) — the specimen ratchets when it lands.
- `entailed-paraphrase` stays underconfident (reported, not penalized): its claim ("These
  species also include…") parses to no proposition, so it rides the lexical floor — the
  aligner's honest reach limit; parseRelations recall over model prose is the ceiling,
  recorded here rather than papered over.
- One classifier note: the ask disposition sits ABOVE the answerable stage's
  meta-conversational exemption, because it requires a *recorded sense collision* — a
  genuinely conversational meta turn names none, while "What did Elvis record first?"
  false-positives the meta basis and still deserves the ask.

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
