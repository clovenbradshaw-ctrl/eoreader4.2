# The code organ — code → EOT → issues from the dependency order

`src/organs/code/` ingests source code, converts it to EOT — the same surface
every other reading lowers through — and finds issues in it **natively from the
dependency order**: not an AST linter bolted on the side, but a fold over the EO
event stream, walked in the order the helix derives, reading each issue off the
EO law the codebase's own record violates.

> The append-only event log is the source of truth.
> A codebase is one more thing the engine can read into it.

## The three movements

```
files [{path, text}]
  │  facts.js    the structural reading (the parser membrane)
  ▼
code facts       modules · scopes · declarations · imports/exports · references
  │  eot.js      the lowering — facts → the EOT code dialect
  ▼
EOT surface      re-parses through organs/ingest/eot.js, zero diagnostics
  │  helix.js    the dependency order — Tarjan over `mod -> mod : imports`
  ▼
order + cycles   dependencies first; a cycle = the order does not exist
  │  issues.js   the fold — judgments read off the tuples, in that order
  ▼
findings         + issuesToEot: the report itself is EOT (enactor door)
```

One mouth: `readCodebase(files, opts)` in `index.js` returns
`{ factsList, eotText, events, order, issues, issuesEot, report, doc }`.
The organ never touches a filesystem — hosts feed it, like every other organ.

## Why EOT and not a bespoke AST

