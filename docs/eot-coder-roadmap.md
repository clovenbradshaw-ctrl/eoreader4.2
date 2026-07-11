# The EOT Coder: A Staged Roadmap

**Module:** plain text → EOT → code
**Repo:** eoreader4.2
**Branch:** `claude/code-eot-issue-detection-vueqan`
**Status:** proposal, v0.1
**Canon:** `writing-code-in-eo` (`docs/eo-for-coders.md`) v0.2; the nine operators in `core/operators.js`; the three faces in `core/faces.js` and `core/cube.js`

---

## 0. Thesis

A general coding agent and the EOT coder are not the same kind of thing, and the roadmap only makes sense once that is said plainly.

A general agent competes on **generality and autonomy over arbitrary code**. Its trust model is *trust the model, verify with the environment* — run the tests, read the traceback, repair. It is very good at this and getting better, and the honest reading of the 2026 landscape is that the human still supplies the plan while the agent supplies the execution.

The EOT coder inverts the trust model. The skill says it out loud: **the model proposes, the kernel disposes.** The model is the leaf. The kernel is the intelligence. Correctness is not a property we test for after generation; it is a property of the emission surface itself. A grain-mixed event is not a bug we catch — it is a sentence the language should not be able to say.

So *competitive* cannot mean "out-general the general agent." It means: **own the lane where a validated intermediate representation structurally dominates a probabilistic one** — correctness by construction, typed and addressed defects, and provenance carried by every line. That lane is not a consolation prize. It is the only lane in which an artifact can ship with an auditable trace of its own assembly, and it is the same lane the rest of the stack (provenance-first publishing, glass-box civic tooling) already stands in.

Two external facts make the timing good rather than merely principled:

1. The field is converging on the mechanism. Position work in 2026 argues that reliable software artifacts require structured representations — compiler IRs, formal correctness frameworks, verification — rather than probabilistic pattern matching. EOT is one.
2. The field agrees the bottleneck has moved. It is no longer model capability; it is the infrastructure around the model. EOT *is* that infrastructure, and it was designed before the need was fashionable.

---

## 1. Non-goals

Stated first, because the roadmap is only coherent if these stay closed.

- **Not a general-purpose programming language.** Every extension that makes EOT more expressive in the Turing sense destroys the thing that makes it valuable: a finite, closed, validated algebra. If we can express anything, we can validate nothing.
- **Not arbitrary-codebase refactoring.** Legacy code, messy glue, undocumented APIs — the general agent wins these outright and should.
- **Not a catalog we generate.** Surfaces are built once by a human, contracted, tested, and added. A missing surface is a catalog gap to report, never a coder task. The moment the coder invents a surface, the trusted computing base becomes unbounded.
- **Not a competitor on autonomy theater.** We are not chasing long-horizon unsupervised runs. We are chasing *interruptibility* — the watchmaker property, where stopping mid-build leaves valid, provisioned, usable assemblies behind.

The boundary is the product. Choose it deliberately; let it be the feature.

---

## 2. Prior art, mapped to the mechanism

Five strands, ordered from the natural-language end to the render end. For each: what it is, and the one thing to take.

### 2.1 Semantic parsing / NL → formal spec (the `perceive` step)

The live version of this is neurosymbolic. ConstraintLLM (EMNLP 2025) runs our exact shape: extract constraint types from a natural-language requirement, generate a formal model, self-correct on violation, delegate solving to a verified solver. That is emit → checkpoint → revise wearing different clothes.

**Take:** their error taxonomy and their commitment to *verification during inference* rather than after it. A defect found at generation time is worth ten found at test time.

### 2.2 Controlled natural language and projectional editing

Attempto-style CNL restricts language so it maps deterministically to logic. JetBrains MPS pioneered projectional editing: you edit the AST directly and text is only a projection, so malformed states are unreachable rather than merely invalid. EOT — punctuation shapes that a deterministic ingester recovers operators from — is projectional-adjacent already.

