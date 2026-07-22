// EO: SIG·NUL(Network,Field → Lens,Void, Binding,Clearing) — 3 reading surfaces + note render
// The three levels of reading — three surfaces a mechanical "consciousness"
// queries behind the scenes, each able to ground the talker (the model).
//
// They are the three domains of the EO cube read top to bottom:
//
//   Level 1 — raw existence       the verbatim text (Existence)
//   Level 2 — extracted structure the SEG / CON / SIG / SYN graph (Structure)
//   Level 3 — significance        predict-what's-next, be surprised (Interpretation)
//
// The consciousness folds all three into the note the talker reads beside the
// verbatim spans. Nothing here calls a model; the reading is mechanical.

import { readingAt } from './reading.js';
import { typeOf } from '../core/index.js';
import { projectGraph } from '../core/index.js';
import { tok } from './parse/index.js';

// A focus referent's neighbourhood is bounded so a hub figure (the protagonist,
// hundreds of bonds) stays a readable graph rather than a dump — the strongest
// bonds by salience, the rest left off. The notes register caps tighter still (8).
const FOCUS_MAX_BONDS = 60;

// Level 1 — raw existence. The spans as they are, in source order.
export const existenceSurface = (_doc, spans) =>
  spans.slice().sort((a, b) => a.idx - b.idx).map(s => ({ idx: s.idx, text: s.text }));

// Level 2 — extracted structure. The figures the window turns on and the
// bonds / merges / resplits among them, each traced to the line it came from.
export const structureSurface = (doc, idxs) => {
  const window = new Set(idxs);
  const events = snapshot(doc);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && !label.has(e.id)) label.set(e.id, e.label);
  const name = (id) => ({ id, label: label.get(id) || id, figure: label.has(id) });   // figure: INS-witnessed endpoint

  const figures = new Map();
  const relations = [];
  const merges = [];
  const splits = [];
  for (const e of events) {
    if (!window.has(e.sentIdx)) continue;
    switch (e.op) {
      case 'INS': figures.set(e.id, (figures.get(e.id) || 0) + 1); break;
      case 'CON':
      // The relation carries both the surface verb (`via`, what the talker reads
      // as the arrow label) and its primitive `type` when the typing bridge knows
      // the noun (sister → sibling, captain → leads) — null when it doesn't. The
      // type is the projection the relation algebra reasons over; the surface
      // string stays untouched for the notes register.
      case 'SIG': relations.push({ op: e.op, src: name(e.src), tgt: name(e.tgt), via: e.via, type: typeOf(e.via)?.type || null, srcKind: e.srcKind || null, tgtKind: e.tgtKind || null, coupling: e.w ?? null, confidence: e.confidence ?? null, polarity: e.polarity || '+', modality: e.modality || 'realis', idx: e.sentIdx }); break;
      case 'SYN': if (e.kind === 'merge') merges.push({ from: name(e.from), to: name(e.to), idx: e.sentIdx }); break;
      case 'SEG': if (e.kind === 'retract') splits.push({ refSeq: e.refSeq, idx: e.sentIdx }); break;
    }
  }
  const defs = [];
  for (const e of events) {
    if (window.has(e.sentIdx) && e.op === 'DEF' && e.key === 'predicate') {
      defs.push({ ...name(e.id), value: e.value, idx: e.sentIdx,
        confidence: e.confidence, polarity: e.polarity || '+', modality: e.modality || 'realis' });
    }
  }
  const rankedFigures = [...figures.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ ...name(id), count }));

  return { figures: rankedFigures, relations, defs, merges, splits };
};

