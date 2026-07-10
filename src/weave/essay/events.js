// EO: INS·DEF(Void → Entity,Kind, Making,Dissecting) — EssayEvent constructors + kinds
// essay/events.js — the append-only EssayEvent log (docs/longform-generation.md).
//
// Longform, made a projection: the essay is not accumulated in a prompt, it is
// a sequence of small broadcasts whose commitments are appended here and whose
// assembled text is projectEssay(log) (project.js). Same Given-Log discipline
// as deep research (research/events.js) and the task graph: append-only, frozen
// at entry, pure fold, replay-stable. Nothing is stored that cannot be replayed.
//
// The unit is the COMMITMENT — a claim bound to spans — and the words are
// downstream: prose is rendered from bound commitments, never the source of
// them (the spec's inversion). Fourteen kinds:
//
//   plan          the spine DAG drafted from a whole-log fold        DEF
//   enter         a section's workspace opens; deps declared        SEG (doorway)
//   relit         declared dependencies re-illuminated from the log
//   spans         the spans lit for this section's fold             SIG
//   propose       a candidate claim, wide and cheap                 INS
//   bind          a claim bound to spans — a commitment             SYN
//   veto          a candidate struck (unbound, contradicts, repeats)
//   thread-open   a promise made, with its due point
//   thread-pay    a promise kept
//   thread-defer  a due promise explicitly moved to a new due point
//   revise        the spine moved: reorder|insert|split|merge|replan REC (bounded)
//   accept        the section commits; its prose lives HERE, in the log
//   checkpoint    the carry snapshotted at the doorway — the pause/resume/
//                 intervene boundary
//   finding       a reconciliation (or gate) finding, scoped to a section
//
// `t` is a LOGICAL time — the caller's append index — never a wall clock, so
// the projection is byte-reproducible. Section ids come from the spine; claims
// are `claim:N`, threads `thread:N`, minted by the driver.

export const EKIND = Object.freeze({
  PLAN: 'plan', ENTER: 'enter', RELIT: 'relit', SPANS: 'spans',
  PROPOSE: 'propose', BIND: 'bind', VETO: 'veto',
  THREAD_OPEN: 'thread-open', THREAD_PAY: 'thread-pay', THREAD_DEFER: 'thread-defer',
  REVISE: 'revise', ACCEPT: 'accept', CHECKPOINT: 'checkpoint', FINDING: 'finding',
});

// The bounded spine motions, cheapest to most expensive (the revision
// discipline). Only `replan` may touch the thesis.
export const REVISE_OPS = Object.freeze(['reorder', 'insert', 'split', 'merge', 'replan']);

// What reconciliation (and a failed gate) can find. `gate-failed` is the
// driver's honest record of a section that would not pass after its retry —
// visible, never silently dropped.
export const FINDING_KINDS = Object.freeze([
  'contradiction', 'unpaid-thread', 'redundancy', 'off-thesis',
  'thesis-contradiction', 'gate-failed', 'surface-mismatch',
]);

const freeze = (e) => Object.freeze(e);
const list = (xs) => Object.freeze([...(xs || [])]);

// The spine drafted — one fold over the whole log under a chosen frame, before
// any section is written. The full spine rides in the event so the projection
// replays structure without reaching outside the log.
export const planDrafted = ({ spine, t = 0 }) => {
  if (!spine || !spine.thesis) throw new TypeError('planDrafted: spine with thesis required');
  return freeze({ kind: EKIND.PLAN, spine, t });
};

export const sectionEntered = ({ sectionId, deps = [], t = 0 }) => {
  if (!sectionId) throw new TypeError('sectionEntered: sectionId required');
  return freeze({ kind: EKIND.ENTER, sectionId, deps: list(deps), t });
};

// Declared dependencies pulled back from the log on entry — long-range
// coherence as declared edges, not hope. The carry keeps the claim; this
// re-lights the texture.
export const depRelit = ({ sectionId, dependsOn = [], t = 0 }) => {
  if (!sectionId) throw new TypeError('depRelit: sectionId required');
  return freeze({ kind: EKIND.RELIT, sectionId, dependsOn: list(dependsOn), t });
};

export const spansLit = ({ sectionId, spanIds = [], t = 0 }) => {
  if (!sectionId) throw new TypeError('spansLit: sectionId required');
  return freeze({ kind: EKIND.SPANS, sectionId, spanIds: list(spanIds), t });
};

// A candidate claim, proposed wide and cheap at the claim level — never as
// exploratory prose. Generation is the scarce sequential resource.
export const claimProposed = ({ sectionId, claimId, claim, t = 0 }) => {
  if (!sectionId || !claimId) throw new TypeError('claimProposed: sectionId and claimId required');
  return freeze({ kind: EKIND.PROPOSE, sectionId, claimId, claim: String(claim ?? ''), t });
};

// A claim bound to spans — a Commitment, the atomic unit of the essay.
// `prop` is the PRE-LINGUISTIC payload (proposition.js): the claim string is
// its text projection, one surface among many — a chart datum is another
// projection of the same payload, which is why the modalities cannot
// disagree. No unbound assertion survives veto, so spanRefs is required
// non-empty.
export const claimBound = ({ sectionId, claimId, claim, prop = null, spanRefs = [], t = 0 }) => {
  if (!sectionId || !claimId) throw new TypeError('claimBound: sectionId and claimId required');
  if (!spanRefs || !spanRefs.length) throw new TypeError('claimBound: spanRefs required (every claim binds to at least one span)');
  return freeze({ kind: EKIND.BIND, sectionId, claimId, claim: String(claim ?? ''), prop: prop ?? null, spanRefs: list(spanRefs), t });
};

