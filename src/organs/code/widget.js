// EO: SYN·CON·EVA(Network,Lens → Lens, Composing,Binding,Tracing) — EOT blueprint → a full HTML widget
// The widget target — an EOT blueprint → a complete, self-contained, working HTML widget.
//
// compose.js emits a JS module; this emits a WIDGET: one HTML document with its own
// state, template, styles, and behavior, that opens in a browser and responds to the
// user — no build step, no dependency, no framework. The generative direction (compose.js)
// at UI grain. Same discipline: the behavior (handlers, render, state) is real JS, emitted
// in dependency order and READ BACK by the organ before the widget is trusted — the `!EVA`
// checkpoint. A handler or a template that references a name the state never declares is
// caught by the organ, because the emitted <script> re-reads as a module and the template's
// `{{…}}` interpolations become real references inside the render scope.
//
// THE BOUNDARY is the same as compose.js: EOT carries the STRUCTURE — the state shape, which
// handlers exist and what events fire them, the template's slots, what is styled. The leaf
// expressions (a handler's body, a CSS rule, the HTML between the slots) are the content a
// natural-language spec provides, placed and validated but not invented.
//
// THE WIDGET BLUEPRINT (canonical EOT):
//
//   counter : Widget
//   counter.title = "Counter"
//   counter.state = "count: 0, step: 1"          # the initial state object body
//   counter.style = ".n { font-size: 3rem; } button { font-size: 1.25rem; }"
//   counter.template = "<div class='n'>{{count}}</div>
//                       <button data-on='click:inc'>+{{step}}</button>
//                       <button data-on='click:dec'>-{{step}}</button>"
//   inc : Handler                                 # behavior, over `state`
//   inc.body = "state.count += state.step;"
//   inc -> counter : handlerOf
//   dec : Handler
//   dec.body = "state.count -= state.step;"
//   dec -> counter : handlerOf
//
// {{expr}} in the template is an expression over the state fields (destructured in the
// render scope, so bare field names resolve). data-on="event:handler" binds a DOM event
// to a named handler; the shell re-renders after each. Handlers and helper Functions
// (compose-style) may call each other — they order by reference, the helix again.

import { parseEOT } from '../ingest/eot.js';
import { tarjanSCC } from './helix.js';
import { readCodebase } from './read.js';
import { scrub } from './facts.js';

// ── the tiny reactive shell (inlined — no dependency) ─────────────────────────────
// state → render(state) → innerHTML; every [data-on="ev:name"] binds handlers[name],
// re-rendering after it runs. `refresh` is the redraw handle a handler calls to drive
// animation off a timer (setInterval → mutate state → refresh) — a real app primitive,
// module-scope so a handler body resolves it (deferred; declared here). Deterministic,
// still ~15 lines, the whole runtime.
const SHELL = (mount) => `  const __root = document.getElementById(${JSON.stringify(mount)});
  const refresh = () => {
    __root.innerHTML = render(state);
    for (const el of __root.querySelectorAll('[data-on]')) {
      const [ev, name] = el.getAttribute('data-on').split(':');
      if (handlers[name]) el.addEventListener(ev, (event) => { handlers[name](event); refresh(); });
    }
  };
  refresh();`;

// ── template → a render function body ──────────────────────────────────────────────
// Escape the HTML so it is a safe template literal, then turn `{{expr}}` into `${expr}`.
// The render scope destructures the state keys, so a `{{count}}` reads the field and a
// `{{unknown}}` becomes an unbound reference the organ catches.
const templateToRender = (template, stateKeys) => {
  const escaped = String(template ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => '${' + expr.trim() + '}');
  const destructure = stateKeys.length ? `  const { ${stateKeys.join(', ')} } = s;\n` : '';
  return `const render = (s) => {\n${destructure}  return \`${escaped}\`;\n};`;
};

const stateKeysOf = (stateBody) =>
  [...String(stateBody ?? '').matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);

