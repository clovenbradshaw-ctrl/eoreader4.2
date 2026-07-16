// EO: EVA·SYN(Network → Network,Lens, Tracing,Composing) — read a doc into layered EoT
// ingest/read.js — read an ingested document INTO EoT, layered with what the reading thinks.
//
// Ingestion admits a modality onto the spine (organs/in): a doc, a log, a graph. But
// admission is not READING. The predictive faculties the engine has grown — the γ-mass
// prediction over who acts next, the two surprise channels (novelty −log p and Bayesian
// D_KL), the connectivity reveal, the whole-document turning-point spine, and the enacted
// DEF·EVA·REC loop — are run LAZILY by later consumers (a turn, reading mode, a summary).
// So the moment of ingest does not, on its own, read anything: the thinking never happens
// until something downstream asks a pointed question.
//
// This is the step that closes that gap. It reads the admitted spine through EVERY
// predictive channel at once and renders the result as one EoT document — "processed into
// EO into EoT" (eot-emit.js), now with the reading's own thinking layered beside the
// structure it extracted. Turning it all into read-EoT, with different layers of what it
// is thinking, is exactly what an ingest is FOR.
//
// Two EoT layers, one surface (a `#` comment is legal EoT — §4.2 — so the whole document
// round-trips through parseEOT unchanged):
//
//   STRUCTURE  what the reading now takes to exist and connect — the append-only log read
//              back out as canonical EoT (emitEot). The round-trippable layer: feed it to
//              parseEOT and you recover the same events.
//
//   THINKING   what the reading PREDICTED and where it was SURPRISED. At each of the
//              document's turning points (the significance spine — the cursors of highest
//              Bayesian surprise, where the reading was rewritten), it records:
//                • the PREDICTION   — who it expected to act next (the γ-mass REC figures)
//                • the SURPRISAL    — −log p, the novelty channel (how improbable the line)
//                • the Δ-BELIEF     — D_KL, the significance channel (how far belief moved)
//                • the BRIDGE       — the connectivity reveal (which separation collapsed)
//                • the SURPRISES    — the named EO-tagged events that fired (INS/CON/DEF/SEG)
//              carried as EoT comments, so the thinking annotates the structure without
//              pretending to be witnessed fact (the same provenance discipline eot.js keeps:
//              a reading's notes are reafference — the conjecture, never the ground).
//
// The enacted DEF·EVA·REC loop (enact/) is a HIGHER holon than ingest, so this leaf does
// not import it. A caller that has it may inject `opts.enacted(doc) → { recs, stats }` (i.e.
// `enactedReadingTo(doc, last)`) to add the FRAME layer — where the reading's own frame
// broke and restructured, the effort of the read. Absent it, the two channels above are
// the read, and the read is still complete for what ingest alone can see.

import { emitEot } from './eot-emit.js';
import { readingAt, significanceSpine } from '../../perceiver/index.js';

const cache = new WeakMap();   // doc → default reading, keyed by identity (the log is append-only)

const round = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);