**Take:** well-formedness belongs to the *editor and decoder*, not to a checking pass. Push the guard as early as it will go.

### 2.3 Model-driven engineering and low-code app generators

The closest product analog and the real competitive set for scope: Retool, Airtable, Budibase, Windmill; and the text-to-app wave (v0, Lovable, Bolt, artifact generators). All of them emit arbitrary application code that then rots. Rooms → links → surfaces → app over a fixed catalog is a low-code platform with formal semantics.

**Take:** their catalog breadth and their schema-elicitation UX, both of which are better than ours and neither of which costs us anything to copy. What they cannot copy is that our composition is kernel-checked.

### 2.4 Compiler IRs and verified compilation

EOT is an IR between natural language and the render. The aspirational endpoint is CompCert-style: if the ingester itself is proven correct, then *valid EOT ⇒ correct app* becomes a theorem rather than a hope.

**Take:** the discipline of a **small trusted computing base**. Kernel + ingester is the whole of what must be trusted. Everything else — including the model — is permitted to be wrong, because being wrong is caught.

### 2.5 Grammar-constrained and semantic-aware decoding

The strand we are least exploiting and the highest-leverage one.

- *Syntactic:* SynCode, Outlines, LMQL, XGrammar constrain the token stream to a formal grammar. Applied to EOT, syntactic malformation becomes impossible rather than rejected.
- *Semantic:* "Projectional Decoding" (2026) goes further — it maintains a partial model during decoding and filters the vocabulary at each step against a metamodel and its constraints, discarding tokens whose refinement would violate them.

That second one is our coherence guard, pushed into the decoder. It is the single most important paper-shaped idea in this document.

**Take:** all of it. See Stage 1.

---

## 3. The stages

Each stage is a set-down. It ships alone, validates alone, and the next stage does not begin until it holds. We are Hora here too.

---

### Stage 0 — Baseline and the defect corpus

**Goal.** Know what the pipeline actually does before improving it.

**Why now.** Everything downstream is a claim about defect rates. Without a corpus we are guessing, and Stage 1's whole justification is "these classes of defect become unrepresentable" — which is unfalsifiable without a before.

**Deliverables.**
- A benchmark of N natural-language app requests (drawn from real domains: docket tracking, procurement logs, asset maps, attendance, case management) with human-authored reference EOT.
- A harness that runs perceive → surf → enact end to end and logs every emission, every checkpoint verdict, and every revision.
- The **defect corpus**: every rejected assembly, tagged with its Appendix B error type, the address that failed, and the stage of the pipeline that caught it.

**Exit criteria.** We can state, with numbers: what fraction of assemblies pass first-emission; what the distribution over the ten error types is; how many revisions the median app costs; and how many requests hit the two-revision cap and veto.

**Risk.** The corpus encodes our own blind spots. Mitigate by sourcing requests from people who do not know EOT exists.

---

### Stage 1 — Constrained emission (close the loop)

**Goal.** Collapse propose → dispose → revise into a single constrained pass, by making invalid EOT unsamplable rather than rejectable.

**Why now.** This is the biggest correctness *and* latency win available, and it does most of the issue-detection work by relocating it: a defect that cannot be emitted does not need to be detected. It is also the stage that most sharply differentiates us — no probabilistic coder can claim its output is *syntactically incapable* of a class of error.

**Deliverables, in two layers:**

1. **Syntactic mask.** An EOT grammar (EBNF/Lark), compiled to a token-level mask via the standard constrained-decoding machinery. The model cannot emit a line that is not EOT. Eliminates the entire class of parse-level malformation.
2. **Semantic mask.** The coherence guard and the contract check, evaluated against a *partial model* maintained during decoding:
   - **Grain coherence.** Act, Site, and Stance must agree on grain. Once two faces of an event are fixed, the third is constrained to a computable set. Mask the rest.
   - **The desert cell.** SYN at Ground is empty across 41 languages. It should be empty in the token distribution too.
   - **Contract membership.** Once a part's contract is DEF'd, any op/terrain/stance outside its declared region of the cube is masked for that part's subsequent events.
   - **Helix dependency.** A `->` to a room not yet INS'd, a surface over a schema-less room — masked at the reference, not rejected at the checkpoint.

