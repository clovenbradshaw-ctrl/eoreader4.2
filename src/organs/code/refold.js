// EO: SEG(Network, Unraveling) — the cycle re-cut at finer grain
// A module-grain cycle (helix.js `dependencyOrder` cycles) can be a real justification
// loop, or it can be a FILE-BOUNDARY artifact: a.js imports b.js only to call f, b.js
// imports a.js only to call g, and f never calls g (nor anything that eventually calls
// g) — the two files' EXPORT SURFACES happen to cross, but no single declaration
// depends on itself through the pair. Module grain cannot see this; it only sees "a.js
// imports b.js AND b.js imports a.js" and calls that a cycle. This re-cuts the SAME
// Tarjan machinery (tarjanSCC, helix.js) one grain finer — over the individual
// declarations the SCC's modules hold — to ask whether the cycle survives.
//
// Reconstructing "which declaration a reference belongs to" from the LOWERED event
// tuples takes one honest workaround, documented here rather than hidden: the eot.js
// dialect's own same-module `calls` decoration (fn -> localName : calls) only ever
// covers calls to a LOCALLY DECLARED callable — a call to an IMPORTED binding never
// appears as a `calls` edge at all (facts.js's `callables` map excludes Import decls
// by construction), so cross-module attribution needs the raw references instead.
// A reference's ENCLOSING declaration isn't a first-class edge in the medium either —
// the lowering emits scope PARENT/CHILD (`!seg`) and a use's own scope, but never
// "this function scope belongs to that declaration." The reconstruction here pairs
// them by SOURCE ORDER: within one parent scope, the i-th function-shaped child scope
// is paired with the i-th Function declaration in that same parent scope (both sorted
// by their own natural id/position). True for the overwhelmingly common shape (one
// function declaration opens one body scope, in the order they appear) and wrong only
// for constructions this organ does not attempt to disambiguate at this grain (e.g.
// two same-named function EXPRESSIONS nested inside one another at identical
// positions) — a rare enough shape that the conservative fallback (the reference
// attributes to no declaration, so it cannot dissolve a cycle it might actually be
// part of) is the honest default.
//
// refoldCycle(events, scc, { grain }) → either a resolved order (the cycle was a
// file-boundary artifact — the finer graph has no cycle) or the IRREDUCIBLE CORE: the
// declarations that are still genuinely circular once re-cut. `grain` is accepted for
// forward compatibility (a future declaration-vs-statement split); only 'declaration'
// is implemented.

import { tarjanSCC } from './helix.js';
import { parseSign } from './eot.js';

// ── a minimal per-module model, built directly off the event tuples ─────────────
// (a purposely small sibling of issues.js `modelsOf` — only what refolding needs.)
const modelsOf = (events) => {
  const models = new Map();
  const model = (M) => {
    if (!models.has(M)) models.set(M, {
      sign: M, decls: new Map(), exports: new Map(),
      scopes: new Map(),           // scopeId -> { id, kind, parent }
      uses: [],                    // { name, scopeId }
    });
    return models.get(M);
  };
  const declOf = (sign) => {
    const p = parseSign(sign);
    const m = model(`mod:${p.mod}`);
    if (!m.decls.has(sign)) m.decls.set(sign, { sign, name: p.name, line: p.line, col: p.col, kind: null, exported: false, importTarget: null });
    return m.decls.get(sign);
  };
  for (const e of events) {
    const t = String(e.target ?? '');
    const kind = t.split(':', 1)[0];
    if (e.op === 'INS' && kind === 'dcl') { declOf(t).kind = e.operand?.type ?? null; continue; }
    if (e.op === 'SIG' && t.split('.', 1)[0].split(':', 1)[0] === 'dcl' && e.operand?.designation === 'exported') {
      declOf(t.split('.', 1)[0]).exported = true; continue;
    }
    if (e.op === 'CON' && kind === 'dcl') {
      const root = t.split('.', 1)[0];
      if (e.operand?.relation === 'from') { declOf(root).importTarget = e.operand.to; continue; }
    }
    if (e.op === 'SEG') {
      const child = parseSign(e.operand?.key ?? '');
      if (child.kind !== 'sc') continue;
      const parent = parseSign(t);
      model(`mod:${child.mod}`).scopes.set(child.scopeId, {
        id: child.scopeId, kind: child.scopeKind,
        parent: parent.kind === 'sc' ? parent.scopeId : -1,
      });
      continue;
    }
    if (e.op === 'CON' && (kind === 'use' || kind === 'asg' || kind === 'upd' || kind === 'tst')) {
      if (e.operand?.relation !== 'within') continue;
      const p = parseSign(t);
      const to = parseSign(e.operand.to);
      model(`mod:${p.mod}`).uses.push({ name: p.name, scopeId: to.scopeId ?? 0 });
      continue;
    }
    if (e.op === 'INS' && kind === 'ex') {
      const p = parseSign(t);
      model(`mod:${p.mod}`).exports.set(p.name, null);
      continue;
    }
    if (e.op === 'DEF' && kind === 'ex') {
      const root = t.split('.', 1)[0];
      const field = t.slice(root.length + 1);
      if (field === 'local') { const p = parseSign(root); model(`mod:${p.mod}`).exports.set(p.name, e.operand?.value ?? null); }
    }
  }
  return models;
};

