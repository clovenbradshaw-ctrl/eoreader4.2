// Negative-control document generators (docs/parse-conformance-spec.md Tier 5).
// Every generator here is deterministic given a seed — reuses mutate.js's
// xorshift32, never Math.random() — so a failing negative control reproduces.
import { makeRng } from './mutate.js';

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ── #19 — Unigram noise ──────────────────────────────────────────────────
// Tokenize a source text into (word, trailingPunctuation) pairs, preserving
// each word's own capitalization exactly as it appears (so the CAPITALIZATION
// RATE of the corpus is preserved in aggregate by construction — sampling with
// replacement from the same bag reproduces the same marginal rate). Then
// resample i.i.d. from that bag to build a same-length synthetic document: same
// word count, same per-word length distribution, same punctuation density, same
// capitalization rate — but the SEQUENCE carries no syntax, no recurring
// argument structure, no coreference. Whatever the real engine finds in this
// text is found in the unigram marginals alone, never in order.
const tokenizeWithPunct = (text) => {
  const out = [];
  const re = /(\S+)(\s+|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) continue;
    out.push(m[1]);
    if (m.index + m[0].length >= text.length) break;
  }
  return out;
};

export const generateUnigramNoise = (sourceText, seed) => {
  const bag = tokenizeWithPunct(sourceText);
  if (!bag.length) return '';
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < bag.length; i++) out.push(pick(rng, bag));
  // Re-space and re-terminate as pseudo-sentences at the SAME rate the source
  // used terminal punctuation, so unit segmentation has something to chew on —
  // without this the whole noise document is one giant run-on unit, which
  // trivially (and uninformatively) admits nothing.
  const sentenceEndRate = bag.filter((w) => /[.!?]$/.test(w)).length / bag.length || 0.05;
  const words = out.map((w) => w.replace(/[.,;:!?]+$/, ''));
  const pieces = [];
  for (let i = 0; i < words.length; i++) {
    pieces.push(words[i]);
    if (rng() < sentenceEndRate || i === words.length - 1) pieces.push('.');
  }
  return pieces.join(' ').replace(/ \./g, '.');
};

// ── #20 — Within-sentence word shuffle ────────────────────────────────────────
// A naive (non-engine) sentence splitter — deliberately simple, so constructing
// this negative control never depends on the very segmentation logic under
// test. Shuffles each sentence's words in place (Fisher-Yates, seeded),
// preserving terminal punctuation as the last token so unit segmentation still
// finds the same boundaries.
const NAIVE_SENTENCE_RE = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;

export const shuffleWithinSentences = (text, seed) => {
  const rng = makeRng(seed);
  const sentences = text.match(NAIVE_SENTENCE_RE) || [text];
  return sentences.map((raw) => {
    const trailingWs = (raw.match(/\s+$/) || [''])[0];
    const body = raw.slice(0, raw.length - trailingWs.length);
    const term = (body.match(/[.!?]+$/) || [''])[0];
    const core = term ? body.slice(0, -term.length) : body;
    const words = core.trim().split(/\s+/).filter(Boolean);
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    return (words.join(' ') + term + trailingWs);
  }).join('');
};

// ── #21 — Paragraph shuffle ───────────────────────────────────────────────
export const shuffleParagraphs = (text, seed) => {
  const rng = makeRng(seed);
  const paras = text.split(/\n{2,}/);
  const sep = (text.match(/\n{2,}/) || ['\n\n'])[0];
  for (let i = paras.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [paras[i], paras[j]] = [paras[j], paras[i]];
  }
  return paras.join(sep);
};

// ── #22 — Duplicate document ─────────────────────────────────────────────────
export const duplicateDocument = (text) => `${text}\n\n${text}`;

// ── #23 — Boilerplate dilution ──────────────────────────────────────────────
// Deterministic, repetitive legal/procedural filler — no proper names, no
// recurring individuated cast, cycled to reach `targetBytes`.
const BOILERPLATE_SENTENCES = [
  'The parties agree that the terms set forth herein shall remain in effect until superseded by a written amendment.',
  'All notices required under this agreement shall be delivered in writing to the addresses specified above.',
  'Any amendment to this agreement shall require the written consent of both parties.',
  'This agreement shall be governed by and construed in accordance with the laws of the applicable jurisdiction.',
  'No waiver of any provision of this agreement shall be effective unless made in writing and signed by both parties.',
  'If any provision of this agreement is held invalid, the remaining provisions shall continue in full force and effect.',
  'This agreement constitutes the entire understanding between the parties with respect to the subject matter herein.',
  'Each party represents that it has full authority to enter into this agreement.',
  'The obligations set forth in this section shall survive termination of this agreement.',
  'Time is of the essence with respect to each and every provision of this agreement.',
];

export const appendBoilerplate = (text, targetBytes) => {
  const parts = [text, ''];
  let size = Buffer.byteLength(text, 'utf8');
  let i = 0;
  while (size < targetBytes) {
    const s = BOILERPLATE_SENTENCES[i % BOILERPLATE_SENTENCES.length];
    parts.push(s);
    size += Buffer.byteLength(s, 'utf8') + 1;
    i++;
  }
  return parts.join(' ');
};

// ── #24 — Sensitivity floor ───────────────────────────────────────────────
// A single, lexically ordinary but STRUCTURALLY anomalous sentence to drop into
// a boilerplate sea — one concrete claim amid abstractions, an off-script
// admission a real reader would flag.
export const ANOMALOUS_SENTENCE =
  'Investigator Marguerite Okonkwo discovered that Halden Construction had falsified three inspection reports.';

// ── Kendall's tau (tau-a, over the intersection of two ranked key sets) ──────
// rankA/rankB: arrays of keys, best-to-worst. Returns tau in [-1,1], or null if
// fewer than 2 keys are common to both rankings (undefined correlation).
export const kendallTau = (rankA, rankB) => {
  const posB = new Map(rankB.map((k, i) => [k, i]));
  const common = rankA.filter((k) => posB.has(k));
  const n = common.length;
  if (n < 2) return null;
  let concordant = 0, discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // common[i] outranks common[j] in A (i<j by construction); concordant iff
      // the same holds in B.
      const bi = posB.get(common[i]), bj = posB.get(common[j]);
      if (bi < bj) concordant++; else if (bi > bj) discordant++;
    }
  }
  const total = (n * (n - 1)) / 2;
  return total ? (concordant - discordant) / total : null;
};
