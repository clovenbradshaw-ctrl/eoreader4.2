// EO: SEG·NUL(Field → Field, Clearing) — foldNote; the integral fold
// foldNote — the integral fold. The unit of evidence the talker reads beside
// the verbatim spans.
//
// When the document is present, the fold IS the consciousness: it queries the
// three reading surfaces (existence, structure, significance) and integrates
// them into a single reading, every line carrying its source index so
// citations still bind. Without a document it falls back to a condensed,
// source-ordered digest of the spans — still a fold, tighter than a raw dump.

import { consciousness } from '../../perceiver/index.js';
import { buildSubstrate, readReflections } from './substrate.js';
import { projectGroupedNote } from './project.js';

export const foldNote = (spans, opts = {}) => {
  if (!spans || spans.length === 0) return { text: '', sources: [] };
  const ordered = spans.slice().sort((a, b) => a.idx - b.idx);
  const sources = ordered.map(s => s.idx);

  const doc = opts.doc;
  if (doc && doc.log) {
    // `focus` is the referents the message named (read/namedReferents). When
    // present, the consciousness centres the structured reading on them rather
    // than on the retrieval window — everything tied to the referent, not whatever
    // the window drifted across.
    const c = consciousness(doc, ordered, opts.cursor ?? null, opts.focus || []);
    // The RICH NOTES path (rich-notes §1–§3, behind RULES_REV via opts.grouped). The
    // same level-2/level-3 reading the consciousness folded is projected through the
    // substrate (settled · held-open · turns) and the membrane, so the Significance
    // appearances the flat notes drop — the held contradictions and the located turn —
    // reach the talker. Falls back to the flat composeNote text on an empty projection,
    // and the whole branch is inert (byte-identical) when the flag is off.
    if (opts.grouped && c && c.levels) {
      const substrate = buildSubstrate({
        structure: c.levels.structure, significance: c.levels.significance,
        surf: opts.surf || null, reflections: readReflections(doc), cursor: opts.cursor ?? null,
      });
      const text = projectGroupedNote(substrate);
      if (text) return { text, sources, levels: c.levels, substrate };
    }
    if (c && c.text) return { text: c.text, sources, levels: c.levels };
  }

  // No-doc fallback: a condensed, source-ordered digest — still a fold, not a
  // copy. The index lives on `sources` (the binder's channel), never in the
  // text: the talker reads prose, not `[sN]` tags (§3).
  const text = ordered.map(s => condense(s.text)).join('\n');
  return { text, sources };
};

// Trim a span to its first clause when it is long, so the digest fallback is
// a fold and not a copy. Short spans pass through unchanged.
const condense = (s) => {
  const t = String(s || '').trim();
  if (t.length <= 160) return t;
  const cut = t.slice(0, 160);
  const stop = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '));
  return (stop > 60 ? cut.slice(0, stop) : cut.replace(/\s+\S*$/, '')) + '…';
};
