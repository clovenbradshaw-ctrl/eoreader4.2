# Blind structure — generation over the EOT shape, with meaning withheld

*The experiment: send a hosted model the EOT **structure** of a referent and **nothing** of the
referent, let it reason rationally over the opaque shape, bind the real referents back on the
return, and gate the answer on **propositional continuity**. Ideal use: code.*

Module: `src/model/blind-structure.js` · Probe: `probes/blind-structure.mjs` · Guard:
`tests/blind-structure.test.js`

## The wager

A frontier model is far better at **structure** — ordering, dependency, what-uses-what, where a
thread runs into the void — than it is at resisting the pull of what a *name* "should" mean. Names
carry half-remembered facts a model will confabulate. So we take the structure and throw the
meaning away. `Referent7 -> Referent2 : imports` is something the model can reason about coldly; it
cannot invent a fact about `chargeCard` it never learned, because it never learned `Referent7` is
`chargeCard`. It does the hard reasoning blind; we re-attach the referents.

This is the third membrane in the tree, aimed at a new use — **generation** instead of protection:

| membrane | keeps out | protects |
| --- | --- | --- |
| `weave/write/cursor.js` | hashIds | **correctness** (the model sees clean names) |
| `weave/write/redact.js` | names | **confidentiality** (a remote model sees only tokens) |
| `model/blind-structure.js` | **meaning** | **grounding** (the model reasons over pure shape) |

The blinding membrane is not new — `redact.js` already emits the EOT surface with every referent
collapsed to an opaque token (`emitEot(log, { alias })`, "the model loses reference, not shape").
What this module adds is the **return path**.

## The loop

```
doc ──emitEot(alias)──▶ blinded EOT ──▶ ANTHROPIC API ──▶ EOT over handles ──restore──▶ EOT over referents
 │        (redact.js membrane)          (any backend)                       (redact.js)          │
 │                                                                                     semantic pass
 │                                                                              (re-read as its own doc)
 └──────────────────────── propositional continuity gate ◀───────────────────────────┘
```

1. **Blind.** `blindPrompt(doc, { task })` reuses `redact.js`'s audited EOT carrier to build the
   alias and emit the shape, swaps in a *reasoner* charge (over the prosifier `redact.js` ships),
   and re-asserts the membrane invariant on the exact payload that leaves: no real referent surface
   may reach the model (`assertNoNameLeak`, fail-closed).
2. **Restore.** Every opaque handle is bound back to its real referent (`redact.js` `restore`),
   live if the answer streams (`makeStreamRestorer` never emits a half-restored handle).
3. **Semantic pass.** The restored EOT is re-read as the model's **own conjecture** — the enactor
   door (`ingest/eot.js`), so a note made of the reading cannot pass for the world it read (§8).
4. **Continuity gate.** `continuityGate(before, after)` compares the propositions of the input
   reading with those of the restored output, keyed by **referent label** so two independent
   readings are comparable. It reads the same relation currency as the edge-grounding veto
   (`propositionOfEdge`), and — like every veto here — is a correspondence between two readings,
   never a claim against truth: it makes the answer faithful to the *shape it was given*, not the
   shape faithful to the world.

## The gate's four verdicts

Per base proposition (`subject ⟩ relation ⟩ object`, with polarity on the value):

| verdict | what the after-reading did | closed (audit) | open (generation) |
| --- | --- | --- | --- |
| **continuous** | kept the given relations | pass | pass |
| **narrowed** | dropped some (erosion) | pass¹ | pass¹ |
| **proposed** | added a new relation | — | pass, surfaced as a proposal |
| **fabricated** | asserted a new relation as settled fact | **refuse** | — |
| **contradicted** | flipped a bond's polarity | **refuse** | **refuse** |

¹ erosion is a hard fail only under `requireTotal`.

The `mode` is the whole difference between using this to **audit** ("what does this structure
imply — add nothing") and to **generate** ("propose a fix"). In a closed task a new bond among
referents the model could not see is a fabrication and the gate refuses. In an open task a new bond
is the deliverable — surfaced as a proposal, never refused. A **contradiction** (the model
overturning a bond it was handed) refuses either way: a blind reasoner has no ground to do that.

## Using it

Backend-agnostic — only `model.phrase` is used, so the ECHO backend drives it in a test and the
CLAUDE backend (`model/anthropic.js`, the real Anthropic API) is a drop-in:

```js
import { createModel } from './src/model/interface.js';
import { generateOverStructure } from './src/model/blind-structure.js';

const claude = createModel('claude', { apiKey: KEY });
await claude.load();

const r = await generateOverStructure({
  model: claude, doc: codeDoc, mode: 'open',
  task: 'A binding is used before it is declared. Propose the reordering, as EOT edges.',
});
// r.restored — the answer with real referents bound back
// r.gate     — { verdict, ok, proposals, fabricated, contradicted, dropped, fired }
```

`node probes/blind-structure.mjs` runs the whole thing on the real code paths (with stubs, so a
fabrication is demonstrable without spending a token); set `EO_CLAUDE_KEY` to run probe 5 against
the live API.

## Seams (disclosed, not defeated)

- **Structure linkage.** Blinding hides the *who/what*, not a distinctive relational graph. Keep
  the sent subgraph minimal — the same residual re-identification risk `redact.js` discloses
  (`docs/llm-prosification-security.md`).
- **Polarity through EOT.** A negation is born in natural language (`perceiver/parse`); an EOT
  re-read is always positive. So a `contradicted` verdict is reachable when the *input* carries a
  negated bond, and is exercised at the gate level directly (the probe, the test) rather than
  round-tripped through the EOT surface.
- **Numeric literals.** `redact.js`'s leak guard treats a bare number as a surface that must not
  leak; a doc whose only referents are tiny numbers can trip it. Real code readings alias on string
  identifiers and paths, where the membrane is clean.
