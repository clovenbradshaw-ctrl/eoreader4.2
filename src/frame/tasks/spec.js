// EO: DEF·SEG·REC(Void,Field,Paradigm → Kind,Network,Paradigm, Dissecting,Unraveling,Composing) — task creator: request->spec->plan
// tasks/spec.js — the TASK CREATOR: a request → an artifact spec → a decomposition.
//
// The tasks holon (runner.js) drives a goal down to leaves and generates each one,
// but it imports no model and chooses no shape — `decompose` and `generate` arrive
// injected. The runner's own doc names the gap: `decompose` "may be a small LLM, or
// a heuristic, or a FIXED PLAN." This module is the fixed-plan face for generative
// artifacts. When the request is "write an essay", an essay is not a shapeless reach
// — it has a LENGTH, a FORMAT, and a STRUCTURE (open with a thesis, develop it in
// ordered paragraphs, close without a new claim). The creator reads the kind off the
// request, looks up that shape, and hands the runner a decomposition that already
// embodies it.
//
// WHY THIS IS NOT THE ANTI-CANON longgen/shape.js FORBIDS. There the system answers a
// question FROM A DOCUMENT, and a fixed response schema is a lie — it supplies a
// balance the evidence cannot earn (McKeown's schemata, "a void gate run backwards").
// That argument is about a GROUNDED READING: the shape must fall out of what the field
// offers. This is the opposite case — a GENERATIVE artifact the user asked for by name.
// "Write an essay" IS a request for the essay shape; supplying it is honoring the ask,
// not imposing a frame on evidence. The grounding discipline still rides underneath:
// each leaf the runner generates is grounded on its own spans (runner.js), so the spec
// chooses the SKELETON while the evidence still fills each bone.
//
// THE SMALL-MODEL CONSTRAINT IS THE WHOLE POINT (the runner's thesis, made dimensional).
// A small model can only be handed so much context and can only emit so much output in
// one reach. So every section carries a TOKEN BUDGET, and the budget drives the grain:
//
//   tokens ≤ LEAF_MAX_TOKENS   → a Figure leaf — one small-model reach writes it whole.
//   tokens >  LEAF_MAX_TOKENS   → a Pattern goal — too big for one bite, split further.
//
// That is exactly the cube's stopping rule (grain.js): keep decomposing while a goal is
// Pattern-grained, make a leaf only once it is Figure-grained — here read off a real
// budget, not guessed. A spec whose sections all fit the ceiling is a flat plan; ask for
// a LONG essay and the body paragraphs overflow the ceiling and nest one level deeper,
// each part still a one-reach generation. Length scales the budget; the budget scales the
// tree; the tree keeps every generation inside what a small model can actually produce.
//
// THREE SOURCES OF A SHAPE, in priority order (`createTaskSpec`):
//   1. a LEARNED definition — one the caller defined previously (the library cache).
//   2. a BUILT-IN template — the shapes shipped here (essay, report, story, …).
//   3. NOTHING — `needsResearch` is true; the caller may propose a web search for the
//      "good elements of a <kind>", parse the result with `deriveSpecFromDefinition`,
//      and `define` it into the library so the next request reuses it. The fetch is the
//      caller's (proposer-only, the web.js discipline) — this module never touches the
//      network, exactly as the runner never imports a model.

import { GRAINS } from '../../core/index.js';
import { PATTERN, FIGURE } from './grain.js';
import { MAX_FANOUT } from './constants.js';
import { runTaskGraph } from './runner.js';
import { organFor, createOutputRegistry } from '../../organs/out/index.js';
import { learnStructureFromExamples, exampleQuery } from './learn.js';

// ── The small-model budgets ──────────────────────────────────────────────────
// LEAF_MAX_TOKENS — the most one small-model reach should emit (a paragraph). A
// section budgeted above it is Pattern-grained and splits; at or below it is a
// Figure leaf. LEAF_MIN_TOKENS floors a section so a thin share never budgets a leaf
// to nothing. CONTEXT_SPANS is the advisory retrieval width per leaf — how many
// evidence spans the caller should feed one generation, so a leaf's context stays
// inside the small model's window the same way its output stays inside the ceiling.
export const LEAF_MAX_TOKENS = 256;
export const LEAF_MIN_TOKENS = 64;
export const CONTEXT_SPANS = 6;

