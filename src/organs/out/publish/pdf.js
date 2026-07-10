// EO: SIG·NUL(Field → Void, Tending,Clearing) — PDF plan — embeds provenance/audit trail
// Publish → PDF, with pdf-lib — a PDF that carries its own audit trail.
//
// jsPDF only lays glyphs out; the reason to publish through pdf-lib instead is that
// pdf-lib can EMBED. A civic PDF that is going to be cited back must carry the chain
// that makes it checkable: the source WARC record it was built from, the hash of each
// passage it rests on, and the EVA provenance chain, written into the PDF's own XMP
// metadata and as attached files. The deliverable then verifies itself — the audit
// trail travels inside the artifact, not in a sidecar that gets separated from it.
// (When the deliverable is going to a human editor rather than the public, docx via
// dolanmiu/docx is the better target — see publish/index.js.)
//
// PURE: this builds the PLAN — pages of text plus the metadata/attachments to embed.
// The caller drives pdf-lib against it (nothing bundled). `applyPdfPlan` is a thin
// executor for a caller that hands in a pdf-lib `PDFDocument`.

// pdfPlan(doc, provenance) → a plan the caller feeds to pdf-lib.
//   doc:        an organs/in document (spans carry the passages + their geometry/hashes)
//   provenance: { warc?, evaChain?, hashes?, title?, author?, subject? }
export const pdfPlan = (doc = {}, provenance = {}) => {
  const spans = doc.spans || [];
  // One text block per span, tagged with the passage's stable anchor so a reader can
  // trace a rendered line back to the char range / page / box it came from.
  const blocks = spans.map(s => ({
    text: s.text,
    kind: s.kind,
    anchor: { ref: s.id, charStart: s.charStart, charEnd: s.charEnd, page: s.page ?? null, bbox: s.bbox ?? null },
    fontSize: s.kind === 'heading' || s.kind === 'title' ? 18 : 11,
    bold: s.kind === 'heading' || s.kind === 'title',
  }));

  // The XMP the PDF should carry — the whole point of choosing pdf-lib. Written into
  // the document's metadata dictionary so the audit trail is inside the file.
  const xmp = {
    title: provenance.title || doc.metadata?.title || doc.docId,
    author: provenance.author || doc.metadata?.author || null,
    subject: provenance.subject || `Provenance-bearing civic record (${doc.modality})`,
    keywords: ['eoreader4', 'provenance', doc.modality].filter(Boolean),
    custom: {
      'eo:sourceWarc': provenance.warc?.sourceId || provenance.warc || null,
      'eo:passageHashes': provenance.hashes || null,
      'eo:evaChain': provenance.evaChain || null,
    },
  };

  // Files to attach to the PDF (pdf-lib `attach`): the source WARC and the raw EVA
  // chain, so the artifact carries the evidence, not just a reference to it.
  const attachments = [];
  if (provenance.warc && (provenance.warc.body || typeof provenance.warc === 'string')) {
    attachments.push({ name: 'source.warc', mime: 'application/warc', data: provenance.warc.body ?? provenance.warc });
  }
  if (provenance.evaChain) {
    attachments.push({ name: 'eva-chain.json', mime: 'application/json', data: JSON.stringify(provenance.evaChain, null, 2) });
  }

  return { blocks, xmp, attachments, page: { size: 'Letter', margin: 64 } };
};

// applyPdfPlan(pdfLibDoc, plan, { font }) → the same PDFDocument, filled. A thin,
// dependency-free executor: it only calls the pdf-lib surface the caller passes in,
// so this module still imports no library.
export const applyPdfPlan = async (pdfDoc, plan, opts = {}) => {
  const { StandardFonts } = opts.pdfLib || {};
  const font = opts.font || (StandardFonts && await pdfDoc.embedFont(StandardFonts.TimesRoman));
  const bold = opts.boldFont || (StandardFonts && await pdfDoc.embedFont(StandardFonts.TimesRomanBold));
  const margin = plan.page.margin;
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;

  for (const b of plan.blocks) {
    const size = b.fontSize;
    if (y < margin + size) { page = pdfDoc.addPage(); ({ width, height } = page.getSize()); y = height - margin; }
    page.drawText(b.text, { x: margin, y, size, font: b.bold ? bold : font, maxWidth: width - 2 * margin });
    y -= size * 1.6;
  }

  if (pdfDoc.setTitle && plan.xmp.title) pdfDoc.setTitle(plan.xmp.title);
  if (pdfDoc.setAuthor && plan.xmp.author) pdfDoc.setAuthor(plan.xmp.author);
  if (pdfDoc.setSubject && plan.xmp.subject) pdfDoc.setSubject(plan.xmp.subject);
  if (pdfDoc.setKeywords && plan.xmp.keywords) pdfDoc.setKeywords(plan.xmp.keywords);
  for (const att of plan.attachments) {
    if (typeof pdfDoc.attach === 'function') {
      const data = typeof att.data === 'string' ? new TextEncoder().encode(att.data) : att.data;
      await pdfDoc.attach(data, att.name, { mimeType: att.mime });
    }
  }
  return pdfDoc;
};
