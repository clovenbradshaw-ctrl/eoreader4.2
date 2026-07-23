// EO: EVA·SIG(Network,Entity → Lens, Binding,Tracing) — the fold: dependency-order judgments
// The issue fold — findings read NATIVELY off the EO event stream, in dependency order.
//
// No AST walks here, and no reference back to the source text: the fold consumes the
// parsed EOT TUPLES the lowering emitted (any producer of the dialect gets these laws
// for free), walks the modules in the order helix.js derived (dependencies first, so
// every judgment is made with everything it stands on already judged), and reads each
// issue off the EO laws the codebase's own record violates:
//
//   cycle               the import graph has a strongly-connected component. This is
//                       NOT a failure: the condensation of a graph by its SCCs is
//                       ALWAYS a DAG (helix.js `condensation`) — order holds AT THE
//                       SCC GRAIN, always; it only fails WITHIN one. refold.js is
//                       tried first (does the cycle dissolve at declaration grain —
//                       a file-boundary artifact?); what survives is routed through
//                       coinduct.js coherenceOf, which distinguishes legitimate
//                       mutual recursion (info) from a genuinely circular
//                       justification with no external ground (refuses)
//   dependency          a CON fired before the INS it bonds to — a use precedes its
//                       declaration in the same scope-instance (TDZ; helix: CON < INS)
//   void-binding        an import thread asks a module for a name it never exports —
//                       the thread dwells in the Void (legal to HOLD, §Void law)
//   fabrication         a USE of that unbound thread — deriving from the Void, the
//                       desert-cell sin: you may dwell, you may never fabricate
//   unbound             a reference no scope, no import, and no global ever binds
//   contract-violation  a write to a Const or an Import binding — an op outside the
//                       binding's declared width (a const IS a narrow contract)
//   collision           two declarations claim one name in one scope (INS over INS)
//   cycle-tdz           a top-level use of a binding that crosses a cycle — the one
//                       place ESM's hoisting can still read an unfilled slot (warn)
//   dead-entity         a binding never read — an INS no CON ever witnesses (note)
//   dwell               an import held but never drawn on — legal dwelling (note)
//   dead-export         closed world only: an export no importer ever binds (note)
//
// The findings themselves are JUDGMENTS — the organ's own reading, so they leave
// through the ENACTOR door (issuesToEot): each `!eva` line cites the perceiver-door
// sign it judges, and the whole report re-parses through the same ingester. Nothing
// is asserted that the record can't witness.

import { parseSign } from './eot.js';
import { PY_BUILTINS } from './python.js';
import { refoldCycle } from './refold.js';
import { coherenceOf } from './coinduct.js';

// ── severities ─────────────────────────────────────────────────────────────────
const SEV = { error: 0, warn: 1, note: 2 };
export const SEVERITIES = Object.freeze(['error', 'warn', 'note']);

// ── the ambient names a module may read without binding them (the host, not Void) ──
export const DEFAULT_GLOBALS = new Set([
  // language
  'undefined', 'NaN', 'Infinity', 'globalThis', 'arguments',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON',
  'Date', 'RegExp', 'Function', 'Promise', 'Proxy', 'Reflect', 'Map', 'Set', 'WeakMap',
  'WeakSet', 'WeakRef', 'FinalizationRegistry', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Atomics', 'Intl', 'WebAssembly',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'eval',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'structuredClone', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  // web
  'console', 'crypto', 'performance', 'fetch', 'URL', 'URLSearchParams', 'AbortController',
  'AbortSignal', 'TextEncoder', 'TextDecoder', 'Blob', 'File', 'FileReader', 'FormData',
  'Headers', 'Request', 'Response', 'ReadableStream', 'WritableStream', 'TransformStream',
  'WebSocket', 'Worker', 'SharedWorker', 'BroadcastChannel', 'MessageChannel', 'EventSource',
  'Event', 'CustomEvent', 'EventTarget', 'ErrorEvent', 'CloseEvent', 'MessageEvent',
  'ProgressEvent', 'PromiseRejectionEvent', 'DOMParser', 'XMLSerializer', 'XPathResult',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'self',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore',
  'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'scrollTo',
  'btoa', 'atob', 'Image', 'Audio', 'AudioContext', 'OfflineAudioContext',
  'HTMLElement', 'HTMLCanvasElement', 'SVGElement', 'Node', 'NodeList', 'Element',
  'customElements', 'ShadowRoot', 'CSSStyleSheet', 'DocumentTimeline',
  'DocumentFragment', 'Range', 'Selection', 'CSS', 'FontFace', 'Notification',
  'XMLHttpRequest', 'ImageData', 'OffscreenCanvas', 'createImageBitmap', 'reportError',
  'CompressionStream', 'DecompressionStream', 'CryptoKey', 'SubtleCrypto',
  'IDBKeyRange', 'MediaRecorder', 'MediaStream', 'SpeechSynthesisUtterance', 'speechSynthesis',
  // node-flavoured hosts (tests, tools)
  'process', 'Buffer', 'global', '__dirname', '__filename', 'module', 'require', 'exports',
]);

