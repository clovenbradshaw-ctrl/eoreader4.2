# eoreader 4.2 — The Fold
### A specification for mechanical, multilingual, glass-box generation and prediction

> Version 0.1 (proposal).
> Canon: the EO operator algebra as implemented in eoreader4.1 `core/operators.js`,
> `core/faces.js`, `core/cube.js`; the walk in `longgen/walk.js`; the flow/prior
> steering system; the EO wiki at experientialontology.org.
> External canon: Grambank, WALS, Universal Dependencies (UD), UniMorph, Apertium,
> Concepticon, CLDF/CLLD, ICU4X/CLDR.

> This document specifies a generation path that produces sentences by *derivation
> and verification* rather than by *sampling*. It is domain-invariant and
> language-invariant by construction; where a stage is language-specific, the
> language enters as a parameter, never as a hard-coded assumption.

---

## §0 — What this replaces and why

The LLM fuses two jobs that classical NLG keeps apart: **content** (what to say)
and **realization** (how to say it). Fused, the step is a single stochastic sample
with no ledger — nothing to check a produced sentence against, which is precisely
Frankfurt's bullshitter: indifferent to truth because it holds no representation of
the truth to be indifferent to.

The fold un-fuses them. Content stays in the EO event graph — provenance-bearing,
language-independent. Realization becomes a **deterministic function parameterized
by typology**: UniMorph supplies inflection, Grambank/WALS supply word order and
agreement and definiteness strategy, Apertium supplies runnable morphology,
CLDR/ICU4X supplies orthography. None of that is a guessing problem; it is a lookup
problem with a documented answer per language.

Prediction is not eliminated. It is **demoted**. In the LLM, prediction is the
generator and everything is prediction, so nothing is guaranteed. Here the rule
stack *enumerates the licensed space* and prediction only *navigates within it*.
A predictor can never propose something ungrammatical or unfaithful, because the
grammar does not license it and EVA (§6) rejects it. Prediction therefore becomes
safe: whatever ranks it — an n-gram model, a Markov walk over events, a learned
scorer, eventually even a small LM — can only choose among faithful, grammatical
options. *You propose; the kernel disposes* (Appendix D of the coder reference),
now applied to the predictor rather than to the coder.

The wager: for any language with both a generator and a round-trippable analyzer,
wooden-and-provably-faithful beats fluent-and-unaccountable. Canonical word order is
a feature in a verification-first engine, not a defect.

---

## §1 — Scope: the round-trippable set, not "English"

The fold is language-invariant. What varies is **resource coverage**, and the
binding unit is not a language but a *pairing*:

> A language L is **in scope** iff eoreader holds, for L, both
> (a) a **generator** — a typological parameter vector, a morphological
>     realizer, and a domain lexicon — and
> (b) an **analyzer** — a parser able to recover the EO event graph from an
>     L-surface string well enough for EVA to close.

Generation and analysis are a matched pair. A generator without an analyzer is
generation without the guarantee — the bullshitter again. Usually the **analyzer is
the tighter bound**. The convenience: a solid UD treebank supplies *both* — training
signal for the parser and morphosyntactic pattern evidence for the generator. A
language with a good UD treebank is a language you can round-trip.

**Tiers.**

- **Tier 0 (full fold today):** dense UD + UniMorph + Grambank coverage and a
  buildable domain lexicon. ~40–80 languages: English, Finnish, Turkish, Russian,
  Czech, Hungarian, Korean, Arabic, Hindi, Spanish, German, Basque, and the rest of
  the well-resourced set. Morphological richness is not an obstacle here — it is
  where UniMorph and Apertium earn their keep.
- **Tier 1 (generator, weak analyzer):** Grambank parameters and some UniMorph, but
  no round-trippable parser. Can generate; **cannot certify**. Output is marked
  *uncertified* and never published as verified.
- **Tier 2 (out of reach for everyone):** under-described long tail, no reference
  grammar. The fold **refuses** — a `no_cov` parameter or an EVA that will not close.
  Refusal, not fabrication, is the correct failure and the whole point: the engine
  is honest exactly where the LLM is most reckless.

