// EO: DEF·SYN(Paradigm,Field → Network, Dissecting,Composing) — draft the multi-response plan
// The plan the creature shows before it writes: a spine of section intents, arced to the exemplar's
// own phase order, and mapped across the responses it will take. This is the "draft a plan for a
// completion that goes across multiple responses" — a DEF over the intended piece, a definition of
// its shape, before a word of it is generated.
//
// The scaffold per deliverable is a starting spine; the exemplar's arc reorders/relabels the phases
// so a Montaigne essay opens and lands the way Montaigne does, not the way a generic essay does.

const SCAFFOLD = {
  essay: [['Open the question', 'open'], ['Turn it over', 'develop'], ['Test it against a case', 'develop'], ['Follow the digression', 'develop'], ['Draw it together', 'close']],
  story: [['Set the scene', 'open'], ['Introduce the figure', 'develop'], ['The turn', 'develop'], ['Consequence', 'develop'], ['Close', 'close']],
  poem: [['The image', 'open'], ['Development', 'develop'], ['The turn', 'develop'], ['Close', 'close']],
  letter: [['Address', 'open'], ['The matter', 'develop'], ['Reflection', 'develop'], ['Close', 'close']],
  review: [['Frame the question', 'open'], ['Survey the landscape', 'develop'], ['Weigh the evidence', 'develop'], ['Name the gaps', 'develop'], ['Synthesise the state of the art', 'close']],
  report: [['State the problem', 'open'], ['Method', 'develop'], ['Findings', 'develop'], ['Implications', 'develop'], ['Recommendations', 'close']],
  treatise: [['Pose the terms', 'open'], ['First movement', 'develop'], ['Second movement', 'develop'], ['Objection & reply', 'develop'], ['Conclusion', 'close']],
};
const DEFAULT_SCAFFOLD = [['Open', 'open'], ['Develop', 'develop'], ['Deepen', 'develop'], ['Draw together', 'close']];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// A through-line for the piece. Topical when a topic is given; otherwise a form-first line.
const thesisOf = (brief) => {
  const t = brief?.topic;
  const del = brief?.deliverable || 'piece';
  if (t) return del === 'story' ? `A ${del}: ${t}` : `An inquiry into ${t}`;
  return `A ${del}${brief?.exemplar ? ` after ${brief.exemplar.name}` : ''}`;
};

// draftPlan(brief, template, opts) → a frozen CommissionPlan.
//   The sections come from the deliverable scaffold; the exemplar's arc (when present) sets the
//   phase order the scaffold is sorted into, so the plan's shape is the exemplar's shape.
export const draftPlan = (brief, template = null, { responses = null } = {}) => {
  const scaffold = SCAFFOLD[brief?.deliverable] || DEFAULT_SCAFFOLD;
  // The spine keeps the logical order of a coherent piece — open, develop, close. The exemplar's
  // arc does NOT reshuffle it (an opening section belongs first); it biases HOW each phase is
  // realised at generation time (shape.js#arcBiasAt) and colours the style guidance.
  const sections = scaffold.map(([intent, phase], id) => Object.freeze({ id, intent, phase }));

  const nResp = responses != null ? clamp(responses, 1, sections.length)
    : (brief?.longform ? clamp(Math.ceil(sections.length / 2), 2, 3) : 1);
  const map = spread(sections.map((s) => s.id), nResp);

  return Object.freeze({
    kind: 'commission-plan', version: 1,
    title: titleOf(brief),
    thesis: thesisOf(brief),
    deliverable: brief?.deliverable || null,
    exemplar: template?.exemplar ? Object.freeze({ name: template.exemplar.name, source: template.exemplar.source, url: template.exemplar.url }) : null,
    inspirationPending: !template,          // no exemplar read yet → the plan awaits its model
    arc: Object.freeze(sections.map((s) => s.phase)),
    sections: Object.freeze(sections),
    responses: nResp,
    map: Object.freeze(map.map((r) => Object.freeze(r))),
    status: 'proposed',
  });
};

// Distribute ordered ids across n responses as contiguous runs (a response is a run of the spine).
const spread = (ids, n) => {
  const out = Array.from({ length: n }, () => []);
  const per = Math.ceil(ids.length / n);
  ids.forEach((id, i) => out[Math.min(n - 1, Math.floor(i / per))].push(id));
  return out;
};

const titleOf = (brief) => {
  const del = cap(brief?.deliverable || 'Piece');
  if (brief?.topic && brief?.exemplar) return `${del} on ${brief.topic}, after ${brief.exemplar.name}`;
  if (brief?.topic) return `${del} on ${brief.topic}`;
  if (brief?.exemplar) return `${del} after ${brief.exemplar.name}`;
  return del;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// describePlan(plan) → a legible plan to SHOW the user (the "draft a plan" deliverable).
export const describePlan = (plan) => {
  if (!plan) return '';
  const lines = [`**${plan.title}**`, plan.thesis];
  if (plan.exemplar?.name) lines.push(`_In the manner of ${plan.exemplar.name}${plan.exemplar.source ? ` (${plan.exemplar.source})` : ''}._`);
  else if (plan.inspirationPending) lines.push('_Inspiration still to be chosen._');
  lines.push('');
  plan.map.forEach((ids, r) => {
    const label = plan.responses > 1 ? `Response ${r + 1}` : 'Response';
    const secs = ids.map((id) => plan.sections[id]?.intent).filter(Boolean);
    lines.push(`- **${label}:** ${secs.join(' · ')}`);
  });
  return lines.join('\n');
};
