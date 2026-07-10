// EO: EVA(Link,Lens → Lens, Binding,Tracing) — the veto battery (runVetoes)
// The veto battery. Each veto is a pure predicate over
// (draft, bound, spans, question). Vetoes flag; they don't substitute.
//
// Adding a veto is the only honest way to tighten grounding: add it here,
// it shows up in the audit's `vetoes` field, and the user can see exactly
// why an answer was refused or flagged.

import { CONTRADICTION_REFUSE_FLOOR } from '../factcheck/index.js';
import { CONTACT_FLOOR } from './bind.js';

// How much of a grounded answer must be tied to a source before the coverage
// veto flags it — a per-task prior, not one flat 0.5. A direct answer should be
// tightly grounded (most claims cited); a SUMMARY is a synthesis whose connective
// claims legitimately have no single witnessing sentence, so it tolerates a
// looser floor; an explanation sits between. The number was a magic constant
// standing in for exactly this question-type prior. The default (and `answer`)
// keep the old 0.5, so nothing a direct question did changes.
export const GROUNDING_FLOOR = Object.freeze({
  summary: 0.34,
  explain: 0.40,
  list:    0.50,
  answer:  0.50,
});
export const groundingFloor = (task) => GROUNDING_FLOOR[task] ?? GROUNDING_FLOOR.answer;

