// EO: NUL·SEG(Field → Void, Clearing,Dissecting) — narrate the fold as trail beats
// reader/fold-narrative.js — turn one completed turn-stage into one human line.
//
// runTurn is a fold of its named stages (turn/pipeline.js PIPELINE): route · retrieve ·
// fold · … · llm · bind · factcheck · veto · settle. As each stage settles it reports a
// SAFE projection of itself through onStep(name, ctx, data) — the same `data` the audit
// keeps (turn/pipeline.js summarize). The web walk already lights the answer bubble's
// thinking trail beat by beat; this lights it on EVERY turn, so the reader watches the
// reading think — read the record, fold it, phrase, bind, check — BEFORE the answer lands,
// and there is never a dead, labelless wait.
//
// Pure and DOM-free: (name, data) → { kind, text } | null. `kind` selects the trail glyph
// (the surface's _trailStyle); `null` means a stage with nothing worth narrating (the
// book-keeping passes, or a pass that did nothing this turn — an empty inquiry, no vetoes).
// It reads only `data` (never ctx), so it can never leak an internal or reach the model.
//
// THE VERBOSE TRACE (`opts.verbose`). The curated view above is the DEFAULT — one honest line
// per stage that matters, the book-keeping passes silent. But the reader can ask to watch the
// WHOLE fold think in real time (rooms/reader/app.js foldBeat) — "show me everything the app is
// reading and doing." Verbose mode does two things and nothing else: (1) it un-silences the
// book-keeping stages, so EVERY pipeline stage that fired gets a beat, even a no-op one; and
// (2) it hangs the stage's full `data` projection off the beat as openable `detail` rows, plus
// the grounded PROMPT text itself on the `prompt` stage — the same bytes the post-hoc "what it
// was prompted" panel shows, surfaced as the prompt is built rather than after. It is still the
// SAFE `data` projection (summarize(), turn/pipeline.js) — never ctx — so verbosity widens what
// the reader sees of the audit, never what the model is fed. Default off → byte-identical to the
// curated trail, and the golden fold-narrative test stands.

const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

// A label if the value is a non-empty string or a finite number; else null. Keeps the surf's
// interpretive read from ever rendering "[object Object]" out of an unexpected shape.
const lab = (v) => (typeof v === 'string' && v.trim()) ? v.trim()
  : (typeof v === 'number' && Number.isFinite(v)) ? String(v) : null;

// How the surf arrested — the discipline it rode. 'bayesian-void' stops only where the surprise
// beat the document's own noise floor (the hallucination-budget boundary); the default
// 'bayesian-figure' stops on the reach's surprise peaks.
const surfRode = (surf) => surf?.rode === 'bayesian-void' ? 'arrested on the void boundary'
  : surf?.rode === 'bayesian-figure' ? 'arrested on surprise peaks' : null;

// The interpretive read, present only when the significance column rode (a meaning embedder and
// prior were supplied): the atmosphere's verdict and tone, the paradigm call, and whether the
// confabulation guard held. A compact "·"-joined line, or null on the plain structural surf.
const surfRead = (surf) => {
  if (!surf) return null;
  const parts = [];
  const v = lab(surf.atmosphere?.verdict); if (v) parts.push(v);
  const tone = lab(surf.atmosphere?.tone); if (tone) parts.push(tone);
  // The relativistic read (D4): distinct local keys among the departed windows — the document
  // reading in several keys, not one. Only when it genuinely departs (≥2 distinct local tones).
  const localTones = new Set((surf.atmosphere?.anomalousWindows || []).map((w) => w.tone?.label).filter(Boolean));
  if (localTones.size >= 2) parts.push(`${localTones.size} local keys`);
  const para = lab(surf.paradigm); if (para) parts.push(para);
  if (surf.stance && surf.stance.guard) parts.push('guard held');
  return parts.length ? parts.join(' · ') : null;
};

