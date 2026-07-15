// EO: CON·SEG(Network,Field → Link, Binding,Dissecting) — citation attribution maps
// The per-citation attribution maps a turn's result carries (extracted from pipeline.js under
// the god-module ratchet). Each cited composite sentence index is mapped back through the
// provenance axis: to its source document (origins), to the sentence text itself (texts), and —
// for anything that must OUTLIVE the turn — to its SOURCE-LOCAL sentence index (units): the
// composite axis is a per-turn artifact whose indices shift with whatever else was in scope, so
// a pin's anchor or a findings passage key reads the local unit, never the composite idx.

// The documents a turn's citations actually drew on. For a composite (several selected
// documents folded into one), map each cited sentence index back through the provenance
// axis to its source document; for a single document it is just that document.
export const sourceDocsOf = (doc, sources) => {
  if (!doc) return [];
  if (doc.isComposite && typeof doc.origin === 'function')
    return [...new Set((sources || []).map(i => doc.origin(i)?.docId).filter(Boolean))];
  return doc.docId ? [doc.docId] : [];
};

// Per-CLAIM attribution: each cited sentence index → the source document it came from. { idx: docId }.
export const citeOriginsOf = (doc, sources) => {
  const out = {};
  if (!doc) return out;
  const composite = doc.isComposite && typeof doc.origin === 'function';
  for (const i of (sources || [])) {
    const id = composite ? doc.origin(i)?.docId : doc.docId;
    if (id != null) out[i] = id;
  }
  return out;
};

// Per-citation SOURCE-LOCAL unit — the durable half of a cite. { idx: localIdx }.
export const citeUnitsOf = (doc, sources) => {
  const out = {};
  if (!doc) return out;
  const composite = doc.isComposite && typeof doc.origin === 'function';
  for (const i of (sources || [])) {
    const u = composite ? doc.origin(i)?.localIdx : i;
    if (u != null) out[i] = u;
  }
  return out;
};

// Per-citation source TEXT: each cited sentence index → the sentence itself, so the UI can show,
// on hover, exactly what the cited span allegedly says. { idx: text }.
export const citeTextsOf = (doc, sources) => {
  const out = {};
  if (!doc) return out;
  const units = doc.units || doc.sentences || [];
  for (const i of (sources || [])) {
    const t = units[i];
    if (t != null) out[i] = String(t).replace(/\s+/g, ' ').trim().slice(0, 280);
  }
  return out;
};
