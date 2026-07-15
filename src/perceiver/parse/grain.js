// EO: DEF(Field,Network → Lens,Paradigm,Atmosphere, Dissecting,Unraveling,Clearing) — the grain reader
// WHICH GRAIN IS THIS SPAN? The cube's Site face (core/cube.js) says a thing in the Existence
// domain is one of three terrains by its GRAIN: an ENTITY (Figure — a particular, "Pierre"), a
// KIND (Pattern — a category, true-of-many, "the warriors"), or a SETTING (Ground — the ambient
// where/when the figures move through, "in London", "во время войны"). The reader has always
// forced every admitted span toward Entity — the whole Figure column — so a setting became a
// miscast particular and a kind either a botched one or a discard. This module reads the grain
// off the span's own COMPANY, the same distributional move as everything else here:
//
//   · SUBJECT-dominant (followed by a content word — it acts) ............ Figure  → a figure
//   · OBLIQUE-dominant (preceded by an adposition — it is moved THROUGH,
//     and it almost never acts) ........................................ Ground  → a setting
//   · CATEGORY evidence (admitted lowercase — a common noun; or a
//     lowercase/plural twin in the document's own vocabulary — the same
//     word ranges over many) ........................................... Pattern → a kind
//
// The judgment is a DEF and it is DEFEASIBLE — grain is USE, not essence: London acting is a
// figure, London lived-in is a setting, and the same document can revise the read. Where no
// signal is clean the reader ABSTAINS (returns null; no event) — the no-commit discipline — so
// a bare parse is byte-identical wherever the evidence is thin. Note the judgment's own cube
// coordinates match the grain it assigns: calling a span a Kind is itself a Pattern-grain DEF
// (DEF·Unraveling·Paradigm), a figure a Figure-grain DEF (DEF·Dissecting·Lens), a setting a
// Ground-grain DEF (DEF·Clearing·Atmosphere) — all three on the cube diagonal.

import { TERRAINS } from '../../core/index.js';

// readGrain(profile) → { grain, value, cue, terrain } | null (abstain)
//   count       total sightings of the label
//   subj        sightings in subject position (followed by a content word)
//   obl         sightings in oblique position (preceded by an adposition)
//   strong      a strong referential cue has vouched for it (possessive, role apposition)
//   lowercaseForm  the label itself is lowercase — a common-noun admission, a category on its face
//   lowerTwin   occurrences of the same word lowercase in the document (a name has ~none)
//   pluralTwin  occurrences of its plural, lowercase (a category ranges; a particular does not)
export const readGrain = ({
  count = 0, subj = 0, obl = 0, strong = false,
  lowercaseForm = false, lowerTwin = 0, pluralTwin = 0,
} = {}) => {
  // A common-noun admission is a category on its face — the catalyst admitted it AS a kind.
  if (lowercaseForm) return verdict('Pattern', 'kind', 'common-noun');
  if (count <= 0) return null;
  // The document's own vocabulary ranges the word over many — a category, not a particular.
  const twin = lowerTwin + pluralTwin;
  if (twin >= 2 || (twin >= 1 && twin * 2 >= count))
    return verdict('Pattern', 'kind', 'lowercase-twin');
  // Moved THROUGH, never acting: the where/when the figures pass across.
  if (count >= 3 && obl * 10 >= count * 6 && subj * 4 <= obl)
    return verdict('Ground', 'setting', 'oblique-dominant');
  // It acts — a particular with agency, the classic figure.
  if (subj >= 2 || (strong && count >= 2))
    return verdict('Figure', 'figure', 'subject-dominant');
  return null;   // no clean signal — HELD, not guessed
};

// The verdict names both the cube axis (grain) and the Existence-row terrain it lands the span
// in (Entity / Kind / Void), read back from the cube so a drift there fails here.
const verdict = (grain, value, cue) =>
  ({ grain, value, cue, terrain: TERRAINS.Existence[grain] });

// readUncasedGrain(referent) → verdict | null — the uncased judge. An uncased figure carries no
// capital and no subject/oblique counters; what its particle company CAN say (parse/uncased.js)
// rides on the referent: a COLLECTIVIZER (a rare suffix attaching optionally across ≥2 stems —
// grammatical number on a countable base, 公卿/公卿達) marks a KIND. What the company cannot
// tell — figure vs setting vs kind within the plain nominals, which share one case frame — is
// HELD: null, no guess. The same abstention discipline as the cased reader.
export const readUncasedGrain = (referent) => {
  const g = referent?.grain;
  if (!g) return null;
  return verdict(g.grain, g.value, g.cue);
};