// readIngest(doc, opts) → { docId, units, unitText, stride, structure, turns, enacted, text }
//   structure  { lines, text, skipped } — emitEot over the log (the round-trippable layer)
//   turns      [{ idx, sentence, predicted, surprisalBits, bayesBits, bridge, surprises }]
//              the document's turning points, each read through the predictive channels
//   enacted    { recs, stats } when opts.enacted was injected, else null (the frame layer)
//   text       the whole reading as one EoT document — structure + thinking, comments legal
//
// Pure over the append-only log (like significanceSpine): computed at most once per doc for
// the default options, memoised by identity. Explicit options recompute and are not cached.
export const readIngest = (doc, opts = {}) => {
  // The STRUCTURE layer is uncapped by default: an ingest's EoT read carries 100% of the
  // log — every event of every source, whatever its modality — or it is not the read of
  // the ingest. A caller that wants a bounded render passes `max` explicitly, and the
  // truncation is then reported in `structure.skipped` (over-max), never silent.
  const { max = Infinity, k = 12, budget, enacted } = opts;
  const isDefault = max === Infinity && k === 12 && budget == null && typeof enacted !== 'function';
  if (isDefault) { const memo = cache.get(doc); if (memo) return memo; }

  const units = doc?.units || doc?.sentences || [];
  const docId = doc?.docId || 'doc';

  // ── STRUCTURE — the log read out as canonical EoT (the round-trippable layer). ──
  const structure = doc?.log
    ? emitEot(doc.log, { max })
    : { lines: [], text: '', skipped: [] };

  // ── THINKING — the turning points, each read through every predictive channel. ──
  // significanceSpine picks WHERE the reading turned (bounded, memoised); readingAt reads
  // the full predictive state THERE. The bridge channel is opt-in on readingAt, so ask for
  // it — a turning point is exactly where a structural reveal is most worth naming.
  const spine = doc?.log ? significanceSpine(doc, { k, ...(budget != null ? { budget } : {}) }) : { peaks: [], stride: 1, units: units.length };
  const turns = spine.peaks.map((idx) => {
    const r = readingAt(doc, idx, { bridge: true }) || {};
    return Object.freeze({
      idx,
      sentence: units[idx] ?? null,
      predicted: (r.predicted?.figures || []).slice(0, 4),
      surprisalBits: round(r.surprisalBits),
      bayesBits: round(r.bayesBits),
      bridge: r.bridge != null ? round(r.bridge) : null,
      bridgeAxis: r.bridgeAxis || null,
      surprises: (r.surprises || []).slice(0, 4).map((s) => ({ op: s.op, text: s.text })),
    });
  });

  // ── FRAME (injected) — where the reading's own frame broke and restructured. ──
  // enact/ is a higher holon; a caller passes enactedReadingTo(doc, last) so ingest never
  // reaches up. We keep only the RECs (the restructurings) and the convergence stats.
  let frame = null;
  if (typeof enacted === 'function') {
    try {
      const e = enacted(doc);
      if (e) frame = Object.freeze({ recs: (e.recs || []).map((r) => Object.freeze({
        layer: r.layer, cursor: r.cursor, from: r.from, strainSum: round(r.strainSum),
      })), stats: e.stats || null });
    } catch { frame = null; }
  }

  const text = renderReading({ docId, units: units.length, spine, structure, turns, frame });
  const reading = Object.freeze({ docId, units: units.length, unitText: units.slice(), stride: spine.stride, structure, turns, enacted: frame, text });
  if (isDefault) cache.set(doc, reading);
  return reading;
};

// Render the layered reading as one EoT document. The structure lines ride bare (canonical,
// round-trippable EoT); every thinking line is a `#` comment (legal EoT, parses to nothing),
// so the whole document is valid EoT that carries its own reading beside its own structure.
const renderReading = ({ docId, units, spine, structure, turns, frame }) => {
  const L = [];
  const c = (s) => L.push(`# ${s}`);
  const rule = (s) => L.push(`# ── ${s} ──`);

  c(`reading — ${docId}: ${units} unit${units === 1 ? '' : 's'}, turned at ${turns.length} point${turns.length === 1 ? '' : 's'}${spine.stride > 1 ? ` (read on a stride of ${spine.stride})` : ''}`);
  c('EoT — the reading\'s notes, held defeasibly: what it takes to exist and connect, and where it was surprised.');
  L.push('');

  rule('what it takes to exist and connect');
  if (structure.lines.length) L.push(...structure.lines);
  else c('(nothing extracted — an empty or unstructured spine)');
  // An explicitly capped render says so on its face — the surface never passes off a
  // truncated structure as the whole reading (the log itself always holds everything).
  const overMax = (structure.skipped || []).filter((s) => s.reason === 'over-max').length;
  if (overMax) c(`(capped render — ${overMax} further event${overMax === 1 ? '' : 's'} withheld by max; the log holds them all)`);
  L.push('');

  rule('where the reading turned — prediction · surprisal · Δbelief');
  if (!turns.length) c('(no turning points — a flat reading)');
  for (const t of turns) {
    const bits = [];
    if (t.surprisalBits != null) bits.push(`surprisal ${t.surprisalBits}b`);
    if (t.bayesBits != null) bits.push(`Δbelief ${t.bayesBits}b`);
    if (t.bridge != null) bits.push(`bridge ${t.bridge}${t.bridgeAxis ? ` (${t.bridgeAxis.join('—')})` : ''}`);
    if (t.predicted.length) bits.push(`predicted: ${t.predicted.join(', ')}`);
    c(`line ${t.idx}${t.sentence ? ` · ${clip(t.sentence)}` : ''}`);
    c(`  ${bits.join(' · ') || 'steady'}`);
    for (const s of t.surprises) c(`    ! ${s.text} (${s.op})`);
  }

  if (frame && frame.recs) {
    L.push('');
    rule('where the reading\'s frame broke — REC');
    if (!frame.recs.length) c('(the frame held — a converged reading)');
    for (const r of frame.recs) c(`${r.layer} frame reframed at line ${r.cursor}${r.strainSum != null ? ` (strain ${r.strainSum})` : ''}`);
    if (frame.stats) c(`effort — ${frame.stats.recCount ?? frame.recs.length} restructurings over the read${frame.stats.converged != null ? `, ${frame.stats.converged ? 'converged' : 'still turning'}` : ''}`);
  }

  return L.join('\n');
};

