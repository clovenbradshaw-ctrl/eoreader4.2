// EO: SYN(Network,Field,Lens → Field, Composing) — the fold-aware contextual definition (writer)
// The telegram (phrase.js/join.js) STATES the closed inventory — one object per sentence, the model
// gate-locked to arranging, never writing. This is its companion, and it is different in kind: a
// short DEFINITION of the entity AS IT FIGURES IN THIS READING — the model writing plainly from the
// fold it is handed, free to judge what matters.
//
// It can be this free because it is not the last word and it is not unchecked. The settled Wikipedia
// referent leads above it (the canonical "what it is"); and — the discipline that lets the model off
// the leash — every span it writes is GROUNDED OR FLAGGED afterwards (enactor/ground/spans.js), the
// same per-span provenance the answer surface already uses. So this module does ONE thing: hand the
// model the fold and let it write. It adds no gate of its own — nothing it returns is rejected. What
// the reading did not witness is not thrown away; it is marked, downstream, as the model's own word.
//
// Deliberately UNDER-instructed. A heavy "do not add a name, a number, a date…" prompt was what made
// the early drafts stilted — the model spent its attention dodging rather than defining. The grounder
// is the safety, not the prompt, so the prompt asks only for a plain definition.

import { speak } from '../../model/index.js';

// The prompt is short on purpose (see the note above). A definer STRATEGY (chorus.js's genome) picks
// among a few voices and framings — the heritable variation the chorus selects over — but every one
// stays under-instructed: none carries a "do not add a name/number/date" list, because the grounder
// is the safety, not the prompt. VOICES vary HOW it writes; FRAMINGS vary how the fold is put to it.
export const VOICES = Object.freeze({
  // the default: a plain, direct encyclopedia opening.
  plain: 'You write a short, plain definition of something for a reader looking at it right now, in a '
    + 'particular document. In two or three natural sentences, say what it is — leading with what '
    + 'matters most in this reading. Write the way a good encyclopedia opening reads: direct, unhedged, '
    + 'no throat-clearing. Return only the definition.',
  // terser — one or two sentences, no scene-setting.
  terse: 'Define this in one or two plain sentences for someone reading about it now. Lead with what it '
    + 'is; say only what matters here. No preamble. Return only the definition.',
  // narrative — a touch more connective, for entities whose meaning is in their role, not a category.
  narrative: 'Write a short definition of this for a reader currently reading about it. In two or three '
    + 'sentences, say what it is and how it figures in what they are reading — plainly, no hedging, no '
    + '"the text mentions". Return only the definition.',
});

const FRAMINGS = Object.freeze({
  // state what the reading is about, then the facts — the default contextual framing.
  contextual: (label, about, facts) => `Define: ${label}\n${about}\nWhat the reading establishes about it:\n${facts}`,
  // lead with the facts, mention the reading only as setting — for when the fold is thin.
  factsFirst: (label, about, facts) => `Define: ${label}\nWhat the reading establishes about it:\n${facts}\n(${about})`,
});

export const DEFAULT_STRATEGY = Object.freeze({ voice: 'plain', framing: 'contextual', nFacts: 6, temperature: 0.4 });

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^["'“‘]+|["'”’]+$/g, '').trim();

// Write the fold-aware contextual definition.
//   spec: { label, objects: [{ text }], telegram, fold: { title, themes: [] } }
//   opts.strategy: an optional definer genome { voice, framing, nFacts, temperature } (chorus.js).
//     Omitted → DEFAULT_STRATEGY, so a bare call reproduces the original single-definer behaviour.
// Returns { text, written, strategy }. Model-optional: with no model, or nothing established to
// define from, it returns the telegram unchanged and written:false — the layer degrades to the plain
// statement, never to nothing. The RETURNED TEXT IS NOT GATED HERE; the caller grounds it span-by-span.
export const contextualDefinition = async (spec, { model = null, signal = null, strategy = null } = {}) => {
  const strat = { ...DEFAULT_STRATEGY, ...(strategy || {}) };
  const base = clean(spec?.telegram || (spec?.objects || []).map((o) => o.text).join(' '));
  const facts = (spec?.objects || []).map((o) => String(o.text || '').trim()).filter(Boolean).slice(0, Math.max(1, strat.nFacts));
  if (!model || !facts.length) return { text: base, written: false, strategy: strat };

  const fold = spec.fold || {};
  const themes = (fold.themes || []).filter(Boolean);
  const about = fold.title
    ? `The reading is about: ${fold.title}${themes.length ? ` (${themes.join(', ')})` : ''}`
    : (themes.length ? `The reading centres on: ${themes.join(', ')}` : 'It appears in the reading at hand');
  const factLines = facts.map((f) => `- ${f}`).join('\n');
  const frame = FRAMINGS[strat.framing] || FRAMINGS.contextual;

  const draft = await speak(model, [
    { role: 'system', content: VOICES[strat.voice] || VOICES.plain },
    { role: 'user', content: frame(spec.label, about, factLines) },
  ], { fallback: '', maxTokens: 200, temperature: strat.temperature, ...(signal ? { signal } : {}) });

  const one = clean(draft);
  return one ? { text: one, written: true, strategy: strat } : { text: base, written: false, strategy: strat };
};

// Split a written definition into the spans the grounder verdicts and the reader hovers — whole
// sentences, kept with their terminal punctuation. A definition rarely runs past three, so a simple
// boundary split is enough; anything without a terminator is one span.
export const definitionSpans = (text) => {
  const t = clean(text);
  if (!t) return [];
  const m = t.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
  return (m || [t]).map((s) => s.trim()).filter(Boolean);
};
