// EO: EVA(Lens, Dissecting) — the answer weighed by the reader's own reaction (the Born measure)
// The evaluation is PHYSICS, not a parsed verdict. The mechanical veto battery reads an
// answer's LEXICAL contact with the retrieved spans; it cannot tell a grounded paraphrase
// from a confident fabrication that shares the passages' vocabulary, so an `unbound-contact`
// answer rides, shown as grounded (the audit-export straw-hut case).
//
// The move is actor–critic with a MEASURED signal. The reader is asked to REACT to its own
// draft — is this a good, supported answer? — and the reaction is not read for a yes/no word
// (an opaque oracle the rest of the engine refuses on principle). It is MEASURED: the
// reaction is projected onto a valence basis (good ↔ not-good) and put through the Born rule
// (weave/chorus/born.js) — square the amplitudes, normalise to one, and read the two shares
// of that one distribution. A frame HOLDS while it carries most of its own squared amplitude
// (`onMass ≥ offMass` — the same crossing that decides frame-breaking in the enacted loop,
// never a chosen constant); it BREAKS when the mass has moved off it. So a POSITIVE reaction
// (the good frame holds) goes forward; a NEGATIVE one (the frame breaks) goes back. Squaring
// is the signal-from-noise step: a single strong "this is wrong" outweighs several faint
// "seems okay"s, quadratically — which is why we say Born and not "count the words".
//
// The valence basis below is this measure's FRONT-END map — the one modality-specific part
// every EO measurement carries (surprise has axisLabel, the atmosphere has centroids). It
// turns the reaction's WORDS into signed amplitudes; the Born rule does the deciding. When a
// meaning organ (MiniLM) is warm the front-end sharpens: the reaction's SENSE is read on a
// difference-in-means APPROVAL axis — the same paired estimator the polarity canon in
// tools/polarity uses, pointed at approval rather than negation — through the same Born
// partition (`embeddingAssessment`), degrading to the lexical basis offline. Model-INJECTED —
// it never imports a backend, so a test passes a stub and the app the live talker.

import { frameMassPartition } from '../../weave/chorus/born.js';

export const SYSTEM_ASSESS = `You are reviewing a draft answer before it is shown to someone. You will see the exact lines a reader found in a source, the question that was asked, and a draft answer built from those lines. Say honestly what you make of the draft as an answer to that question, given only those lines: is it a good, well-supported answer, or not? Judge whether the lines actually back it up — ignore style. Answer plainly, in a sentence or two.`;

// The reaction prompt: the lines, the question, and the draft, laid out plainly. `lines` are
// already trimmed strings (assessAnswer selects them off the spans). No [sN] tags, no ids.
export const buildAssessmentMessages = ({ question, lines = [], answer } = {}) => {
  const linesBlock = lines.map((l) => `- ${l}`).join('\n') || '- (no lines were found)';
  const user =
    `Lines the reader found:\n${linesBlock}\n\n` +
    `Question: ${String(question || '').trim()}\n\n` +
    `Draft answer: ${String(answer || '').trim()}\n\n` +
    `What do you make of this draft as an answer — is it good and supported by the lines, or not?`;
  return [
    { role: 'system', content: SYSTEM_ASSESS },
    { role: 'user', content: user },
  ];
};

