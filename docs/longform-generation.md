# Longform Generation — the essay organ

> Spec for the essay organ. Coherent longform on eoreader primitives, built and
> shown in real time. Status: draft, revision two. Vocabulary assumes the log,
> the graph fold, the significance loop, frames, the grounding envelope, the
> surfer, and bind/veto.

## Purpose

Generate documents of many sections that stay coherent end to end, without
holding the whole document in the workspace, and show the argument taking shape
as it is built. Coherence lives in a small commitment graph and a small carry,
not in a large context. Progress is shown as the state of that graph, not as a
percentage.

## The necessity

A context window is an integration limit, not a storage limit. Everything in a
prompt is mutually conditioning, so a large active set degrades: more
interference, worse selection, the middle lost. This forbids accumulating the
essay-so-far in the prompt and continuing it.

So longform is a sequence of small broadcasts, one workspace per section, each
folded fresh. The essay-so-far lives in the log. What crosses each section
boundary is a compressed carry, sized by the same law that caps the workspace.
Each section boundary is a doorway. We flush the prior section's spans on
purpose and keep only the carry. Adaptive forgetting is what keeps the
workspace small enough to integrate.

Coherence is not maintained by freezing structure. It is maintained by a
disciplined loop in which each section may move the plan, under constraint. Too
much motion is drift, the thing we are preventing. Too little and the essay
ignores its own discoveries and reads dead. The real design object is the
revision discipline: when the plan may move, and how far.

## The inversion

The naive pipeline writes prose and extracts commitments from it. Invert it.
The system already thinks in claims bound to spans, so build the argument as a
growing graph of bound commitments first, and render prose from the graph
second. The essay is its sequence of commitments. The words are downstream.
This is not extra machinery. It is realigning to what bind and veto already
are.

Per section, three moves, not one:

- **Explore.** Propose many candidate claims cheaply, at the claim level, not
  as full exploratory prose. Generation is the scarce sequential resource, so
  spend it narrowly.
- **Consolidate.** Bind the claims to spans, veto the unbound, keep the set
  that coheres with the ledger.
- **Render.** One prose pass from the surviving commitments.

Exploration is wide and disposable. Consolidation is small and stable.
Rendering is the surface. This recapitulates the working-memory architecture at
document scale. Wide disposable exploration is the unconscious processing, the
iceberg. The consolidated commitment graph is chunking into the stable store.
The rendered prose is the broadcast. The document is a mind.

## Objects

### Spine

A directed acyclic graph of section intents, not a list. Order is for
rendering. Dependencies are for coherence. Produced by one fold over the whole
log under a chosen frame, before any section is written.

```
Spine = {
  thesis: string,          // the through-line, invariant unless replanned
  frame: FrameSig,
  sections: [
    {
      id,
      intent,
      anchors: [entityId | eventId],
      dependsOn: [sectionId],   // coherence edges, may be empty
      order: int,               // render position, may change
      state: pending | exploring | consolidating | accepted
    }
  ]
}
```

The spine is the integration substitute. We cannot hold the whole essay in one
workspace, so the spine holds the shape and the carry holds the running state.

### Commitment

The atomic unit. A typed proposition bound to spans — the payload sits BELOW
language. The claim string is the payload's text projection, one surface among
many; a chart datum is another projection of the same payload. The essay is a
sequence of these.

```
Commitment = {
  prop: {                       // the pre-linguistic payload
    relation, entities: [...],
    quantities: [{ value, unit }],
    time
  },
  claim: string,                // the TEXT PROJECTION of prop
  spanRefs: [spanId], sectionId
}
```

### Carry

The compressed state that crosses each doorway. Small by law. A chunk: the
prior sections consolidated into one unit that costs one unit of budget in the
next fold. The ledger is the commitment graph's compressed trace.

```
Carry = {
  thesis: string,          // copied from spine, never rewritten
  priorClaim: string,      // terminal claim of the last accepted section
  threads: [               // promises made, not yet paid
    { id, text, openedAt: sectionId, dueBy: sectionId | null }
  ],
  ledger: [Commitment]     // claims already bound, for repeat and contradiction checks
}
```

The carry is not the text of prior sections. It is their compressed trace.

### Section fold

For each section:

