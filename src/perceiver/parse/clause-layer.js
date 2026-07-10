// EO: SEG(Field → Field,Link, Dissecting) — clause grain layer
// The clause layer — the embedding grain SURF was designed for but never got.
//
// Every place meaning enters the reader (retrieval, the deep frame axis, the
// atmosphere, the classifier) embedded ONE pooled vector per whole SENTENCE. A
// compound sentence carrying a quiet clause and a loud clause handed that pool a
// single averaged vector, so a mid-sentence semantic turn was averaged away — the
// exact chunk-granularity defect RAG debates, moved one layer down. docs/phasepost.md
// already names the fix: "Clause-level is the design target (the unit is the
// proposition)." The parser has carried clause-grain machinery since the §8 SEG-first
// rework (clauses.js); this layer lifts it to the embedding paths.
//
// PROVENANCE IS PRESERVED. Each clause keeps the `sentIdx` it came from, so a
// clause-grain MATCH still grounds at a SENTENCE-grain CITATION ("its index is real",
// surfing-the-fold.md). Retrieval scores per clause and cites per sentence; the
// meaning read surprises per clause and folds back to a per-sentence cursor. Nothing
// downstream that indexes by sentence has to change.
//
// SINGLE-CLAUSE SENTENCES ARE BYTE-IDENTICAL. segmentClauses on a sentence with no
// clause boundary returns exactly that sentence (trimmed), so a document of simple
// SVO sentences produces one clause per sentence and every meaning path reads exactly
// what it read before. The layer only ever ADDS resolution to compound sentences.

import { segmentClauses } from './clauses.js';

// Flatten a sequence of units (sentences) into clause units carrying sentence-index
// provenance. A unit that segments to nothing (blank/whitespace) contributes no
// clause — the unit still exists as a sentence, it just has no embeddable clause,
// exactly as an empty sentence had no meaningful embedding before.
export const buildClauses = (units = []) => {
  const clauses = [];
  units.forEach((unit, sentIdx) => {
    for (const sp of segmentClauses(unit)) {
      clauses.push({ text: sp.text, sentIdx, offset: sp.offset, opener: sp.opener });
    }
  });
  return clauses;
};

// sentIdx → [positions in the flat clause array], for a per-sentence reduction
// (the meaning read folds each sentence's clauses back to one cursor by MAX).
export const clauseIndexBySentence = (clauses = [], sentenceCount = 0) => {
  const byS = Array.from({ length: sentenceCount }, () => []);
  clauses.forEach((c, i) => { if (c.sentIdx >= 0 && c.sentIdx < sentenceCount) byS[c.sentIdx].push(i); });
  return byS;
};

// The clause a relation was read from — the tightest embeddable text for the
// classifier (the centroids are clause-grain). Find the clause whose text contains
// the verb (word-boundary, case-insensitive); fall back to the whole sentence when
// the verb cannot be located, so the query is never emptier than before.
export const clauseForVerb = (sentence, verb) => {
  const s = String(sentence || '');
  const v = String(verb || '').trim();
  if (!v) return s;
  const spans = segmentClauses(s);
  if (spans.length <= 1) return s;
  const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const hit = spans.find(sp => re.test(sp.text));
  return hit ? hit.text : s;
};
