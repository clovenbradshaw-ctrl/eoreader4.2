// EO: SYN·CON·EVA(Network,Lens → Lens, Composing,Binding,Tracing) — the generative direction
// The generative direction — an EOT program blueprint → working code, gated by the organ.
//
// The reading direction is code → EOT → issues (this holon's other four leaves). This is
// its inverse at the STRUCTURAL grain: a blueprint written in the EOT the whole engine
// speaks (parsed by the SAME ingester, organs/ingest/eot.js) → a real ES module, emitted
// in dependency order and then READ BACK by the organ before anyone runs it. The generator
// literally cannot emit code that breaks the dependency laws without its own reader (the
// fold, issues.js) flagging it — the `!EVA` checkpoint of docs/eo-for-coders.md, run in
// the generative direction. perceive → surf → enact, closed on itself.
//
// THE BOUNDARY, honestly. EOT carries a program's STRUCTURE — which functions and
// constants exist, their signatures, their call graph, the order to emit them, the steps
// a body folds through, what is exported. It does NOT carry the leaf expressions; those
// are the irreducible content a natural-language spec provides (a model's job — LLMs are
// good at exactly this structured translation). So the blueprint's `.expr` / `.body` /
// step exprs are opaque JS the composer places, wires, orders, and validates but does not
// invent. This is the EO-for-coders thesis at code grain: you COMPOSE contracted structure
// in dependency order; you do not fabricate the leaves.
//
// THE BLUEPRINT DIALECT (all canonical EOT — it round-trips through parseEOT):
//
//   add : Function                       # a function entity
//   add.params = "a, b"                  # its signature (a bare param list)
//   add.expr = "a + b"                   # an expression body → `=> (a + b)`
//   !sig add : exported                  # export it
//
//   double : Function
//   double.params = "x"
//   double -> add : calls                # a call edge — add is emitted BEFORE double
//   double.body = "return add(x, x);"    # a statement body → `=> { … }`
//
//   # a function whose body is a DATAFLOW, its statements ordered by `after` edges —
//   # the helix again, at expression grain: each step is a `const`, in dependency order
//   pipeline : Function
//   pipeline.params = "xs"
//   evens : Step
//   evens.expr = "xs.filter(x => x % 2 === 0)"
//   evens -> pipeline : stepOf
//   squares : Step
//   squares.expr = "evens.map(x => x * x)"
//   squares -> pipeline : stepOf
//   squares -> evens : after            # squares' const follows evens'
//   pipeline.returns = "squares"
//
//   # a module-level constant (may CALL a function → it depends on that function's line)
//   answer : Def
//   answer.expr = "double(21)"
//   !sig answer : exported

import { parseEOT } from '../ingest/index.js';
import { tarjanSCC } from './helix.js';
import { readCodebase } from './read.js';
import { scrub } from './facts.js';

// The identifiers a piece of leaf code REFERENCES, read off the scrubbed text (strings
// and comments blanked — the reader's own scrubber, so a name inside a string is never a
// false edge). This is how the composer derives its emit order from the code it places,
// the mirror of how the analyzer derives a call graph from code it reads.
const referencedNames = (text, candidates) => {
  const code = scrub(String(text ?? ''));
  const out = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  for (let m; (m = re.exec(code)); ) {
    if (code[m.index - 1] === '.') continue;                 // a property, not a reference
    if (candidates.has(m[0])) out.add(m[0]);
  }
  return out;
};