// The stages worth speaking, each mapped to the honest line its `data` supports. Kept in
// step order for reading; a stage absent here (expect, converse, predict, answerable, gate,
// settle) is internal book-keeping the reader needn't watch, so it returns null and the
// trail simply doesn't stack a beat for it. This is the CURATED headline; verbose mode
// (foldNarrative below) reuses it and un-silences the rest.
const curatedBeat = (name, d) => {
  switch (name) {
    case 'route':
      return { kind: 'think', text: d.meta ? 'Reading the conversation' : 'Taking in the question' };
    case 'retrieve':
      return d.n > 0
        ? { kind: 'read', text: `Read ${plural(d.n, 'passage')} from the record` }
        : { kind: 'warn', text: 'The record had nothing close' };
    case 'inquire':
      return d.added > 0
        ? { kind: 'think', text: `Asked ${plural((d.asked || []).length, 'question')} of the record` }
        : null;
    case 'fold': {
      const raw = d.surf && d.surf.stops;
      const stops = Array.isArray(raw) ? raw.length : raw;   // surf.stops is the stop cursors
      const text = stops > 0 ? `Folded the reading — ${plural(stops, 'stop')}` : 'Folded the reading';
      // AUDIT THE SURF: when the fold carries the surfer's reading path (pipeline.js buildSurfPath),
      // ride it onto the beat so the trail can be OPENED onto the walk itself — the cursors it
      // arrested on, what it read at each, and the surprise that stopped it. Absent a path (a doc
      // with no stops, or an older record), the beat is exactly the line it has always been.
      const path = (d.surf && Array.isArray(d.surf.path) ? d.surf.path : []).filter(p => p && p.text);
      if (!path.length) return { kind: 'fold', text };
      return { kind: 'fold', text, surf: { path, rode: surfRode(d.surf), read: surfRead(d.surf) } };
    }
    case 'predict':
      // the engine's own grounded generation (src/write) — the draft the fluent reply is
      // checked against. It fires on both paths (the extractive gate-terminated turn and the
      // full generative one), so it gives every turn a beat for the answer taking shape.
      return d.draft ? { kind: 'fold', text: d.confident ? 'Drafted a grounded answer' : 'Drafted an answer' } : null;
    case 'reason':
      return d.steps > 0 ? { kind: 'think', text: `Reasoned in ${plural(d.steps, 'step')}` } : null;
    case 'prompt':
      return { kind: 'think', text: 'Built the grounded prompt' };
    case 'llm':
      return { kind: 'phrase', text: 'Phrasing the answer' };
    case 'bind':
      return d.cited > 0 ? { kind: 'bind', text: `Bound ${plural(d.cited, 'citation')}` } : null;
    case 'factcheck': {
      const c = d.corroborated || 0, x = d.contradicted || 0, u = d.unsupported || 0;
      if (!(c || x || u)) return null;
      const parts = [];
      if (c) parts.push(`${c} corroborated`);
      if (x) parts.push(`${x} contradicted`);
      if (u) parts.push(`${u} unsupported`);
      return { kind: x ? 'warn' : 'check', text: `Checked against the record — ${parts.join(', ')}` };
    }
    case 'revise':
      return d.attempts > 0 ? { kind: 'warn', text: `Answered again — ${plural(d.attempts, 'pass', 'passes')}` } : null;
    case 'veto':
      return (d.fired && d.fired.length)
        ? { kind: 'warn', text: `Flagged ${plural(d.fired.length, 'unsupported claim')}` }
        : null;
    case 'validate':
      // The Born-measured reaction speaks only when it ran and weighed negative — the reader
      // reacted to its own draft and the good frame did not hold. It either went BACK (a
      // regenerate), was HELD for the honest absence, or, while streaming, rides flagged. A
      // positive reaction or a no-op is silent — a beat the reader needn't watch.
      if (!d.ran || d.positive) return null;
      return { kind: 'warn', text: d.wentBack
        ? 'Reacted to my own draft — negative, so I answered again'
        : d.held
          ? 'Reacted to my own draft — negative, so I held it back'
          : "Reacted to my own draft — it didn't hold up" };
    default:
      return null;
  }
};

