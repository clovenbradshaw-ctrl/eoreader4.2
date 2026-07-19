# Reading problems surfaced by three new sources

**Status:** diagnostic backlog. Companion to `docs/search-answer-descent.md`.
**Method:** the same loop as the `search-answer-descent` arc — pull a source in, ask it the
essay questions it was written for, and read what the reading *cannot* do. Every problem below
is reproduced by one probe, `probes/reading-diagnostic.mjs`, over the real
`perceiver/parse` → `core.projectGraph` → `surfer/levels` pipeline. Model-free, offline,
deterministic. Each entry names the operator layer a fix would land on, so the backlog maps
onto the codebase.

## Status: one law now covers P1, P2, P3, P7

`entities.js` no longer treats apparatus as figures. Rather than a `{Enter, Exit, See, …}`
list, the moon phenomenon was split into three by mass, read on the cube's three faces — no
word list, and every example falls out of the law:

- **Existence** (gravity): a head that *stands alone* with its own referential mass (gravity,
  not raw count — a bare `Exeunt.` line acts on nothing) is a **planet**.
- **Structure** (bonding): a head with no mass of its own is a **moon** its welds orbit —
  orbiting *many* distinct planets makes it **apparatus** (`Enter`/`Exeunt`/`See`), orbiting
  *few* makes it a **title** (`Prince`/`Lady`).
- **Meaning** (resolution): an apparatus label is an orbital view of its planet, so `Enter
  Ross → Ross`. Possibility rises from existence (fold only if the remainder stands alone);
  probability falls from the compound holon (fold only if the remainder out-masses the
  compound, so `United States` / `Bin Ladin` / `Central Intelligence Agency` stay whole).