// ── the NL → EOT seam ───────────────────────────────────────────────────────────
// The FIRST arrow (natural language → blueprint) is a model's job — structured
// translation, what LLMs are good at. This builds the exact instruction a model/
// backend (model/anthropic.js, webllm, wllama) receives; the caller runs it through
// whatever backend it has and passes the reply to composeAndVerify. Keeping the prompt
// HERE, versioned with the grammar it teaches, is the honest seam: the model fills a
// contracted form, and the deterministic composer + the organ's checkpoint do the rest.
export const BLUEPRINT_GRAMMAR = `You translate a program description into an EOT BLUEPRINT — punctuation
shapes that describe a program's STRUCTURE. Emit ONLY blueprint lines, no prose.

  name : Function            a function
  name.params = "a, b"       its parameters (a bare list, or "" for none)
  name.expr = "a + b"        an expression body  → const name = (a, b) => (a + b)
  name.body = "…statements…" a statement body    → const name = (a, b) => { … }
  !sig name : exported       export it
  name : Def                 a module-level constant
  name.expr = "…"            its value
  step : Step                one statement of a function body (a dataflow)
  step.expr = "…"            its expression   → const step = …;
  step -> fn : stepOf        which function the step belongs to
  fn.returns = "step"        what the function returns

You do NOT order anything and you do NOT wire call edges — the composer infers the
emit order from the code you write. Write correct, minimal JavaScript expressions in
the quoted leaves. One responsibility per function.`;

export const blueprintPrompt = (spec) =>
  `${BLUEPRINT_GRAMMAR}\n\n--- description ---\n${String(spec ?? '').trim()}\n\n--- blueprint ---\n`;

// composeFromModel(spec, generate) — the whole first-arrow wiring: build the prompt,
// hand it to a caller-supplied `generate(prompt) => Promise<string>` (any model backend),
// compose + verify the reply. Returns the verify result plus the raw blueprint the model
// produced, so a rejection is attributable to the model's structure, checked by the organ.
export const composeFromModel = async (spec, generate, opts = {}) => {
  const blueprint = await generate(blueprintPrompt(spec));
  const verified = composeAndVerify(blueprint, opts);
  return Object.freeze({ spec, blueprint, ...verified });
};

