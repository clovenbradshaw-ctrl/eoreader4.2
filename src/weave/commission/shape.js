// EO: EVA·SIG(Paradigm,Network → Lens, Tracing,Binding) — shape the response toward the EOT structure
// The payoff. The template is the exemplar's EOT structure; this threads it into the generation
// loop so the RESPONSE moves the way the exemplar moves — semiotically, not just topically.
//
// Two channels, because form lives at two grains:
//   grammar   the bigram move-grammar rides `predictNextMove` (via predictDirection's grammar opt):
//             at each step the next move-TYPE is drawn under the exemplar's transitions, so the
//             output's operator sequence follows the exemplar's discourse syntax. This is the
//             structural channel — below language.
//   guidance  a short natural-language style directive for the PROMPT: the talker is also TOLD the
//             form (digressive, first-person, opens by defining, lands by synthesising). This is
//             the surface channel — the voice the move-grammar cannot spell.
//
// The arc adds a positional lean (open→develop→close) read off the exemplar's own schedule. All of
// it is opt-in: no template, no shaping, today's behaviour exactly.

// Move → the verb a reader recognises, for the guidance string.
const MOVE_VERB = {
  DEF: 'defining its terms', EVA: 'weighing them against particulars', CON: 'drawing connections',
  INS: 'introducing figures', SEG: 'turning', SIG: 'naming qualities', SYN: 'synthesising',
  REC: 'reframing', NUL: 'holding back', VOID: 'marking what is absent',
};
const PHASE_GLOSS = { open: 'states its terms', develop: 'tests them against particulars', close: 'draws them together' };

// shapeOptions(template, base) → the options bundle to spread into runContinuation. Leans the move
// draw on the exemplar's grammar (a slightly heavier grammar weight so the borrowed form is felt),
// and turns the significance arc on so the positional lean has somewhere to land.
export const shapeOptions = (template, base = {}) => {
  if (!template?.grammar) return { ...base };
  const styleWeight = base.styleWeight ?? 1.35;
  return {
    ...base,
    grammar: template.grammar,
    weights: { recurrence: 1, structure: 1, grammar: styleWeight, ...(base.weights || {}) },
    arc: base.arc ?? true,
  };
};

// styleGuidance(template, brief) → the prompt-level style directive. Built from the fingerprint's
// dominant moves, the arc's phase order, and the voice signatures — the form said in words the
// talker can act on directly.
export const styleGuidance = (template, brief = {}) => {
  if (!template) return '';
  const name = template.exemplar?.name || 'the exemplar';
  const top = Object.entries(template.fingerprint || {})
    .filter(([op]) => op !== 'VOID' && op !== 'NUL')
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([op]) => MOVE_VERB[op]).filter(Boolean);
  const s = template.surface || {};
  const voice = [
    s.firstPersonRate > 0.3 ? 'in the first person' : s.firstPersonRate < 0.05 ? 'impersonally' : null,
    s.quotationRate > 0.15 ? 'weaving in quotation' : null,
    s.digressionRate > 0.4 ? 'digressive, parenthetical' : null,
    s.meanWords > 28 ? 'in long, periodic sentences' : s.meanWords < 14 ? 'in short, clipped sentences' : null,
    s.questionRate > 0.12 ? 'questioning as it goes' : null,
  ].filter(Boolean);
  const phases = (template.arc?.phases || []).map((p) => PHASE_GLOSS[p]).filter(Boolean);
  const arcStr = phases.length ? ` It ${dedupeJoin(phases)}.` : '';
  const del = brief?.deliverable || 'piece';
  const bits = [`Write this ${del} in the manner of ${name}`];
  if (voice.length) bits.push(voice.join(', '));
  if (top.length) bits.push(`its thought advances by ${dedupeJoin(top)}`);
  return `${bits.join(' — ')}.${arcStr}`.replace(/\s+/g, ' ').trim();
};

const dedupeJoin = (xs) => {
  const seen = []; for (const x of xs) if (x && !seen.includes(x)) seen.push(x);
  return seen.length <= 1 ? (seen[0] || '') : `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]}`;
};

// arcBiasAt(template, remainingFrac) → the exemplar's own phase bias at this point in the piece — a
// phaseBias-compatible { op: multiplier } read off the arc schedule (position = 1 − remainingFrac).
// Threadable as predictDirection's `phaseBias` to lean the draw the way the exemplar leans at that
// position, instead of the generic significance arc.
export const arcBiasAt = (template, remainingFrac = 1) => {
  const sched = template?.arc?.schedule;
  if (!Array.isArray(sched) || !sched.length) return null;
  const pos = Math.min(0.999, Math.max(0, 1 - remainingFrac));
  const bin = Math.min(sched.length - 1, Math.floor(pos * sched.length));
  return sched[bin]?.bias || null;
};

// A compact record of how a response was shaped, for the audit and the panel.
export const shapeTrace = (template, brief) => template ? Object.freeze({
  exemplar: template.exemplar?.name || null,
  source: template.exemplar?.source || null,
  guidance: styleGuidance(template, brief),
  fingerprint: template.fingerprint,
  arc: template.arc?.phases || [],
}) : null;