// ── model building — the tuples, re-hung on their signs ────────────────────────
// One pass over the events; every structure keyed by module sign.
const modelsOf = (events) => {
  const models = new Map();
  const model = (M) => {
    if (!models.has(M)) {
      models.set(M, {
        sign: M, path: null, lang: null,
        scopes: new Map(),                       // id → { id, kind, parent }
        decls: [],                               // { sign, name, kind, line, col, scopeId, exported, importOf }
        declBySign: new Map(),
        exports: [],                             // { name, local, from, source }
        uses: [],                                // { sign, kind, name, line, col, scopeId }
        hazards: [],                             // { sign, law, line, col, detail } — witnessed shapes
        edges: new Set(),                        // dependency module signs
      });
    }
    return models.get(M);
  };
  const declOf = (sign) => {
    const p = parseSign(sign);
    const m = model(`mod:${p.mod}`);
    let d = m.declBySign.get(sign);
    if (!d) {
      d = { sign, name: p.name, kind: null, line: p.line, col: p.col,
            scopeId: p.kind === 'dcl' ? 0 : null, exported: false,
            importName: null, importFrom: null, importTarget: null,
            usedRead: false, usedWrite: false };
      m.declBySign.set(sign, d);
      m.decls.push(d);
    }
    return d;
  };

  for (const e of events) {
    const t = String(e.target ?? '');
    const kind = t.split(':', 1)[0];
    if (e.op === 'INS') {
      if (e.operand?.type === 'Module' && kind === 'mod') { model(t).present = true; continue; }
      if (kind === 'dcl') { declOf(t).kind = e.operand?.type ?? null; continue; }
      if (kind === 'ex') {
        const p = parseSign(t);
        model(`mod:${p.mod}`).exports.push({ sign: t, name: p.name, local: null, from: null, source: null });
        continue;
      }
      if (kind === 'hz') {
        const p = parseSign(t);
        model(`mod:${p.mod}`).hazards.push({ sign: t, law: p.name, line: p.line, col: p.col, detail: null });
        continue;
      }
      continue;                                  // mem: etc — decoration
    }
    if (e.op === 'DEF') {
      const root = t.split('.', 1)[0];
      const field = t.slice(root.length + 1);
      const rk = root.split(':', 1)[0];
      if (rk === 'mod') {
        const m = model(root);
        if (field === 'path') m.path = e.operand?.value ?? null;
        if (field === 'lang') m.lang = e.operand?.value ?? null;
      } else if (rk === 'dcl') {
        const d = declOf(root);
        if (field === 'name') d.importName = String(e.operand?.value ?? '');   // Import: the asked-for name; others: verbatim label
        if (field === 'from') d.importFrom = String(e.operand?.value ?? '');
      } else if (rk === 'ex') {
        const p = parseSign(root);
        const ex = model(`mod:${p.mod}`).exports.find((x) => x.sign === root);
        if (ex) {
          if (field === 'local') ex.local = String(e.operand?.value ?? '');
          if (field === 'from') ex.from = String(e.operand?.value ?? '');
          if (field === 'source') ex.source = String(e.operand?.value ?? '');
          if (field === 'name') ex.name = String(e.operand?.value ?? '');
        }
      } else if (rk === 'hz' && field === 'detail') {
        const p = parseSign(root);
        const hz = model(`mod:${p.mod}`).hazards.find((x) => x.sign === root);
        if (hz) hz.detail = String(e.operand?.value ?? '');
      }
      continue;
    }
    if (e.op === 'SIG') {
      const root = t.split('.', 1)[0];
      if (root.split(':', 1)[0] === 'dcl') {
        if (e.operand?.designation === 'exported') declOf(root).exported = true;
        if (e.operand?.designation === 'set-aside') declOf(root).setAside = true;
      }
      continue;
    }
    if (e.op === 'SEG') {
      const child = parseSign(e.operand?.key ?? '');
      if (child.kind !== 'sc') continue;
      const parent = parseSign(t);
      const m = model(`mod:${child.mod}`);
      m.scopes.set(child.scopeId, {
        id: child.scopeId, kind: child.scopeKind,
        parent: parent.kind === 'sc' ? parent.scopeId : -1,
      });
      continue;
    }
    if (e.op === 'CON') {
      const rel = e.operand?.relation;
      const to = e.operand?.to;
      if (rel === 'imports' || rel === 'reexports') { model(t).edges.add(to); continue; }
      if (rel === 'in') { if (kind === 'dcl') declOf(t).scopeId = parseSign(to).scopeId ?? 0; continue; }
      if (rel === 'from') { declOf(t).importTarget = to; continue; }
      if (rel === 'reexportOf') {
        const p = parseSign(t);
        const ex = model(`mod:${p.mod}`).exports.find((x) => x.sign === t);
        if (ex) ex.fromTarget = to;
        continue;
      }
      if (rel === 'within') {
        const p = parseSign(t);
        if (p.kind === 'use' || p.kind === 'asg' || p.kind === 'upd' || p.kind === 'tst') {
          model(`mod:${p.mod}`).uses.push({
            sign: t, kind: p.kind, name: p.name, line: p.line, col: p.col,
            scopeId: parseSign(to).scopeId ?? 0,
          });
        }
        continue;
      }
      continue;                                  // calls / memberOf / definedIn — decoration
    }
  }
  return models;
};

