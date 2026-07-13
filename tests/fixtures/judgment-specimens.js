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
        why: 'no span predicates pod-living; sharing the subject\'s words is not support' }),
      Object.freeze({ grain: 'claim', match: 'range in sizes', accept: Object.freeze(['corroborated']),
        why: 'the verbatim size claim is what the source says' }),
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
        why: 'two senses hold real mass and the question names neither — suspension is the honest cut' }),
      Object.freeze({ grain: 'claim', match: '1954', accept: Object.freeze(['indeterminate']),
        why: 'the subject is diffuse — a confident bind of "Elvis recorded first in 1954" ships the Presley reading of an unresolved name' }),
    ]),
    ratchet: false,
    notes: 'v2 #3 target: after typed reference, the per-mention DEF should abstain (and ask), never bind the louder Elvis. The claim gold records the output-side leak: the binder corroborates the ambiguous claim today.',
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
        why: 'no source ranks the species; naming a real figure does not support the superlative' }),
      Object.freeze({ grain: 'field', match: '*', accept: Object.freeze(['unsupported']),
        why: 'the absence of any ranking is a measurable void (v2 #4: an evaluation void, distinctly)' }),
    ]),
    ratchet: false,
    notes: 'v2 #2 target (the "best" claim must not be born from the shared figure) and #4 target (the evaluation void must be witnessed and logged).',
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
