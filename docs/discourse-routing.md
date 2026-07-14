# Discourse routing — the route read off the metacognition's own speech

> The route grain, collapsed the same way the token, move, and field grains already were
> (`decision-as-relaxation.md`, `generation-by-field-reading.md`, `holonic-token-confinement.md`):
> the model **points**, in its own natural language, and a deterministic engine **constructs**
> the route. No JSON, no forced one-word vocabulary — the metacognition speaks, and its speech
> has gravity.

## The gap this closes

Routing was the last decision still made by string-matching. Two symptoms, both chronic:

- **The engine does not always know when the world has to answer.** The web proposer
  (`turn/propose.js`) fires only off *measured reading gaps* — a void, an unbound answer, a
  diffuse coref. It is blind to the discourse fact: "this is about last week's election,"
  "the user is asking past the document." Those gaps exist before any grounding failure can
  measure them, and nothing saw them.
- **The engine does not always know what kind of result the user wants.** Essay vs poem vs
  answer was a keyword guess — `artifactKindOf`'s head-noun peel, `COMPOSE_VERBS × COMPOSE_KINDS`
  regex products, the `/essay` dispatch in `ui/app.js`. "Could you put together a few stanzas
  about her" defeats all of them, and the essay organ's history of hijacking essay-shaped asks
  (#319, #320) is the same router failing in the other direction. Every fix was another regex
  patched per audit failure.

The obvious repair — ask the local model to emit a routing decision — was already tried in
miniature and shows the trap: `transitionPrompt` (`frame/conversation-fold.js`) forces the model
to answer with exactly one of four words. A constrained vocabulary is JSON with fewer braces.
The model is the faculty of *saying*; asked to emit the decision, a small model reverts to its
priors and confabulates one (`common-sense.md`, the Meno engine). The planner must not ask it to.

## The shape: speak freely, be measured

`src/turn/meta-route.js`. Four moves, all of them existing machinery pointed at a new grain:

1. **The metacognition speaks, with no format contract at all.** `discoursePrompt` shows it
   only the discourse — the fold's carried stance, the last exchange, the new message; not the
   document, not a tool inventory. It is asked for two or three plain sentences: what is the
   user doing, what would satisfy them, what would have to be found out that neither the
   conversation nor the reading already holds. That paragraph is the entire model output.

2. **The paragraph is measured, not parsed.** Each route direction — `compose`, `ground`,
   `research`, `isolate`, plus `continue` — owns a **basis**: a term profile built from
   exemplar phrases, the same exemplar-centroid trick `turn/shape.js` runs at the answer-form
   grain. The paragraph's Born weight `|⟨B|s⟩|²` against each basis (`surfer/salience.js` —
   the same projection the surfer rides, the same discrete term space, the one tokenizer) is
   that direction's raw pull.

3. **Each pull is gated by a crosstalk null.** The background for a basis is every *other*
   direction's exemplars scored against it — a constructed chance ensemble: the overlap the
   directions' vocabularies share with no signal present. The null is that ensemble's ceiling
   (the α→0 extreme-value line, floored by `deriveNull`'s projection). A direction acts only
   when the speech aligns with it better than off-direction speech ever does — which is exactly
   how near-degenerate bases (essay and poem share words) are held apart structurally instead
   of by hand-tuning.

4. **The surviving currents relax; nothing chooses.** The gated weights enter the same
   winner-take-all relaxation the essay moves settle in (`longgen/relax.js` — lateral
   inhibition, self-excitation). The fold's carried stance is the **incumbent** and receives a
   resting potential, so continuation stays the default as *physics*: a transition current must
   out-compete the incumbent through the inhibition, not merely register. The `continue`
   basis's current flows *to* the incumbent (continuation is more-of-the-incumbent, not a place
   of its own; with no incumbent it has nothing to continue and the measurement abstains). The
   regex seeds — `isExplicitCompose`, the task register — fold in at `SEED` weight exactly as
   `p(next)` does at `relax.js:95`: they inform, they do not decide.