// ── the export tables (static — ESM bindings hoist, so tables precede the walk) ──
const exportTables = (models) => {
  const tables = new Map();                      // mod sign → Map name → { decl?, reexport? }
  for (const [M, m] of models) {
    const table = new Map();
    for (const d of m.decls) if (d.exported && d.name) table.set(d.name, { decl: d });
    for (const ex of m.exports) {
      if (ex.from != null || ex.fromTarget) {
        if (ex.name === '*' && (ex.source === '*' || ex.source == null)) {
          if (!table.has('*')) table.set('*', { stars: [] });
          table.get('*').stars.push(ex.fromTarget ?? null);
        } else {
          table.set(ex.name, { reexport: { target: ex.fromTarget ?? null, source: ex.source ?? ex.name } });
        }
      } else {
        table.set(ex.name, { local: ex.local ?? ex.name });
      }
    }
    tables.set(M, table);
  }
  return tables;
};

// does module M export `name`? walks re-export chains and `export *` fans, cycle-safe.
// `touch` marks every (module, name) the resolution rests on — the dead-export census.
const resolvesExport = (tables, M, name, touch, seen = new Set()) => {
  const key = `${M}|${name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const table = tables.get(M);
  if (!table) return true;                       // outside the corpus — the open world
  if (name === '*') { touch?.(M, '*'); return true; }
  const hit = table.get(name);
  if (hit) {
    touch?.(M, name);
    if (hit.decl || hit.local != null) return true;
    if (hit.reexport) return hit.reexport.target == null
      ? true                                     // re-export from outside the corpus
      : resolvesExport(tables, hit.reexport.target, hit.reexport.source, touch, seen);
  }
  const star = table.get('*');
  if (star && name !== 'default') {
    for (const target of star.stars) {
      if (target == null) return true;
      if (resolvesExport(tables, target, name, touch, seen)) { touch?.(M, name); return true; }
    }
  }
  return false;
};

// ── the behavioral hazards — severities of the witnessed shapes ─────────────────
// Four are unambiguous defects; two (resource, tail) have legitimate-use tails and
// judge at warn. Each law's EO reading is in the provider that witnesses it.
const HAZARD_SEVERITY = Object.freeze({
  // python.js
  'bare-except': 'error', 'shared-default': 'error', 'dangling-task': 'error',
  'void-identity': 'error', 'unbounded-resource': 'warn', 'tail-drop': 'warn',
  // facts.js (JS behavioral)
  'loop-off-by-one': 'error', 'assign-in-condition': 'error', 'async-foreach': 'error',
  'unguarded-parse': 'warn', 'unstable-sort': 'warn', 'var-capture': 'warn',
});

// ── the fold ────────────────────────────────────────────────────────────────────
// findIssues(events, order, opts) → findings, most severe first.
//   order        from helix.js dependencyOrder(events)
//   opts.globals extra ambient names   opts.closedWorld  the corpus is the world
//   opts.entries module paths whose exports are roots (exempt from dead-export)
//   opts.diagnostics  parse diagnostics to surface as medium errors (never silent)
export const findIssues = (events, order, opts = {}) => {
  const models = modelsOf(events);
  const tables = exportTables(models);
  const globals = opts.globals ? new Set([...DEFAULT_GLOBALS, ...opts.globals]) : DEFAULT_GLOBALS;
  const findings = [];
  const usedExports = new Set();                 // "mod|name" bound by some importer
  const touch = (M, name) => usedExports.add(`${M}|${name}`);

  const add = (law, severity, m, at, message, extra = {}) => {
    findings.push({
      law, severity,
      mod: m?.sign ?? null, path: m?.path ?? null,
      line: at?.line ?? null, col: at?.col ?? null,
      name: at?.name ?? null, sign: at?.sign ?? null,
      message, ...extra,
    });
  };

  // the medium itself must be clean — a malformed line is a finding, never silence
  for (const d of opts.diagnostics ?? []) {
    add('medium', 'error', null, { line: d.line }, `EOT line did not parse: ${d.expected} — ${JSON.stringify(d.raw)}`);
  }

  // 1 · cycle — a module-grain SCC (reported before the walk, because the walk's
  // premise touches it first). The condensation is ALWAYS a DAG (order.condensation,
  // helix.js) — order holds AT THE SCC GRAIN; this is informational, not a failure,
  // UNLESS refold.js can't dissolve it AND coinduct.js reads it as genuinely
  // circular justification (no external ground) — that case refuses.
  for (const cycle of order.cycles) {
    const names = cycle.map((s) => models.get(s)?.path ?? s);
    const refold = refoldCycle(events, cycle);
    if (refold.resolved) continue;   // a file-boundary artifact — the cycle dissolves at declaration grain, nothing to report

    const coherence = coherenceOf(events, refold.irreducibleCore);
    if (coherence.verdict === 'coherent') {
      add('cycle', 'info', models.get(cycle[0]), { sign: cycle[0] },
        `order holds at SCC grain; ${cycle.length} module(s) are mutually dependent and fold as one unit: ${names.join(' → ')} → ${names[0]}`,
        { members: cycle, irreducibleCore: refold.irreducibleCore });
    } else {
      add('cycle-incoherent', 'error', models.get(cycle[0]), { sign: cycle[0] },
        `a genuinely circular justification survives at declaration grain, grounded in nothing outside itself: ${refold.irreducibleCore.join(' ↔ ')}`,
        { members: cycle, irreducibleCore: refold.irreducibleCore, breach: coherence.breach });
    }
  }

  // 2 · the walk — dependencies first
  for (const M of order.order) {
    const m = models.get(M);
    if (!m || !m.present) continue;              // ext:… — the open world
    // the ambient names are the module's HOST language's, not the organ's
    const ambient = m.lang === 'python'
      ? (opts.globals ? new Set([...PY_BUILTINS, ...opts.globals]) : PY_BUILTINS)
      : globals;

    // scope machinery
    const parentOf = (id) => m.scopes.get(id)?.parent ?? -1;
    const kindOf = (id) => m.scopes.get(id)?.kind ?? 'module';
    const chainHasFnBetween = (fromId, toId) => {
      // any fn scope strictly between use-scope and decl-scope defers evaluation
      let cur = fromId;
      while (cur !== -1 && cur !== toId) {
        if (kindOf(cur) === 'fn') return true;
        cur = parentOf(cur);
      }
      return false;
    };
    const atTopLevel = (scopeId) => !chainHasFnBetween(scopeId, -1);

    // name → decls per scope
    const byScope = new Map();
    for (const d of m.decls) {
      if (d.scopeId == null || !d.name) continue;
      if (!byScope.has(d.scopeId)) byScope.set(d.scopeId, new Map());
      const names = byScope.get(d.scopeId);
      if (!names.has(d.name)) names.set(d.name, []);
      names.get(d.name).push(d);
    }
    const resolve = (name, scopeId) => {
      let cur = scopeId;
      while (cur !== -1) {
        const hit = byScope.get(cur)?.get(name);
        if (hit) return hit[0];
        cur = parentOf(cur);
      }
      return null;
    };

    // 2a′ · hazards — the witnessed behavioral shapes, judged
    for (const hz of m.hazards) {
      add(hz.law, HAZARD_SEVERITY[hz.law] ?? 'warn', m, hz, hz.detail ?? hz.law);
    }

    // 2a · collisions — two INS claim one name in one scope
    for (const [, names] of byScope) {
      for (const [name, ds] of names) {
        const contested = ds.filter((d) => d.kind !== 'Param');
        if (contested.length < 2) continue;
        const kinds = new Set(contested.map((d) => d.kind));
        if (kinds.size === 1 && kinds.has('Var')) continue;                    // var+var — legal
        const severity = kinds.size === 1 && kinds.has('Function') ? 'warn' : 'error';
        add('collision', severity, m, contested[1],
          `'${name}' is declared twice in one scope (${contested.map((d) => `${d.kind} at L${d.line}`).join(', ')}) — INS over INS with no SEG between`);
      }
    }

    // 2b′ · an export clause draws on its local (`export default function foo` — foo
    // is taken by the default thread even if no line inside the module reads it)
    for (const ex of m.exports) {
      if (!ex.local) continue;
      const d = resolve(ex.local, 0);
      if (d) { d.usedRead = true; d.exported = true; }
    }

    // 2b · import threads — do they bind?
    for (const d of m.decls) {
      if (d.kind !== 'Import') continue;
      d.bound = true;
      if (!d.importTarget || d.importTarget.startsWith('ext:')) continue;      // open world
      if (!resolvesExport(tables, d.importTarget, d.importName ?? d.name, touch)) {
        d.bound = false;
        const depPath = models.get(d.importTarget)?.path ?? d.importTarget;
        add('void-binding', 'error', m, d,
          `import '${d.importName ?? d.name}' from '${d.importFrom}' never binds — ${depPath} exports no '${d.importName ?? d.name}' (a thread into the Void: legal to hold, watch every use)`);
      }
    }

    // 2c · the references, in source order — the CON-before-INS laws
    const uses = [...m.uses].sort((a, b) => (a.line - b.line) || (a.col - b.col));
    for (const u of uses) {
      const d = resolve(u.name, u.scopeId);
      if (!d) {
        if (u.kind === 'tst') continue;                                        // typeof-guarded — legal dwelling
        if (ambient.has(u.name)) continue;                                     // the host, not the Void
        add('unbound', 'error', m, u,
          u.kind === 'asg' || u.kind === 'upd'
            ? `assignment to undeclared '${u.name}' — a write into the Void (ReferenceError in module code)`
            : `'${u.name}' is bound by no scope, no import, and no known global — a CON into the Void`);
        continue;
      }
      if (u.kind === 'asg' || u.kind === 'upd') d.usedWrite = true;
      if (u.kind !== 'asg') d.usedRead = true;

      // fabrication — using a thread that never bound
      if (d.kind === 'Import' && d.bound === false && u.kind !== 'tst') {
        add('fabrication', 'error', m, u,
          `'${u.name}' is used but its import never bound — deriving from the Void (dwelling is legal; fabricating is not)`);
      }

      // dependency — TDZ: the bond precedes the existence it bonds to
      const TDZ = d.kind === 'Const' || d.kind === 'Let' || d.kind === 'Class';
      if (TDZ && !chainHasFnBetween(u.scopeId, d.scopeId)) {
        if (u.line < d.line || (u.line === d.line && u.col < d.col)) {
          add('dependency', 'error', m, u,
            `'${u.name}' is used at L${u.line} before its ${d.kind.toLowerCase()} declaration at L${d.line} — CON before INS (the helix: existence precedes structure)`);
        }
      }

      // contract-violation — a write outside the binding's declared width
      // (a Python name bound by import is legally rebindable — shadowing, not violation)
      if ((u.kind === 'asg' || u.kind === 'upd') && (d.kind === 'Const' || d.kind === 'Import') &&
          !(d.kind === 'Import' && m.lang === 'python')) {
        add('contract-violation', 'error', m, u,
          `assignment to ${d.kind === 'Const' ? `const '${u.name}'` : `import binding '${u.name}'`} — the binding's contract does not include EVA-to-a-new-value (declare let, or bind a new name)`);
      }

      // cycle-tdz — top-level read through a cycle: the slot may not be filled yet
      if (d.kind === 'Import' && d.importTarget && order.inCycle.has(M) &&
          order.inCycle.get(M).includes(d.importTarget) && atTopLevel(u.scopeId) && u.kind !== 'tst') {
        add('cycle-tdz', 'warn', m, u,
          `'${u.name}' (from ${models.get(d.importTarget)?.path ?? d.importTarget}) is read at module top level inside an import cycle — evaluation order may reach it unfilled`);
      }
    }

    // 2d · dead entities & dwelling threads
    for (const d of m.decls) {
      if (!d.name || d.name.startsWith('_')) continue;
      if (d.kind === 'Param') continue;                                        // signatures carry unused params by design
      if (d.setAside) continue;                                                // a rest-omission sibling — set aside on purpose
      if (d.exported) continue;
      if (d.kind === 'Import') {
        if (!d.usedRead && !d.usedWrite) {
          add('dwell', 'note', m, d,
            `import '${d.name}' is held but never drawn on — a dwelling thread (legal; the membrane carries unused mass)`);
        }
        continue;
      }
      if (d.usedRead) continue;
      if (d.kind === 'Function' && kindOf(d.scopeId) === 'fn') continue;       // an expression's self-name
      if (kindOf(d.scopeId) === 'class') continue;                             // a class's surface (fields, methods) — read via instances
      add('dead-entity', 'note', m, d,
        d.usedWrite
          ? `'${d.name}' is written but never read — an INS no CON ever witnesses`
          : `'${d.name}' is never used — an INS no CON ever witnesses`);
    }
  }

  // 3 · closed world — exports nobody binds
  if (opts.closedWorld) {
    const entryPaths = new Set(opts.entries ?? []);
    for (const M of order.order) {
      const m = models.get(M);
      if (!m || !m.present || entryPaths.has(m.path)) continue;
      const table = tables.get(M);
      for (const [name, hit] of table ?? []) {
        if (name === '*' || hit.stars) continue;
        if (!usedExports.has(`${M}|${name}`)) {
          const at = hit.decl ?? { name, line: null, col: null };
          add('dead-export', 'note', m, { ...at, name },
            `export '${name}' is bound by no importer in the corpus (closed world) — a thread offered, never taken`);
        }
      }
    }
  }

  findings.sort((a, b) => (SEV[a.severity] - SEV[b.severity]) ||
    String(a.path ?? '').localeCompare(String(b.path ?? '')) ||
    ((a.line ?? 0) - (b.line ?? 0)) || ((a.col ?? 0) - (b.col ?? 0)));
  return findings;
};