// The named referents a message activates — the figures it explicitly calls by
// name. The message "Grete" NAMES the Grete referent; that referent is the centre
// the reading should turn on, not whatever window the retrieval+surf happened to
// drift across. A referent is nothing but an identity here — the projection's
// representative root, an opaque id the union-find collapses every surface form
// onto ("Gregor"/"Samsa"/"Mr Samsa" → one id, "his sister"/"Gregor's sister" →
// Grete's id). The display name is layered on top (admission.labelOf), never the
// identity itself. Matching is against the ADMITTED figures only — never an
// arbitrary noun — so a sentence cannot fuzz its way onto a figure it never named.
const bare = (t) => t.replace(/['’]s$/, '');       // a possessive names its owner: "Raskolnikov's" → Raskolnikov
export const namedReferents = (doc, question) => {
  if (!doc?.admission?.admitted || !doc.log) return [];
  const qset = new Set(tok(question).map(bare));
  if (qset.size === 0) return [];
  const rep = projectGraph(doc.log).representative || ((id) => id);
  const ids = new Set();
  for (const [label, id] of doc.admission.admitted) {
    const lt = tok(label).map(bare);             // a label matches only if every
    if (lt.length && lt.every((t) => qset.has(t))) ids.add(rep(id));  // word is named
  }
  return [...ids];
};

// Level 2, CENTRED ON A REFERENT. structureSurface reads the figures a *window*
// turns on; this reads the figures a NAMED referent turns on — its incident bonds
// across the whole projection, coreference collapsed, strongest first. When the
// message says "Grete", the structured reading is everything tied to the Grete
// referent (including the bonds it wears under another surface form, "Gregor's
// sister"), not whatever the retrieval window wandered into. The identity is the
// projection root (`rep`); the display name is resolved separately and canonically
// (admission.labelOf first — the naming authority — then the merged entity label,
// then the bare id). Same shape as structureSurface, so the notes serializer and
// the holon tree consume it unchanged. Ranked by the projection's own edge
// salience (endpoint mass × coupling); the neighbourhood is bounded so a hub
// referent stays a readable graph, never a dump.
export const figureSurface = (doc, focusIds, { max = FOCUS_MAX_BONDS } = {}) => {
  const empty = { figures: [], relations: [], defs: [], merges: [], splits: [] };
  if (!doc?.log || !focusIds?.length) return empty;
  const graph = projectGraph(doc.log);            // whole-document view: no γ-fade
  const rep   = graph.representative || ((id) => id);
  const focus = new Set(focusIds.map(rep));
  if (focus.size === 0) return empty;

  const labelOf = (id) =>
    doc.admission?.labelOf?.(id) || graph.entities.get(id)?.label || id;
  const name = (id) => ({ id: rep(id), label: labelOf(rep(id)) });

  // Incident bonds, coref-collapsed and deduped to the strongest witness of each
  // (src, via, tgt). A self-loop on the merged referent is dropped.
  const best = new Map();
  for (const e of graph.edges) {
    const f = rep(e.from), t = rep(e.to);
    if (f === t) continue;
    if (!focus.has(f) && !focus.has(t)) continue;
    const key  = `${f}|${e.via}|${t}`;
    const prev = best.get(key);
    if (!prev || (e.weight || 0) > (prev.weight || 0)) best.set(key, e);
  }
  const ranked = [...best.values()]
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, max);
  const relations = ranked.map((e) => ({
    op:  e.kind === 'sig' ? 'SIG' : 'CON',
    src: name(e.from), tgt: name(e.to),
    via: e.via, type: typeOf(e.via)?.type || null,
    polarity: e.polarity || '+', modality: e.modality || 'realis', idx: e.sentIdx,
  }));

  // Figures: the focus referents first (the centre), then the neighbours they bond
  // to, in salience order (the relations are already ranked). Counts are the merged
  // sighting totals, so the ×N badge reflects real prominence, not window hits.
  const order = [];
  const place = (id) => { if (!order.includes(id)) order.push(id); };
  for (const id of focus) place(id);
  for (const r of relations) { place(r.src.id); place(r.tgt.id); }
  const figures = order.map((id) => ({
    id, label: labelOf(id), count: graph.entities.get(id)?.sightings || 0,
  }));

  // Standing properties (DEF predicates) of the focus referents only. Each def
  // carries the provenance signals the record already stamped on the event — the
  // construction `confidence`, the `polarity`, the `modality`, and the witnessing
  // sentence `idx` — so a consumer can rank and trace them (§ rankProperties) rather
  // than reading them in the raw order the log happened to append.
  const defs = [];
  for (const e of snapshot(doc)) {
    if (e.op === 'DEF' && e.key === 'predicate' && focus.has(rep(e.id))) {
      defs.push({ id: rep(e.id), label: labelOf(rep(e.id)), value: e.value, idx: e.sentIdx,
        confidence: e.confidence, polarity: e.polarity || '+', modality: e.modality || 'realis' });
    }
  }
  return { figures, relations, defs, merges: [], splits: [] };
};

// Generic single-word predicates that make a WEAK standing property on their own.
// A copular tail like "still alive" is three of these strung together — grammatical,
// but it identifies nothing about the referent the way "a 2001 documentary film" does.
// They are demoted, never dropped (total capture, §1): a property that is ALL generic
// words simply ranks below one that carries a specific noun, a date, or a proper name.
const GENERIC_PREDICATE = new Set([
  'alive', 'dead', 'still', 'here', 'there', 'gone', 'back', 'real', 'true', 'false',
  'one', 'same', 'other', 'such', 'so', 'own', 'able', 'sure', 'done', 'known',
  'big', 'small', 'good', 'bad', 'new', 'old', 'young', 'many', 'more', 'less',
  'a', 'an', 'the', 'his', 'her', 'its', 'their', 'this', 'that', 'these', 'those',
]);

const normProperty = (v) => String(v || '')
  .toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

// Rank the standing properties of a referent — the fix for "the #1 property of Elvis is
// 'still alive'". The raw defs arrive in log-append order, so whichever DEF the parser
// emitted first leads, however generic. This scores each DISTINCT property on signals the
// record already carries, so what stands is what the record most strongly and specifically
// witnesses, and folds the duplicate witnesses of one property into a provenance trail:
//
//   · corroboration — a property witnessed across several passages stands more than a
//     one-off; distinct witnessing sentences fold into one row (log2 growth, so the tenth
//     witness adds less than the second);
//   · confidence    — the construction grade the parser stamped (a main clause / copula
//     reads high, a nominalized or coordinated tail low);
//   · specificity   — a bare generic word ("alive") identifies little; a specific noun, a
//     number/date, or a longer phrase identifies the referent — the lever that sinks
//     "still alive" beneath "a 75-minute 2001 documentary film";
//   · modality/polarity — an irrealis, hedged, or negated predicate is less STANDING than
//     a plain realis assertion.
//
// Nothing is discarded (a value that normalises to empty is the only drop); the weak
// properties fall to the bottom, they do not vanish. Returns the same {id,label,value,idx}
// each consumer already reads, plus `witnesses` (every sentence idx that asserts it),
// `count`, `score`, and the carried `confidence/polarity/modality`.
export const rankProperties = (defs = []) => {
  const byNorm = new Map();
  for (const d of (defs || [])) {
    const value = String(d?.value || '').trim();
    const norm = normProperty(value);
    if (!norm) continue;
    let g = byNorm.get(norm);
    if (!g) { g = { value, norm, idxs: new Set(), conf: 0, polarity: '+', modality: 'realis', id: d.id, label: d.label }; byNorm.set(norm, g); }
    if (d.idx != null) g.idxs.add(d.idx);
    const c = Number.isFinite(d.confidence) ? d.confidence : 0.5;
    if (c > g.conf) { g.conf = c; g.value = value; }   // the highest-confidence surface form leads the row
    if (d.polarity === '−') g.polarity = '−';
    if (d.modality && d.modality !== 'realis') g.modality = d.modality;
  }
  const scored = [...byNorm.values()].map((g) => {
    const witnesses = [...g.idxs].sort((a, b) => a - b);
    const corroboration = witnesses.length || 1;
    const words = g.norm.split(' ').filter(Boolean);
    let specificity = 1;
    if (words.length <= 1) specificity *= 0.5;
    if (words.every((w) => GENERIC_PREDICATE.has(w))) specificity *= 0.35;   // "still alive", "the same"
    if (/\d/.test(g.value)) specificity *= 1.3;                              // a date / measure is specific
    if (words.length >= 4) specificity *= 1.15;                              // a fuller phrase identifies more
    specificity = Math.max(0.15, Math.min(specificity, 1.5));
    const modFactor = g.modality === 'realis' ? 1 : 0.75;
    const polFactor = g.polarity === '+' ? 1 : 0.85;
    const corrobFactor = 1 + Math.log2(corroboration);
    const conf = Number.isFinite(g.conf) && g.conf > 0 ? g.conf : 0.5;
    const score = conf * specificity * modFactor * polFactor * corrobFactor;
    return {
      id: g.id, label: g.label, value: g.value,
      idx: witnesses[0] ?? null, witnesses, count: corroboration,
      confidence: Math.round(conf * 1000) / 1000, polarity: g.polarity, modality: g.modality,
      score: Math.round(score * 1000) / 1000,
    };
  });
  scored.sort((a, b) => (b.score - a.score) || (b.count - a.count) || a.value.localeCompare(b.value));
  return scored;
};

// Level 3 — significance. Prediction + surprise at the reading cursor.
export const significanceSurface = (doc, cursor) => readingAt(doc, cursor);

// The consciousness. Query all three surfaces and fold them into a single
// reading the talker can use. The reading the talker reads is the ARROWS — the
// structured reading — never the count headline and never the machinery. The
// source indices live on `sources` (the machine-readable channel the binder
// re-cites against), never inside the text: the talker never sees s348.
export const consciousness = (doc, spans, cursor = null, focus = []) => {
  const existence = existenceSurface(doc, spans);
  const idxs = existence.map(s => s.idx);
  // When the message NAMES a referent, the structured reading turns on THAT
  // referent — everything tied to it, coreference collapsed — not just the figures
  // the retrieval window drifted across (the window can surf off into a neighbour's
  // surprise peak, flooding the notes with someone else's bonds). Fall back to the
  // window structure when the message named no figure, or the named one carries no
  // bonds, so a non-name query reads exactly as before.
  const windowStruct = structureSurface(doc, idxs);
  const focusStruct  = focus?.length ? figureSurface(doc, focus) : null;
  const structure = (focusStruct && focusStruct.relations.length) ? focusStruct : windowStruct;
  const significance = cursor == null ? null : significanceSurface(doc, cursor);
  const text = composeNote(structure, significance);
  return { text, sources: idxs, levels: { existence, structure, significance } };
};

// The notes register — the arrow serializer over the folded graph. The talker
// reads a serialized graph in plain language and speaks prose; the mechanics
// stay grounder-side. So each note is an arrow with a PLAIN-LANGUAGE relation
// label (tends, holds-with, originated-in, slammed) — never an operator code,
// never a cell name, never a sentence index, never a citation token, never a
// referent id. The graph's specific relation (the verb on the edge) overrides
// any generic; a relation with no verb falls back to the generic `linked-to`.
// This is the document-notes slot of the prompt, AND the same register the
// edge-grounding veto checks the talker's sentences against — one object, two
// directions.
// The notes are EOT now (docs/eot-surface-syntax.md), not flat arrows: a relation is a
// LINK (A -> B : rel), a property an IS-A (A : value). The flat-arrow notation was retired
// here because a model reads such an arrow as a CAUSAL claim even when the edge is mere adjacency
// (the post-hoc fallacy, docs/subjective-frame.md §2); the EOT triple carries the same
// relation without that pull. Polarity stays a CONSCIENCE token — a negated bond reaches
// even a tiny talker as `not-rel`, never the bare positive. Delegates to serializeEOT so
// the note surface and the model-fed graph are byte-for-byte one renderer.
export const serializeNotes = (structure, { max = 8 } = {}) => serializeEOT(structure, { max });

// The EOT register — the same folded graph, serialized in EOT surface syntax
// (docs/eot-surface-syntax.md) instead of plain arrows. The model already emits these three
// shapes fluently, so the notes read as canonical EO triples:
//   LINK  (CON)      SUBJECT -> OBJECT : relation
//   IS-A  (DEF/INS)  SIGN : value/type
// Polarity rides as the spec's negation token on the relation (`not-rel`), never dropped. Same
// surface discipline as serializeNotes — labels only, never an id/code/index (the membrane scrub
// in turn/stages.js still runs over the output).
export const serializeEOT = (structure, { max = 24 } = {}) => {
  const lines = [];
  const seen = new Set();
  for (const r of (structure?.relations || [])) {
    const rel = plainRel(r.via);
    const neg = r.polarity === '−' ? 'not-' : '';
    const key = `${r.src.id}|${neg}${rel}|${r.tgt.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${r.src.label} -> ${r.tgt.label} : ${neg}${rel}`);   // LINK → CON
    if (lines.length >= max) return lines;
  }
  for (const d of (structure?.defs || [])) {
    const key = `def|${d.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${d.label} : ${d.value}`);                            // IS-A → DEF/INS
    if (lines.length >= max) return lines;
  }
  return lines;
};

