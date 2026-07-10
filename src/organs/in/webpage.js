// EO: SEG(Void → Field, Dissecting) — web-page adapter → assembleDocument
// The web-page adapter — scraped civic pages, stripped to their content.
//
// Civic sources (EasyVote, ArcGIS wrappers, Metro sites) bury the record under
// navigation chrome. Readability.js (Mozilla) extracts the main article; Turndown
// turns that into canonical Markdown to STORE — a stable, diffable surface, not a
// live DOM. (For DOM traversal inside a worker, linkedom over Cheerio: lighter and
// worker-native. All of that runs in the caller; this adapter is pure.) A .docx that
// lands routes here too: mammoth.js → HTML → Turndown → the same Markdown, so a Word
// deliverable and a scraped page read through one path.
//
// The Markdown is split into blocks on its own structure — headings, paragraphs,
// list items, fenced code, tables — so each becomes an addressable span carrying its
// role, and the reconstructed text feeds retrieval and coref (parseText over
// `doc.text`) unchanged. This complements the SOURCING layer (src/ingest/websource.js):
// that mints the provenance record and hash; this shapes the content onto the spine.

import { assembleDocument } from './document.js';

// A minimal, dependency-free Markdown block splitter. It is deliberately shallow —
// heading / list / quote / code-fence / table-row / paragraph — because the point is
// addressable passages, not a full CommonMark tree (that lives in the output organ,
// organs/out/publish/markdown.js, where node-level EVA edits need the real mdast).
const splitMarkdown = (md) => {
  const out = [];
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let inFence = false, fence = [];
  const flushPara = () => { if (para.join(' ').trim()) out.push({ text: para.join(' ').trim(), kind: 'paragraph' }); para = []; };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inFence) { out.push({ text: fence.join('\n'), kind: 'code' }); fence = []; inFence = false; }
      else { flushPara(); inFence = true; }
      continue;
    }
    if (inFence) { fence.push(line); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); out.push({ text: h[2].trim(), kind: 'heading', level: h[1].length }); continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) { flushPara(); out.push({ text: line.replace(/^\s*([-*+]|\d+\.)\s+/, '').trim(), kind: 'list-item' }); continue; }
    if (/^\s*>\s?/.test(line)) { flushPara(); out.push({ text: line.replace(/^\s*>\s?/, '').trim(), kind: 'quote' }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;   // table separator row
      flushPara(); out.push({ text: line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()).join(' · '), kind: 'row' }); continue;
    }
    if (line.trim() === '') { flushPara(); continue; }
    para.push(line.trim());
  }
  if (inFence && fence.length) out.push({ text: fence.join('\n'), kind: 'code' });
  flushPara();
  return out;
};

// page: { name?, url?, title?, byline?, markdown? | content?(markdown), html?, metadata? }
export const ingestWebpage = (page = {}) => {
  const { name = page.url || `page-${Date.now()}`, markdown, content } = page;
  const md = markdown ?? content ?? '';
  const blocks = [];
  const title = page.title && String(page.title).trim();
  if (title) blocks.push({ text: title, kind: 'title', level: 1, ref: { source: page.url || null } });
  blocks.push(...splitMarkdown(md));

  // Front matter the caller harvested — title, byline, canonical url, site — the
  // web-source equivalent of a document's labeled header lines.
  const metadata = { ...(page.metadata || {}) };
  if (title && !metadata.title) metadata.title = title;
  if (page.byline && !metadata.author) metadata.author = String(page.byline).trim();
  if (page.url && !metadata.url) metadata.url = page.url;

  return assembleDocument({
    name, modality: 'webpage', blocks, metadata,
    extra: { url: page.url || null, reader: 'readability+turndown' },
  });
};