**The load-bearing insight.** The cube is *finite and small*. 27 cells, nine operators, ten catalog surfaces. This is exactly the regime where semantic masking is cheap — we are not solving an SMT instance per token, we are doing set membership against a precomputed region. Most metamodel-constrained decoding work is fighting an unbounded metamodel. We are not. This is EO's structural gift to the decoder.

**Exit criteria.** Against the Stage 0 corpus: `grain-mixed`, `desert-cell`, `dependency`, and `contract-violation` fall to **zero at emission** — not "rare," zero, because they are unrepresentable. First-emission assembly pass rate rises materially. Median revisions per app falls.

**What remains catchable-not-preventable.** Errors that depend on facts the decoder cannot see locally: `terrain-mismatch` (needs the room's actual fields), `closure-violation` (needs the whole envelope), `unknown-surface` (catalog lookup), `narrowing-violation` (needs the container). These stay at the checkpoint. That is fine and correct — see §4.

**Risks.**
- **Mask bugs are silent and catastrophic.** A too-tight mask makes valid apps unbuildable and the model will thrash against a wall it cannot describe. Mitigation: the mask must be *derivable from the same kernel source* as the checkpoint (single source of truth), and every masked-out token at a decision point gets logged so we can audit what the model *wanted* to say. That log is itself a research artifact.
- **Tokenizer misalignment.** Subword tokens do not align with EOT terminals. This is the known hard part of constrained decoding; budget for it.
- **Overconstraint hides model failure.** A model that would have emitted nonsense now emits *syntactically perfect* nonsense. Masking guarantees well-formedness, never appropriateness. Stage 3 and the human are the answer; do not let Stage 1 create false confidence.

---

### Stage 2 — Widen the catalog and the target

**Goal.** Grow the expressible surface without loosening the algebra.

**Why now.** Generality is the general agent's edge and our ceiling. Stage 1 makes us *correct*; Stage 2 makes us *useful enough to reach for*. The catalog is ten surfaces. That is a demo, not a platform.

**Two axes:**

1. **More surfaces.** Each built once by a human, contracted, tested, added. The catalog-gap report from Stage 0's veto log is the prioritized backlog — the coder is already telling us what it cannot build.
2. **More targets.** EOT currently composes UIs over rooms. "Code" should also mean:
   - **Pipelines and automations.** A contracted n8n workflow is a composition of INS/CON/SYN over Link and Network terrains. The existing n8n instance is the substrate; the win is that a workflow acquires a contract and a checkpoint chain, which n8n itself does not provide.
   - **Ingest and scrape definitions.** The docket/FeatureServer pipelines are rooms with a scheduled INS. Expressing them in EOT means their *provenance* is native rather than bolted on.

**Exit criteria.** A non-trivial real tool — one we would otherwise have hand-built — is generated end to end and put into production use. The catalog-gap rate on new requests drops below a set threshold.

**Risk.** This is where the non-goals get tested hardest. Every catalog addition is a request to widen the algebra, and most of those requests should be refused. Rule: a new surface is admissible only if its contract fits in the existing cube. If it needs a tenth operator, the answer is no, and the answer stays no.

---

### Stage 3 — The repair agent

**Goal.** An agentic loop that consumes typed errors as structured repair targets, with the two-revision cap and the honest veto.

**Why now.** Stages 1–2 make the remaining defects *rare and typed*. That is precisely the condition under which an automated repair loop is cheap and reliable, rather than the thrashing that unconstrained repair loops degenerate into.

**The asymmetry to exploit.** A general agent's repair signal is a runtime traceback: post-hoc, often distant from the cause, sometimes absent. Ours is a **typed error with an address, produced statically, scoped to one assembly** — `terrain-mismatch` at `ward_board.column`, not "TypeError: undefined is not a function." The repair action space is correspondingly small and the fix is often mechanical.

**Deliverables.**
- Per-error-type repair strategies keyed to Appendix B's fix column.
- Strict scoping: revision touches *only the assembly in hand*. Completed assemblies are never re-opened. Downstream is never started.
- The cap: two revisions per assembly, then **veto** — surfaced to the person as "this part cannot be built as asked, and here is exactly what failed." Never a silent degradation.
- A schema-elicitation surface: when the request is genuinely underdetermined ("a project tracker" does not tell us the columns), the substrate renders a form and *asks*, before the room's first checkpoint. Ambiguity is resolved by the person, never by guessing.

**Exit criteria.** Automated repair resolves the majority of remaining checkpoint failures within the cap. Veto messages are legible to a non-EO-literate person. No silent widening appears anywhere in the log.

**Risk.** Repair loops are where "helpful" becomes "quietly wrong." The cap and the veto are not conservatism; they are the feature. Resist every instinct to raise the cap.

---

### Stage 4 — Provenance as the product

**Goal.** Ship the auditable trace as a first-class artifact, not a debug log.

**Why now.** This is the capability an unconstrained agent structurally cannot offer, and it is the one our actual domains actually need. It should stop being an implementation detail and start being the pitch.

**Deliverables.**
- **The assembly ledger.** Every emitted line records who emitted it, when, and in response to what. Every checkpoint verdict is a logged event beside it. Every `!REC` widening is attributable. The app carries the trace of its own construction: what was built, in what order, what failed on the way, what was widened and by whom.
- **Signing.** Rooms are already append-only signed event streams. The build log should be too. An app whose *construction* is a signed ledger is a categorically different object from an app someone generated in a chat window.
- **A human-readable build report.** Rendered from the ledger. This is what goes in the methods note of a story, or in the appendix of a records request, or in front of a court.

**Exit criteria.** A tool built by the coder ships with a build report that a skeptical outside party — an editor, an opposing lawyer, a records officer — can read and check.

**Why this is the moat.** Competitors cannot retrofit this. Provenance is not a feature you add to a probabilistic generator; it is a consequence of having a validated emission surface in the first place. Here "competitive" stops being the right word. The comparison stops applying.

---

### Stage 5 — Verify the ingester

**Goal.** Prove the EOT → render path, so that *valid EOT ⇒ correct app* is a theorem.

**Why now.** Last, and only after everything above holds. The trusted computing base is small by construction (kernel + ingester); Stage 5 is the payoff for having kept it small.

**Deliverables.**
- A formal specification of the ingester's recovery map (punctuation → operator, address, provenance).
- Mechanized proof of the properties that matter: the ingester never recovers an operator the punctuation does not license; a checkpoint-passing assembly renders to a substrate state satisfying its contract; contract narrowing downward and enveloping upward are preserved by the render.

**Exit criteria.** A statement we can make in public and defend: *no probabilistic coder can make this claim about its output, and here is the proof object.*

**Risk.** Scope. This is a research project, not a sprint, and it must never block Stages 1–4. If it slips forever, the product is still good; it just does not get the theorem.

---

## 4. The branch: issue detection as the wedge

`code-eot-issue-detection` is the sharpest thing in this roadmap and should be made load-bearing rather than treated as a side quest.

In EO, issue detection is **not a linter bolted onto a generator.** It is the coherence guard, the contract check, and the closure check — which already hand us, for free, a *typed defect taxonomy with addresses*. That is a product other people are trying to build with heuristics and LLM-as-judge, and we get it as a consequence of the algebra.

**The positioning sentence:**

> A general coding agent finds issues by running the code. The EOT coder finds a whole class of issues without running anything — and hands you the address.

**The organizing principle: catch each defect at the earliest point that can catch it.** This is the projectional-editing lesson (§2.2) applied as an engineering rule, and it gives the branch its actual work item — a per-error-type assignment to a detection point:

| Error | Face | Earliest possible detection | Stage |
|---|---|---|---|
| `grain-mixed` | all three | **token** — mask the third face once two are fixed | 1 |
| `desert-cell` | Act + Site | **token** — SYN@Ground is never sampled | 1 |
| `dependency` | Act (helix) | **token** — reference to an un-INS'd target is masked | 1 |
| `contract-violation` | any | **token** — post-DEF, out-of-region ops are masked for that part | 1 |
| `unknown-surface` | catalog | **token** — the catalog is a closed vocabulary | 1 |
| `unassembled` | Law 2 | **parse** — assembly boundary without `!EVA` | 1 |
| `terrain-mismatch` | Site | **assembly checkpoint** — needs the room's actual fields | 0/3 |
| `narrowing-violation` | composition | **assembly checkpoint** — needs the container's contract | 0/3 |
| `stance-violation` | Stance | **assembly checkpoint** — needs the surface's contract | 0/3 |
| `closure-violation` | composition | **final checkpoint** — needs the whole envelope | 0/3 |

Read the table as the branch's roadmap: **the top block migrates to the decoder; the bottom block gets a repair strategy.** Nothing gets a runtime traceback, because nothing needs one.

The honest caveat, restated because it is the one that will bite: this catches *incoherence*, not *inappropriateness*. A perfectly coherent, contract-satisfying app can still be the wrong app. The person is the judge of that, the elicitation form is how we ask them, and no amount of masking substitutes for it.

---

## 5. How we know it is working

- **First-emission assembly pass rate.** Should rise sharply at Stage 1 and stay high. If it does not, the mask is too loose (defects still emitted) or too tight (valid apps unbuildable); the masked-token log from §Stage 1 tells us which.
- **Defect distribution.** The Stage 1 block goes to literal zero. If it does not, the mask is not derived from the kernel and has drifted from the checkpoint — the single-source-of-truth invariant is broken, and that is a bug to fix, not a rate to tune. The remaining bottom-block errors should shift left over time: fewer reach the final checkpoint as elicitation resolves ambiguity earlier.
- **Median revisions per app.** Falls at Stage 1 (fewer defects to revise), falls again at Stage 3 (the ones that remain get repaired mechanically), and the *veto rate* — apps that exhaust the cap — is the honest ceiling on what the catalog can currently express. A rising veto rate on real requests is the Stage 2 backlog naming itself.
- **Catalog-gap rate.** The fraction of requests that hit `unknown-surface`. This is the coder telling us where the platform ends. It should fall as Stage 2 lands surfaces, and it should never be closed by *inventing* a surface — a gap silently filled is the trusted computing base going unbounded.
- **Provenance completeness.** Every shipped assembly carries a build report a skeptical outsider can check (Stage 4). This is binary, not a rate: an app either carries its signed ledger or it does not. Anything that ships without one is not the product.

The trap to name out loud: every metric here measures *coherence*, and coherence is not *appropriateness*. A pipeline that reads all green can still build the wrong app. Masking, checkpoints, and the ledger guarantee that what we built is internally sound and auditably assembled — never that it was the thing the person wanted. That last judgment stays with the person, mediated by the elicitation form, and no number on this list is allowed to stand in for it.

---

## 6. The through-line

One sentence, because the roadmap collapses to it: **relocate correctness from a test we run afterward to a property of the surface we emit on, and ship the trace of having done so.** Stage 1 relocates it. Stages 2–3 keep the surface useful and the residue repairable. Stage 4 ships the trace. Stage 5 proves the surface. The general agent will keep winning generality; we are not playing that game. We are playing the one where the artifact can prove how it was made.
