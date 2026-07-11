// EO: SEG·SIG·DEF(Field,Network → Field,Lens, Unraveling,Tracing) — skeleton + member retrieval
// Structural retrieval — the document's own skeleton, for the Paradigm terrain.
//
// A PATTERN-GRAIN task on the Paradigm terrain (a `summary` — the whole read as one frame;
// turn/intent.js) whose question is a META-word —
// "summarize", "what is this about", "give me the gist" — makes NO lexical contact with
// the page: the word "summarize" appears nowhere in the document, so lexical retrieval
// fuzzy-matches it onto arbitrary tokens and hands the talker a handful of disconnected
// fragments to invent from. (The audit's t1: a "summary" of a 19k-sentence wiki built
// from "It fails." and "That is intended." — the talker then confabulated a document
// about √2.) Asking the query is the wrong move when the query says nothing about the
// page; the fix is to read the document's STRUCTURE instead:
//
//   · the OPENING — the first usable units, where a document says what it is;
//   · the section HEADINGS — its skeleton;
//   · an even SPREAD across the body — representative content the first two miss.
//
// Scored so the opening leads (it survives selectExcerpts and takes the frame's primacy
// slot) and the spread still clears the relevance floor. Site / furniture units
// (read/site.js) are skipped, exactly as hybrid retrieval skips them — they frame, they
// do not answer. A TARGETED whole-doc question — one naming a term the document actually
// uses ("list the nine operators") — is NOT routed here: queryTouchesDoc keeps it on the
// lexical path, so the audit's strong t6 ("what are the 9 operators?") is untouched.

import { siteIndices, significanceSpine } from '../../perceiver/index.js';
import { projectGraph } from '../../core/index.js';
import { docVocab } from './lexical.js';
import { tok } from '../../perceiver/parse/index.js';

const isHeading = (t) => /^\s*#{1,6}\s+\S/.test(String(t || ''));
const isBlank   = (t) => !String(t || '').trim();

// The question words and whole-document task words a meta-query is made of. A query that
// reduces to these alone says nothing about the page — there is nothing to retrieve ON,
// so the structural skeleton answers it. `tok` already drops the closed-class stopwords
// (the, this, that, is, …); this set adds the open-class words that are nonetheless about
// the ASKING, not about the document's subject.
const META = new Set([
  'what', 'who', 'whom', 'whose', 'which', 'where', 'when', 'why', 'how',
  'summarize', 'summarise', 'summary', 'summaries', 'summarizing', 'summarising',
  'tldr', 'tl', 'dr', 'recap', 'gist', 'overview', 'synopsis', 'abstract',
  'explain', 'elaborate', 'describe', 'tell', 'give', 'show', 'walk',
  'list', 'enumerate', 'outline', 'bullet', 'bullets', 'name', 'every', 'all', 'each',
  'about', 'document', 'doc', 'text', 'file', 'story', 'book', 'passage', 'article',
  'work', 'novel', 'essay', 'paper', 'chapter', 'thing', 'things',
  'main', 'mainly', 'point', 'points', 'key', 'topic', 'topics', 'idea', 'ideas',
  'says', 'say', 'said', 'mean', 'means', 'cover', 'covers', 'covered',
  // SCOPE / COVERAGE words — they say HOW MUCH of the document, never its subject.
  // The audit's t3 ("summarize the full document") rode the lexical path and
  // confabulated because the incidental word "full" was in the doc's vocabulary, so
  // queryTouchesDoc returned true and the structural skeleton — built to answer exactly
  // this meta-query — was skipped. A scope word is about the ASKING, not the page; it
  // only ever changes routing when the query reduces to meta words alone (a real subject
  // term beside it still keeps the lexical path), and only on a whole-document task.
  'full', 'whole', 'entire', 'complete', 'completely', 'rest', 'remainder', 'remaining',
  'everything', 'else', 'more', 'part', 'parts', 'portion', 'section', 'sections',
  'top', 'bottom', 'beginning', 'start', 'end', 'ending', 'middle', 'further',
  'additional', 'content', 'contents', 'detail', 'details',
]);

// Does the question name anything the document actually spells? Tokenize, drop the meta
// words, and test exact membership in the document's vocabulary. False when the query is
// nothing but question / task words — the meta-query the structural skeleton answers.
export const queryTouchesDoc = (doc, query) => {
  const terms = tok(query).filter(t => !META.has(t));
  if (!terms.length) return false;
  const vocab = docVocab(doc);
  return terms.some(t => vocab.has(t));
};

// CONTENT-DEMAND words — a query built of these asks for the page's CONTENT AT LARGE
// ("what's the news today", "anything new", "what's happening", "the latest headlines"),
// naming no specific subject. Like META they are about the ASKING, not the document's
// topic — a recency/coverage demand, not a term to retrieve ON. Kept SEPARATE from META
// so `queryTouchesDoc` and the early Pattern-grain structural gate are byte-identical;
// this set only widens what `querySubjectTerms` treats as non-subject. The failure it
// answers: "whats the news today?" over an NPR page retrieved the site title and a bare
// "news" nav label (the only lexical contact) and the talker, shown a stray word, said it
// found no news — while the page's actual stories were never read.
const CONTENT_DEMAND = new Set([
  'news', 'headline', 'headlines', 'latest', 'recent', 'recently',
  'update', 'updates', 'updated', 'current', 'currently',
  'today', 'todays', 'tonight', 'happening', 'happened', 'happen', 'happens',
  'new', 'newest', 'now', 'going', 'on', 'anything', 'something', 'here',
  'whats', 'up', 'stories',
]);

