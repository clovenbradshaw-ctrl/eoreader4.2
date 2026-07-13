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
//   mountDagSurface   the two-cursor causal DAG surface       (surfer/dag) —
//               topic-wide + per-entity focus, with entity on/off toggles
//   matrix      OPTIONAL Matrix account login (rooms/archive/matrix) — signed-out
//               the reader is whole; signing in only unlocks the permanent archive
//   archive     authenticated deposit to Archive.org via the Matrix-gated webhook
//               (rooms/archive/deposit), bound to the matrix session's token
//   chat        OPTIONAL end-to-end-encrypted chat (rooms/chat) — reuses the matrix
//               identity, libolm crypto, keys pickled to OPFS; lazily started when
//               the floating launcher is opened (docs/element-e2ee.md)
//   vault       OPTIONAL encrypted, hash-chained media store (rooms/archive/vault) —
//               encrypts each item, uploads only ciphertext to the homeserver media
//               repo, records a tamper-evident block in an OPFS chain (docs/media-vault.md)

import { createParser } from '../../perceiver/parse/index.js';
import { readingAt } from '../../perceiver/reading.js';
import { groundSpans, groundSummary, supportVerdict } from '../../enactor/ground/spans.js';
import { factCheck } from '../../enactor/factcheck/index.js';
import { discourseDag, assertedDag, mountDagSurface, dagNodeLabel } from '../../surfer/dag/index.js';
import { createAuditLog } from '../audit/index.js';
import { createMurmur } from '../../murmur/index.js';
import * as workspace from '../workspace/index.js';
import { createReaderApp } from './app.js';
import { APP_NAME, APP_VERSION } from './provenance.js';
import { mountTieredGraph } from './tiered-graph.js';
import * as readerRender from './reader-render.js';
import * as reveal from './reveal.js';
import { firstSurfaceKind } from './first-surface.js';
import { projectTranscript, wordsToText } from './transcript-edit.js';
import { encodeWav, applyRedactions } from './audio-dsp.js';
import { createMatrixSession } from '../archive/matrix.js';
import { depositToArchive, missingConsent, archiveMediatype, REQUIRED_CONSENT, KINDS, ARCHIVE_CASES_WEBHOOK } from '../archive/deposit.js';
import { createCheckpointLog, checkpointId } from '../archive/checkpoints.js';
import { createGenomeAutosave } from '../archive/autosave.js';
import { createChatRoom } from '../chat/index.js';
import { mountChat, mountChatLauncher } from '../chat/mount.js';
import { createVault } from '../archive/vault.js';
import { mountVaultLauncher } from '../archive/vault-mount.js';
import { loadVersions, rollbackUrl, GITHACK_HOST } from './versions.js';
import { mountConsole } from './console-surface.js';

const audit = createAuditLog({ capacity: 200 });   // deep enough to audit a session; the ring's bytes, not its count, were the cost
// The peripheral sense (src/murmur, docs/murmur.md) — a continuously-running, near-zero-cost
// background faculty that watches the same fold geometry the turn emits and raises IMPRESSIONS
// (drift · surprise · unease · recognition), decaying and anti-ruminating. It is AUDIT-ONLY by
// construction (the §9 membrane keeps canAppendLog false): it POINTS, the enactor VERIFIES — an
// impression can never become a citable fact. The surface WATCHES it (window.EO.murmur.subscribe)
// to paint the real-time murmur strip; the app feeds it one fold snapshot per turn (app.js).
const murmur = createMurmur({ audit });
const app = createReaderApp({ audit, murmur });

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

// The E2EE chat room — an OPTIONAL, lazily-started companion to the reader. It reuses
// the SAME Matrix identity as the archive (no second login) and only comes alive when
// the user opens it, at which point libolm (vendored at vendor/olm, loaded by the
// <script> tag in index.html as window.Olm) is initialised and the sync loop starts.
// Everything the E2EE keystore needs is persisted to OPFS (rooms/chat/opfs-store).
let chatController = null;
const chat = {
  get controller() { return chatController; },
  // Start (or resume) the chat session, initialising libolm on first call. Returns
  // { ok, error? } — never throws — so the launcher can show a reason on failure.
  async start() {
    const Olm = (typeof window !== 'undefined' && window.Olm) || null;
    if (!Olm) return { ok: false, error: 'encryption library not loaded' };
    try { await Olm.init(); } catch { return { ok: false, error: 'could not initialise encryption' }; }
    if (!chatController) chatController = createChatRoom({ matrix, Olm });
    return chatController.start();
  },
  stop() { if (chatController) chatController.stop(); },
  // Mount the chat UI into an element the surface controls (an alternative to the
  // floating launcher, if the dc surface later hosts chat in a screen of its own).
  mount(el) { return chatController ? mountChat(el, chatController) : (() => {}); },
};

// The encrypted, hash-chained media vault (rooms/archive/vault). Reuses the SAME
// Matrix identity as the archive/chat, encrypts each item with a per-file key
// (Web Crypto), stores only the ciphertext in the homeserver media repo, and records
// a tamper-evident block (content address + mxc + key) in an OPFS-persisted chain.
// Signed-out it is inert; `save`/`open`/`verify` lazily start it. See docs/media-vault.md.
const vault = createVault({ matrix });
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
  discourseDag, assertedDag, dagNodeLabel,
  audit,
  murmur,   // the peripheral sense — the surface subscribes for the real-time murmur strip (audit-only)
  workspace,
  mountTieredGraph,
  mountDagSurface,   // the two-cursor causal DAG surface (surfer/dag) — topic-wide + per-entity, with toggles
  readerRender,   // source→book reader + native-page render, for the source viewer's tabs
  reveal,   // the chat typewriter's pace (bounded catch-up) — pure, so the freeze regression is CI-tested
  firstSurfaceKind,   // which surface a fresh import opens first (causal DAG / entity web) — pure, CI-tested
  projectTranscript, wordsToText,   // the interactive transcript fold (baseline + edits/redactions → live reading)
  encodeWav, applyRedactions,       // audio DSP for the Listen surface's redaction re-synthesis + WAV export

  matrix,
  chat,
  vault,
  archive,
  genome,
  versions,       // the version time-machine — list prior merged-PR builds, roll back to any
  app_name: APP_NAME,
  version: APP_VERSION,
});

console.info('[EO] engine bridge up — window.EO', Object.keys(window.EO));

// Drop the floating E2EE-chat launcher into the page. It stays hidden until a Matrix
// session is live (reusing the archive login) and never touches the reader surface.
try { if (typeof document !== 'undefined') mountChatLauncher(document.body, { chat, matrix }); }
catch (e) { console.warn('[EO] chat launcher not mounted', e); }

// …and the encrypted-vault launcher, gated the same way (sits just above the chat FAB).
try { if (typeof document !== 'undefined') mountVaultLauncher(document.body, { vault, matrix }); }
catch (e) { console.warn('[EO] vault launcher not mounted', e); }

// …and the audit console — a bottom-docked developer terminal that streams, live,
// every turn stage, session event, engine log, and stall, tapping ONLY this membrane
// (audit + app + console.*). Its own no-progress detector mirrors the engine's stall
// watchdog in the surface, so a freeze like the essay hang is visible as it happens.
try { if (typeof document !== 'undefined') mountConsole(document.body, { audit, app, appName: APP_NAME, version: APP_VERSION }); }
catch (e) { console.warn('[EO] console not mounted', e); }
