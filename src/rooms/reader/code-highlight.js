// EO: NUL(Field -> Void, Tending) — code -> line-numbered, syntax-lit HTML
// "Code renders as code" means two things a prose reflow can't give it: every space of
// indentation preserved exactly (the reflow that helps a novel wrap hurts a Python block),
// and comments/strings/keywords picked out the way an editor does. This is deliberately a
// TOKEN-CLASS highlighter, not a parser — comments, string/template literals, numbers, and a
// per-language keyword list, recovered by one ordered regex per language (the same
// "leftmost match wins" scan a regex engine already does, so a `//` typed INSIDE a string
// is never mistaken for a comment: the string's own opening quote sits at an earlier index,
// so it claims the match first). An unrecognised language still gets numbers/strings/the two
// common comment styles — dimmer, but never unstyled.
//
// Pure: highlightCode(text, lang) -> { html, lines, truncated }, no DOM, no network.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// keywords kept short on purpose — enough for a token to read as "language", not a full
// grammar. `strings` are the quote characters that open/close a literal (backslash-escape
// aware); `triple` are Python-style triple-quoted literals, checked before the single ones
// so a `"""doc"""` never reads as an empty string followed by stray quotes.
const LANGS = {
  javascript: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'", '`'],
    keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'new', 'this', 'super', 'import', 'export', 'from', 'default', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'async', 'await', 'yield', 'static', 'get', 'set', 'true', 'false', 'null', 'undefined', 'void', 'delete'],
  },
  python: {
    line: '#', triple: ['"""', "'''"], strings: ['"', "'"],
    keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'global', 'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'async', 'await', 'self'],
  },
  rust: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'for', 'while', 'loop', 'if', 'else', 'match', 'return', 'break', 'continue', 'use', 'mod', 'pub', 'self', 'Self', 'super', 'crate', 'as', 'ref', 'move', 'dyn', 'where', 'unsafe', 'async', 'await', 'true', 'false'],
  },
  go: {
    line: '//', block: ['/*', '*/'], strings: ['"', '`'],
    keywords: ['func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'switch', 'case', 'break', 'continue', 'for', 'range', 'if', 'else', 'return', 'nil', 'true', 'false', 'make', 'new'],
  },
  java: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['class', 'interface', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'final', 'void', 'new', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'this', 'super', 'true', 'false', 'null', 'enum', 'abstract'],
  },
  csharp: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['class', 'interface', 'namespace', 'using', 'public', 'private', 'protected', 'static', 'readonly', 'void', 'new', 'return', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'this', 'base', 'true', 'false', 'null', 'enum', 'var', 'async', 'await'],
  },
  c: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['int', 'char', 'float', 'double', 'void', 'struct', 'typedef', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'static', 'const', 'sizeof', 'NULL', 'union', 'enum', 'extern'],
  },
  cpp: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['int', 'char', 'float', 'double', 'void', 'struct', 'typedef', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'class', 'public', 'private', 'protected', 'namespace', 'template', 'new', 'delete', 'const', 'static', 'sizeof', 'true', 'false', 'nullptr', 'virtual', 'using'],
  },
  ruby: {
    line: '#', strings: ['"', "'"],
    keywords: ['def', 'end', 'class', 'module', 'return', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'in', 'do', 'break', 'next', 'require', 'require_relative', 'attr_accessor', 'self', 'nil', 'true', 'false', 'yield', 'begin', 'rescue', 'ensure', 'raise'],
  },
  php: {
    line: '//', block: ['/*', '*/'], strings: ['"', "'"],
    keywords: ['function', 'class', 'public', 'private', 'protected', 'static', 'return', 'if', 'elseif', 'else', 'foreach', 'while', 'for', 'switch', 'case', 'break', 'continue', 'require', 'require_once', 'include', 'namespace', 'use', 'new', 'echo', 'true', 'false', 'null'],
  },
  shell: {
    line: '#', strings: ['"', "'"],
    keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'echo', 'exit', 'export', 'local', 'in'],
  },
  sql: {
    line: '--', block: ['/*', '*/'], strings: ["'"],
    keywords: ['select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'alter', 'drop', 'and', 'or', 'not', 'null', 'as', 'union', 'limit'],
  },
  css: { block: ['/*', '*/'], strings: ['"', "'"], keywords: [] },
  yaml: { line: '#', strings: ['"', "'"], keywords: ['true', 'false', 'null', 'yes', 'no'] },
};
LANGS.typescript = { ...LANGS.javascript, keywords: [...LANGS.javascript.keywords, 'interface', 'type', 'enum', 'implements', 'namespace', 'declare', 'readonly', 'public', 'private', 'protected', 'as', 'is', 'keyof', 'infer'] };
LANGS.jsx = LANGS.javascript; LANGS.tsx = LANGS.typescript; LANGS.mjs = LANGS.javascript; LANGS.cjs = LANGS.javascript;
LANGS.h = LANGS.c; LANGS.hpp = LANGS.cpp; LANGS.cc = LANGS.cpp;
LANGS.bash = LANGS.shell; LANGS.sh = LANGS.shell;

