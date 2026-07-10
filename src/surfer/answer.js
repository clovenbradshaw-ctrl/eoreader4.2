// EO: SYN·SIG(Network,Field → Network,Void, Composing,Binding) — surf reading → answer object
// surfToAnswer — assemble the surf's reading of a question into a structured, saveable result.
//
// The honest contract (the firewall, evaluation.js): the surf is the modeler + the surfer,
// the σ-side. It REACHES the material a question lives in (the regions, the cast, the cited
// bonds, the argument structure) and ATTRIBUTES the narrator's evaluative operation over it —
// it does NOT render the verdict. The verdict is the read-time evaluator's (the veto guard's
// sibling on the rhetoric axis), kept out of this object. So the result is evidence + attributed
// stance, every span cited to a sentence index, for a reader (or a downstream talker) to judge.
//
// Pure over a prebuilt context { doc, encoding, evaluation } so a harness builds the encoding
// and the evaluation once and answers many questions against them. JSON-serializable, so a
// battery can save the results and score region-reaching, citation quality, and the modeler's
// owner-attributed loci against a hand key.

import { coarseSurf } from './levels.js';
import { plainRel } from '../perceiver/surfaces.js';

const clip = (t, n = 140) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
// A relation rendered in EOT surface syntax (docs/eot-surface-syntax.md): SUBJECT -> OBJECT :
// relation, the negation riding as the spec's `not-` token. The same shape serializeEOT emits,
// so structure reads as canonical EO LINK triples rather than ad-hoc arrows.
const eotLink = (srcLabel, via, tgtLabel, polarity) =>
  `${srcLabel} -> ${tgtLabel} : ${polarity === '−' ? 'not-' : ''}${plainRel(via)}`;

