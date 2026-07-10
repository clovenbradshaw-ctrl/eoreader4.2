// EO: INS·NUL(Void → Entity, Making,Clearing) — ResearchEvent constructors / log
// research/events.js — the append-only ResearchEvent log (docs/deep-research-log.md).
//
// Deep research, made a projection: the report is not written, it is projected.
// Every fact is an extractive span at a pinned archive address; the unit of the
// report is a grounded proposition whose canonical form is a span at a pinned
// snapshot. Facts are SELECTED, never generated. The whole document is
// projectReport(log) (project.js) — the same Given-Log discipline as the task
// graph (src/tasks/, docs/frame-holon.md): append-only, frozen at entry, path
// ids, pure fold, replay-stable. Nothing is stored that cannot be replayed.
//
// Eleven kinds, each carrying its cube operator reading (the Act face,
// core/operators.js) so the coverage grid is a fold, not an assertion:
//
//   open     a frame (root question or a pushed sub-question)      DEF / INS
//   pin      a source resolved to a dated archive snapshot          — (provenance anchor)
//   read     a span read from a pinned source, with its bind        SIG
//            score against the frame vs. the null (fieldVerdict)
//   extract  a span promoted to a grounded proposition — the        — (selection)
//            span address IS the fact (never generative)
//   eva      the enacted-loop test of a proposition against the     EVA
//            frame: verdict (confirm/strain), surprise, strain Δ
//   con      a proposition-equivalence edge: corroborate or         CON
//            contradict
//   rec      strain broke the frame: forcedBy (the EVAs), strain    REC
//            sum at firing, the new frame terms
//   void     a measured absence: the terrain (never-set /           NUL → DEF-to-VOID
//            elsewhere / Kind-gap / Entity-gap)
//   ask      a question surfaced to the user with its trigger       — (human input, logged)
//   answer   the user's reply to an ask                             — (human input, logged)
//   promote  a proposition enters the report at a section           — (projection input)
//   phrase   the ONE bind-checked model call per section, with      — (VERIFY, logged)
//            its per-sentence bind-back verdicts (an evolution of
//            the spec: the VERIFY step is itself an event, so the
//            report can state its own generative honesty from the
//            log alone)
//
// `t` is a LOGICAL time — the caller's append index — never a wall clock, so the
// projection is byte-reproducible. Ids are paths for frames (`root`, `root.0`),
// minted by the driver; pins and propositions carry their own id namespaces
// (`pin:N`, `prop:N`, `ask:N`).

export const RKIND = Object.freeze({
  OPEN: 'open', PIN: 'pin', READ: 'read', EXTRACT: 'extract', EVA: 'eva',
  CON: 'con', REC: 'rec', VOID: 'void', ASK: 'ask', ANSWER: 'answer',
  PROMOTE: 'promote', PHRASE: 'phrase',
});

// The Act-face operator each event kind enacts (the spec's table). Kinds mapped
// to null are not acts on the topic — they are provenance, selection, or human
// input, logged but off the coverage grid.
export const OPERATOR_OF = Object.freeze({
  open: 'DEF', pin: null, read: 'SIG', extract: null, eva: 'EVA',
  con: 'CON', rec: 'REC', void: 'NUL', ask: null, answer: null,
  promote: null, phrase: null,
});

const freeze = (e) => Object.freeze(e);
const list = (xs) => Object.freeze([...(xs || [])]);

// A frame opens — the root question, or a pushed sub-question. `subject` is the
// frame's subject terms (the modality-blind floor the binds measure against);
// `scope` pins the preliminaries (corpus / window / leading domain), each fixed
// by a preliminary ask or by the caller.
export const openResearch = ({ id, parentId = null, question, subject = [], scope = null, depth = 0, t = 0 }) => {
  if (!id) throw new TypeError('openResearch: id required');
  return freeze({
    kind: RKIND.OPEN, id, parentId, question: String(question ?? ''),
    subject: list(subject), scope: scope ?? null, depth: depth | 0, t,
  });
};

