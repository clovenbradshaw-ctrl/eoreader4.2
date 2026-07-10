// EO: CON·SIG(Network,Field → Link, Binding,Tending) — the surface↔engine membrane
// The reader room's boot module — the one seam between the dc surface (index.html)
// and the engine holons. The surface renders; the engine reads, grounds, and
// remembers. Everything the surface may call is exposed here as window.EO, so the
// dc script never imports engine internals (one entrance per holon, one membrane
// for the surface).
//
// What is wired (all live — the seeds are gone):
//   app         the reader session controller (rooms/reader/app.js): the
//               S-registry, topics, ingest (URL/search/file/paste), the chat
//               turn through turn/runTurn, entities, findings, provenance
//   parse       text → the append-only event log + doc     (perceiver)
//   readingAt   L3 reading at a cursor (γ-mass + surprise)  (perceiver)
//   groundSpans span → source-line provenance + badge       (enactor/ground)
//   factCheck   claim edges vs the document's reading       (enactor/factcheck)
//   dag         discourse vs asserted causal cursors        (surfer/dag)
//   audit       the ring buffer the monologue drawer reads  (rooms/audit)
//   workspace   folders/pins persistence                    (rooms/workspace)
//   mountTieredGraph  the entity explorer's web graph       (rooms/reader)

import { createParser } from '../../perceiver/parse/index.js';
import { readingAt } from '../../perceiver/reading.js';
import { groundSpans, groundSummary, supportVerdict } from '../../enactor/ground/spans.js';
import { factCheck } from '../../enactor/factcheck/index.js';
import { discourseDag, assertedDag } from '../../surfer/dag/index.js';
import { createAuditLog } from '../audit/index.js';
import * as workspace from '../workspace/index.js';
import { createReaderApp } from './app.js';
import { mountTieredGraph } from './tiered-graph.js';

const audit = createAuditLog({ capacity: 512 });
const app = createReaderApp({ audit });

const parse = (text, opts = {}) => {
  const parser = createParser(opts);
  return parser.parse(String(text ?? ''));
};

window.EO = Object.freeze({
  app,
  parse,
  readingAt,
  groundSpans, groundSummary, supportVerdict,
  factCheck,
  discourseDag, assertedDag,
  audit,
  workspace,
  mountTieredGraph,
  version: '4.2',
});

console.info('[EO] engine bridge up — window.EO', Object.keys(window.EO));
