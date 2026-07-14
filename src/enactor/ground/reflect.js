// EO: EVA·CON(Network,Link → Lens, Tracing,Binding) — answer reflection (reflectAnswer)
// reflectAnswer — read the model's OUTPUT back through the perceiver.
//
// The truth-seeking loop, closed: after the talker speaks, its prose is parsed into
// EOT (Existential-Operator Triples, docs/eot-surface-syntax.md) — the same surface
// syntax the engine uses for its own notes — and each lowered proposition is compared
// with the document graph. The judgement is not just "is this claim in the graph"
// but "how well-grounded is what the graph holds": a relation witnessed by several
// INDEPENDENT origins (different documents, different pages) is corroborated; one
// witnessed by a single sentence is single-source; one present only through the
// engine's own notes (the enactor door — reafference) is interpretation, not record;
// one witnessed by nothing is unwitnessed.
//
// Every judgement carries its witnesses — the sentence, its index, and the document
// it came from — so the UI can show, on hover, exactly where each claim allegedly
// comes from. Pure and DOM-free; the chat renders what this returns.
//
// This is the diversity half of the provenance story: classifyProvenance (provenance.js)
// answers "verbatim / grounded / fabricated" per proposition; reflect answers "and HOW
// MANY independent sources stand behind it", at the grain the graph actually holds.

import { parseText } from '../../perceiver/parse/index.js';
import { makeDiversity } from '../../core/witness.js';

// Figures are order-insensitive, the relation is not — the same key the provenance
// classifier grounds on: "Ben was trusted by Anna" ↔ "Anna trusted Ben".
const relKey = (p) => `${[p.subj, p.obj || ''].sort().join('~')}|${p.via}`;

const lc = (s) => String(s ?? '').toLowerCase();
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// How many witnesses ride out per claim (display cap — the count is still honest).
const MAX_WITNESSES = 4;
const MAX_QUOTE = 240;

// The EOT surface line for a lowered proposition (docs/eot-surface-syntax.md §3):
//   X : Type            INS/SIG
//   X.field = value     DEF
//   X -> Y : relation   CON
export const eotLineOf = (e, L) => {
  if (e.op === 'INS') return `${L(e.id)} : Entity`;
  if (e.op === 'DEF') return `${L(e.id)}.${e.key} = ${e.value}`;
  if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null) {
    return e.tgt != null ? `${L(e.src)} -> ${L(e.tgt)} : ${e.via}` : `${L(e.src)} : ${e.via}`;
  }
  return null;
};

// The document's witness table: relation key → every event that asserts it, each with
// the sentence that carried it and the door it was constituted through. Prose events
// carry no door → exafference (the text WAS the world read); an EOT note's events are
// the enactor's — the model's own interpretation, which cannot witness.
const witnessTableOf = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, lc(e.label));
  const L = (id) => label.get(id) ?? lc(id);
  const byRel = new Map();
  const attrs = new Set();          // "label|key|value" for the answer's attribute lines
  for (const e of events) {
    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null) {
      const k = relKey({ subj: L(e.src), via: lc(e.via), obj: e.tgt != null ? L(e.tgt) : null });
      const door = e.door ?? e.prov?.door ?? 'perceiver';
      if (!byRel.has(k)) byRel.set(k, []);
      // `locus` (WHERE the event was read — a bbox, a timecode, a cell) rides along so a
      // witness can render the evidence itself, not the pseudo-sentence standing in for it.
      byRel.get(k).push({ sentIdx: Number.isFinite(e.sentIdx) ? e.sentIdx : null, door, locus: e.locus ?? null });
    }
    if (e.op === 'DEF' && e.kind === 'attr' && e.id != null && e.key != null) {
      attrs.add(`${L(e.id)}|${lc(e.key)}|${lc(e.value)}`);
    }
  }
  return { byRel, attrs, figures: new Set(label.values()) };
};

// The SENSE a document was read through — the organ's modality mapped onto the five doors
// of the world (docs/multimodal-eot-foundation.md; the proposal's "doors, plural"). `modality` is
// the organ label (image, audio, table); `sense` is the channel it stands for. Two origins
// through ONE sense (paper twice) corroborate; through TWO senses (paper and tape) is a
// stronger, cross-modal thing — a fact two independent channels of the world both hold.
const SENSE_OF_MODALITY = {
  text: 'text', pdf: 'text', ocr: 'text', docling: 'text', webpage: 'text', warc: 'text', document: 'text',
  image: 'sight', scene: 'sight', video: 'sight',
  audio: 'hearing', acoustic: 'hearing', hear: 'hearing', music: 'hearing', frequency: 'hearing',
  table: 'tabular',
  json: 'structural', code: 'structural', codon: 'structural',
};
export const senseOfModality = (modality) => SENSE_OF_MODALITY[String(modality ?? '').toLowerCase()] || 'text';

// Where a composite sentence came from — the source document + its object, the provenance
// axis the composite keeps per unit. A single document is its own source.
const sourceOf = (doc, idx) => {
  if (typeof doc?.origin === 'function' && Number.isFinite(idx)) {
    const o = doc.origin(idx);
    if (o?.docId != null) return { docId: o.docId, doc: o.doc || doc };
  }
  return { docId: doc?.docId ?? 'doc', doc };
};