// Every veto is an EVALUATION (EVA) of the talker's output against what the engine holds
// — a reading with an AMPLITUDE, never a fact that holds, and it FLAGS, it does not trade.
// There is no hard floor any more: nothing here substitutes the answer. We trust the talker
// to speak and we surface what it said; a veto is the annotation that travels alongside,
// telling the user (and the audit) where the grounding is thin, contested, or absent. The
// strongest readings — empty, declined, echo, the from-nowhere `unbound` — are still the
// HIGH-AMPLITUDE LIMIT, but the right response to "the model gave us little to stand on" is
// to TELL the user that, not to hide the little it gave behind a canned refusal. `refuses`
// is a severity marker for display (a serious pill, shown louder), never a gate.
export const VETOES = [
  {
    id: 'empty',
    test: ({ draft }) => String(draft || '').trim().length === 0,
    refuses: true,
    message: 'Empty response.',
  },
  {
    id: 'declined',
    test: ({ draft }) =>
      /^(i (don'?t|cannot|can'?t) (answer|know|tell))/i.test(String(draft || '').trim()),
    refuses: true,
    message: 'Model declined.',
  },
  {
    id: 'echo',
    test: ({ draft, question }) =>
      normalize(draft) === normalize(question) && normalize(draft).length > 0,
    refuses: true,
    message: 'Model echoed the question.',
  },
  {
    // The honest abstention — "the document does not say." With the void no longer
    // auto-answered (P0.2), the talker itself declines when the excerpts don't cover the
    // question, and that decline now flows through bind/veto. It is the CORRECT void
    // response, not a grounding failure: it makes no claims precisely because there is
    // nothing to claim. Recognise it as a benign, non-refusing outcome so the grounding
    // vetoes below (unbound, low-coverage) don't mislabel an abstention as an unbound
    // answer. Anchored to the document/text/excerpts subject so a real claim that merely
    // contains "does not say" ("the clerk does not say goodbye") is untouched.
    id: 'abstained',
    test: ({ draft }) => isAbstention(draft),
    refuses: false,
    message: 'The talker declined: the excerpts do not cover the question.',
  },
  {
    // The from-nowhere LIMIT: every claim is uncited AND made no lexical contact with any
    // span (score ≤ CONTACT_FLOOR for all). Prose grounded in nothing — the bullshitter case.
    // The un-groundedness reading beats every null, so this is the loudest flag — but it
    // still rides: the answer ships with a prominent "couldn't tie any of this to the page"
    // caveat, rather than being swapped for a refusal. Telling the user is the safety.
    id: 'unbound',
    test: ({ bound, draft }) => isUnbound(bound, draft),
    refuses: true,
    message: 'No claim could be tied to a source sentence, and none made lexical contact with one.',
  },
  {
    // The FAINT sibling: every claim is uncited, but at least one made lexical contact with a
    // span (CONTACT_FLOOR < score < MIN_OVERLAP) — a paraphrase the lexical binder cannot tie
    // to a single sentence. Flag, RIDE — never gated. The faint amplitude is exactly the case
    // the over-refusal guard protects: the binder cannot tell a reword from coincidence, so
    // telling the user is the safety, not a regenerate. The LOAD-BEARING cases — the strict
    // from-nowhere `unbound` and a refusing `edge-contradicted` — invert under the subjective
    // frame (§5): with abstention now free and coherent, those GATE and regenerate rather than
    // ride (the gate lives in turn/stages.js `revise`, reading isUnbound / factcheck.refuse).
    // This faint sibling is deliberately NOT among them; it stays a flag.
    id: 'unbound-contact',
    test: ({ bound, draft }) =>
      bound.length > 0 &&
      bound.every(b => !b.citation) &&
      bound.some(b => (b.score || 0) > CONTACT_FLOOR) &&
      !isAbstention(draft),
    refuses: true,
    gates: false,
    message: 'No claim could be tied to a single source sentence, though the prose made lexical contact with one — a paraphrase that rides, flagged.',
  },
  // The edge-grounding checks — the LINK-shaped sibling of `unbound`. `unbound`
  // catches a claim with no node-level witness; these catch a claimed RELATION
  // with no edge-level witness, the shape the invented-location lie wore. They
  // read the four-way verdict the factcheck holon computed (`ctx.edgeVerdicts`)
  // and stay inert when no fact-check ran. The split is the journalism: a claim
  // the document DENIES is refused; a claim the document is merely silent on is
  // flagged. Under the hash organ every relational verdict is indeterminate, so
  // neither fires — the honest inert state until the meaning reader is wired.
  {
    // The likelihood gate, mirrored from the factcheck holon: a contradiction
    // hard-refuses only when its joint typing confidence clears the floor. A
    // verdict with no confidence is treated as certain (the geometric VOID path,
    // already embedder-gated), so a bare {verdict:'contradicted'} still refuses.
    id: 'edge-contradicted',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(
      v => v.verdict === 'contradicted' && (v.confidence ?? 1) >= CONTRADICTION_REFUSE_FLOOR),
    refuses: true,
    message: 'A claimed relation is denied by the document reading.',
  },
  {
    // A contradiction that exists but rests on a weakly-typed relation: flagged,
    // not refused — the human is told, the answer rides.
    id: 'edge-contradicted-weak',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(
      v => v.verdict === 'contradicted' && (v.confidence ?? 1) < CONTRADICTION_REFUSE_FLOOR),
    refuses: false,
    message: 'A claimed relation conflicts with the document reading, but the relation typing is too uncertain to refuse on.',
  },
  {
    // A claim tracing to the reasoning walk's own committed step (`reach`, factcheck/
    // correspond.js) is EXCLUDED here: an unwitnessed reach the engine chose to make is
    // bind-or-MARK, not a grounding failure — the marked-reach veto below carries it.
    id: 'edge-unsupported',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(v => v.verdict === 'unsupported' && !v.reach),
    refuses: false, // flag-only; the claim rides, marked unwitnessed
    message: 'A claimed relation has no witness in the document reading.',
  },
  {
    // The deliberate reach, marked (docs/ungrounded-emitted.md). The claim matches a step the
    // reasoning walk committed through the enactor door — reafference, which can never witness
    // (the type law keeps it out of corroboration entirely). It is not an invention the talker
    // smuggled in; it is the engine's own inference, shipped with its mark. Flag-only, and the
    // honest label the passing-off rate (I2) is measured against.
    id: 'marked-reach',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(v => v.reach),
    refuses: false,
    message: 'A claim rests on the reading’s own reasoning — a deliberate inference past the text, marked as such, never attested by the document.',
  },
  // The diagonal guard's verdicts (P1, core/cube.js `coherence`) — a specific
  // (Figure-grain) claim asserted where the reading typed Ground. Both are FLAG-ONLY:
  // under the rewrite-then-tag rule the turn already gave the talker a corrective pass
  // (turn/stages.js `revise`); a confabulation that survived it is not suppressed, it
  // ships with the span tagged so the record shows the figure-at-a-void and that a
  // rewrite was tried. Inert when no fact-check ran (no `off_diagonal` verdict present).
  {
    // The confabulation proper: a figure at a measured Void.
    id: 'off-diagonal-void',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(
      v => v.verdict === 'off_diagonal' && v.terrainGrain === 'Ground' && v.void),
    refuses: false,
    message: 'A specific claim was made where the document marks an absence (a figure at a void); a rewrite did not clear it, so it ships tagged.',
  },
  {
    // The softer category error: a figure-grain claim at a Ground terrain that is not a
    // Void (a site / atmosphere locus) — pitched finer than the passage supports.
    id: 'off-diagonal-grain',
    test: ({ edgeVerdicts }) => (edgeVerdicts || []).some(
      v => v.verdict === 'off_diagonal' && !v.void),
    refuses: false,
    message: 'A claim is pitched at a finer grain than the passage supports.',
  },
  {
    // The reader measured its own referential confidence (read/referent.js): the
    // concentration of the coref posterior at the answer cursor. A diffuse field —
    // no figure clearly dominant — means the passage the answer draws on does not
    // settle who it is about. Flag-only: the answer rides, the uncertainty is no
    // longer discarded at the last step. Inert when no field was measured.
    id: 'referent-ambiguous',
    test: ({ referential }) => !!referential && referential.id != null && !referential.concentrated,
    refuses: false,
    message: 'The passage this answer draws on does not settle which figure it is about.',
  },
  {
    // The surfer's own confabulation guard, surfaced (surfer/stance.js, surfing-next.md §3).
    // updateStance measures HOW the reading committed at the peak: a Making (a rank-1 lens
    // cleared its spectral null — the field supported a Figure commit) or a Ground-grain
    // reserve (Cultivating/Clearing — the field supported only a Ground move, so naming a
    // specific figure WOULD be the confabulation). `guard:true` is the reserve case. On a
    // pointed question that is exactly the signal worth telling the user: the passage the
    // answer rests on did not settle into a figure the reading could commit to. Flag-only —
    // the answer rides, the measured thinness travels with it. Scoped to `answer`: a summary
    // legitimately rides the Ground grain (it synthesises, it does not point), and inert when
    // no stance was measured (no significance column, e.g. an empty doc).
    id: 'stance-reserve',
    test: ({ stance, task }) =>
      (task === 'answer' || task == null) && !!stance && stance.guard === true,
    refuses: false,
    message: 'The reading did not settle on a figure to commit to here — it reserved rather than name one.',
  },
  {
    id: 'interpretation',
    // every grounded claim rests only on REAFFERENCE — the model's own notes (enactor-door
    // EOT), nothing the world witnesses. The answer is the engine's interpretation, not an
    // asserted fact. Flag-only: the reading still rides, marked as interpretation. Never fires
    // for prose (the text IS the world read → exafference), so the present pipeline is unchanged.
    test: ({ provenance, task }) =>
      (task === 'answer' || task == null) && !!provenance && provenance.onlyInterpretation === true,
    refuses: false,
    message: 'This rests on the engine’s own reading (interpretation), not on anything the source witnesses.',
  },
  {
    // The answer missed a CONSTRAINT the prompt predicted (turn/expect.js): a name asked for
    // and not given, a length overrun, a backwards retelling told forwards. The grounding
    // vetoes ask whether the claims are WITNESSED; this asks whether the answer is RESPONSIVE
    // — the adequacy check the battery lacked. The GATING miss is serious (shown loud): the
    // restart in turn/stages.js `revise` is the correction, this is the residue when it could
    // not land (or no model ran), told rather than hidden. `constraintErrors` is precomputed in
    // the turn (empty on every prompt that types nothing checkable), so this is byte-identical
    // wherever the prompt is open-ended.
    id: 'answer-shape',
    test: ({ constraintErrors }) => (constraintErrors || []).some((e) => e.gates),
    refuses: true,
    message: 'The question asked for a specific kind or shape of answer the reply does not provide.',
  },
  {
    // The SOFT sibling — a low-precision form constraint the engine cannot honestly gate on
    // (a "poem" that reads as a prose block). Flag-only: the answer rides, the mismatch is
    // told. Where taste is the only judge, the battery stays silent (no constraint is emitted
    // upstream), so this never fires on "write a GOOD poem" — only on a measurable form miss.
    id: 'answer-shape-weak',
    test: ({ constraintErrors }) => (constraintErrors || []).some((e) => !e.gates),
    refuses: false,
    message: 'The reply does not fully match the form the question asked for.',
  },
  {
    id: 'low-coverage',
    test: ({ bound, task, draft }) => {
      const total = bound.length;
      if (total === 0 || isAbstention(draft)) return false;   // an abstention claims nothing — not under-covered
      const cited = bound.filter(b => b.citation).length;
      return cited / total < groundingFloor(task);
    },
    refuses: false, // flag-only; the cited claims still ride
    message: 'Fewer of the claims are tied to a source than this kind of question needs.',
  },
];

