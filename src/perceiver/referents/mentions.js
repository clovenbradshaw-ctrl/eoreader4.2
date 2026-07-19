// EO: INS(Void → Entity, Making) — surface-mention observation
// A SURFACE MENTION is an OCCURRENCE — a mark at an exact source span — not a document-global
// label. "Victor" at sentence 872 and "Victor" at sentence 1235 are two mentions; whether they
// denote one referent is a separate, defeasible question the field decides (referents/field.js).
// This module only observes: "this mark exists, here, and it is of this kind." It never merges,
// never mints a referent, never reads salience. Admission means the mark exists, not that an
// entity does — invariant 1 (a surface is a mention span, not a label).
//
// Four forms are read, each with its exact [start,end) offsets into the sentence so the UI can
// jump to THIS occurrence and no other (invariant 8, acceptance test 8):
//   name        — a capitalised proper-name span (the entity scanner, shared with the parser)
//   description — a definite/indefinite description ("the creature", "the wretch")
//   pronoun     — he/she/it/they and their oblique/possessive forms
//   deixis      — first person (I/me/my), the teller's self-reference

import { scanEntities } from '../parse/entities.js';

// The determiner + up-to-three-modifier + lowercase-head shape of a description, mirroring the
// unnamed-referent scan (parse/unnamed-referent.js) so the two read the same surfaces. A leading capital
// is allowed for a sentence-initial "The"; the HEAD stays lowercase so a proper name is never
// mistaken for a description.
const DET  = String.raw`(?:[Tt]he|[Aa]n?)`;
const MODS = String.raw`(?:[a-z][a-z'’-]+\s+){0,3}`;
const HEAD = String.raw`[a-z][a-z'’-]{2,}`;
const DESC_RE = new RegExp(String.raw`\b${DET}\s+${MODS}?(${HEAD})\b`, 'g');

// Third-person pronouns (subject/object/possessive) and first-person deixis. Closed classes, read
// as surfaces only — resolution is the field's job, never this scan's.
const PRONOUN = new Set(['he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its',
  'they', 'them', 'their', 'theirs', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours']);
const DEIXIS = new Set(['i', 'me', 'my', 'mine', 'myself']);
const WORD_RE = /[A-Za-z][A-Za-z'’]*/g;

// Approximate singularisation, matching the unnamed-referent read so "the creatures"/"the creature"
// normalise to one head. Timid on purpose (plain trailing -s only).
const singular = (h) => (h.length > 4 && h.endsWith('s') && !h.endsWith('ss')) ? h.slice(0, -1) : h;

const mentionId = (docId, sentIdx, start, end) => `surface:${docId}:${sentIdx}:${start}-${end}`;

// observeMentions(sentences, { docId }) → Mention[]
//   Source-ordered (by sentIdx, then start). Repeated text yields repeated mentions with distinct
//   ids — the id addresses the OCCURRENCE (invariant 1). Pure over the sentences; no admission or
//   coref state is read, because a mention is prior to identity.
export const observeMentions = (sentences, { docId = 'doc' } = {}) => {
  const out = [];
  const arr = Array.isArray(sentences) ? sentences : [];
  arr.forEach((sent, sentIdx) => {
    const s = String(sent || '');
    const claimed = [];   // [start,end) spans already taken by a name, so a description/pronoun scan does not re-read them
    const overlaps = (a, b) => claimed.some(([x, y]) => a < y && x < b);

    // Names first — the highest-precision surface. The scanner is the parser's own, so a mention's
    // span is exactly the span the relation extractor cites.
    for (const e of scanEntities(s)) {
      out.push({ id: mentionId(docId, sentIdx, e.start, e.end), docId, sentIdx,
                 start: e.start, end: e.end, text: s.slice(e.start, e.end),
                 label: e.label, normalized: e.label.toLowerCase(), form: 'name',
                 evidence: { detector: 'entity-scan', confidence: 1 } });
      claimed.push([e.start, e.end]);
    }

    // Descriptions — a definite/indefinite phrase headed by a lowercase common noun.
    let m;
    const dre = new RegExp(DESC_RE.source, 'g');
    while ((m = dre.exec(s)) !== null) {
      const start = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
      const end = m.index + m[0].length;
      if (overlaps(start, end)) continue;
      out.push({ id: mentionId(docId, sentIdx, start, end), docId, sentIdx,
                 start, end, text: s.slice(start, end).trim(),
                 normalized: singular(m[1].toLowerCase()), form: 'description',
                 evidence: { detector: 'description-scan', confidence: 1 } });
    }

    // Pronouns and deixis — the anaphors the field flows referents across.
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(s)) !== null) {
      const lw = m[0].toLowerCase();
      const isPron = PRONOUN.has(lw), isDeix = DEIXIS.has(lw) || m[0] === 'I';
      if (!isPron && !isDeix) continue;
      const start = m.index, end = m.index + m[0].length;
      if (overlaps(start, end)) continue;
      out.push({ id: mentionId(docId, sentIdx, start, end), docId, sentIdx,
                 start, end, text: m[0], normalized: lw,
                 form: isDeix ? 'deixis' : 'pronoun',
                 evidence: { detector: 'anaphor-scan', confidence: 0.5 } });
    }
  });
  out.sort((a, b) => a.sentIdx - b.sentIdx || a.start - b.start);
  return out;
};

export { mentionId, singular as headSingular };
