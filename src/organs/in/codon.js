// EO: INS·CON(Void → Entity,Link,Field, Making,Binding) — codon adapter (DNA/RNA frame)
// The codon adapter — meaning from a raw DNA/RNA reading frame, with NO genetics.
//
// The frequency adapter removed music theory and handed the engine bare Hz; octave
// equivalence then had to be DISCOVERED from shared overtones. This adapter does the
// same one step lower, on the genetic code. The only input is a list of codons —
// bare triplets over a 4-letter alphabet (A,C,G,U/T). Nothing is told to the engine:
// not the codon table, not which codons are synonymous, not that the third base is
// the redundant ("wobble") one, not even that there ARE amino acids. Every codon is
// its own entity. If two codons turn out to be "the same" — to belong to one family —
// the engine has to find that itself.
//
// The one structural fact we use is not biology, it is what a codon physically IS: a
// sequence READ in order, 5'→3'. So a codon's tokens are its PREFIXES — the first
// base, the first two, the whole triplet — exactly the way a tone's tokens were its
// overtones nesting on the fundamental. The first base is the fundamental: it is in
// every prefix and so weighs most; the third base appears in one prefix only and so
// weighs least. That weighting is not a prior about genetics — it is just reading
// order, the same left-to-right the engine reads a sentence in. Two codons' relatedness
// is then nothing but SHARED PREFIXES, measured by the engine's OWN Level-1 existence
// reading — `hits / qLen` over token sets (retrieve/lexical.js). The same set-overlap
// that runs over the words of a sentence, run over the prefixes of a codon, recovers
// the block structure of the genetic code with no codon table in sight.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';

// The prefix token set of a codon: its first base, its first two bases, … the whole
// triplet. Position-tagged and lower-cased so `p1a` (first base A) never collides with
// `p2a…` and so the token survives the tokenizer the retriever runs the query through
// (which lower-cases). Generalizes to k-mers of any length, not just triplets.
const prefixTokens = (codon) => {
  const c = String(codon).toLowerCase();
  const toks = [];
  for (let k = 1; k <= c.length; k++) toks.push(`p${k}${c.slice(0, k)}`);
  return toks;
};

export const ingestCodons = (spec = {}) => {
  const { name = `codons-${spec.docId || 'frame'}`, codons = [], label } = spec;
  const fmt = label || ((c) => String(c).toUpperCase());

  const log = createLog({ docId: name });
  const units = [], sentences = [], tokensBySentence = [], partialTokens = [], codonSeq = [];
  const mentions = new Map();

  codons.forEach((codon, i) => {
    const toks = prefixTokens(codon);
    const set = new Set(toks);

    const id = `n${i}`;
    log.append({ op: 'INS', id, label: fmt(codon), sentIdx: i });
    mentions.set(id, [i]);
    // The reading line: bond each codon to the one before it — adjacency in the
    // reading frame, the frame's own 5'→3' order, never a functional judgement.
    if (i > 0) log.append({ op: 'CON', src: `n${i - 1}`, tgt: id, via: 'next', sentIdx: i });

    units.push(fmt(codon));
    sentences.push(fmt(codon));     // display is the codon; the SPECTRUM is the prefix set
    tokensBySentence.push(set);     // a codon's "tokens" are its prefixes
    partialTokens.push([...set]);
    codonSeq.push(fmt(codon));
  });

  const doc = {
    docId: name, modality: 'codon',
    units, sentences, tokensBySentence, partialTokens, codonSeq,
    log, mentions,
    conventions: createConventions(),
    metadata: spec.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // The query a codon poses to the existence reader: its own prefix spectrum. Pass
  // this to retrieveLexical(doc, query) and the engine ranks every other codon by
  // shared prefixes — sequence relatedness, measured by hits/qLen and nothing else.
  doc.spectrumQuery = (i) => partialTokens[i].join(' ');

  return doc;
};