// ── read the blueprint off the tuples ─────────────────────────────────────────────
const collect = (blueprintEot) => {
  const { events, diagnostics } = parseEOT(blueprintEot);
  const nodes = new Map();                 // name → { name, type, order, ... }
  const ensure = (name, type = null) => {
    if (!nodes.has(name)) nodes.set(name, {
      name, type, params: null, expr: null, body: null, returns: null,
      exported: false, calls: [], stepOf: null, after: [], seq: nodes.size,
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
      const v = e.operand?.value;
      if (field === 'params') n.params = String(v ?? '');
      else if (field === 'expr') n.expr = String(v ?? '');
      else if (field === 'body') n.body = String(v ?? '');
      else if (field === 'returns') n.returns = String(v ?? '');
    } else if (e.op === 'SIG') {
      if (e.operand?.designation === 'exported') ensure(root).exported = true;
    } else if (e.op === 'CON') {
      const from = ensure(root);
      const to = e.operand?.to;
      const rel = e.operand?.relation;
      if (rel === 'calls') from.calls.push(to);
      else if (rel === 'stepOf') from.stepOf = to;
      else if (rel === 'after') from.after.push(to);
    }
  }
  return { nodes, diagnostics };
};

// the full leaf text of a node — expr + body + its steps' exprs — the surface its
// dependency edges are inferred from.
const leafText = (n, steps) => [
  n.expr, n.body, n.returns,
  ...steps.filter((s) => s.stepOf === n.name).map((s) => s.expr),
].filter(Boolean).join('\n');

// ── the dependency order (the helix, over the blueprint's own edges) ──────────────
// A top-level node depends on every node it references — its explicit `calls` edges AND
// every other declared name its leaf code mentions (inferred). Dependencies emit first
// (a `const` referenced at module scope needs its target already bound). Tarjan groups
// mutual recursion into one component; within a component, blueprint order holds —
// deferral (the reference lives inside a function body) makes intra-component order safe.
const orderTopLevel = (tops, nodesByName, steps) => {
  const names = tops.map((n) => n.name);
  const nameSet = new Set(names);
  const depsOf = (name) => {
    const n = nodesByName.get(name);
    const deps = new Set((n?.calls ?? []).filter((c) => nameSet.has(c)));
    for (const r of referencedNames(leafText(n, steps), nameSet)) if (r !== name) deps.add(r);
    return deps;
  };
  const sccs = tarjanSCC(names, depsOf);
  return sccs.flatMap((comp) => comp.slice().sort((a, b) => nodesByName.get(a).seq - nodesByName.get(b).seq));
};

// steps inside one function body order by their `after` edges AND by which prior step
// each references — so a dataflow blueprint needs no explicit edges at all.
const orderSteps = (steps) => {
  const byName = new Map(steps.map((s) => [s.name, s]));
  const nameSet = new Set(byName.keys());
  const depsOf = (name) => {
    const s = byName.get(name);
    const deps = new Set((s?.after ?? []).filter((a) => nameSet.has(a)));
    for (const r of referencedNames(s?.expr, nameSet)) if (r !== name) deps.add(r);
    return deps;
  };
  const sccs = tarjanSCC([...nameSet], depsOf);
  return sccs.flatMap((comp) => comp.slice().sort((a, b) => byName.get(a).seq - byName.get(b).seq))
    .map((n) => byName.get(n));
};

// ── render one node → source lines ────────────────────────────────────────────────
const renderFunction = (n, steps) => {
  const params = (n.params ?? '').trim();
  const head = `${n.exported ? 'export ' : ''}const ${n.name} = (${params}) =>`;
  const mine = steps.filter((s) => s.stepOf === n.name);
  if (mine.length) {
    const ordered = orderSteps(mine);
    const lines = ordered.map((s) => `  const ${s.name} = ${s.expr};`);
    const ret = n.returns ?? (ordered.length ? ordered[ordered.length - 1].name : 'undefined');
    return `${head} {\n${lines.join('\n')}\n  return ${ret};\n};`;
  }
  if (n.body != null) {
    const body = n.body.trim();
    const indented = body.split('\n').map((l) => (l.trim() ? `  ${l}` : l)).join('\n');
    return `${head} {\n${indented}\n};`;
  }
  return `${head} (${(n.expr ?? 'undefined').trim()});`;    // expression body
};

const renderDef = (n) =>
  `${n.exported ? 'export ' : ''}const ${n.name} = ${(n.expr ?? n.body ?? 'undefined').trim()};`;

// ── the composer ──────────────────────────────────────────────────────────────────
// composeProgram(blueprintEot, opts) → { code, order, nodes, diagnostics }
export const composeProgram = (blueprintEot, opts = {}) => {
  const { nodes, diagnostics } = collect(blueprintEot);
  const all = [...nodes.values()];
  const steps = all.filter((n) => n.type === 'Step');
  const tops = all.filter((n) => n.type !== 'Step');       // Function | Def | untyped
  const order = orderTopLevel(tops, nodes, steps);

  const header = opts.header ?? '// generated by organs/code/compose.js — an EOT blueprint, emitted in dependency order';
  const body = order.map((name) => {
    const n = nodes.get(name);
    return n.type === 'Function' || n.params != null || n.body != null || (n.expr != null && steps.some((s) => s.stepOf === name))
      ? renderFunction(n, steps)
      : renderDef(n);
  });
  const code = [header, '', ...intersperse(body)].join('\n') + '\n';
  return Object.freeze({ code, order, nodes, diagnostics });
};

const intersperse = (blocks) => blocks.flatMap((b, i) => (i ? ['', b] : [b]));

// ── the checkpoint: emit, then READ THE OUTPUT BACK through the organ ─────────────
// composeAndVerify(blueprintEot, opts) → { code, order, findings, ok, blueprintDiagnostics }
// `ok` is true when the generated code carries no error-grade finding — the generator
// gated by its own reader. Nothing is emitted-and-trusted; it is emitted-and-read.
export const composeAndVerify = (blueprintEot, opts = {}) => {
  const { code, order, nodes, diagnostics } = composeProgram(blueprintEot, opts);
  const path = opts.path ?? 'composed.js';
  const read = readCodebase([{ path, text: code }], { doc: false });
  const findings = read.issues;
  const ok = !findings.some((f) => f.severity === 'error');
  return Object.freeze({
    code, order, nodes,
    blueprintDiagnostics: diagnostics,
    findings, ok,
    report: read.report,
  });
};
