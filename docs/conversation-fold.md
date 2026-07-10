# The Conversation Fold — continuation-by-default routing

> A projection of the event log, sibling to `projectGraph`, that carries the
> stance forward so a turn inherits what it's doing instead of re-deciding it.
> The router stops being a classifier and becomes a transition detector.
> This is README principle 2 — *the high sets the probabilities for the low* —
> made concrete for the conversation dimension.

**Naming.** This document's object is the *conversation* fold. It is distinct
from the existing `fold/` holon (`foldNote(spans)`, the note/impression fold
over spans). The conversation fold is a projection over the **event log** — a
chat's turns — and its home is `src/core/conversation-fold.js` beside
`projectGraph`. The symbol is `projectFold`.

## Where it lives in this codebase

| Piece | Location |
| ----- | -------- |
| `projectFold(events, frame)`, `routeStance(message, fold, opts)`, helpers | `src/core/conversation-fold.js` (pure, tested) |
| Re-exports | `src/core/index.js` |
| Router wiring (continuation-by-default) | `src/rooms/reader/app.dc.js` — `sendChat` |
| Stance tagging on enacted turns | `src/rooms/reader/app.dc.js` — `composeArtifact` (`compose`), `sendChat` / `_answerSingle` / `_longformArc` (`ground`) |
| Tests (all replay fixed event logs) | `tests/conversation-fold.test.js` |

The conversation event log is a chat's `messages` array. An enacted assistant
turn is tagged with a `stance` (`'compose'` | `'ground'`) and, for compose, a
`focus` (`{kind, subject}`). `projectFold` reduces over those tagged turns; the
fold at turn N is a function of the N−1 settled (non-`pending`) turns.

---

## 1. The diagnosis (why routing keeps failing)

The router asks *what kind of input is this?* — compose-shaped or
retrieval-shaped — and assumes the kind is a property it can read off the
string. It isn't. `"write me one"` has no intrinsic kind; its kind is inherited
entirely from the thread. That is why anaphora is where the whitelist breaks,
and the breakage is diagnostic: the string it's trying to classify is not
self-contained.

Two consequences follow, and the spec is built on both:

1. **Compose-vs-ground is not two kinds of input. It is two stances a
   responder takes toward the same input.**
2. **The answerable question is not "what kind" but "did it switch."**
   Continuation is the default, a transition is the only thing that ever needs
   detecting, and absence of a detected transition means continue.