```
fold = section.intent
     + carry
     + retrieve(section.anchors, section.frame)
     + reilluminate(section.dependsOn)   // prior sections pulled back from the log
```

Small active set. The prior section text is absent by design, except the
declared dependencies, which are re-folded from the log on entry.

## The section loop

```
plan            build the spine DAG from a whole-log fold
for each section in render-order(spine):
    enter       re-illuminate declared dependencies from the log
    explore     propose candidate claims, wide and cheap, at claim level
    consolidate bind to spans, veto the unbound, keep the coherent set
    revise?     if consolidation surfaced a spine-relevant claim, move the spine (bounded)
    gate        coherence gates against spine, carry, dependencies
    render      one prose pass from the surviving commitments, paragraph grain
    verify      re-bind the render at claim grain; strike smuggled assertions
    accept      commit the section
    update      fold the section into the carry
    flush       drop section spans, checkpoint the carry
reconcile       global pass over the assembled draft
```

Generation repeats only in explore and render. Everything else re-weights a
memoized fold.

## Candidate generation

In explore and in render, reuse the multi-fold method. Do not sample the same
prompt N times. Perturb attention, not decoding.

- **Frame.** Vary frameSig so a different set of spans crosses threshold.
- **Envelope.** Re-weight the grounding envelope toward different anchors.
- **Cursor.** Start the reading at different arrests.

Keep N small, two or three, chosen to be maximally different rather than
randomly sampled. WebLLM generation is sequential and local, so N is a budget.

## Asymmetric granularity

Generation grain and verification grain are different knobs, and the evidence
splits them. Snowballing is a content-selection failure: a model that chooses
what to assert autoregressively over-commits to an early mistake and then
stays consistent with it — the later errors are loyalty to a bad commitment,
not ignorance. The cure is returning control before the commitment compounds:
a small commit unit. So explore stays at claim grain, and the claim is the
floor. A claim is the smallest thing that can be true — the unit that binds
to a span and can be vetoed. Below it there is no verification boundary;
half a claim checks against nothing.

Render cuts the other way. By render time the propositions are already chosen
and bound, so the model is doing surface realization, not fact generation —
the one place autoregressive fluency is a strength and there are no new facts
to get wrong. The snowball has nothing to roll. Shrinking the prose unit
attacks that strength, multiplies sequential calls on a local model, and buys
no coherence, because coherence was fixed by the commitment graph before
rendering started. So render flows at paragraph scale or larger, one pass per
section.

The check after render is where the grains meet. Each rendered sentence is
re-bound at claim grain: a sentence that cites a span keeps its citation;
connective tissue that made lexical contact rides as glue, marked — unless it
denies, because an unbound negative is an assertion of absence, the claim
that needs grounding most; a sentence with no contact at all is prose from
nowhere — struck, however fluent; and a sentence that contradicts the ledger
or alters a quantity is struck whatever it cites. Coarse generation, fine
verification, every threshold the binder's own. The accepted section carries
its per-sentence verdicts into the log, so the accept event states its own
generative honesty.

## Omnimodal rendering

Omnimodal output proves the commitment was never text. As long as a commitment
is a claim string, text is privileged: the proposition is already rendered
into words, and every other modality is a translation out of text. The first
chart forces the commitment below language — and that single move buys fluency
across any number of calls and modalities.

- **The commitment is pre-linguistic.** A typed proposition — relation,
  entities, quantities, time — with span refs. The claim string is its text
  projection; the bar is its chart projection. Same commitment, different
  surface. Commitments before prose, generalized to commitments before
  surface.
- **Fluency is structural, not negotiated.** The number in the caption and
  the number in the bar are the same field of the same proposition. Bind both
  surfaces to one commitment and they cannot disagree; cross-modal
  consistency is a deterministic validator — a predicate over surface versus
  payload — never a hope that two generators matched.
- **Multiple prompts are a fan-out, not a chain.** Every generation call
  conditions on the shared commitment graph, never on a sibling's rendered
  surface. A chart cannot roll on the previous paragraph's sentences, which
  is the proof the fan-out was never optional: no call inherits another
  call's unverified output, so nothing snowballs across calls. Fluency across
  calls is the shared spine and carry.
- **Modality is a property of the slot.** The schema names each slot's
  modality; per-modality renderers all fold the same commitment graph, the
  way the reads all fold one log. A non-text slot renders as a deterministic
  projection of its payloads — no model call at all. A figure is a holon the
  way a section is a holon; the DAG's edges interleave the modalities and set
  render order.

