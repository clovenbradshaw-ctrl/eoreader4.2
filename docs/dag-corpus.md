# DAG-from-corpus — two cursors, and the boundary that is the whole point

`src/surfer/dag/` extracts a DAG from a corpus with **two cursors**:

1. **the discourse DAG** — the flow of content *within the document itself* (`discourseDag`).
2. **the asserted DAG** — the DAG of the content *being described qua itself*: the causal
   graph each source is **read as** proposing, laid side by side and sourced (`assertedDag`,
   `corpusDag`).

Keeping the two apart is not tidiness; it is the EO commitment that **the arrow is in the
narration, not always in the thing.** A document's argument moves in an order (cursor 1); the
world it describes has its own asserted structure (cursor 2); a sequence narrated is not a
causal claim about the world. Conflating them is a *compression artifact* — reading a
simultaneous or merely-adjacent co-arising as a causal sequence — so the two graphs never merge,
and cursor 2 refuses to manufacture an edge from mere reading-order adjacency. Only an explicit
causal marker crosses a narration into an asserted claim.

## The boundary (the spine of the whole design)

A causal effect is a **counterfactual** — what the outcome would have done under the other
condition — and no volume of reading settles it. So this holon **never** produces "X causes Y".
It produces, at three guarded removes:

> the reader **reads** a passage → as proposing that a source **claims** → X causes Y.

Each remove is a collapse the architecture exists to prevent, and each has a guardrail:

| collapse | guardrail | where |
|---|---|---|
| "the corpus says X→Y" ⇒ "X→Y is a fact" | **claim-src** — every edge traces to *who claimed it, where* | `causal.js` `claim.src` |
| "the source claims X→Y" ⇒ "the source *settled* X→Y" | **reading-first** — `reading:true` + `readerConfidence`, rooted at the reader (the `INSTRUMENT`), defeasible | `causal.js` |
| an accidental edge ⇒ an essential one | **no upgrade path** — `proposeStance` reads once and freezes; there is no `upgradeStance` | `stance.js` |

There is deliberately no method that returns an effect size, and none that promotes a stance.
The value on a causal question is **not** the truth; it is stripping the false confidence off
the claim and showing what would have to be true, and is not shown, for it to hold.

## Where this sits in EO's theory of causation

EO is **Ptolemaic** about causation (see *Saving the Appearances*): the nine operators are a
grammar for *receiving described transformations without remainder*, not a claim about the
actual productive "why." This holon is built on that floor and never leaves it — it saves the
appearances of the *causal claims a corpus makes*, and declines the Newtonian productive
mechanism the framework itself flags as open.

Four EO commitments the extractor makes structural:

- **Causation is not a substrate primitive.** The log records what was *observed*, not what
  *happened*; a causal claim lives in the Meant-Graph as interpretation carried by DEF/EVA/REC,
  provenance-bound and revisable — not as a given in the record. `claim-src` + `reading:true`
  is exactly this Humean move made structural: the edge is an inference over the log, never a
  fact found in it.
- **Constitutive dependency ≠ efficient causation.** The operator *helix* is a grounding order,
  orthogonal to temporal-causal order. This holon reads the corpus's **efficient/temporal**
  causal claims (the appearances), which is a different axis from the dependency helix — it does
  not confuse the two.
- **The arrow can be in the narration.** Hence the two cursors, and cursor 2's refusal to read
  discourse sequence as world causation.
- **A causal frame is an object restructured by REC.** A proposed stance is upgraded only by a
  **design** — an intervention, a logged REC on the frame — and a design is not text. That is
  precisely why the tool structurally cannot upgrade one: only intervention data (outside the
  text) or an articulated mechanism (which the text *can* carry — the `generative` stance) breaks
  the tie between accidental and essential.

## The dialectical CON stance — accidental · essential · generative

CON (the bond at Relate × Structure) carries a dialectical stance, and the three values line up
with the distinction causal inference is forced to draw:

- **accidental** — a spurious correlation (mere co-occurrence claimed).
- **essential** — a genuine dependence (X holds Y in place).
- **generative** — a mechanism (X produces Y through an articulated pathway).

