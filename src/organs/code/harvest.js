// EO: CON·SYN·EVA(Void,Network → Network,Lens, Binding,Composing,Tracing) — the record's gaps drive the search
// The harvest — a program assembled from pieces FORAGED off the web, the search driven
// by the organ's own findings.
//
// The thesis (the reason this holon matters): a model does not need to hold, in its
// weights, how to build anything. It supplies STRUCTURE — a seed program (or a compose.js
// blueprint) that NAMES the pieces it needs — and the knowledge is fetched on demand. The
// loop is not "the model fills the holes from memory"; it is the organ's `unbound` findings
// naming exactly what is still missing, and a retriever fetching precisely those names,
// round after round, until the record closes. When a fetched piece itself references
// something unbound (a helper, a dependency), that becomes the next round's search — the
// dependency chain resolves itself, gap by witnessed gap.
//
//   model:     decompose + name the pieces (structure)         — method, not facts
//   web:       the actual implementations                       — knowledge, on demand
//   organ:     which names are still unbound                    — the gaps, witnessed
//   loop:      fetch those names, reassemble, re-read           — iterate to closure
//
// Every fetched piece comes through the PERCEIVER door — it is the world, read, not the
// model's conjecture — so the assembled program carries a PROVENANCE trail: which line came
// from which URL. That is the eoreader move (docs/web-search.md, the provenance DAG) applied
// to code: a generated program you can audit back to its sources, cited like any reading.
//
// PURE + INJECTED, like every organ: the web arrives as `retrieve` (the caller's fetcher —
// tests inject a fixed corpus, the browser injects npm/unpkg, a workspace injects its own
// files); an optional `verify` is the SYNTAX gate the organ deliberately is not (the fold
// checks the dependency laws — bindings, order, cycles — not that the bytes parse; a
// truncated function has no unbound name yet will not run, so a real build gates on both).

import { readCodebase } from './read.js';
import { composeProgram } from './compose.js';

// the distinct names the record still cannot bind — the organ's `unbound`/`fabrication`
// findings, deduped, minus what has already been attempted and the known ambient names.
const openGaps = (issues, attempted) => {
  const names = new Set();
  for (const f of issues) {
    if ((f.law === 'unbound' || f.law === 'fabrication' || f.law === 'void-binding') && f.name && !attempted.has(f.name)) {
      names.add(f.name);
    }
  }
  return [...names];
};

// harvestProgram(seed, retrieve, opts) →
//   { code, ok, trail, rounds, findings, unresolved }
//
//   seed        { blueprint } (lowered through compose.js) | { code } (verbatim seed)
//   retrieve    (name, ctx) => Promise<{ code, source } | null>
//               ctx = { hint, round, code } — the caller searches the web for `name`
//               (a hint may ride from the blueprint: `name.need = "…query…"`).
//   opts.verify (code) => boolean | Promise<boolean> — the syntax/run gate (optional)
//   opts.hints  { name: "search query" } — per-gap search hints (or seed.hints)
//   opts.maxRounds  default 8 · opts.globals  extra ambient names the reader may assume
export const harvestProgram = async (seed, retrieve, opts = {}) => {
  const maxRounds = opts.maxRounds ?? 8;
  const hints = { ...(seed.hints ?? {}), ...(opts.hints ?? {}) };
  const base = seed.blueprint != null ? composeProgram(seed.blueprint).code : String(seed.code ?? '');
  const pieces = new Map();                 // name → { code, source } | null (attempted, no hit)
  const attempted = new Set();
  const trail = [];
  const readOpts = { doc: false, ...(opts.globals ? { globals: opts.globals } : {}) };

  // fetched pieces first (they are the dependencies), then the seed that uses them.
  const assemble = () => [...[...pieces.values()].filter(Boolean).map((p) => p.code), base]
    .filter((s) => s && s.trim()).join('\n\n');

  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    const code = assemble();
    const read = readCodebase([{ path: opts.path ?? 'harvested.js', text: code }], readOpts);
    const gaps = openGaps(read.issues, attempted);
    if (gaps.length === 0) {
      const structural = read.issues.every((f) => f.severity !== 'error');
      const parsed = structural && opts.verify ? await opts.verify(code) : structural;
      const unresolved = [...attempted].filter((n) => pieces.get(n) == null);
      return Object.freeze({
        code, ok: structural && parsed, structural, parsed,
        trail, rounds, findings: read.issues, unresolved,
        provenance: trail.map((t) => ({ name: t.name, source: t.source })),
      });
    }
    // forage for exactly the names the organ says are still open
    for (const name of gaps) {
      attempted.add(name);
      let got = null;
      try { got = await retrieve(name, { hint: hints[name], round: rounds, code }); }
      catch { got = null; }
      pieces.set(name, got);
      if (got) trail.push({ name, source: got.source ?? null, round: rounds });
    }
  }

  const code = assemble();
  const read = readCodebase([{ path: opts.path ?? 'harvested.js', text: code }], readOpts);
  return Object.freeze({
    code, ok: false, structural: false, parsed: false,
    trail, rounds, findings: read.issues,
    unresolved: openGaps(read.issues, new Set()),
    provenance: trail.map((t) => ({ name: t.name, source: t.source })),
    exhausted: true,
  });
};