Measured: **P1** Don Quijote recovered (0 → #1, 2 057); **P2/P3** stage directions and the
`Enter/Exeunt/Exit` welds fold into the cast across all five plays; **P7** `See CIA` → `CIA`.
Verified non-regression on War & Peace (Natásha 1 175) and the 9/11 compounds. Full suite green.
Residual (different law): a merged figure can still wear a weld as its canonical label
(`Legitimate Edgar` = the complete Edgar entity) — a representative-label choice in `coref`.
The remaining unfixed items below (**P4/P5** verse function words & structural headers, **P6/P8**
PDF furniture & editorial apparatus, **P9** variant unification, **P10** Spanish enclitics,
**P11** the void boundary) are still open.

## The sources and why they were chosen

| id | source | why it stresses the reading |
|---|---|---|
| `911` | *The 9/11 Commission Report* (585pp, extracted from the GPO PDF) | a **PDF-born** government document: running headers, page footers, and an endnote apparatus that the plain-text extraction folds into the prose |
| `quijote` | *Don Quijote* (Gutenberg pg2000, Spanish) | a **non-English** novel whose narrator plays deliberate games with the hero's name in Chapter 1 |
| `hamlet`, `macbeth`, `lear`, `othello`, `tempest` | five Shakespeare plays (Gutenberg) | **dramatic** format: stage directions, ALL-CAPS speaker cues, act/scene headers, and (for one edition) a textual-critical apparatus |

Reproduce any section with `node probes/reading-diagnostic.mjs <id>` after fetching the texts
(see `probes/reading-diagnostic-questions.mjs` for the exact URLs and the one-line frame-strip).

---

## P1 — The reading loses the protagonist of *Don Quijote*  ★ highest value

The single most-mentioned figure in the novel is refused entirely. The text carries **2 234
occurrences of "Quijote"**, yet the full run admits **no `quijote` referent at all**. The census
top is `Sancho Panza` at an impossible **2 017** mentions; every "Quijote" head that survives is a
Chapter-1 name-play fragment:

```
INS id alonso-quijano 5     quijotes 4     gutierre-quijada 3
        quijo 2     quijada 1     quijana 1     quijotísimo 1
```

**Diagnosis.** This is the *Natásha* failure the arc already fixed once (`45fc5bf`, "Gate
moon-hood on recurring evidence"). Cervantes opens by refusing to fix the hero's name —
"*Quijada, o Quesada … quieren decir que se llamaba Quijana*" — so the `quij-` **head bears ≥2
distinct recurring identities** (`alonso-quijano`, `gutierre-quijada`, `quijo`, `quijana`, each
recurring ≥2). The moon gate therefore declares `quij-` a moon and **refuses the bare `Quijote`
figure**, exactly as a one-off weld once refused Natásha. The recurrence gate from `45fc5bf` does
not save him here because the competing identities *are* recurrent — the gate needs a second
principle: a head whose dominant label is attested thousands of times cannot be mooned into
non-existence by a handful of rival clusters two orders of magnitude smaller. On a clean 4-sentence
passage `Quijote` admits correctly, so the failure is population-scale, not grammatical.

**Consequence for the questions.** Q1 (locura/cordura), Q3 (the Quijote↔Sancho exchange), Q7
(la venta como castillo), Q8 (la muerte de Alonso Quijano) all rest on tracing Don Quijote across
the book. With no `quijote` referent, his ~2 000 mentions sink into pronoun coref that inflates
`Sancho Panza`, and every Quijote-centred answer is built on the wrong cast.

**Fix lands on:** `src/perceiver/parse/entities.js` (the `isMoon` / `notePlanet` gate). Add a
mass-asymmetry escape: a head is not mooned when one label dominates its cluster by a large margin.

---

## P2 — Dramatic stage directions are admitted as figures  (all five plays)

`Enter X`, `Exit X`, and `Exeunt X` become named referents, and each one **fragments the real
figure** it names:

```
Macbeth:  Enter Ross 53 · Exeunt Banquo 21 · Enter Macbeth 14 · Enter Lady Macbeth 8
Hamlet:   Enter Hamlet 11 · Enter King 10 · Exit Osric 12
Othello:  Enter Lodovico 39 · Enter Bianca 26 · Enter Othello 15
Lear:     Exit Edgar 36 · Exeunt Gloucester 17
```

`Enter Macbeth` (14) and `Enter Lady Macbeth` (8) are separate referents from `Macbeth` (196) and
`Lady Macbeth` (64) — mentions stolen from the protagonists and pinned to a stage cue.

**Fix lands on:** `src/perceiver/parse/entities.js` scanning — recognise a leading
stage-verb (`Enter|Exit|Exeunt|Re-enter`) as a **direction frame**, not a name head; the following
capitalised token(s) are the *existing* figure, not a new one.

---

## P3 — ALL-CAPS speaker cues and role labels are admitted as figures  (plays)

`FIRST WITCH`, `SECOND WITCH`, `FIRST MURDERER` (Macbeth); `FIRST CLOWN`, `FIRST PLAYER` (Hamlet);
`FIRST SENATOR`, `FIRST MUSICIAN` (Othello) all admit as figures, and the shouted-caps form is
never unified with any cased mention. `hasCapsWord` already exists in `entities.js` to *pick the
canonical case*; it does not yet *gate admission* of an all-caps speaker cue.

**Fix lands on:** `entities.js` — treat a line-initial ALL-CAPS token immediately followed by a
speech as a **speaker cue** (structure), foldable to the cased figure, not a fresh entity.

---

## P4 — Sentence/line-initial function words are admitted as figures  (all sources)

Capitalisation at the start of a line or verse is read as a proper noun:

```
Hamlet:  Ay 32 · Tis 28 · Give 17        Lear:  Come 36 · Tis 26
Othello: Tis 51 · Come 31 · Ay 14        Quijote(es): Mas 89
```

`Mas` ("but/more") is the Spanish case: an omni-lingual function-word filter must cover it. `Tis`
/ `Ay` are English verse contractions. These inflate the cast and add noise to every question's
`named-referents` resolution.

**Fix lands on:** the cap-rate function-word filter (`entities.js` / conventions) — already
seed-free and omni-lingual per `a6f5760`; it is under-firing on verse and on Spanish.

---

## P5 — Structural headers are admitted as figures  (all sources)

Act/scene/chapter headers become referents and fragment under a shared head:

```
Macbeth: Scene II 10 · Scene III 10 · Scene IV 8      Hamlet: Denmark Scene 27
Quijote: Capítulo II…LXXIV  (70+ "Capítulo N" pseudo-figures)
```

**Fix lands on:** front-matter / structural-line detection in `perceiver/parse` — a `Capítulo`,
`Scene`, `Act`, `Chapter` + numeral line is a **division marker**, consumed as structure.

---

## P6 — PDF furniture is admitted as figures  (911)

Extraction of the GPO PDF leaves running headers and page footers inline; the reading admits them
as top-20 figures:

```
July 386 · Apr 354 · June 349 · Mar 336     (month names from dated footnotes)
PM Page 325 · AM Page 252                    (page-footer stamps "5:25 PM  Page ii")
COMMISSION REPORT Final 93                    (running header)
Jan Lodal 489                                 (a name inflated by "Jan" footnote stamps)
```

**Fix lands on:** an ingest-time **de-furniture** pass for PDF-born text (repeated header/footer
lines, `\d+:\d\d [AP]M Page` stamps), before `parseText`. This is upstream of the operators.

---

## P7 — Endnote-citation forms are admitted as figures  (911)

The report's endnotes ("See DOS, …"; "See CIA, …") make `See X` a productive pseudo-name:

```
See DOS 73 · See AAL 37 · See FAA 29 · See CIA 22 · See FBI 20 · See NSC 19 …  (75+ variants)
```

**Fix lands on:** `entities.js` — a leading citation verb (`See|Cf|Ibid`) is an apparatus frame,
not a name head (same shape as P2's stage-verb frame).

---

## P8 — Editorial / textual-critical apparatus is admitted as figures  (tempest)

The chosen Gutenberg Tempest (pg23042) is a variorum edition; its footnote apparatus dominates the
reading. The top "figures" are eighteenth–nineteenth-century **editors**, not characters:

```
Pope 87 · Ff 69 · Capell 44 · Steevens 38 · Hanmer 38 · Theobald 34 · Collier MS 24 · Dryden 23
Prospero 29 (7th) · Ariel 36 · Miranda / Caliban absent from top-20
```

Two problems in one: (a) **source selection** — prefer a clean reading text; and (b) the reading
cannot separate apparatus from play. Even the clean plays (P2–P4) show the reader has no notion of
"this token is machinery around the text, not a figure in it."

**Fix lands on:** source-selection guidance *and* the same de-furniture / frame logic as P6–P7.

---

## P9 — Name variants of one entity are not unified  (911, lear)

The reading splits single entities the questions treat as one:

```
911:  Bin Ladin 859 / Bin Laden 6 · Qaeda 679 (al-Qaeda severed) · Khalid Sheikh Mohammed 533
      vs Khalid Shaykh Muhammed / Mohammad / Sheik Muhammad (4 spellings, unmerged)
Lear: Lear 210  vs  King Lear 51   (same character, two referents)
```

Transliteration variants (Ladin/Laden, Mohammed/Muhammed/Muhammad) and title-prefixed forms
(`King Lear` vs `Lear`) never collapse, so Q4 (FBI vs CIA, needs the al-Qaeda thread whole) and any
Lear-centred question count him twice.

**Fix lands on:** `src/perceiver/parse/coref.js` — edit-distance / transliteration bridging and
title-prefix containment (`King Lear` ⊂ `Lear`).

---

## P10 — Spanish enclitic pronouns are mis-segmented as names  (quijote)

Across Q1–Q4 a phantom referent **`améla`** resolves as a named entity. Its source is the enclitic
pronoun cluster on Spanish imperatives/subjunctives — `dígamela`, `léamela`, `déjamela` — from
which `-mela` / `améla` is peeled off as a proper noun.

**Fix lands on:** `perceiver` tokenisation for `lang: 'es'` — enclitic pronoun stripping so
`dígamela` → `diga + me + la`, never a name.

---

## P11 — Meta-process questions read as VOID even when defensible  (911)

Q3 ("how bipartisan consensus and unanimity shaped the findings") returns
`answerable: VOID(never-set)`. The report *is* largely silent on its own process, so a void verdict
is arguably honest — but the reader should be able to distinguish "the document genuinely never
sets this" from "the reading can't reach a diffuse, un-named theme." As written, a reader cannot
tell which. Lower priority; flagged because the void gate is load-bearing for the descent (§4 of
`search-answer-descent.md`) and this is a boundary case worth a fixture.

**Fix lands on:** `src/surfer/answerable.js` — a diffuse-theme path distinct from `never-set`.

---

## Cross-cutting note: coarse-region titles

For `911`, `encodeLevels` split on PDF page boundaries, so region titles are bare page numbers
("41", "33", "19"). The descent's "at a glance" cards would render numeric, meaningless headers.
Fixing P6 (de-furniture) upstream also repairs the coarse spine's titles.

---

## Suggested order of attack

1. **P1** (Don Quijote protagonist) — highest reader-visible value, known fix template.
2. **P2 + P3** (stage directions + speaker cues) — one frame mechanism, repairs all five plays.
3. **P6 + P7 + P8** (PDF furniture, citation frames, apparatus) — one de-furniture pass repairs 911
   and Tempest and the coarse-region titles.
4. **P4, P5** (function words, structural headers) — omni-lingual filter tuning.
5. **P9, P10, P11** — coref unification, Spanish enclitics, the void boundary.
