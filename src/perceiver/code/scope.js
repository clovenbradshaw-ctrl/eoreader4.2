// EO: EVA(Network → Lens, Tracing) — lexical scope resolution over code facts
// The shared primitive fingerprint.js (alpha-renaming, reference-shape) and
// identity.js (in-corpus rename verification) both need: given a `use`, which
// declaration (if any) binds it, walking the scope chain outward from innermost.
// Built once over organs/code/facts.js's fact shape — no new extraction, just an
// index + a lexical walk over what facts.js already emits (scopes, decls).

// index once per file's facts: scope lookup by id, and the first declaration of
// each name per scope (shadowing/redeclaration edge cases are not this index's
// concern — it answers "which binding does a read resolve to", not "is this
// program well-formed").
export const indexFacts = (facts) => {
  const scopeById = new Map(facts.scopes.map((s) => [s.id, s]));
  const declsByScope = new Map();
  for (const d of facts.decls) {
    if (!declsByScope.has(d.scopeId)) declsByScope.set(d.scopeId, new Map());
    const m = declsByScope.get(d.scopeId);
    if (!m.has(d.name)) m.set(d.name, d);
  }
  return Object.freeze({ scopeById, declsByScope });
};

// The scope ids forming one holon's own subtree: the scope it was admitted from,
// plus every descendant (nested blocks, nested functions, catch clauses, nested
// classes). A holon's "local" bindings are exactly the declarations whose scopeId
// lands in this set.
export const scopeSubtree = (facts, rootScopeId) => {
  const children = new Map();
  for (const s of facts.scopes) {
    if (s.id === rootScopeId) continue;
    if (!children.has(s.parent)) children.set(s.parent, []);
    children.get(s.parent).push(s.id);
  }
  const out = new Set([rootScopeId]);
  const queue = [rootScopeId];
  while (queue.length) {
    const id = queue.shift();
    for (const childId of children.get(id) ?? []) {
      if (!out.has(childId)) { out.add(childId); queue.push(childId); }
    }
  }
  return out;
};

// Walk the scope chain outward from `scopeId` for the nearest declaration of
// `name` — standard lexical shadowing, innermost binding wins. Returns the decl
// or null (a free reference: a builtin, a global, an import bound elsewhere, or
// truly unbound — `facts.js` does not distinguish those, and neither does this).
export const resolveBinding = ({ scopeById, declsByScope }, scopeId, name) => {
  let id = scopeId;
  let hops = 0;
  while (id != null && hops < 64) {
    const decl = declsByScope.get(id)?.get(name);
    if (decl) return decl;
    const scope = scopeById.get(id);
    if (!scope || scope.parent === id) break;
    id = scope.parent;
    hops += 1;
  }
  return null;
};
