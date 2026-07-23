// EO — the reader app's public membrane (split from rooms/reader/app.js, 2026-07
// compliance pass). The ONE frozen object the surface holds: every method the dc
// surface may call, each a ctx binding published by its section at install time.
import { describeModel } from '../../../model/index.js';
import { librariesManifest } from '../../../organs/ingest/index.js';
import { composeProvenance, APP_NAME, APP_VERSION } from '../provenance.js';
import { nowIso } from './util.js';

export const buildApi = (appCtx) => {
  const { state, subscribe, monitor, ledger, murmur } = appCtx;
  return Object.freeze({
    state, subscribe,
    // topics — a nested tree within a workspace
    topicNew: appCtx.topicNew, setTopic: appCtx.setTopic, topicRename: appCtx.topicRename, topicDelete: appCtx.topicDelete, topic: appCtx.topic, topicById: appCtx.topicById,
    topicMove: appCtx.topicMove, topicToggleCollapse: appCtx.topicToggleCollapse, topicTree: appCtx.topicTree, topicRows: appCtx.topicRows,
    // evidence scope — a topic-wide, persistent source toggle (topics.js). topicSources (below)
    // reads it; topicSourcesAll ignores it (full membership, for the scope bar + navigation).
    topicScopeDisabledSns: appCtx.topicScopeDisabledSns, topicScopeSummary: appCtx.topicScopeSummary,
    setSourceScopeEnabled: appCtx.setSourceScopeEnabled, setTopicScopeAll: appCtx.setTopicScopeAll, invertTopicScope: appCtx.invertTopicScope,
    saveTopicScope: appCtx.saveTopicScope, applyTopicScope: appCtx.applyTopicScope, deleteTopicScope: appCtx.deleteTopicScope,
    // workspaces — the top-level containers; a shared workspace is a Matrix room (roomId)
    workspaceNew: appCtx.workspaceNew, setWorkspace: appCtx.setWorkspace, workspaceRename: appCtx.workspaceRename, workspaceDelete: appCtx.workspaceDelete, activeWorkspace: appCtx.activeWorkspace,
    workspaceBindRoom: appCtx.workspaceBindRoom, workspaceByRoom: appCtx.workspaceByRoom, workspaceSetSync: appCtx.workspaceSetSync,
    // folders — the source explorer's Drive (workspace-scoped tree; sources carry folderId)
    folderNew: appCtx.folderNew, folderRename: appCtx.folderRename, folderMove: appCtx.folderMove, folderDelete: appCtx.folderDelete, folderById: appCtx.folderById, folderPath: appCtx.folderPath,
    workspaceFolders: appCtx.workspaceFolders, workspaceSources: appCtx.workspaceSources, sourceMove: appCtx.sourceMove, sourceStar: appCtx.sourceStar, sourceTouch: appCtx.sourceTouch, sourceAddToTopic: appCtx.sourceAddToTopic,
    // ingest
    ingestUrl: appCtx.ingestUrl, ingestFeed: appCtx.ingestFeed, ingestText: appCtx.ingestText, ingestFile: appCtx.ingestFile, search: appCtx.search, recordHit: appCtx.recordHit, reReadSource: appCtx.reReadSource, webSearchAdmit: appCtx.webSearchAdmit, fetchPage: appCtx.fetchPage, navigatePage: appCtx.navigatePage,
    // the library shelf — search ONE shelf on its own surface (article/book/media/code), and the
    // deliberate "ingest all code" path (a whole repo through the code organ)
    searchLibrary: appCtx.searchLibrary, ingestRepo: appCtx.ingestRepo, libraries: librariesManifest(),
    // durable pending work — the ingest/transcription jobs still in flight, and the boot-time resume
    // that re-runs them (so ingestion AND transcription survive a reload even part-way through)
    jobs: () => state.jobs.slice(),
    resumeJobs: appCtx.resumeJobs,
    // search — the sibling of ask(): a query opens a "search topic" and pulls sources into it.
    // specPrime warms that same web search speculatively while the user types (behind auto mode);
    // the surface calls it on a typing-settled debounce, and searchTopic takes the warmed entry.
    // (Research Review's reviewStart, below, does not yet consume this quarantine — a warmed entry
    // goes unused on that path and is swept by its own TTL; see docs/research-review.md.)
    searchTopic: appCtx.searchTopic, specPrime: appCtx.specPrime,
    // Research Review (docs/research-review.md) — a search result becomes a provisional,
    // inspectable corpus before anything is admitted to a "real" topic. reviewStart opens the
    // review topic and reviews the first batch; reviewMore pulls in more discovered candidates;
    // reviewToggleExclude/reviewApplyRecipe shape the working selection; reviewAdmit is the
    // explicit act that copies the selection into a real topic; reviewCompute is the whole
    // computed screen (evidence areas, duplicate clusters, connections, recipes, corpus preview).
    reviewStart: appCtx.reviewStart, reviewMore: appCtx.reviewMore,
    reviewAddUrl: appCtx.reviewAddUrl, reviewImportFile: appCtx.reviewImportFile,
    reviewToggleExclude: appCtx.reviewToggleExclude, reviewApplyRecipe: appCtx.reviewApplyRecipe,
    reviewAdmit: appCtx.reviewAdmit, reviewCompute: appCtx.reviewCompute,
    // the newer §7/§9 actions (research-review-actions.js): overriding a computed duplicate
    // cluster, confirming/rejecting a cross-source identity match, a gap-directed search that
    // lands in the SAME review topic, and opening one waveform mark's evidence-modal payload.
    reviewToggleIndependent: appCtx.reviewToggleIndependent, reviewClusterAction: appCtx.reviewClusterAction,
    reviewSetIdentity: appCtx.reviewSetIdentity, reviewExpand: appCtx.reviewExpand, reviewOpenMark: appCtx.reviewOpenMark,
    reviewVerifyAnswer: appCtx.reviewVerifyAnswer, reviewFeedback: appCtx.reviewFeedback,
    sourceBySn: appCtx.sourceBySn, sourceRename: appCtx.sourceRename, removeSource: appCtx.removeSource, topicSources: appCtx.topicSources, topicSourcesAll: appCtx.topicSourcesAll, sourceToggleCollapse: appCtx.sourceToggleCollapse,
    // a source's processing state in one name (source-stage.js) — Structuring/Reading/Ready/Failed,
    // the comprehension roadmap's canonical read of entCount + transcription/imageRead + coverage.
    sourceStage: appCtx.sourceStage,
    // source export — full append-only history as JSONL, one JSON snapshot (or one folded at a
    // text/log cursor), and the ORIGINAL file/bytes as ingested (PDF/audio/video bytes, else text)
    sourceExport: appCtx.sourceExport, sourceHistoryJsonl: appCtx.sourceHistoryJsonl, sourceCursorJson: appCtx.sourceCursorJson, sourceOriginalExport: appCtx.sourceOriginalExport,
    // the web organ's session-long intake ledger (docs/the-web-organ-spec.md, intake.js) — every
    // INTAKE DEF (collapsed or rejected) any web-kind source has earned this session, full witness
    // included; the per-source summary (src.intake) is the capped view, this is the whole record.
    intakeLog: () => appCtx.intake.log.all(),
    // chat — with source
    chat: appCtx.chat, ask: appCtx.chat, askQuestion: appCtx.askQuestion, stop: appCtx.stop, exportChat: appCtx.exportChat,
    // askFigureSource and askFigureTopic removed (see rashomon) — stubs for backward compat
    askFigureSource: () => null, askFigureTopic: () => null,
    // export provenance — WHAT produced this session: app + published build + latest-on-GitHub +
    // the current talker. Composed live so a surface badge can show the build/freshness/model.
    provenance: () => composeProvenance({
      app: APP_NAME, version: APP_VERSION,
      build: appCtx.provBuild, latest: appCtx.provLatest, repo: appCtx.provRepo,
      model: describeModel(appCtx.model), exportedAt: nowIso(),
    }),
    refreshProvenance: appCtx.refreshProvenance,
    // deep reading — the inner monologue at rest (reflections stream into state.reflections)
    deepTick: appCtx.deepTick, reflections: appCtx.reflections,
    // co-reading — the reader's position drives the loop: the surface reports where the eye has
    // settled (a sentence index, or coReadHere with the visible block text) and the reader reflects
    // in the margin of that place, firewalled.
    coReadAt: appCtx.coReadAt, coReadHere: appCtx.coReadHere,
    // connective promotion — murmur's candidate connections verified + written at rest (phase 4)
    connectTick: appCtx.connectTick,
    // self-guided learning — the murmur's at-rest wander (murmur/learn): notes stream into
    // state.learning (the toggleable graph layer) and mutter live in the strip.
    wanderTick: appCtx.wanderTick, learning: () => state.learning.slice(),
    setMurmurMode: appCtx.setMurmurMode, setMurmurVisible: appCtx.setMurmurVisible,
    murmurMode: () => state.murmurMode,
    // web-search mode (off | confirm | auto)
    webMode: appCtx.webMode, setWebMode: appCtx.setWebMode,
    // redact-when-hosted — keep real entities off the wire when the talker is Claude (Anthropic)
    redactRemote: appCtx.redactRemote, setRedactRemote: appCtx.setRedactRemote,
    // model
    ensureModel: appCtx.ensureModel, setBackend: appCtx.setBackend, backendPref: appCtx.backendPref, setSpeed: appCtx.setSpeed, speedPref: appCtx.speedPref,
    optionalModel: appCtx.optionalModel, readerCoreStatus: appCtx.readerCoreStatus, synthesisEnabled: appCtx.synthesisEnabled, synthesisMode: appCtx.synthesisMode,
    // projections for the surface
    answerSegments: appCtx.answerSegments, viewerParas: appCtx.viewerParas, readerLink: appCtx.readerLink, transcriptEntityRuns: appCtx.transcriptEntityRuns, entities: appCtx.entities, entityProfile: appCtx.entityProfile, entityWiki: appCtx.entityWiki, tieredData: appCtx.tieredData, solarMeaningData: appCtx.solarMeaningData, topicTieredData: appCtx.topicTieredData,
    // the Network surface (src/wiki/network-article.js) — the topic's sources linked by what
    // they corroborate; networkOf unpacks one composite (parentSn) source's own children
    networkTieredData: appCtx.networkTieredData, networkOf: appCtx.networkOf,
    // the cross-source crosswalk surface (docs/coreference-timeline.md) — a referent's identity
    // scrubbed at two independent cursors: `trajectory` reads ONE document's own telling order
    // (the reading cursor); `crosswalk` reads the corpus's ingestion order (the corpus cursor),
    // merging labels across sources and surfacing label-shift ticks as it advances.
    // crosswalkTieredData shapes that same fold for mountTieredGraph (rooms/reader/tiered-graph.js).
    trajectory: appCtx.trajectory, crosswalk: appCtx.crosswalk, crosswalkTieredData: appCtx.crosswalkTieredData,
    // the entity explorer, scoped to one source and read at a chosen HOLONIC LEVEL —
    // its natural-language referents (default) or the modality's raw spans underneath
    sourceLevels: appCtx.sourceLevels, sourceEntities: appCtx.sourceEntities, sourceBaseNoun: appCtx.sourceBaseNoun,
    // idea transmission — a claim traced from one voice into another's, in document/corpus time,
    // marking where it mutated (an inverted echo); at one source or across the whole topic.
    transmissionSource: appCtx.transmissionSource, transmissionTopic: appCtx.transmissionTopic,
    // Rashomon folds removed — stubs for backward compat
    rashomonSource: () => null, rashomonTopic: () => null, rashomonCandidates: () => [],
    // standing folds — save a comparison/trace and see what changed since (docs: the living fold).
    standingSave: appCtx.standingSave, standingRefresh: appCtx.standingRefresh, standingRemove: appCtx.standingRemove, standingList: appCtx.standingList,
    // cross-source sync — align two sources' timestamped word tokens, gated so a wrong pairing
    // abstains rather than force-fitting a guess (core/sync/align.js, docs: the born-rule gate).
    // syncPreview is a fast unsaved run for the confirm-modal's live threshold preview; syncRun
    // persists the anchor JSONL to OPFS; syncSave additionally saves it as a standing fold;
    // syncExport projects a saved sync's anchors through an organs/out/sync format.
    syncPreview: appCtx.syncPreview, syncRun: appCtx.syncRun, syncSave: appCtx.syncSave, syncExport: appCtx.syncExport,
    // fragility — the record's contested claims ranked by how much of the record hangs off them.
    fragilitySource: appCtx.fragilitySource, fragilityTopic: appCtx.fragilityTopic,
    // chronology — the order events are told vs. happened; a timeline with flashbacks flagged.
    chronologySource: appCtx.chronologySource, chronologyTopic: appCtx.chronologyTopic,
    // auto-generated toplines (docs/topline.md) — a summary for every source and entity, + feedback
    sourceSummary: appCtx.sourceSummary, sourceSummaryOf: appCtx.sourceSummaryOf, entitySummary: appCtx.entitySummary, entitySummaryFor: appCtx.entitySummaryFor, summaryFeedback: appCtx.summaryFeedback,
    // the figure a single-subject source centres on — the source page shows its dossier (docs/topline.md)
    sourceDominantEntity: appCtx.sourceDominantEntity,
    // fold summaries (docs/fold-summary-pipeline.md) — the fold's reading realized behind the
    // referential gate, at any place ({scope:'cursor',cursor}), any lens ({scope:'entity'|'topic'}),
    // and any DETAIL: 'brief' (one fast sentence), 'standard', 'paragraph' (the whole work, one
    // paragraph). foldSummary generates (telegram first, model refinement behind it);
    // foldSummaryFor reads the stored record back synchronously.
    foldSummary: appCtx.foldSummary, foldSummaryFor: appCtx.foldSummaryFor,
    // scope:'range' bounds the ask to [from,to] sentence indices (a waveform in/out selection —
    // sentenceAtTime resolves a clip TIME to the index); excludeEntities (any scope) drops a
    // figure from the structured reading (figures/properties/relations), not from quoted spans.
    sentenceAtTime: appCtx.sentenceAtTime,
    // TEMPORARY — the fold at a cursor made VISIBLE (the objects in focus + the reading's assertions,
    // not just the spans); synchronous, model-free, unstored. Drives the reader's fold-peek overlay.
    cursorFold: appCtx.cursorFold,
    // the entity explore surface — the deterministic chapter spine + on-demand important/surprising +
    // the fold-prompted per-chapter reading + the passage ZOOM, all pulled lazily as the reader digs
    // in and deeper (docs/topline.md)
    entityChapters: appCtx.entityChapters, entityDigest: appCtx.entityDigest, entityDigestFor: appCtx.entityDigestFor, entityChapterReading: appCtx.entityChapterReading, entityChapterReadingFor: appCtx.entityChapterReadingFor,
    entityPassage: appCtx.entityPassage, entityPassageReading: appCtx.entityPassageReading, entityPassageReadingFor: appCtx.entityPassageReadingFor,
    findings: appCtx.findings, provenance: appCtx.provenance, dagFor: appCtx.dagFor, dagSources: appCtx.dagSources, eotFor: appCtx.eotFor, eotReady: appCtx.eotReady, answerEot: appCtx.answerEot, sourceClaimCount: appCtx.sourceClaimCount,
    // the cross-source comparison matrix — measure × source, each cell opening its passage
    comparisonMatrix: appCtx.comparisonMatrix,
    // search over the record + the durable write path (docs/search-and-pins.md)
    searchRecord: appCtx.searchRecord,
    // search as a surface — a query routed to its best preset template (concordance/cast/contrast)
    searchSurface: appCtx.searchSurface,
    pins: appCtx.pins, pinAdd: appCtx.pinAdd, pinRemove: appCtx.pinRemove, pinUpdate: appCtx.pinUpdate, pinResolve: appCtx.pinResolve, anchorAt: appCtx.anchorAt,
    // the commitment ledger (assertions + corrections, persisted) and the session's
    // self/world line readout — the honesty and ledger seams, readable from the surface
    ledger: () => ledger.entries(),
    ledgerExport: () => ledger.exportJSONL(),
    selfModel: () => ({
      observations: monitor.self.size,
      self: monitor.self.count('self'),
      world: monitor.self.count('world'),
      mismatched: monitor.self.count('self-mismatch'),
      outstanding: monitor.outstanding().length,
      corrections: monitor.corrections().length,
    }),
    // the raw doc, for anything the surface wants to inspect
    docFor: (snId) => appCtx.docFor(appCtx.sourceBySn(snId)),
    // audio: a playable URL (rehydrated from OPFS / the encrypted Matrix copy after reload), the raw
    // persisted bytes (for redaction re-synthesis), and the non-destructive edit/redaction chokepoint.
    playableUrl: appCtx.playableUrl, audioBytes: appCtx.audioBytes, recordAudioEvent: appCtx.recordAudioEvent,
    // pdf: a renderable object URL (rehydrated from OPFS after reload) and the raw persisted bytes
    pdfUrl: appCtx.pdfUrl, pdfBytes: appCtx.pdfBytes, pdfRenderable: appCtx.pdfRenderable,
    // image: a showable object URL for an uploaded picture (rehydrated from OPFS after reload,
    // app/image.js) and its raw persisted bytes
    imageUrl: appCtx.imageUrl, imageBytes: appCtx.imageBytes,
    // transcript export — subtitles (SRT/VTT), the elegant by-speaker read, the full-processing JSON,
    // and the process trace — built from the live organ doc or rebuilt from the persisted substrate.
    transcriptExport: appCtx.transcriptExport, transcriptFormats: appCtx.transcriptFormats,
    // the manual override for the automated signal/noise gate — "transcribe this anyway" (skipped),
    // or a retry after a stop/error, rebuilt from the source's own kept audio bytes (transcript.js).
    forceTranscribe: appCtx.forceTranscribe,
    // the Listen surface's layered reading: the whole formatted/raw word view with read-state +
    // referents + chapters (transcriptView), the topic chapters alone, and the per-word span inspector.
    transcriptView: appCtx.transcriptView, transcriptChapters: appCtx.transcriptChapters, spanLayers: appCtx.spanLayers,
  });
};
