// EO: INS·CON·SEG(Void,Field → Entity,Link,Network, Making,Binding,Dissecting) — barrel — sense organs
// organs/in — the sense organs (reshape §3). A modality → a doc on the universal
// contract. An organ INGESTS its modality; it does not understand it. Each adapter
// turns a source into the modality-neutral spine the core reads:
//
//   ingestText(file)            text      → units = sentences
//   ingestImage(detections)     image     → units = regions  (vision model injected)
//   ingestMusic(score)          melody    → units = notes    (pitch-class entities)
//   ingestFrequencies(spec)     raw tones → units = notes    (overtone token sets)
//   ingestFrames(spec)          video     → units = frames   (motion tracks)
//   ingestCodons(spec)          DNA/RNA   → units = codons   (prefix token sets)
//   ingestCode(file)            source    → units = modules / functions / classes,
//                                           related by imports / definedIn / calls / extends.
//                                           Emits EOT and lowers it, so a program reads as a
//                                           traversable EO graph (organs/in/code.js).
//   ingestAudio(transcript)     speech    → units = utterances (whisper heard; ear injected),
//                                           words as timed entities on the reading line of time.
//   ingestPdf(pages)            civic PDF → units = lines with page + bbox + char-range spans
//                                           (pdf.js text-items injected; geometry kept, not flattened).
//   ingestOcr(result)           scanned   → units = lines with bbox (Tesseract word boxes injected).
//   ingestDocling(doctags)      scanned   → units = layout-aware blocks (SmolDocling VLM injected).
//   composeScene(seen)          photo     → the detections ingestImage eats, from a vision model's
//                                           STRUCTURED output (Florence-2 injected): spatial relations
//                                           and narration derived from the boxes, so the expensive
//                                           decode stays short and every phrase grounds to a region.
//   ingestWebpage(page)         scraped   → units = markdown blocks (Readability+Turndown injected).
//   ingestTable(sheet)          CSV/xlsx  → units = rows; columns are DEF facts (Papaparse/SheetJS injected).
//   readWarc / ingestWarc       archive   → the WARC record as the frozen, addressable source.
//
// These layout adapters share one span-assembler (organs/in/document.js): every unit
// records its [charStart,charEnd) into the reconstructed text plus its page/bbox, so an
// EVA event can point at a passage a reader can find — not a flat blob.
//
// New modalities are new adapters emitting the same operators onto the same log.
// The spine does not change.
//
// Every doc carries a `metadata` slot (by canonical key: title, author, date, …) —
// the modality-neutral home for its bibliographic facts. It is the document's FRONT
// MATTER, omnimodal: text harvests it structurally from labeled lines (the case
// human-language input especially carries — parse/metadata.js), while an image fills
// it from EXIF, a score from ID3, a clip from container tags. The turn includes it
// when chatting about the document, so "who wrote this?" / "when is it from?" are
// answerable whatever the modality.
//
// Across documents it is held as a THEORY, not collapsed: a composite keeps each
// member's front matter apart (`metadataByDoc`, provenance retained) rather than
// merging a shared title into one — the same rule the referents follow, since the
// "Darcy" of one document is not the "Darcy" of another until a proof unifies them.
// Each fact is addressed under its document's holon, so the address carries the scope.

export { ingestText }        from './text.js';
export { createCompositeDoc, proposeCrossDocSyn, compositeDocIdOf } from './composite.js';
export { ingestImage }       from './image.js';
export { composeScene }      from './scene.js';
export { ingestAudio }       from './audio.js';
export { assembleDocument }  from './document.js';
export { ingestPdf }         from './pdf.js';
export { ingestOcr }         from './ocr.js';
export { ingestDocling }     from './docling.js';
export { ingestWebpage }     from './webpage.js';
export { ingestTable }       from './table.js';
export { ingestJson }        from './json.js';
export { readWarc, ingestWarc } from './warc.js';
export { ingestMusic }       from './music.js';
export { ingestFrequencies } from './frequency.js';
export { ingestFrames }      from './video.js';
export { ingestCodons }      from './codon.js';
export { ingestCode }        from './code.js';
export {
  parseFasta, complement, reverseComplement, codonsOf, isStop,
  codonVector, vectorDim, codonReadings, frameReading, sixFrameReadings,
  rcCanonical, complementSignedReadings, ALL_DNA_CODONS, codonContextVectors,
} from './locus.js';
