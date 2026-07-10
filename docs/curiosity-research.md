# Curiosity-guided research — following surprise across hops

> Research is the engine reaching past one page to the next — not by firing every follow-up at
> once, but by following the single thread that surprised it most, for as many hops as it stays on
> the question, and stopping when it has strayed too far from what was asked.

This is the multi-hop sibling of `docs/web-search.md`. That path is **single-shot**: the `auto`
gather formulates one query, fetches four results, folds them into the answer scope, and answers.
That fills a single gap. But a good answer often opens further questions — a fetched page names a
director, a place, a date the engine had never seen — and the honest next move is to go ask about
*that*. Curiosity-guided research does, **without shotgunning**: it expands exactly one thread per
hop, the most surprising one, and quits when the seam is mined out.

## Curiosity is not a new metric — it is the one surprise, pointed at the web

The engine already has exactly one surprise (`src/core/surprise.js`, `docs/spec-one-surprise.md`):
`D_KL(posterior ‖ prior)` over a γ-decayed profile in a fixed basis. Research reuses it verbatim.
**Curiosity is the surprise of a freshly fetched page against the γ-decayed profile of everything
read so far.**

- A page that only restates what we know moves belief by ≈ 0 bits → **low curiosity → a dead
  thread**, dropped.
- A page that introduces a new figure, claim, or relation moves belief a finite positive amount →
  **high curiosity → follow it**.

And the same computation hands back *what* was surprising: `bayesBy`, the per-dimension KL
contribution, names the atoms belief moved toward. **Those atoms are the next leads.** The search
is steered by the measured gap, not a keyword heuristic — active inference (`docs/web-search.md`,
"fire where expected information gain is highest"), run as a loop.

`curiosityOf(prior, arrival)` is a thin rename over `surpriseAt` so the call site speaks
"curiosity" while the arithmetic stays the one shared core. A drift in `surpriseAt` is a drift
here, by construction — there is no second metric to keep in sync.

## The loop — best-first over curiosity, not breadth-first

`runCuriousResearch(seed, { search, maxHops, gamma, curiosityFloor, patience, k })`
(`src/turn/research.js`):

1. **Front-end map.** `profileOf(text)` reduces a page to a term-frequency `Map` — the surprise
   basis. Embedder-free and offline, so the curiosity measure runs in a unit test exactly as in
   the browser. (Repetition is signal: a page *about* Coogler says "Coogler" many times, and that
   mass is what lifts that thread above the others.)
2. **The frontier** is a priority list keyed by *expected* curiosity — the KL contribution that
   surfaced each lead. The seed leads at `+∞` (always explored first); discovered leads enter at
   their realized contribution.
3. **Each hop** pops the single most-promising thread (`popBest`), fetches it (one focused query,
   `k` results — not a fan-out), and measures *realized* curiosity against the running prior:
   - **Alive** (`bits ≥ curiosityFloor`, or the seed): the pages join the ground, the arrival
     folds into the prior (`foldInto` — γ-decay incumbents, deposit the new), and its surprising
     terms (`leadsFrom`) push onto the frontier. Deeper threads can now out-rank shallow ones, so
     the walk follows where the information actually is.
   - **Dead** (`bits < curiosityFloor`, or an empty fetch): dropped. It is **not** folded in and
     spawns **no** leads — the discipline that stops the loop wandering into ever-more-tangential
     pages.
4. **Stops** at one of three boundaries: the walk strays too far from the question (the **saliency
   leash**, below — the real governor), the frontier empties (nothing left to be curious about), or
   the hop budget `maxHops` is spent (the hard backstop, default 6 — only ever a runaway guard).

