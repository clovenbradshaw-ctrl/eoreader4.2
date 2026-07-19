// EO: SIG(Entity,Field → Field, Tending) — the text perceiver (docs/omnimodal-waveform.md §4.1)
// Turns an already-parsed text `doc` (src/organs/in/text.js `ingestText`) into a
// Reading. Deliberately thin: units, the coarse/fine segments, and the cast are
// all read straight off what the modelless parse already computed — this
// perceiver's job is the MAPPING onto the omnimodal vocabulary, not new
// detection. No LLM anywhere in it; `field` comes from the deterministic,
// zero-warmup hash embedder already in the tree (model/embed-hash.js) — modelless
// in the same sense a bag-of-words count is, not a neural read.
//
// FOREGROUND / PRESENT / LATENT, resolved (a clarification of the spec's own
// §4.1 sketch, which — read literally — would zero out "the creature"'s mass and
// break the individuation gate's own canonical example; see the note above
// buildSightings):
//   FOREGROUND  a direct on-page mention (named or an un-INS'd descriptor's own
//               definite description) in subject position this sentence.
//   PRESENT     a direct on-page mention, not in subject position.
//   LATENT      no direct mention THIS sentence, but still oriented-toward: a
//               decaying coref-field trace (a pronoun/topic still "in play").
//
// Mass only ever comes from a direct mention (FOREGROUND/PRESENT); LATENT never
// contributes mass, only coupling (contract.js §2.1) — so a referent's coupling
// can still spike from being talked-about (Kurtz) without a single direct
// mention inflating its mass.

// A declared seam (src/core/seams.js), not routed through model/index.js:
// that barrel also pulls in every model backend (anthropic.js, wllama.js,
// webllm.js, …), several of which reach weave/write -> organs/ingest -> the
// perceiver entrance — closing a cycle back on this very module the instant
// model/index.js's barrel is evaluated. embed-hash.js has no such risk (its
// only import is perceiver/parse/index.js, a leaf that never reaches back up).
import { createHashEmbedder } from '../../model/embed-hash.js';
import { boundedNull } from '../../core/index.js';
import { cosineMetric } from '../../weave/waveform/index.js';
import { ROLES } from '../contract.js';
import { provisionalId } from '../individuation.js';

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// The same one-line Born line individuation.js's deriveGates derives its
// agencyLine from — replicated here (not imported as a side effect of
// deriveGates, which would also derive an unused mnull/rnull) so this
// perceiver's agency cut is the document's own, not a hand-set 0.5.
const deriveAgencyLine = (subjShares) =>
  boundedNull(subjShares, { alpha: 0.05, ceiling: 1, fallback: median(subjShares) });

// Coarse segments — a chapter/section/part heading heuristic over the sentence
// array alone (no dedicated terrain/register segmentation module exists in the
// tree yet; §3.3's core-detected change-points cover a document with no such
// headings at all). A document with no headings yields an empty coarse list,
// so pure core detection is the fallback, not a crash.
const HEADING_RE = /^\s*(chapter|part|section|book)\b/i;
export const detectChapterBoundaries = (sentences) => {
  const starts = [];
  for (let i = 0; i < sentences.length; i++) if (HEADING_RE.test(sentences[i])) starts.push(i);
  if (!starts.length) return [];
  const bounds = [...new Set([0, ...starts])].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i], end = i + 1 < bounds.length ? bounds[i + 1] : sentences.length;
    if (end > start) segs.push({ start, end, label: sentences[start].trim().slice(0, 60), level: 'coarse' });
  }
  return segs;
};

// A definite/possessive description at the very front of its sentence reads as
// the clause's subject ("The creature fled…"); anything else is oblique
// ("…searched for the creature").
const SUBJECT_FRONT_RE = (roleKey) => new RegExp(`^\\s*(the|a|an|his|her|their|its)\\s+${roleKey}\\b`, 'i');
const scanDescriptorMentions = (sentences, roleKey) => {
  const re = new RegExp(`\\b${roleKey}\\b`, 'i');
  const frontRe = SUBJECT_FRONT_RE(roleKey);
  const hits = [];
  for (let i = 0; i < sentences.length; i++) {
    if (!re.test(sentences[i])) continue;
    hits.push({ ordinal: i, role: frontRe.test(sentences[i]) ? ROLES.FOREGROUND : ROLES.PRESENT });
  }
  return hits;
};