The old `empty source set = whole library` default (fixed by #283) is the same
error on the scope axis. The fix is the same shape — make the default carry
nothing implicit, and make every departure from it explicit or detected.

---

## 2. What a turn resolves to

| Axis      | Values                             | Set by                                           | Decays? |
| --------- | ---------------------------------- | ------------------------------------------------ | ------- |
| **stance**| `compose` \| `ground`              | continuation-default, overridden only on a switch| no      |
| **scope** | `isolated ∅` \| `everything ALL` \| `specific(pins)` | explicit markers (#283 seed) | no      |
| **warm**  | set of CON-reachable nodes/sources | the fold, by turn-distance decay                 | yes     |

- **stance and scope are orthogonal.** `compose` means *make the thing, don't
  consult grounding reach this turn*. You can compose in an isolated chat.
- **`warm` is gated by scope.** It only adds reach when `stance = ground` and
  `scope ≠ isolated`.
- **#283's three states are the scope seed; the fold carries stance and adds
  warm on top.**

---

## 3. The fold object

`projectFold(events, frame) → ConversationFold`, projected from the settled
turns **before** the turn being routed.

```
ConversationFold = {
  stance:  'compose' | 'ground' | null,   // read off the last tagged turn; null on turn 1
  focus:   { kind: string, subject: string | null } | null,   // when stance === 'compose'
  warm:    Array<{ ref, weight }>,        // sources touched recently, turn-distance decayed
  stanceDesc: string,                     // human phrase for the router prompt (§6)
}
```

`focus` is what makes `"write me one"` bind (`one` → `focus.kind`) and `"now one
about the city"` update (`focus.subject := 'the city'`). The KIND and SUBJECT
each carry forward across compose turns until a later turn renames them.

---

## 4. Purity and memoization

**Decay is measured in turns, not seconds.**

- `projectFold(events, frame)` is a **pure function of the event sequence** —
  no wall-clock, no ambient state. Turn-distance is derived from position.
- Memoized on `(chatId, settled-turn count, frameSig)`, safe because the log is
  append-only.
- **`frameSig` serializes the decay config** (`frame.foldRules.warmWindow`) —
  a memo not keyed on the rules is invalid (the class of bug where `projectGraph`
  silently reads `decay_gamma` from module scope).
- **No persisted runtime state.** Rehydrated by replaying the log.

**Non-negotiable:** no wall-clock decay. If a real product need for wall-clock
cooling ever appears, it goes in a separate impure layer, never in `projectFold`.

---

## 5. The routing algorithm

Lives in `sendChat`. Decision order:
`markers → (fresh ? regex-seed : continuation) → warm-model override`.

```
1. Structural markers (UI acts / explicit performed transitions) set stance directly.
   - `/svg`               → the limner (handled first)
   - explicit compose     → _composeIntent(q) → composeArtifact  (verb + creative kind)
   - explicit research     → _researchIntent(q) → the web path    (a transition INTO grounding)
2. Baseline — continuation-by-default: inherit fold.stance.
   - fold.stance === 'compose'  → composeArtifact (the fix for "write me one" / "do it")
   - otherwise                  → today's ground / web / answer path
3. Warm-model override (rung 4, not yet wired live): only a clean COMPOSE / GROUND /
   ISOLATE verdict overrides the baseline; any non-clean verdict falls through.
```

**Fallback contract:** with the model cold or absent, routing =
`markers → continuation → fresh-regex-seed`. This is never worse than before and
fixes anaphora *without a model*. The router `routeStance(message, fold, opts)`
implements the full algorithm purely; the live `sendChat` uses the cold path
(`fold.stance === 'compose'`), and `routeStance` is unit-tested against the warm
path so rung 4 is a drop-in.

---

## 6. The transition detector (rung 4)

Consulted only when the model is warm. Asked *did the activity switch?* — never
*what kind is this?* The prompt is `transitionPrompt(message, stanceDesc)`.

**Verdict contract:** exactly one of `CONTINUE | COMPOSE | GROUND | ISOLATE`.
Any non-matching, empty, or stalled output is treated as `CONTINUE`. The model
can only override the baseline on a clean, matching, non-CONTINUE verdict.

---

## 7. Scope resolution (`_answerScope`)

Extends #283's `_answerScope`. The fold's `warm` unions on top of the explicit
base (`isolated ∅` / `everything ALL` / `specific pins`), suppressed entirely in
an isolated chat. (Warm activation is rung 3; the fold already exposes `warm`.)

---

## 8. EO mapping

- Each enacted turn appends an **EVA** (the turn's resolution). The fold is a
  reduce over the EVA stream; the reduce re-running as each EVA lands is **REC**
  — the carried stance is the learned prior, continuation-by-default is that
  prior biasing the next route.
- `focus` binding `"one"` is the **CON** edge to the prior compose EVA.
- `warm` reach is **CON** traversal weighted by turn-distance.
- A detected transition is a **SEG** on the stance timeline.

---

## 9. Build ladder

| Rung | What | Model? | Status |
| ---- | ---- | ------ | ------ |
| **1** | `projectFold` — pure, `{stance, focus, warm, stanceDesc}`, memoized with decay config in the key. | no | **done** |
| **2** | Continuation-by-default in `sendChat`: inherit `fold.stance` before the web/ground path. | no | **done** |
| **3** | `warm` activation + extend `answerScope` to `base ∪ warm`. | no | fold exposes `warm`; scope union pending |
| **4** | Re-aim the warm-model call as the §6 transition detector. | yes | `routeStance` / `transitionPrompt` ready; live wiring pending |

Rung 2 is the cheapest, highest-value rung and it is model-free — it clears the
anaphora failures (`"write me one"`, `"do it"`, `"now one about the city"`,
`"make it shorter"`) offline, without a verdict from the in-browser model.

---

## 10. Test contracts

See `tests/conversation-fold.test.js` — all replay fixed event logs, so all are
deterministic and CI-safe:

1. **Fold purity + fields** — stance, focus.kind, focus.subject tracking; memo
   identity; impurity guard (decay config in the key).
2. **Continuation-by-default** — `[compose] → "write me one"` with the model cold
   routes to `compose`; `"do it"` → `compose`.
3. **Warm activation + decay** — a ref drops from `warm` after the window.
4. **Transition override** — a warm model's clean verdict overrides; garbage /
   empty / stalled degrades to continuation.

---

## 11. Non-goals

- **Not a better classifier / bigger whitelist.** The router is a transition
  detector; the whitelist shrinks to a fresh-turn seed.
- **No wall-clock decay.** Turn-distance only.
- **No persisted fold state.** Pure projection, rehydrated from the log.
- **The model is asked *did it switch*, never *what kind*.**
- **Continuation is overridden only by** (a) an explicit structural marker or
  (b) a clean warm-model transition verdict. Absence of signal = continue.
- **The fold never reaches across an isolation boundary.**
