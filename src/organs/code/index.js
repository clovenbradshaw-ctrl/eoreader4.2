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
// readCodebase(files, opts) is the organ's one mouth: files are [{ path, text }]
// (the organ never touches a filesystem — hosts feed it, like every other organ).
//
//   const { issues, report, eotText, order, doc } = readCodebase([
//     { path: 'src/a.js', text: '…' },
//     { path: 'src/b.js', text: '…' },
//   ]);
//
// opts: { closedWorld, entries, globals, docId, agent, doc:false to skip the log }

import { extractorFor } from './facts.js';
import { lowerCorpus, codeDoc } from './eot.js';
import { dependencyOrder } from './helix.js';
import { findIssues, issuesToEot, reportText } from './issues.js';
import { parseEOT } from '../ingest/eot.js';

export const readCodebase = (files, opts = {}) => {
  const factsList = (files ?? []).map((f) =>
    extractorFor(f.path)(f.text, { path: f.path ?? null }));
  const { eotText } = lowerCorpus(factsList);
  const parsed = parseEOT(eotText, { frame: 'code', door: 'perceiver', agent: opts.agent || 'organ:code' });
  const order = dependencyOrder(parsed.events);
  const issues = findIssues(parsed.events, order, { ...opts, diagnostics: parsed.diagnostics });
  return Object.freeze({
    factsList,
    eotText,
    events: parsed.events,
    order,
    issues,
    issuesEot: issuesToEot(issues, { agent: opts.agent || 'organ:code' }),
    report: reportText(issues),
    doc: opts.doc === false ? null : codeDoc(factsList, opts),
  });
};

export { extractFacts, registerExtractor, extractorFor, seg, modSeg, resolveSpec, scrub } from './facts.js';
export { eotOfModule, lowerCorpus, codeDoc, parseSign, declSign, scopeSign, useSign } from './eot.js';
export { dependencyOrder, moduleGraphOf, tarjanSCC, helixRank, HELIX } from './helix.js';
export { findIssues, issuesToEot, reportText, DEFAULT_GLOBALS, SEVERITIES } from './issues.js';
