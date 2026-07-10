// EO: EVA·NUL(Field → Lens,Void, Binding,Clearing) — meaningfulness + visible trace
// Metacognition — the machine testing the MEANINGFULNESS of any content with the Born rule,
// and making the reading VISIBLE as it happens.
//
// Two faculties, both reflexive (the machine reading its own reading):
//
//   meaningfulness(content)  — does this content COHERE into a reading, or is it a diffuse smear?
//     Build ρ over the content's operator activations; its eigenspectrum is the Born answer. A
//     meaningful content concentrates Born mass into a few readings that stand out above the noise
//     floor the spectrum's own bulk throws up (deriveNull); a structureless smear stays near the
//     maximally-mixed ground (every reading equally weak — no figure can stand out). This is the
//     measurable firewall the spiral needed: before a verdict is promoted to the next level's
//     Existence, test that it MEANS something — else the climb degrades to a hall of mirrors,
//     amplifying noise as fact (dreaming gone wrong). Provenance rides through untouched: testing
//     the self's own content returns a verdict still stamped owner=self, level=n.
//
//   traceReading(content)    — the reading made VISIBLE. Instead of an opaque "…" while the machine
//     parses, emit what it is parsing THROUGH, in EOT surface syntax: each figure as it enters
//     (INS), each bond as it forms (LINK triple), each predicate (IS-A), the cut and the
//     meaningfulness verdict. The metacognition is shown, not hidden — the trace IS the thinking.

import { buildDensity, eigenLenses, vonNeumann, deriveNull } from '../core/index.js';
import { structuralActivations } from './structure-basis.js';
import { parseText } from '../perceiver/parse/index.js';
import { plainRel } from '../perceiver/surfaces.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// Resolve any content to (doc, activation vectors, provenance). Content may be:
//   a string                — parsed fresh (totalRead);
//   a parsed doc (.log)      — used as-is;
//   a promoted existence     — its .existence.text parsed, provenance carried;
//   a surfToAnswer result    — its verbatim quotes parsed, provenance from sourceProvenance;
//   an array of vectors      — used directly (no doc).
const resolveContent = (content, { totalRead = true } = {}) => {
  if (Array.isArray(content) && Array.isArray(content[0])) return { vectors: content, provenance: null };
  let text = null, provenance = null, doc = null;
  if (typeof content === 'string') text = content;
  else if (content?.log) doc = content;
  else if (content?.existence?.text != null) { text = content.existence.text; provenance = content.existence.provenance || null; }
  else if (content?.sourceProvenance && content?.verbatim) { text = content.verbatim.quotes.map((q) => q.text).join(' '); provenance = content.sourceProvenance; }
  else if (content?.verbatim) text = content.verbatim.quotes.map((q) => q.text).join(' ');
  else text = String(content ?? '');
  if (!doc && text != null) doc = parseText(text, { docId: 'metacog', totalRead });
  const { activations } = structuralActivations(doc);
  return { doc, vectors: activations, provenance };
};

// meaningfulness — the Born test, pure on activation vectors.
export const meaningfulness = (vectors, { alpha = 0.05 } = {}) => {
  const active = (vectors || []).filter((v) => Array.isArray(v) && v.some((x) => x !== 0));
  if (!active.length) return Object.freeze({ meaningful: false, reason: 'empty — no content to read', concentration: 0, departure: 0, entropy: 0, readings: 0, dim: 0, signalReadings: 0 });
  const { rho } = buildDensity(active);
  const n = rho.length;
  const lenses = eigenLenses(rho);
  const lambda = lenses.map((l) => l.weight).filter((w) => w > 1e-9).sort((a, b) => b - a);
  const S = vonNeumann(lambda);
  // departure from the maximally-mixed ground = ln(n) − S (relEntropy(ρ, I/n) reduces to this);
  // concentration normalises it to [0,1]: 0 = a flat spectrum (no reading stands out, a smear),
  // 1 = a pure state (one definite reading).
  const departure = Math.log(Math.max(1, n)) - S;
  const concentration = n > 1 ? round(departure / Math.log(n)) : 1;
  const purity = round(lambda.reduce((a, b) => a + b * b, 0));
  // the noise floor the spectrum's own bulk throws up — how many readings beat chance (deriveNull,
  // the engine's own VOID null). With too few eigenvalues to fit a null it abstains (Infinity), and
  // we fall back to "carries more than twice the uniform share" — a reading that genuinely stands out.
  const floor = deriveNull(lambda, { alpha });
  const signalReadings = Number.isFinite(floor) ? lambda.filter((w) => w > floor).length
                                                : lambda.filter((w) => w > 2 / n).length;
  // The verdict is the BORN judgment, not a number: does a reading stand out above what chance
  // would throw up (deriveNull)? "More interesting than chance" or not — that is the whole signal.
  // The scalars ride along for machinery, but the answer is qualitative.
  const meaningful = signalReadings >= 1 && departure > 1e-6;
  return Object.freeze({
    meaningful,
    // "THIS is interesting" — the OBJECTIVE claim: the content beats chance (against σ, the noise
    // floor), reader-independent. The subjective counterpart, "I find this interesting" (against the
    // reader's own ρ), is the reader's to say (reader.js), never the content's.
    verdict: meaningful ? 'this is interesting' : 'this is no more interesting than chance',
    signalReadings,                                   // how many readings beat the noise floor
    concentration, departure: round(departure), entropy: round(S), purity,
    topWeight: round(lambda[0] || 0),
    noiseFloor: Number.isFinite(floor) ? round(floor) : null,
    readings: lambda.length, dim: n,
  });
};