// Walk a document to its DERIVATION ROOT: a transcript read from a recording, an OCR from
// a scan, a WARC of a webpage — each declares `derivedFrom`, and the reflection loop counts
// the root, not the copy, so a document and the note taken off it are ONE origin, not two.
// A cycle guard keeps a malformed chain from looping. Missing map → the doc is its own root.
const rootDocId = (doc, docId) => {
  const map = doc?.derivedFrom;
  if (!map || typeof map !== 'object') return docId;
  let cur = docId;
  const seen = new Set();
  while (map[cur] != null && !seen.has(cur)) { seen.add(cur); cur = map[cur]; }
  return cur;
};

// One claim's witnesses, folded to independent ROOT origins and to the SENSES they came
// through: each root document contributes one representative witness (its sentence, plus
// the locus and sense that let the UI render the evidence itself); the DIVERSITY of the
// claim is how many distinct roots witnessed it through the world's door (exafference), and
// how many senses those roots span. Enactor-door witnesses stay visible but never count as
// sources — the engine's notes cannot corroborate the engine.
const witnessesOf = (doc, sentences, hits) => {
  const byRoot = new Map();
  const senses = new Set();
  const spanIdx = new Set();          // distinct exafferent sentIdx — the within-source span count
  let exafferent = 0, reafferent = 0;
  for (const h of hits) {
    if (h.door === 'enactor') { reafferent += 1; continue; }
    exafferent += 1;
    if (h.sentIdx == null) continue;
    spanIdx.add(h.sentIdx);
    const src = sourceOf(doc, h.sentIdx);
    const root = rootDocId(doc, src.docId);
    const rootModality = doc?.modalityByDoc?.[root] ?? src.doc?.modality;
    const sense = senseOfModality(rootModality);
    senses.add(sense);
    if (!byRoot.has(root)) {
      byRoot.set(root, {
        docId: root, sentIdx: h.sentIdx, sense, locus: h.locus ?? null,
        text: squash(sentences[h.sentIdx]).slice(0, MAX_QUOTE),
      });
    }
  }
  return {
    sources: [...byRoot.values()].slice(0, MAX_WITNESSES),
    origins: byRoot.size, spans: spanIdx.size, senses, exafferent, reafferent,
  };
};

// witnessesForProps(doc, props) — the per-PROPOSITION witness reading the streaming source
// gate reads. For each proposition {subj, via, obj} (lowercased labels, as classifyProvenance
// lowers them), look the relation up in the document's OWN witness table and report how many
// DISTINCT SPANS (sentIdx, exafferent only — the engine's own notes never count) and how many
// independent ROOT ORIGINS witness it. `spans` is the within-document ≥2-witness measure — two
// different sentences of one memo corroborate; `origins` is the cross-source measure
// (reflectAnswer's independent roots — a single memo maxes at 1). Reuses witnessTableOf / relKey /
// witnessesOf whole — no new witness logic, just the count exposed before it folds to roots.
// `allow`, when supplied (a Set or array of sentIdx), restricts witnesses to those spans — the
// passages the reader actually retrieved, so a citation always points at a span they can jump to
// and "≥2 witnesses" means two of the shown lines. Omit it to witness against the whole document.
export const witnessesForProps = (doc, props = [], allow = null) => {
  if (!doc || !Array.isArray(props)) return [];
  const table = witnessTableOf(doc);
  const sentences = doc.units || doc.sentences || [];
  const sentLC = sentences.map((s) => lc(s));
  const ok = allow ? (allow instanceof Set ? allow : new Set(allow)) : null;
  return props.map((p) => {
    const subj = lc(p.subj), via = lc(p.via), obj = p.obj != null ? lc(p.obj) : null;
    // MEANING witnesses — a graph relation with the same figures in the same relation (coref-aware,
    // order-insensitive: "Ben was trusted by Anna" witnesses "Anna trusted Ben").
    const raw = table.byRel.get(relKey({ subj, via, obj })) || [];
    const hits = ok ? raw.filter((h) => h.sentIdx != null && ok.has(h.sentIdx)) : raw;
    const graphIdx = hits.filter((h) => h.door !== 'enactor' && h.sentIdx != null).map((h) => h.sentIdx);
    // SURFACE witnesses — a span that literally carries the proposition (the same verbatim test
    // classifyProvenance grounds `verbatim` on). Without this a lifted claim would count zero
    // witnesses even though its words are on the page: the relation extractor keys the graph on
    // "Project Atlas" while the claim says "Atlas", so meaning-matching alone misses the lift.
    const lexIdx = [];
    for (let i = 0; i < sentLC.length; i++) {
      if (ok && !ok.has(i)) continue;
      const s = sentLC[i];
      if (s.includes(subj) && s.includes(via) && (!obj || s.includes(obj))) lexIdx.push(i);
    }
    const spanIdxs = [...new Set([...graphIdx, ...lexIdx])].sort((a, b) => a - b);
    const w = witnessesOf(doc, sentences, hits);
    // The proposition's witness diversity, first-class: the within-source span count the gate
    // reads plus the cross-source origins/senses, minted into the shared currency so `diversity.tier`
    // reads the same rung here as at answer grain (core/witness.js). Voices default to origins — a
    // single document cannot tell mirrors apart; corroboration.js refines that when it has the hosts.
    const diversity = makeDiversity({
      spans: spanIdxs.length, origins: w.origins, senses: w.senses, reafferent: w.reafferent,
    });
    return {
      subj: p.subj, via: p.via, obj: p.obj ?? null,
      spanIdxs, spans: spanIdxs.length, origins: w.origins, senses: w.senses, sources: w.sources,
      diversity,
    };
  });
};

