// EO: SEG·SYN·INS(Field → Network,Entity, Dissecting,Composing,Making) — the facing renderer's fold
// facing.js — the pure engine under the facing-page WYSIWYG renderer. What you write on the left
// (HTML · CSS · JS) is assembled into ONE runnable document; the right pane renders it live. The
// same facing-page discipline as replay.js — the SOURCE on one side, WHAT IT BECOMES on the other —
// applied to code: edit a tag, watch the page change; edit a function, watch its output change.
//
// Everything here is pure and framework-free: splitSource carves a pasted file into panes,
// assembleDocument welds the panes (plus a console-capture shim) into an iframe-ready srcdoc, and
// the diagnostics parser reads the shim's postMessages back. The surface (surface.js) holds the
// state and the iframe; this module decides, so the decision is testable without a DOM.

// A source is a FULL DOCUMENT when it declares itself one — a doctype, an <html>, or the
// <head>+<body> pair. Such a doc carries its own inline <style>/<script>, so we render it whole
// (only injecting the console shim); we do NOT wrap it again.
export const isFullDocument = (text) => {
  const s = String(text || '');
  return /<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s) || (/<head[\s>]/i.test(s) && /<body[\s>]/i.test(s));
};

// looksLikeCss(s) — a bare stylesheet with no extension to go on: a selector-shaped start, a
// `{ prop: value }` rule, no angle brackets, and none of the JS tokens that would mark it as code
// (so `const x = { a: 1 }` is NOT mistaken for CSS). Deliberately conservative: on any doubt the
// caller falls through to HTML, a safe visible default.
const looksLikeCss = (s) =>
  !/[<]/.test(s) &&
  /^\s*[.#@*a-z][^{<]*\{[^}]*:[^}]*\}/i.test(s) &&
  !/\b(function|const|let|var|return|import|export|class|new)\b|=>/.test(s);

// splitSource(text, filename?) → { html, css, js, mode }. A whole HTML document lands in `html`
// (mode 'document'); a .css/.js file lands in its own pane (with a minimal host on the other);
// a bare fragment is treated as HTML. The filename is a hint — the content decides when they
// disagree (a .txt holding a full doc still renders).
export const splitSource = (text, filename = '') => {
  const s = String(text || '');
  const ext = (/\.([a-z0-9]+)$/i.exec(String(filename || '')) || [])[1]?.toLowerCase() || '';
  if (isFullDocument(s)) return { html: s, css: '', js: '', mode: 'document' };
  if (ext === 'css' || (!ext && looksLikeCss(s))) return { html: '', css: s, js: '', mode: 'css' };
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return { html: '', css: '', js: s, mode: 'js' };
  return { html: s, css: '', js: '', mode: 'html' };
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The console-capture shim — injected FIRST so it catches the earliest error. It mirrors
// console.log/info/warn/error and window.onerror / unhandledrejection to the parent via
// postMessage, tagged `eo-render-console`, so the facing surface can show what the code DID
// (and where it broke) beside what it says. Uses `structuredClone`-safe stringification so a
// circular or DOM argument never throws inside the shim itself.
export const CONSOLE_SHIM = `<script>(function(){
  var send=function(level,args){try{window.parent.postMessage({source:'eo-render-console',level:level,
    text:Array.prototype.map.call(args,function(a){try{return typeof a==='string'?a:JSON.stringify(a);}catch(e){return String(a);}}).join(' ')},'*');}catch(e){}};
  ['log','info','warn','error','debug'].forEach(function(m){var o=console[m]?console[m].bind(console):function(){};
    console[m]=function(){send(m==='debug'?'log':m,arguments);o.apply(console,arguments);};});
  window.addEventListener('error',function(e){send('error',[(e&&e.message)||'Error',(e&&e.filename?('('+e.filename+':'+e.lineno+')'):'')]);});
  window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection:',(e&&e.reason&&e.reason.message)||String(e&&e.reason)]);});
  try{window.parent.postMessage({source:'eo-render-console',level:'ready',text:''},'*');}catch(e){}
})();<\/script>`;

// assembleDocument({ html, css, js }, opts) → a COMPLETE, runnable HTML string for an iframe
// `srcdoc`. A full document is passed through with the shim injected into its <head> (and any
// extra css/js the panes hold appended); a fragment is wrapped in a minimal page. `withConsole`
// (default true) injects the diagnostics shim; turn it off for a clean export.
export const assembleDocument = ({ html = '', css = '', js = '' } = {}, { title = 'Render', withConsole = true, background = null } = {}) => {
  const shim = withConsole ? CONSOLE_SHIM : '';
  const extraStyle = css.trim() ? `<style>${css}</style>` : '';
  const extraScript = js.trim() ? `<script>\n${js}\n<\/script>` : '';

  if (isFullDocument(html)) {
    let doc = html;
    // Inject the shim + any pane-authored css/js at the right seams of the existing document.
    const headInject = shim + extraStyle;
    if (/<head[\s>]/i.test(doc)) doc = doc.replace(/(<head[^>]*>)/i, `$1${headInject}`);
    else if (/<html[\s>]/i.test(doc)) doc = doc.replace(/(<html[^>]*>)/i, `$1<head>${headInject}</head>`);
    else doc = headInject + doc;
    if (extraScript) {
      if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, `${extraScript}</body>`);
      else doc += extraScript;
    }
    return doc;
  }

  // A fragment (or css-only / js-only) → a minimal, well-formed page.
  const bodyBg = background ? `body{background:${background}}` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${shim}
<style>${bodyBg}</style>
${extraStyle}
</head>
<body>
${html}
${extraScript}
</body>
</html>`;
};

// runnableSrcdoc(source, opts) → the srcdoc string for any accepted source shape: a `{ html, css,
// js }` triple, or a raw string (auto-split first). The one call the surface makes to turn its
// editor state into the iframe's document.
export const runnableSrcdoc = (source, opts = {}) => {
  if (typeof source === 'string') return assembleDocument(splitSource(source, opts.filename), opts);
  return assembleDocument(source || {}, opts);
};

// A diagnostics line off the shim's postMessage payload, normalized for the console strip. Returns
// null for a non-shim message so the surface's listener can ignore foreign posts.
export const consoleLineOf = (data) => {
  if (!data || data.source !== 'eo-render-console') return null;
  const level = ['log', 'info', 'warn', 'error', 'ready'].includes(data.level) ? data.level : 'log';
  return { level, text: String(data.text ?? '') };
};
