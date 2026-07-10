# The commission — an internet-native creature that borrows a form

> "write me an essay in the style of Montaigne" → the creature goes and gets some
> Montaigne, reads it, and — yes, absorbs its topics into the graph, but more
> importantly — takes its **EOT structure** and shapes the responses semiotically,
> across as many turns as the piece takes.

Document-chat grounds an *answer* in sources. A **commission** is the other
direction: the creature is asked to *make* something — an essay, a story, a
review — and, before it writes, it decides what a good version would look like,
reaches onto the open internet to find one, reads its **form** off the reading,
and lets that form shape what it generates. The topics of a source have always
had somewhere to live (`projectGraph`, the graph fold). Its **form** did not.
This gives it one.

## The necessity — form is not topic

A source carries two things. Its **topics** — who did what, which relate to
which — fold into the graph and are citable. Its **form** — the way it moves
from move to move, the shape of its arc, the grain of its sentences — is
invisible to a topical read, and it is exactly what "in the style of X" asks
for. The EO engine already reads every text as a sequence of **moves** over the
nine operators plus VOID (`perceiver/predict/movelog.js`), and already learns a
bigram **move-grammar** over that alphabet (`perceiver/predict/grammar.js`). The
frozen default grammar was fit once, offline, from one book. The commission fits
it **live, from a work fetched off the internet** — and threads it back into
generation. That single move is the whole idea: *the EOT structure of the
exemplar becomes the discourse syntax of the response.*

## The arc

```
ask ──▶ brief ──▶ hunt ──▶ inspire ──▶ READ ──▶ template ──▶ plan ──▶ shape ──▶ …across responses
       (peel)   (shelves) (choose)  (whole)   (EOT form)  (spine)  (generate)
```

- **brief** (`brief.js`) — peel the ask apart: the deliverable, the exemplar
  (the "in the style of X" clause, absent from the rest of the codebase), the
  topic, the register. A DIFFERENTIATE in front of everything.
- **hunt** (`hunt.js`) — reach the shelves. **Project Gutenberg first** for
  literary form (whole works, the canon, read entire); the **open academic
  shelves** — OpenAlex for breadth + the citation prior, arXiv for full text via
  ar5iv — for scholarly form; Wikimedia for topical ground. All on the one
  fetch-through-proxy path every source rides (`organs/ingest/`).
- **inspire** (`inspire.js`) — *decide what would be a good inspiration.* Each
  deliverable names a **target region of structure-space** (a good essay is
  digressive, first-person, tests its terms; a good review is impersonal,
  citation-laden, lands its synthesis) — the creature's exemplar-free sense of a
  good version. Real candidates are navigated toward it, anchored by a named
  exemplar and topic and weighed by a quality prior (Gutenberg canon, OpenAlex
  citations). A policy (default `propose`) decides whether the pick is committed
  or shown for a nod.
- **template** (`template.js`) — the **EOT structure**, read off the reading and
  frozen as a loadable `StyleTemplate`: the move-grammar (the discourse syntax),
  a positional phase/bias **arc**, and cheap **voice** signatures. The three
  fold into a `styleVector` — the point the exemplar occupies in structure-space,
  what the selector navigates.
- **shape** (`shape.js`) — thread the template into generation. The grammar
  rides `predictNextMove` (below language: the output's operator sequence follows
  the exemplar's transitions); a style directive tells the talker the voice
  (above language). Both default-off — no template, no shaping.
- **plan** (`plan.js`) — the multi-response plan drawn *before* a word is
  written: a spine of section intents in logical order, mapped across the
  responses the piece will take.
- **closure** (`commission.js`) — one call runs the arc and returns a
  serialisable, resumable commission, so the plan and the borrowed form carry
  across the turns it takes to deliver.

## Two navigable spaces

Navigation is embedding-based, and mostly **reuse**: the MiniLM geometric
embedder + the hybrid semantic retrieve already score **topic** space
(`surfer/retrieve`), and the flow-prior PCA manifold is already a discourse-shape
embedding (`data/flow-prior.json`). The commission adds the **structure** space —
a per-exemplar `styleVector` (move fingerprint ⊕ voice signatures) the selector
navigates. Topic distance is MiniLM's job; structure distance is the shape it
cannot see. When the embedder is warm, `topicResonance` uses it; otherwise it
degrades to token overlap, so the whole arc runs offline.

## Style exemplars are a different kind of source

A work admitted as a model is role-tagged `style-exemplar` (`hunt.js`,
`STYLE_ROLE`) — a different kind of source than a topical one. It still absorbs
into the graph for topics, but its reason for being there is its **form**, and
the surface shows it apart: its extracted structure (the move fingerprint, the
arc, the voice), not just its entities. *(Surface wiring — the left-panel
treatment and the `app.js` gate that drives `runContinuation` with the shaped
options across responses — is the next seam; the engine exposes exactly the hooks
it needs: `openCommission`, `nextResponseOptions`, `advanceCommission`,
`serialize/resumeCommission`.)*

## Across responses

`openCommission` returns state `{ responsesDone, units, covered }`;
`serializeCommission` round-trips it to plain JSON (the template is already plain
data — a grammar, an arc, signatures — so the borrowed form survives a reload
even though the fetched text does not); `resumeCommission` rehydrates it;
`advanceCommission` folds it forward one response. "A completion across multiple
responses" is exactly: persist the commission in the session, feed it back, and
generate the next run under the same grammar.

## EO reading

The brief is a **DEF·SEG** — differentiate the ask into its parts. The hunt is
**SIG·INS** — attribute and instantiate sources from the Void. The choice is
**EVA·CON** — evaluate candidates against the target and bind the best. The
template is **REC·SYN** — recognise the exemplar's regularity as a rule and
synthesise it into a paradigm. The shaping is **EVA·SIG** — read the paradigm and
attribute it onto the draw. The plan is a **DEF** over the intended piece. The
commission is the closure that runs them forward and carries the paradigm across
the log.

## Where it lives

| concern | file |
|---|---|
| read the ask → brief | `src/weave/commission/brief.js` |
| the EOT structure template | `src/weave/commission/template.js` |
| decide a good inspiration (structure-space) | `src/weave/commission/inspire.js` |
| hunt the shelves, role-tag the exemplar | `src/weave/commission/hunt.js` |
| shape generation toward the structure | `src/weave/commission/shape.js` |
| draft the multi-response plan | `src/weave/commission/plan.js` |
| the closure, resumable across responses | `src/weave/commission/commission.js` |
| the public face | `src/weave/commission/index.js` |
| tests | `tests/commission.test.js` |
| the academic shelves | `src/organs/ingest/arxiv.js`, `src/organs/ingest/openalex.js` |
| the grammar thread into the loop | `src/weave/longgen/direction.js`, `continuation.js` |
| reused: move-log + learned grammar | `src/perceiver/predict/` |
| reused: the flow witness (arc, shape manifold) | `src/surfer/flow/` |