The residual is surface continuity: two fluent paragraphs rendered
independently can still jar at the seam. The fix is the omnimodal one —
never let two generators smooth a seam by talking to each other; give the
FORM explicit transition slots between content slots. The handoff gate stops
being only a check and becomes a productive slot: the seam renders
conditioned on both neighbors — the terminal commitment on the left, the
target commitment on the right — and the form chooses the seam's modality.
Sometimes the fluent move from A to B is a sentence; sometimes it is a pull
quote, a chart of both neighbors' quantities, or a divider. A phrased seam is
connective tissue by construction: it may reuse only its neighbors'
vocabulary, carry no numbers, and contradict nothing it connects — else it
falls back to the divider, loudly.

The net is one sentence: fluency stops being something you generate and
becomes something you preserve, because every surface, in every modality,
across every call, is a projection of one pre-linguistic source, and
projections of one source cannot contradict. One log, many folds; one
commitment graph, many renderers.

## Revision discipline

The spine may move during generation. This is the mechanism, not the
exception. Motion is allowed at these grains, cheapest to most expensive, and
applies only to pending sections unless noted.

- **Reorder.** Change the render order of pending sections. Cheap. Fires
  freely when a dependency edge requires it. May not move an accepted section.
- **Insert.** Add a pending section for a bound claim that serves the thesis
  and fits no existing intent. Fires when consolidation surfaces such a claim.
- **Split.** Divide a pending section whose exploration keeps producing two
  non-coherent claim clusters, both spine-relevant.
- **Merge.** Fold two thin pending sections whose claim sets overlap in the
  ledger.
- **Replan.** Rebuild the spine from a fresh whole-log fold. Expensive.
  Flagged loudly. The trigger is defined: a bound, un-vetoable claim
  contradicts the thesis. This is the only motion that touches the thesis.

Accepted sections are frozen. They sit in the log with a settled carry
contribution, so moving one means re-deriving every carry after it. Push
corrections to accepted sections into reconciliation instead.

Two poles bound the discipline. Over-revision is drift. Under-revision is a
dead essay that ignores what the writing found. The knob revisionAggression
sets how strong a surfaced claim must be to move the spine.

## Coherence gates

A section is not accepted on grounding alone. After consolidation, it must
pass gates. A candidate that fails is dropped. If all fail, regenerate with the
failing gate as an added constraint.

1. **Spine advance.** The section serves its intent. Answering a different
   question fails, however well grounded.
2. **Ledger consistency.** No claim contradicts a bound claim in the ledger.
   Contradiction is a hard fail. Repetition without new grounding is a soft
   fail, drop or compress it.
3. **Thread accounting.** Threads due by this section are paid or explicitly
   deferred with a new due point. New threads may open. A due thread may not
   be dropped silently.
4. **Dependency coherence.** The section coheres with its re-illuminated
   declared dependencies, not only with the compressed carry.
5. **Handoff.** The section ends on a terminal claim the next section's intent
   can pick up. This writes priorClaim for the next carry.

## The DAG and long-range coherence

Compression has a real limit. The ledger keeps the claim, not the texture, so
by section 8 the detail of section 2 is gone, and the carry cannot know in
advance which detail section 8 will need. The fix is explicit edges. A section
declares the prior sections it depends on, and on entry those dependencies are
re-illuminated from the log rather than trusted to the compressed trace.
Long-range coherence becomes declared edges, not hope.

## Re-illumination

A section carries the whole essay nowhere. It re-folds from the log on demand.
The log is append-only and the graph is a replayable memoized fold, so any
prior span can be re-fetched at the next cursor move for near nothing. This is
the permission behind keeping the carry small. We do not preload what
attention can re-light. Declared dependencies are the standing case: section 8
depending on section 2 adds section 2's anchors to its retrieval on entry, and
pays only then.

## Carry update

After a section is accepted, fold it into the carry. Compress. This is the
chunk update.

- **priorClaim.** Set to the section's terminal claim.
- **threads.** Close threads the section paid. Add threads it opened.
- **ledger.** Append the section's new commitments with their spanRefs.
- **thesis.** Untouched.