// ── read the blueprint ──────────────────────────────────────────────────────────────
const collect = (blueprintEot) => {
  const { events, diagnostics } = parseEOT(blueprintEot);
  const nodes = new Map();
  const ensure = (name, type = null) => {
    if (!nodes.has(name)) nodes.set(name, {
      name, type, params: null, body: null, expr: null,
      title: null, state: null, style: null, template: null,
      handlerOf: null, calls: [], seq: nodes.size,
    });
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
      if (field in n) n[field] = v;
      else if (field === 'params') n.params = v;
    } else if (e.op === 'SIG') { /* no exports in a widget */ }
    else if (e.op === 'CON') {
      const n = ensure(root);
      if (e.operand?.relation === 'handlerOf') n.handlerOf = e.operand.to;
      else if (e.operand?.relation === 'calls') n.calls.push(e.operand.to);
    }
  }
  return { nodes, diagnostics };
};

// order callables (handlers + helpers) by reference — a handler that calls a helper
// needs the helper defined first (helpers are consts; handlers are object properties,
// but a helper referenced inside a handler must be emitted above the handlers object).
const referencedNames = (text, candidates) => {
  const code = scrub(String(text ?? ''));
  const out = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  for (let m; (m = re.exec(code)); ) if (code[m.index - 1] !== '.' && candidates.has(m[0])) out.add(m[0]);
  return out;
};

// ── the composer ────────────────────────────────────────────────────────────────────
// composeWidget(blueprintEot, opts) → { html, script, widget, handlers, helpers, state, diagnostics }
export const composeWidget = (blueprintEot, opts = {}) => {
  const { nodes, diagnostics } = collect(blueprintEot);
  const all = [...nodes.values()];
  const widget = all.find((n) => n.type === 'Widget') ?? all.find((n) => n.template != null) ?? {};
  const handlers = all.filter((n) => n.type === 'Handler' || n.handlerOf === widget.name);
  const helpers = all.filter((n) => n.type === 'Function');
  const stateBody = (widget.state ?? '').trim();
  const stateKeys = stateKeysOf(stateBody);
  const mount = opts.mount ?? 'app';

  // helpers first, in dependency order (a helper may call another)
  const helperNames = new Set(helpers.map((h) => h.name));
  const helperDeps = (name) => {
    const h = helpers.find((x) => x.name === name);
    const deps = new Set((h?.calls ?? []).filter((c) => helperNames.has(c)));
    for (const r of referencedNames([h?.expr, h?.body].filter(Boolean).join('\n'), helperNames)) if (r !== name) deps.add(r);
    return deps;
  };
  const helperOrder = tarjanSCC([...helperNames], helperDeps)
    .flatMap((c) => c.slice().sort((a, b) => nodes.get(a).seq - nodes.get(b).seq));
  const helperLines = helperOrder.map((name) => {
    const h = nodes.get(name);
    const params = (h.params ?? '').trim();
    if (h.body != null) return `const ${name} = (${params}) => {\n${indent(h.body.trim(), 2)}\n};`;
    return `const ${name} = (${params}) => (${(h.expr ?? 'undefined').trim()});`;
  });

  // the handlers object — each `name(event) { body }`
  const handlerLines = handlers.map((h) => {
    const body = (h.body ?? (h.expr != null ? `return ${h.expr};` : '')).trim();
    return `    ${h.name}: (event) => {\n${indent(body, 3)}\n    },`;
  });

  const render = templateToRender(widget.template ?? '<div>empty widget</div>', stateKeys);

  const script = [
    '// behavior — read back and gated by organs/code, then run',
    `const state = { ${stateBody} };`,
    ...helperLines,
    render,
    'const handlers = {',
    ...handlerLines,
    '};',
    SHELL(mount),
  ].join('\n');

  const html = wrapHtml({
    title: widget.title ?? widget.name ?? 'widget',
    style: widget.style ?? '',
    mount, script,
  });

  return Object.freeze({ html, script, widget, handlers, helpers, state: stateBody, stateKeys, diagnostics });
};

