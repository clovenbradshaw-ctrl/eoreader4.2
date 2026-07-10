// EO: INS·CON·DEF(Field → Entity,Link,Field, Making,Binding,Dissecting) — span assembler / shared spine
// The document assembler — shared spine for every layout-bearing source.
//
// A native-text PDF, a scanned page OCR'd, a SmolDocling conversion, a scraped
// civic page: each front-end extracts its modality's own structure, but they all
// reduce to the SAME thing — an ordered list of BLOCKS, each a run of text that
// sits somewhere (a page, a bounding box) and plays a role (heading, paragraph,
// table cell, list item). This assembler is what turns that block list into the
// universal doc contract, ONCE, so the adapters above it stay thin.
//
// The one fact the flat-blob path throws away and this one keeps is GEOMETRY plus
// the CHARACTER RANGE. Every block records `[charStart, charEnd)` into the single
// reconstructed `text`, alongside its page and bbox. That is the difference between
// an EVA event that can point at a passage — "this claim rests on chars 1840–1905
// of page 3, the box at (72,410,468,24)" — and one that can only gesture at a blob.
// Grounding (organs/out/limner/ground.js) reads labels back from a referenced span;
// these spans are what it points into.
//
// It INGESTS; it does not read. Each block is an INS (so γ-mass, the reading cursor
// and the three levels all work), bonded to the next along the reading order by a
// CON `flow` edge. Coreference over the prose is the engine's own job downstream —
// run parseText over `doc.text` when you want entities; the organ's contract is the
// faithful, addressable surface.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';
import { attachReading }     from '../ingest/index.js';

const slug = (s) => String(s || 'block').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'block';

// blocks: [{ text, kind?, level?, page?, bbox?:[x,y,w,h], ref? }] in reading order.
export const assembleDocument = ({ name = `doc-${Date.now()}`, modality = 'document', blocks = [], metadata = {}, extra = {} } = {}) => {
  const log = createLog({ docId: name });
  const units = [];
  const sentences = [];
  const spans = [];
  const mentions = new Map();
  const seen = new Map();

  let text = '';
  let prevId = null;

  blocks.forEach((b, i) => {
    const body = String(b.text ?? '').trim();
    if (!body) return;

    const kind = b.kind || 'block';
    const base = slug(kind);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = `${base}-${n}`;

    // Char range into the single reconstructed text — the addressable passage.
    const charStart = text.length;
    text += body;
    const charEnd = text.length;
    // Blocks are separated so retrieval / parse see sentence boundaries; a heading
    // breaks a paragraph, a table cell breaks a line.
    text += (kind === 'cell' ? '\t' : '\n\n');

    log.append({ op: 'INS', id, label: kind, sentIdx: i });
    mentions.set(id, [i]);
    if (b.level != null) log.append({ op: 'DEF', id, key: 'level', value: String(b.level), sentIdx: i });
    if (prevId) log.append({ op: 'CON', src: prevId, tgt: id, via: 'flow', sentIdx: i });
    prevId = id;

    spans.push({ id, kind, level: b.level ?? null, charStart, charEnd, page: b.page ?? null, bbox: b.bbox ?? null, ref: b.ref ?? null, text: body });
    units.push(`${kind}: ${body.slice(0, 60)}${body.length > 60 ? '…' : ''}`);
    sentences.push(body);
  });

  const tokensBySentence = sentences.map(s => new Set(tok(s)));

  const doc = {
    docId: name, modality,
    text: text.trimEnd(),
    units, sentences, spans, tokensBySentence,
    log, mentions,
    conventions: createConventions(),
    metadata,
    ...extra,
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // The span a character offset falls in — what an EVA event resolves to when it
  // wants to name the passage a claim rests on.
  doc.spanAt = (charOffset) => spans.find(s => charOffset >= s.charStart && charOffset < s.charEnd) || null;
  doc.spanText = (i) => spans[i]?.text ?? '';

  // Every layout-bearing source gets the same lazy predictive read as a parsed-text one:
  // a memoised `doc.reading()` that renders the blocks into layered EoT — structure beside
  // prediction and surprise at the turning points (ingest/read.js). Lazy, so assembly cost
  // is unchanged until a caller reads.
  attachReading(doc);

  // Cached per embedder organ (see organs/in/text.js — spaces are not interchangeable).
  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
