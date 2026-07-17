// EO: CON·INS(Network,Void → Entity,Link, Making,Binding) — the reader room's session controller
// The reader app — the stateful session the dc surface renders. Everything the
// surface shows lives here as plain data; everything it does routes through the
// engine holons. The surface never computes, the engine never renders.
//
//   sources    the S-registry — every recorded page/file/paste, sha'd + parsed
//   topics     research topics — each scopes a source set and a chat conversation
//   chat()     one chat turn (with source context) through turn/runTurn (model + embedder DI'd)
//   ingest*()  URL / search / file / paste, through the organs + admission core
//   entities() the admitted referents across the topic's docs (the explorer)
//   provenance() the session's claim→passage→source→fixity DAG (the graph tab)
//
// Persistence is IndexedDB (text + chat survive reload; docs re-parse lazily).
// Work still IN FLIGHT survives too: a fetch / file import / transcription opens a
// durable job (ingest-jobs.js) that rides the snapshot and is RESUMED on the next
// boot, so ingestion and transcription survive a reload even part-way through.
// In Node (tests) there is no indexedDB and no fetch — every method that needs
// one degrades to a no-op or a thrown, catchable error; nothing at import time
// touches the network.

import { parseText } from '../../perceiver/parse/index.js';
import { promoteConnection } from '../../enactor/connect/index.js';
import { speakTriples, talkThenVerify } from '../../weave/write/index.js';
import { toPast } from '../../weave/write/index.js';
import { projectGraph, operatorsOf, glyphOf } from '../../core/index.js';
import { createModel, describeModel, wrapRedacting, probeOrigins, explainReach,
         createHashEmbedder, createMiniLMEmbedder, withPersistentEmbedCache } from '../../model/index.js';
import { runTurn, runWebFollowup, formulateSearchQuery, searchAnnouncement, anchorTopicless,
         runTurnWithResearch, runCuriousResearch, researchAnnouncement, modelDisambiguator, senseAnnouncement,
         runTurnWithCorroboration, corroborationAnnouncement, corroborationSettled,
         readDiscourse, clarifyDemandOf, loadShapeLibrary,
         loadShapeGrammars, extendLibraryWithNavPool } from '../../turn/index.js';
import { createWebClient, htmlToText, searchAndAdmit, admitWebSource, webContentHash,
         fetchGithubRepo, LIBRARIES, surfaceCard, librariesManifest, readIngest, emitEot } from '../../organs/ingest/index.js';
import { createCompositeDoc } from '../../organs/in/index.js';
import { scopeSources } from './scope-sources.js';
import { createAudioStore } from './audio-store.js';
import { makeJob, upsertJob, patchJob, dropJob, resumableJobs, MAX_JOB_ATTEMPTS } from './ingest-jobs.js';
import { projectTranscript, REDACTION_MARK } from './transcript-edit.js';
import { buildFormat, FORMATS as TRANSCRIPT_FORMATS, hasTranscript } from './transcript-export.js';
import { formatTranscript, detectTranscriptChapters, readThroughIndex, settledText, segmentsOf, chapterAt, referentRuns } from './transcript-format.js';
import { sha256Hex } from '../archive/index.js';
import { outstandingQuestion, answersAwaited } from '../../frame/index.js';
import { senseGate } from '../../turn/index.js';
import { createMonitor } from '../../enactor/index.js';
import { createCommitmentLedger } from '../../enactor/index.js';
import { answerSmalltalk } from '../../enactor/answer/index.js';
import { figureSurface, rankProperties } from '../../perceiver/index.js';
import { generateTopline, definitionSpans, definitionCompetency, composeChorus, entityInventory, sourceInventory, interpretFeedback, mergeSteer, chapterBullets, composeEntityDigest, composeChapterReading, passageNeighborhood, composePassageReading } from '../../weave/topline/index.js';
import { detectGrain } from '../../surfer/index.js';
import { groundSpans } from '../../enactor/ground/index.js';
import { discourseDag, assertedDag } from '../../surfer/dag/index.js';
import { createDeepReader } from '../../surfer/fold/index.js';
import { surfFold } from '../../surfer/index.js';
import { buildChatExport } from './chat-export.js';
import { wikiReferent } from './wiki-referent.js';
import { mergeEntitiesByReferent } from './entity-merge.js';
import { composeProvenance, repoRef, readBuild, fetchLatestCommit, APP_NAME, APP_VERSION } from './provenance.js';
import { foldNarrative } from './fold-narrative.js';
import { deriveTopicTitle, isDefaultTopicTitle, DEFAULT_TOPIC_TITLE } from './topic-name.js';
// The pre-closure helpers moved to app/ (net · kv · guards · util) in the 2026-07
// compliance pass — same holon, one file per concern, this file re-exports the
// public ones at their historical site.
import { chainFetch, FULL_TEXT } from './app/net.js';
import { kv } from './app/kv.js';
import { keepGuardAlive, probeModelAlive, REFLECTION_CAP, recordReflections, LOG_CAP, appendLog } from './app/guards.js';
import { nowIso, nowMs, RESEARCH_HOPS, wantsLongform, LONGFORM_MAX_TOKENS, domainOf, shaShort, LINK_TITLES, bytesOf, esc } from './app/util.js';
export { keepGuardAlive, probeModelAlive, REFLECTION_CAP, recordReflections, LOG_CAP, appendLog };
// ── the app ──────────────────────────────────────────────────────────────────
import { buildApi } from './app/api.js';
import { installTrail } from './app/trail.js';
import { installPersistence } from './app/persistence.js';
import { installJobs } from './app/jobs.js';
import { installTopics } from './app/topics.js';
import { installWorkspaces } from './app/workspaces.js';
import { installRegistry } from './app/registry.js';
import { installFolders } from './app/folders.js';
import { installIngest } from './app/ingest.js';
import { installSearch } from './app/search.js';
import { installAudio } from './app/audio.js';
import { installTranscript } from './app/transcript.js';
import { installPicture } from './app/picture.js';
import { installPaper } from './app/paper.js';
import { installResume } from './app/resume.js';
import { installModel } from './app/model.js';
import { installKeeper } from './app/keeper.js';
import { installShapelib } from './app/shapelib.js';
import { installProvBuild } from './app/prov-build.js';
import { installWebmode } from './app/webmode.js';
import { installRedact } from './app/redact.js';
import { installChat } from './app/chat.js';
import { installTopicQuestion } from './app/topic-question.js';
import { installSegments } from './app/segments.js';
import { installEntities } from './app/entities.js';
import { installLevels } from './app/levels.js';
import { installTransmission } from './app/transmission.js';
import { installStanding } from './app/standing.js';
import { installListen } from './app/listen.js';
import { installToplines } from './app/toplines.js';
import { installSummaries } from './app/summaries.js';
import { installDigest } from './app/digest.js';
import { installZoom } from './app/zoom.js';
import { installWiki } from './app/wiki.js';
import { installTrajectory } from './app/trajectory.js';
import { installFindings } from './app/findings.js';
import { installRecordSearch } from './app/record-search.js';
import { installPins } from './app/pins.js';
import { installReread } from './app/reread.js';
import { installDeep } from './app/deep.js';

