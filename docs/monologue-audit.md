# Auditing the inner monologue — is it really helping?

> The deep reader reflects when the model is not otherwise busy (`docs/deep-reading.md`). The
> docs *promise* the reflection enriches the reading and never touches the record it can witness.
> This is the instrument that turns that promise into a measurement — a verdict, per document, on
> whether the monologue is HELPING, RUMINATING, ECHOING, IDLE, or UNSAFE.

The engine (`fold/deep-reading.js`) can surf to a place, fold it, and deposit a reflection — but
depositing is not the same as *helping*. A monologue that keeps saying the same thing is
ruminating; one that paraphrases the sentence it read is echoing; one that leaks a reflection into
the witnessed graph is actively harmful. `fold/audit.js` measures which of these is happening, on
the system's **own** terms, with **no model and no weights** — the same discipline as the engine it
audits.

## What "helping" means here, made measurable

Four dimensions, each grounded in a claim the system already makes:

| dimension | the claim | the measurement |
|---|---|---|
| **distinct** | reflections *repeating* is churn (`docs/deep-reading-churn-2026-07.md`, r=0.84 vs paragraph repetition) | `rumination` = max pairwise n-gram Jaccard among the reflection bodies. Turned on the monologue's own output: if the inner voice loops, it is not enriching. `distinctness = 1 − rumination`. (The same *family* of measure as the validated churn detector — content-word n-grams — not its byte-exact tokenizer; the threshold is a knob.) |
| **novel** | a reflection is an EVA — an *interpretation*, never a restatement of the span it read (`reflect-prompt.js`'s restatement guard rejects a reaction whose grams already sit in a source span, >0.6) | `echo` = how much of a reflection is already in its sources. `novelty = 1 − mean echo`, and the `echoing` verdict fires on the per-item **rate** of reflections over the restatement line (a mean would let a few verbatim echoes hide). The same *notion* as the guard, measured post-hoc — the model-free monologue enforces no such guard at write time, so restatement is exactly what this catches. |
| **on content** | the surf's peak should land on the reading, not the reference apparatus (`deep-reading.js`'s citation guard exists for this) | `apparatus` = fraction of reflections whose place is a citation / bibliography line, using a **broader** detector than the engine's (it must catch what the engine let through: bare quoted titles, `(PDF)`, journal/ISBN/doi lines). This is the dominant real-world failure on merged corpora. |
| **significant** | the governor commits only where the place **beats the reach's band** (I3) | `bandMargin` = mean(surprise − band); `yield` = committed / considered. Did it surf a lot and say little? |
| **safe** | a reflection is reafference — `canWitness` false, band void — it can **never** become a witnessed fact (§8, the firewall) | project the graph with everything tagged `reflection` **stripped** and again as-is; the depicted **facts** (edges) and **figures** (entities) must be identical. Stripping by the *tag* (not the EVA op) is what gives the check teeth — a reflection forged with a witnessable op would project into an edge present only in the unstripped graph, so `factsAdded` fires. Plus: every reflection must be reafferent (`canWitness` false, enactor door) and void. |

## The verdict

Gated by the firewall, then by what was deposited:

- **unsafe** — a reflection entered the witnessed record (a fact/figure appeared, or a reflection
  is not reafferent/void). Overrides everything: an unsafe monologue scores **0** however
  eloquently it reads. This should be structurally impossible (`projectGraph` skips EVA by type) —
  the audit is what *proves* it stayed that way, and catches a reflection mis-minted as anything
  witnessable.
- **idle** — nothing was deposited. The governor held it (nothing beat the band), or the surf's
  only interesting places were citation cruft the apparatus guard refuses. Not harmful; just quiet.
- **noise** — half or more of the reflections land on citation / reference apparatus
  (`apparatus ≥ 0.5`), not the content. This is the dominant failure on a real **merged corpus**:
  the engine's terminal-tail citation guard can't bound reference sections interspersed across many
  sources, so the surf peaks on bibliography titles and the voice names their nouns
  (`"Self-recognition in animals: Where do we stand 50 years later?"` → the "thought" *Self we
  years*). Note these can be perfectly *distinct* and *novel* against each other — only the
  apparatus dimension catches them.
- **ruminating** — the bodies repeat each other (`rumination ≥ 0.5`). The inner voice is looping.
- **echoing** — the bodies restate their sources (`echoRate ≥ 0.5` — half or more cross the
  per-item restatement line). Paraphrase, not interpretation. This is the honest state of the
  **model-free** monologue on most prose (it voices the bond that arrived at each peak) — the gen
  battery's finding that a genuine model voice is what flips it
  (`docs/deep-reading-gen-battery-2026-07.md`).
