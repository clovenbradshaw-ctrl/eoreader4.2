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
//   db          the durable substrate + database engine (src/store) — "rooms are
//               tables, events are rows, fold is the query". A passphrase vault seals
//               each room's append-only event log as encrypted OPFS bytes (NOT
//               IndexedDB); locked it is inert, unlocked it rehydrates + persists.
//               db.rows/buildTable/query/formula give the spreadsheet-database view
//               (docs/database-framework.md)
//   spaces      OPTIONAL SHARED vault + collaborative workspaces (rooms/archive/room-vault)
//               — a workspace becomes an invitable Matrix room; everything saved into it
//               is encrypted, stored as binary ciphertext in the media repo, and recorded
//               as a hash-linked block published as a Megolm room event, so only the room's
//               members can read it. `spaces.sync` (rooms/archive/space-sync) is the opt-in
//               "sync to Matrix" that mirrors a workspace's sources into it. Rides the chat
//               bus (docs/shared-vault.md)

import { createParser } from '../../perceiver/parse/index.js';
import { contractOf } from '../../core/contracts.js';
import { notate } from '../../core/index.js';
import { readingAt } from '../../perceiver/index.js';
import { groundSpans, groundSummary, supportVerdict } from '../../enactor/ground/index.js';
import { factCheck } from '../../enactor/factcheck/index.js';
import { discourseDag, assertedDag, mountDagSurface, dagNodeLabel } from '../../surfer/dag/index.js';
import { createAuditLog } from '../audit/index.js';
import { createEotLedger, mountEotTerminal } from '../audit/index.js';
import { createMurmur } from '../../murmur/index.js';
import * as workspace from '../workspace/index.js';
import { createReaderApp } from './app.js';
import { wireEotFeed } from './eot-feed.js';
import { APP_NAME, APP_VERSION } from './provenance.js';
import { mountTieredGraph } from './tiered-graph.js';
import { mountFacingRenderer, assembleDocument, splitSource, runnableSrcdoc } from '../render/index.js';
import * as readerRender from './reader-render.js';
import * as reveal from './reveal.js';
import { firstSurfaceKind } from './first-surface.js';
import { projectTranscript, wordsToText } from './transcript-edit.js';
import { encodeWav, applyRedactions } from './audio-dsp.js';
import {
  createMatrixSession, depositToArchive, missingConsent, archiveMediatype,
  REQUIRED_CONSENT, KINDS, ARCHIVE_CASES_WEBHOOK, createCheckpointLog,
  checkpointId, createGenomeAutosave, createVault, createRoomVault,
  createSpaceSync, mountVaultLauncher,
} from '../archive/index.js';
import { createChatRoom, mountChat, mountChatLauncher } from '../chat/index.js';
import { createDatabase } from '../../store/index.js';
import { loadVersions, rollbackUrl, GITHACK_HOST } from './versions.js';
import { mountConsole } from './console-surface.js';
import { mountBinvis } from './binvis-surface.js';
import { mountPdfView } from './pdf-view-surface.js';
import { mountResearchReview } from './research-review-surface.js';
import * as binvis from '../../surfaces/binvis/index.js';
import { createPipelineSurface } from './pipeline-surface.js';
import * as evidence from './evidence.js';
const audit = createAuditLog({ capacity: 200 });   // deep enough to audit a session; the ring's bytes, not its count, were the cost
// The peripheral sense (src/murmur, docs/murmur.md) — a continuously-running, near-zero-cost
// background faculty that watches the same fold geometry the turn emits and raises IMPRESSIONS
// (drift · surprise · unease · recognition), decaying and anti-ruminating. It is AUDIT-ONLY by
// construction (the §9 membrane keeps canAppendLog false): it POINTS, the enactor VERIFIES — an
// impression can never become a citable fact. The surface WATCHES it (window.EO.murmur.subscribe)
// to paint the real-time murmur strip; the app feeds it one fold snapshot per turn (app.js).
const murmur = createMurmur({ audit });
const app = createReaderApp({ audit, murmur });

