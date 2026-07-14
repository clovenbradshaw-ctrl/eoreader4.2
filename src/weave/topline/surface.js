// EO: SYN·EVA·SEG(Field,Link,Lens → Lens,Void, Composing,Binding,Dissecting) — the form surface
// The summarizer as a FORM SURFACE (docs/tiny-model-form-surface.md). Once the fold has decided
// what is true and in what order, the only work left for a model is SURFACE REALIZATION: turn a
// validated holon into a sentence a human can read. That is not a knowledge task. It is a FORM
// task, and form is the one thing small models are good at.
//
// The summarizer's contract is the tightest in the catalog:
//
//     ops = DEF        — assert within a frame, and NOTHING else
//     terrains = Lens  — one reading of one holon set
//     stances = Making — produce a specific thing
//
// And the payoff of that narrowness is this: EVERY class of summarization failure is an operator
// the contract does not grant. Hallucination is not a vibe-level property a bigger model
// suppresses — in this algebra it is a CONTRACT VIOLATION, the same typed, deterministic, logged
// rejection as everything else:
//
//     invented a fact / name / number   → INS   (minted an entity that wasn't in the tape)
//     invented a relation               → CON   (bonded two things the tape never bonded)
//     invented a thesis / "what it means"→ SYN   (synthesised a whole the kernel didn't compose)
//     reframed the corpus               → REC   (restructured the frame it was handed)
//     editorialised / set a tone        → terrain violation (fired at Atmosphere, empty room)
//     flipped a polarity                → EVA   (originated a judgment with no prior event)
//
// "Did it make something up" becomes a set-membership test on a region of the cube. The whole
// safety is a property of the VERIFIER, not the model — so this holon IS the verifier, and the
// model is the easy part.

import { contract, notateContract } from '../../core/contract.js';
import { describeModel } from '../../model/interface.js';
import { contentTokens, addedBy } from './contain.js';

// ── the contract of the part being verified ─────────────────────────────────────────────────
// This is NOT this module's own contract (that lives in eo-contract.js, an EVA gate). This is the
// contract of the SUMMARIZER — the model-as-part whose output this holon judges. The tightest in
// the catalog: assert (DEF) one reading (Lens), producing a specific thing (Making). Everything
// else is off the alphabet. Frozen and self-checking: `.valid` is proven in tests/surface.test.js.
export const FORM_SURFACE_CONTRACT = contract({
  ops: ['DEF'],           // may assert within a frame — and only that
  terrains: ['Lens'],     // one reading of one holon set — never Entity (mint), never Atmosphere (mood)
  stances: ['Making'],    // produce a specific thing
  note: 'the summarizer as a form surface',
});

// The mask width the realizer was granted, as a single logged number: how many operators the
// contract admits (1 for DEF-only). The essay's "mask width" is a declared, logged knob widened
// by !REC, never a magic number — this is that knob at the op grain.
export const CONTRACT_WIDTH = FORM_SURFACE_CONTRACT.ops.length;

// ── the diagnostic lexicons — what a specific added token means in the cube ──────────────────
// A content token the output added beyond its anchor is a move the model made that the tape did
// not license. WHICH move it is depends on the token. These closed classes are checked in order;
// anything left over is the default INS (a minted referent). Every set is small, auditable, and
// deliberately conservative — a false "clean" is worse than a false "violation", because a missed
// fabrication ships and a spurious one only falls back to the safe extractive floor.

// Negation flips a claim's truth — asserting the opposite holds is a judgment (EVA) the log never
// carried. Kept OUT of the free connectives for exactly this reason (contain.js).
const NEGATION = new Set('not no never without neither nor cannot none'.split(' '));

// Hedges imply a source or an interpretive stance the record did not carry — "a new hedge that
// implies a source" is the canonical smuggled Atmosphere: interpretive weather in an empty room.
const HEDGE = new Set((
  'reportedly allegedly apparently seemingly supposedly presumably ostensibly ' +
  'perhaps possibly probably likely arguably conceivably claimed purportedly'
).split(' '));