// buildReferentsAndSightings — the cast, in the omnimodal vocabulary. Named
// entities come straight off the projection (graph.entities — this already
// includes any unnamed-referent promotion, itself a legitimate "earned an
// identity" event, not something this perceiver special-cases). Still-unbound
// descriptor referents (coref's standing-role channel) are re-scanned against
// the sentence text for their own direct mentions, since createCorefField
// exposes only the aggregate mass, not a per-mention ordinal history.
const buildReferentsAndSightings = (doc, sentences) => {
  const graph = doc.projectGraph ? doc.projectGraph() : { entities: new Map() };
  const admission = doc.admission;
  const corefField = doc.corefField;
  const labelOf = (id) => (admission && admission.labelOf && admission.labelOf(id))
    || (graph.entities.get(id) && graph.entities.get(id).label) || id;

  const events = doc.log.snapshot();
  const insBySent = new Map();     // sentIdx → Set<id>
  const relBySent = new Map();     // sentIdx → [{src,tgt}]
  for (const e of events) {
    if (e.sentIdx == null) continue;
    if (e.op === 'INS') {
      if (!insBySent.has(e.sentIdx)) insBySent.set(e.sentIdx, new Set());
      insBySent.get(e.sentIdx).add(e.id);
    } else if (e.op === 'CON' || e.op === 'SIG') {
      if (!relBySent.has(e.sentIdx)) relBySent.set(e.sentIdx, []);
      relBySent.get(e.sentIdx).push({ src: e.src, tgt: e.tgt });
    }
  }

  const namedIds = [...graph.entities.keys()];
  const subjShares = namedIds.map((id) => {
    const sig = admission && admission.signals ? admission.signals(labelOf(id)) : null;
    return sig ? sig.subjShare : 0;
  });
  const agencyLine = deriveAgencyLine(subjShares);

  const referents = [];
  const sightings = [];

  for (const id of namedIds) {
    const label = labelOf(id);
    referents.push({ key: id, display_name: label, ins: true });
    const sig = admission && admission.signals ? admission.signals(label) : null;
    const subjShare = sig ? sig.subjShare : 0;
    for (let i = 0; i < sentences.length; i++) {
      const here = insBySent.get(i);
      if (here && here.has(id)) {
        const role = Number.isFinite(agencyLine) && subjShare >= agencyLine ? ROLES.FOREGROUND : ROLES.PRESENT;
        sightings.push({ referent: id, ordinal: i, role, evidence: 1 });
        continue;
      }
      // Not directly mentioned this sentence — still oriented-toward if the
      // coref field keeps a decaying trace on it (a pronoun/topic still live).
      const trace = corefField && corefField.field ? corefField.field(i).find((c) => c.id === id) : null;
      if (trace && trace.w > 0) {
        sightings.push({ referent: id, ordinal: i, role: ROLES.LATENT, evidence: Math.min(1, trace.w) });
      }
    }
  }

  const descriptors = corefField && corefField.descriptorReferents ? corefField.descriptorReferents() : [];
  for (const dr of descriptors) {
    if (dr.bound) continue;                         // already folded onto a name — not provisional
    const key = provisionalId(dr.roleKey);
    referents.push({ key, display_name: dr.roleKey, ins: false });
    for (const hit of scanDescriptorMentions(sentences, dr.roleKey)) {
      sightings.push({ referent: key, ordinal: hit.ordinal, role: hit.role, evidence: 1 });
    }
  }

  return { referents, sightings };
};

const VOCAB = Object.freeze({ FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' });

// buildTextReading — the perceiver's entry point. `doc` is whatever ingestText
// (or an equivalent parse) returned: `.sentences`, `.log`, `.admission`,
// `.corefField`, `.projectGraph`. `opts.embedder` overrides the default hash
// embedder (tests / a future warmed embedder can pass their own — as long as it
// stays modelless and deterministic, contract.js's metric(f,f)≈0 check will
// catch one that isn't).
export const buildTextReading = async (doc, opts = {}) => {
  const sentences = doc.sentences || doc.units || [];
  const embedder = opts.embedder || createHashEmbedder();
  const vectors = await Promise.all(sentences.map((s) => embedder.embed(s)));

  const units = sentences.map((s, i) => ({
    id: `s${i}`,
    ordinal: i,
    span: { sentIdx: i, text: s },
    field: Array.from(vectors[i]),
  }));

  const coarse = detectChapterBoundaries(sentences);
  const { referents, sightings } = buildReferentsAndSightings(doc, sentences);

  return {
    units,
    metric: cosineMetric,
    segments: coarse,
    referents,
    sightings,
    vocab: VOCAB,
    resolve: (span) => ({ sentIdx: span.sentIdx, preview: span.text }),
    meta: { modality: 'text', perceiverVersion: '1.0.0' },
  };
};