The engine already knows how to read EOT: anchors minted, the log appended, the
graph projected, the reading attached (`organs/in/code.js` set the precedent at
single-file grain). By lowering to the shared medium, the ISSUE FOLD reads only
the parsed tuples — never the extractor's internals — so any producer of the
dialect (another language's extractor, a grammar-tree provider) inherits the
laws for free. The corpus doc lands on the engine log through the **perceiver
door**: source read from disk is the world, exafference, it can witness. The
findings leave through the **enactor door**: the organ's own judgment,
reafference, each `!eva` line citing the perceiver-door sign it judges. Nothing
is asserted that the record can't witness.

## The sign grammar

Identity is structured into the sign, EOT-alphabet-clean, so a reference is ONE
line and the fold compares positions without side tables:

```
mod:src-organs-code-facts                the module (its path, folded)
sc:<M>:s3:fn                             a scope (module|fn|block|class|catch)
dcl:<M>:L41:c11:band_                    a binding (IS-A: Const|Let|Var|Function|
                                         Class|Param|Import)
ex:<M>:uno                               an export
use|asg|upd|tst:<M>:L30:c35:band         a reference site (read | write |
                                         read-write | typeof-guarded)
```

Scopes are carved by SEG (`!seg parent | child`); declarations INS and CON
`in` their scope; references CON `within` theirs; module bonds are
`mod:A -> mod:B : imports` — the DAG the order reads.

## The laws — issues as EO violations

| law | severity | the violation |
|---|---|---|
| `no-order` | warn | the import graph has a strongly-connected component — the helix cannot linearize it; no dependency order exists |
| `dependency` | error | a CON fired before the INS it bonds to — a use precedes its const/let/class in the same scope-instance (TDZ) |
| `void-binding` | error | an import thread asks a module for a name it never exports — a thread into the Void (legal to *hold*) |
| `fabrication` | error | a USE of that unbound thread — you may dwell in the Void, you may never fabricate from it |
| `unbound` | error | a reference no scope, no import, and no known global ever binds |
| `contract-violation` | error | a write to a Const or an Import binding — an op outside the binding's declared width (a const IS a narrow contract) |
| `collision` | error | two declarations claim one name in one scope — INS over INS with no SEG between |
| `cycle-tdz` | warn | a top-level read of a binding that crosses a cycle — the one place ESM hoisting can still read an unfilled slot |
| `dead-entity` | note | a binding never read — an INS no CON ever witnesses |
| `dwell` | note | an import held but never drawn on — legal dwelling |
| `dead-export` | note | closed world only: an export no importer binds |
| `medium` | error | a lowered line failed to re-parse — never silent |

"Natively from the dependency order" is load-bearing twice. The order is
**required**: export tables and cross-module binding checks assume a module's
dependencies are already folded (Tarjan emits components dependencies-first,
which IS the walk). And the order is **read**: where it does not exist — a
cycle — that absence is itself the first finding, and the walk's TDZ hazards
(`cycle-tdz`) fall out of exactly the members the order could not separate.

The legal twins are pinned by tests: hoisted functions before their line,
closures over later declarations, `typeof`-guarded probes, `var`+`var`,
`_`-prefixed bindings, rest-omission siblings (`const { drop, ...rest } = x`),
unused params — none of these fire.

## The parser membrane

`facts.js` is the swappable leaf. The built-in extractor is a hand-rolled
STRUCTURAL reader for JavaScript / ES modules (the engine's own language — the
body must be able to read itself): a comment/string/template/regex-aware scrub,
a brace-derived scope tree with virtual scopes for expression arrows and
brace-less `for` bodies, and statement-shape scans. Structure, not color.

Grammar-tree parsers are the other lineage — tree-sitter (incremental GLR,
compiled to WASM, hundreds of language grammars) or Lezer (CodeMirror's
browser-native incremental parser) produce real syntax trees. One mounts here
by producing the same fact shape via `registerExtractor(lang, fn)`; the
lowering, the order, and the laws never change. The built-in stays the
zero-dependency default so the organ runs everywhere the engine runs (browser +
node, no build step).

Known limits of the built-in, documented not silent: no JSX; labels are skipped;
object-vs-block `{` is decided by the preceding token; `eval` and dynamic
property access are invisible, as they are to any static reading.

## The self-read

`tests/code-organ.test.js` closes the loop the repo has been circling since
`docs/self-read-weld-measurement.md`: the organ reads the engine's own body.
The whole of `src/` (460 files, ~156k EOT lines) folds in ~3s with **zero
error-grade findings**, three real import cycles surfaced as `no-order` warns
(enact⇄perceiver⇄converse, factcheck⇄props, dag surface⇄index), and a few
dozen genuine `dwell`/`dead-entity` notes. During its own construction the
organ caught a dead `const { line, col }` its author had just orphaned in
`facts.js` — the first issue it ever found was in itself.

## The membrane across four languages

`facts.js` (JS/TS), `python.js`, `go.js`, `rust.js` — each mounts via
`registerExtractor` and emits the same fact shape. JS and Python carry full
structural readings *and* witnessed hazards; Go and Rust are **hazard-only**
providers (the behavioral tier their compilers wave through — races, aliasing,
panics, float identity — without full binding analysis, because `go build` and
`rustc` already do binding). Every hazard is an EO reading: a Go data race is a
SYN with no boundary, a nil-map write an INS into a Field never made, Rust's
`== <float>` the void-identity law ported.

On the uploaded multi-language benchmark (`tests/fixtures/multilang/`, three
buggy/clean pairs, six idiomatic defects each, all compiling clean):

| language | planted | flagged | clean-twin false positives |
|---|---|---|---|
| JavaScript | 6 | 6 | 0 |
| Go | 6 | 6 | 0 |
| Rust | 6 | 6 | 0 |
| **total** | **18** | **18** | **0** |

The benchmark's own tool floor: `go vet` catches 1 of 6 Go defects, `rustc` and
`node --check` catch 0 — **1 of 18**. Tuning honesty: the JS hazards were caught
over-firing on the engine's *own* code during the self-read (`i <= x.length`
loops that never index at the bound, bare `JSON.parse`), and were tightened
(require `arr[i]` in the body) and down-graded (`unguarded-parse` is a warn, a
smell not a proven bug) until the engine reads error-clean — the self-read is the
regression gate for the detector's precision.

## The membrane, proven — Python