// A source URL resolved to (or created as) a dated archive snapshot — the
// provenance anchor. `snapshotUrl`/`snapshotId`/`capturedAt` come from
// archive/pin.js; `contentHash` fingerprints the exact bytes the spans index
// into, so the citation cannot move under the report. A pin with no snapshot
// (archive unreachable, or a pasted source with no URL) still carries the hash —
// the embedded span is the record, the link is corroboration.
export const pinSource = ({ id, url = null, title = null, snapshotUrl = null, snapshotId = null, capturedAt = null, contentHash, chars = 0, t = 0 }) => {
  if (!id) throw new TypeError('pinSource: id required');
  if (!contentHash) throw new TypeError('pinSource: contentHash required (the span index is rooted in it)');
  return freeze({
    kind: RKIND.PIN, id, url, title, snapshotUrl, snapshotId, capturedAt,
    contentHash: String(contentHash), chars: chars | 0, t,
  });
};

// A span read from a pinned source, with its bind against the current frame vs.
// the null. `bind` is the fieldVerdict-side measurement: { score, pass } — a
// span is relevant iff it binds above the null, a measurement, not a model call.
export const readSpan = ({ frameId, pinId, span, bind = null, t = 0 }) => {
  if (!frameId || !pinId) throw new TypeError('readSpan: frameId and pinId required');
  return freeze({ kind: RKIND.READ, frameId, pinId, span: spanOf(span), bind: bind ? freeze({ ...bind }) : null, t });
};

// A span promoted to a grounded proposition. The span address (pin + offsets) IS
// the fact; `text` embeds the exact bytes so the artifact outlives the link.
// `address` is the cube address of the reported change ({ op, grain, terrain,
// stance }) — read from the injected classifier or the lexical fallback, checked
// by projectReport against core/cube.js coherence (the residue check).
export const extractProposition = ({ id, frameId, pinId, span, terms = [], address = null, t = 0 }) => {
  if (!id) throw new TypeError('extractProposition: id required');
  if (!frameId || !pinId) throw new TypeError('extractProposition: frameId and pinId required');
  return freeze({
    kind: RKIND.EXTRACT, id, frameId, pinId, span: spanOf(span),
    terms: list(terms), address: address ? freeze({ ...address }) : null, t,
  });
};

// The enacted-loop test of a proposition against the frame as it stood when the
// proposition arrived (the arrow of time — importance is causal, never peeked).
// `band`/`threshold` are the causal scale AS IT STOOD when this EVA was judged
// (calibrateReader over past surprises only) — logged so the whole surf is
// auditable: every verdict can be re-derived from the event alone.
export const evaTest = ({ propId, frameId, verdict, surprise = 0, strainDelta = 0, strain = 0, band = null, threshold = null, t = 0 }) => {
  if (!propId || !frameId) throw new TypeError('evaTest: propId and frameId required');
  if (verdict !== 'confirm' && verdict !== 'strain') throw new TypeError('evaTest: verdict must be confirm|strain');
  return freeze({
    kind: RKIND.EVA, propId, frameId, verdict,
    surprise: num(surprise), strainDelta: num(strainDelta), strain: num(strain),
    band: band == null ? null : num(band), threshold: threshold == null ? null : num(threshold), t,
  });
};

// A proposition-equivalence edge — two spans assert the same proposition above
// threshold (corroborate) or its negation (contradict). Mechanical
// (perceiver/proposition-equivalence.js or the offline term-overlap fallback).
export const conEdge = ({ relation, a, b, sim = 0, t = 0 }) => {
  if (relation !== 'corroborate' && relation !== 'contradict') throw new TypeError('conEdge: relation must be corroborate|contradict');
  if (!a || !b) throw new TypeError('conEdge: a and b prop ids required');
  return freeze({ kind: RKIND.CON, relation, a, b, sim: num(sim), t });
};

// Strain broke the frame. `forcedBy` are the prop ids whose EVAs accumulated the
// break — the most important things in the corpus; `from`/`to` are the frame
// terms before/after; `trigger` is 'accumulation' (grind) or 'impulse' (shock).
export const recFrame = ({ frameId, forcedBy = [], strainSum = 0, from = [], to = [], trigger = 'accumulation', t = 0 }) => {
  if (!frameId) throw new TypeError('recFrame: frameId required');
  return freeze({
    kind: RKIND.REC, frameId, forcedBy: list(forcedBy), strainSum: num(strainSum),
    from: list(from), to: list(to), trigger, t,
  });
};

