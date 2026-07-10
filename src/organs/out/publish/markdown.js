// EO: SYN·SEG(Field → Network, Composing,Dissecting) — Markdown mdast + EVA node patch
// Publish → Markdown, as an AST (mdast), not a string.
//
// The GitHub publishing pipeline emits Markdown, but string templating is the wrong
// substrate for it: a reader's EVA edit is a span-level change ("this clause is
// wrong, here is the correction"), and against a flat string that is a fragile text
// diff that breaks the moment anything above it reflows. Against an mdast tree it is
// a NODE-LEVEL patch — the edit names the node its span maps to and replaces it, and
// everything else is byte-stable. unified/remark round-trips this tree to Markdown;
// we build the tree and keep each node's EVA anchor, and let the caller stringify.
//
// Pure: this produces the tree and applies patches to it. `unified().use(remarkStringify)`
// is the caller's (nothing bundled — the output membrane never imports the renderer).

const textNode = (value) => ({ type: 'text', value: String(value ?? '') });

// A doc's span (organs/in/document.js) → an mdast block node, carrying its EVA anchor
// in `data` so a later patch can find it by ref.
const nodeOf = (span) => {
  const anchor = { ref: span.id, charStart: span.charStart, charEnd: span.charEnd, page: span.page ?? null, bbox: span.bbox ?? null };
  const wrap = (node) => ({ ...node, data: { eva: anchor } });
  switch (span.kind) {
    case 'title':
    case 'heading':  return wrap({ type: 'heading', depth: Math.min(6, span.level || 1), children: [textNode(span.text)] });
    case 'list-item':return wrap({ type: 'listItem', spread: false, children: [{ type: 'paragraph', children: [textNode(span.text)] }] });
    case 'quote':    return wrap({ type: 'blockquote', children: [{ type: 'paragraph', children: [textNode(span.text)] }] });
    case 'code':     return wrap({ type: 'code', value: span.text });
    default:         return wrap({ type: 'paragraph', children: [textNode(span.text)] });
  }
};

// toMdast(doc) → a `root` node. Consecutive list-items are folded into one list, the
// way remark-parse would have produced them, so the round-trip is idempotent.
export const toMdast = (doc = {}) => {
  const spans = doc.spans || [];
  const children = [];
  let list = null;
  for (const s of spans) {
    const n = nodeOf(s);
    if (n.type === 'listItem') {
      if (!list) { list = { type: 'list', ordered: false, spread: false, children: [] }; children.push(list); }
      list.children.push(n);
    } else {
      list = null;
      children.push(n);
    }
  }
  return { type: 'root', children, data: { eva: { docId: doc.docId, modality: doc.modality } } };
};

// applyEvaPatch(tree, { ref, markdown?|text?, remove? }) → a NEW tree with the node
// whose EVA ref matches replaced (or removed). Span-level reader contribution as a
// node swap, never a text diff. Returns { tree, applied } so the caller can tell a
// stale ref (applied === false) from a real edit.
export const applyEvaPatch = (tree, patch = {}) => {
  let applied = false;
  const anchorOf = (n) => n && n.data && n.data.eva;
  const walk = (node) => {
    if (!node || !Array.isArray(node.children)) return node;
    const children = [];
    for (const child of node.children) {
      const a = anchorOf(child);
      if (a && a.ref === patch.ref) {
        applied = true;
        if (patch.remove) continue;
        const value = patch.text ?? patch.markdown ?? '';
        // Swap the node's content in place, keeping its type and EVA anchor. A code
        // node holds its text in `value`; every other block holds it in a text child.
        const replaced = child.type === 'code'
          ? { ...child, value }
          : { ...child, children: [textNode(value)] };
        children.push(replaced);
        continue;
      }
      children.push(walk(child));
    }
    return { ...node, children };
  };
  const out = walk(tree);
  return { tree: out, applied };
};