Every next query is kept coherent by the **anchor** (the seed's standing subject):
`nextQuery("X-Files revival", "coogler")` → `"X-Files revival coogler"`, never the bare term — the
same namesake guard `proposeWebSearch` applies (`web.js`). One thread, sharpened.

## The leash — surprise pulls out, saliency pulls back

Multiple hops are good; *endless* hops are not. The danger is subtle: **a page is often surprising
precisely because it has wandered off-topic.** "Who directs the X-Files revival?" → the director is
Coogler → Coogler made *Black Panther* → Wakanda → vibranium metallurgy. Every step is surprising;
by step four the walk is reading about fictional metals and has forgotten the question. Surprise
alone is a force that pulls the walk *outward*.

So curiosity is leashed by **saliency** — and saliency is, again, an instrument the engine already
has: the Born rule (`src/surfer/salience.js`). `bornSalience(topic, hop)` is `|⟨topic|hop⟩|²`, the
squared cosine of a page against a topic frame, in the same discrete term space — embedder-free,
the same projection the surfer uses to decide what a *conversation* is about.

- The **topic frame** is fixed: the question's own terms (weighted to dominate) plus what the seed
  page established, frozen after the first hop. It is anchored on the **question**, not on the
  running walk — so there is always something fixed to stray *from*. (Anchoring it on the walk
  would let the frame drift along with the search and defeat the whole point.)
- Each hop's content is scored against that frame. The **seed page's** own saliency is the
  **baseline** — "this is what on-topic looks like for this question." A later hop has **strayed**
  when its saliency falls below `salienceRatio × baseline` (default `0.34` — a third as on-topic as
  the seed). Relative-to-baseline, so the floor self-calibrates: a three-word question and a
  paragraph-long one have very different absolute overlaps, but "a third as relevant as the seed"
  means the same thing for both.
- A strayed hop is **dropped** — not grounded, not expanded. `strayPatience` consecutive strays
  (default 2) end the walk: the search has left the question's orbit and isn't coming back.

Saliency also shapes the frontier, not just the stop: a lead's priority is its surprise **×** the
saliency of the page it was found on (`weight × (0.1 + salience)`). So a surprising term discovered
on an on-topic page out-ranks an equally surprising one found while already drifting. The walk
follows surprise **within the orbit of the question** — and only when the salient, surprising
threads are exhausted does it drift, and then the leash stops it.

Two distinctions the trace makes explicit:

- **strayed** (off the leash) ends the walk; **exhausted** (on topic but unsurprising — a
  restatement) does not. A relevant restatement still grounds the answer; it just opens no new
  thread. Only leaving the question stops the search.
- The **seed** is always kept and folded regardless of either floor — it is the question's own
  footing and the yardstick the leash is measured against.

## Why this is not shotgunning

Shotgunning is firing a fan-out of follow-up queries on every term a page mentions and drowning
the answer in tangential pages. The loop is the opposite on every axis:

| | shotgun | curiosity walk |
|---|---|---|
| queries per hop | many, parallel | **one**, the most surprising |
| order | arbitrary / breadth-first | **best-first** over realized surprise |
| which leads | all terms | only the heaviest few, each weighted by saliency |
| when it stops | a fixed count | when it **strays too far from the question** (the saliency leash) |

The seed is always kept as the answer's ground, floor or not — it is the question's own footing,
not a lead.

## Surprise's failure mode — and why OCR garbage doesn't lead the walk astray

Surprise rewards novelty, so its sharpest failure mode is **the most novel "word" on a page being
garbage** — an OCR crumb (`rn1`, `c0mpany`, `0f`), a markup smear, a hyphenation artifact. Such a
token has never been seen, so it tops `bayesBy` (maximal KL) and would, naïvely, become the very
next query. Two layers stop that:

1. **The saliency leash is the guarantee.** A garbled page shares almost nothing with the topic
   frame — and its garbage even *inflates the denominator* of the Born cosine (more distinct tokens
   → lower overlap), so it scores *lower* saliency, not higher. A mostly-garbage page therefore
   **strays** and is dropped: it can never ground the answer, and a junk *thread* dies on the next
   hop (the page it fetches has ~0 saliency too). The blast radius is bounded by `strayPatience`.
2. **A shape filter is the efficiency valve.** `plausibleLead(term)` rejects the artifact *shapes*
   before they can be chased — a digit wedged inside letters (`l1ne`, `v0te`), a vowelless run
   (`rn`, `thc`), a triple-repeat (`vvv`), a long consonant smear. So an on-topic page with a few
   scanning artifacts still grounds the answer, but the artifacts never become the next query.
   Conservative by construction: real words, names, and digits-at-end tokens (`covid19`) all pass.

The filter is best-effort (it can't catch a garbled token that happens to be word-shaped); the
leash is the actual safety property. Together: junk cannot become the answer's ground, and obvious
junk cannot even cost a hop.

## The orchestrator and the app wiring

`runTurnWithResearch(args, { search, runTurnImpl, maxHops, … })` is the inverted-flow entry: gather
by a curiosity walk, fold every kept page into the turn scope, then answer in **one** grounded pass
over `[web + docs]`, with a `research` trace (hops + curiosity per hop + kept sources) riding back.
`runTurnImpl` and `search` are injected, so the whole flow is offline-testable
(`tests/research.test.js`).

In the app (`src/ui/app.js`), the `auto` gather now runs the walk instead of the single search.
`STATE.researchHops` (default 4) is the budget. The feedback runs in the order the work happens:
first `formulateSearchQuery` (web.js) rewrites the chat turn into a standalone search query with an
LLM call — surfaced as `🔎 I'm going to research this — working out what to search for…` while it
runs — then `researchAnnouncement(q)` promotes that query into voice
(`I'm going to research this. Here's what I'm searching for: "…" — I'll follow what surprises me…`),
so the user sees the DECISION and the exact query before any hop. A per-hop progress beat then shows
the live thread (`🔎 hop 2/4: "X-Files revival coogler"…`), and the verbose web-result block surfaces
the full hop trace collapsed (`renderWebResult` → `.wr-hops`): which thread, how many bits of
surprise, kept or dropped as a dead seam — so "it followed its curiosity" is legible, not a black box.

## What is next

- **Richer basis.** The web front-end profiles raw prose by content term; the deeper engine has a
  proposition/figure basis (`reading.js`). Parsing each hop's page through that basis before
  measuring curiosity would let the walk be surprised by a *relation*, not just a token.
- **Cross-source promotion.** The "deep part" of `web-search.md` — an entity two-sighted across
  hops completes the local graph — is the natural payoff of a walk that gathers many pages.
- **Budget by stakes.** `maxHops` is fixed per turn; spending more hops where uncertainty × stakes
  is highest is the precision-weighting dial the rest of the engine already uses.