// A measured absence — the VOID gate's verdict made an event. `terrain` triages
// the silence: 'never-set' (the pinned set never addressed it), 'elsewhere' (a
// real referent, not in this corpus), 'Kind-gap' (a relation-type the frame
// never opened), 'Entity-gap' (the specific document is missing). "The record is
// silent on X" is often the story; this says which silence it is.
export const VOID_TERRAINS = Object.freeze(['never-set', 'elsewhere', 'Kind-gap', 'Entity-gap']);
export const voidAbsence = ({ frameId, terrain, receipt = '', term = null, t = 0 }) => {
  if (!frameId) throw new TypeError('voidAbsence: frameId required');
  if (!VOID_TERRAINS.includes(terrain)) throw new TypeError(`voidAbsence: terrain must be one of ${VOID_TERRAINS.join('|')}`);
  return freeze({ kind: RKIND.VOID, frameId, terrain, receipt: String(receipt), term, t });
};

// A question surfaced to the user, with the measured condition that fired it.
// Triggers are MECHANICAL — never a schedule, never a model's whim:
//   disambiguate  the subject binds to more than one entity
//   domain        the leading domain is unspecified (scopes the grid)
//   corpus        the pinned set / window is unset
//   void          a sub-question's field is measurably flat (fieldIsVoid)
//   fork          two sources strain in opposite directions, no tie-break
//   rec           a frame break — the topic just got reconceived
//   depth         a resolved frame spawned more children than budget
export const ASK_TRIGGERS = Object.freeze(['disambiguate', 'domain', 'corpus', 'void', 'fork', 'rec', 'depth']);
export const askUser = ({ id, frameId, trigger, text, options = [], t = 0 }) => {
  if (!id) throw new TypeError('askUser: id required');
  if (!ASK_TRIGGERS.includes(trigger)) throw new TypeError(`askUser: trigger must be one of ${ASK_TRIGGERS.join('|')}`);
  return freeze({ kind: RKIND.ASK, id, frameId: frameId ?? null, trigger, text: String(text ?? ''), options: list(options), t });
};

export const answerAsk = ({ askId, reply, t = 0 }) => {
  if (!askId) throw new TypeError('answerAsk: askId required');
  return freeze({ kind: RKIND.ANSWER, askId, reply: String(reply ?? ''), t });
};

// A proposition enters the report at a section (a frame). Pure projection input:
// promote records the selection; the ORDER within the section is significance,
// computed by the projection from the eva/rec record, never stored.
export const promoteProposition = ({ propId, frameId, t = 0 }) => {
  if (!propId || !frameId) throw new TypeError('promoteProposition: propId and frameId required');
  return freeze({ kind: RKIND.PROMOTE, propId, frameId, t });
};

// The one phrasing call per section, bound back to the spans. `sentences` carry
// the per-sentence verdict: { text, boundTo: propId|null, glue: bool }. A
// sentence that binds above the null is clickable; one that does not is greyed
// as glue (marked, non-clickable, carrying no claim) or dropped. `dropped`
// counts sentences removed entirely. This IS the VERIFY log line
// ("N/N sentences bind, K glue, D dropped").
// `prompt`/`raw` embed the exact messages sent and the exact text returned —
// the audit of the run's ONE generative step, in the log like everything else.
export const phraseSection = ({ frameId, sentences = [], dropped = 0, model = null, prompt = null, raw = null, t = 0 }) => {
  if (!frameId) throw new TypeError('phraseSection: frameId required');
  const ss = (sentences || []).map((s) => freeze({
    text: String(s.text ?? ''), boundTo: s.boundTo ?? null, glue: !!s.glue,
  }));
  return freeze({
    kind: RKIND.PHRASE, frameId, sentences: Object.freeze(ss), dropped: dropped | 0,
    model, prompt: prompt ?? null, raw: raw ?? null, t,
  });
};

const spanOf = (span) => {
  const s = span || {};
  return freeze({
    start: s.start | 0, end: s.end | 0, text: String(s.text ?? ''),
    sentence: s.sentence ?? null,
  });
};
const num = (x) => (Number.isFinite(+x) ? Math.round(+x * 1000) / 1000 : 0);
