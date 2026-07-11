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
  const para = lab(surf.paradigm); if (para) parts.push(para);
  if (surf.stance && surf.stance.guard) parts.push('guard held');
  return parts.length ? parts.join(' · ') : null;
};

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
      // The model-prompt check ("does this sound right?") speaks only when it ran and could
      // not support the draft — the reader read its own answer back against the lines. On a
      // one-shot turn it holds the draft back (gated); while streaming the answer is already
      // shown, so it rides flagged. A pass or a no-op is silent — a beat the reader needn't watch.
      if (!d.ran || d.verdict !== 'unsupported') return null;
      return { kind: 'warn', text: d.gated
        ? 'Checked the draft against the lines — unsupported, so I held it back'
        : "Checked the draft against the lines — couldn't support it" };
    default:
      return null;
  }
};
