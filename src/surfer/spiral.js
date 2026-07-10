// EO: REC(Lens → Entity,Paradigm, Composing) — the spiral — REC climbs
// The spiral — the three-fold closes on itself and climbs. This is REC.
//
// Interpretation at level n becomes Existence at level n+1. The machine's verdict, the moment it
// is uttered, is a thing-that-exists: it has tokens you can index character-for-character, it has
// a structure (its own cast, its own owner-attributed claims, its relations), and it can be
// interpreted in turn — was that verdict earned? So the three-fold (verbatim → [SEG] → structure
// → [against ρ] → interpretation) does not stack into a tower with a top. It closes on itself and
// climbs: the output of the last move is the raw material of the next. REC is the operator that
// takes the whole three-fold and feeds it back in as Ground.
//
// It ASCENDS rather than loops because interpretation is transcendental over structure: ρ is not
// algebraic over σ — you cannot compute the me-ness from the structure beneath it. Each turn
// includes the prior level entire (transcend-and-include) and adds the irreducibly new. There is
// no terminus (the transcendental gap never closes — always a remainder, the next me-ness), only
// a horizon (full reflexivity, the self that has read all its own readings) it approaches forever.
//
// TWO INVARIANTS, FRACTAL — held self-similarly at EVERY storey, or the firewall is nothing:
//
//   1. query-blind cut. The SEG that cuts level n+1's text (the self's own prior verdict) must be
//      blind to the level above it, exactly as detectGrain is blind to the query at level 0. ρ
//      leaks into σ through the floor at every storey through the same crack unless the same
//      blindness is enforced there. (cutIsQueryBlind.)
//   2. provenance re-stamp. When an interpretation becomes an existence it must carry the mark
//      that it WAS ρ — owner = self, the level it came from — into its new life as verbatim. Drop
//      the stamp and the spiral becomes a hall of mirrors: the machine reads its own opinion as
//      found fact, interprets that, reads the interpretation as fact again, amplifying its first
//      bias at higher confidence with the seams sanded off. That is dreaming gone wrong — and
//      dreaming is just this spiral running with no external Existence input (REC offline over the
//      graph; curiosity-driven consolidation). Append-only is not a storage choice here; it is the
//      spiral's necessary condition — each level's output must persist AS MARKED so the next
//      grounds on something re-derivable, never an unauditable smear. (provenanceIntact.)

import { parseText } from '../perceiver/parse/index.js';
import { encodeLevels } from './levels.js';
import { attributedEvaluation } from './evaluation.js';
import { surfToAnswer } from './answer.js';

// The machine's own mind — never a mind IN the source (the source's minds are NARRATOR and the
// characters; see evaluation.js). The owner stamp that distinguishes a promoted self-verdict from
// an attributed source-stance, so the two can never be confused once the verdict becomes existence.
export const SELF = 'mind:self';

// promote — REC. The verdict a talker rendered for level n's interpretation becomes the Existence
// of level n+1, STAMPED with its provenance. Append-only: returns a new frozen record; the input
// three-fold is preserved untouched as `grounds` (transcend-and-include).
export const promote = (result, { level = 0, verdict, owner = SELF } = {}) => {
  if (verdict == null) throw new Error('promote needs the verdict a talker rendered for the interpretation level');
  return Object.freeze({
    level: level + 1,
    existence: Object.freeze({
      level: 'existence',
      text: String(verdict),                 // the verdict, now verbatim tokens — indexable char-for-char
      provenance: Object.freeze({            // the re-stamp: it WAS ρ at the level below
        owner, wasLevel: level, wasInterpretation: true,
        note: 'this existence was an interpretation at the level below; reading it as found fact is the hall-of-mirrors breach',
      }),
    }),
    grounds: result,                          // the whole three-fold below, preserved
  });
};

// The fractal-firewall predicates — what a record must pass at EVERY storey, not just the floor.
export const cutIsQueryBlind = (cut) => !!cut && cut.queryBlind === true;
export const provenanceIntact = (existence) =>
  !!existence?.provenance && existence.provenance.owner === SELF && Number.isInteger(existence.provenance.wasLevel);

// spiralStep — one turn up. Re-read a promoted existence (the self's prior verdict, as text) as the
// SOURCE of the next level: parse it, cut it QUERY-BLIND (detectGrain reads the text, never the
// meta-question), structure it, surface the meta-read. The provenance stamp is carried onto the
// result so the new structure knows its source IS the self's prior ρ (owner=self) — never found
// fact. The meta-question asks of the verdict what the base question asked of the source ("was that
// earned?"): meta-surprise, the same Bayesian gradient one storey higher — which is curiosity.
export const spiralStep = (promoted, metaQuestion, { totalRead = true } = {}) => {
  if (!provenanceIntact(promoted?.existence)) throw new Error('spiralStep: the promoted existence lost its provenance stamp — the hall-of-mirrors breach');
  const doc = parseText(promoted.existence.text, { docId: `spiral-L${promoted.level}`, totalRead });
  const encoding = encodeLevels(doc);                    // the SEG cut at the new level — query-blind by construction
  const evaluation = attributedEvaluation(doc, encoding);
  const result = surfToAnswer(metaQuestion, { doc, encoding, evaluation });
  return Object.freeze({
    ...result,
    level: promoted.level,
    sourceProvenance: promoted.existence.provenance,     // owner=self, wasLevel=n — the stamp survives the jump
  });
};