// ── the valence basis (the front-end map into the good ↔ not-good ground) ──────
// Stems, matched against whole lowercased tokens; the strong markers carry a larger
// amplitude, so the Born square suppresses the faint ones quadratically. NEGATIVE is
// checked before POSITIVE per token, so `unsupported` is claimed by NEG and never
// misread as the POS `support`.
const POS_STRONG = ['good', 'great', 'excellent', 'accurate', 'correct', 'solid', 'strong', 'support', 'grounded', 'faithful', 'sound', 'clear', 'direct', 'matches', 'match', 'confirms', 'confirm', 'valid', 'reliable', 'right'];
const POS_MILD   = ['fine', 'okay', 'ok', 'reasonable', 'mostly', 'fair', 'adequate', 'helpful', 'relevant', 'decent'];
const NEG_STRONG = ['wrong', 'incorrect', 'false', 'inaccurate', 'unsupported', 'ungrounded', 'unfounded', 'baseless', 'fabricat', 'invent', 'nonsense', 'unrelated', 'irrelevant', 'misleading', 'hallucinat', 'bogus'];
const NEG_MILD   = ['unclear', 'vague', 'incomplete', 'thin', 'weak', 'doubtful', 'questionable', 'tangential', 'unsure', 'speculat', 'guess'];
// Negators turn a POSITIVE valence word negative within two tokens after them ("not good",
// "isn't accurate", "does not follow"). The flip is one-directional by design: a negator
// before a NEGATIVE word is left alone, so a discourse "No — this is unsupported and wrong"
// reads negative (the "no" reinforcing, not cancelling), where flipping it would misread the
// whole reaction as positive. A genuine double negative ("not wrong") is rarer and low-harm.
// A bare negator with no positive word near it is not itself scored — the explicit valence
// words carry the mass, negation only turns them.
const NEGATORS = new Set(["not", "no", "n't", "never", "hardly", "barely", "cannot", "can't", "without", "lacks", "lack", "fails", "fail", "doesn't", "isn't", "aren't", "wasn't", "don't", "didn't", "nor", "neither"]);

// The ANSWER PARTICLE prior (tools/polarity/response_particles.csv). A reaction to "is this a
// good answer?" that OPENS with a yes/no particle carries a strong approval signal the valence
// words alone miss — a bare "No." scores nothing otherwise. Only the discourse-INITIAL token is
// read this way (a mid-sentence "no"/"not" is a negator, handled separately). English-centric,
// with the common cross-lingual particles a model might slip into; the truth-based ja/ko
// inversion (はい/네 confirming a negative) is noted there but not modelled — the reaction prompt
// is not a negative question and the local talkers answer in English.
const LEAD_YES = new Set(['yes', 'yeah', 'yep', 'yup', 'indeed', 'absolutely', 'agreed', 'sure', 'affirmative', 'si', 'sí', 'oui', 'ja', 'da']);
const LEAD_NO  = new Set(['no', 'nope', 'nah', 'negative', 'non', 'nein', 'nej', 'nie']);