The audit is the settling itself: `metaRoute` returns the raw weights, the gated currents, and
the activations — which current won and by how much — the same trace `exportAudit` carries for
the essay loop.

## Why no meaning embedder at this grain

The paraphrase problem lives in **user** speech — that is what defeats the regexes. But the
text measured here is **model** speech: a model describing "put together a few stanzas" says
"the user wants a short poem." **The metacognition is the semantic normalizer.** Its vocabulary
converges on canonical terms, so a lexical Born overlap in the engine's own term space is
reliable — and the route physics runs in the zero-download default instead of going dark until
an organ warms (the exact failure `surfing-next.md` diagnosed in the significance column).
MiniLM keeps its territory where text nobody re-speaks is measured per-unit (ingestion,
proposition equivalence, the classifier): the talker for sparse expensive pointing, the
embedder for dense cheap geometry. Routing is once per turn; it can afford the talker and skip
the embedder. The bases stay injectable (`buildBases`) so the space can be swapped anyway.

## The two symptoms, answered

- **Research.** The `research` direction's gated current is exposed as `researchDrive`
  *regardless of the winner* — a paragraph can settle on `ground` and still say "the document
  cannot answer this." `proposeWebSearch` folds it in as a discourse-level gap alongside the
  measured reading gaps (`ctx.discourse`, opt-in, byte-identical without it). And `leadsOf`
  hands the curiosity walk the paragraph's *novel* content terms — the words that are in the
  metacognition's read but in neither the conversation nor the bases' own scaffold — as
  frontier leads, the same way a fetched page's surprising terms become leads
  (`curiosity-research.md`). The metacognition never formulates a query; it deposits mass
  where the walk should look first. What is curious remains the surfer's determination.
- **Form.** When `compose` settles, `formKindOf` measures the same paragraph against the kind
  bases (poem / story / essay), null-gated, `''` on abstention so the caller falls back to the
  fold's carried `focus.kind` — replacing the `artifactKindOf` keyword peel at the route grain.
  Downstream the kind stays a *flag* in `expectAnswer`'s constraint terms, never a gate
  (`answer-expectation.md`: the engine must not pretend to grade poetry).

## Asking back — the gap only the user can close

`research` names one kind of "has to be found out": the **world** has to answer (recent news, a
live fact). Its complement was missing. The metacognition's own prompt asks it to say "what would
have to be found out that neither the conversation nor the reading holds" — and its honest answer
is often *"I'd have to ask **them**"*: the request is ambiguous or underspecified, and only the
user can settle which one, whose, or what exactly they mean. Nothing acted on that. The turn
guessed, or reached to the web for something the web doesn't carry — the metacognition would *say*
it needed to learn from the user, but never asked.

`CLARIFY_EXEMPLARS` (`clarify ⟂ actionable`, two members so the crosstalk null is finite) measures
that gap exactly as the register/length grains do. `clarifyDrive` is the gated `clarify` current
— the **user-side twin of `researchDrive`**, exposed *regardless of the winning route* (a `ground`
turn can be underspecified too), and `clarifyDemand` is the `'clarify' | 'actionable' | ''`
argmax. When the read comes back `clarify`, the turn poses **one** clarifying question and ends,
waiting for the reply, instead of answering past the ambiguity (`_clarifyingTurn` in
`app.dc.js`). The `actionable` contrast keeps a clear ask from ever being questioned back.

