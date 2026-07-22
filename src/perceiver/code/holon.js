// EO: SEG·INS(Field → Entity, Dissecting,Making) — holon admission
// Which structural facts (organs/code/facts.js's scopes and declarations) earn a
// persistent identity (docs/code-holons.md §1). Every syntax node is NOT a durable
// holon — that would drown the signal in punctuation-grade noise. v1 admits
// exactly: the module (the file), classes, and named functions/methods (a scope
// of kind 'fn' with a resolvable owner — a function declaration, a named function
// expression, a class/object method, or `const x = (...) => {...}`).
//
// Each admitted holon gets the three separate coordinates docs/code-holons.md §2
// asks for: a witness (what is physically there now), an anchor (where it stands
// structurally), and a fingerprint (what might survive movement or cosmetic
// change — fingerprint.js's five hashes).

import { indexFacts } from './scope.js';
import { codeVariants, fingerprintOf, hashText } from './fingerprint.js';

// `id` is keyed on the DECLARED-NAME path from the module down (module >
// class:Widget > function:render#0), not on positional slot. A sibling
// inserted anywhere else in the file must not shift every OTHER holon's id —
// slot-based keys break exactly that way: inserting a new function before an
// existing one shifts the existing one's ordinal, so its old-side id would
// never match its new-side id, and identity.js would misread a plain
// insertion as "the old one was renamed to the new one's name". A name path is
// immune to that: it only changes when something in the ANCESTOR chain (up to
// and including the holon itself) is actually renamed — the case identity.js's
// separate `renamed` pass (full fingerprint match under the same parent) is
// built to catch. `#<occurrence>` disambiguates the rare case of two
// same-name siblings under one parent (overloads, accessor pairs).
const holonKey = (path, namePath) => hashText(`${path}|${namePath}`);

// The class-scope -> class-decl correlation: class declarations and their own
// body's `{` are strictly adjacent in well-formed code (only `extends Name` may
// sit between them), and both lists are already start/offset ascending, so a
// single left-to-right zip pairs them correctly for the ordinary and
// simple-nesting cases. Pathological anonymous nested class expressions
// (`class A extends (class {}) {}`) may mis-pair — out of scope for v1.
const correlateClasses = (facts) => {
  const classDecls = facts.decls.filter((d) => d.declKind === 'class').sort((a, b) => a.offset - b.offset);
  const classScopes = facts.scopes.filter((s) => s.kind === 'class');
  const byScopeId = new Map();
  let di = 0;
  for (const cs of classScopes) {
    while (di < classDecls.length && classDecls[di].offset < cs.start) {
      byScopeId.set(cs.id, classDecls[di]);
      di += 1;
    }
  }
  return byScopeId;
};

// The owner declaration behind a named 'fn' scope, when one exists in facts.decls
// (function declarations and named function expressions; `const x = (...) => {}`).
// Class/object-literal methods have no decls entry — their name lives in
// facts.members instead, so this returns null for them and the caller treats a
// method holon as unexported (its visibility rides its containing class, not the
// module's export list — see docs/code-holons.md §4.2's stated scope).
const findOwnerDecl = (facts, scope) => {
  const byFunction = facts.decls.find((d) => d.declKind === 'function' && d.name === scope.ownerName && (d.scopeId === scope.parent || d.scopeId === scope.id));
  if (byFunction) return byFunction;
  const byBinding = facts.decls.find((d) => ['const', 'let', 'var'].includes(d.declKind) && d.name === scope.ownerName && d.scopeId === scope.parent);
  return byBinding ?? null;
};

const paramCountOf = (facts, scope) => facts.decls.filter((d) => d.declKind === 'param' && d.scopeId === scope.id).length;