// ── the verbose trace ────────────────────────────────────────────────────────
// A headline for EVERY stage — including the book-keeping passes the curated view keeps
// silent, and the no-op turns (nothing bound, no veto fired) it drops. Used only when the
// curated switch returned null; when it spoke, its own line and glyph win.
const VERBOSE_LABEL = {
  route: 'Took in the question', expect: 'Set what to expect', converse: 'Folded the conversation',
  retrieve: 'Searched the record', inquire: 'Asked the record of itself', fold: 'Folded the reading',
  predict: 'Drafted a read internally', answerable: 'Judged what it can answer',
  gate: 'Checked the grounding gate', reason: 'Reasoned it through', prompt: 'Built the grounded prompt',
  llm: 'Phrasing the answer', bind: 'Bound the citations', factcheck: 'Checked against the record',
  revise: 'Weighed a revision', veto: 'Screened for unsupported claims', absence: 'Weighed the silence',
  validate: 'Reacted to its own draft', settle: 'Settled the turn',
  murmur: 'Took its impression', reflect: 'Reflected on the relations', judgments: 'Logged its judgments',
};
const VERBOSE_KIND = {
  retrieve: 'read', fold: 'fold', predict: 'fold', prompt: 'think', llm: 'phrase', bind: 'bind',
  factcheck: 'check', judgments: 'check', settle: 'done',
};

// The keys already shown elsewhere on the beat (surf rides its own audit block; the prompt
// text and the raw operator cells render specially) — kept out of the flat detail rows so a
// field is never shown twice.
const DETAIL_SKIP = new Set(['faces', 'surf', 'path', 'promptText']);

// Flatten the stage's safe `data` projection into openable label/value rows — scalars as
// themselves, a scalar array joined, an object descended one label deep (referential.w,
// shape.intent, streamed.chars), a non-scalar array reduced to its count. Total and DOM-free;
// it reads only what summarize() already put on `data`, so it can surface nothing ctx-private.
const flattenDetail = (d, prefix = '') => {
  const rows = [];
  for (const [k, v] of Object.entries(d || {})) {
    if (DETAIL_SKIP.has(k) || v == null) continue;
    const label = prefix ? `${prefix}·${k}` : k;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      const s = String(v).trim();
      if (s) rows.push({ label, value: s });
    } else if (Array.isArray(v)) {
      if (!v.length) continue;
      rows.push({ label, value: v.every((x) => typeof x !== 'object') ? v.join(', ') : `${v.length}` });
    } else if (t === 'object') {
      rows.push(...flattenDetail(v, label));
    }
  }
  return rows;
};

// foldNarrative — the curated headline by default; the WHOLE fold, openable, when verbose.
// Verbose keeps the curated line and glyph wherever a stage already spoke (so "Folded the
// reading — 3 stops" and its surf audit are untouched), un-silences the rest with a plain
// label, and hangs each stage's flattened `data` — and, on the prompt stage, the built prompt
// text — off the beat as `detail`/`prompt` for the surface to reveal on demand.
export const foldNarrative = (name, data = {}, opts = {}) => {
  const d = data || {};
  const curated = curatedBeat(name, d);
  if (!opts.verbose) return curated;
  const head = curated || (VERBOSE_LABEL[name]
    ? { kind: VERBOSE_KIND[name] || 'think', text: VERBOSE_LABEL[name] }
    : null);
  if (!head) return null;   // a stage with no name we know — stay silent even here
  const beat = { kind: head.kind, text: head.text };
  if (head.surf) beat.surf = head.surf;
  const detail = flattenDetail(d);
  if (detail.length) beat.detail = detail;
  if (name === 'prompt' && typeof d.promptText === 'string' && d.promptText.trim()) beat.prompt = d.promptText;
  return beat;
};