// The EOT ledger (docs/eot-ledger.md) — the audit at a second grain: an append-only
// ring of EVERY operation the app performs, each read out as one EOT surface line with
// its door (perceiver = the world it read · enactor = the model's own act). The feed
// translator (eot-feed.js) wires the three live streams the reader ALREADY emits — the
// activity log, the per-turn audit trail, and the murmur side-channel — onto the
// ledger's named verbs, so the full terminal shows the machine in its own syntax with
// no instrumented call sites. It only READS those streams and writes to a ring buffer:
// nothing enters the answer, and murmur lines ride the enactor door (witness:false), so
// the §9 firewall holds — though the terminal surfaces murmur as its OWN filter bucket
// (∿ sense), distinct from the model's real acts (◂). `notate` (core) prints each line's operator faces. The terminal
// mounts with fab:false — the murmur strip is its sole opener (its click calls
// eotTerminal.open()), so there is no second bottom-corner button beside the audit console.
// Capacity is deep (not 500): the murmur voices CONTINUOUSLY, so a shallow ring fills with
// murmur alone and rolls the sparse reads/searches/turns off the front — the terminal would
// then show "just the murmur". A deep ring keeps the whole session's real operations too.
const eot = createEotLedger({ capacity: 4000 });
wireEotFeed({ app, audit, murmur, eot });
let eotTerminal = null;
try { eotTerminal = mountEotTerminal(eot, { hotkey: true, startOpen: false, fab: false, notate }); }
catch (e) { console.warn('[EO] EOT terminal not mounted', e); }

// The optional identity. Restores a persisted session from localStorage without a
// network hit (signed-in survives reload and works offline), then revalidates the
// token against the homeserver in the background — a definitive 401 signs you out,
// a network fault is left alone.
const matrix = createMatrixSession();
matrix.restoreAndRevalidate().catch(() => { /* stays signed-out */ });

