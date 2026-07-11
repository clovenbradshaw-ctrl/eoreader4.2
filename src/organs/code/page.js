// EO: SYN·CON·EVA(Network,Lens → Lens, Composing,Binding,Tracing) — EOT element tree → a whole page
// The page target — a GENERIC element tree → a complete, self-contained web page.
//
// The mistake this file corrects: a page composer must NOT hardcode section templates
// (a `Hero` renderer, a `Features` renderer) or a stylesheet — that just moves the
// template library into the organ. Instead:
//
//   · STRUCTURE is a generic EOT ELEMENT TREE. One recursive renderer walks any tree of
//     `El { tag, text|html, class, id, attr.* , children }` → HTML. There is no per-kind
//     branch: a hero is `<header>` with an `<h1>` child, a footer is `<footer>` — the
//     TREE says so, the renderer doesn't. The tree is authored by the model (describing
//     the page) or foraged from the web (real components), never baked in here.
//
//   · STYLING is INJECTED — `composePage(bp, { css })` — and foraged from the web:
//     `foragePageCss(fetchText, 'pico'|'water'|'mvp')` fetches a real classless CSS
//     framework that styles the semantic tags the tree emits. The organ ships NO look;
//     the page's appearance is a real, fetched design system, chosen not hardcoded.
//
//   · INTERACTIVITY: an `El` of type `Widget` embeds widget.js's reactive shell, scoped
//     to its own mount, and its behavior is READ BACK through the organ like any widget.
//
// So the model describes a tree in plain terms, code owns the tag/attr syntax, the web
// owns the styling, and the organ owns validation — the same division of labor, one
// level up from a single widget.

import { parseEOT } from '../ingest/eot.js';
import { readCodebase } from './read.js';
import { composeWidget, widgetCompleteness } from './widget.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const list = (s) => String(s ?? '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// ── read the element tree ──────────────────────────────────────────────────────────
const collect = (blueprintEot) => {
  const { events, diagnostics } = parseEOT(blueprintEot);
  const nodes = new Map();
  const ensure = (name, type = null) => {
    if (!nodes.has(name)) nodes.set(name, { name, type, tag: null, text: null, html: null, cls: null, id: null, attrs: {}, children: [], seq: nodes.size });
    const n = nodes.get(name);
    if (type && !n.type) n.type = type;
    return n;
  };
  for (const e of events) {
    const t = String(e.target ?? '');
    const root = t.split('.', 1)[0];
    const field = t.slice(root.length + 1);
    if (e.op === 'INS') ensure(root, e.operand?.type ?? null);
    else if (e.op === 'DEF') {
      const n = ensure(root);
      const v = String(e.operand?.value ?? '');
      if (field === 'tag') n.tag = v;
      else if (field === 'text') n.text = v;
      else if (field === 'html') n.html = v;
      else if (field === 'class') n.cls = v;
      else if (field === 'id') n.id = v;
      else if (field === 'children') n.children = list(v);
      else if (field.startsWith('attr.')) n.attrs[field.slice(5)] = v;
      // page-level fields (title/root/css) live on the Page node's attrs bucket
      else n.attrs[field] = v;
    } else if (e.op === 'CON' && e.operand?.relation === 'childOf') {
      ensure(e.operand.to).children.push(root);   // childOf: append to the parent's list
    }
  }
  return { nodes, diagnostics };
};

