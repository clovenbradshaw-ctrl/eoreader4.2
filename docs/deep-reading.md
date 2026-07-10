# Deep reading — the reflection at the place of most interest

> When the model is not otherwise busy, the reading turns back on the document it already
> holds: it surfs to the place of most interest, folds it, and has a reflection about it. The
> reflection is added to the graph — but with the epistemics and the ontology made exact, so
> it enriches the reading without ever being mistaken for a witnessed fact.

This is the `deepReading` / `createDeepReader` engine in the `fold` holon
(`src/surfer/fold/deep-reading.js`). It is the second half of the continuity `idle.js` began.

## Two idle continuities, one firewall

`idle.js` (SPEC §15) argued that the chatbot posture — inert until prompted — is a gate held
shut, not the machine's nature: the surfer rides a field whether or not a question was asked,
and the §8 type law makes self-continuity safe. `idle.js` walks the **open set** (the voids)
against freshly ingested exafference — it waits for the world to close a standing question.

Deep reading is the other continuity. Instead of waiting on a void, the reading turns back on
the **document it already holds**: it measures where its own field is steepest and reflects
there. Both are legitimate for the same reason — every idle act is reafferent, and reafference
cannot witness (the firewall is the type, not a flag).

## The three moves

| move | what | from |
|---|---|---|
| **place of most interest** | the surfer's peak — where the reading's own field is steepest (Bayesian surprise), re-weighted by salience toward the live thread when one is active | `surfer/surf.js`, `surfer/salience.js` |
| **the fold** | `foldNote` at that peak — existence + structure + significance, every line carrying its source index | `fold/integral.js` |
| **the reflection** | the reading's own act of **evaluating** that fold against its frame; model-free by default (thinking needs no model), a model voice when one is injected | `write/think.js`, an injected `reflect` |

Nothing is authored. The peak is read off the physics; the fold integrates the reading there;
the reflection is the significance read voiced as an inner note (or a model's, when idle-compute
is spent on it).

## The epistemics — why it is safe to add to the graph

