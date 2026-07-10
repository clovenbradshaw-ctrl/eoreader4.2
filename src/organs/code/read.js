// EO: SEG·CON·SYN·EVA(Void,Network → Network,Lens, Dissecting,Binding,Composing,Tracing) — readCodebase
// The organ's one mouth — files → facts → EOT → order → judgments, composed.
//
// A leaf both the barrel and the merge stand on (fix.js re-reads through this after
// folding fixes in; importing it from the barrel would close a cycle — which this
// organ's own no-order law caught in its own PR. The body must pass its own reading.)
//
// readCodebase(files, opts) — files are [{ path, text }]; the organ never touches a
// filesystem (hosts feed it, like every other organ).
// opts: { closedWorld, entries, globals, docId, agent, doc:false to skip the log }

import { extractorFor } from './facts.js';
import './python.js';                       // mounts the Python provider on the membrane
import './go.js';                           // …and Go
import './rust.js';                         // …and Rust
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
