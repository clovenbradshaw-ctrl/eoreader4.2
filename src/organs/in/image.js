// EO: INS·CON·SIG(Void → Entity,Link, Making,Binding) — image adapter (vision detections)
// The image adapter — proof the spine is modality-universal.
//
// `parse` is the text adapter; this is the image one. A vision model (any —
// injected as plain detections, nothing bundled here) turns an image into
// regions and relations. We emit the *same nine operators* onto the *same
// append-only log*: each region is an INS, each spatial/semantic link a CON or
// SIG, each label a DEF. The result is the same doc contract text produces, so
// the graph view, the reading cursor, the three reading levels and the fold
// all work over an image's object graph with no change to the spine.
//
// The reading order of regions (top-to-bottom, left-to-right) is the image's
// "reading cursor": significance predicts the next object and is surprised by
// one that the layout did not lead it to expect — L3 math, unchanged.

import { createLog }        from '../../core/index.js';
import { projectGraph }     from '../../core/index.js';
import { createConventions }from '../../core/conventions/index.js';
import { tok }              from '../../perceiver/parse/index.js';

const slug = (s) => String(s || 'thing').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export const ingestImage = (detections = {}) => {
  const {
    name = `image-${Date.now()}`,
    width = 0, height = 0,
    regions = [],   // [{ label, bbox:[x,y,w,h], score? }]
    relations = [], // [{ from, to, kind:'con'|'sig', via }] — indices into regions
  } = detections;

  // Reading order over the regions is the image's reading sequence.
  const order = regions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.bbox?.[1] ?? 0) - (b.r.bbox?.[1] ?? 0) || (a.r.bbox?.[0] ?? 0) - (b.r.bbox?.[0] ?? 0));

  const log = createLog({ docId: name });
  const units = [];
  const sentences = [];
  const orderedRegions = [];
  const mentions = new Map();
  const idByOriginalIndex = new Map();
  const seen = new Map();

  order.forEach(({ r, i }, unitIdx) => {
    const base = slug(r.label);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    idByOriginalIndex.set(i, id);

    log.append({ op: 'INS', id, label: r.label, sentIdx: unitIdx });
    mentions.set(id, [unitIdx]);
    if (r.attr) log.append({ op: 'DEF', id, key: 'predicate', value: r.attr, sentIdx: unitIdx });

    orderedRegions.push({ ...r, id, unitIdx });
    units.push(`${r.label} (region ${unitIdx})`);
    sentences.push(String(r.label || ''));
  });

  for (const rel of relations) {
    const src = idByOriginalIndex.get(rel.from);
    const tgt = idByOriginalIndex.get(rel.to);
    if (!src || !tgt || src === tgt) continue;
    const op = rel.kind === 'sig' ? 'SIG' : 'CON';
    const sentIdx = orderedRegions.find(o => o.id === src)?.unitIdx ?? 0;
    log.append({ op, src, tgt, via: rel.via || 'near', sentIdx });
  }

  const tokensBySentence = sentences.map(s => new Set(tok(s)));

  const doc = {
    docId: name, modality: 'image', width, height,
    units, sentences, regions: orderedRegions, tokensBySentence,
    log, mentions,
    conventions: createConventions(),
    // The universal contract's metadata slot (organs/in: every doc carries one). Text
    // harvests it from labeled front-matter lines; an image's equivalent is its EXIF
    // (title, author, date, camera, GPS), passed in by the caller that read the file.
    metadata: detections.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // Cached per embedder organ — hash-space and MiniLM-space vectors are not
  // interchangeable, so a single unkeyed cache would return the wrong space to a
  // later caller (see organs/in/text.js).
  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
