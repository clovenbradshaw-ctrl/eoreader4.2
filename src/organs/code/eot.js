// EO: INS·DEF·CON(Field → Entity,Link,Network, Making,Dissecting,Binding) — code facts → EOT surface
// The lowering — code facts → EOT surface, in the organ's CODE DIALECT.
//
// "Converts it to EOT" is this file: every fact becomes one-or-a-few EOT surface lines
// (docs/eot-surface-syntax.md as implemented by organs/ingest/eot.js), so a codebase
// re-parses through the SAME ingester every other reading uses — anchors minted, the
// graph projected, the reading attached. The whole point of lowering to the shared
// medium rather than a bespoke AST: the issue fold (issues.js) reads the parsed TUPLES,
// never this module's internals, so any producer of the dialect (another language's
// extractor, a grammar-tree provider) gets the dependency-order laws for free.
//
// THE SIGN GRAMMAR — identity is structured into the sign, EOT-alphabet-clean:
//   mod:<M>                        a module (M = the path, folded: src-organs-code-facts)
//   ext:<S>                        a module outside the corpus (an external thread)
//   sc:<M>:s<N>:<kind>             a scope (kind: module|fn|block|class|catch)
//   dcl:<M>:L<l>:c<c>:<name>       a binding declaration (its IS-A carries the kind:
//                                  Const|Let|Var|Function|Class|Param|Import)
//   ex:<M>:<name>                  an export
//   mem:<M>:L<l>:c<c>:<name>       a class member (Method|Field) — graph decoration
//   use|asg|upd|tst:<M>:L<l>:c<c>:<name>   a reference site (read | write | read-write |
//                                  typeof-guarded read), one CON line each: `-> sc : within`
// Line and column ride IN the sign, so a reference is ONE line and the fold can compare
// positions without side tables. parseSign() below is the inverse.
//
// PROVENANCE. Source code read from disk is the world — exafference — so the corpus
// doc lowers through the PERCEIVER door (organs/in/code.js set this precedent): every
// structural tuple can witness, carrying its file and line. The organ's JUDGMENTS
// (issues.js) go the other way, through the enactor door — they cite these tuples.

import { eotDoc } from '../ingest/eot.js';
import { valueLiteral } from '../ingest/eot-emit.js';
import { projectGraph } from '../../core/index.js';
import { seg, nameSeg, modSeg, resolveSpec } from './facts.js';

// ── signs ─────────────────────────────────────────────────────────────────────────
export const declSign = (M, d) => `dcl:${M}:L${d.line}:c${d.col}:${nameSeg(d.name)}`;
export const scopeSign = (M, s) => `sc:${M}:s${s.id}:${s.kind}`;
export const useSign = (M, u) => {
  const kind = u.guard ? 'tst' : u.kind === 'asg' ? 'asg' : u.kind === 'upd' ? 'upd' : 'use';
  return `${kind}:${M}:L${u.line}:c${u.col}:${nameSeg(u.name)}`;
};

// parseSign('dcl:m:L3:c9:foo') → { kind, mod, line, col, name } (line/col null when absent)
export const parseSign = (sign) => {
  const parts = String(sign ?? '').split(':');
  const kind = parts[0] ?? '';
  if (kind === 'mod' || kind === 'ext') return { kind, mod: parts.slice(1).join(':'), line: null, col: null, name: null };
  if (kind === 'sc') return { kind, mod: parts[1] ?? null, scopeId: Number((parts[2] ?? 's').slice(1)), scopeKind: parts[3] ?? null, line: null, col: null, name: null };
  if (kind === 'ex') return { kind, mod: parts[1] ?? null, name: parts.slice(2).join(':') || null, line: null, col: null };
  const lm = /^L(\d+)$/.exec(parts[2] ?? '');
  const cm = /^c(\d+)$/.exec(parts[3] ?? '');
  return {
    kind, mod: parts[1] ?? null,
    line: lm ? Number(lm[1]) : null, col: cm ? Number(cm[1]) : null,
    name: parts.slice(4).join(':') || null,
  };
};

const TYPE_OF_DECL = {
  const: 'Const', let: 'Let', var: 'Var',
  function: 'Function', class: 'Class', param: 'Param', import: 'Import',
};