- **helping** — safe, distinct, novel, on-content reflections that beat the band.

`score` is a **geometric mean** of the available dimensions (so a single weak axis pulls it down,
rather than being averaged away), discounted by apparatus contamination (`× (1 − apparatus)`) and
gated to 0 by the firewall.

## How to run it

### The API (pure, model-free)

```js
import { auditMonologue, auditLog, reportAudit } from './src/surfer/fold/index.js';
import { surfFold } from './src/surfer/index.js';
import { parseText } from './src/perceiver/parse/index.js';

// RUN a fresh reader over a document and audit what it produces (full metrics — yield + margin)
const audit = auditMonologue(parseText(text), { surf: surfFold });
console.log(reportAudit(audit));           //  verdict, dimensions, per-reflection why
audit.verdict;                             //  'helping' | 'ruminating' | 'echoing' | 'idle' | 'unsafe'
audit.firewall.factsAdded;                 //  0 — no reflection became a fact

// READ-ONLY: audit whatever a reader already deposited on the log (no run, no mutation)
const live = auditLog(restedDoc);          //  distinctness · novelty · firewall — the human core

// inject a model voice to audit the MODEL-voiced monologue instead of the model-free note
auditMonologue(doc, { surf: surfFold, reflect: modelVoice });
```

`auditMonologue` deposits the reflections onto `doc.log` (that is the monologue's real behaviour);
the firewall check then proves the deposit was safe. Pass a freshly-parsed doc when you don't want
them kept. `auditLog` never mutates.

### The battery

```bash
node eoreader4-eval/monologue-audit.mjs              # model-free, built-in samples
node eoreader4-eval/monologue-audit.mjs a.txt b.md   # your own documents
node eoreader4-eval/monologue-audit.mjs --json       # the audit objects as JSONL
node eoreader4-eval/monologue-audit.mjs --voiced     # add a MODEL-voiced arm (Qwen2.5-0.5B) and
                                                     # compare — does the voice move echoing→helping?
```

The default run is model-free and needs no network. `--voiced` is the honest comparison the gen
battery motivates: same documents, same surf, only the reflection voice varies.

### The surface — "Is this helping?"

`inner-monologue.html` (the standalone monologue surface) carries an **Is this helping?** button.
Hold a document, let the reading rest, and press it: the graph rail shows the verdict, the score,
the *distinct* and *novel* bars, and the firewall line — `auditLog` rendered as pure presentation,
no model. It re-runs live as fresh thoughts stream in.

## Measured — what the instrument shows out of the box

On the built-in samples, model-free:

- **developing** (a figure-rich passage) → **echoing** — the model-free note names the bond at each
  peak (distinct from each other, but restating the source); every reflection reafferent, 0 facts
  added.
- **restatement-loop** (a claim repeated six times) → **idle** — a pure loop has no surprise peaks,
  so the monologue correctly stays quiet.
- **reference-tail** (the developing passage + a References section) → the monologue reflects on the
  **same** prose places (§3/§5/§8) and deposits **zero** reflections on the citation lines — the
  apparatus guard working, the tail changing nothing.

Across every run the firewall is **INTACT — 0 facts added to any record**. Inject a genuinely
interpreting voice and the same passage reads **helping**; a voice that repeats itself reads
**ruminating**; run it over a merged corpus whose reference sections the engine's guard can't bound
and it reads **noise** (score 0, "100% on citation apparatus"). The instrument discriminates the
failure modes from the one success.

## Where it lives

| concern | file |
|---|---|
| the audit instrument (pure, model-free) | `src/surfer/fold/audit.js` (`auditMonologue`, `auditLog`, `firewallAudit`, `reportAudit`) |
| the battery + the model-voiced arm | `eoreader4-eval/monologue-audit.mjs` |
| the surface ("Is this helping?") | `src/rooms/reader/monologue-surface.js`, `inner-monologue.html` |
| tests | `tests/monologue-audit.test.js` |
| the engine it audits | `src/surfer/fold/deep-reading.js`, `docs/deep-reading.md` |
| the claims it measures | `docs/deep-reading-churn-2026-07.md` (distinct), `docs/deep-reading-gen-battery-2026-07.md` (novel/voiced), `src/core/provenance.js` §8 (safe) |
