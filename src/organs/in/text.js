// EO: INS·SIG(Void → Entity,Field,Network, Making,Tending) — text ingest
// Text ingestion. Reads the file, parses it, attaches a lazy sentence-
// embedding cache. Anything beyond plain text (PDF, audio, OCR) belongs
// in an adapter that turns its modality into text; the spine stays the same.

import { parseText }    from '../../perceiver/parse/index.js';
import { buildClauses } from '../../perceiver/parse/index.js';
import { projectGraph } from '../../core/index.js';
import { areDisjoint }  from '../../core/index.js';
import { attachReading } from '../ingest/index.js';
import { createEmbeddingMemo } from '../../model/embed-store.js';

// §4 — the coordinated-subject reading rides behind RULES_REV (the same flag the gated
// talker reads, organs/out/speech/index.js). Read locally so the input organ stays
// decoupled from the output organ; OFF by default, so every golden parse is byte-identical.
// A caller may still override via `opts.coordSubjects`.
const RULES_REV =
  (typeof process !== 'undefined' && process.env && /^(1|true|on)$/i.test(process.env.RULES_REV || '')) || false;

export const ingestText = async (file, opts = {}) => {
  const text  = typeof file === 'string' ? file : await file.text();
  const name  = typeof file === 'string' ? `doc-${Date.now()}` : (file.name || `doc-${Date.now()}`);
  // Inject the role-conflict predicate here, the one layer allowed to see both
  // holons: parse stays a leaf, and the standing-descriptor trigger consults the
  // typing bridge's algebra (sister ⟂ mother) without ever importing it. The
  // sentinel is the CHARGE/VALENCE force: `rolesConflict: false` turns it OFF, so a
  // harness can confirm the forbidden-relation gate trips when exclusivity is gone.
  const rolesConflict = opts.rolesConflict === false ? () => false
    : (typeof opts.rolesConflict === 'function' ? opts.rolesConflict : areDisjoint);
  const coordSubjects = opts.coordSubjects ?? RULES_REV;   // §4 — coordinated subjects (flagged)
  // FEEDBACK channel for large documents. When the caller wires `opts.onProgress`, the
  // parse runs chunked and yielding (returns a Promise) and reports as it goes; without
  // it the parse is the synchronous, byte-identical sweep. `await` is safe either way —
  // awaiting the plain doc the sync path returns just resolves to it.
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : undefined;
  // A referent has no name of its own — a name is just its brightest manifestation. When a figure
  // wears none — only a description the text keeps returning to ("the creature") — the reader still
  // resolves it (perceiver/parse/unnamed-referent.js), off the descriptions and pronouns that point
  // at it, so a nameless protagonist reaches the entity explorer instead of vanishing. ON in the
  // reader because it is ordinary reading, not a special capability; precision-gated (recurrence ×
  // agency) so a document whose figures are all named is unchanged. `opts.nameReferent` (optional,
  // ideally the talker) may rename a body or fold its synonyms before admission; without it the body
  // is named by its own dominant description. It can be turned off explicitly for a minimal parse.
  const unnamedReferents = opts.unnamedReferents ?? true;
  // REFERENT-FIRST IDENTITY (perceiver/referents/) — opt-in, OFF by default so the reader's parse
  // is byte-identical until it deliberately adopts the mention→referent model. Pass
  // `referentIdentity:'mention'` to build the layer (the doc gains surfaceMentions / referents /
  // referentOf / surfacesOf / propose / assert / assertDistinct / retract / referentEdges).
  const referentIdentity = opts.referentIdentity ?? null;
  const doc   = await parseText(text, { docId: name, rolesConflict, corefOpts: opts.corefOpts,
                                        coordSubjects, unnamedReferents, nameReferent: opts.nameReferent,
                                        referentIdentity,
                                        onProgress, chunkSize: opts.chunkSize });

  // The graph is a fold of the log. Expose it as a frame-parameterised
  // projection so the UI can re-weight around a reading cursor (γ decay)
  // without the parse holon knowing the UI exists. Memoised in core.
  doc.projectGraph = (frame = {}) => projectGraph(doc.log, frame);

  // Sentence embeddings are computed lazily and cached on the doc itself.
  // First caller pays the warmup; subsequent callers (retrieve, impression,
  // form) re-use the cache. The hot lexical path never invokes this.
  //
  // Cached PER EMBEDDER ORGAN: hash-space and MiniLM-space vectors are not
  // interchangeable, so a single cache keyed by nothing would hand a later MiniLM
  // caller the stale hash vectors the first caller computed — silently defeating the
  // retrieval upgrade. Key by organ id so each space is memoised independently.
  // The matrices are memoised per embedder organ AND held under a global resident-vector
  // budget (model/embed-store.js): a long multi-source session can't grow the heap
  // without bound, and a matrix the budget drops re-hydrates from the persistent embed
  // cache (memory + IndexedDB), never a recompute.
  const sentMemo = createEmbeddingMemo();
  doc.sentenceEmbeddings = async (embedder, onProgress) =>
    sentMemo.get(embedder?.id || 'default', doc.sentences.length, () => {
      const total = doc.sentences.length;
      // Wrap each embed so progress is reported AS vectors land — the embedder may be a
      // real model (MiniLM/ONNX) whose warmup over a large document is the slow phase.
      // The cache holds the fastest form (no wrapper) when no sink is watching.
      return typeof onProgress === 'function'
        ? (() => { let done = 0; onProgress({ phase: 'embed', done: 0, total });
            return Promise.all(doc.sentences.map(s => Promise.resolve(embedder.embed(s))
              .then(v => { onProgress({ phase: 'embed', done: ++done, total }); return v; }))); })()
        : Promise.all(doc.sentences.map(s => embedder.embed(s)));
    });

  // THE CLAUSE LAYER (perceiver/parse/clause-layer.js) — the embedding grain SURF was
  // designed for. `doc.clauses` is the flat clause sequence with sentence-index
  // provenance (a compound sentence becomes ≥2 clauses, each remembering its sentIdx);
  // `doc.clauseEmbeddings` mirrors sentenceEmbeddings but over clause text, so the
  // meaning paths (retrieval, the deep frame axis, the atmosphere) can measure the
  // intra-sentence turn a pooled sentence vector averaged away. Cached PER ORGAN for
  // the same reason (hash- and MiniLM-space vectors are not interchangeable). A
  // document of simple SVO sentences yields one clause per sentence, so those paths
  // read exactly what they read before — the layer only adds resolution to compounds.
  doc.clauses = buildClauses(doc.sentences);
  const clauseMemo = createEmbeddingMemo();
  doc.clauseEmbeddings = async (embedder, onProgress) =>
    clauseMemo.get(embedder?.id || 'default', doc.clauses.length, () => {
      const texts = doc.clauses.map(c => c.text);
      const total = texts.length;
      return typeof onProgress === 'function'
        ? (() => { let done = 0; onProgress({ phase: 'embed', done: 0, total });
            return Promise.all(texts.map(t => Promise.resolve(embedder.embed(t))
              .then(v => { onProgress({ phase: 'embed', done: ++done, total }); return v; }))); })()
        : Promise.all(texts.map(t => embedder.embed(t)));
    });

  // Drop this document's resident embedding matrices (both grains, every organ). The
  // session controller calls it when a source leaves the active topic; the matrices
  // re-hydrate lazily from the persistent embed cache if the source is reopened.
  doc.releaseEmbeddings = () => { sentMemo.release(); clauseMemo.release(); };

  // The predictive read the moment of ingest OWNS: a lazy, memoised `doc.reading()` that
  // renders this document into layered EoT — the structure it extracted beside its
  // prediction and surprise at every turning point. Nothing runs until a caller asks, so
  // the parse stays byte-identical; but from here the reading is a property of the doc,
  // not something a later consumer has to remember to compute (ingest/read.js).
  attachReading(doc);

  return doc;
};