const tokenize = (s) => String(s || '').toLowerCase().match(/[a-z'áíéíóúü]+/g) || [];
const stemHit = (tok, stems) => stems.some((st) => tok === st || tok.startsWith(st));
// A token's bare valence magnitude and sign, NEG checked first. 0 → not a valence word.
const valenceOf = (tok) => {
  if (stemHit(tok, NEG_STRONG)) return -2;
  if (stemHit(tok, NEG_MILD))   return -1;
  if (stemHit(tok, POS_STRONG)) return 2;
  if (stemHit(tok, POS_MILD))   return 1;
  return 0;
};

// The reaction's signed amplitude atoms — the discourse-initial answer particle (if any) plus
// one per valence-bearing token, its sign flipped by a preceding negator. Each is a distinct
// key so the Born normalisation treats them as separate dimensions of the one distribution.
export const valenceAtoms = (text) => {
  const toks = tokenize(text);
  const atoms = [];
  if (toks.length) {
    if (LEAD_YES.has(toks[0])) atoms.push(Object.freeze({ key: 'lead', amp: 2, sign: 1 }));   // "Yes, …" → approval
    else if (LEAD_NO.has(toks[0])) atoms.push(Object.freeze({ key: 'lead', amp: 2, sign: -1 }));   // "No, …" → disapproval
  }
  for (let i = 0; i < toks.length; i++) {
    let v = valenceOf(toks[i]);
    if (!v) continue;
    if (v > 0 && (NEGATORS.has(toks[i - 1]) || NEGATORS.has(toks[i - 2]))) v = -v;   // "not good" → negative
    atoms.push(Object.freeze({ key: `v${i}`, amp: Math.abs(v), sign: v > 0 ? 1 : -1 }));
  }
  return atoms;
};

// The Born measure of the reaction, on the LEXICAL valence basis: square the amplitudes into
// one distribution and read the share on the GOOD frame against the rest (weave/chorus/born.js
// `frameMassPartition`). The answer goes forward when the good frame holds (`onMass ≥ offMass`)
// — the reading's own mass at its own crossing. `measured` is false when the reaction carried
// no valence word at all: no mass to partition, so nothing to refuse on (the honest no-mass,
// never a manufactured negative — a reaction the engine cannot read goes forward). This is the
// embedder-free path — deterministic, offline, and the fallback under the hash organ.
export const bornAssessment = (reaction) => {
  const atoms = valenceAtoms(reaction);
  const measured = atoms.length > 0;
  const { onMass, offMass } = frameMassPartition(
    atoms.map((a) => ({ key: a.key, amp: a.amp })),
    new Set(atoms.filter((a) => a.sign > 0).map((a) => a.key)),
  );
  // Positive when the good frame holds, or when there was nothing to weigh (forward by default).
  const positive = !measured || onMass >= offMass;
  return Object.freeze({ positive, measured, onMass, offMass, atoms: atoms.length, rode: 'valence' });
};

// ── the embedding path: a difference-in-means APPROVAL axis (when a MiniLM organ is warm) ──
// The lexical basis reads the reaction's WORDS; a meaning embedder reads its SENSE. The method
// is the one the polarity canon in tools/polarity uses (a paired difference-in-means direction),
// pointed at the right target: not negation (its axis is engineered to EXCLUDE sentiment) but
// APPROVAL — does the reader like its own draft? The canon below is content-matched good ↔ bad
// pairs; because each pair shares its words, the difference `good − bad` cancels topic and length
// and isolates the approval contrast. Averaged over the pairs it is the approval AXIS; its two
// class poles are the anchors the Born rule weighs. Built from the LIVE embedder (an offline e5
// direction would not align with the browser's MiniLM), embedded once per embedder and cached.
// LENGTH-MATCHED antonym pairs (not "X" / "not X"): the paired subtraction is only a clean
// approval direction if the two sides differ in meaning and nothing else, so a negated side that
// adds the token "not" (and a word of length) would leak length INTO the axis — the artifact's
// own warning. Antonyms keep the pairs the same length; the axis stays meaning, not length. It
// still catches a NEGATED reaction ("not supported") because the embedder maps that near the
// antonym ("unsupported") — the cancellation is at canon-build time, not at read time.
const APPROVAL_CANON = Object.freeze([
  { good: 'This is a good answer.',                bad: 'This is a bad answer.' },
  { good: 'The answer is accurate.',              bad: 'The answer is inaccurate.' },
  { good: 'The answer is supported by the lines.', bad: 'The answer is unsupported by the lines.' },
  { good: 'This answer matches the lines.',        bad: 'This answer contradicts the lines.' },
  { good: 'The lines confirm this claim.',         bad: 'The lines contradict this claim.' },
  { good: 'This answer is grounded in the source.', bad: 'This answer is ungrounded in the source.' },
  { good: 'This is relevant to what was asked.',    bad: 'This is irrelevant to what was asked.' },
  { good: 'A solid, well-founded answer.',          bad: 'A shaky, unfounded answer.' },
  { good: 'The draft reflects the lines.',          bad: 'The draft distorts the lines.' },
  { good: 'This claim is true and verifiable here.', bad: 'This claim is false and unverifiable here.' },
  { good: 'This answer holds up.',                   bad: 'This answer breaks down.' },
  { good: 'This is right.',                          bad: 'This is wrong.' },
]);

const unitVec = (v) => {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
};
const dot = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };

// The approval AXIS, embedded ONCE per embedder instance (it never changes) — a fault while
// embedding it yields null, which routes the measure back to the lexical fallback. `axis` is the
// unit difference-in-means direction `mean(good_i − bad_i)`, pointing toward approval. Because
// each pair shares its content words, the per-pair subtraction cancels topic and length before
// the average, so the axis is a CLEAN approval direction — this cancellation is exactly why the
// projection below is confound-invariant where a raw cosine-to-poles is not (a shared dimension
// like length inflates the cosine to BOTH poles equally and ties them; the subtraction removes it).
const APPROVAL_CACHE = new WeakMap();
const approvalBasis = async (embedder) => {
  const hit = APPROVAL_CACHE.get(embedder);
  if (hit) return hit;
  const [good, bad] = await Promise.all([
    Promise.all(APPROVAL_CANON.map((p) => embedder.embed(p.good))),
    Promise.all(APPROVAL_CANON.map((p) => embedder.embed(p.bad))),
  ]);
  const dim = good[0]?.length || 0;
  const acc = new Float64Array(dim);
  for (let i = 0; i < good.length; i++) {
    const g = unitVec(good[i]), b = unitVec(bad[i]);
    for (let k = 0; k < dim; k++) acc[k] += g[k] - b[k];   // Σ (good − bad), paired
  }
  const basis = { axis: unitVec(acc) };
  APPROVAL_CACHE.set(embedder, basis);
  return basis;
};

// Weigh the reaction geometrically: project it onto the approval AXIS (`reaction · d`, the paired
// difference-in-means scalar in [−1, 1], + toward approval) — the decision, confound-invariant by
// the pairing. The Born rule then gives the "good enough" magnitude: the reaction's position maps
// to approve/disapprove amplitudes `(1 ± proj)/2`, squared and normalised (weave/chorus/born.js
// `frameMassPartition`) into onMass/offMass. `onMass ≥ offMass` iff `proj ≥ 0`, so the crossing is
// the axis's own zero. Same shape as bornAssessment (rode:'embedding') or null when it could not
// run (no embedder, empty reaction, embedding fault) — the caller then falls back to the lexical read.
export const embeddingAssessment = async (reaction, embedder) => {
  const text = String(reaction || '').trim();
  if (!text || !embedder || typeof embedder.embed !== 'function') return null;
  let rRaw, basis;
  try { [rRaw, basis] = await Promise.all([embedder.embed(text), approvalBasis(embedder)]); }
  catch { return null; }
  if (!rRaw || !basis?.axis?.length) return null;
  const proj = dot(unitVec(rRaw), basis.axis);   // + toward approval, − toward disapproval
  const { onMass, offMass } = frameMassPartition(
    [{ key: 'approve', amp: (1 + proj) / 2 }, { key: 'disapprove', amp: (1 - proj) / 2 }],
    new Set(['approve']),
  );
  return Object.freeze({ positive: proj >= 0, measured: true, onMass, offMass, proj, rode: 'embedding' });
};

// Ask the reader to react to its own draft, then weigh the reaction with the Born rule —
// GEOMETRICALLY when a meaning embedder is warm (sentiment against the anchors), else on the
// LEXICAL valence basis. Returns { positive, measured, onMass, offMass, rode, reaction } or
// null when the reaction could not be had (no model, no answer, no lines, or the model
// faulted) — an evaluation that cannot run must never cost the answer, so the stage falls back
// to shipping it. `spans` may be span objects ({ text }) or bare strings; the top few lines the
// answer read are shown. `embedder` is the meaning organ (ctx.geometricEmbedder), optional.
export const assessAnswer = async ({ model, question, spans = [], answer, embedder = null, maxTokens = 160, signal = null } = {}) => {
  if (!model || typeof model.phrase !== 'function' || !answer) return null;
  const lines = spans
    .map((s) => (typeof s === 'string' ? s : s?.text) || '')
    .map((s) => String(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return null;
  const messages = buildAssessmentMessages({ question, lines, answer });
  let reaction;
  try {
    reaction = await model.phrase(messages, { maxTokens, ...(signal ? { signal } : {}) });
  } catch {
    return null; // a faulted reaction must never cost the answer
  }
  const useEmbed = embedder && (embedder.measuresMeaning ?? false) && (embedder.isWarm ? embedder.isWarm() : true);
  const measure = (useEmbed ? await embeddingAssessment(reaction, embedder) : null) || bornAssessment(reaction);
  return Object.freeze({ ...measure, reaction: String(reaction || '').slice(0, 500) });
};