// ── Length: the request's own size words scale the budget ─────────────────────
// "a SHORT essay" / "a LONG, DETAILED report" — the only length prescription the
// system carries (intent.js keeps length out of the prompt; here it sizes the PLAN,
// not a sentence count). Default 1 when the request names no size.
const LENGTH_SCALE = Object.freeze({
  brief: 0.45, short: 0.5, quick: 0.5,
  normal: 1,
  long: 1.8, detailed: 1.8, 'in-depth': 1.8, thorough: 2.0, comprehensive: 2.4, full: 1.8,
});
const LENGTH_RE = /\b(brief|short|quick|long|detailed|in[- ]depth|thorough|comprehensive|full)\b/i;

// readLength(request) → { label, scale }. `label` rides into the artifact goal so the
// goal reads as the user phrased it ("Write a long essay …"); `scale` sizes the budget.
export const readLength = (request = '') => {
  const m = String(request || '').match(LENGTH_RE);
  if (!m) return { label: '', scale: 1 };
  const word = m[1].toLowerCase().replace(' ', '-');
  return { label: word === 'in-depth' ? 'in-depth' : m[1].toLowerCase(), scale: LENGTH_SCALE[word] ?? 1 };
};

// ── Classifying the artifact kind ─────────────────────────────────────────────
// The same cheap regex read as readTask/classifyWantedType, lifted to GENERATIVE
// artifacts. We do NOT ship a guide for any specific kind — the system treats the
// internet as its brain and LEARNS how to make a thing well the first time it is asked,
// caching the shape (the library). So the kind is OPEN-VOCABULARY: whatever artifact
// noun the request names — essay, sonnet, lab report, cover letter, sales deck — is the
// kind, and the only stored shape is the universal arc (the offline floor). `answer` is
// the default — a request that names no artifact decomposes to a single grounded leaf.

// A few common kinds, for documentation only — NOT an authoritative list. Anything the
// request names is a valid kind; these are just the ones you will see most.
export const ARTIFACT_KINDS = Object.freeze([
  'essay', 'report', 'story', 'review', 'letter', 'list', 'summary', 'melody', 'answer',
]);

// Question words / fillers that are not artifact nouns — a request that heads with one
// is a question, not a make-this, so it falls to the degenerate `answer`.
const NON_KIND = new Set([
  'what', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'which',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'would', 'should',
  'tell', 'explain', 'describe', 'answer', 'question', 'this', 'that', 'it', 'the', 'a', 'an',
]);
// Determiners/pronouns that may follow the head noun but are not part of it — so
// "list the planets" is kind `list`, not `list the`. ("cover letter" keeps its second
// word because `letter` is not here.)
const DROP_SECOND = new Set([
  'the', 'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'this', 'that', 'these', 'those', 'some', 'any', 'all', 'each', 'every',
]);

// Musical artifact nouns route to the MUSIC output organ; everything else renders as
// text. This is a MODALITY router (which sense to render in), NOT a structural guide —
// the structure of a melody is still learned, not shipped. New output organs add their
// noun set here as they land (image: sketch/diagram; etc.).
const MUSIC_KINDS = /\b(melody|melodies|tune|song|jingle|riff|theme|anthem|hymn|march|lullaby|ballad|motif)\b/i;
export const organForKind = (kind = '') => (MUSIC_KINDS.test(String(kind)) ? 'music' : 'text');

// artifactKindOf(request) → the artifact noun the request names, open-vocabulary. Peels
// the imperative, article, and length words, then takes the head noun (one or two words)
// up to the "about/on" pivot. A question or a bare topic → `answer`.
export const artifactKindOf = (request = '') => {
  let s = String(request || '').toLowerCase().trim().replace(/[?.!]+\s*$/, '');
  if (!s) return 'answer';
  s = s.replace(LEAD_VERB, '').trim().replace(ARTICLE, '').trim();
  let prev = null;
  while (s && s !== prev) { prev = s; s = s.replace(LENGTH_WORD, '').trim(); }
  // Take the noun PHRASE — up to three words ("emily dickinson poem", "cover letter") —
  // stopping at the first determiner, the "about/on" pivot, or a non-word. A style
  // modifier and the artifact noun travel together as the kind, so the learned shape is
  // as specific as the request ("emily dickinson poem" learns a Dickinson shape, not a
  // generic poem one).
  const words = s.split(/\s+/);
  const kw = [];
  for (const w of words.slice(0, 3)) {
    if (!/^[a-z][a-z-]*$/.test(w) || PIVOT.test(w) || DROP_SECOND.has(w) || NON_KIND.has(w)) break;
    kw.push(w);
  }
  if (!kw.length || NON_KIND.has(kw[0])) return 'answer';
  return kw.join(' ');
};