// ── the generic renderer (no per-kind templates) ────────────────────────────────────
export const composePage = (blueprintEot, opts = {}) => {
  const { nodes, diagnostics } = collect(blueprintEot);
  const all = [...nodes.values()];
  const page = all.find((n) => n.type === 'Page') ?? { attrs: {} };
  const rootName = page.attrs.root || all.find((n) => n.type === 'El')?.name;

  const scripts = [];
  const widgets = [];
  const islandFindings = [];        // completeness of each embedded widget (dead buttons etc.)
  const seen = new Set();

  const attrStr = (n) => {
    const a = [];
    if (n.id) a.push(`id="${escAttr(n.id)}"`);
    if (n.cls) a.push(`class="${escAttr(n.cls)}"`);
    for (const [k, v] of Object.entries(n.attrs)) if (!['root', 'title', 'css', 'accent', 'children'].includes(k)) a.push(`${escAttr(k)}="${escAttr(v)}"`);
    return a.length ? ' ' + a.join(' ') : '';
  };

  const render = (name, depth = 0) => {
    const n = nodes.get(name);
    if (!n || seen.has(name) || depth > 64) return '';
    seen.add(name);
    if (n.type === 'Widget') {                       // an interactive island — the widget shell, scoped
      const mount = `w_${n.name}`;
      const w = composeWidget(blueprintEot, { mount, widgetName: n.name });
      widgets.push(n.name);
      islandFindings.push(...widgetCompleteness(w));
      scripts.push(`(() => {\n${w.script}\n})();`);
      return `<div id="${mount}"></div>`;
    }
    const tag = (n.tag || 'div').replace(/[^A-Za-z0-9-]/g, '') || 'div';
    if (VOID_TAGS.has(tag)) return `<${tag}${attrStr(n)}>`;
    const inner = n.html != null ? n.html
      : n.children.length ? n.children.map((c) => render(c, depth + 1)).join('')
      : esc(n.text ?? '');
    return `<${tag}${attrStr(n)}>${inner}</${tag}>`;
  };

  const bodyInner = rootName ? render(rootName) : '';
  const html = pageHtml({
    title: page.attrs.title ?? 'Page',
    css: opts.css ?? '',
    accent: page.attrs.accent ?? null,
    bodyInner,
    script: scripts.join('\n\n'),
  });
  return Object.freeze({ html, script: scripts.join('\n\n'), widgets, islandFindings, nodes, diagnostics });
};

// ── the checkpoint — the page's interactive behavior, read back through the organ ────
export const composePageAndVerify = (blueprintEot, opts = {}) => {
  const p = composePage(blueprintEot, opts);
  let findings = [...p.islandFindings];      // each island's completeness (dead buttons, no template)
  if (p.script.trim()) {
    const asModule = p.script.replace(/document\.getElementById/g, '/* dom */ (() => ({}))');
    findings.push(...readCodebase([{ path: (opts.path ?? 'page') + '.js', text: asModule }], { doc: false, globals: ['document'] }).issues);
  }
  const ok = !findings.some((f) => f.severity === 'error');
  return Object.freeze({ ...p, findings, ok });
};

// ── foraged styling — a real classless framework, fetched, not hardcoded ────────────
// foragePageCss(fetchText, which?) → the CSS text of a real classless framework that
// styles the semantic tags the tree emits. Injected as opts.css. `fetchText` is the
// caller's fetcher (pure organ, injected world), so this never touches the network
// itself and the tests stay offline.
export const PAGE_CSS_SOURCES = Object.freeze({
  pico:  'https://unpkg.com/@picocss/pico@2/css/pico.classless.min.css',
  water: 'https://cdn.jsdelivr.net/npm/water.css@2/out/water.min.css',
  mvp:   'https://unpkg.com/mvp.css@1.15.0/mvp.css',
});
export const foragePageCss = async (fetchText, which = 'pico') => {
  const url = PAGE_CSS_SOURCES[which] ?? which;   // a key, or a raw URL
  const css = await fetchText(url);
  return { css, source: url };
};

// ── the scaffold — only a neutral reset; the LOOK is the injected/foraged sheet ─────
const pageHtml = ({ title, css, accent, bodyInner, script }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>*{box-sizing:border-box}</style>
${css ? `<style>\n${css}\n</style>` : ''}
${accent ? `<style>:root{--pico-primary:${accent};--links:${accent};accent-color:${accent}}</style>` : ''}
</head>
<body>
${bodyInner}
${script ? `<script type="module">\n${script}\n</script>` : ''}
</body>
</html>
`;