// Mood / editorial words set a tone — they fire at Atmosphere (the ambient interpretive weather)
// with no Atmosphere in the room. A summary that "captures the overall feeling" is the desert cell
// wearing prose. This is the tone lexicon, not exhaustive but load-bearing.
const MOOD = new Set((
  'tragic tragically shocking shockingly remarkable remarkably surprising surprisingly ' +
  'clearly obviously evidently notably crucially importantly sadly fortunately unfortunately ' +
  'brilliant brilliantly disastrous devastating alarming striking stunningly damning telling ' +
  'controversial infamous notorious beloved celebrated'
).split(' '));

// Synthesis words make the "what this all means" move — an emergent whole the kernel did not
// compose (SYN). A summary is legal as DEF over settled holons; it is a fabrication the moment it
// reaches for the thesis nobody wrote.
const SYNTHESIS = new Set((
  'overall ultimately therefore thus consequently altogether cumulatively ' +
  'suggests suggesting implies implying reveals revealing demonstrates demonstrating ' +
  'indicates indicating reflects reflecting underscores pattern trend theme takeaway'
).split(' '));

// Reframing words restructure the frame the model was handed (REC) — "actually", "in essence",
// the small tics that re-categorise. Low-confidence and minimal by design.
const REFRAME = new Set('actually really essentially fundamentally basically'.split(' '));

// One added token → its typed violation. Total: an unclassified content token is a minted
// referent (INS), the summarizer's most common and most dangerous move.
const classifyToken = (tok) => {
  const t = String(tok || '').toLowerCase();
  if (NEGATION.has(t))  return { kind: 'polarity-flip',    face: 'Act',  op: 'EVA', token: t };
  if (HEDGE.has(t))     return { kind: 'hedge',            face: 'Site', terrain: 'Atmosphere', token: t };
  if (MOOD.has(t))      return { kind: 'mood',             face: 'Site', terrain: 'Atmosphere', token: t };
  if (SYNTHESIS.has(t)) return { kind: 'invented-thesis',  face: 'Act',  op: 'SYN', token: t };
  if (REFRAME.has(t))   return { kind: 'reframe',          face: 'Act',  op: 'REC', token: t };
  return { kind: 'invented-referent', face: 'Act', op: 'INS', token: t };
};

// Classify everything the output added beyond its anchor into typed cube-region violations,
// grouped by kind so the audit reads "3 invented referents, 1 mood word" rather than a token list.
// `added` is { words, numbers } from contain.addedBy. A minted NUMBER is always an INS (a value the
// tape never carried), grouped with the invented referents.
export const classifyAdditions = (added) => {
  const byKind = new Map();
  const push = (v) => {
    const key = v.kind;
    const cur = byKind.get(key) || { kind: v.kind, face: v.face, op: v.op, terrain: v.terrain, tokens: [] };
    cur.tokens.push(v.token);
    byKind.set(key, cur);
  };
  for (const w of added.words || []) push(classifyToken(w));
  for (const n of added.numbers || []) push({ kind: 'invented-referent', face: 'Act', op: 'INS', token: String(n) });
  return [...byKind.values()].map((v) => Object.freeze({ ...v, tokens: Object.freeze([...new Set(v.tokens)]) }));
};