A reflection is **reafference** — the reading's own output, `fromEnactor`. By the §8 type law
(`core/provenance.js`) `canWitness(prov) === false`: it can organize attention and continuity,
but it **cannot witness anything as world**. It rides the graph at band **void** — held open,
an interpretation, never asserted as a firm fact — and `grounded:false`. Only a human's witness
act could ever promote it (`idle.js`'s `confirm`). So the loop can reflect freely without
laundering self-talk into record.

The loop is also **self-terminating** (`idle.js` I3): it reflects only where the place beats the
reach's own band (the significance is real, not the flat), **habituates** to places it has
already read (never re-reflects — the cure for rumination), and quiesces when no fresh place
beats the band. It never spins.

## The ontology — which of the nine operators a reflection is

**EVA** — Relate × Interpretation, *evaluate* (`core/operators.js`). A reflection is the reading
judging a particular (the folded place) against its established terms — exactly the enacted
loop's EVA (`significance-loop.md`), so it carries the same **verdict** (confirm | strain) and
**surprise**. It is tagged `register:'enacted'` (`enact/register.js`) — the reading's own act,
never a depicted perception.

`projectGraph` deliberately skips EVA (*"EVA, REC: live in the rules ledger, not in this
projection"*), so a reflection can **never** be mistaken for a depicted edge or fact. It surfaces
instead as a first-class **`eo:Reflection`** node in the reading substrate
(`fold/substrate.js`), beside the `eo:Tension` (a held EVA) and `eo:Reframing` (a located REC)
that already live there — carried at band void, witness `reafferent`, so the firewall is
explicit on the graph node itself.

## The event

`buildReflection` deposits one append-only event:

```
{ op: 'EVA', register: 'enacted', reflection: true, layer: 'reflection',
  cursor, sentIdx: cursor,        // the place of most interest — grounds/replays here
  focus, particular, verdict, surprise, body, sources,
  band: 'void', grounded: false,  // held open — an interpretation, never firm
  prov: fromEnactor('deep-reading'), door: 'enactor' }   // reafferent — canWitness === false
```

## The API

```js
import { deepReading, createDeepReader, readReflections } from '../fold/index.js';
import { surfFold } from '../surfer/index.js';

// one pass — surf to the place of most interest, fold it, reflect, append to the graph
const r = deepReading(doc, { surf: surfFold /*, reflect, thread */ });
//  → { peak, focus, verdict, surprise, body, sources, event, canWitness:false }

// the governed idle loop — the caller signals "not otherwise busy" via arrive()
const reader = createDeepReader({ doc, surf: surfFold });
const { reflections, quiesced } = reader.arrive({ anchor: 0 });
reader.canGround(reflections[0]);   // false — a reflection cannot ground itself (the firewall)

// read the reflections back off the log (they surface as eo:Reflection substrate nodes)
readReflections(doc);
```

`surf` and `reflect` are **injected** — the engine is deterministic, timer-free and DOM-free, so
it is testable and any product surface (the app's idle tick) is pure presentation over this
state. "Not otherwise busy" is the **caller's** signal (only it knows a turn is not in flight);
the engine exposes `arrive()` as the wake-on-idle entry, never a self-poll.

## In the app — deep reading when not engaged in chat

The reader app (`src/rooms/reader/app.dc.js`) runs this at rest. An idle governor (`_deepIdleStart`) fires
a governed pass (`_deepTick` → `reader.arrive`) only when the app is **not engaged in chat** — no
turn decoding (`_busy`) and the user quiet for a beat (a keystroke or tap resets the clock). The
reflections ride an **append overlay** over the read doc (`_deepEnsure`), never master's own event
log, so the record the reader can witness is untouched; the loop **habituates and quiesces**
(`_deepSettled`) so background reading never spins, and wakes again when the corpus grows. The
`☾ Inner monologue` button in the left rail opens the docked panel (`onOpenMonologue`) — the driven
`mountMonologueSurface` in view mode, a window onto the same at-rest state (reflections keep
depositing whether or not it is open). A count badge on the button shows how many thoughts the
reading has had while you weren't looking.

## The surface — the inner monologue, at rest

`inner-monologue.html` (mounting `src/rooms/reader/monologue-surface.js`, the `mountMonologueSurface`
sibling of `mountReadingSurface`) is the product surface *over* this engine — pure presentation,
framework-free, no model. Hold a document and the surface owns the **idle tick**: it is the
caller's "not otherwise busy" signal, so pressing **Idle tick** (or **Let it rest** for the
governed timer) fires `reader.arrive()`. Each fresh reflection streams in as an inner note —
its place (§cursor), the figure it is about, its **verdict** (confirm | strain), and a
surprise-vs-band bar showing it beat the reach's own band — with the **folded content it read**
one click away, the peak span highlighted. A right rail shows the **graph** growing: the count
of `eo:Reflection` nodes deposited (band void, reafferent), the firewall guarantee (*facts
witnessed: 0*), the spine of every place the surf considered (reflected vs below-band), and the
`eo:Reflection` nodes themselves read back off the log. When the walk has covered the document
and no fresh place beats the band, the posture settles to **at rest** — the loop
self-terminating on screen exactly as it does in the engine.

## Measured

On the opening scene of Kafka's *Metamorphosis* (18 sentences, 11 depicted facts over 4
figures), one idle pass surfaced three reflections at the reading's own surprise peaks
(sentences 13, 16, 17 — each a `strain` verdict), self-terminated after four passes, and:

- added **three** `eo:Reflection` nodes to the graph where idle had been silence;
- added **zero** depicted facts — `projectGraph` was byte-identical before and after (11 edges,
  4 figures);
- every reflection reafferent (`canWitness === false`), held void, and never projected as an
  edge.

The reading gets richer at exactly the places it found most interesting, and the record it can
witness is provably untouched.

## Into generation — the reflection handed to the writer, epistemics kept

The other half of the loop: when the walk is about to write from a source, it can *think
deeply first*. Before each beat, the reading surfs the **source** to its next place of most
interest (habituated — never the same place twice) and folds a reflection there; the
reflection rides into the beat prompt as the reader's **own reading**, and the writer composes
*with* the thought — while the grounder never grounds a claim on it.

The epistemics are enforced structurally, not by trust:

- **In the prompt** — the reflection is placed under `Reading note (your own reflection … — a
  reading, not a source to cite:)`, deliberately **NOT** under the excerpts header (`What I
  found reading it:`). The binder keys on the excerpts header to find citable spans, so a
  reflection below it is never a citable "fact." The prompt marking mirrors the event's own
  provenance.
- **In the grounding** — a reflection is an enacted EVA at the **enactor door** (`canWitness ===
  false`). `ground/provenance.js` separates propositions by door — `door !== 'enactor'` is
  witnessed existence/structure, `door === 'enactor'` is interpretation, never record. So the
  grounder *pulls apart what the model did in reading from the witnessed content* by
  construction.

```js
// walk with deep reading: surf the source, fold a reflection, hand it to the writer
walk({ …, deepRead: { source: parsedDoc, surf: surfFold /*, reflect: modelVoice */ } });
//   source  the parsed reading being written from
//   surf    injected surfer (surfFold) — kept an accessor so the walk stays decoupled
//   reflect OPTIONAL model voice (fold,ctx)→{body}; absent → the model-free inner note
```

`deepRead: null` ⇒ the prompt is byte-identical to the unwired walk (the rev-flag parity
contract). The place of most interest is habituated across beats, so each beat reflects on a
fresh surprise peak. Measured churn-detection payoff for the model-voiced form:
`docs/deep-reading-churn-2026-07.md`.

## Where it lives

| concern | file |
|---|---|
| the engine + the governed loop | `src/surfer/fold/deep-reading.js` |
| the surface (the inner monologue) | `src/rooms/reader/monologue-surface.js`, `inner-monologue.html` |
| the in-app idle wiring + panel | `src/rooms/reader/app.dc.js` (`_deepIdleStart`, `_deepTick`, `onOpenMonologue`) |
| the reflection as a graph node | `src/surfer/fold/substrate.js` (`eo:Reflection`, `readReflections`) |
| the fold it reads | `src/surfer/fold/integral.js` (`foldNote`) |
| the place of most interest | `src/surfer/surf.js` (`surfFold`), `src/surfer/salience.js` |
| the firewall it rides | `src/core/provenance.js` (§8, `canWitness`) |
| the operator it is | `src/core/operators.js` (EVA), `src/enactor/enact/register.js` |
| **into generation** | `src/weave/longgen/walk.js` (`deepRead`), `src/weave/longgen/render.js` (`REFLECTION_HEADER`) |
| **is it helping?** (the audit) | `src/surfer/fold/audit.js`, `docs/monologue-audit.md`, `eoreader4-eval/monologue-audit.mjs` |
| tests | `tests/deep-reading.test.js`, `tests/deep-reading-fold.test.js`, `tests/monologue-audit.test.js` |