// Back-compat alias — the classifier is now open-vocabulary.
export const classifyArtifact = artifactKindOf;

// ── The subject the artifact is ABOUT ─────────────────────────────────────────
// Strip the leading imperative and the artifact framing — "write a short essay about
// X" / "draft a report on Y" → "X" / "Y" — so the section goals can name the subject.
// Heuristic and forgiving: when nothing cleanly remains, the whole request stands.
const LEAD_VERB = /^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:write|compose|draft|create|generate|produce|give\s+me|make|prepare|put\s+together)\b/i;
const ARTICLE = /^\s*(?:a|an|the|me|us)\b/i;
const LENGTH_WORD = /^\s*(?:brief|short|quick|long|detailed|in[- ]depth|thorough|comprehensive|full)\b/i;
const PIVOT = /^\s*(?:about|on|regarding|concerning|covering|for|of|to)\b/i;
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A single structured peel — leading verb, the OBJECT article (once), any length words,
// the DETECTED artifact noun (open-vocabulary, whatever kind the request named), then the
// "about/on/to" pivot. The subject keeps its OWN article ("the sea" stays "the sea"), so
// the article strip runs once at the front, never inside the subject. When nothing clean
// remains, the request stands rather than vanishing.
export const subjectOf = (request = '') => {
  let s = String(request || '').trim().replace(/[?.!]+\s*$/, '');
  s = s.replace(LEAD_VERB, '').trim();
  s = s.replace(ARTICLE, '').trim();
  let prev = null;
  while (s && s !== prev) { prev = s; s = s.replace(LENGTH_WORD, '').trim(); }   // "long detailed"
  const kind = artifactKindOf(request);
  if (kind !== 'answer') s = s.replace(new RegExp(`^${escapeRe(kind)}s?\\b`, 'i'), '').trim();
  const hadPivot = PIVOT.test(s);
  s = s.replace(PIVOT, '').trim();
  // After stripping the kind: what remains is the subject ("…about the sea" → "the sea").
  // If the whole request WAS the artifact noun ("write an emily dickinson poem"), nothing
  // remains and there is no subject — let createTaskSpec supply its default. Only a bare
  // topic with no recognised kind (a single word that became the kind) keeps the original.
  if (s) return s;
  if (kind === 'answer' || (!hadPivot && kind === String(request || '').trim().toLowerCase())) {
    return String(request || '').trim();
  }
  return '';
};

// ── The only stored shape: the UNIVERSAL ARC ──────────────────────────────────
// We ship NO guide for any specific artifact. A template is an ordered list of SECTIONS
// — each a `role`, a `share` of the budget, and a NEUTRAL `dir` (an act the output organ
// lowers to an instruction). The single shipped shape is the universal arc: open →
// develop → close. That is not an artifact canon (an "essay guide" would be) — it is the
// significance row's intrinsic order, the shape any making takes when it sets out,
// develops, and lands (the same arc longgen/shape.js derives rather than imposes). It is
// the OFFLINE FLOOR: used only when nothing has been learned and no research is available.
// The SPECIFIC structure of an essay, a sonnet, a lab report is LEARNED (acquireSpec),
// never stored here.
const T = (kind, format, size, note, sections, organ = 'text', source = 'builtin') =>
  Object.freeze({ kind, format, size, organ, note, sections, source });

// genericArc(organ) → the universal arc, sized and named for the output organ. The
// roles read naturally per modality (a melody opens with a motif and lands on a cadence),
// but the SHAPE is the same three moves — this is a floor, not a guide.
const genericArc = (organ = 'text') => {
  const music = organ === 'music';
  return T(
    'generic', music ? 'notes' : 'prose', music ? 24 : 512,
    'the universal arc — open, develop, close (the offline floor; specific shapes are learned)',
    [
      { role: music ? 'opening motif' : 'opening', share: 1.0, dir: { act: 'open' } },
      { role: 'development', share: 1.6, dir: { act: 'develop', detail: 'extend and deepen' } },
      { role: music ? 'cadence' : 'close', share: 1.0, dir: { act: 'close', detail: 'draw together; introduce nothing new' } },
    ],
    organ, 'fallback',
  );
};

export const GENERIC_SHAPES = Object.freeze({ text: genericArc('text'), music: genericArc('music') });

// The degenerate shape: no artifact named, a single grounded leaf — byte-identical to
// one small-model call (the runner's degenerate graph).
const ANSWER_SHAPE = T('answer', 'prose', 256, 'no artifact shape — a single grounded reach', [
  { role: 'answer', share: 1.0, goal: (s) => s },
], 'text', 'fallback');

