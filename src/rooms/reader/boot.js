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
//   matrix      OPTIONAL Matrix account login (rooms/archive/matrix) — signed-out
//               the reader is whole; signing in only unlocks the permanent archive
//   archive     authenticated deposit to Archive.org via the Matrix-gated webhook
//               (rooms/archive/deposit), bound to the matrix session's token

import { createParser } from '../../perceiver/parse/index.js';
import { readingAt } from '../../perceiver/reading.js';
import { groundSpans, groundSummary, supportVerdict } from '../../enactor/ground/spans.js';
import { factCheck } from '../../enactor/factcheck/index.js';
import { discourseDag, assertedDag } from '../../surfer/dag/index.js';
import { createAuditLog } from '../audit/index.js';
import * as workspace from '../workspace/index.js';
import { createReaderApp } from './app.js';
import { APP_NAME, APP_VERSION } from './provenance.js';
import { mountTieredGraph } from './tiered-graph.js';
import * as readerRender from './reader-render.js';
import { createMatrixSession } from '../archive/matrix.js';
import { depositToArchive, missingConsent, archiveMediatype, REQUIRED_CONSENT, KINDS, ARCHIVE_CASES_WEBHOOK } from '../archive/deposit.js';
import { createCheckpointLog, checkpointId } from '../archive/checkpoints.js';
import { createGenomeAutosave } from '../archive/autosave.js';
import { loadVersions, rollbackUrl, GITHACK_HOST } from './versions.js';

const audit = createAuditLog({ capacity: 512 });
const app = createReaderApp({ audit });

// The optional identity. Restores a persisted session from localStorage without a
// network hit (signed-in survives reload and works offline), then revalidates the
// token against the homeserver in the background — a definitive 401 signs you out,
// a network fault is left alone.
const matrix = createMatrixSession();
matrix.restoreAndRevalidate().catch(() => { /* stays signed-out */ });

const parse = (text, opts = {}) => {
  const parser = createParser(opts);
  return parser.parse(String(text ?? ''));
};

// The local checkpoint ledger — the index of what's been archived, so the surface can
// list and re-open permanent items without a round-trip, and so a repeat deposit of
// the same content is short-circuited (no duplicate item on archive.org).
const checkpoints = createCheckpointLog();

// The archive membrane the surface calls: deposit is pre-bound to the live matrix
// session AND the checkpoint ledger, so the surface never handles the token itself
// and never has to dedup — it just supplies the bytes, the kind, and the consent
// acknowledgements, and gets back a permanent, content-addressed checkpoint.
const deposit = (opts = {}) => depositToArchive({ session: matrix, ledger: checkpoints, ...opts });
const archive = Object.freeze({
  deposit,
  checkpoints: () => checkpoints.list(),
  checkpointId,
  missingConsent, archiveMediatype,
  REQUIRED_CONSENT, KINDS, endpoint: ARCHIVE_CASES_WEBHOOK,
});

// "Save system genome online?" — one quiet, opt-in setting. OFF by default; it never
// prompts. When on and signed in, the whole genome is checkpointed on change,
// debounced and deduped, silently in the background. Subscribes itself to record and
// session changes at construction.
const genome = createGenomeAutosave({ app, matrix, deposit });

// The version time-machine the surface's Settings panel calls. Every merge to `main` is a deployed
// GitHub Pages build, so the merged-PR history is the published-build history; `load()` lists them
// (best-effort over the public GitHub API) and each carries a raw.githack.com URL that re-opens that
// exact build. `currentCommit` comes from the deployed version.json the app already caches, so the
// panel can mark which prior PR is live now. Fail-soft: no network / rate-limit ⇒ a worded empty list.
const versions = Object.freeze({
  host: GITHACK_HOST,
  rollbackUrl,
  load: () => loadVersions({
    fetch: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null,
    location: typeof location !== 'undefined' ? location : null,
    currentCommit: (() => { try { return app.provenance().build?.commit || null; } catch { return null; } })(),
  }),
});

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
  readerRender,   // source→book reader + native-page render, for the source viewer's tabs
  matrix,
  archive,
  genome,
  versions,       // the version time-machine — list prior merged-PR builds, roll back to any
  app_name: APP_NAME,
  version: APP_VERSION,
});

console.info('[EO] engine bridge up — window.EO', Object.keys(window.EO));
