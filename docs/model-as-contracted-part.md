# The plan: the model as a contracted part

> Law 1 says a part declares `{ops, terrains, stances}` and the kernel checks it. The
> frontier model is a part. Give it the narrowest contract the work allows and let the
> checkpoint you already run reject anything wider. Security becomes contract *width*,
> not policy you have to remember — and the redaction membrane already shipped
> (`weave/write/redact.js`) is the first instance of it: a terrain restriction (no
> `Entity`), enforced mechanically (`assertNoNameLeak`).

This is the unifying frame for five moves. The good news the code delivers: the
primitives for almost all of them already exist. The open width is concentrated at ONE
place — there is no declared contract on the model-as-part, so the firewall today is
*post-hoc* (parse the prose back, strip what the sources don't witness) instead of
*a-priori* (the move isn't in the output alphabet). Close that keystone and the other
four moves snap onto machinery already in the tree.

## Scorecard — what the tree already does, where width is open

| Move | State | Where it lives / what's missing |
| --- | --- | --- |
| **1. Model declares a contract** `{ops,terrains,stances}` | ◐ machinery yes, **not applied to the model** | Kernel: `core/contract.js` + `tests/contracts.test.js` (every *module* is checked). The model-as-part is **not** contracted. Today's substitute is the post-hoc veto: `enactor/ground/provenance.js` `classifyProvenance` (verbatim/grounded/**fabricated**), `enactor/factcheck/correspond.js` (edge veto), `enactor/factcheck/propositions.js` (DEF-claim veto). Redaction gave the *terrain* half (`redact.js`: no `Entity`). **Open: the `ops`/`stances` half + a checkpoint that rejects an assembly carrying an operator with no prior judgment event.** |
| **2. Surf the log, not files** | ◑ ingest+fold+judge **built**; resolve/pack/cache **open** | `organs/code/`: `readCodebase` → EOT → log (`eot.js`, perceiver door), `helix.js` (Tarjan dependency order), `issues.js` (judgments read natively off tuples). **Open: RESOLVE** a phrase→symbol before the model call (the activation-decay trick exists for pronouns in `turn/disambiguate.js` / perceiver — not wired for symbols); **the symbol dossier as the 12-line pack**; **judgments as a cross-session cache** (the reload primitive exists — `ingest/eot.js` READ_BACK-of-prior-self — but nothing serves prior EVA/REC as grounding for a repeat question); **design conversations as events**. |
| **3. Hora as token budget** | ◐ prose partial, code open | `weave/write/paragraphs.js` already rides the answer-so-far back as the model's own turn to reuse KV cache (never re-prefill); `weave/arc` has token backstops. **Open: "emit one sub-assembly, `!eva`, set down, never re-send what stands"** — the watchmaker cost discipline. That's the coder pipeline (unmerged, below). |
| **4. EOT as the security boundary** | ○ **not on this branch** | The mask/checkpoint that makes bad output *unrepresentable* is `src/coder/` on the **unmerged PR #40** (`mask.js`, `checkpoint.js`, `repair.js`, signed `ledger.js`). The ingester already fails closed (a malformed EOT line → diagnostic, never a crash). **Open: land #40 and route the model's output through the checkpoint**, so `eval`/socket/exfil are off the output alphabet. |
| **5. Receipts for inference** | ◑ ledger **built**, receipt fields **thin** | `rooms/audit/eot-ledger.js` logs every op as EOT with the **perceiver/enactor door** law (`prompt`, `generate`, `route`, `retrieve`, `bind`, `veto`, `revise`), raw prompt+output kept, exports `.eot` and `.jsonl`. `model/interface.js` `describeModel` names the backend/model. **Open: the `generate`/`prompt` records don't carry prompt-HASH, model-VERSION, evidence-SEQs, or checkpoint-VERDICT as structured fields** — the four that make it `git blame` for inference. Small, high-value. |
| **Routing** F / L / Neither | ◐ mechanism yes, policy unencoded | Backends exist (`model/webllm.js`, `wllama.js` local; `anthropic.js` frontier; `coders.js`), routed by `turn/meta-route.js` / `model/reach.js`. **Open: gate dispatch on terrain/sensitivity** — frontier sees only redacted packs; the sensitive corpus stays local; identity-merge/publish route to *neither*. `redact.js` is the enabler already in place. |

Legend: ● done · ◑ substantially built, named gap · ◐ machinery present, not applied · ○ absent here.

## Move 1 is the keystone — the model contract, checked by the kernel

Everything else leans on this. Declare it beside the module contracts:

```js
// the frontier model, as a part — the narrowest contract the work allows
export const MODEL_CONTRACT = contract({
  ops:     ['NUL', 'SIG', 'CON', 'SYN'],   // may restate, flag, connect, compose
  terrains:['Kind', 'Field', 'Lens'],      // works over a graph of tokens — NO Entity (identity)
  stances: ['Tracing', 'Binding'],         // never Making at the identity grain
});
```

- **`ops` without `DEF`/`EVA`/`REC` is the defamation firewall.** The model may *render* a
  judgment that already exists as a logged event (a source said it; an editor ruled it) —
  that's a `SIG`/`CON` pointing at a witness. It may never *originate* one. A sentence
  whose parsed proposition carries an interpretive operator with **no prior judgment event
  to point at** fails the checkpoint. Not a style rule — a kernel rejection, the same shape
  `tests/contracts.test.js` already runs on modules.
- **`terrains` without `Entity`** is source-protection and PII as a *terrain the model has
  no address in*, not a policy. Redaction already enforces this half
  (`redact.js`/`assertNoNameLeak`); this names it as contract.
- **Prompt-injection blast radius is bounded by the alphabet.** Injected text from a
  scraped PDF is just a `SIG` in the log; the worst a hijacked model can emit is an
  assembly that fails validation. It can't fire a tool, write the ledger, or publish —
  those moves aren't in its `ops`.

**The one new mechanism to build:** a per-call checkpoint `judgeAssembly(propsFromModel,
log)` that (a) parses the model's output into resolved propositions (the parser
`enactor/factcheck` already uses), (b) rejects any whose operator is outside
`MODEL_CONTRACT.ops`, and (c) for a permitted interpretive render, requires a prior
judgment event in the log at the cited seq. This *upgrades* today's post-hoc veto from
"strip fabricated claims after the fact" to "the move was never representable" — and it
reuses the contract factory + the factcheck parser already in the tree.

## The other four, in dependency order

1. **Receipts (move 5) — smallest, do first.** Add four fields to the ledger's `generate`
   record: `promptHash`, `model` (from `describeModel`), `evidenceSeqs` (the log seqs the
   pack was built from), `verdict` (the move-1 checkpoint result). One edit to
   `eot-ledger.js` `generate()` + its callers. Now every assembly is attributable: *which
   call produced this, what was it shown, did it pass.*
2. **The checkpoint + MODEL_CONTRACT (move 1).** As above. Land the `src/coder/` checkpoint
   from PR #40 (move 4) as its substrate, or a minimal `judgeAssembly` if #40 stays
   unmerged.
3. **Judgment cache (move 2).** On a repeat architectural question, serve the prior
   `EVA`/`REC` from the log as grounding — the reload primitive exists
   (`ingest/eot.js` READ_BACK-of-prior-self); wire a resolver so "explain EO" is a log hit,
   not an inference. This is the compounding win: the log is the persistent context, the
   model stays stateless and cheap.
4. **The dossier pack + RESOLVE (move 2).** Ground a phrase to a symbol before any model
   call (activation-decay, as pronoun resolution does), then `HOP`/`FOLD` a 12-line dossier
   (definition · callers · last three changes · covering tests · prior verdicts) as the
   pack. `organs/code/helix.js` edges + `issues.js` verdicts are the raw material.
5. **Hora discipline (move 3)** and **routing policy** fall out: once assemblies are
   checkpointed sub-assembly by sub-assembly, "set down what stands, never re-send" is the
   natural loop; once the pack is redacted and terrain-typed, the F/L/Neither router is a
   dispatch on the pack's terrain.

## The split this buys — where frontier capability earns its cost

- **Frontier** (redacted packs only): route questions → plans; adjudicate genuinely hard
  packs; write kernel-adjacent code that can't be catalog surfaces (keeps human review +
  tests); red-team its own drafts and its own EOT.
- **Local** (`webllm`/`wllama`): bulk annotation, ingest, span extraction — anything
  touching the sensitive corpus.
- **Neither** (kernel/human): identity merges on private individuals; publish decisions.

## How it composes with what already shipped

`weave/write/redact.js` is not a one-off — it is `MODEL_CONTRACT.terrains` made real ahead
of the rest: the model already works over `Referent`/`Value` tokens with no `Entity`
address, proven by a kernel-style mechanical check (`assertNoNameLeak`, the mirror of
`cursor.js`'s `assertNoLeak`). Move 1 generalizes it to the `ops`/`stances` axes; move 5
gives every such call a receipt; move 2 makes the pack it structures a dossier off the log;
move 4 makes even the *code* it writes fail-closed by output alphabet. One discipline —
*a part declares its contract and the kernel checks it* — carried from the modules to the
model.