// ── the verifier at the same grain as the output ─────────────────────────────────────────────
// The essay's honest list of what EVA can check cheaply and deterministically, and — named, not
// hidden — the residue it cannot. `output` is the realized sentence(s); `anchor` is the text the
// realizer was allowed to draw on (the holon set's own words: spans + schema). Options:
//   holons     — [{ key, tokens:[…] }] to score coverage against; each must be represented.
//   maxChars   — the length envelope; default derives from the anchor (realization never expands).
//   oneSentence— require exactly one sentence (the sentence-per-holon discipline).
// Returns a structured, serialisable verdict — a typed reading of one output, never a score alone.
export const verifyForm = (output, { anchor = '', holons = null, maxChars = null, oneSentence = false } = {}) => {
  const text = String(output || '').trim();
  const added = addedBy(text, anchor);

  // anchoring + numeric fidelity: every content token and every number traces to the anchor.
  const anchoring = { ok: added.words.length === 0, added: { words: added.words } };
  const numeric = { ok: added.numbers.length === 0, numbers: added.numbers };

  // budget: length envelope, sentence count, and the no-hedging discipline (hedges are content the
  // anchor could not carry, so they already fail anchoring — but a budget verdict names them too).
  const chars = text.length;
  const limit = Number.isFinite(maxChars) ? maxChars : Math.max(80, Math.ceil(anchor.length * 1.1));
  const sentences = (text.match(/[.!?]+(?:\s|$)/g) || []).length || (text ? 1 : 0);
  const hedged = [...new Set(contentTokens(text).filter((t) => HEDGE.has(t)))];
  const budget = {
    ok: chars <= limit && (!oneSentence || sentences <= 1) && hedged.length === 0,
    chars, limit, sentences, overLength: chars > limit, hedged,
  };

  // coverage: every holon in the window is represented; none silently dropped. Composes
  // pessimistically upward (composeCoverage). Skipped (ok, ratio 1) when no holon set is supplied.
  const coverage = coverageOf(text, holons);

  const violations = classifyAdditions(added);
  const ok = anchoring.ok && numeric.ok && budget.ok && coverage.ok;
  return Object.freeze({
    ok,
    verdict: ok ? 'pass' : 'fail',
    checks: Object.freeze({ anchoring, numeric, budget, coverage }),
    violations: Object.freeze(violations),
    // The honest hole (§5): anchoring and no-new-referent do NOT catch a paraphrase that keeps the
    // referents but changes the claim ("declined to fund" vs "delayed funding"), nor an implicature
    // smuggled by juxtaposition. Only entailment does. Named here so "extraordinarily effective" is
    // never claimed for a check that isn't running. One holon per sentence shrinks the residue by
    // construction; a cross-encoder NLI pass is the standing project that closes it.
    residue: Object.freeze(['paraphrase-fidelity', 'implicature']),
  });
};

// Is every holon in the window represented in the output? A holon is represented when at least one
// of its salient content tokens survives into the realized text. Pure; no holons → trivially met.
const coverageOf = (text, holons) => {
  if (!Array.isArray(holons) || holons.length === 0) return { ok: true, ratio: 1, represented: 0, total: 0, missing: [] };
  const out = new Set(contentTokens(text));
  const missing = [];
  let represented = 0;
  for (const h of holons) {
    const toks = (h.tokens || contentTokens(h.text || '')).map((t) => String(t).toLowerCase());
    const hit = toks.some((t) => out.has(t));
    if (hit) represented += 1; else missing.push(h.key ?? h.text ?? '?');
  }
  return { ok: missing.length === 0, ratio: represented / holons.length, represented, total: holons.length, missing };
};

// ── coverage composes upward, pessimistically (§9) ───────────────────────────────────────────
// A section summary's coverage is the envelope of its sentences'; the document's is the envelope of
// its sections'. And it composes PESSIMISTICALLY: what a section drops, the document cannot recover.
// The number that reaches the top is real, and sometimes embarrassing. It is printed anyway — an
// accountable-loss system that hides its loss at the last step has failed at the only thing it was
// for. Returns the min ratio and the UNION of everything dropped anywhere below.
export const composeCoverage = (children) => {
  const cs = (children || []).filter(Boolean);
  if (cs.length === 0) return Object.freeze({ ratio: 1, missing: Object.freeze([]), children: 0 });
  const ratio = Math.min(...cs.map((c) => (Number.isFinite(c.ratio) ? c.ratio : 1)));
  const missing = [...new Set(cs.flatMap((c) => c.missing || []))];
  return Object.freeze({ ratio, missing: Object.freeze(missing), children: cs.length });
};

// ── the extractive floor (§6) ────────────────────────────────────────────────────────────────
// The downside of a tiny model is not a hallucination; it is a quotation. If no realized sentence
// passes the verifier in k samples plus revisions, the pipeline emits the ANCHORED SPAN ITSELF,
// marked extractive, provenance intact. Worst case is 1:1 transcription — the position we already
// hold, and a correct one. This is what makes tiny-model failure SAFE.
export const extractiveFloor = ({ holons = null, anchor = '', cite = [] } = {}) => {
  const fromHolons = Array.isArray(holons) && holons.length
    ? holons.map((h) => String(h.text || '').trim()).filter(Boolean).join(' ')
    : '';
  const text = (fromHolons || firstSentence(anchor) || String(anchor || '')).trim();
  return Object.freeze({ text, mode: 'extractive', extractive: true, cite: Object.freeze([...cite]) });
};