The multilingual case is where the moat is deepest, not where the method is weakest:
the value ("faithful, sourced, round-trip-verified") is worth most in low-resource
settings where an LLM hallucinates with nothing to catch it. EO's own universalist
claims — the empty desert cell across 41 languages, the grain-coherence guard
asserted cross-linguistically — already commit the framework to a language-invariant
semantic layer. Restricting the fold to English would quietly contradict them.

---

## §2 — Architecture: the two-sided pipeline

The fold is one direction of a loop. The loop is the guarantee.

```
                        the Message (EO event graph)
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │  FORWARD FOLD  (SYN)                                 │
        │  feature projection → lexicalization →               │
        │  morphological realization → linearization           │
        └──────────────────────────┬──────────────────────────┘
                                   │  candidate surface string(s)
                                   ▼
        ┌───────────────────────────────────────────────────────┐
        │  REVERSE FOLD  (EVA)                                   │
        │  parse L-surface → recover EO event graph → isomorphism│
        │  test against the Message                             │
        └──────────────────────────┬──────────────────────────┘
                                   │
                    pass ──────────┴────────── fail
                     │                           │
             emit + certificate           REC: revise prior /
                                           lexeme / feature; re-fold
```

Two operators bracket the whole: **SYN** produces the string (parts → emergent
whole — this is the fold proper), **EVA** tests it against its source. When EVA
fails, **REC** restructures and the loop re-enters. This is the Significance triad
(DEF the realization, EVA the round-trip, REC the repair) applied to the act of
speaking — the same loop the substrate already runs on every assembly.

Prediction (§7) sits *inside* the forward fold, choosing among the branches the
grammar licenses; EVA sits *after* it, filtering what prediction chose.

---

## §3 — The interlingua: the Message

The input to the fold is a **Message**: a subgraph of the EO event graph selected
for expression. It is language-independent by construction — the same object folds
into any in-scope language.

A Message node is an EO event in canonical notation, `operator(Site, Stance)`, with
predicate-argument structure and a feature bundle attached:

```
message.m-0001 : event
message.m-0001.op        = CON                       # bond
message.m-0001.site      = Link                       # a specific connection
message.m-0001.stance    = Binding                    # held in relation
message.m-0001.predicate = concept:contracts_with     # a Concepticon / lexicon key
message.m-0001.arg.agent  -> entity:ndp               # Nashville Downtown Partnership
message.m-0001.arg.theme  -> entity:civicity
message.m-0001.features  = { tense: PST, aspect: PFV, polarity: POS, modality: DECL }
message.m-0001.src       = claim:c-0447               # provenance; NPJ claim-src
!EVA message.m-0001                                   # coherence guard: faces agree on grain
```

Three things the Message already carries that a typological realizer wants:

1. **Referent grain** from **Site**. Entity → specific referent (drives
   definiteness, pronominalization eligibility); Kind → generic/type (drives generic
   number, bare/definite-generic strategy per language).
2. **Aktionsart** from **Stance**. Making / Binding / Tracing carry the
   event-structure flavor that feeds tense–aspect realization.
3. **Provenance** from **src**. Every node points at the claim that licenses it.
   The fold never realizes a node without a source; an unsourced node is a content
   error, caught before the fold runs.

The **feature bundle** uses the UniMorph schema as its vocabulary (212 features
across 23 dimensions: tense, aspect, mood, case, person, number, gender,
evidentiality, definiteness, polarity, …). It is deliberately the *maximal*
language-independent set. Which of these features must surface, may surface, or
cannot surface is decided per language in §5, not here. The Message over-specifies;
the target language projects down.

The coherence guard (`!EVA` above) runs on every Message node before folding:
the three faces (op, Site, stance) must agree on grain (Ground / Figure / Pattern),
and the desert cell (SYN-at-Ground) is forbidden. A grain-mixed Message is rejected
without ever reaching the fold. The fold only ever receives coherent content.

---

## §4 — The data layer: resources as contracted rooms

Every external resource enters as an append-only, signed, CLDF-backed **room** with
a Kind-terrain schema. CLDF is the common container so the whole stack has one
parsing story; Glottolog codes are the join key across rooms.