// ── Expanding a template into concrete sections ───────────────────────────────
// `repeat` body paragraphs become separate sections (body 1, body 2, body 3); the
// goal builder is handed the index so each reads distinctly. The result is a flat,
// ordered, inspectable section list — the structure, before budgets are assigned.
// A section declares its instruction one of two ways: a NEUTRAL `dir` (an act + optional
// detail, which the output organ lowers to language — the modality-neutral path), or a
// legacy `goal` builder (a hand-written instruction, which IS the text organ's lowering —
// kept for the English-rich text templates). `repeat` bodies become separate sections,
// the builder handed the index so each reads distinctly.
const expandSections = (template, subject) => {
  const out = [];
  for (const s of template.sections) {
    const n = s.repeat && s.repeat > 1 ? s.repeat : 1;
    for (let i = 1; i <= n; i++) {
      const role = n > 1 ? `${s.role} ${i}` : s.role;
      const share = Number(s.share) > 0 ? Number(s.share) : 1;
      if (s.dir) {
        const d = typeof s.dir === 'function' ? (n > 1 ? s.dir(subject, i, n) : s.dir(subject)) : s.dir;
        out.push({ role, share, directive: { act: d.act, role, subject, detail: d.detail || null } });
      } else {
        const goal = typeof s.goal === 'function' ? (n > 1 ? s.goal(subject, i, n) : s.goal(subject)) : String(s.goal);
        out.push({ role, share, goal });
      }
    }
  }
  return out;
};

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// The artifact-level goal — the root of the task graph, phrased as the user asked
// (with the length word when they gave one). Not a leaf normally; it decomposes.
const artifactGoal = (kind, subject, lengthLabel) => {
  const len = lengthLabel ? `${lengthLabel} ` : '';
  const about = subject ? ` about ${subject}` : '';
  return `Write ${article(len || kind)} ${len}${kind}${about}`.replace(/\s+/g, ' ').trim();
};

// ── The creator: a request → a concrete spec ──────────────────────────────────
// Reads the kind, the subject, and the length off the request, picks the shape, and
// assigns every section a budget in the output organ's native unit. The shape is
// resolved LEARNED → universal-arc floor: a kind whose specific structure the library
// has learned (via acquireSpec, from the internet) uses that; otherwise the universal
// arc is the floor. NO artifact-specific guide is shipped. A bare question (kind
// `answer`) is the degenerate single leaf. Synchronous and pure — research happens in
// `acquireSpec`/`runArtifact`, which populate the library BEFORE this runs.
export const createTaskSpec = ({ request = '', library = null, length = null } = {}) => {
  const kind = artifactKindOf(request);
  const subjectRaw = subjectOf(request);
  const subject = subjectRaw && subjectRaw.toLowerCase() !== kind ? subjectRaw : 'the requested topic';

  const template =
    kind === 'answer' ? ANSWER_SHAPE
    : (library && library.learned(kind)) || genericArc(organForKind(kind));

  // The OUTPUT ORGAN governs the budget math: its native unit, its single-reach ceiling
  // (a paragraph for text, a phrase for music), its floor, and its context width. The
  // share→budget conversion that used to be text-coded globals now reads off the organ,
  // so the same creator sizes a melody in beats and an essay in tokens
  // (docs/omnimodal-task-language.md).
  const organ = organFor(template.organ || 'text');
  const baseSize = template.size ?? template.tokens ?? ANSWER_SHAPE.size;
  const len = length ? { label: length === 'normal' ? '' : length, scale: LENGTH_SCALE[length] ?? 1 } : readLength(request);
  const total = Math.max(organ.minBudget, Math.round(baseSize * len.scale));

  const expanded = expandSections(template, subject);
  const shareSum = expanded.reduce((s, x) => s + x.share, 0) || 1;

  const sections = expanded.map((x, i) => {
    const extent = clamp(Math.round((total * x.share) / shareSum), organ.minBudget, total);
    // The instruction handed to the model is the ORGAN'S LOWERING of the neutral
    // directive; a legacy `goal` is itself the text lowering, kept as-is.
    const goal = x.directive ? organ.lower(x.directive) : x.goal;
    return Object.freeze({
      id: `${i}`,
      role: x.role,
      goal,
      directive: x.directive || null,   // the modality-neutral move, null for legacy goals
      organ: organ.id,
      extent,            // the leaf's budget in the organ's native unit
      unit: organ.unit,
      // budget IS the grain: a section over the organ's single-reach ceiling is a Pattern
      // goal the decomposer must split; one that fits is a Figure leaf.
      grain: extent > organ.ceiling ? PATTERN : FIGURE,
      contextSpans: organ.contextOf(extent),
      // back-compat alias: the text path has always exposed `tokens`. Present only when
      // the native unit IS tokens, so a music leaf never carries a misleading token count.
      ...(organ.unit === 'tokens' ? { tokens: extent } : {}),
    });
  });

  // A single-section artifact has no structure to unravel: its root IS the leaf, and the
  // root goal is that section's own instruction (so the one generation gets the real
  // prompt, not a bookkeeping "Write an answer about …"). A multi-section artifact roots
  // at the artifact goal and decomposes into its sections.
  const single = sections.length === 1;
  const goal = single
    ? sections[0].goal
    : artifactGoal(kind, subjectRaw && subjectRaw.toLowerCase() !== kind ? subjectRaw : '', len.label);

  return Object.freeze({
    kind,
    subject: subjectRaw,
    organ: organ.id,
    format: template.format,
    note: template.note,
    source: template.source || 'builtin',
    extent: total,            // the artifact's total budget in the organ's native unit
    unit: organ.unit,
    length: len.label || 'normal',
    goal,
    sections,
    // back-compat alias for the text path (the spec has always exposed `tokens`).
    ...(organ.unit === 'tokens' ? { tokens: total } : {}),
  });
};