// The query's SUBJECT terms — the tokens that name what it is ABOUT, once the asking/scope
// (META) and content-demand words are removed. A query that reduces to NONE of these named
// no subject: it wants the document's content at large, and the structural skeleton — not a
// stray token that happened to match — is what answers it. Doc-independent (surface tokens
// only); the caller decides what to do with them. Byte-identical to `tok` minus the two sets.
export const querySubjectTerms = (query) =>
  tok(query).filter((t) => !META.has(t) && !CONTENT_DEMAND.has(t));

export const retrieveStructural = (doc, k = 12) => {
  const units = doc.units || doc.sentences || [];
  if (!units.length) return [];
  const sites = siteIndices(doc);
  const usable = (i) => !sites.has(i) && !isBlank(units[i]);

  const picked = new Map();   // idx → score (keep the strongest reason an index was picked)
  const note = (i, score) => { if (usable(i) && (picked.get(i) ?? 0) < score) picked.set(i, score); };

  // The opening — where a document states what it is. The first few usable units, the
  // strongest material for a summary, scored to lead.
  let opened = 0;
  for (let i = 0; i < units.length && opened < 4; i++) {
    if (!usable(i)) continue;
    note(i, 0.9 - opened * 0.05);
    opened++;
  }

  // The section headings — the document's skeleton.
  for (let i = 0; i < units.length; i++) {
    if (isHeading(units[i])) note(i, 0.7);
  }

  // The body — representative content the opening and headings miss. Two complementary
  // sources, so a summary gets both COVERAGE and SIGNIFICANCE:
  //   · an even SPREAD (0.5) guarantees representative coverage end-to-end — never let a
  //     region of a long document go wholly unseen;
  //   · the document's TURNING POINTS (0.55, ranked above the spread) — the cursors of
  //     highest Bayesian surprise read at document scale (perceiver/spine.js), where the
  //     reading was rewritten. (surfing-next.md §1: the audit's thin summary was an even
  //     stride of arbitrary lines; the spine adds the lines a summary is actually built
  //     from, and ranks them ahead of the generic stride so they survive the k cap.)
  // The spine degrades to nothing on a document with no measured surprise; the spread
  // alone then behaves exactly as before — a strict superset of the old behaviour.
  const stride = Math.max(1, Math.floor(units.length / k));
  for (let i = 0; i < units.length; i += stride) note(i, 0.5);
  const spine = significanceSpine(doc, { k });
  for (const idx of spine.peaks) note(idx, 0.55);

  return [...picked.entries()]
    .map(([idx, score]) => ({ idx, score, text: units[idx], kind: 'structural', via: 'structural' }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
};

// Network retrieval — the document's MEMBERS, for a LIST task.
//
// Both `summary` and `list` are Pattern-grain whole-document tasks, but they land on
// DIFFERENT terrains (turn/intent.js, core/cube.js): summary on the **Paradigm**
// (Interpretation × Pattern — the whole read as one frame), list on the **Network**
// (Structure × Pattern — the set of members and their bonds). Reading both as the same
// even stride answers a "list the characters" with arbitrary lines that happen to fall on
// the stride. The Network reading instead returns the units that INTRODUCE the document's
// distinct figures — the nodes of the entity graph (core/project.js) — ranked by how
// central each figure is (its sightings, the most-named members first), framed by the
// opening so the list still says what it is OF. Degrades to the structural skeleton when
// the graph carries no figures (a doc with no entities), so a list is never empty.
export const retrieveNetwork = (doc, k = 12) => {
  const units = doc.units || doc.sentences || [];
  if (!units.length) return [];
  if (!doc.log) return retrieveStructural(doc, k);      // no log to fold → fall back to the skeleton
  const sites = siteIndices(doc);
  const usable = (i) => Number.isFinite(i) && i >= 0 && i < units.length && !sites.has(i) && !isBlank(units[i]);

  // The figures, folded from the log. A merged entity carries `firstSeen` (the seq of its
  // introducing INS) and `sightings` (its centrality), but not the sentence index — recover
  // that from the event at that seq (seq is the event's position in the append-only log).
  // One entry per INTRODUCING unit: the most-sighted figure that lands there (a unit may
  // name several; keep the strongest reason to pick it).
  const events = doc.log.events || doc.log.snapshot?.() || [];
  const sentOfSeq = (seq) => (Number.isInteger(seq) ? events[seq]?.sentIdx : undefined);
  const { entities } = projectGraph(doc.log);
  const byUnit = new Map();   // idx → sightings of the strongest figure introduced there
  for (const ent of entities.values()) {
    const i = ent.sentIdx ?? sentOfSeq(ent.firstSeen);
    if (!usable(i)) continue;
    const s = ent.sightings || 1;
    if ((byUnit.get(i) ?? 0) < s) byUnit.set(i, s);
  }
  if (!byUnit.size) return retrieveStructural(doc, k);   // no figures → the skeleton answers

  const maxS = Math.max(...byUnit.values());
  const picked = new Map();
  const note = (i, s) => { if (usable(i) && (picked.get(i) ?? 0) < s) picked.set(i, s); };
  // the opening frames the list (what it is OF), scored to lead like the structural opening
  for (let i = 0, opened = 0; i < units.length && opened < 1; i++) if (usable(i)) { note(i, 0.9); opened++; }
  // each member-introducing unit, ranked by the figure's centrality (normalised sightings)
  for (const [i, s] of byUnit) note(i, 0.5 + 0.35 * (s / maxS));

  return [...picked.entries()]
    .map(([idx, score]) => ({ idx, score, text: units[idx], kind: 'network', via: 'network' }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
};