| room | resource | terrain read | what it answers |
|---|---|---|---|
| `typology` | Grambank + WALS | Kind | L's parameter vector: word order, adposition order, adj–N order, agreement, definiteness strategy, case presence, gender |
| `paradigms` | UniMorph | Kind | (lemma, feature-bundle) → surface form, as tables |
| `fst` | Apertium (+ HFST/Foma) | Kind | runnable morphological generation for productive/nonconcatenative morphology |
| `treebank` | Universal Dependencies | Kind | parser training + construction patterns for L; the analyzer's ground truth |
| `lexicon` | Concepticon + PanLex + domain lexicon | Kind | concept-key → L-lexeme (the semantic anchor; see §11) |
| `locale` | CLDR via ICU4X (WASM) | Kind | number, date, list, capitalization, punctuation conventions |

Resource-room contract (uniform):

```
typology : room
typology.contract.ops      = INS, DEF, REC          # append data; define schema; migrate on new release
typology.contract.terrains = Kind                   # types and parameters, never Entity edits
typology.contract.stances  = Making, Binding, Tracing
typology.schema : kind
typology.schema.glottocode = "text"
typology.schema.feature    = "text"                  # e.g. GB024 numeral-noun order
typology.schema.value      = "choice"                # 0 | 1 | ? | multistate
typology.schema.source     = "text"                  # coder / grammar page — provenance preserved
!EVA typology
```

Two data-hygiene rules, both consequences of §1's honesty commitment:

- **`?` and `no_cov` are first-class.** A missing or unknown parameter is not
  defaulted silently. It either has a hand-authored override (Tier 0) or it forces
  refusal (Tier 2). Silent defaulting is how a realizer fabricates.
- **Disagreement is surfaced, not resolved.** WALS and Grambank agree only ~69% on
  shared features. Where they conflict for L, the parameter is flagged and the
  hand-authored override is required before L is admitted to Tier 0.

---

## §5 — The forward fold (SYN): realization, helix-ordered

The fold is a single helix run. Each stage is a contracted component; each closes
with its own checkpoint (watchmaker discipline — an interruption costs one stage,
not the sentence).

**Stage 1 — SIG · feature salience.** Read `typology` for L. For each Message
feature, classify it as *obligatory* (L must mark it — e.g. an evidential language
forces an evidentiality value the English source left implicit), *optional*, or
*inexpressible* (drop, and log the drop as a fidelity note). Output: a per-node
feature bundle projected to L's expressible set.
`SIG(Kind, Dissecting)` — attend, cut the bundle to what L admits.
`!EVA` — every obligatory feature has a value or the node is escalated, never guessed.

**Stage 2 — INS · lexicalization.** Map each `predicate` and entity concept-key to
an L-lexeme via `lexicon`. Named entities pass through; relational/predicate
concepts resolve against the domain lexicon first, Concepticon/PanLex second. This is
where semantic accuracy is anchored — the lexeme carries the concept, the concept
carries the claim's provenance.
`INS(Entity, Making)` — mint word-tokens with identity.
`!EVA` — every node has a lexeme, or the node is a **lexical gap** (§11): refuse or
escalate, never approximate.

**Stage 3 — SEG · constituency.** Draw phrase boundaries from predicate-argument
structure: NP spans for arguments, VP/clause span for the predicate. Purely
structural; no L-specifics yet.
`!SEG` — the constituent boundaries. `!EVA`.

**Stage 4 — CON · morphology + agreement.** For each lexeme + its projected feature
bundle, produce the inflected form: `paradigms` lookup first, `fst` (Apertium)
fallback for productive or nonconcatenative morphology the tables don't cover. Bond
agreement links (subject–verb, adj–N, case government) per L's Grambank agreement
parameters.
`CON(Link, Binding)` — hold the words in grammatical relation.
`!EVA` — every required form exists (a paradigm miss with no FST fallback is a
refusal, not a bare stem).

