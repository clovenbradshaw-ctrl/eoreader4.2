// EO: INS(Void → Entity, Making) — append-only edit-event log
// doc/events.js — EO change tracking as an append-only log.
//
// A written document is not a mutable buffer; it is a fold of edit events, the
// same way the graph is a fold of the reading log and the deep-research report
// is a fold of the research log. Every edit — an inserted line, a rewrite, a
// deletion — is a CHANGE_PROPOSE event carrying its GROUNDING CHECK against the
// Record; accepting or rejecting it is another event. Nothing is silently
// mutated, so the document's whole history (who · when · what it grounds to) is
// replayable and auditable, and an edit that "leaves the record" can never be
// kept without being marked.
//
// This mirrors ProseMirror's "changes are first-class values" and Google Docs'
// suggesting mode, but the value is an event on the log, not an editor-internal
// object — so it survives reload, export, and audit like everything else here.

export const DKIND = {
  CREATE: 'DOC_CREATE',      // a document is opened
  BLOCK:  'BLOCK_ADD',       // a committed block (seeding, or a direct edit in Editing mode)
  EDIT:   'BLOCK_EDIT',      // a fine, committed edit to one block — one typing burst (Editing mode)
  PROPOSE: 'CHANGE_PROPOSE', // a tracked change, awaiting review (Suggesting mode)
  ACCEPT: 'CHANGE_ACCEPT',   // a change folded into the document
  REJECT: 'CHANGE_REJECT',   // a change dropped
  REVERT: 'DOC_REVERT',      // the document restored to an earlier point in the log
};

// The kinds an edit can take — the three primitive document operations.
export const CHANGE_KINDS = ['insert', 'replace', 'delete'];

// Every event carries two clocks: `t`, a monotonic sequence used only for
// ordering, and `ts`, the wall-clock millisecond the edit happened (0 when
// unknown). The projection reads neither — the log's array order is the truth —
// but the history view reads `ts` to bucket edits by age (recent shown fine, old
// coalesced). Keeping `ts` on the event, not derived at view time, is what makes
// the timeline replay-stable: the same log always folds to the same history.
const ev = (kind, rest) => ({ kind, t: rest.t ?? 0, ts: rest.ts ?? 0, ...rest });

export const docCreate = ({ id, title, author = 'you', t = 0, ts = 0 }) =>
  ev(DKIND.CREATE, { docId: id, title: title || 'Untitled document', author, t, ts });

// A committed block. `grounding` is a grounding-check result (see doc/ground.js):
// { kind:'source', span, srcId, host } when it binds to a recorded span, or
// { kind:'void' } when it is the writer's own words, marked so.
// `html` carries the block's inline rich formatting (bold/italic/links/…); `text`
// is always the plain-text projection (what grounding and search read). `type`
// is the block's shape: p · h1 · h2 · h3 · ul · ol · quote (default p).
export const blockAdd = ({ id, docId, blockId, text, html = '', type = 'p', grounding, author = 'you', t = 0, ts = 0 }) =>
  ev(DKIND.BLOCK, { id, docId, blockId, text: String(text || ''), html: String(html || ''), type: type || 'p', grounding: grounding || { kind: 'void' }, author, t, ts });

// A fine, committed edit to one block — the net text of a single typing burst in
// Editing mode. It carries the block's text BEFORE the burst (`before`/`beforeHtml`)
// and AFTER, so the history view can diff them character by character. `grounding`
// is the raw check result (as CHANGE_PROPOSE carries); the projection re-grounds
// the block on the new text, exactly as an accepted replace would. Folding is
// idempotent-shaped: replaying the same burst twice lands the same block text.
export const blockEdit = ({ id, docId, blockId, text = '', html = '', type = 'p', before = '', beforeHtml = '', grounding = null, author = 'you', t = 0, ts = 0 }) =>
  ev(DKIND.EDIT, { id, docId, blockId, text: String(text || ''), html: String(html || ''), type: type || 'p', before: String(before || ''), beforeHtml: String(beforeHtml || ''), grounding: grounding || { grounded: false }, author, t, ts });

// A tracked change. `kind` ∈ insert | replace | delete.
//   insert  — a new block placed after `afterId` (or at the end when null)
//   replace — `targetId`'s text becomes `text` (`before` keeps the old text)
//   delete  — `targetId` is removed (`before` keeps its text)
// `grounding` is the raw check result from groundText(text, record): it carries
// whether the change binds to the Record, and to which span.
export const changePropose = ({ id, docId, changeId, kind, targetId = null, afterId = null, blockId = null, text = '', html = '', type = 'p', before = '', grounding = null, author = 'you', when = '', t = 0, ts = 0 }) =>
  // `op` carries the change operation (insert/replace/delete); the event's own
  // `kind` field stays CHANGE_PROPOSE (do not name the operation `kind` — it would
  // shadow the event kind and the projection would never see the proposal).
  ev(DKIND.PROPOSE, { id, docId, changeId: changeId || id, op: kind, targetId, afterId, blockId: blockId || changeId || id, text: String(text || ''), html: String(html || ''), type: type || 'p', before: String(before || ''), grounding: grounding || { grounded: false }, author, when, t, ts });

export const changeAccept = ({ id, docId, changeId, t = 0, ts = 0 }) =>
  ev(DKIND.ACCEPT, { id, docId, changeId, t, ts });

export const changeReject = ({ id, docId, changeId, t = 0, ts = 0 }) =>
  ev(DKIND.REJECT, { id, docId, changeId, t, ts });

// Restore the document to an earlier point in its own log. `toIndex` is the log
// index of the last event to KEEP; the projection re-folds events [0 .. toIndex]
// and continues from there. This is append-only revert (Google Docs' "restore
// this version"): the whole history is preserved and the revert is itself a
// revertable event, so you can always undo a restore. `label` is the human name
// of the point restored to (for the history line). Fork is NOT an event here —
// forking copies the state at a point into a NEW document (the host's job).
export const docRevert = ({ id, docId, toIndex, label = '', author = 'you', t = 0, ts = 0 }) =>
  ev(DKIND.REVERT, { id, docId, toIndex: toIndex | 0, label: String(label || ''), author, t, ts });
