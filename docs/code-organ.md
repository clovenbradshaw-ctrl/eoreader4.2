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