**Stage 5 — SYN · linearization (the fold proper).** Order the bonded constituents
by L's word-order parameters (S/O/V order, adposition order, adj–N order, all from
`typology`); insert function words (articles, adpositions, auxiliaries, copulas) by
L's strategy; apply clitic placement. This is the projection from graph to sequence.
`SYN(Figure, Composing)` — parts into the emergent linear whole.
Forbidden: `SYN(Ground, …)` — the desert cell. The kernel rejects any attempt.

**Stage 6 — DEF · orthography.** Format numbers, dates, lists, capitalization, and
punctuation via `locale` (ICU4X/CLDR). Assert the surface string.
`DEF(Lens, Making)` — this string is the realization of this Message.

The forward fold emits not one string but a **candidate set** — wherever a stage had
more than one licensed option (a lexeme synonym, an optional feature, a permitted
word-order variant, a pronoun-vs-full-NP choice). Choosing among them is §7's job;
the fold's job is to guarantee every candidate is grammatical and complete.

---

## §6 — EVA: the reverse fold and the certificate

For each candidate string s produced for Message M:

1. **Parse** s with L's analyzer (UD-trained parser + the EO ingester) to recover an
   event graph M'.
2. **Normalize** M and M' to the interlingua: strip surface-only material
   (agreement morphology that carried no propositional content, function words), lift
   both to `operator(Site, Stance)` + predicate-argument + semantic features.
3. **Isomorphism test.** M ≅ M' iff there is a bijection on nodes preserving
   operator, Site grain, predicate concept-key, argument roles, and the *semantic*
   (not surface) feature values.

**Acceptance:** s is certified iff M ≅ M'. A certified sentence ships with a
**certificate**: `{ Message M, source claims src(M), candidate s, parse M', witness
of M ≅ M' }`. That certificate is the anti-bullshit artifact — the reader gets not
a sentence but a *proof that the sentence faithfully realizes a sourced claim*. No
sample can carry it.

**Rejection** routes to REC (§7): the failure is typed (wrong lexeme sense, dropped
obligatory feature, word order that induced a misparse, scope error) and the type
tells the predictor what to change. A rejection is information scoped to one node,
not a catastrophe.

Round-trip is **defeasible by design.** Gelfond–Schneider makes the Pattern
coordinate (2^√2) unreachable by finite process, so no finite pipeline certifies a
sentence as *finally* true — only as *faithful to its Message under the current
frame*. EVA certifies fidelity, never omniscience. Every certificate remains REC-able
if the Message's frame is later revised. This is a feature: it is exactly the
property the LLM lacks and pretends it doesn't need.

---

## §7 — Prediction: the walk, the flow/prior, the learning loop

Prediction operates at two grains, both *inside* the licensed space, both auditable.

### 7.1 Content prediction — the walk over Messages

Which Message node to realize next, given what has been said. This is discourse
planning as a predictive walk over the event graph (`longgen/walk.js`). Candidates
are the graph-adjacent unrealized nodes; the walk is a search (beam) scored by a
**flow/prior** over:

- **salience** — provenance strength of `src`, centrality in the claim graph;
- **given/new** — nodes sharing referents with realized material cohere better;
- **rhetorical fit** — the transition type (elaboration, contrast, cause) the walk
  is currently in.

### 7.2 Surface prediction — choice within the fold

Among the candidate strings §5 emitted for one Message, which to prefer. Candidates
are already grammatical and complete (the fold guaranteed it) and already filtered by
EVA (§6 killed the unfaithful ones). The predictor ranks the survivors by a fluency
prior — n-gram / small-LM likelihood, register match, given/new realization (pronoun
vs full NP). **Because the space is pre-licensed and post-filtered, the ranker cannot
introduce error.** It is safe to make it as sophisticated as you like, up to and
including a small LM, without reintroducing the bullshitter: anything it prefers has
already passed the round trip.

### 7.3 The base prior is not invented — it is measured

The population gradient (Figure > Pattern > Ground at every Mode, across 41
languages, 11 families, 32,000+ verbs) is an empirical distribution over the cube.
It seeds the flow/prior the way the desert cell seeds the realizer: the predictor's
prior over which `operator(Site, Stance)` cells to expect is initialized from the
gradient, not from a guess. Language populates Figure most, Ground least; the walk
inherits that expectation and updates from corpus.

