// EO: SEG·CON·SYN·EVA(Void,Network → Network,Lens, Dissecting,Binding,Composing,Tracing) — barrel + readCodebase
// The code organ — ingests code, converts it to EOT, finds issues natively from the
// dependency order.
//
// Three movements, each a leaf of this holon, composed here:
//
//   facts.js    the structural reading (the parser membrane) — source → code facts;
//               a grammar-tree provider (tree-sitter WASM, Lezer) slots in via
//               registerExtractor without touching anything downstream
//   eot.js      the lowering — facts → the EOT code dialect, re-parsed through the
//               ONE ingester (organs/ingest/eot.js) into the engine's own log,
//               perceiver door (source read from disk is the world, it witnesses)
//   helix.js    the dependency order — the helix at corpus grain: Tarjan over the
//               `mod -> mod : imports` bonds; cycles are where no order exists
//   issues.js   the fold — judgments read NATIVELY off the tuples, walked in that
//               order: use-before-INS, threads into the Void, fabrication from an
//               unbound thread, writes outside a binding's contract, dead entities;
//               rendered back out as `!eva` lines through the enactor door
//
// readCodebase(files, opts) is the organ's one mouth (read.js): files are
// [{ path, text }] — the organ never touches a filesystem; hosts feed it.
//
//   const { issues, report, eotText, order, doc } = readCodebase([
//     { path: 'src/a.js', text: '…' },
//     { path: 'src/b.js', text: '…' },
//   ]);
//
// opts: { closedWorld, entries, globals, docId, agent, doc:false to skip the log }
// mergeIssues(files, opts) folds the fixable findings into the PRESERVED originals
// and re-reads to verify (fix.js) — the fixer and the barrel both stand on read.js,
// which this organ's own no-order law demanded (it caught the cycle in its own PR).

export { readCodebase } from './read.js';
export { extractFacts, registerExtractor, extractorFor, seg, nameSeg, modSeg, resolveSpec, scrub } from './facts.js';
export { extractPyFacts, PY_BUILTINS, pyScrub } from './python.js';
export { eotOfModule, lowerCorpus, codeDoc, parseSign, declSign, scopeSign, useSign } from './eot.js';
export { dependencyOrder, moduleGraphOf, tarjanSCC, helixRank, HELIX } from './helix.js';
export { findIssues, issuesToEot, reportText, DEFAULT_GLOBALS, SEVERITIES } from './issues.js';
export { mergeIssues, FIXABLE_LAWS } from './fix.js';