// ── A plan: the spec, plus the two runTaskGraph faces it derives ──────────────
// `planArtifact` accepts a built spec or the creator's args. It owns a registry keyed
// by goal string so the generate wrapper can recover each leaf's budget, and so a
// Pattern section that gets split registers its parts as they are produced — the
// decomposer runs a node before its children, so a part is always registered before
// the runner reaches it.
export const planArtifact = (specOrArgs = {}) => {
  const spec = specOrArgs && Array.isArray(specOrArgs.sections) ? specOrArgs : createTaskSpec(specOrArgs);
  const single = spec.sections.length === 1;
  const registry = new Map(spec.sections.map((s) => {
    const g = resolveGoal(s, spec.subject);
    return [g, { ...s, goalText: g }];
  }));
  // A single-section artifact roots at that section's goal — register it so the leaf's
  // budget is recoverable when the root IS the leaf.
  if (single) registry.set(spec.goal, { ...spec.sections[0], goalText: spec.goal });

  // decompose(view) → sub-goals while a goal overflows one reach, [] once it fits.
  const decompose = ({ goal, depth }) => {
    if (depth === 0) {
      if (single) return [];   // no structure to unravel: the root is the leaf
      // The root unravels into the spec's sections, each carrying its declared grain.
      return spec.sections.map((s) => ({ goal: resolveGoal(s, spec.subject), grain: s.grain }));
    }
    const sec = registry.get(goal);
    if (!sec || sec.grain !== PATTERN) return [];   // unknown or Figure → a leaf

    // Split a too-big section into leaf-sized parts — the budget-driven SEG cut, off the
    // section's OWN output-organ ceiling (a paragraph for text, a phrase for music). Parts
    // share the section's budget; a part still over the ceiling stays Pattern and the
    // recursion splits it again (bounded by the runner's MAX_DEPTH guard).
    const organ = organFor(sec.organ);
    const parts = clamp(Math.ceil(sec.extent / organ.ceiling), 2, MAX_FANOUT);
    const each = Math.max(organ.minBudget, Math.round(sec.extent / parts));
    const subs = [];
    for (let k = 1; k <= parts; k++) {
      const g = `${sec.goalText || goal} — part ${k} of ${parts}`;
      const sub = {
        ...sec, goalText: g, role: `${sec.role} · part ${k}`,
        extent: each, grain: each > organ.ceiling ? PATTERN : FIGURE,
        contextSpans: organ.contextOf(each),
        ...(organ.unit === 'tokens' ? { tokens: each } : {}),
      };
      registry.set(g, sub);
      subs.push({ goal: g, grain: sub.grain });
    }
    return subs;
  };

  const budgetFor = (goal) => registry.get(goal) || null;

  return { spec, goal: spec.goal, decompose, budgetFor, registry };
};

// Resolve a section's goal to its instruction string (the builder may be a function).
const resolveGoal = (section, subject) =>
  (typeof section.goal === 'function' ? section.goal(subject || 'the requested topic') : String(section.goal));