From co-occurrence alone the three are **observationally identical**. What breaks the tie is
either intervention data (a design, outside the text) or an articulated mechanism (a pathway,
which the text *can* carry). So the engine types each edge **as the source proposed it** —
reading the stance off the source's own words (`stance.js`) — and it can never *upgrade* an
accidental edge to essential. That sentence is the exact boundary of the tool.

## The four complexities — surfaced and sourced, never removed (`complexity.js`)

The difficulty of a causal question is not the effect size; it is four structures, three of them
textual, that the engine can **find and source** (it cannot remove them — only a design can):

- **confounding** — a common cause: the node *warm from both trails* (Z with an asserted edge
  into both X and Y). The wave-fold convergence applied to causation.
- **reverse** — direction: X→Y and Y→X both asserted.
- **mechanism** — a generative pathway X→M→…→Y through an intermediary, every hop sourced.
- **construct** — the same outcome node measured as different constructs across sources
  ("reported crime" vs "actual crime"), surfaced only when the corpus itself names the
  distinction (witness-first).

## The three NULs, kept apart (`nul.js` — Codd's NULL)

"No evidence that X causes Y" has three different noes, and collapsing them is where causal
bullshit breeds:

- **not-looked** — the corpus is silent (no reading examined X→Y).
- **looked-null** — a reading found the effect measured null (a positive claim of absence).
- **no-null-found** — the corpus looked and asserted an effect, but no reading found a null.

`classifyAbsence` / `absenceCensus` keep them distinct; a silent corpus and a measured null are
never the same finding.

## Adjudication — Pearl's question (`corpusDag`, `distinguishingEvidence`)

`corpusDag` lays each source's asserted sub-DAG side by side and surfaces the structural
**disagreements** (a city report asserting a direct edge with no confounders; a critic asserting
a common cause with no direct edge). `distinguishingEvidence` then asks Pearl's question for each
disagreement — *what evidence would distinguish these graphs* — and reports whether the corpus
**contains** it or is **silent**. The silence is the finding: the corpus states graphs, not the
intervention data that would settle them.

## Two constraints (enforced, not promised)

- **A floor, not a ceiling.** It proposes the space of stories the *corpus* tells, not the space
  of possible stories. It can miss a confounder no source named. `assertedDag(...).floor === true`.
- **Witness-first, all the way down.** Every node, edge, confounder, mechanism, and NUL traces
  to the passage that proposed it. The one thing worse than missing a cause is inventing one.

## API

```js
import {
  assertedDag, corpusDag, discourseDag, readDags,
  distinguishingEvidence, classifyAbsence, absenceCensus,
} from './src/surfer/dag/index.js';

const docs = corpus.map(({ text, id }) => parseText(text, { docId: id, totalRead: true }));

const d1 = discourseDag(docs[0]);          // cursor 1 — the flow within one document
const d2 = assertedDag(docs);              // cursor 2 — the causal graph the corpus is read as asserting
const c  = corpusDag(docs);                // per-source sub-DAGs side by side + disagreements
const q  = distinguishingEvidence(c);      // Pearl's test per disagreement + corpus silence
```

`totalRead: true` opens the parser's inter-proposition discourse links, which the discourse
DAG (cursor 1) lifts to section-level relations. The asserted DAG (cursor 2) reads the causal
clauses directly, so it works with or without the total read.

## Files

- `src/surfer/dag/stance.js` — the dialectical stance lexicon + `proposeStance` (frozen, no upgrade).
- `src/surfer/dag/causal.js` — the causal-clause reader → sourced readings (`claim-src`, `reading:true`).
- `src/surfer/dag/discourse.js` — cursor 1, the within-document discourse DAG.
- `src/surfer/dag/complexity.js` — the four complexities.
- `src/surfer/dag/nul.js` — the three NULs.
- `src/surfer/dag/index.js` — the holon entrance (`assertedDag`, `corpusDag`, `distinguishingEvidence`).
- `tests/dag.test.js` — the green gate.
- `tools/dag/extract_dag.mjs` — run both cursors over a `.jsonl` corpus.