// metacognize — test the meaningfulness of any content, RETAINING provenance. The verdict the
// spiral consults before promote: only meaningful content earns the climb to the next Existence.
export const metacognize = (content, { provenance = null, alpha = 0.05, totalRead = true } = {}) => {
  const r = resolveContent(content, { totalRead });
  const m = meaningfulness(r.vectors, { alpha });
  return Object.freeze({
    ...m,
    basis: 'operators',                              // the embedder-free structural basis ρ was built over
    provenance: provenance || r.provenance || null,  // whose content this is — carried through untouched
  });
};

// A figure-label map from the log's INS events (id → first label), so a bond can be shown by name.
const labelMap = (events) => { const m = new Map(); for (const e of events) if (e.op === 'INS' && !m.has(e.id)) m.set(e.id, e.label); return m; };

// traceReading — the VISIBLE metacognition. Walk the reading in order and emit what it parsed
// THROUGH, in EOT surface syntax: a figure entering (INS → `exists: X`), a bond forming (LINK →
// `A -> B : rel`), a predicate (IS-A → `X : value`), an inter-proposition link, the cut, and the
// meaningfulness verdict at the end. A chat surface streams these instead of a spinner — the
// reading is shown as it happens. Returns ordered lines plus the meaningfulness summary.
export const traceReading = (content, { max = 40, totalRead = true } = {}) => {
  const doc = (typeof content === 'string') ? parseText(content, { docId: 'trace', totalRead })
            : content?.log ? content
            : (content?.existence?.text != null) ? parseText(content.existence.text, { docId: 'trace', totalRead })
            : parseText(String(content ?? ''), { docId: 'trace', totalRead });
  const events = doc?.log?.snapshot ? doc.log.snapshot() : [];
  const label = labelMap(events);
  const name = (id) => label.get(id) || id;
  const lines = [];
  for (const e of events) {
    if (lines.length >= max) break;
    if (e.op === 'INS') lines.push({ op: 'INS', eot: `exists: ${e.label}`, sentIdx: e.sentIdx });
    else if ((e.op === 'CON' || e.op === 'SIG')) {
      if (e.linkKind === 'inter-proposition') lines.push({ op: e.op, link: true, eot: `${e.src} -> ${e.tgt} : ${plainRel(e.via)}`, sentIdx: e.sentIdx });
      else if ((e.confidence ?? 0) >= 0.85) lines.push({ op: e.op, eot: `${name(e.src)} -> ${name(e.tgt)} : ${e.polarity === '−' ? 'not-' : ''}${plainRel(e.via)}`, sentIdx: e.sentIdx, confidence: e.confidence });
    } else if (e.op === 'DEF' && e.key === 'predicate') lines.push({ op: 'DEF', eot: `${name(e.id)} : ${e.value}`, sentIdx: e.sentIdx });
  }
  const { activations } = structuralActivations(doc);
  const m = meaningfulness(activations);
  return Object.freeze({
    lines,
    meaningfulness: m,
    // the closing metacognitive beat — the Born judgment, not a number: did a reading stand out
    // above chance, or is it a smear? That is what we care about.
    summary: `read: ${m.meaningful ? 'a reading stands out — this is interesting' : 'nothing beats chance — a smear'}`,
  });
};