// ── The generate face (text): every leaf handed its budget, role, and format ──
// The runner hands a leaf its cube identity (Figure-maker); this layer adds the
// small-model contract — `maxTokens` (the output ceiling for this leaf), `role` (where
// it sits in the artifact), `format` (how to render), and `contextSpans` (how wide to
// retrieve). The caller's real `generate` reads these and makes the model call; this
// module never imports a model, exactly as the runner does not. This is the TEXT path,
// kept as the single-modality shorthand; `withOrgans` is the general dispatch.
export const withBudgets = (plan, generate) => (view) => {
  const sec = plan.budgetFor(view.goal);
  const extent = sec ? sec.extent : Math.min(LEAF_MAX_TOKENS, plan.spec.extent ?? plan.spec.tokens);
  return generate({
    ...view,
    spec: plan.spec,
    role: sec ? sec.role : null,
    format: plan.spec.format,
    maxTokens: extent,
    contextSpans: sec ? sec.contextSpans : CONTEXT_SPANS,
  });
};

// ── The omnimodal generate face: dispatch each leaf to its OUTPUT ORGAN ────────
// The conversion the design note specifies (docs/omnimodal-task-language.md). Each leaf
// carries an `organ` and an `extent` in that organ's native unit; this looks up the
// section's budget, builds the modality-neutral leaf view, and dispatches to the organ's
// renderer in `registry`. The renderer (organs/out) adapts the view to its modality and
// makes the atom. Falls back to the text renderer for an untagged leaf, so it is a strict
// superset of `withBudgets`. `runTaskGraph`, the projection, and the grain backstop are
// unchanged — they fold a leaf whose `output` is prose today and a phrase tomorrow.
export const withOrgans = (plan, registry) => (view) => {
  const sec = plan.budgetFor(view.goal);
  const organId = (sec && sec.organ) || plan.spec.organ || 'text';
  const render = registry[organId] || registry.text;
  if (!render) throw new Error(`no output organ for "${organId}"`);
  const organ = organFor(organId);
  return render({
    ...view,
    spec: plan.spec,
    role: sec ? sec.role : null,
    directive: sec ? sec.directive : null,   // the modality-neutral move (null for legacy goals)
    organ: organId,
    format: plan.spec.format,
    extent: sec ? sec.extent : organ.minBudget,
    unit: organ.unit,
    contextSpans: sec ? sec.contextSpans : organ.contextOf(organ.minBudget),
  });
};

// ── The convenience: create the task and run it ───────────────────────────────
// Build the spec, derive the faces, wrap generation, run the graph. Pass `generate` for
// the single-modality (text) shorthand, OR `organs` — a map of per-modality generators
// ({ text, music, … }) — to dispatch each leaf to its output organ.
//
// THE INTERNET IS THE BRAIN. If `webSearch` is supplied and the machine has not learned
// this kind, it goes and learns how to make it well FIRST (acquireSpec → research →
// derive → cache to the `templates/` store), then plans with the learned shape. Offline,
// or when research yields nothing, it falls back to the universal arc. `library` is the
// machine's memory (createSpecLibrary); a transient one is made if none is passed, but a
// caller that wants the learning to persist passes its own (wired to the folder).
export const runArtifact = async ({
  request = '', generate, organs = null, library = null,
  exampleSearch = null, webSearch = null, length = null,
  onUpdate = null, signal = null, runner = runTaskGraph,
} = {}) => {
  const lib = library || createSpecLibrary();
  if (exampleSearch || webSearch) {
    try { await acquireSpec({ request, library: lib, exampleSearch, webSearch }); }
    catch { /* fall back to the arc */ }
  }

  const plan = planArtifact({ request, library: lib, length });
  // `organs` chooses the omnimodal dispatch; a bare `generate` is the text shorthand.
  const face = organs
    ? withOrgans(plan, createOutputRegistry(organs))
    : withBudgets(plan, generate);
  const res = await runner({
    goal: plan.goal,
    decompose: plan.decompose,
    generate: face,
    onUpdate,
    signal,
  });
  return { ...res, spec: plan.spec, library: lib };
};

// ── The learned / web definition path ─────────────────────────────────────────
// "you could have it do a websearch to determine what the good elements of an essay
// are, or if that's been defined previously." The library is the "defined previously"
// half; deriveSpecFromDefinition + a caller's web fetch is the "websearch" half.