// admitFacts(facts, text, {path}) -> CodeHolon[], parents always preceding
// children (scopes nest strictly by increasing `.start`, so a start-ascending
// walk visits a parent before any of its descendants).
export const admitFacts = (facts, text, { path = null } = {}) => {
  const index = indexFacts(facts);
  const variants = codeVariants(text);
  const classOwner = correlateClasses(facts);
  const holons = [];
  const holonIdByScope = new Map();
  const namePathByScope = new Map();     // scopeId -> name-path string (id's basis)
  const slotCounts = new Map();          // `${parentId}|${kind}` -> next positional slot (anchor metadata only)
  const occurrenceCounts = new Map();    // `${parentNamePath}|${kind}:${name}` -> next occurrence (id disambiguation)

  const nextSlot = (parentId, kind) => {
    const key = `${parentId ?? 'root'}|${kind}`;
    const slot = slotCounts.get(key) ?? 0;
    slotCounts.set(key, slot + 1);
    return slot;
  };
  const nextOccurrence = (parentNamePath, kind, name) => {
    const key = `${parentNamePath}|${kind}:${name ?? '<anon>'}`;
    const occ = occurrenceCounts.get(key) ?? 0;
    occurrenceCounts.set(key, occ + 1);
    return occ;
  };

  // — the module holon —
  const moduleSpan = { start: 0, end: text.length };
  const moduleNamePath = 'module';
  const moduleId = holonKey(path, moduleNamePath);
  holons.push(Object.freeze({
    id: moduleId,
    kind: 'module',
    witness: Object.freeze({ path, byteStart: 0, byteEnd: text.length, textHash: hashText(text), treeType: 'module' }),
    anchor: Object.freeze({ parentId: null, structuralSlot: 0, declaredName: facts.module?.sign ?? null, signatureShape: null }),
    fingerprint: fingerprintOf(facts, index, 0, moduleSpan, variants),
    exported: true,
  }));
  holonIdByScope.set(0, moduleId);
  namePathByScope.set(0, moduleNamePath);

  // — classes and functions, parents-before-children by construction —
  const admitted = facts.scopes
    .filter((s) => s.kind === 'class' || (s.kind === 'fn' && s.ownerName))
    .sort((a, b) => a.start - b.start);

  for (const scope of admitted) {
    const parentHolonId = holonIdByScope.get(scope.parent) ?? moduleId;
    const parentNamePath = namePathByScope.get(scope.parent) ?? moduleNamePath;
    const kind = scope.kind === 'class' ? 'class' : 'function';

    let declaredName = null;
    let exported = false;
    let signatureShape = null;
    let ownerDecl = null;

    if (kind === 'class') {
      ownerDecl = classOwner.get(scope.id) ?? null;
      declaredName = ownerDecl?.name ?? null;
      exported = !!ownerDecl?.exported;
    } else {
      declaredName = scope.ownerName;
      ownerDecl = findOwnerDecl(facts, scope);
      exported = !!ownerDecl?.exported;
      signatureShape = Object.freeze({ paramCount: paramCountOf(facts, scope) });
    }

    // The witness/fingerprint span: extend leftward from the body brace to cover
    // the declared name and the parameter list (scope.start alone is the BODY
    // brace — a bare span there excludes the signature entirely, so a rename or
    // a parameter edit would never move the hash). scope.headStart is the params'
    // own `(`; ownerDecl.offset is the name — both, when present, precede the body.
    const headCandidates = [scope.start];
    if (scope.headStart >= 0) headCandidates.push(scope.headStart);
    if (ownerDecl) headCandidates.push(ownerDecl.offset);
    const span = { start: Math.min(...headCandidates), end: scope.end };

    const structuralSlot = nextSlot(parentHolonId, kind);
    const occurrence = nextOccurrence(parentNamePath, kind, declaredName);
    const namePath = `${parentNamePath}>${kind}:${declaredName ?? '<anon>'}#${occurrence}`;
    const id = holonKey(path, namePath);
    holonIdByScope.set(scope.id, id);
    namePathByScope.set(scope.id, namePath);

    const selfName = ownerDecl && declaredName ? { offset: ownerDecl.offset, length: declaredName.length } : null;

    holons.push(Object.freeze({
      id,
      kind,
      witness: Object.freeze({ path, byteStart: span.start, byteEnd: span.end, textHash: hashText(text.slice(span.start, span.end)), treeType: scope.kind }),
      anchor: Object.freeze({ parentId: parentHolonId, structuralSlot, declaredName, signatureShape }),
      fingerprint: fingerprintOf(facts, index, scope.id, span, variants, { selfName }),
      exported,
    }));
  }

  return Object.freeze(holons);
};
