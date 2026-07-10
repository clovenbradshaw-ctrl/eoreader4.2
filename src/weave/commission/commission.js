// EO: SYN·REC·EVA(Field,Network,Paradigm → Network, Composing,Tracing) — the commission, run forward
// The closure. One call opens a commission: read the ask, hunt the shelves, decide the inspiration,
// READ the chosen work whole, take its EOT structure, and draft the plan — the creature going to
// the internet to learn the shape of a good version before it writes. The result is serialisable
// and resumable, so the plan and the borrowed form carry across the responses it takes to deliver.
//
// Model-free and DI'd: the web client and embedder are injected (the app's real ones, fakes in
// tests), so the whole arc is offline-testable. Generation itself is the app's to run — this hands
// it the shaped options and the plan; the loop is runContinuation, leaned by the exemplar grammar.

import { readCommission } from './brief.js';
import { huntCandidates, fetchExemplar } from './hunt.js';
import { chooseInspiration } from './inspire.js';
import { extractStyleTemplate } from './template.js';
import { draftPlan } from './plan.js';
import { shapeOptions, styleGuidance, shapeTrace } from './shape.js';
import { parseText } from '../../perceiver/parse/index.js';

// A bounded, representative excerpt for templating — skip a little front matter, take a middle slice
// up to maxChars, end on a sentence boundary. buildMoveLog reads every unit, so a whole novel is
// re-parsed to a slice; the move-grammar and arc are stable well before the whole book.
export const excerptForTemplate = (text, maxChars = 20000) => {
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  const start = Math.floor(s.length * 0.06);           // past the preface / dedication
  let end = start + maxChars;
  const dot = s.lastIndexOf('.', end);
  if (dot > start + maxChars * 0.6) end = dot + 1;
  return s.slice(start, end);
};

// openCommission(ask, opts) → a Commission | null (null when the ask is not a commission).
//   opts { client, search, embedder, policy, responses, maxTemplateChars, signal }
export const openCommission = async (ask, {
  client = null, search = null, embedder = null, policy = 'propose',
  responses = null, maxTemplateChars = 20000, signal = null,
} = {}) => {
  const brief = typeof ask === 'string' ? readCommission(ask) : ask;
  if (!brief?.wantsCommission) return null;

  // 1. HUNT the shelves (Gutenberg first for form; the academic shelves for scholarly form).
  let candidates = [];
  try { candidates = await huntCandidates(brief, { client, search, signal }); }
  catch { candidates = []; }

  // 2. DECIDE what would be a good inspiration.
  const decision = await chooseInspiration(candidates, brief, { embedder, policy });

  // 3. READ the chosen work(s) whole — role-tagged style exemplars.
  const exemplars = [];
  const docs = [];
  if (client && decision.recommended?.length) {
    for (const item of decision.recommended) {
      const got = await fetchExemplar(item, { client, signal });
      if (got?.doc) {
        exemplars.push(Object.freeze({
          name: item.title, source: item.source, url: item.url,
          role: got.role, docId: got.doc.docId, why: decision.why,
        }));
        docs.push(got.doc);
      }
    }
  }

  // 4. TAKE the EOT structure — from bounded excerpts, blended when more than one exemplar.
  let template = null;
  if (docs.length) {
    const exDocs = docs.map((d, i) => parseText(excerptForTemplate(d.text || '', maxTemplateChars), { docId: `${d.docId || 'ex'}:tmpl${i}` }));
    // Prefer the user's named exemplar for the label; else the work titles minus their author tail.
    const name = brief.exemplar?.name || exemplars.map((e) => String(e.name || '').split(' — ')[0]).filter(Boolean).join(' + ') || null;
    try {
      template = extractStyleTemplate(exDocs, {
        name,
        title: exemplars.map((e) => e.name).filter(Boolean).join(' + ') || null,
        source: exemplars[0]?.source || null,
        url: exemplars[0]?.url || null,
      });
    } catch { template = null; }
  }

  // 5. DRAFT the plan (arced to the exemplar) and prepare the SHAPE.
  const plan = draftPlan(brief, template, { responses });
  const guidance = styleGuidance(template, brief);

  return Object.freeze({
    kind: 'commission', version: 1,
    brief, decision, exemplars, template, plan,
    shape: Object.freeze({ guidance, trace: shapeTrace(template, brief) }),
    state: { responsesDone: 0, units: [], covered: [] },
    committed: decision.committed,
  });
};

// confirmCommission(c) → the same commission, committed (the 'propose' → nod transition).
export const confirmCommission = (c) => c ? Object.freeze({ ...c, committed: true, decision: Object.freeze({ ...c.decision, committed: true }) }) : c;

// nextResponseOptions(c, base) → { options, guidance } for the next response's generation. `options`
// spreads into runContinuation (the exemplar grammar leans the move draw; the resumable state
// carries the self-history); `guidance` is the style directive the app folds into the prompt.
export const nextResponseOptions = (c, base = {}) => ({
  options: shapeOptions(c?.template, { ...base, state: c?.state || null }),
  guidance: c?.shape?.guidance || '',
  section: currentSection(c),
});

// The plan section(s) due in the next response, by the plan's response map.
export const currentSection = (c) => {
  const idx = c?.state?.responsesDone ?? 0;
  const ids = c?.plan?.map?.[idx] || [];
  return ids.map((id) => c?.plan?.sections?.[id]).filter(Boolean);
};

// advanceCommission(c, { units, covered }) → the commission with its state folded forward one
// response — the resumable step the app persists between messages.
export const advanceCommission = (c, { units = null, covered = null } = {}) => {
  if (!c) return c;
  const done = (c.state?.responsesDone ?? 0) + 1;
  const state = {
    responsesDone: done,
    units: units || c.state?.units || [],
    covered: covered || c.state?.covered || [],
  };
  const status = done >= (c.plan?.responses || 1) ? 'done' : 'active';
  return Object.freeze({ ...c, state, plan: Object.freeze({ ...c.plan, status }) });
};

// serializeCommission / resumeCommission — the plain-JSON round-trip the session store keeps. The
// template is already plain data (a grammar, an arc, signatures), so the borrowed FORM survives a
// reload even though the fetched docs do not; execution needs the grammar, not the source text.
export const serializeCommission = (c) => c ? {
  kind: 'commission', version: 1,
  brief: c.brief,
  decision: { recommended: c.decision?.recommended || [], why: c.decision?.why || '', blend: !!c.decision?.blend, policy: c.decision?.policy || 'propose', committed: !!c.decision?.committed },
  exemplars: c.exemplars || [],
  template: c.template || null,
  plan: c.plan || null,
  shape: { guidance: c.shape?.guidance || '' },
  state: c.state || { responsesDone: 0, units: [], covered: [] },
  committed: !!c.committed,
} : null;

export const resumeCommission = (s) => s ? Object.freeze({
  ...s,
  shape: Object.freeze({ guidance: s.shape?.guidance || styleGuidance(s.template, s.brief), trace: shapeTrace(s.template, s.brief) }),
}) : null;