const normalize = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// An honest void abstention — the talker declining because the lines don't cover the
// question. Anchored to the document/text/lines (or a bare "no information") subject, so
// it recognises "I did not find that" / "the text does not mention X" but NOT a real
// claim that happens to contain the words ("the clerk does not say goodbye"). The
// subjective frame's absence clause ("tell them you did not find it") makes this the
// expected shape of an honest miss, so the matcher also catches the first-person reading.
const ABSTAIN = /^\s*(?:the\s+(?:document|text|excerpts?|passage|lines?)|it|this(?:\s+(?:document|text))?|i)\s+(?:does\s*n['’]?t|does\s+not|do\s+not|did\s*n['’]?t|did\s+not|is\s+silent|says?\s+nothing)\b[^.?!]*?\b(?:say|says|mention|mentions|state|states|specify|specifies|cover|covers|address|addresses|indicate|indicates|contain|contains|tell|find|found)?\b|^\s*no\s+(?:information|mention|indication|details?|record)\b/i;
export const isAbstention = (draft) => ABSTAIN.test(String(draft || '').trim());

// The from-nowhere LIMIT, as a reusable predicate (§5): every claim is uncited AND made
// no lexical contact with any span (score ≤ CONTACT_FLOOR for all). Prose grounded in
// nothing — the load-bearing case the gate regenerates on, not just flags. The `unbound`
// veto below and the gate (turn/stages.js) read the SAME predicate, one source of truth.
export const isUnbound = (bound = [], draft = '') =>
  bound.length > 0 &&
  bound.every(b => !b.citation) &&
  bound.every(b => (b.score || 0) <= CONTACT_FLOOR) &&
  !isAbstention(draft);

export const runVetoes = (ctx) => {
  const fired  = [];
  let refuse = false;
  for (const v of VETOES) {
    if (v.test(ctx)) {
      fired.push({ id: v.id, message: v.message, refuses: !!v.refuses });
      if (v.refuses) refuse = true;   // serious-pill marker (display + audit) — never a gate
    }
  }
  return { fired, refuse };
};