export const candidateVetoed = ({ sectionId, claimId = null, claim, reason, t = 0 }) => {
  if (!sectionId) throw new TypeError('candidateVetoed: sectionId required');
  if (!reason) throw new TypeError('candidateVetoed: reason required (nothing is struck silently)');
  return freeze({ kind: EKIND.VETO, sectionId, claimId, claim: String(claim ?? ''), reason: String(reason), t });
};

// A promise made, not yet paid. `dueBy` names the section that must pay it
// (null = by the end of the essay).
export const threadOpened = ({ threadId, text, openedAt, dueBy = null, t = 0 }) => {
  if (!threadId) throw new TypeError('threadOpened: threadId required');
  if (!openedAt) throw new TypeError('threadOpened: openedAt (sectionId) required');
  return freeze({ kind: EKIND.THREAD_OPEN, threadId, text: String(text ?? ''), openedAt, dueBy, t });
};

export const threadPaid = ({ threadId, sectionId, t = 0 }) => {
  if (!threadId || !sectionId) throw new TypeError('threadPaid: threadId and sectionId required');
  return freeze({ kind: EKIND.THREAD_PAY, threadId, sectionId, t });
};

// A due thread explicitly deferred — with a NEW due point, never dropped
// silently (the thread-accounting gate).
export const threadDeferred = ({ threadId, sectionId, dueBy, t = 0 }) => {
  if (!threadId || !sectionId) throw new TypeError('threadDeferred: threadId and sectionId required');
  if (!dueBy) throw new TypeError('threadDeferred: dueBy required (deferral names a new due point)');
  return freeze({ kind: EKIND.THREAD_DEFER, threadId, sectionId, dueBy, t });
};

// The spine moved. `op` is the grain; `detail` carries exactly what the
// projection needs to replay the motion (reorder: {order}, insert: {section,
// afterId}, split: {of, into}, merge: {of, into}, replan: {spine}). The
// restructuring is the true progress signal, so it is loud in the log.
export const spineRevised = ({ op, sectionIds = [], detail = null, t = 0 }) => {
  if (!REVISE_OPS.includes(op)) throw new TypeError(`spineRevised: op must be one of ${REVISE_OPS.join('|')}`);
  return freeze({ kind: EKIND.REVISE, op, sectionIds: list(sectionIds), detail: detail ?? null, t });
};

// The section commits. The FULL prose lives here — the log is where the
// essay-so-far lives; only the compressed trace rides forward in the carry.
// `sentences` carry the render's claim-grain verdicts (asymmetric granularity:
// coarse generation, fine verification) — { text, boundTo: spanRef|null,
// glue: bool } per kept sentence, `dropped` counting the smuggled assertions
// struck after render. `prompt`/`raw` embed the one generative call's audit,
// so the accept event states its own generative honesty from the log alone.
// `modality` names which projection this section rendered (a slot property of
// the schema, never the model's choice); `surface` carries the non-text
// projection when there is one (the chart object, the pull quote) while
// `prose` stays the text projection so the assembled essay always reads.
// `seam` is the form-owned transition INTO this section — rendered from both
// neighbors, in whatever modality the form chose (text · divider · pullquote).
export const sectionAccepted = ({ sectionId, terminalClaim, prose = '', sentences = [], dropped = 0, modality = 'text', surface = null, seam = null, model = null, prompt = null, raw = null, t = 0 }) => {
  if (!sectionId) throw new TypeError('sectionAccepted: sectionId required');
  const ss = (sentences || []).map((s) => freeze({
    text: String(s.text ?? ''), boundTo: s.boundTo ?? null, glue: !!s.glue,
  }));
  return freeze({
    kind: EKIND.ACCEPT, sectionId, terminalClaim: String(terminalClaim ?? ''),
    prose: String(prose ?? ''), sentences: Object.freeze(ss), dropped: dropped | 0,
    modality: String(modality || 'text'), surface: surface ?? null, seam: seam ?? null,
    model, prompt: prompt ?? null, raw: raw ?? null, t,
  });
};

// The doorway. Forgets (the section's spans decay to zero), checkpoints (the
// carry snapshot rides in the event), and is the single control point — a
// human may inject a correction into the carry here before the next section
// enters (driver.js `resume`).
export const carryCheckpoint = ({ sectionId, carry, t = 0 }) => {
  if (!sectionId) throw new TypeError('carryCheckpoint: sectionId required');
  if (!carry || typeof carry.thesis !== 'string') throw new TypeError('carryCheckpoint: carry with thesis required');
  return freeze({ kind: EKIND.CHECKPOINT, sectionId, carry, t });
};

export const reconcileFinding = ({ kind, sectionId = null, detail = null, t = 0 }) => {
  if (!FINDING_KINDS.includes(kind)) throw new TypeError(`reconcileFinding: kind must be one of ${FINDING_KINDS.join('|')}`);
  return freeze({ kind: EKIND.FINDING, finding: kind, sectionId, detail: detail ?? null, t });
};