The full section text now lives only in the log. Only its compressed trace
rides forward.

## Doorway flush and checkpoint

Tie the flush to acceptance. On the boundary, decay the active fold's section
spans to zero and keep the carry. Do not accumulate. Without the flush the
fold grows section over section and the integration limit reasserts itself as
drift.

The seam does three jobs, not one. It forgets, by flushing. It checkpoints, by
snapshotting the carry. And it is the single control point. Generation pauses
and resumes cleanly because the carry is a clean snapshot, and a human may
inject a correction into the carry before the next section enters. All control
collapses onto one boundary. Watch a section settle, correct it at the seam if
it settled wrong, resume.

## Real-time projection

Progress is not a bar. If the spine can revise, the denominator moves, so
"section 3 of 8" is a lie the moment section 4 splits. A smooth bar also hides
instability, and instability is the signal most worth seeing. Show the
workspace, not a percentage.

The substrate already exists. Generation emits events to an append-only log,
and the live view is a fold over that stream, exactly as the graph is a fold
over the document log. The real-time view is another projection. It replays.

Events:

```
PLAN_DRAFTED       { spine }
SECTION_ENTERED    { sectionId, deps }
DEP_RELIT          { sectionId, dependsOn }
SPANS_LIT          { sectionId, spanIds }
CLAIM_PROPOSED     { sectionId, claim }
CLAIM_BOUND        { sectionId, claim, spanIds }
CANDIDATE_VETOED   { sectionId, claim, reason }
THREAD_OPENED      { threadId, text, dueBy }
THREAD_PAID        { threadId, sectionId }
SPINE_REVISED      { op, sectionIds }        // reorder | insert | split | merge | replan
SECTION_ACCEPTED   { sectionId, terminalClaim }
CARRY_CHECKPOINT   { sectionId }             // pause, resume, intervene boundary
RECONCILE_FINDING  { kind, sectionId }
```

Fold these into a live panel. What the panel shows:

- The spine with each section in its state, and when SPINE_REVISED fires you
  watch it restructure. The restructuring is the true progress signal.
- The carry live. Thesis fixed at the top. Open threads as visible debts. The
  ledger growing.
- The active fold. Which spans are lit right now, attention made visible, the
  significance loop on screen. When a dependency relights, that prior section
  pulses.

Two lanes. Prose streaming ambiently below. The commitment state foregrounded
above. Tokens streaming is theater. A thread closing is information. Privilege
the state lane.

Convergence reads as coherence. Early in a section the state lane churns:
claims proposed, some vetoed, threads opening. As the section consolidates the
churn drops and it settles. If it will not settle, if claims keep
contradicting, the section is underdetermined or the spine is wrong, and that
is the visible cue for a human to step in at the next seam. The display does
not smooth instability. It makes instability actionable.

Because it is an event log, the whole build replays. You can scrub how an
essay was constructed after the fact. For NPJ that is provenance for the
writing process itself, not only the sources.

## Divergence policy

At the section level, if candidates diverge after veto, the document
underdetermines that section. Two responses:

- **Commit.** If the spine demands a single line, pick the frame the thesis
  implies and drop the others. The spine breaks the tie.
- **Surface.** If the divergence is the finding, write it as content. Say the
  reading depends on which frame you bring, and present both, each grounded.
  For investigative work this is often the honest move.

The choice is set by the section intent, not decided ad hoc.

## Global reconciliation

Each section was written with a small workspace, so cross-section drift is
possible even when every gate passed. After assembly, run one reconciliation
pass. Re-import the assembled draft into the log as a new document, fold it
under the thesis frame, then check:

- Contradiction across sections no single ledger caught.
- Threads still open at the end. Unpaid promises.
- Redundancy. The same claim bound in two places.
- Thesis coverage. Sections that do not serve the through-line.

Each finding is a revision task scoped to one section. Revise that section,
rebuild its carry forward, re-run the pass. Stop when clean or when the
remaining findings are accepted as intended tension. Reconciliation is also
where corrections to frozen accepted sections land.

## Invariants

- Commitments before prose. Prose is rendered from bound commitments, never
  the source of them.
- The thesis is copied, never rewritten, into every carry. It changes only by
  replan.
- Spine motion is bounded and applies to pending sections. Accepted sections
  are frozen.