// ── a real web retriever (npm search → unpkg source → a bound `const`) ─────────────
// The live foraging path: search npm for the piece, pick the package whose NAME best
// matches the query (the model's judgment, approximated), fetch its unpkg source, and
// adapt the export to `const <name> = <impl>`. Injected into harvestProgram for a browser
// or a node host with network; NEVER reached by the deterministic tests (they inject a
// fixed corpus). `fetchText` is itself injected so the caller owns the network stack.
export const createWebRetriever = ({ fetchText, registry = 'https://registry.npmjs.org', cdn = 'https://unpkg.com' } = {}) => {
  const score = (name, q) => {
    const terms = String(q).toLowerCase().split(/\W+/).filter(Boolean);
    const n = name.toLowerCase();
    return terms.filter((t) => n.includes(t)).length;
  };
  const takeExpr = (src) => {
    let expr = src.split(/export\s+default\s+/)[1] ?? src.split(/module\.exports\s*=\s*/)[1];
    if (expr == null) return null;
    expr = expr.trim().replace(/^function\s+\w+/, 'function');
    const bi = expr.indexOf('{');
    if (bi >= 0 && /^(async\s+)?function|\)\s*=>\s*$|=>\s*$/.test(expr.slice(0, bi).trim() + (expr[bi - 1] === '>' ? '' : ''))) {
      let d = 0;
      for (let i = bi; i < expr.length; i++) { if (expr[i] === '{') d++; else if (expr[i] === '}' && --d === 0) return expr.slice(0, i + 1); }
    }
    const arrow = /^(\([^)]*\)|\w+)\s*=>\s*[^;{]+/.exec(expr);
    if (arrow) return arrow[0];
    if (/^(async\s+)?function/.test(expr)) {                 // fallback: balance from the body brace
      const b = expr.indexOf('{'); let d = 0;
      for (let i = b; i < expr.length; i++) { if (expr[i] === '{') d++; else if (expr[i] === '}' && --d === 0) return expr.slice(0, i + 1); }
    }
    return expr.split(';')[0];
  };
  return async (name, ctx = {}) => {
    const q = ctx.hint || name;
    const searched = await fetchText(`${registry}/-/v1/search?text=${encodeURIComponent(q)}&size=10`);
    const objects = JSON.parse(searched).objects ?? [];
    const pkg = objects.map((o) => o.package).filter((p) => p && !p.name.startsWith('@'))
      .sort((a, b) => score(b.name, q) - score(a.name, q))[0];
    if (!pkg) return null;
    const file = pkg.module || pkg.main || 'index.js';
    const url = `${cdn}/${pkg.name}@${pkg.version}/${file}`;
    const impl = takeExpr(await fetchText(url));
    if (!impl) return null;
    return { code: `const ${name} = ${impl};`, source: url, pkg: `${pkg.name}@${pkg.version}` };
  };
};