### 7.4 The learning loop is REC, driven by EVA verdicts

Every EVA verdict is a training signal. A certified candidate raises the prior on the
choices that produced it; a rejected candidate lowers it, typed by failure mode. This
is `REC` — *learn rule, restructure the frame* — closing the loop:

```
predict (score licensed candidates)
   → fold (SYN) → evaluate (EVA round-trip)
   → REC (update flow/prior by verdict) → predict …
```

Defeasibility (§6) guarantees the loop never freezes: no finite run reaches the
Pattern coordinate, so the prior is always revisable, never final. Prediction here is
a *ranking under a frame that stays open*, which is the only kind of prediction EO's
own mathematics permits.

**The demotion, stated exactly.** In the LLM, prediction is unconstrained and
therefore load-bearing for correctness — a bad sample is a wrong sentence. Here,
prediction is bounded above by the grammar (can't propose the ungrammatical) and
bounded below by EVA (can't emit the unfaithful), so it is load-bearing only for
*quality*, never for *truth*. That is what makes it safe to eventually let a learned
model — even a small LM — do the ranking. The LM never generates; it only sorts what
the fold licensed and EVA cleared. It can be swapped in without weakening a single
guarantee, and swapped out again the day the rule-based prior matches it. This is the
concrete meaning of "before the LLM, maybe eventually replacing it": the LLM is only
ever a ranker in a sandbox, and the sandbox is the whole invention.

---

## §8 — The generator as a watchmaker assembly

The whole generator is one EO app, assembled the good watchmaker's way: resource
rooms, then the Message room, then links, then the fold surfaces, then the app, each
closed alone. Contracts narrow downward and envelope upward.

```eot
# ── assembly 1..6: resource rooms (see §4; one shown) ──
typology : room
typology.contract.ops      = INS, DEF, REC
typology.contract.terrains = Kind
typology.contract.stances  = Making, Binding, Tracing
!EVA typology
# … paradigms, fst, treebank, lexicon, locale rooms, each set down alone …

# ── assembly 7: the Message room ──
message : room
message.contract.ops      = INS, CON, DEF, SIG        # events, bonds, assertions, flags
message.contract.terrains = Entity, Kind, Link, Lens
message.contract.stances  = Making, Binding, Dissecting
message.schema : kind
message.schema.op        = "text"
message.schema.site      = "text"
message.schema.stance    = "text"
message.schema.predicate = "text"
message.schema.features  = "text"
message.schema.src       = "text"                     # provenance is mandatory
!EVA message

# ── assembly 8: links — the fold reads resources against the message ──
message -> typology
message -> paradigms
message -> fst
message -> lexicon
message -> locale
!EVA message, typology, paradigms, fst, lexicon, locale

# ── assembly 9: the forward-fold surface (SYN), narrowed to realize-only ──
fold : surface
fold.room                = message
fold.reads               = typology, paradigms, fst, lexicon, locale
fold.contract.ops        = SIG, INS, SEG, CON, SYN, DEF   # the realization helix
fold.contract.terrains   = Entity, Kind, Link, Lens, Figure
fold.contract.stances    = Dissecting, Making, Binding, Composing
fold.forbid              = SYN@Ground                     # the desert cell, explicit
fold.emits               = "candidate_set"
!EVA fold

# ── assembly 10: the reverse-fold surface (EVA), the guarantee ──
verify : surface
verify.room              = message
verify.reads             = treebank
verify.contract.ops      = NUL, EVA, REC                  # observe, judge, learn
verify.contract.terrains = Lens, Paradigm
verify.contract.stances  = Dissecting, Tracing, Unraveling
verify.test              = "isomorphism(M, parse(candidate))"
verify.emits             = "certificate | typed_rejection"
!EVA verify

# ── assembly 11: the predictor surface (flow/prior), a ranker in the sandbox ──
predict : surface
predict.room             = message
predict.contract.ops     = SIG, EVA, REC                  # attend, score, learn
predict.contract.terrains= Lens, Pattern
predict.contract.stances = Dissecting, Tracing, Composing
predict.prior.seed       = "population_gradient"
predict.ranks            = "verify.certified_candidates"  # ranks only what EVA cleared
!EVA predict

# ── assembly 12: the app — closure ──
generator : app
generator.name     = "eoreader fold generator"
generator.surfaces = fold, verify, predict
generator.home     = fold
generator.loop     = "predict -> fold -> verify -> REC"   # §7.4
!EVA generator     # envelope: no surface fires an op the app disavows;
                   # the desert cell is forbidden app-wide; provenance is
                   # mandatory upstream; nothing inside the watch is loose.
```

Read the contracts: `predict` can `SIG/EVA/REC` but **not** `SYN` — it cannot
generate, only rank and learn. `fold` can `SYN` but **not** `EVA` — it cannot judge
its own output. `verify` can `EVA/REC` but **not** `INS/SYN` — it cannot write
content or realize. The separation of powers is the contract geometry, checked at
every checkpoint, not a convention anyone can forget to enforce.

---

## §9 — Build order (helix)

Build in dependency order; each milestone stands alone.

1. **Interlingua freeze (INS/DEF).** Lock the Message schema (§3) against the
   UniMorph feature vocabulary. Ship the coherence guard on Message nodes.
2. **Resource ingest (INS).** CLDF loaders for `typology`, `paradigms`, `lexicon`,
   `locale`; UD import for `treebank`. Glottolog join. `?`/`no_cov` surfaced.
3. **English round-trip harness (SYN + EVA).** Tier-0 fold + analyzer for one
   language. The point of milestone 3 is not English — it is the *harness*: the first
   closed loop, the first certificate.
4. **Second language, morphologically rich (CON + SYN).** Finnish or Turkish —
   forces `paradigms`/`fst` to carry real agglutination and proves the fold is
   parameterized, not English-shaped. If the round trip closes here, §1's multilingual
   claim is demonstrated, not asserted.
5. **The walk (prediction, content grain).** `longgen/walk.js` over Messages, prior
   seeded by the population gradient; multi-paragraph coherence.
6. **The learning loop (REC).** EVA verdicts update the flow/prior. Typed rejections
   drive targeted repair.
7. **Ranker swap-in (optional).** A small LM ranks EVA-cleared candidates in the
   sandbox; measured against the rule-based prior; removable the day they tie.

---

## §10 — Open problems (the honest remainder)

- **Lexicalization is the frontier.** Concept → lexeme is where semantic accuracy
  lives, and cross-linguistic concept resources are sparse and coarse for
  domain-specific meaning ("shell-company private policing operation" has no PanLex
  row — in any language). The near-term answer is a hand-authored domain lexicon, small
  and bounded per language; the long-term answer is open. This gates "every NL" far
  more than the realization machinery does.
- **The reverse-parser is real labor.** EVA needs an analyzer good enough to recover
  the event graph per language. UD lowers the cost but does not zero it, and the
  analyzer — not the generator — is usually what keeps a language out of Tier 0.
- **Nonconcatenative and polysynthetic morphology** (Arabic root-and-pattern,
  Inuktitut incorporation) thin the flat UniMorph tables and demand FST/Apertium-grade
  generation — more grammar engineering, though Apertium was built for exactly the
  Romance/Turkic/Uralic cases that break naive realizers.
- **Construction-level variation.** Grambank parameters are language-level defaults;
  information-structure effects (topicalization, focus-fronting) are not a single
  parameter. Output is canonical and slightly wooden — acceptable, arguably desirable,
  for a verification-first engine, but a real ceiling on style.
- **Learned vs. rule priors.** §7 permits a learned ranker in the sandbox. The open
  question is how much fluency it buys once the space is pre-licensed and
  post-filtered — possibly little, which would be the strongest possible result: the
  LLM turns out to have been unnecessary for everything except a marginal sort.

---

*The fold does not make sentences the way the LLM does. The LLM samples a string and
hopes it is true. The fold derives a string, parses it back, and proves it faithful —
or refuses. Prediction rides inside, choosing among the faithful, learning from the
verdicts, and never — by contract, by grammar, and by the geometry of the cube —
choosing among the false.*