// ── one module → EOT lines ────────────────────────────────────────────────────────
// `resolveEdge(spec)` maps an import specifier to a module sign (corpus member or
// ext:<…>); the corpus lowering injects it, the single-file form defaults to ext.
export const eotOfModule = (facts, { resolveEdge = null } = {}) => {
  const M = facts.module.sign;
  const resolve = resolveEdge ?? ((spec) => `ext:${seg(String(spec).replace(/[@/]/g, '-'))}`);
  const lines = [];
  const push = (l) => lines.push(l);

  push(`# ── module: ${facts.module.path ?? M} ──`);
  push(`mod:${M} : Module`);
  if (facts.module.path) push(`mod:${M}.path = ${valueLiteral(facts.module.path)}`);
  push(`mod:${M}.lang = ${valueLiteral(facts.module.lang)}`);

  // scopes — SEG carves each from its parent (the root is carved from the module)
  for (const s of facts.scopes) {
    if (s.id === 0) { push(`!seg mod:${M} | ${scopeSign(M, s)}`); continue; }
    push(`!seg ${scopeSign(M, facts.scopes[s.parent])} | ${scopeSign(M, s)}`);
  }

  // module-grain edges — the DAG the dependency order reads
  const seenEdge = new Set();
  for (const e of facts.edges) {
    const to = resolve(e.spec);
    const rel = e.kind === 'reexport' ? 'reexports' : 'imports';
    const key = `${to}|${rel}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    push(`mod:${M} -> ${to} : ${rel}`);
  }

  // import bindings — threads held across the membrane
  for (const im of facts.imports) {
    const d = facts.decls.find((x) => x.declKind === 'import' && x.name === im.local && x.line === im.line);
    if (!d) continue;
    const sign = declSign(M, d);
    push(`${sign} : Import`);
    push(`${sign}.name = ${valueLiteral(im.imported)}`);
    push(`${sign}.from = ${valueLiteral(im.spec)}`);
    push(`${sign} -> ${resolve(im.spec)} : from`);
  }

  // declarations — the module's entities, each in its scope
  for (const d of facts.decls) {
    if (d.declKind === 'import') continue;                          // lowered above
    const sign = declSign(M, d);
    push(`${sign} : ${TYPE_OF_DECL[d.declKind] ?? 'Binding'}`);
    if (nameSeg(d.name) !== d.name) push(`${sign}.name = ${valueLiteral(d.name)}`);
    push(`${sign} -> ${scopeSign(M, facts.scopes[d.scopeId])} : in`);
    if (d.exported) push(`!sig ${sign} : exported`);
    if (d.setAside) push(`!sig ${sign} : set-aside`);        // a rest-omission sibling
  }

  // members — Method/Field decoration for the graph
  for (const mem of facts.members) {
    const sign = `mem:${M}:L${mem.line}:c${mem.col}:${nameSeg(mem.name)}`;
    push(`${sign} : ${mem.kind === 'method' ? 'Method' : 'Field'}`);
    const cls = mem.className ? facts.decls.find((x) => x.declKind === 'class' && x.name === mem.className) : null;
    push(`${sign} -> ${cls ? declSign(M, cls) : `mod:${M}`} : ${cls ? 'memberOf' : 'definedIn'}`);
  }

  // exports
  for (const ex of facts.exports) {
    const sign = `ex:${M}:${nameSeg(ex.name)}`;
    push(`${sign} : Export`);
    if (nameSeg(ex.name) !== ex.name) push(`${sign}.name = ${valueLiteral(ex.name)}`);
    if (ex.local) push(`${sign}.local = ${valueLiteral(ex.local)}`);
    if (ex.from) {
      push(`${sign}.from = ${valueLiteral(ex.from)}`);
      if (ex.sourceName) push(`${sign}.source = ${valueLiteral(ex.sourceName)}`);
      push(`${sign} -> ${resolve(ex.from)} : reexportOf`);
    }
  }

  // hazards — WITNESSED behavioral shapes (a bare except at L129 is structure,
  // checkable against the file); the judgment on them is the fold's
  for (const hz of facts.hazards ?? []) {
    const sign = `hz:${M}:L${hz.line}:c${hz.col}:${hz.law}`;
    push(`${sign} : Hazard`);
    push(`${sign}.detail = ${valueLiteral(hz.detail)}`);
  }

  // references — one CON per site; kind and position ride in the sign
  for (const u of facts.uses) {
    push(`${useSign(M, u)} -> ${scopeSign(M, facts.scopes[u.scopeId])} : within`);
  }

  // same-module call edges (decoration)
  const byName = new Map();
  for (const d of facts.decls) if (!byName.has(d.name)) byName.set(d.name, d);
  for (const c of facts.calls) {
    const from = byName.get(c.fromName), to = byName.get(c.toName);
    if (from && to) push(`${declSign(M, from)} -> ${declSign(M, to)} : calls`);
  }

  return lines;
};

// ── the corpus → one EOT document ───────────────────────────────────────────────────
// lowerCorpus(factsList) → { eotText, bySign, resolveEdge } — modules resolve each
// other's relative specifiers by pure path arithmetic; whatever the corpus lacks
// stays an ext:<…> thread (the open world beyond the membrane).
export const lowerCorpus = (factsList) => {
  const byPath = new Map();
  for (const f of factsList) if (f.module.path) byPath.set(f.module.path, f.module.sign);
  const resolveFor = (fromPath) => (spec) => {
    const r = resolveSpec(fromPath, spec);
    if (!r.external && byPath.has(r.path)) return `mod:${byPath.get(r.path)}`;
    return `ext:${seg(String(spec).replace(/[@/]/g, '-'))}`;
  };
  const lines = ['# ═══ the codebase, read out in EOT — organ:code ═══', ''];
  for (const f of factsList) {
    lines.push(...eotOfModule(f, { resolveEdge: resolveFor(f.module.path) }));
    lines.push('');
  }
  return { eotText: lines.join('\n'), byPath };
};

// ── the corpus doc — EOT minted into the engine's own log ───────────────────────────
// codeDoc(factsList, opts) → the eotDoc shape (docId, log, signs, sentences,
// diagnostics, reading()) with the organ's extras: eotText, facts, projectGraph.
// The perceiver door: the reading is ground about the source, not conjecture.
export const codeDoc = (factsList, opts = {}) => {
  const { eotText } = lowerCorpus(factsList);
  const doc = eotDoc(eotText, {
    docId: opts.docId || 'codebase',
    frame: 'code',
    door: 'perceiver',
    agent: opts.agent || 'organ:code',
  });
  const out = { ...doc, code: true, eotText, factsList };
  out.projectGraph = (frame = {}) => projectGraph(doc.log, frame);
  return Object.freeze(out);
};

export { seg, modSeg, resolveSpec };