- Every claim in every section binds to at least one span. No unbound
  assertion survives veto.
- The active fold holds one section's spans plus its declared dependencies.
  Everything else is in the log.
- Every open thread is paid or deferred with a due point. None are dropped
  silently.
- Every generation call conditions on the commitment graph, never on a
  sibling's rendered surface.
- Every surface, in any modality, validates against the payload it bound —
  nothing appears on a surface without a payload source under it.

## Failure modes this prevents

- **Drift.** Forgetting the thesis by the middle. Prevented by the invariant
  thesis, the spine advance gate, and bounded revision.
- **Dead essay.** Ignoring what the writing found. Prevented by making
  revision the mechanism rather than the exception.
- **Dropped loops.** Promises never kept. Prevented by the thread ledger and
  the thread accounting gate.
- **Contradiction.** Later sections denying earlier ones. Prevented by the
  claim ledger, dependency coherence, and reconciliation.
- **Bloat degradation.** Coherence lost as the prompt exceeds the integration
  limit. Prevented by the doorway flush and the small carry.
- **Ungrounded fluency.** Confident prose with no source. Prevented by bind
  and veto at the section level.
- **Dishonest progress.** A bar that hides instability. Prevented by showing
  the workspace state instead of a percentage.

## Knobs

- **N candidates per section.** Two or three. Higher costs sequential
  generation.
- **Exploration width.** How many candidate claims per section before
  consolidation.
- **revisionAggression.** How strong a surfaced claim must be to move the
  spine. Low is drift-resistant and can go dead. High is responsive and can
  drift.
- **Carry size.** Cap the ledger and thread list. Old paid threads drop. Old
  bound claims compress to their contradiction-relevant core.
- **Render ceiling.** The section's prose budget. Paragraph or more — the
  grain of generation, never of verification.
- **Reconciliation depth.** One pass, or iterate to a clean pass.
- **Section granularity.** Finer sections mean smaller folds and more
  doorways. Coarser sections mean larger folds and fewer seams. The direct
  trade of the integration limit against overhead.
- **Event verbosity.** How much of the state lane to surface live.

## Legibility is free

All of this is showable only because the active set is small. A system holding
the whole essay in one huge context could not display its state. There would
be too much of it and none of it differentiated. The integration limit we
accepted for coherence is the same limit that makes the process legible. We
did not add transparency. We forced the workspace small for integration, and
legibility came with it. The bottleneck is the window.

## Where it lives

| concern | file |
|---|---|
| the event log (14 kinds, frozen, logical time) | `src/weave/essay/events.js` |
| the spine DAG + bounded motions | `src/weave/essay/spine.js` |
| the carry (init · update · cap · replan) | `src/weave/essay/carry.js` |
| the five coherence gates | `src/weave/essay/gates.js` |
| the mechanical term reading (contradiction/repeat) | `src/weave/essay/terms.js` |
| the pre-linguistic payload + projections | `src/weave/essay/proposition.js` |
| per-modality renderers + the cross-modal validator | `src/weave/essay/renderers.js` |
| the projection — `projectEssay(log, cursor)` | `src/weave/essay/project.js` |
| the live panel fold — `liveView(log, cursor)` | `src/weave/essay/live.js` |
| the section loop — `runEssay`, the only writer | `src/weave/essay/driver.js` |
| global reconciliation | `src/weave/essay/reconcile.js` |
| the public face | `src/weave/essay/index.js` |
| tests | `tests/essay.test.js` |
| reused: bind/veto | `src/enactor/ground/bind.js`, `src/enactor/ground/section.js` |
| reused: the one render call per section | `src/weave/arc/generate.js` (`generateSection`) |

## EO reading

Optional, for the framework. The spine is a DEF over the log, a definition of
the document's shape, now a graph rather than a chain. Exploration is INS,
proposing new content into a site. Consolidation is SYN under EVA, binding and
keeping what coheres. The gates are EVA against the invariant thesis and the
ledgers. The carry update is REC, recognition of the section as a chunk that
rides forward. The doorway flush is the SEG that closes one site and opens the
next. Spine revision is DEF reopened under EVA. The live panel is the same
fold you run over any document log, turned on the generation log instead.
Longform is sustained INS and SYN across a DEF'd graph, gated by EVA, carried
by REC, and watched by folding its own event stream.
