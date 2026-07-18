// EO: CON·SIG(Network → Network,Lens, Binding,Tracing) — typed dependency edges
// and staleness propagation
// Reads three edge types straight off organs/code/facts.js's own output — no new
// extraction, only a typed label and a staleness rule per type (docs/code-holons.md
// §6). This is the SOUNDNESS gate: every propagation here always fires, regardless
// of how small the underlying diff looks byte-wise (the `<=` -> `<` case is exactly
// why — one character, and every same-module caller must re-check). There is no
// attention gate (ranking/scheduling which stale reading gets recomputed or shown
// first) in v1 — that is a layer over this same data, and it is not allowed to
// suppress anything this module marks stale.

import { resolveSpec } from '../../organs/code/index.js';

// dependencyEdges(factsByFile) -> { imports, calls }
//   imports  [{ exporterPath, importerPath, importedName, localName }]  cross-file,
//            resolved via facts.js's own resolveSpec — external specs excluded.
//   calls    [{ path, callerName, calleeName }]                        same-module
//            only — facts.js's own documented limit (its `calls` array is
//            name-matched within one file's scan).
export const dependencyEdges = (factsByFile) => {
  const imports = [];
  const calls = [];
  for (const [path, facts] of Object.entries(factsByFile)) {
    for (const imp of facts.imports ?? []) {
      const resolved = resolveSpec(path, imp.spec);
      if (resolved.external) continue;
      imports.push({ exporterPath: resolved.path, importerPath: path, importedName: imp.imported, localName: imp.local });
    }
    for (const c of facts.calls ?? []) {
      calls.push({ path, callerName: c.fromName, calleeName: c.toName });
    }
  }
  return { imports, calls };
};

// propagateStaleness(reconciliationByFile, factsByFile) -> per changed exported
// holon, its type consumers and behavioral consumers:
//
//   typeConsumers        importers of the changed export, when the export's
//                        CONTRACT changed — removed, renamed, or its param count
//                        differs. A `removed`/`renamed` export unconditionally
//                        stales every importer (the contract is severed or gone;
//                        there is no signature left to compare).
//   behavioralConsumers  importers that additionally CALL the imported binding
//                        (facts.uses in the importer's own file, `call:true` on
//                        the local name) — they depend on runtime behavior, not
//                        just the shape, so ANY change (even a same-signature
//                        body edit) stales them.
//
// A same-module caller (facts.calls) is always a behavioral consumer of a
// changed callee, contract or not — it runs the body directly.
export const propagateStaleness = (reconciliationByFile, factsByFile) => {
  const { imports } = dependencyEdges(factsByFile);
  const results = [];

  for (const [path, entries] of Object.entries(reconciliationByFile)) {
    const facts = factsByFile[path];
    for (const entry of entries) {
      if (entry.category === 'same') continue;
      const holon = entry.old ?? entry.new;
      if (!holon || holon.kind === 'module' || !holon.exported) continue;

      const exportName = holon.anchor.declaredName;
      const oldParams = entry.old?.anchor?.signatureShape?.paramCount;
      const newParams = entry.new?.anchor?.signatureShape?.paramCount;
      const contractChanged = entry.category === 'removed' || entry.category === 'renamed'
        || (entry.category === 'modified' && oldParams !== newParams);

      const importers = imports.filter((i) => i.exporterPath === path && i.importedName === exportName);
      const typeConsumers = [];
      const behavioralConsumers = [];
      for (const imp of importers) {
        if (contractChanged) typeConsumers.push({ path: imp.importerPath, localName: imp.localName });
        const importerFacts = factsByFile[imp.importerPath];
        const calls = (importerFacts?.uses ?? []).some((u) => u.name === imp.localName && u.call);
        if (calls) behavioralConsumers.push({ path: imp.importerPath, localName: imp.localName });
      }

      // same-module callers: always behavioral, contract-status aside.
      for (const c of facts?.calls ?? []) {
        if (c.toName === exportName) behavioralConsumers.push({ path, localName: exportName, sameModule: true });
      }

      results.push({ holonId: holon.id, path, exportName, category: entry.category, contractChanged, typeConsumers, behavioralConsumers });
    }
  }
  return results;
};

export const renderPropagation = (p) =>
  `${p.exportName} — ${p.contractChanged ? 'contract changed' : 'implementation changed'} here. ` +
  `${p.typeConsumers.length} type consumer${p.typeConsumers.length === 1 ? '' : 's'} stale · ` +
  `${p.behavioralConsumers.length} behavioral consumer${p.behavioralConsumers.length === 1 ? '' : 's'} stale.`;
