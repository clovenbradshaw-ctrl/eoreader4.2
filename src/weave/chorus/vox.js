// EO: NUL(Entity → Void, Clearing) — vox leaf (out-organ)
// The vox leaf — optional and terminal (docs/chorus.md, "The vox leaf").
//
// The vox turns ONE selected fold into ONE human sentence, under the
// phrasing-surface discipline: verbatim excerpts in, one sentence out, no
// operators, no addresses, no machinery words, single output per call. It is
// called only for the cells a reader wants spoken, one cell per call, never
// spanning cells or levels. It CANNOT invent a cross-level synthesis because it is
// never handed two cells. Its output is regenerable and discardable, because the
// fold behind it persists with its coordinate (fold.js). The vox is a mouth lent
// briefly to a fold. It is not where the reading lives and it never feeds back
// into structure.
//
// This module owns the discipline, not the model. `phrase` is injected — the same
// firewall every other organ-touching module runs — so the vox can be tested with
// a stub and driven by any phrasing surface in production. It NEVER imports a model.

// Machinery words the sentence must not carry — operator codes, face/axis names,
// arrow glyphs, cell-key underscores. A guard, not a generator: if the injected
// phrasing surface leaks a coordinate, we strip it rather than ship it.
const OP_CODES = /\b(NUL|SEG|DEF|SIG|CON|EVA|INS|SYN|REC)\b/g;
const MACHINERY = /\b(cube|marginal|centroid|cosine|Born|fold-voice|Ground|Figure|Pattern|Act|Site|Stance)\b/gi;
const CELL_KEY = /\b[A-Z]{3}_[A-Za-z]+_[A-Za-z]+\b/g;   // OP_Stance_Site
const ARROWS = /[-=]{1,2}>|→|⟶/g;

// Reduce a phrasing surface's output to a single clean sentence under the
// discipline: strip machinery, take the first sentence, collapse whitespace.
const disciplined = (text) => {
  let s = String(text || '')
    .replace(CELL_KEY, '')
    .replace(OP_CODES, '')
    .replace(ARROWS, '')
    .replace(MACHINERY, '')
    .replace(/\s+/g, ' ')
    .trim();
  // One sentence out — take up to the first terminal punctuation, keep it.
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  if (m) s = m[0].trim();
  return s;
};

// Build the vox leaf around an injected phrasing surface. `phrase({ excerpts,
// cell })` returns a Promise<string> (or string). The leaf enforces one fold, one
// call, one sentence, and never touches structure.
export const createVox = ({ phrase } = {}) => {
  if (typeof phrase !== 'function')
    throw new Error('vox requires an injected phrase({ excerpts, cell }) surface');

  // Speak a SINGLE fold. `excerpts` are the verbatim spans the reader wants voiced
  // for this cell (the fold's provenance is the default source). Rejects anything
  // that is not one fold, so a caller cannot smuggle a cross-cell synthesis in.
  const speak = async (fold, { excerpts = null } = {}) => {
    if (!fold || fold.kind !== 'fold-voice')
      throw new Error('vox speaks exactly one fold-voice — never two, never a cell list');
    const spans = excerpts != null ? excerpts : (fold.provenance?.spans || []);
    const said = await phrase({ excerpts: spans, cell: fold.cell });
    return Object.freeze({
      // The sentence — regenerable and discardable. The fold behind it persists.
      sentence: disciplined(said),
      // The coordinate is carried alongside for the caller's bookkeeping, but is
      // NOT in the sentence — the discipline. The vox never feeds this back.
      of: fold.address,
      regenerable: true,
    });
  };

  return Object.freeze({ speak, disciplined });
};
