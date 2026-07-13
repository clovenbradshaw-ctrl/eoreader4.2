# Multi-source corroboration — a fact standing on one voice is not yet corroborated

> When an answer is *found* but rests on a single, meaningfully-distinct source, the engine reaches
> for a **second, independent** one — hopping until it finds it or can confidently say none exists.
> The mirror image of the void gap-fill: the void reaches out when there is *no* source; this
> reaches out when there is only *one*.

This is the other end of the diversity story `docs/web-search.md` and `reflectAnswer`
(`enactor/ground/reflect.js`) begin. Reflection reads the answer back through the document graph and
counts, per claim, the independent **root origins** that witness it — folding a document and the
note taken off it into one origin. Corroboration asks the question reflection leaves open: are those
origins really independent **voices**, and do they reach two?

## The three conditions that reach for the web

A turn goes online (in `auto`; proposed as a button in `confirm`) under three measured conditions —
the first two already lived in `turn/propose.js`; the third is what this adds:

1. **A void** — the document holds no answer (`answerable`, or an honest abstention). → a **gap**
   search: go *find* the answer. There is no source to be distinct from.
2. **An answer bound to nothing / thin coverage / an unsettled referent.** → a **gap** or
   **witness** search, as before.
3. **A single, meaningfully-distinct source** — the answer *is* grounded and cited, but every
   witnessed claim collapses to fewer than two independent voices (`underCorroborated`). → a
   **corroborate** search: go find an *independent second* voice. This is the "not sourced from
   multiple, meaningfully distinct sources" case.

A void dominates a single-source read: an answer with *no* witnessed relation is a gap, never a
corroboration. So `corroborate` fires only on an otherwise-sound, grounded, cited answer.

## "Meaningfully distinct" is decided by facts, not coefficients

`enactor/ground/corroboration.js` measures distinctness the way the rest of the engine avoids a
hand-tuned coefficient soup and a chosen threshold (the doctrine the surfer's salience, the void
null, and `turn/research.js` all hold — *"the shares of ONE surprise decide, not a chosen bar"*).
Two sources are the **same voice** only when a **fact** says so:

- the same id — literally the same document;
- the same **content hash** — a byte-identical reprint (the proxy stamps a sha256 at fetch time);
- the same **registrable host** — one publisher and its mirrors (`en.wikipedia.org` and
  `simple.wikipedia.org` both reduce to `wikipedia.org`);
- the same **byline** — one voice even across two hosts (a syndicated columnist).

This is a **provenance** test, on purpose — never a content one. Two independent reports of one
event *necessarily* share the fact (the fine, the figure, the name), so any content-similarity
threshold would fuse them, and there is no honest cutoff separating "the same wire copy reworded"
from "two reporters who saw the same thing." Content sameness is not source sameness. The one
residual blind spot — a reworded syndication across two hosts sharing no content hash — is left as a
known limitation rather than papered over with a tuned bar. Where the engine *does* measure — does a
page **support** the claim (`verifyAgainstWeb`), which **lead** to chase next (the one surprise,
`core/surprise.js`) — the Born-rule machinery does it.

`distinctVoices` then clusters the same-voice sources and counts the clusters; the corroboration bar
is **two** — the definition of corroboration (a second, independent witness), not a tuned number.

## The walk — hop until corroborated, or confidently absent

`turn/corroborate.js` `runCorroborationWalk` reuses the curiosity walk's primitives
(`turn/research.js`): best-first over the surprising leads each page surfaces, every query kept
coherent by the standing anchor. The **keep** rule is what differs — a fetched page counts only when
it both:

- **supports** the answer's distinctive claim (`verifyAgainstWeb`, the established web-witness
  check, with its own default), and
- is a **distinct voice** from every witness already held (`isDistinctCorroborator` → `sameWitness`).

The moment the distinct-voice count reaches the target (two — the source already behind the answer
plus one independent corroborator), the walk stops: it **found** it. If it runs the frontier dry,
spends its hop budget, or spends `dryPatience` hops adding nothing, it stops and reports the **absence** —
the honest terminal the request asks for: *"I searched N leads and couldn't find an independent
source that corroborates this — treat it as single-source."*

Either way the answer is **kept**. Corroboration *confirms*; it never rewrites the answer (the same
discipline as the chat `verify` augment). The outcome rides back as `result.corroboration`
(`{ verdict, corroborated, sources, hops, query }`) and surfaces as a flag beside the answer, with
the independent source to click through to when one was found.

## Where it lives

| piece | module |
|---|---|
| the "meaningfully distinct" measure | `enactor/ground/corroboration.js` — `sameWitness`, `distinctVoices`, `underCorroborated` |
| the corroborate trigger | `turn/propose.js` — opt-in via `ctx.reflection`, dominated by any real gap/witness |
| reflection threaded to the proposer | `turn/pipeline.js` — `ctx.reflection` |
| the hop-until-corroborated walk | `turn/corroborate.js` — `runCorroborationWalk`, `runTurnWithCorroboration` |
| the auto-mode wiring + surfacing | `rooms/reader/app.js` — the `corroborate` arm, `finishMessage` |
| tests | `tests/corroboration.test.js`, `tests/corroborate.test.js` |