// The structural element words a definition of a written form tends to name, in the
// rough order they appear — used as a fallback when a fetched definition is prose, not
// a clean list.
const ELEMENT_WORDS = Object.freeze([
  'abstract', 'introduction', 'hook', 'thesis', 'background', 'context', 'setup',
  'body', 'argument', 'point', 'evidence', 'example', 'analysis', 'method', 'results',
  'discussion', 'counterargument', 'rebuttal', 'rising action', 'climax', 'resolution',
  'strengths', 'weaknesses', 'recommendation', 'verdict', 'conclusion', 'summary', 'closing',
]);
const STOP_ROLE = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'your', 'about', 'a', 'an', 'of',
  // generic headers that name the LIST of elements, not an element itself
  'sections', 'section', 'parts', 'part', 'elements', 'element', 'structure',
  'contents', 'components', 'component', 'format', 'outline',
]);

const normRole = (raw) => String(raw || '').toLowerCase().replace(/[^a-z \-]/g, '').replace(/\s+/g, ' ').trim();
const plausibleRole = (r) => {
  if (!r || r.length < 3 || r.length > 40) return false;
  const words = r.split(' ');
  return words.length <= 3 && !STOP_ROLE.has(r);
};

// deriveSpecFromDefinition(kind, text, base?) → a learned template, or null when the
// text yields nothing usable (the caller then keeps the universal-arc floor — behaviour
// only improves, never regresses, the formulateSearchQuery discipline). It pulls section
// roles from the fetched definition: numbered/bulleted/colon-led headings first, then
// known element words by order of appearance. Each role is mapped to a NEUTRAL directive
// act by its position in the arc (first → open, last → close, middle → develop), so a
// learned shape is modality-neutral like the shipped arc. Size/organ inherit from `base`
// (the arc floor for the kind's organ) so a derived shape is sized like the floor.
export const deriveSpecFromDefinition = (kind, text, base = genericArc(organForKind(kind))) => {
  const t = String(text || '');
  if (!t.trim()) return null;

  const found = [];
  const seen = new Set();
  const add = (raw) => {
    const r = normRole(raw);
    if (r && !seen.has(r) && plausibleRole(r)) { seen.add(r); found.push(r); }
  };

  // Markdown-aware: real web definitions arrive as "1. **Lyric Form** - …", "## Common
  // Meter", "- Body:". Strip the list/heading/emphasis markers, then take the HEADING —
  // a bold span, or the text before a dash/colon separator — never the description after.
  for (const raw of t.split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    const listed = /^(?:\d+[.)]|[-*•])\s+/.test(line);              // had a list marker
    line = line
      .replace(/^#{1,6}\s+/, '')                  // "## Heading"
      .replace(/^(?:\d+[.)]|[-*•])\s+/, '')       // "1. " or "- " list marker
      .trim();
    const bold = line.match(/^\*{1,2}([^*]{2,48})\*{1,2}/);          // "**Lyric Form** - …"
    if (bold) { add(bold[1]); continue; }
    const sep = line.match(/^([A-Za-z][A-Za-z '\-]{1,38}?)\s*[–—:]\s+\S/); // "Heading: desc" / "Heading — desc"
    if (sep) { add(sep[1]); continue; }
    if (listed) { add(line.replace(/[.:,;]+$/, '')); continue; }     // a bullet/number item IS the role
    if (/^[A-Z][A-Za-z'\-]+(?:\s+[A-Za-z'\-]+){0,2}$/.test(line)) add(line);  // a bare short Title-case heading
  }

  if (found.length < 2) {
    const low = t.toLowerCase();
    const hits = ELEMENT_WORDS
      .map((w) => ({ w, at: low.indexOf(w) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => a.at - b.at);
    for (const h of hits) add(h.w);
  }

  if (found.length < 2) return null;

  const roles = found.slice(0, MAX_FANOUT);
  const actAt = (i) => (i === 0 ? 'open' : i === roles.length - 1 ? 'close' : 'develop');
  return Object.freeze({
    kind,
    organ: base?.organ || 'text',
    format: base?.format || 'prose',
    size: base?.size || 600,
    note: `learned from a definition (${roles.length} elements)`,
    source: 'learned',
    provenance: { via: 'research', at: null },   // stamped by the caller (research time)
    sections: roles.map((role, i) => ({ role, share: 1, dir: { act: actAt(i), detail: role } })),
  });
};

// ── The library: the machine's learned shapes, the `templates/` store in memory ──
// Keyed by kind. `learned` returns a shape the machine has built or that was installed;
// `get` falls back to the universal arc so an external caller always gets something
// usable. `define`/`defineFromDefinition` write a learned shape AND fire `onLearn`, the
// persistence hook a Node caller wires to write the template into the `templates/` folder
// (see src/tasks/templates.js) — so a shape learned once is reused forever, and the same
// JSON can be shared or installed. Seed it from disk (the installed/built templates) via
// `createSpecLibrary({ seed })`.
export const createSpecLibrary = ({ seed = {}, onLearn = null } = {}) => {
  const learned = new Map();
  for (const [kind, tmpl] of Object.entries(seed)) learned.set(kind, Object.freeze({ ...tmpl, kind, source: tmpl.source || 'installed' }));
  const pending = [];   // persistence promises, so a caller can `await library.flush()`
  const write = (kind, tmpl) => {
    const t = Object.freeze({ ...tmpl, kind });
    learned.set(kind, t);
    if (onLearn) {
      try { const p = onLearn(kind, t); if (p && typeof p.then === 'function') pending.push(p); }
      catch { /* persistence must never sink a run */ }
    }
    return t;
  };
  return {
    get: (kind) => learned.get(kind) || genericArc(organForKind(kind)),
    learned: (kind) => learned.get(kind) || null,
    has: (kind) => learned.has(kind),
    kinds: () => [...learned.keys()],
    define: (kind, tmpl) => write(kind, { ...tmpl, source: tmpl.source || 'learned' }),
    defineFromDefinition: (kind, text) => {
      const t = deriveSpecFromDefinition(kind, text);
      return t ? write(kind, t) : null;
    },
    // Await every persistence write the library has kicked off — so a CLI/test can read
    // the folder back deterministically. App callers can ignore it (writes are durable).
    flush: () => Promise.allSettled(pending.splice(0)),
  };
};

// needsResearch — has the machine NOT learned this kind yet? When true, `acquireSpec`
// goes and learns it (the internet is the brain). `answer` never needs research (it is
// the degenerate single leaf). `researchQuery` is the query handed to a `webSearch`.
export const needsResearch = (kind, library = null) =>
  kind !== 'answer' && !(library && library.learned(kind));

export const researchQuery = (kind) =>
  `how to write a good ${kind}: the standard structure and the sections it should have`;

// ── acquireSpec — "go learn how to make it well" ──────────────────────────────
// The internet-as-brain step. If the machine has not learned this kind, fetch a
// definition with the injected `webSearch`, derive a shape, and cache it (which persists
// it to the `templates/` folder when the library has a writer). Returns the learned
// template, or null when nothing could be learned (the caller falls back to the universal
// arc). The engine never touches the network — `webSearch` is injected, the web.js
// discipline. `extractText` turns a search result into the text deriveSpecFromDefinition
// reads (defaults to common shapes: a string, {text}, {doc.text}, {snippet}).
const oneText = (r) => (typeof r === 'string' ? r : (r?.text || r?.doc?.text || r?.snippet || r?.content || ''));
const defaultExtract = (results) => (Array.isArray(results) ? results : [results]).map(oneText).filter(Boolean).join('\n');
// examples stay an ARRAY — one element per example work, so the engine reads each whole.
const extractExamples = (results) => (Array.isArray(results) ? results : [results]).map(oneText).filter(Boolean);

// acquireSpec — "go learn how to make it well, on its own." Preference order:
//   1. EXAMPLES (the preferred path): an injected `exampleSearch` finds good examples of
//      the kind, and the core engine LEARNS the form from them (learnStructureFromExamples).
//   2. a DEFINITION: an injected `webSearch` fetches a how-to, parsed structurally.
//   3. nothing → the arc floor.
// Both fetchers are injected (proposer-only, the web.js discipline) — the engine never
// touches the network. The learned shape is cached (and persisted to templates/).
export const acquireSpec = async ({
  request = '', kind = null, library, exampleSearch = null, webSearch = null,
  extractText = defaultExtract, extractExamplesFrom = extractExamples,
} = {}) => {
  const k = kind || artifactKindOf(request);
  if (k === 'answer' || !library) return library ? library.learned(k) : null;
  const already = library.learned(k);
  if (already) return already;                         // already built it itself

  // 1) learn from examples
  if (typeof exampleSearch === 'function') {
    let examples = [];
    try { examples = extractExamplesFrom(await exampleSearch(exampleQuery(k))); } catch { examples = []; }
    const tmpl = learnStructureFromExamples(k, examples, { organ: organForKind(k) });
    if (tmpl) return library.define(k, tmpl);
  }
  // 2) fall back to a definition
  if (typeof webSearch === 'function') {
    let text = '';
    try { text = extractText(await webSearch(researchQuery(k))); } catch { text = ''; }
    if (text.trim()) return library.defineFromDefinition(k, text);
  }
  return null;                                          // 3) → arc floor
};