const firstSentence = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : t).trim();
};

// ── the replay receipt (§8) ──────────────────────────────────────────────────────────────────
// Everything the model does must be reproducible: a summary sentence is a claim with provenance,
// replayable to the token. Model descriptor, prompt hash, seed, sample index, mask width, verdict —
// logged beside the holon, the same as everything else in the ledger. Pure and deterministic: no
// Date.now / Math.random (seed and sample index are passed IN, so a replay reproduces the receipt).
export const formReceipt = ({ output = '', anchor = '', system = '', model = null, seed = 0, sampleIndex = 0, mode = 'realized', verdict = null } = {}) => Object.freeze({
  model: describeModel(model),
  promptHash: hashText(`${system} ${anchor}`),
  outputHash: hashText(String(output || '')),
  seed, sampleIndex,
  // The literal mask width: the size of the vocabulary the realizer was permitted to draw on (the
  // anchor's content tokens + numbers). A widened mask is a bigger number, logged, never a config.
  maskWidth: new Set(contentTokens(anchor)).size + (String(anchor).match(/\d[\d,]*(?:\.\d+)?/g) || []).length,
  contract: notateContract(FORM_SURFACE_CONTRACT),
  contractWidth: CONTRACT_WIDTH,
  mode,
  verdict: verdict ? verdict.verdict : null,
  violations: verdict ? verdict.violations.map((v) => v.kind) : [],
});

// FNV-1a over a string → an 8-hex handle. Deterministic, dependency-free, browser+node — a stable
// token to replay against, not a cryptographic digest. Same input, same hash, forever.
export const hashText = (s) => {
  let h = 0x811c9dc5;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

// ── best-of-k against the verifier, then the floor (§5 + §6) ─────────────────────────────────
// Eight samples from a 1B model plus a real verifier beats one sample from a 70B model plus hope,
// at a fraction of the cost, and it leaves a log. This drives that loop: draw up to k samples
// (varying by sample index), verify each, take the FIRST that passes. On total failure — after
// revisions — fall to the extractive floor. Model-optional and injection-shaped: `phrase(seed,
// sampleIndex)` is the one impure edge (the actual decode); tests pass a deterministic stand-in,
// and a caller with no model passes none and gets the floor. Returns a realized record with its
// receipt, so every summary sentence carries the trace of how it was produced.
export const realizeForm = async ({
  phrase = null, anchor = '', holons = null, system = '', model = null,
  samples = 8, revisions = 2, seed = 1, maxChars = null, oneSentence = true, cite = [], signal = null,
} = {}) => {
  const attempts = Math.max(1, samples) * (1 + Math.max(0, revisions));
  let lastVerdict = null, lastText = '';
  if (typeof phrase === 'function') {
    for (let i = 0; i < attempts; i++) {
      if (signal?.aborted) break;
      const candidate = String((await phrase(seed, i)) || '').trim();
      if (!candidate) continue;
      const verdict = verifyForm(candidate, { anchor, holons, maxChars, oneSentence });
      lastVerdict = verdict; lastText = candidate;
      if (verdict.ok) {
        return Object.freeze({
          text: candidate, mode: 'realized', sampleIndex: i, verdict, cite: Object.freeze([...cite]),
          receipt: formReceipt({ output: candidate, anchor, system, model, seed, sampleIndex: i, mode: 'realized', verdict }),
        });
      }
    }
  }
  // Nothing passed (or no model): the anchored span itself, marked extractive.
  const floor = extractiveFloor({ holons, anchor, cite });
  const verdict = lastVerdict || verifyForm(floor.text, { anchor, holons, maxChars, oneSentence });
  return Object.freeze({
    text: floor.text, mode: 'extractive', extractive: true, sampleIndex: -1,
    verdict, cite: floor.cite, rejected: lastText || null,
    receipt: formReceipt({ output: floor.text, anchor, system, model, seed, sampleIndex: -1, mode: 'extractive', verdict }),
  });
};