const parse = (text, opts = {}) => {
  // Law 1 at emit: hand the parser the contract registry's resolver, so every
  // event the parse orchestrator authors is checked against its declared Act
  // face at the append chokepoint (core/log.js) — violations recorded, never
  // thrown. The registry import is a DECLARED seam (src/core/seams.js): it
  // aggregates every holon's manifest, so it cannot ride core's entrance.
  const parser = createParser({ contractOf, ...opts });
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

// The durable substrate + database engine (src/store). A passphrase vault seals
// each room's append-only event log as encrypted OPFS bytes — "rooms are tables,
// events are rows, fold is the query". Constructing it is inert (no key, no OPFS
// touch); `db.unlock(user, passphrase)` arms it, then `db.openLog(roomId)` hands
// back a durable log whose appends persist encrypted and whose reopen rehydrates
// + folds identically, while `db.rows/buildTable/query/formula` give the
// spreadsheet-database view over any room. This is the membrane the surface
// adopts to make readings survive the tab and to query the corpus as tables.
const db = createDatabase();

// The SHARED vault + collaborative workspaces (rooms/archive/room-vault). Where `vault`
// above is one person's private ledger, `spaces` makes a workspace a real Matrix ROOM:
// people are invited to it, and everything saved into it is encrypted, stored as binary
// ciphertext in the Matrix media repo, and recorded as a hash-linked block published as
// a Megolm room event — so ONLY the people in the room can read it. It rides on the SAME
// chat controller (one device identity, one sync loop), lazily wired the first time a
// workspace is shared. See docs/shared-vault.md.
let roomVault = null;
const spaces = (() => {
  const ensure = async () => {
    const s = await chat.start();                 // brings the chat controller (bus) live
    if (!s.ok) return s;
    if (!roomVault) roomVault = createRoomVault({ chat: chatController, matrix });
    return roomVault.start();
  };
  const roomIdOf = (workspaceIdOrRoomId) => {
    if (String(workspaceIdOrRoomId || '').startsWith('!')) return workspaceIdOrRoomId;   // already a room id
    const ws = app.state.workspaces.find((w) => w.id === workspaceIdOrRoomId);
    return ws ? ws.roomId : null;
  };
  const api = {
    ensure,
    get vault() { return roomVault; },
    // Turn a local workspace into a shared, invitable Matrix room (idempotent).
    async shareWorkspace(workspaceId, invitees = []) {
      const e = await ensure(); if (!e.ok) return e;
      const ws = app.state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return { ok: false, error: 'no such workspace' };
      if (ws.roomId) return { ok: true, roomId: ws.roomId, already: true };
      const created = await chatController.createRoom({ name: ws.name, invite: invitees.filter(Boolean) });
      if (!created.ok) return created;
      const me = matrix.state.userId;
      app.workspaceBindRoom(workspaceId, { roomId: created.roomId, members: [me, ...invitees].filter(Boolean) });
      return { ok: true, roomId: created.roomId };
    },
    // Invite someone into a shared workspace (by workspace id or room id).
    async invite(workspaceIdOrRoomId, userId) {
      const e = await ensure(); if (!e.ok) return e;
      const roomId = roomIdOf(workspaceIdOrRoomId);
      if (!roomId) return { ok: false, error: 'workspace is not shared yet' };
      return chatController.invite(roomId, userId);
    },
    // Accept an invite to someone else's shared workspace.
    async join(roomId) { const e = await ensure(); if (!e.ok) return e; return chatController.join(roomId); },
    // Hydrate a shared workspace's chain from OPFS (so a reload shows what's already
    // saved before any new sync folds in). Returns { ok, blocks } newest-first.
    async load(workspaceIdOrRoomId) {
      const e = await ensure(); if (!e.ok) return { ok: false, error: e.error };
      const roomId = roomIdOf(workspaceIdOrRoomId);
      if (!roomId) return { ok: false, error: 'workspace is not shared yet' };
      await roomVault.ensureChain(roomId);
      return { ok: true, blocks: roomVault.list(roomId) };
    },
    async members(workspaceIdOrRoomId) {
      const e = await ensure(); if (!e.ok) return { ok: false, members: [] };
      const roomId = roomIdOf(workspaceIdOrRoomId);
      return roomId ? chatController.members(roomId) : { ok: false, members: [] };
    },
    // Save / open / list / verify content in a shared workspace (accepts a workspace id
    // or a room id). Save encrypts, uploads ciphertext, and publishes the block to the room.
    async save(workspaceIdOrRoomId, bytes, meta = {}) {
      const e = await ensure(); if (!e.ok) return e;
      const roomId = roomIdOf(workspaceIdOrRoomId);
      if (!roomId) return { ok: false, error: 'workspace is not shared yet' };
      return roomVault.save(roomId, bytes, meta);
    },
    async open(workspaceIdOrRoomId, indexOrBlock) {
      const e = await ensure(); if (!e.ok) return e;
      const roomId = roomIdOf(workspaceIdOrRoomId);
      return roomId ? roomVault.open(roomId, indexOrBlock) : { ok: false, error: 'not shared' };
    },
    list: (workspaceIdOrRoomId) => (roomVault ? roomVault.list(roomIdOf(workspaceIdOrRoomId)) : []),
    verify: (workspaceIdOrRoomId) => (roomVault ? roomVault.verify(roomIdOf(workspaceIdOrRoomId)) : { ok: true, length: 0 }),
    head: (workspaceIdOrRoomId) => (roomVault ? roomVault.head(roomIdOf(workspaceIdOrRoomId)) : null),
    // A lightweight nudge to everyone in the room ("saved X", presence) on the same bus.
    async sendSignal(workspaceIdOrRoomId, kind, data) {
      const e = await ensure(); if (!e.ok) return e;
      const roomId = roomIdOf(workspaceIdOrRoomId);
      if (!roomId) return { ok: false, error: 'workspace is not shared yet' };
      return chatController.sendSignal(roomId, kind, data);
    },
    onSignal: (fn) => (chatController ? chatController.onRoomEvent((evt) => { if (evt.type === 'org.eoreader.signal') fn(evt); }) : (() => {})),
    subscribe: (fn) => (roomVault ? roomVault.subscribe(fn) : (() => {})),
  };
  // The "sync to Matrix" opt-in — a per-workspace autosync that mirrors a workspace's
  // sources into its room's encrypted blockchain (opening the room first if needed). It
  // rides this same membrane (shareWorkspace + save). Default OFF; see docs/shared-vault.md.
  const sync = createSpaceSync({ app, spaces: api });
  api.sync = sync;
  api.setSync = (workspaceId, on) => sync.setEnabled(workspaceId, on);
  api.syncNow = (workspaceId) => sync.syncNow(workspaceId);
  return Object.freeze(api);
})();

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

// The facing-page WYSIWYG renderer (rooms/render). `open(source)` hands a source (a { html, css,
// js } triple, a raw string, or a whole HTML document) to render.html via a localStorage handoff
// and opens it; `mount(el, opts)` drops the renderer into a panel in place; the pure helpers are
// exposed for programmatic assembly. (docs/library-search.md — "The facing renderer")
const render = Object.freeze({
  mount: mountFacingRenderer,
  assembleDocument, splitSource, runnableSrcdoc,
  open: (source, filename = '') => {
    try { localStorage.setItem('eo_render_handoff', JSON.stringify({ source, filename })); } catch { /* handoff optional */ }
    try { if (typeof window !== 'undefined' && window.open) return window.open('render.html', '_blank'); } catch { /* popup blocked */ }
    return null;
  },
});

// The n8n/TouchDesigner-style wiring surface — a source's derivations to a sink (pipeline-*.js).
const pipeline = createPipelineSurface({ app });

// The audit console (Settings → "Console"). Mounted here, before window.EO is assembled,
// so that object literal captures the real handle rather than its pre-mount null.
let eoConsole = null;
try { eoConsole = mountConsole(document.body, { audit, app, appName: APP_NAME, version: APP_VERSION, fab: false }); }
catch (e) { console.warn('[EO] console not mounted', e); }

window.EO = Object.freeze({
  app,
  render,   // the facing-page WYSIWYG renderer — open a source (HTML/CSS/JS) rendered live beside its code
  pipeline, // the n8n/TouchDesigner-style wiring surface — open({sourceIds}), plus the graph CRUD + run
  parse,
  readingAt,
  groundSpans, groundSummary, supportVerdict,
  factCheck,
  discourseDag, assertedDag, dagNodeLabel,
  audit,
  murmur,   // the peripheral sense — the surface subscribes for the real-time murmur strip (audit-only)
  eot,               // the EOT operation ledger (docs/eot-ledger.md) — snapshot/subscribe/export the machine's own trail
  eotTerminal,       // the full activity terminal's mount handle — the murmur strip opens it on click (open/close/toggle)
  console: eoConsole,   // the audit console's mount handle (docs above) — Settings' "Console" row opens/closes it
  workspace,
  mountTieredGraph,
  mountDagSurface,   // the two-cursor causal DAG surface (surfer/dag) — topic-wide + per-entity, with toggles
  readerRender,   // source→book reader + native-page render, for the source viewer's tabs
  reveal,   // the chat typewriter's pace (bounded catch-up) — pure, so the freeze regression is CI-tested
  // the byte-structure surface (Aldo Cortesi's binvis) — a document's bytes on a Hilbert curve,
  // coloured by class/entropy/significance. index.html wires mountBinvis into the Structure tab.
  binvis: Object.freeze({ ...binvis, mount: mountBinvis }),
  pdfView: Object.freeze({ mount: mountPdfView }),   // the PDF page surface (pdf.js → canvas) — index.html wires it into the PDF tab
  // Research Review (docs/research-review.md) — a search result becomes a provisional, inspectable
  // corpus (discovered/reviewed/admitted) before anything joins a real topic. Mounted, binvis-style.
  researchReview: Object.freeze({ mount: mountResearchReview }),
  firstSurfaceKind,   // which surface a fresh import opens first (causal DAG / entity web) — pure, CI-tested
  evidence,   // the evidence-modal contract — a waveform mark → the five-region modal shape (docs/omnimodal-waveform.md)
  projectTranscript, wordsToText,   // the interactive transcript fold (baseline + edits/redactions → live reading)
  encodeWav, applyRedactions,       // audio DSP for the Listen surface's redaction re-synthesis + WAV export

  // the library shelf — the four search libraries as plain descriptors (article/book/media/code),
  // each with its icon, placeholder, and example queries; the surface reads this to render each
  // shelf's own search box and its hits as cards shaped for the thing (docs/library-search.md)
  libraries: app.libraries,

  matrix,
  chat,
  vault,
  db,             // the durable substrate — encrypted, append-only, OPFS-backed rooms (src/store)
  spaces,   // shared, room-encrypted, hash-chained vault + invitable workspaces (docs/shared-vault.md)
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