export const surfToAnswer = (question, { doc, encoding, evaluation, top = 3 } = {}) => {
  const S = doc?.sentences || doc?.units || [];
  const segByLo = new Map((encoding?.segments || []).map((s) => [s.lo, s]));
  const evByIdx = new Map((evaluation?.segments || []).map((s) => [s.idx, s]));
  const links = (doc?.log?.filter ? doc.log.filter((e) => e.linkKind === 'inter-proposition') : []);

  const r = coarseSurf(encoding, question, { top, evaluation });

  // The cited sentences accumulate into the VERBATIM channel; STRUCTURE points at them by
  // index, so a relation is never confused with the words it was read from.
  const quoteIdx = new Set();
  const cite = (i) => { if (Number.isInteger(i) && S[i] != null) quoteIdx.add(i); return i; };

  const regions = r.regions.map((reg, i) => {
    const seg = segByLo.get(reg.lo);
    const ev = seg ? evByIdx.get(seg.idx) : null;
    // bonds as RELATIONS (structure) — citing the sentence each was read from by index; the
    // verbatim words live in the verbatim channel, looked up by that index. A relation is a
    // reading of the source, not the source.
    const bonds = (reg.bonds || []).slice(0, 3).map((b) => ({
      eot: eotLink(b.srcLabel, b.via, b.tgtLabel, b.polarity),   // EOT LINK triple (canonical surface)
      src: b.srcLabel, via: b.via, tgt: b.tgtLabel, polarity: b.polarity,
      confidence: b.confidence, sentIdx: cite(b.idx),
    }));
    const argTypes = {};
    for (const l of links) if (l.sentIdx >= reg.lo && l.sentIdx < reg.hi) argTypes[l.via] = (argTypes[l.via] || 0) + 1;
    return {
      rank: i + 1, title: reg.title, lo: reg.lo, hi: reg.hi, sentences: reg.hi - reg.lo,
      cast: (reg.figures || []).slice(0, 6).map((f) => f.label),
      meaningDensity: reg.meaningDensity,
      // the narrator's attributed evaluative operation — STRUCTURE (objective about the text's
      // operation, owner-marked), never the machine's verdict.
      narratorOperation: ev && ev.score > 0 ? { carrier: ev.carrier, score: ev.score, owner: ev.owner } : null,
      bonds, argumentLinks: argTypes,
    };
  });

  // The narrator's sharpest attributed judgment near the surfaced material (structure-level).
  const near = (lo) => regions.some((reg) => Math.abs(reg.lo - lo) < 400);
  const locus = (evaluation?.ranked || []).find((s) => near(s.lo));
  const narratorStance = locus
    ? { carrier: locus.carrier, owner: locus.owner, sentIdx: cite(locus.lo + 1 <= S.length - 1 ? locus.lo + 1 : locus.lo), score: locus.score }
    : null;

  // The verbatim channel — the source, word for word, for every index structure cited.
  const quotes = [...quoteIdx].sort((a, b) => a - b).map((i) => ({ sentIdx: i, text: clip(S[i], 220) }));

  // THREE LEVELS, gated so they never blend (the cube's Site face carried to the output):
  //   verbatim       — Existence. The source, word for word. Checkable character for character.
  //   structure      — Structure. Objective ABOUT the source but not IN it verbatim: the
  //                    relations, the cast, the argument links, and the narrator's ATTRIBUTED
  //                    evaluative operation. A reading, re-derivable and auditable, not a quote.
  //   interpretation — Interpretation. The reader's / a talker's OWN verdict (ρ). The surf
  //                    withholds it; if a talker renders it, that is a SEPARATE model call and a
  //                    visibly distinct channel — so opinion is never mistaken for the source or
  //                    for an objective reading of it.
  return {
    question, domain: r.domain, keys: r.keys,
    verbatim: { level: 'existence', basis: 'the source, word for word', quotes },
    // The GRAIN is not a level — it is SEG, the OPERATOR carrying Existence → Structure: the cut
    // that takes the undifferentiated verbatim stream and produces the units structure describes
    // and interpretation evaluates. It sits on the EDGE between levels one and two, not on a shelf
    // beside them. The cut given the rule is objective (σ): detectGrain is deterministic, the
    // boundaries re-derivable. The whole MULTI-GRAIN STACK (the holarchy) is objective Ground —
    // every grain's cuts by the same rule, the entire lattice re-derivable; all of it σ. THE
    // INVARIANT: σ is reader-independent only if the grain is. Grains are computed QUERY-BLIND
    // (detectGrain adapts to document size, never to the question); a query may SELECT among
    // pre-computed grains but must never SHAPE them. The instant grain-selection becomes
    // query-sensitive, ρ reaches through the floor into the Ground and structure is contaminated
    // from below — the firewall holes where it can't be seen. surfToAnswer only SELECTS (it never
    // calls detectGrain), so the cut here stays query-blind.
    cut: {
      operator: 'SEG', rule: encoding?.mode || 'unknown', queryBlind: true,
      basis: 'Existence→Structure: the verbatim stream segmented into units. Objective given the rule; the whole grain stack is objective Ground; queries select among grains, never shape them',
    },
    structure: {
      level: 'structure', basis: 'objective about the source (re-derivable), not verbatim — relations (EOT LINK triples), cast, and the narrator\'s attributed evaluative operation',
      regions, narratorStance,
    },
    interpretation: {
      level: 'interpretation',
      // The subjective register — the ME-NESS — which the self enters TWICE, ordered:
      //   attention — foregrounding a grain/Ground to read at. PRE-surprise: you choose where to
      //     stand before anything can stand out. The most primordial subjective move, and it
      //     leaves no relEntropy number because it is the precondition for there being one. Here
      //     the grain was foregrounded QUERY-BLIND (by document size), so ρ has NOT entered the
      //     Ground; a reader who re-foregrounds a different grain performs this act and owns it.
      //   surprise  — figures standing out against the reader's accumulated ρ AT that grain. The
      //     measurable trace of the self's prior. Reader-relative, not re-derivable; the OTHER
      //     surprise (document-intrinsic cast turnover / holon boundaries) is σ and lives in
      //     structure. Same operation; which prior — σ or ρ — decides the level.
      basis: 'the reader\'s subjective response (ρ) — the me-ness; not re-derivable across readers',
      attention: { grainForegrounded: encoding?.mode || 'unknown', selectedBy: 'query-blind (document size)',
                   note: 'foregrounding a grain is attention, the pre-surprise me-ness; query-blind here, so the Ground stays σ' },
      surprise: null,                      // reader-relative surprise — filled only by a self with an accumulated ρ
      stance: null, generated: false,
      discipline: 'render in a SEPARATE model call and a visibly distinct channel; never blended with verbatim or structure',
    },
  };
};