// ── completeness — the UI-grain laws the reference check alone misses ───────────────
// Binding-validation passes an EMPTY widget trivially (no references → nothing unbound),
// so a weak model's incomplete output slips through as "clean". These laws close that:
// a widget must actually BE one, and every button must be wired to a handler that exists
// (the UI analog of `unbound` — a data-on into the Void).
const completeness = (w) => {
  const out = [];
  const flag = (law, severity, message, name = null) => out.push({ law, severity, message, name, mod: 'widget' });
  if (!w.widget || !w.widget.name) { flag('no-widget', 'error', 'no `X : Widget` in the blueprint — nothing to build'); return out; }
  if (w.widget.template == null) flag('no-template', 'error', `widget '${w.widget.name}' has no .template — it would render empty`);
  if (w.widget.state == null && w.handlers.length === 0) flag('no-behavior', 'error', `widget '${w.widget.name}' has neither .state nor a handler — it is inert`);

  const defined = new Set(w.handlers.map((h) => h.name));
  const wired = new Set();
  // read EVERY data-on, then validate its shape — a malformed binding (a `=` for the
  // `:`, an empty handler) renders a dead button, so it must be caught, not skipped.
  for (const m of String(w.widget.template ?? '').matchAll(/data-on=['"]([^'"]*)['"]/g)) {
    const shape = /^([A-Za-z]+):([A-Za-z_$][\w$]*)$/.exec(m[1]);
    if (!shape) { flag('malformed-binding', 'error', `data-on='${m[1]}' is not in event:handler form (e.g. click:inc) — the button would be dead`, m[1]); continue; }
    wired.add(shape[2]);
    if (!defined.has(shape[2]))
      flag('unbound-handler', 'error', `the template binds data-on '${shape[2]}' but no handler '${shape[2]}' is defined — a button wired into the Void`, shape[2]);
  }
  for (const h of w.handlers)
    if (!wired.has(h.name)) flag('unused-handler', 'note', `handler '${h.name}' is defined but no data-on binds it — a dwelling handler`, h.name);
  return out;
};

// ── the checkpoint — read the emitted behavior back through the organ ───────────────
// composeWidgetAndVerify(blueprintEot, opts) → { html, script, findings, ok, ... }
// Two passes: the reference/dependency laws over the emitted <script> (state declared,
// every template slot and handler reference resolved), AND the completeness laws above.
// A widget is trusted only when BOTH are clean — so a weak model's empty or half-wired
// output is caught, not passed.
export const composeWidgetAndVerify = (blueprintEot, opts = {}) => {
  const w = composeWidget(blueprintEot, opts);
  const asModule = w.script.replace(/document\.getElementById/g, '/* dom */ (() => ({}))');
  const read = readCodebase([{ path: (opts.path ?? 'widget') + '.js', text: asModule }], { doc: false, globals: ['document'] });
  const findings = [...read.issues, ...completeness(w)];
  const ok = !findings.some((f) => f.severity === 'error');
  return Object.freeze({ ...w, findings, ok, report: read.report });
};

// ── HTML scaffold ────────────────────────────────────────────────────────────────────
const BASE_STYLE = `*{box-sizing:border-box} body{margin:0;font:16px/1.5 system-ui,sans-serif;` +
  `display:grid;place-items:center;min-height:100vh;background:#0b0d12;color:#e7ecf3}` +
  `#{{mount}}{padding:2rem;text-align:center}button{cursor:pointer;margin:.25rem;padding:.4rem .8rem;` +
  `border-radius:.5rem;border:1px solid #33405a;background:#1a2233;color:inherit}button:hover{background:#243149}`;

