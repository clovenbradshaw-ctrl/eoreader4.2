// The labeled specimen set under the judgment scoreboard (docs "The Work, v2" #1).
// Each specimen is a question, a small corpus, and a SCRIPTED talker draft, with GOLD
// expectations over the judgment log the turn should mint — and the gold may be
// "INDETERMINATE is correct here": correct suspension is a win, never a dodge.
//
// `ratchet: true` marks a specimen the CURRENT judges already score clean (zero
// confident-wrong, zero shape violations) — the regression floor. `ratchet: false`
// specimens are the recorded TARGETS of the retyping (v2 #2–#4): the battery doc names
// which item must convert each one. Do not flip a ratchet bit without a battery run
// proving it (tools/judgment-battery.mjs).
//
// `partial` is the sentence count of the first, thinner parse — the stability read
// drives the same question over corpus[0..partial) and the full corpus and compares
// projections. Author full names into the first `partial` sentences: a referent whose
// most specific name debuts late normalizes differently across the two parses and
// scores emergent/dropped instead of compared.

export const SPECIMENS = Object.freeze([

  // The dolphins regression, as a judgment: a claim sharing only the ubiquitous subject
  // (plus a coincidental word) must NOT corroborate; the verbatim size claim must.
  // (Corpus: tests/bind-referent.test.js, the pinned binder case.)
  Object.freeze({
    id: 'dolphins-unsupported-predicate',
    title: 'on-topic words, unsupported predicate',
    question: 'What sizes do dolphins range in?',
    corpus: Object.freeze([
      'Dolphins are kept in captivity within dolphinariums for research and conservation.',
      'Dolphins range in sizes from the small Maui to the orca, the apex predator.',
      'Some dolphins can leap nine metres and swim at great speed.',
      'The most common dolphins in captivity are the bottlenose.',
    ]),
    partial: 2,
    answer: 'Dolphins range in sizes from the small Maui to the orca, the apex predator. '
      + 'Dolphins are highly social and often live together in large pods.',
    gold: Object.freeze([
      Object.freeze({ grain: 'claim', match: 'pods', accept: Object.freeze(['unsupported', 'indeterminate']),
        why: 'no span predicates pod-living; sharing the subject\'s words is not support',
        // presence + argument ground out (there is contact, "dolphins" resolves) but the predicate
        // cut never establishes same-or-stronger → the fold HOLDS. The single-cut perturbation that
        // makes a bad twin: weaken this predicate cut to CORROBORATED and the fold wrongly affirms.
        cuts: Object.freeze([
          Object.freeze({ kind: 'presence',  grounds: 'NULSIG',   verdict: 'corroborated' }),
          Object.freeze({ kind: 'argument',  grounds: 'INS',      verdict: 'corroborated' }),
          Object.freeze({ kind: 'predicate', grounds: 'residual', verdict: 'indeterminate' }),
        ]) }),
      Object.freeze({ grain: 'claim', match: 'range in sizes', accept: Object.freeze(['corroborated']),
        why: 'the verbatim size claim is what the source says',
        // every cut grounds out — the predicate is a verbatim lift (the surface IS the source's
        // words), so the affirmation is earned and must carry a ruled-out other (§3).
        cuts: Object.freeze([
          Object.freeze({ kind: 'presence',  grounds: 'NULSIG',   verdict: 'corroborated' }),
          Object.freeze({ kind: 'argument',  grounds: 'INS',      verdict: 'corroborated' }),
          Object.freeze({ kind: 'predicate', grounds: 'residual', verdict: 'corroborated' }),
        ]),
        ruledOut: Object.freeze({ cut: 'predicate' }) }),
    ]),
    ratchet: true,
    notes: 'v2 #2 target when un-ratcheted; the born-from-noise gate already holds the pods claim to INDETERMINATE today.',
  }),

  // The rescue direction of the same regression: a genuinely entailed paraphrase naming
  // the source's own discriminating figures must corroborate despite thin word overlap.
  Object.freeze({
    id: 'entailed-paraphrase',
    title: 'entailed paraphrase cites on thin overlap',
    question: 'What are the most common dolphins in captivity?',
    corpus: Object.freeze([
      'Dolphins are kept in captivity within dolphinariums for research and conservation.',
      'Dolphins range in sizes from the small Maui to the orca, the apex predator.',
      'Some dolphins can leap nine metres and swim at great speed.',
      'The most common dolphins in captivity are the bottlenose.',
    ]),
    partial: 1,
    answer: 'These species also include both the bottlenose and the orca among others.',
    gold: Object.freeze([
      Object.freeze({ grain: 'claim', match: 'bottlenose', accept: Object.freeze(['corroborated']),
        why: 'the claim names figures the source names — the referent reading must rescue it' }),
    ]),
    ratchet: true,
    notes: 'The partial parse (1 sentence) lacks orca/bottlenose entirely — the stability read watches whether the thin parse commits prematurely or suspends.',
  }),

  // The Elvis diffusion, as a judgment: two recorded senses of one name, a question that
  // does not discriminate — the honest reference verdict is INDETERMINATE, per the log,
  // not a silent commitment to the louder sense.
  Object.freeze({
    id: 'elvis-referent-diffuse',
    title: 'referent-diffuse: suspension is correct',
    question: 'What did Elvis record first?',
    corpus: Object.freeze([
      'Elvis Presley recorded his first single at Sun Studio in Memphis in 1954.',
      'Elvis Costello recorded his first album in London in 1977.',
      'Presley toured the American South and sang on regional radio.',
      'Costello wrote sharp lyrics and toured with a small band.',
      'Elvis performed on television to great acclaim.',
    ]),
    partial: 2,
    answer: 'Elvis recorded his first single in 1954.',
    gold: Object.freeze([
      Object.freeze({ grain: 'referent', match: '*', accept: Object.freeze(['indeterminate']),
        why: 'two senses hold real mass and the question names neither — suspension is the honest cut',
        // The Cut-level gold (§7): the reference DEF is one ARGUMENT cut that must NOT ground out.
        cuts: Object.freeze([
          Object.freeze({ kind: 'argument', grounds: 'INS', verdict: 'indeterminate' }),
        ]) }),
      Object.freeze({ grain: 'claim', match: '1954', accept: Object.freeze(['indeterminate']),
        why: 'the subject is diffuse — a confident bind of "Elvis recorded first in 1954" ships the Presley reading of an unresolved name',
        // The first Cut-level gold entry (§7, the un-delegable human step): for this claim the
        // human marks the PRESENCE cut corroborated (there is lexical contact), the PREDICATE cut
        // corroborated (the relation "recorded a first single in 1954" IS in the corpus — a subset
        // of the Presley line, a verbatim lift), and the ARGUMENT cut INDETERMINATE — the name
        // "Elvis" resolves to NEITHER sense. The suspension is LOCATED at the argument (the
        // reference void, §5), not the predicate: the corpus witnesses the relation, it just cannot
        // say WHICH Elvis. The fold of those cuts is INDETERMINATE — a located suspension, not a
        // guess, and never a silent bind of the louder Presley.
        cuts: Object.freeze([
          Object.freeze({ kind: 'presence',  grounds: 'NULSIG',   verdict: 'corroborated' }),
          Object.freeze({ kind: 'argument',  grounds: 'INS',      verdict: 'indeterminate' }),
          Object.freeze({ kind: 'predicate', grounds: 'residual', verdict: 'corroborated' }),
        ]) }),
    ]),
    ratchet: true,
    notes: 'v3 #2/#3 CONVERTED: the argument cut cannot ground out on the unresolved name, so the binding is HELD (INDETERMINATE), never bound to the louder Presley. The reference DEF abstains and names the runner-up sense it could not separate (the ruled-out other, §3). Per-mention abstention (vs the whole-fold measure) is the deferred refinement.',
  }),

  // The two-Bushes ambiguity: a short name fitting two incomparable fuller names folds
  // into neither (name-variants law) — and the reference judgment must abstain likewise.
  Object.freeze({
    id: 'two-bushes',
    title: 'ambiguous short name: abstain, never the loudest',
    question: 'What did George Bush say about the invasion?',
    corpus: Object.freeze([
      'George Herbert Bush served as the forty-first president of the United States.',
      'George Walker Bush served as the forty-third president of the United States.',
      'George Bush addressed the nation after the invasion began.',
      'Herbert Bush favored a cautious foreign policy after the Gulf War.',
      'Walker Bush championed education reform in his first term.',
    ]),
    partial: 3,
    answer: 'George Bush addressed the nation after the invasion began.',
    gold: Object.freeze([
      Object.freeze({ grain: 'referent', match: '*', accept: Object.freeze(['indeterminate']),
        why: 'the mention fits two incomparable referents; the fold cannot cut same-from-other here' }),
    ]),
    ratchet: true,
    notes: 'v2 #3 target. The name-variants fold already refuses to merge the Bushes; the reference verdict should suspend for the same reason.',
  }),

  // The unstated evaluation (the Elvis "best"): the corpus describes, never ranks. The
  // claim asserting "best" is unsupported; the ABSENCE the turn should eventually report
  // is an evaluation void (v2 #4) — today's void judge does not fire here at all, so the
  // field gold reads unjudged: a recorded gap, not a wrong verdict.
  Object.freeze({
    id: 'unstated-evaluation',
    title: 'the corpus never ranks: "best" is unsupported',
    question: 'What dolphin lives in warm coastal waters?',
    corpus: Object.freeze([
      'The bottlenose dolphin lives in warm coastal waters and hunts fish.',
      'The orca hunts in coordinated pods across cold seas.',
      'The Maui dolphin is the smallest and rarest species.',
      'The spinner dolphin leaps and rotates above the waves.',
    ]),
    partial: 2,
    answer: 'The bottlenose is the best dolphin.',
    gold: Object.freeze([
      Object.freeze({ grain: 'claim', match: 'best', accept: Object.freeze(['unsupported', 'indeterminate']),
        why: 'no source ranks the species; naming a real figure does not support the superlative',
        // the argument grounds out ("bottlenose" resolves) but the superlative predicate cannot be
        // established against a corpus that never ranks — the predicate cut HOLDS, the fold holds.
        // NOTE (recorded located gap): the live binder under-resolves the argument here — its
        // referent reading does not attach the bottlenose anchor to this claim, so the witness
        // draws no argument cut and this row scores cut-absent. A real, LOCATED defect the Cut
        // census surfaces (the folded verdict is still correct); resolving it is binder work, not a
        // gold fudge — the human's drawing stands.
        cuts: Object.freeze([
          Object.freeze({ kind: 'presence',  grounds: 'NULSIG',   verdict: 'corroborated' }),
          Object.freeze({ kind: 'argument',  grounds: 'INS',      verdict: 'corroborated' }),
          Object.freeze({ kind: 'predicate', grounds: 'residual', verdict: 'indeterminate' }),
        ]) }),
      Object.freeze({ grain: 'field', match: '*', accept: Object.freeze(['unsupported']),
        why: 'the absence of any ranking is a measurable void (v3 #4: an unstated-relation void, distinctly)' }),
    ]),
    ratchet: false,
    notes: 'v3 #2 CONVERTED: the "best" claim is no longer born from the shared figure — its predicate cut cannot establish same-or-stronger, so the binding is HELD (INDETERMINATE). v3 #4 PENDING: the evaluation void is not yet MEASURED (the field gold stays unjudged) — recordVoidDef types unstated-relation distinctly, but the void measure does not fire on a describes-but-never-ranks corpus yet. Un-ratcheted until that earning lands.',
  }),

  // The true absence: a figure the corpus never mentions. Today's void judge should
  // already measure this (kind: elsewhere / never-set) — the ratchet candidate.
  Object.freeze({
    id: 'not-in-corpus',
    title: 'a figure the corpus never mentions',
    question: 'What did Errol Musk contribute to the first flight?',
    corpus: Object.freeze([
      'Orville Wright flew the first powered aircraft at Kitty Hawk in 1903.',
      'Wilbur Wright piloted the longest flight of that December day.',
      'The brothers built their flyer in a bicycle shop in Dayton.',
      'Their wind tunnel tests corrected the published lift tables.',
      'The engine was cast from aluminum to save weight.',
      'Local lifesavers helped carry the flyer up the dune.',
      'Newspapers at first doubted the reports from Kitty Hawk.',
      'The brothers kept methodical notebooks of every trial.',
    ]),
    partial: 4,
    answer: 'The sources do not mention Errol Musk.',
    gold: Object.freeze([
      Object.freeze({ grain: 'field', match: '*', accept: Object.freeze(['unsupported']),
        why: 'the absence is real and measured; a DEF of absence is still a DEF' }),
    ]),
    ratchet: true,
    notes: 'Ratchet candidate: today\'s three-clause void measure should already type this absence.',
  }),
]);
