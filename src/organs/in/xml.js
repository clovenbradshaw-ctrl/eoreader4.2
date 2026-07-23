// EO: SEG(Void → Field) — XML/TEI adapter → assembleDocument
// A TEI (or other structured) XML source is neither prose nor a flat sheet: it carries
// bibliographic front matter (title/author, who edited and funded it, its rights statement,
// the print source it transcribes, its revision history) APART from the body it transcribes —
// and the body itself nests (book ⊃ chapter ⊃ paragraph, or a critical edition's div1/div2/div3
// reference numbering). organs/ingest/xml-text.js does the parsing (pure, no DOM); this mirrors
// organs/in/webpage.js — blocks (+ metadata) in, one doc out on the universal contract — so a
// `.xml` file reads through the SAME spine every other modality does, `doc.text` a clean,
// addressable reading rather than the raw tag soup an HTML-minded reader would produce.

import { assembleDocument } from './document.js';
import { parseXmlDocument } from '../ingest/xml-text.js';

// tei.metadata → the front-matter blocks, laid BEFORE the body so they land first in doc.text
// (searchable/summarizable, same as everything else) while staying distinguishable by kind —
// the native XML view (rooms/reader/xml-render.js) reads the same fields off `doc.tei` instead,
// for a proper metadata card rather than flattened prose.
// Tagged kind:'frontmatter' (never 'paragraph') so a consumer that wants the BODY alone — the
// native XML view's own metadata card, built straight off `doc.tei` instead — can filter these
// back out of `doc.spans` rather than showing the same facts twice.
const frontMatterBlocks = (meta) => {
  const blocks = [];
  if (!meta) return blocks;
  const push = (text) => { if (text) blocks.push({ text, kind: 'frontmatter' }); };
  push(meta.subtitle);
  push([
    meta.authors.length ? 'by ' + meta.authors.join(', ') : '',
    meta.editors.length ? 'ed. ' + meta.editors.join(', ') : '',
  ].filter(Boolean).join(', '));
  for (const r of meta.respStmts) push([r.resp, r.names.join(', ')].filter(Boolean).join(': '));
  if (meta.sponsor) push('Sponsor: ' + meta.sponsor);
  if (meta.principal) push('Principal investigator: ' + meta.principal);
  if (meta.funder.length) push('Funded by ' + meta.funder.join(', '));
  push([meta.publisher, meta.pubPlace].filter(Boolean).join(', '));
  if (meta.sourceDesc) push('Source: ' + meta.sourceDesc);
  for (const p of meta.availability) push(p);
  return blocks;
};

// ingestXml({ name?, xml, url?, metadata? }) → the doc. `metadata` is caller-supplied front
// matter (a file's own title guess) — a real <teiHeader> title/author wins over it, matching
// the header-harvest precedence every other modality follows (organs/in/index.js's barrel note).
export const ingestXml = ({ name, xml, url, metadata: metaIn } = {}) => {
  const docName = name || url || `xml-${Date.now()}`;
  const parsed = parseXmlDocument(xml);
  const meta = parsed.meta;

  const blocks = [];
  const title = (meta && meta.title) || (metaIn && metaIn.title) || '';
  if (title) blocks.push({ text: title, kind: 'title', level: 1 });
  blocks.push(...frontMatterBlocks(meta));
  blocks.push(...parsed.blocks);

  // A real <teiHeader> title/author wins over the caller's guess (a file's own name) — not just
  // fills a gap — since metaIn is typically that guess, made before the document was even read.
  const metadata = { ...(metaIn || {}) };
  if (title) metadata.title = title;
  const authorStr = meta && meta.authors.length ? meta.authors.join(', ') : '';
  if (authorStr) metadata.author = authorStr;
  if (url && !metadata.url) metadata.url = url;

  return assembleDocument({
    name: docName, modality: 'xml', blocks, metadata,
    extra: {
      isTei: parsed.isTei, rootTag: parsed.rootTag, tei: meta,
      unresolvedEntities: parsed.unresolvedEntities, url: url || null,
    },
  });
};