const wrapHtml = ({ title, style, mount, script }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${BASE_STYLE.replace(/\{\{mount\}\}/g, mount)}
${style}
</style>
</head>
<body>
<div id="${mount}"></div>
<script type="module">
${script}
</script>
</body>
</html>
`;

// ── the syntax-owning layer: a structured spec → a valid blueprint ─────────────────
// A small model is good at answering narrow natural-language questions and bad at
// emitting structured syntax (prefixes, colons, arrows). So the model never writes EOT:
// it DESCRIBES — over as many prompts as it takes — into a plain spec, and THIS builds
// the blueprint deterministically, owning every piece of punctuation the model fumbles.
//
//   spec = {
//     name, title?,
//     state:   [{ field, value }],           // "count", "0"
//     show?:   "count" | "{{count}} of {{n}}" // the display (a field, or a template frag)
//     buttons: [{ label, handler?, body }],   // handler defaults to a slug of the label
//     style?,
//   }
const slug = (s) => String(s ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1') || 'h';
const q = (s) => String(s ?? '').replace(/"/g, '');            // values are quoted; strip stray quotes
export const specToWidgetBlueprint = (spec = {}) => {
  const name = slug(spec.name || 'app');
  const lines = [`${name} : Widget`];
  if (spec.title) lines.push(`${name}.title = "${q(spec.title)}"`);
  const state = (spec.state ?? []).filter((s) => s && s.field);
  if (state.length) lines.push(`${name}.state = "${state.map((s) => `${slug(s.field)}: ${q(s.value ?? 0)}`).join(', ')}"`);

  const buttons = (spec.buttons ?? []).map((b) => ({ ...b, handler: slug(b.handler || b.label) }));
  // reconcile the display field to a REAL state field, case-insensitively — a small model
  // answers "Fahrenheit" when the field is "fahrenheit"; owning the glue here spares the
  // organ a spurious unbound and the model a repair round.
  const fieldOf = (nm) => state.find((s) => slug(s.field).toLowerCase() === slug(nm).toLowerCase())?.field;
  const show = spec.show
    ? (/\{\{/.test(spec.show) ? spec.show : `{{${slug(fieldOf(spec.show) || spec.show)}}}`)
    : (state[0] ? `{{${slug(state[0].field)}}}` : '');
  const cells = [show ? `<div class='display'>${show}</div>` : '']
    .concat(buttons.map((b) => `<button data-on='click:${b.handler}'>${q(b.label ?? b.handler)}</button>`))
    .filter(Boolean).join('');
  lines.push(`${name}.template = "${cells}"`);
  if (spec.style) lines.push(`${name}.style = "${q(spec.style)}"`);

  for (const b of buttons) {
    lines.push(`${b.handler} : Handler`);
    lines.push(`${b.handler}.body = "${q(b.body ?? '').trim()}"`);
    lines.push(`${b.handler} -> ${name} : handlerOf`);
  }
  return lines.join('\n');
};

// ── the local-model seam ──────────────────────────────────────────────────────────────
// composeWidgetFromModel(spec, model, opts) — the whole loop with a LOCAL backend
// (model/webllm.js, model/wllama.js — the engine's own in-browser models; model.phrase
// is their generate). Build the widget-grammar prompt, ask the local model for a
// blueprint, compose + verify. The model authors STRUCTURE; the organ gates it; the
// browser runs it — all on the user's machine, no network.
export const WIDGET_GRAMMAR = `You translate a UI description into an EOT WIDGET BLUEPRINT — punctuation
shapes that describe a self-contained HTML widget's STRUCTURE. Emit ONLY blueprint lines, no prose.

  app : Widget
  app.title = "…"                      the browser title / heading
  app.state = "count: 0, name: ''"     the initial state object fields
  app.style = "css rules"              scoped-enough CSS (optional)
  app.template = "<html with {{field}} slots and data-on='click:handlerName' buttons>"
  handlerName : Handler                one piece of behavior, mutating \`state\`
  handlerName.body = "state.count += 1;"
  handlerName -> app : handlerOf       which widget it belongs to

{{expr}} interpolates an expression over the state fields. data-on="event:handler" binds a DOM
event to a handler; the widget re-renders after each. Write correct, minimal JavaScript and HTML
in the quoted leaves. Keep it to one widget.`;

export const widgetPrompt = (spec) =>
  `${WIDGET_GRAMMAR}\n\n--- description ---\n${String(spec ?? '').trim()}\n\n--- blueprint ---\n`;

export const composeWidgetFromModel = async (spec, model, opts = {}) => {
  const prompt = widgetPrompt(spec);
  const reply = await model.phrase([{ role: 'user', content: prompt }], opts.modelOpts ?? {});
  const blueprint = stripFence(reply);
  const verified = composeWidgetAndVerify(blueprint, opts);
  return Object.freeze({ spec, blueprint, ...verified });
};

// ── small helpers ─────────────────────────────────────────────────────────────────────
const indent = (text, n) => String(text).split('\n').map((l) => (l.trim() ? '  '.repeat(n) + l : l)).join('\n');
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a model may wrap the blueprint in a ``` fence — take the fenced body if present.
const stripFence = (s) => {
  const m = /```(?:eot|text)?\s*\n([\s\S]*?)```/.exec(String(s ?? ''));
  return (m ? m[1] : String(s ?? '')).trim();
};
