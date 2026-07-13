// EO: EVA·DEF(Field → Lens, Binding,Dissecting) — an element on a page → a durable handle to it
// dashboard/select.js — the two DOM operations the no-code picker rests on:
//
//   buildSelector(el)      a clicked element → a CSS selector that will find "the same place"
//                          on the page next time it is pulled — the durable handle the user
//                          never has to write by hand (they click; this reads the address).
//   extractFromDoc(doc, …) a selector + a freshly-pulled document → the raw text at that place,
//                          the value the reading then reads (extract.js).
//   labelFor(el)           a human name for what was clicked (aria-label / a nearby heading /
//                          the element's own short text) — the tile's default title.
//
// buildSelector is written against a SMALL element interface (tagName, id, classList,
// parentElement, and — only for uniqueness — ownerDocument.querySelectorAll), so its path logic
// can be pinned in Node with hand-built fake nodes; the real page work happens in picker.js.

// Classes that describe transient STATE, not identity — a selector built on them breaks the
// moment the page toggles them. Dropped when composing a class segment.
const VOLATILE_CLASS = /^(is-|has-|js-|active|open|hover|hovered|selected|focus|focused|show|shown|hidden|loading|disabled|current)$|(--|__)?(active|open|selected|hover|current)$/i;
// A class that looks machine-generated (CSS-module hashes, atomic builds, digit soup) — unstable
// across deploys, so it is not a good anchor either.
const HASHY_CLASS = /\d{3,}|^[a-z]?[0-9a-f]{5,}$|^css-[0-9a-z]+$|^sc-[0-9a-z]+$/i;

const isElement = (n) => !!n && n.nodeType === 1;

// The stable classes on an element, best first, capped at two — enough to disambiguate without
// welding the selector to a long, brittle class list.
const stableClasses = (el) => {
  let list = [];
  try { list = Array.from(el.classList || []); } catch { list = []; }
  return list
    .filter((c) => c && c.length <= 30 && !VOLATILE_CLASS.test(c) && !HASHY_CLASS.test(c))
    .slice(0, 2);
};

// Is `id` a good anchor — present, not a machine-generated blob, and (when we can check) unique
// on the page? An id like `price-today` roots a selector cleanly; `ember1423` does not.
const goodId = (el) => {
  const id = el && el.id;
  if (!id || typeof id !== 'string' || id.length > 40 || HASHY_CLASS.test(id) || /\s/.test(id)) return false;
  try {
    const doc = el.ownerDocument;
    if (doc && doc.querySelectorAll) return doc.querySelectorAll('#' + cssEscape(id)).length === 1;
  } catch { /* no doc to check against — trust the shape */ }
  return true;
};

// CSS.escape when present (the browser), a conservative escape otherwise (Node tests).
const cssEscape = (s) => {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
};

// The element's index among same-tag siblings (1-based, for :nth-of-type) and whether it is the
// only one — so a lone child needs no positional suffix.
const nthOfType = (el) => {
  const parent = el.parentElement || el.parentNode;
  if (!parent || !parent.children) return { index: 1, alone: true };
  const tag = (el.tagName || '').toUpperCase();
  let index = 0, count = 0;
  for (const sib of parent.children) {
    if ((sib.tagName || '').toUpperCase() !== tag) continue;
    count++;
    if (sib === el) index = count;
  }
  return { index: index || 1, alone: count <= 1 };
};

// One element → its own selector SEGMENT: the tag, its stable classes, and a :nth-of-type suffix
// only when it is not the only same-tag child. `div.price.big`, `span:nth-of-type(2)`, `td`.
const segment = (el) => {
  const tag = (el.tagName || 'div').toLowerCase();
  const classes = stableClasses(el).map((c) => '.' + cssEscape(c)).join('');
  const { index, alone } = nthOfType(el);
  const nth = alone ? '' : `:nth-of-type(${index})`;
  return tag + classes + nth;
};

// buildSelector(el) → a CSS selector that re-finds the clicked element on the next pull. Walk up
// the ancestor chain composing segments, and STOP early at the first ancestor with a good id
// (rooting the path there keeps it short and stable). Caps the depth so a deeply nested node
// yields a bounded, readable selector rather than a full root-to-leaf chain.
export const buildSelector = (el, { maxDepth = 6 } = {}) => {
  if (!isElement(el)) return '';
  if (goodId(el)) return '#' + cssEscape(el.id);        // the element itself is anchored
  const parts = [];
  let cur = el, depth = 0;
  while (isElement(cur) && depth < maxDepth) {
    const tag = (cur.tagName || '').toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    if (goodId(cur)) { parts.unshift('#' + cssEscape(cur.id)); return parts.join(' > '); }
    parts.unshift(segment(cur));
    cur = cur.parentElement || cur.parentNode;
    depth++;
  }
  return parts.join(' > ');
};

// Collapse a pulled string to the reading's raw text: trim, fold runs of whitespace to one space.
const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// extractFromDoc(doc, selector, attr) → { ok, raw, error }. Find the pinned element in a freshly
// pulled document; read `getAttribute(attr)` when an attribute was pinned (a `datetime`, a
// `value`, a meta `content`), otherwise its text. `ok:false` when the element is gone — the honest
// "couldn't read it" a reading records rather than reusing a stale value.
export const extractFromDoc = (doc, selector, attr = '') => {
  if (!doc || !doc.querySelector || !selector) return { ok: false, raw: null, error: 'no selector' };
  let el = null;
  try { el = doc.querySelector(selector); } catch { return { ok: false, raw: null, error: 'bad selector' }; }
  if (!el) return { ok: false, raw: null, error: 'element not found' };
  const raw = attr ? clean(el.getAttribute(attr)) : clean(el.textContent);
  if (attr && !raw) return { ok: false, raw: null, error: `no @${attr}` };
  return { ok: true, raw, error: null };
};

// labelFor(el) → a human name for the clicked element: an explicit aria-label / title, else the
// nearest heading or label above it, else its own short text, else the tag. The picker offers
// this as the tile's default title so the user rarely has to type one.
export const labelFor = (el) => {
  if (!isElement(el)) return '';
  const aria = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '';
  if (aria && aria.trim()) return clean(aria).slice(0, 60);
  // A nearby heading: the element's own text is often the VALUE, so prefer a label beside it.
  const near = nearbyLabel(el);
  if (near) return near.slice(0, 60);
  const own = clean(el.textContent).slice(0, 40);
  return own || (el.tagName || '').toLowerCase();
};

// Look just above/before the element for a short piece of describing text — a preceding heading,
// a `<dt>` for a `<dd>`, a label sibling — the caption a person would read as "what this number is".
const nearbyLabel = (el) => {
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'DD') {
    const dt = el.previousElementSibling;
    if (dt && (dt.tagName || '').toUpperCase() === 'DT') return clean(dt.textContent);
  }
  let prev = el.previousElementSibling;
  let hops = 0;
  while (prev && hops < 3) {
    const t = (prev.tagName || '').toUpperCase();
    if (/^H[1-6]$/.test(t) || t === 'LABEL' || t === 'DT') { const txt = clean(prev.textContent); if (txt) return txt; }
    prev = prev.previousElementSibling; hops++;
  }
  // Climb once: a container's heading often labels a value nested inside it.
  const parent = el.parentElement;
  if (parent) {
    const h = parent.querySelector && parent.querySelector('h1,h2,h3,h4,h5,h6,label,dt,.label,.title');
    if (h && h !== el && !(h.contains && h.contains(el))) { const txt = clean(h.textContent); if (txt) return txt; }
  }
  return '';
};