`python.js` is the second provider, mounted with `registerExtractor('python', …)`:
an indentation-scoped structural reading (Python is line-regular where JS is
brace-regular; only def/class carve binding scopes; a name binds on its FIRST
binding per scope, so legal rebinding never trips the collision law, while a
module-level use before the first binding is the real NameError and a def-local
read before the first write is the real UnboundLocalError — Python's TDZ). It
emits the same fact shape, lowers through the same medium, and every law
downstream runs unchanged.

It also WITNESSES six behavioral shapes — hazards, each with an EO reading:
`bare-except` (a SEG with no key), `shared-default` (a def-time Pattern-grain INS
read as a per-call Figure: grain-mixed), `tail-drop` (a partition that provably
excludes its tail), `unbounded-resource` (an INS whose clearing binds to no
boundary), `dangling-task` (an INS no CON ever witnesses — the dead-entity law at
expression grain), `void-identity` (`== float("nan")` — an EVA that can never
bind). A hazard is witnessed structure (perceiver door); the judgment is the
fold's.

**The benchmark** (`tests/fixtures/`): a 298-line pipeline with six planted
behavioral defects and a line-parallel clean twin. The organ scores it exactly —
all six at the manifest's own lines, zero error/warn on the clean twin, and the
only buggy-only notes are the two shadows the manifest itself describes (`math`
imported but never drawn on; `last_exc` assigned but never raised).

## The merge — fixes into the preserved original

The medium was never lossy: the organ holds the SOURCE beside the reading, the
way an eotDoc keeps its sentences. So `fix.js` does not decompile tuples — it
RECs the preserved original at the sites the findings witness, then runs the
checkpoint the helix demands: **re-read the merged corpus and require the mended
laws gone.** `mergeIssues(files)` returns the new texts, the applied/skipped log,
and the before/after verdicts of the organ's own re-read.

On the benchmark: all six fold in (`except Exception:`, the `is None` guard,
`range(len(x))`, `with open(…) as fh:` with the block re-bound, `await`, and
`math.isnan` — inserting `import math` when the thread wouldn't bind), the
re-read comes back clean of every mended law, and the merged file passes
`python3 -m py_compile`. What stays a report stays a report: raising `last_exc`,
narrowing `Exception`, choosing `gather` over serial awaits — semantic calls,
flagged and left to the human.

## The generative direction — NL → EOT → code that works

The reading direction is code → EOT → issues. `compose.js` is its inverse at the
**structural** grain: a program **blueprint** written in the same EOT the engine
speaks → a real ES module, emitted in dependency order, then **read back by the
organ and gated before anyone runs it**. The generator cannot emit code that
breaks the dependency laws without its own reader (the fold) flagging it — the
`!EVA` checkpoint of `eo-for-coders.md`, run backwards. perceive → surf → enact,
closed on itself.

**The boundary, stated honestly.** EOT carries a program's *structure* — which
functions and constants exist, their signatures, the call graph, the emit order,
the steps a body folds through, what is exported. It does **not** carry the leaf
expressions; those are the irreducible content the natural-language spec provides
(a model's job — structured translation is what LLMs are good at). The composer
*places, wires, orders, and validates* the leaves; it does not invent them. This
is the EO-for-coders thesis at code grain: compose contracted structure in
dependency order; don't fabricate the leaves.

```
natural language
  │  a model fills the blueprint form (blueprintPrompt / composeFromModel — the seam)
  ▼
EOT blueprint          add : Function · add.expr = "a + b" · !sig add : exported …
  │  composeProgram — emit order INFERRED from the leaf code (the reader's own scrubber)
  ▼
ES module              const add = …; export const … — dependencies first
  │  composeAndVerify — readCodebase over the OUTPUT (the checkpoint)
  ▼
{ ok, findings }       ok ⟺ no error-grade finding — else it is not run
  │  import() + call
  ▼
correct output         proven by execution, not asserted
```

The loop runs for real in `tests/code-compose.test.js`: factorial (self-recursion),
fizzbuzz (a helper emitted before its caller — order inferred), sum-of-even-squares
(a dataflow body whose `const` steps order by reference), a load-time greeting (a
module const whose function is ordered ahead of it), mutually-recursive even/odd
(Tarjan keeps the pair), and average = sum/count. Each is **emitted, gated by the
organ, imported, and called** — the assertion is the runtime answer. A blueprint
that calls an undefined helper is **rejected by the organ before it runs** (the
checkpoint), and the emitted call graph, read back through the analyzer, matches
the blueprint's intent (the structure survives NL → EOT → code → read-back).

The one arrow that needs a model — NL → blueprint — is a named seam
(`blueprintPrompt`, `composeFromModel`), versioned with the grammar it teaches, so
any `model/` backend plugs in; everything downstream is deterministic and tested.

## The widget target — a full HTML widget from a blueprint

`widget.js` emits the generative direction at UI grain: an EOT widget blueprint
(state, template with `{{slot}}` interpolation and `data-on="event:handler"`
bindings, styles, handler bodies) → one complete, self-contained HTML document
with a ~15-line inlined reactive shell — no build, no dependency. The behavior is
real JS, emitted in dependency order and **read back through the organ**: a
template slot referencing a field the state never declares becomes an unbound
reference in the render scope, caught before the widget is trusted. Proven two
ways: a DOM-stub test drives render + clicks (`tests/code-widget.test.js`), and
the emitted HTML renders and responds in real Chromium (the counter goes
0 → 3 → 2 → 0 through actual clicks, zero console errors). `composeWidgetFromModel`
wires the NL → blueprint arrow to the engine's own **local** backends
(`model/webllm.js`, `model/wllama.js`) — the whole loop runs on the user's
machine, no network.

## The harvest — the model holds method, not facts

`harvest.js` is the deepest turn of the thesis: **a model need not hold in its
weights how to build anything.** It supplies STRUCTURE — a seed that names the
pieces it needs — and the knowledge is fetched on demand. The loop is not "fill
the holes from memory"; it is the organ's own `unbound` findings naming exactly
what is still missing, and a retriever fetching precisely those names, round
after round, until the record closes. When a fetched piece itself references
something unbound, that becomes the next round's search — the dependency chain
resolves itself, gap by witnessed gap. Every fetched piece comes through the
**perceiver door**, so the assembled program carries a **provenance trail**:
which line came from which URL, cited like any reading.

Proven live: a seed referencing `escapeRegexp` drove a real npm search,
`escape-string-regexp@5.0.0` was fetched from unpkg, the organ confirmed the gap
closed, and the assembled program ran correctly. The retriever is injected (pure
organ, injected world) — `createWebRetriever` is the live npm/unpkg path;
`tests/code-harvest.test.js` injects a fixed corpus with a dependency chain.

**An honest boundary this surfaced.** The organ validates the *dependency laws*
(bindings, order, cycles), **not syntax** — a truncated fetched function has no
unbound name yet will not parse. So `harvestProgram` takes an injectable
`verify` gate (the syntax/run check the organ deliberately is not): `ok` requires
organ-clean AND parses AND, ultimately, runs. "The organ passed it" is necessary,
not sufficient; the runtime is the final arbiter.

## Run it

```js
import { readCodebase } from './src/organs/code/index.js';

const { report, issues, eotText, issuesEot, order, doc } = readCodebase(
  [{ path: 'src/a.js', text }, { path: 'src/b.js', text: textB }],
  { closedWorld: true, entries: ['src/a.js'], globals: ['MY_GLOBAL'] },
);

console.log(report);        // error src/a.js:3:9 · void-binding — …
console.log(issuesEot);     // !eva dcl:src-a:L3:c9:x : held -> unbound @organ:code …
doc.projectGraph({});       // the corpus as a traversable EO graph
```

The EOT of the codebase (`eotText`) and the EOT of the judgments (`issuesEot`)
both re-parse through `parseEOT` with zero diagnostics. Auditable means
re-runnable.