// A relation label the talker may read: the edge's own verb, plain, hyphenated
// so it reads as one arrow label ("originated in" → "originated-in"). Never a
// code; the generic stands only when the graph carried no verb.
export const plainRel = (via) => {
  const v = String(via || '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, '-');
  return v || 'linked-to';
};

// The three group headers (docs/spec rich-notes §1). The "(do not settle these)"
// rider is the plain-language carrier of the void band — the talker reads the
// instruction the void produced, never the word "void". Exported so the membrane
// (fold/project.js) and the leak guard share one source of truth for the literals.
export const NOTE_GROUPS = Object.freeze({
  settled:  'What the document settles:',
  heldOpen: 'What the document holds open (do not settle these):',
  turns:    'Where the reading turns:',
});

// The grouped serializer (rich-notes §1, P0). Renders the Significance triad made
// legible — three plain groups, each a list of already-rendered plain-language lines
// (the membrane in fold/project.js produces the lines; this only formats). An empty
// group is omitted entirely, so a document with nothing held open and no turn reads
// as the settled group alone — today's flat arrows under one header. No operator code,
// no cell name, no index, no citation token, no referent id crosses here: the inputs
// are already surface (the membrane stripped the graph), and this only joins them.
export const composeGroupedNote = ({ settled = [], heldOpen = [], turns = [] } = {}, { max = 1200 } = {}) => {
  const block = (header, lines) => (lines && lines.length) ? `${header}\n${lines.join('\n')}` : '';
  const parts = [
    block(NOTE_GROUPS.settled,  settled),
    block(NOTE_GROUPS.heldOpen, heldOpen),
    block(NOTE_GROUPS.turns,    turns),
  ].filter(Boolean);
  if (parts.length === 0) return '';
  let text = parts.join('\n');
  if (text.length > max) text = text.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return text;
};

// Replace the count headline with the arrows (the structured reading), and keep
// the significance summary when the cursor genuinely moved — plain prose, no
// machinery. The indices that used to ride in `[sN]` tags are gone from the
// talker's view by design (§3); they remain on `sources`.
const composeNote = (structure, significance) => {
  const lines = serializeNotes(structure, { max: 8 });

  if (significance && significance.surprise >= 0.2 && significance.summary) {
    lines.push(significance.summary);
  }

  if (lines.length === 0) return '';
  let text = lines.join('\n');
  if (text.length > 760) text = text.slice(0, 760).replace(/\s+\S*$/, '') + '…';
  return text;
};

const snapshot = (doc) =>
  typeof doc.log.snapshot === 'function' ? doc.log.snapshot() : (doc.log.events || []);