// An unrecognised extension: both common line-comment styles (one language's comment is
// another's operator, but trying both costs nothing and helps more often than it misleads),
// the usual quote characters, and a small set of keywords common across C-like/scripting
// languages — dimmer than a named profile, never unstyled.
const GENERIC = {
  line: null, block: ['/*', '*/'], strings: ['"', "'", '`'],
  keywords: ['if', 'else', 'for', 'while', 'return', 'function', 'class', 'const', 'let', 'var', 'import', 'export', 'true', 'false', 'null'],
  genericLine: /\/\/.*|#.*/,
};

const buildRegex = (lang) => {
  const never = '(?!)';
  const block = lang.block ? escRe(lang.block[0]) + '[\\s\\S]*?(?:' + escRe(lang.block[1]) + '|$)' : never;
  const line = lang.genericLine ? lang.genericLine.source : (lang.line ? escRe(lang.line) + '.*' : never);
  const triple = lang.triple && lang.triple.length
    ? lang.triple.map((q) => escRe(q) + '[\\s\\S]*?(?:' + escRe(q) + '|$)').join('|') : never;
  const str = lang.strings && lang.strings.length
    ? lang.strings.map((q) => escRe(q) + '(?:\\\\.|[^' + escRe(q) + '\\\\\\n])*(?:' + escRe(q) + ')?').join('|') : never;
  const num = '\\b\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?\\b';
  const kw = lang.keywords && lang.keywords.length ? '\\b(?:' + lang.keywords.map(escRe).join('|') + ')\\b' : never;
  return new RegExp('(' + block + ')|(' + line + ')|(' + triple + ')|(' + str + ')|(' + num + ')|(' + kw + ')', 'g');
};

const regexCache = new Map();
const regexFor = (langKey, lang) => {
  if (!regexCache.has(langKey)) regexCache.set(langKey, buildRegex(lang));
  const re = regexCache.get(langKey); re.lastIndex = 0; return re;
};

// tokenize(text, lang) → [{ text, cls|null }], cls one of comment|string|number|keyword.
export const tokenize = (text, langKey = '') => {
  const key = String(langKey || '').toLowerCase();
  const lang = LANGS[key] || GENERIC;
  const re = regexFor(key || '__generic__', lang);
  const tokens = [];
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index), cls: null });
    const cls = m[1] != null ? 'comment' : m[2] != null ? 'comment'
      : m[3] != null ? 'string' : m[4] != null ? 'string'
        : m[5] != null ? 'number' : 'keyword';
    tokens.push({ text: m[0], cls });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;   // never spin on a zero-length match
  }
  if (last < text.length) tokens.push({ text: text.slice(last), cls: null });
  return tokens;
};

// Split the token stream at every newline so a multi-line comment/string re-opens its own
// <span> on each rendered line — each line is a separate DOM row, so an unclosed tag from
// one row can never bleed its colour into the next.
const tokensToLines = (tokens) => {
  const lines = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, cls: t.cls });
    });
  }
  return lines;
};

const MAX_LINES = 20000;

// highlightCode(text, lang, opts) → { html, lines, truncated }. `html` is a self-contained
// line-numbered block (a gutter + a source column per row) — the caller wraps it in whatever
// page shell it likes; this owns no page-level layout.
export const highlightCode = (text, lang, { maxLines = MAX_LINES } = {}) => {
  const full = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  const tokens = tokenize(full, lang);
  let lines = tokensToLines(tokens);
  const truncated = lines.length > maxLines;
  if (truncated) lines = lines.slice(0, maxLines);
  const rows = lines.map((parts, i) => {
    const src = parts.map((p) => p.cls ? '<span class="tok-' + p.cls + '">' + esc(p.text) + '</span>' : esc(p.text)).join('');
    return '<div class="eo-code-row"><span class="eo-code-no">' + (i + 1) + '</span><span class="eo-code-src">' + src + '</span></div>';
  });
  return { html: '<div class="eo-code">' + rows.join('') + '</div>', lines: lines.length, truncated };
};

export const CODE_CSS = `
.eo-code{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#15151a;color:#dce4f0;border-radius:0;overflow-x:auto;white-space:pre}
.eo-code-row{display:flex}
.eo-code-row:hover{background:rgba(255,255,255,.04)}
.eo-code-no{flex:none;width:44px;padding:0 12px 0 0;text-align:right;color:#585f70;user-select:none}
.eo-code-src{flex:1;padding-right:24px}
.tok-comment{color:#7a8394;font-style:italic}
.tok-string{color:#9ecb8c}
.tok-number{color:#e8b989}
.tok-keyword{color:#c996e0;font-weight:600}
`;
