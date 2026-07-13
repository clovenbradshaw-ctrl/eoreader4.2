# The topline — an auto-generated summary for every source and entity

> The topline is composed before it is written, and the model only ever
> phrases what the machinery already decided.

A **topline** is the standing summary the reader keeps for every source and
every entity. It updates as the record grows, and it takes feedback. But it is
built on a discipline that makes it categorically different from ordinary
summarization: **the model never sees the source, only a closed set of objects
the machinery has already decided.** It cannot summarize what it was not given,
and it was given no gaps to be fluent across.

Home: `src/weave/topline/`. Wired into the reader at `src/rooms/reader/app.js`
(`sourceSummary`, `entitySummary`, `summaryFeedback`) and rendered in the source
viewer and the entity panel (`index.html`).

## The closed inventory

By the time anything is generated, the turn — or, here, the reading of a source
or entity — has produced a small set of objects. That is the whole inventory;
there is nothing else in the room (`inventory.js`, `adapt.js`):

- **claims** — propositions that trace to passages, each with its citations and
  its **standing** (`witnessed` when corroborated across passages, `stated` from
  a single witness, `contested` when the record also carries its denial).
- **computed facts** — arithmetic over the log: counts (mentions, entities,
  propositions), dates and authorship from the front matter, the mass on either
  side of a partition. Never phrased from words; measured.
- **at most one inference** — the thing that follows from the claims and is
  stated in none of them (a source's dominant figures ⇒ what it primarily
  concerns). Always marked as *ours*, never the record's.
- **the gap** — the absence, if there is one: a figure the record names but
  never characterizes.

A claim whose footing was pulled out (awaiting re-check, superseded) is **never
phrased as a claim**. It collapses to a single "the ground moved" object — the
topline says the ground shifted, not the claim it shifted under.

## Order and length are not the model's choice

How a topline runs follows from what **kind** of answer it is (`inventory.js`):

- **contradiction** — what the record asserts, then what conflicts, then where
  they part.
- **absence** — the negative, then where the reading looked (its scan receipt).
- **plain** — the claims in standing order, then the computed facts, then (at
  most) the one marked inference.

**Length falls out of the count.** One object, one sentence. Four objects, four
sentences, joined. Nobody sets a target. A thin field is a one-sentence topline,
and that is correct rather than disappointing.

## Two passes, and the safety lives in the second

Generation runs in two passes (`phrase.js`, `join.js`):

1. **Pass one phrases one object at a time.** Each object becomes a single
   sentence in isolation. It cannot smuggle anything between objects because it
   never sees two at once, and it cannot invent a fact because it was given no
   facts to interpolate between. Every object type has a deterministic mechanical
   phrasing — the telegram, always available and model-free. A model may phrase
   more fluently, but only inside that object's own words.

2. **Pass two hands the model its own sentences back and asks it only to join
   them** — reorder, add connectives, elide repetition, make it read. And here
   the check is mechanical and model-free (`contain.js`): **every content word
   and every number in the output must already appear in the input.** A
   set-containment test. The join may lose information; it may never add any. A
   new proper noun, a new figure, a new hedge that implies a source, a flipped
   polarity — any of these introduces a word the input never carried, and the
   join is rejected and the telegram ships instead.

That check is the whole thing, and it is why this is different from ordinary
summarization. A retrieval system hands a model chunks and asks for a summary,
and the fluency it produces is fluency *across the gaps between the chunks* —
and the gaps are exactly where the fabrication lives. Here there are no gaps to
be fluent across. The model is not bridging anything; it is arranging. The gate
proves it was only arranging.

The one subtlety the safety turns on: the containment tokenizer is this holon's
own (`contain.js`), **not** the perceiver's `tok`, whose stoplist would eat the
very words the safety depends on — a dropped "not" would let a flipped polarity
pass silently. Only this holon's declared connectives (articles, prepositions,
the copula, discourse connectives) are free to be added; negation, hedges, and
quantifiers are content.

Generation is **model-optional**. With no talker loaded, the deterministic
telegram *is* the topline — composed the moment a source is recorded, before any
model is warm. A loaded talker only refines the join in the background.

## Feedback steers the closed set; it never invents

Feedback updates a topline by **steering the closed set** — never by adding to
it (`feedback.js`). A plain note is interpreted into a steer: cap the length
("shorter", "one sentence"), pin a term to the front ("focus on…"), or suppress
an object the reader says is wrong ("remove…", "that's incorrect"). The steer is
folded onto the standing one, persisted, and re-applied on every regeneration.

A request that reaches **outside** the inventory — "say more about Napoleon" when
the record never named him — is recorded and reported as `unmet`, not satisfied.
The honest answer to "you left out X" is to surface the X the record carries, or
to say it does not carry it — never to invent an X so the reader stops asking.
This is the same discipline as the void answerer: the machinery would rather say
"not in the record" than speak from an empty field.

## Where it lives

| piece | file |
|---|---|
| the set-containment safety gate | `src/weave/topline/contain.js` |
| the closed, ordered inventory | `src/weave/topline/inventory.js` |
| source/entity profile → inventory | `src/weave/topline/adapt.js` |
| pass one — one object, one sentence | `src/weave/topline/phrase.js` |
| pass two — join, containment-gated | `src/weave/topline/join.js` |
| feedback as steering | `src/weave/topline/feedback.js` |
| the two-pass generator | `src/weave/topline/topline.js` |
| controller wiring + persistence | `src/rooms/reader/app.js` |
| surface cards + feedback box | `index.html` |
| tests | `tests/topline.test.js`, `tests/topline-app.test.js` |