Two properties of the measurement matter, and both were fixed after the clarify current was
observed never firing on a real turn ("write me an essay about dolphins" — the read *said* "I
would need to clarify what specific aspects… the request is quite broad," and nothing asked):

- **The clarify demand is read at the sentence grain, not over the whole paragraph.** Unlike the
  route/form/length/register — global properties of the read — the clarify need is a *localized
  caveat*: one closing clause of an otherwise content-full read. `bornSalience` normalizes by the
  span's term count, so folding that clause into the whole paragraph divides its overlap by every
  content term the read spent describing the subject, and the signal sinks below a crosstalk null
  that was derived from single-clause exemplars. `clarifyDemandOf`/`clarifyDrive` therefore measure
  the **max clarify weight across the read's sentences** (`clarifyWeightOf`, the same per-unit
  reading `salienceField` runs over a document) — so a read that names the gap in any one sentence
  clears, and a null calibrated on single clauses meets a single-clause span, not a diluted bag.
- **The consumer fires on the USER-gap *dominating* the WORLD-gap, not on `!researchDrive`.** The
  `research` crosstalk null floors near zero (its exemplars share little vocabulary with the other
  directions), so a bag-of-words overlap admits a tiny spurious research current that then vetoed
  every clarify. The fork now fires when `clarifyDrive > researchDrive` — the two "unclosable gap"
  currents compete, and we ask **them** only when their gap is the bigger one. An explicit research
  ask, a read that settled on `research`, and the creative register still defer (the world answers
  those; invention answers freely). `compose` is **not** excluded: an underspecified make-this is
  exactly a turn to ask back on, and a clear make-this reads `actionable`, never `clarify` — a poem
  has already composed above before reaching the fork.

The finished bubble carries no stance, so the fold treats the question transparently and the
user's next message reads as completing the original ask. Fails soft on every edge (cold model →
a plain question built from `leadsOf`), so the loop closes rather than silently regressing to a
guess.

## The fallback contract (unchanged, now continuous)

`createMetaRouter` adapts the measurement onto `routeStance`'s **existing** `opts.model` seam —
`conversation-fold.js` is untouched. Cold model, empty speech, or a paragraph that coheres
toward nothing (every weight under its null) → `CONTINUE` → the baseline rules: markers →
continuation → fresh-regex-seed. Never worse than today; the regexes stop being the decision
and become the floor. The degradation that was binary (warm/cold) is now continuous: the
measurement acts exactly as far as it beats chance, and abstains where it cannot — the same
discipline the reading side runs everywhere else.

## What is deliberately NOT here

- The metacognition's paragraph is a steering current only. It must not leak into the answer
  prompt — measured, discharged, discarded — or it becomes a second voice confabulating framing.
- The relaxation returns a stance verdict, not an organ dispatch. Wiring the settled route into
  `ui/app.js`'s dispatcher (replacing the `/essay`-adjacent keyword branch) is the follow-on,
  and it should be bench-gated first: the #319/#320 essay-hijack cases are the ready-made
  regression fixtures, run off vs on before anything defaults on.
- Exemplar tending replaces regex patching as the maintenance surface. That is a real cost,
  moved not vanished — but a graded, chance-gated, testable one: `tests/meta-route.test.js`
  pins that no direction's exemplars clear another's null, so a vocabulary collision fails CI
  instead of misrouting a user.

## Files

- the measurement + the prompt: `src/turn/meta-route.js` (`metaRoute`, `speechCurrents`,
  `relaxRoute`, `formKindOf`, `discoursePrompt`, `leadsOf`, `createMetaRouter`,
  `clarifyDemandOf`, `clarifyDrive`, `clarifyWeightOf`, `CLARIFY_EXEMPLARS`)
- the ask-back consumer: `src/rooms/reader/app.dc.js` (`_clarifyingTurn`, and the `clarifyDemand` fork
  in `sendChat` before the web/answer path — `_discourseRead` carries the current through)
- the discourse gap at the proposer: `src/turn/propose.js` (`ctx.discourse.researchDrive`)
- the seam it plugs into, untouched: `src/frame/conversation-fold.js` (`routeStance` `opts.model`)
- the mechanics reused: `longgen/relax.js` (relaxation), `surfer/salience.js` (Born),
  `core/voidnull.js` (`deriveNull`), `perceiver/parse/tokenize.js` (the one tokenizer)
- tests: `tests/meta-route.test.js`