// ── the judgments, read back out as EOT (the enactor door) ──────────────────────
// Every finding is the organ's own evaluation — reafference, it cannot witness —
// so each `!eva` line carries the organ as agent and CITES the perceiver-door sign
// it judges. The block re-parses through parseEOT with zero diagnostics.
const VERDICT = {
  cycle: 'cyclic', 'cycle-incoherent': 'incoherent', dependency: 'premature', 'void-binding': 'unbound',
  fabrication: 'fabricated', unbound: 'unbound', 'contract-violation': 'refused',
  collision: 'collided', 'cycle-tdz': 'hazard', 'dead-entity': 'dead',
  dwell: 'dwelling', 'dead-export': 'unread', medium: 'unparsed',
  'bare-except': 'unkeyed', 'shared-default': 'grain-mixed', 'tail-drop': 'partial',
  'unbounded-resource': 'unbounded', 'dangling-task': 'dead', 'void-identity': 'voided',
  'loop-off-by-one': 'overrun', 'unguarded-parse': 'unguarded', 'assign-in-condition': 'mistaken',
  'async-foreach': 'unawaited', 'unstable-sort': 'unordered', 'var-capture': 'captured',
};

export const issuesToEot = (findings, { agent = 'organ:code' } = {}) => {
  const lines = [
    '# organ:code — judgments (enactor door: the reading\'s own evaluation; each line cites the sign it judges)',
    `# ${findings.length} finding(s)`,
  ];
  for (const f of findings) {
    const sign = f.sign ?? f.mod ?? 'corpus';
    const where = f.path ? ` · ${f.path}${f.line ? `:${f.line}` : ''}${f.col ? `:${f.col}` : ''}` : '';
    lines.push(`!eva ${sign} : held -> ${VERDICT[f.law] ?? 'judged'} @${agent}   # ${f.severity} · ${f.law}${where}`);
  }
  return lines.join('\n');
};

// ── the human line ───────────────────────────────────────────────────────────────
export const reportText = (findings) =>
  findings.map((f) => {
    const where = f.path ? `${f.path}${f.line ? `:${f.line}` : ''}${f.col ? `:${f.col}` : ''}` : (f.mod ?? 'corpus');
    return `${f.severity.padEnd(5)} ${where} · ${f.law} — ${f.message}`;
  }).join('\n');
