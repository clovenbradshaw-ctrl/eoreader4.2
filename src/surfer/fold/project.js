// EO: NUL·SEG·EVA(Network → Void, Clearing,Dissecting) — the membrane; talker-facing notes
// The membrane — what the talker sees (docs rich-notes §3, P3). The talker reads the
// three-group plain notes and NOTHING of the graph. This pulls the labels off the
// substrate by band and by node type, drops every graph token, and renders the three
// groups; the leak guard then proves nothing graph-shaped survived the crossing.
//
//   firm assertion / value            → a settled-group line
//   assertion at eo:band "void",      → a held-open line
//     unresolved eo:Tension
//   eo:Reframing, the surprise read    → a turns line (before/after as plain prose)
//   owl:NegativePropertyAssertion      → the not- prefix on the arrow, nothing more
//
// What never crosses: every IRI, every property type, eo:band, the Tension / Reframing
// type tokens, eo:resolved, eo:atSentence (the index stays grounder-side with every
// other index), the RDF-star reification, the property characteristics. Only the plain
// rendering crosses.
//
// MEMBRANE INVARIANT. assertNotesNoLeak serializes the projected notes and asserts no
// IRI, no hashId, no [sN] tag survives — the notes-block sibling of the cursor membrane
// (write/cursor.js). A leak is a bug, not a style nit, so it throws. (The eo:atSentence
// index is prevented by construction — the Reframing renderer never emits it — so no
// integer rule is needed, and "126 years" is never a false positive.)

import { composeGroupedNote } from '../../perceiver/index.js';
import { renderLines } from './substrate.js';
import { HASHID_RE } from '../../core/index.js';

// projectNotes — the substrate → the three line groups. Plain strings only.
export const projectNotes = (substrate, { maxTurns = 2 } = {}) => {
  // Settled: the firm facts a tension has NOT claimed (held facts move to held-open,
  // voiced as the tension rather than asserted as fact).
  const settled = renderLines(substrate, { includeHeld: false });

  // Held open: each unresolved tension as its plain sentence — the carrier of the
  // void band. The "(do not settle these)" rider on the header is the rest.
  const heldOpen = (substrate?.tensions || [])
    .filter(t => t && t.resolved === false)
    .map(t => t.label)
    .filter(Boolean);

  // Where the reading turns: the located-REC narration the reading already computes
  // (the surprise summary), plus a turns line naming the axis a frame broke along —
  // figure labels only, never the sentence index.
  const turns = [];
  if (substrate?.surprise) turns.push(substrate.surprise);
  for (const r of (substrate?.reframings || [])) {
    if (turns.length >= maxTurns) break;
    const figs = (r.alongAxis || []).filter(Boolean);
    if (!figs.length) continue;
    const line = `the reading turns around ${figs.join(' / ')}.`;
    if (!turns.includes(line)) turns.push(line);
  }

  return { settled, heldOpen, turns: turns.slice(0, maxTurns) };
};

// projectGroupedNote — the full crossing: substrate → three groups → headed text,
// leak-checked. Returns the talker-facing notes string (or '' when the reading is
// empty). This is the rich-notes equivalent of composeNote's flat path.
export const projectGroupedNote = (substrate, opts = {}) => {
  const groups = projectNotes(substrate, opts);
  const text = composeGroupedNote(groups);
  assertNotesNoLeak(text);
  return text;
};

// assertNotesNoLeak — the membrane invariant for the notes block (§3). No IRI, no
// hashId, no citation tag may reach the talker. Exported so the witness and tests
// reuse the exact check; throws on a leak.
const IRI_RE = /\beo:[A-Za-z]|https?:\/\//;
const CITE_RE = /\[s\d+\]/;
export const assertNotesNoLeak = (text) => {
  const s = String(text ?? '');
  for (const [name, re] of [['IRI', IRI_RE], ['hashId', HASHID_RE], ['citation tag', CITE_RE]]) {
    const m = s.match(re);
    if (m) throw new Error(`notes membrane leak: ${name} ${m[0]} reached the talker`);
  }
  return true;
};
