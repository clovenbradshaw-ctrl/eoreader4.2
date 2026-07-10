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

const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

// The stages worth speaking, each mapped to the honest line its `data` supports. Kept in
// step order for reading; a stage absent here (expect, converse, predict, answerable, gate,
// settle) is internal book-keeping the reader needn't watch, so it returns null and the
// trail simply doesn't stack a beat for it.
export const foldNarrative = (name, data = {}) => {
  const d = data || {};
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
      return { kind: 'fold', text: stops > 0 ? `Folded the reading — ${plural(stops, 'stop')}` : 'Folded the reading' };
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
    default:
      return null;
  }
};