export const createReaderApp = ({ audit, murmur = null, fetchImpl = chainFetch } = {}) => {
  // The shared spine every section stands on. Sections are install()ed in the
  // closure's original order; each publishes its public functions onto ctx, and
  // cross-section calls ride ctx at CALL time — so order only matters for the
  // few install-time couplings the original closure already had.
  const appCtx = {
    // the mint counters + the cross-section mutables (persistence resets the
    // counters on restore; chat arms abort/stallGuard; a settled answer clears
    // the wedge streak)
    sn: 0, tn: 0, ln: 0, mn: 0, wn: 0, fon: 0, pn: 0, stn: 0,
    abort: null, stallGuard: null, localWedges: 0,
    audit, murmur, fetchImpl,
  };
  const state = {
    sources: [],           // registry entries (serializable minus _doc)
    // Auto-generated toplines (docs/topline.md). A SOURCE's topline rides on its own registry
    // entry (src.summary), removed with the source; an ENTITY has no persisted home object (it is
    // re-derived from the graph each render), so its topline is kept here, keyed by normalised
    // label — the same merged identity the explorer groups by. Both persist across reload.
    // entity toplines, and the DEFINER's evolving champion — the chorus's reigning strategy plus a
    // run counter that drives the (deterministic) exploration beat. Persisted so the organism keeps
    // what it learned about defining across reloads (weave/topline/chorus.js).
    // `folds` beside them: the fold-summary records (app/summaries.js) — a bounded ring.
    summaries: { entities: {}, definer: { champion: null, runs: 0 }, folds: {} },
    // A workspace is the top-level container (Notion's workspace/teamspace): it owns a
    // nested tree of topics. A topic scopes a source set and a chat conversation, and now
    // carries `workspaceId` (which container it lives in) + `parentId` (its parent topic,
    // null at the root) + `collapsed` (whether its subtree is folded in the sidebar), so
    // the flat list becomes a navigable tree that stays legible at scale.
    workspaces: [],        // { id, name, color, shared, created }
    activeWorkspaceId: null,
    topics: [],            // { id, title, created, workspaceId, parentId, collapsed, sourceSns:[], messages:[], memo:'' }
    activeTopicId: null,
    // The source explorer's Drive: a workspace owns a nested tree of FOLDERS, and every
    // top-level source carries a `folderId` naming the folder it is filed under (null = the
    // drive root). Folders are workspace-scoped so the whole library — every quest's sources —
    // organises into one navigable Drive; grounding stays topic-scoped (topicSources untouched).
    folders: [],           // { id, name, parentId, workspaceId, created }
    log: [],               // activity ledger: { id, t, kind, text, effect }
    reflections: [],       // the inner monologue: reflections the reading has at rest (band void)
    reflectionsSeen: 0,    // running total ever voiced this session — the honest "N notes so far".
                           // reflections is capped at REFLECTION_CAP; this is not, and (like
                           // reflections, which re-derive each load) is per-session, never persisted.
    // SELF-GUIDED LEARNING (murmur/learn) — the murmur's own notebook, accrued as it WANDERS at
    // rest. Per-session working state, re-earned each load exactly like reflections (the firewall:
    // nothing murmur keeps is durable truth). The `learning` layer is what the graph toggle shows.
    learning: [],          // the learning notes (a bounded ring, like reflections)
    learningSeen: 0,       // running total learned this session
    // The murmur's stance, set by the surface (persisted there as eo_murmur*). The wander runs ONLY
    // when mode is not 'off' AND the strip is visible — so there is never any muttering unseen.
    murmurMode: 'look',    // 'off' | 'look' (no internet) | 'explore' (curiosity onto the web)
    murmurVisible: true,   // the strip shown? hidden ⇒ the wander PAUSES (nothing muttered unseen)
    model: { backend: null, state: 'cold', progress: 0, note: '' },
    busy: null,            // { kind, label } while a long op runs
    foreModel: 0,          // count of user-facing decodes OUTSIDE a turn (panel topline + chorus); see modelEngaged
    // DURABLE PENDING WORK (ingest-jobs.js). The reader records a source only when a fetch, a file
    // import, or a transcription has FINISHED — so a refresh mid-way used to lose the work with no
    // trace. A job is opened when the work begins, rides the snapshot, and is dropped when it lands;
    // on the next boot the still-open jobs are RESUMED (idempotently — dedup by content hash). This
    // is what lets ingestion AND transcription survive a reload even part-way through.
    jobs: [],              // [{ id, kind, status, attempts, topicId, workspaceId, ...spec }]
    // PINS (docs/search-and-pins.md) — the durable write path. A pin holds an entity, a claim, a
    // passage, a source, or a QUERY, each with enough embedded identity to survive re-parses and
    // source drift (anchor.js — sha + charSpan + the quote itself). Top-level on purpose: a pin
    // outlives topic moves and deletion, exactly like jobs.
    pins: [],              // [{ id, kind, refKey, topicId, workspaceId, at, label, note, anchor?, entity?, claim?, query? }]
    standing: [],          // saved comparisons/traces with an embedded snapshot — report what changed since (app/standing.js)
    ready: false,          // restore finished
  };
  // (the mint counters live on ctx — persistence resets them, each section mints from them)
  const client = createWebClient({ fetchImpl });

  // THE SESSION'S SELF AND SPINE. One monitor for the whole session (one loop, one me):
  // every turn commits its answer's propositions as efference copies and senses the next
  // question against them — an echo of the voice's own words is never independent
  // confirmation; a push-back is a recorded correction. One commitment ledger beside it:
  // the persisting line of what was asserted (relay vs authored) and every correction
  // appended next to what it corrects. The ledger is serialized with the session, so the
  // record survives reload; the monitor's copies are per-session working state.
  const monitor = createMonitor();
  const ledger = createCommitmentLedger({ now: nowIso });

  // change fan-out — the dc surface subscribes once and re-renders on any emit
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind, data = null) => { for (const fn of subs) { try { fn(kind, data); } catch { /* surface's problem */ } } };

  // `opts.coalesce` folds a repeating beat into the tail rather than appending a fresh line —
  // used only by the at-rest reflection, so idle passes don't flood the Actions feed (see appendLog).
  const logIt = (kind, text, effect = '', opts = {}) => {
    appendLog(state.log, { kind, t: nowIso(), text, effect }, () => `L${++appCtx.ln}`, opts);
    emit('log');
  };

  // Engine working for the user — a turn (busy) or a composing panel summary (foreModel); deep.js yields to it.
  const modelEngaged = () => !!state.busy || (state.foreModel || 0) > 0;

  Object.assign(appCtx, { audit, client, emit, fetchImpl, ledger, logIt, modelEngaged, monitor, murmur, state, subs, subscribe });

  installTrail(appCtx);
  installPersistence(appCtx);
  installJobs(appCtx);
  installTopics(appCtx);
  installWorkspaces(appCtx);
  installRegistry(appCtx);
  installFolders(appCtx);
  installIngest(appCtx);
  installSearch(appCtx);
  installAudio(appCtx);
  installTranscript(appCtx);
  installPicture(appCtx);
  installPaper(appCtx);
  installResume(appCtx);
  installModel(appCtx);
  installKeeper(appCtx);
  installShapelib(appCtx);
  installProvBuild(appCtx);
  installWebmode(appCtx);
  installRedact(appCtx);
  installChat(appCtx);
  installTopicQuestion(appCtx);
  installSegments(appCtx);
  installEntities(appCtx);
  installLevels(appCtx);
  installTransmission(appCtx);
  installStanding(appCtx);
  installListen(appCtx);
  installToplines(appCtx);
  installSummaries(appCtx);
  installDigest(appCtx);
  installZoom(appCtx);
  installWiki(appCtx); installTrajectory(appCtx);
  installFindings(appCtx);
  installRecordSearch(appCtx);
  installPins(appCtx);
  installReread(appCtx);
  installDeep(appCtx);

  return buildApi(appCtx);
};