// pairFnScopesToDecls(m) → Map<fnScopeId, declSign> — the source-order pairing
// documented in the file header: within each parent scope, the i-th 'fn' child scope
// pairs with the i-th Function declaration sharing that parent, both sorted by their
// own natural order (scope id / decl line·col — both increase with source position).
const pairFnScopesToDecls = (m) => {
  const byParent = new Map();       // parentScopeId -> fn-scope ids, ascending
  for (const [id, s] of m.scopes) {
    if (s.kind !== 'fn') continue;
    if (!byParent.has(s.parent)) byParent.set(s.parent, []);
    byParent.get(s.parent).push(id);
  }
  for (const ids of byParent.values()) ids.sort((a, b) => a - b);

  const declsByParent = new Map();  // parentScopeId (== decl.scopeId, roughly module/block scope) -> Function decls, source order
  for (const [, d] of m.decls) {
    if (d.kind !== 'Function') continue;
    const p = d.scopeId ?? 0;
    if (!declsByParent.has(p)) declsByParent.set(p, []);
    declsByParent.get(p).push(d);
  }
  for (const ds of declsByParent.values()) ds.sort((a, b) => (a.line - b.line) || (a.col - b.col));

  const pairing = new Map();
  for (const [parent, fnIds] of byParent) {
    const decls = declsByParent.get(parent) ?? [];
    fnIds.forEach((fid, i) => { if (decls[i]) pairing.set(fid, decls[i].sign); });
  }
  return pairing;
};

// declGraphOf(events, members) → sign → Set<sign> — the declaration-level graph
// restricted to `members`, exported so coinduct.js (and any caller outside
// organs/code — refoldCycle and coherenceOf are meant to be reused beyond this organ)
// can ask "what does this declaration's justification rest on?" without duplicating
// the event-tuple walk. Cross-module: an edge lands on the resolved target decl when
// the target module is also present in `members`' host modules; otherwise it is
// simply absent (declGraphOf never invents an edge to a module outside its own input).
export const declGraphOf = (events, members) => {
  const models = modelsOf(events);
  const memberSet = new Set(members);
  const memberMods = new Set([...memberSet].map((s) => `mod:${parseSign(s).mod}`));
  const out = new Map(members.map((m) => [m, new Set()]));

  const declByLocalName = new Map();   // "modSign|name" -> decl sign
  for (const M of memberMods) for (const [sign, d] of models.get(M)?.decls ?? []) declByLocalName.set(`${M}|${d.name}`, sign);
  const resolveImport = (M, d) => {
    if (d.kind !== 'Import' || !d.importTarget || !memberMods.has(d.importTarget)) return null;
    const target = models.get(d.importTarget);
    const local = target?.exports.get(d.name) ?? d.name;
    return declByLocalName.get(`${d.importTarget}|${local}`) ?? null;
  };

  for (const M of memberMods) {
    const m = models.get(M);
    if (!m) continue;
    const pairing = pairFnScopesToDecls(m);
    const scopeOf = (id) => m.scopes.get(id);
    const enclosingDecl = (scopeId) => {
      let cur = scopeId;
      while (cur != null && cur !== -1) {
        const s = scopeOf(cur);
        if (!s) return null;
        if (s.kind === 'fn' && pairing.has(s.id)) return pairing.get(s.id);
        cur = s.parent;
      }
      return null;
    };
    for (const u of m.uses) {
      const fromDecl = enclosingDecl(u.scopeId);
      if (!fromDecl || !out.has(fromDecl)) continue;
      const target = [...m.decls.values()].find((d) => d.name === u.name);
      if (!target || target.sign === fromDecl) continue;
      // record the edge whether the target is inside `members` (an internal, possibly
      // cycle-closing dependency) or outside it (an EXTERNAL ground — exactly the
      // signal coinduct.js's greatest-fixpoint check needs to tell legitimate mutual
      // recursion from a pure circularity with nothing backing either side).
      if (target.kind !== 'Import') { out.get(fromDecl).add(target.sign); continue; }
      const resolved = resolveImport(M, target);
      if (resolved) out.get(fromDecl).add(resolved);
    }
  }
  return out;
};

export const refoldCycle = (events, scc, { grain = 'declaration' } = {}) => {
  const models = modelsOf(events);
  const inScc = new Set(scc);

  // every non-import declaration of every module in the SCC — the finer-grain nodes.
  const finerNodes = new Set();
  for (const M of inScc) {
    const m = models.get(M);
    if (!m) continue;
    for (const [sign, d] of m.decls) if (d.kind !== 'Import') finerNodes.add(sign);
  }

  const finerEdges = declGraphOf(events, [...finerNodes]);
  const finerSccs = tarjanSCC([...finerNodes], (n) => finerEdges.get(n) ?? new Set());
  const irreducible = finerSccs.filter((c) => c.length > 1 || (c.length === 1 && finerEdges.get(c[0])?.has(c[0])));

  if (irreducible.length === 0) {
    return Object.freeze({ resolved: true, grain, order: finerSccs.flat(), irreducibleCore: [] });
  }
  return Object.freeze({
    resolved: false, grain, order: null,
    irreducibleCore: irreducible.flat(),
    irreducibleSccs: irreducible,
  });
};