const clip = (s, n = 72) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// readingJsonl(doc, opts) → the reading as JSONL: one typed JSON record per line, the same
// append-only-stream shape the log and the audit already export in (reader/app.dc.js: "the
// log exports as JSONL"). A surface to SEE the reading of any document, machine-readable and
// diff-able. Record types, in reading order:
//
//   {type:'head'}        docId, counts (units, structure lines, turns, whether framed)
//   {type:'structure'}   one per canonical EoT line — `eot` is the round-trippable surface
//   {type:'turn'}        one per turning point — the full predictive read there
//   {type:'rec'}         one per frame restructuring (only when the enacted layer was injected)
//   {type:'stats'}       the enacted convergence stats (only when framed)
//
// Pure over the memoised readIngest — no model, no embedder. Each line is independently
// JSON.parse-able; the whole is valid JSONL. `opts` flow through to readIngest (k, max,
// budget, enacted).
export const readingJsonl = (doc, opts = {}) => {
  const r = readIngest(doc, opts);
  const rows = [];
  rows.push({ type: 'head', docId: r.docId, units: r.units, stride: r.stride,
              structure: r.structure.lines.length, turns: r.turns.length, framed: !!r.enacted });
  for (const eot of r.structure.lines) rows.push({ type: 'structure', eot });
  for (const t of r.turns) rows.push({ type: 'turn', idx: t.idx, sentence: t.sentence,
    surprisalBits: t.surprisalBits, bayesBits: t.bayesBits, bridge: t.bridge, bridgeAxis: t.bridgeAxis,
    predicted: t.predicted, surprises: t.surprises });
  if (r.enacted) {
    for (const rec of r.enacted.recs) rows.push({ type: 'rec', layer: rec.layer, cursor: rec.cursor, strainSum: rec.strainSum });
    if (r.enacted.stats) rows.push({ type: 'stats', ...r.enacted.stats });
  }
  return rows.map((x) => JSON.stringify(x)).join('\n');
};

// attachReading(doc, opts) — give an ingested doc a lazy, memoised `reading()` accessor, so
// the moment of ingest OWNS the predictive read without paying for it until something asks.
// Mirrors the lazy `sentenceEmbeddings` cache the organs already attach: the default read is
// computed once and reused; an explicit-options call recomputes. Returns the same doc.
export const attachReading = (doc, baseOpts = {}) => {
  if (!doc || typeof doc.reading === 'function') return doc;
  doc.reading = (callOpts) => readIngest(doc, { ...baseOpts, ...(callOpts || {}) });
  doc.readingJsonl = (callOpts) => readingJsonl(doc, { ...baseOpts, ...(callOpts || {}) });
  return doc;
};