// reflectAnswer({ answer, doc }) → { eot, summary } | null
//   eot      one row per EOT line parsed from the answer, each with its verdict and
//            witnesses: { line, kind, status, sources, origins, subj, via, obj }
//   status   relation:  cross-modal (≥2 roots through ≥2 senses) · corroborated (≥2
//                       independent roots, one sense) · single-source · interpretation
//                       (engine's notes only) · unwitnessed
//            entity:    known (in the graph) · novel
//            attribute: matches · unwitnessed
export const reflectAnswer = ({ answer, doc } = {}) => {
  const text = squash(answer);
  if (!text || !doc) return null;

  const parsed = parseText(text, { docId: 'reflect' });
  const events = parsed.log.snapshot();
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label));
  const L = (id) => label.get(id) ?? String(id);

  const table = witnessTableOf(doc);
  const sentences = doc.units || doc.sentences || [];
  const spanLC = sentences.map((s) => lc(s));

  const eot = [];
  const seenLine = new Set();
  for (const e of events) {
    const line = eotLineOf(e, L);
    if (!line || seenLine.has(line)) continue;

    if ((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null) {
      const subj = lc(L(e.src)), via = lc(e.via), obj = e.tgt != null ? lc(L(e.tgt)) : null;
      const hits = table.byRel.get(relKey({ subj, via, obj })) || [];
      const w = witnessesOf(doc, sentences, hits);
      const verbatim = spanLC.some((s) => s.includes(subj) && s.includes(via) && (!obj || s.includes(obj)));
      // The claim's witness diversity, minted into the first-class currency (core/witness.js). The
      // tier ladder — unwitnessed · interpretation · single-source · corroborated · cross-modal (two
      // roots through two SENSES, the paper and the tape both holding the fact) — is defined once,
      // there, not inlined here. `status` stays the tier for every existing reader; `diversity` is
      // the whole standing, carried on the relation for a consumer that wants more than the label.
      const diversity = makeDiversity({
        spans: w.spans, origins: w.origins, senses: w.senses, reafferent: w.reafferent,
      });
      seenLine.add(line);
      eot.push({ line, kind: 'relation', status: diversity.tier, verbatim, subj, via, obj,
                 sources: w.sources, origins: w.origins, senses: [...w.senses], diversity });
    } else if (e.op === 'DEF' && e.kind === 'attr' && e.id != null && e.key != null) {
      const matches = table.attrs.has(`${lc(L(e.id))}|${lc(e.key)}|${lc(e.value)}`);
      seenLine.add(line);
      eot.push({ line, kind: 'attribute', status: matches ? 'matches' : 'unwitnessed',
                 subj: lc(L(e.id)), via: lc(e.key), obj: lc(e.value), sources: [], origins: 0 });
    } else if (e.op === 'INS' && e.id != null) {
      const known = table.figures.has(lc(e.label));
      seenLine.add(line);
      eot.push({ line, kind: 'entity', status: known ? 'known' : 'novel',
                 subj: lc(e.label), via: null, obj: null, sources: [], origins: 0 });
    }
  }

  const rel = eot.filter((r) => r.kind === 'relation');
  const summary = {
    lines: eot.length,
    relations: rel.length,
    crossModal:     rel.filter((r) => r.status === 'cross-modal').length,
    corroborated:   rel.filter((r) => r.status === 'corroborated').length,
    singleSource:   rel.filter((r) => r.status === 'single-source').length,
    interpretation: rel.filter((r) => r.status === 'interpretation').length,
    unwitnessed:    rel.filter((r) => r.status === 'unwitnessed').length,
    entitiesKnown:  eot.filter((r) => r.kind === 'entity' && r.status === 'known').length,
    entitiesNovel:  eot.filter((r) => r.kind === 'entity' && r.status === 'novel').length,
    // the independent origins the answer's witnessed relations draw on, deduplicated —
    // the "multiple, diverse sources" measure at answer grain
    origins: new Set(rel.flatMap((r) => r.sources.map((s) => s.docId))).size,
  };
  // The answer's OWN witness diversity, first-class: the distinct origins and senses across every
  // witnessed relation, folded into one currency. The single object a UI reads for "how well does
  // this whole answer stand" — its tier is the rung the answer as a whole reaches (core/witness.js).
  summary.diversity = makeDiversity({
    origins: summary.origins,
    senses: [...new Set(rel.flatMap((r) => r.senses || []))],
    reafferent: summary.interpretation,
  });
  return { eot, summary };
};
