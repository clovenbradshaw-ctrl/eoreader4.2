// EO: SIG·EVA(Network,Entity → Lens, Binding,Tracing) — a figure's perspective (voice + fold)
// perspective.js — the reading as ONE figure holds it.
//
// The three surfaces (surfaces.js) read a document from the OUTSIDE. But when an admitted
// referent is a PERSON or an AGENT, it is not only a thing the reading is about — it is
// itself a READER, a fold with its own lens: it says things, and the things it says name a
// universe of their own, not the same as the document's. A perspective is the document
// re-read from inside that figure's fold. ("When an entity is a person or other agent, we
// keep their perspective — their lens, their quotes, and the universe from their fold.")
//
// A pure fold on (doc, focusIds) — no DOM, no state, no model — reusing the engine's own
// machinery so a figure's fold is read with the SAME reader the document is: the speech-verb
// ledger (SEED_SPEECH, the SIG operator's own classification), entity admission (who spoke),
// the projection (their SIG out-edges), and — for the fold — the full parser turned on their
// quoted words, so their utterances yield figures and claims the way any text does.
//
//   quotes        their direct words, verbatim, each traced to the sentence it sits in
//   attributions  their SIG speech acts in the document graph (whom they told / asked)
//   fold          their OWN universe: the figures their quotes name and the claims their
//                 quotes assert, read by running the parser over their quoted text
//   isAgent       whether the referent BEHAVES like a person/agent — read from the record
//                 (it speaks, it is a speech source, it has a person-key), never a type tag
//                 stamped on it. Gravity, not a list (the entities.js discipline).

import { projectGraph } from '../core/index.js';
import { createConventions } from '../core/conventions/index.js';
import { parseText } from './parse/index.js';
import { foldOfQuotes } from './figure-fold.js';

// The speech-verb predicate, defaulting to the seed the SIG classifier uses. Injected so
// a caller with a live conventions ledger (its seed ∪ what the document taught) can pass
// its own, exactly as parseRelations takes `opts.isSpeech`.
const DEF_C = createConventions();   // sediment priors — the same ledger everyone reads
const defIsSpeech = (w) => DEF_C.isAttributionVerb(w);

// A name span: one or more capitalised words, allowing an internal apostrophe/hyphen and
// a joined title's trailing period ("Mr.", "O'Brien", "Jean-Luc"). Kept deliberately
// simple — resolution to a real referent is admission's job, not this pattern's.
const NAME = String.raw`[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*`;
// A quoted span in straight or curly double quotes, no nested quote inside. Single quotes
// are NOT read as quotation — they are possessives and contractions far more often than
// speech, and reading them would manufacture quotes out of "the city's" and "don't".
const QUOTE_RE = /[“"]([^“”"]{2,})[”"]/g;

// Resolve a matched speaker name to an admitted referent id, tolerating the ways a name
// is written vs. the label admission holds. Tries the whole name, then its trailing token
// (a surname — "Councilmember Reyes" → "Reyes"), then its leading token (a given name).
// Returns the id or null; the caller keeps the surface label regardless, so an unresolved
// speaker still carries a quote (attributed by label), it just cannot be graph-collapsed.
const resolveSpeaker = (name, admission) => {
  if (!admission || !name) return null;
  const clean = String(name).trim().replace(/\s+/g, ' ');
  if (admission.isAdmitted(clean)) return admission.idOf(clean);
  const toks = clean.split(' ');
  if (toks.length > 1) {
    const last = toks[toks.length - 1];
    if (admission.isAdmitted(last)) return admission.idOf(last);
    const first = toks[0];
    if (admission.isAdmitted(first)) return admission.idOf(first);
  }
  return null;
};

// ── The quote scanner ───────────────────────────────────────────────────────────────
// Pure over one sentence. Finds direct-quotation constructions and the speaker beside
// them, in the two canonical forms English writes them:
//
//   speaker-first   Reyes asked, "was surveillance the right word?"
//   quote-first     "this is surveillance," said Reyes.   /   "…," Reyes replied.
//
// Returns [{ quote, speakerLabel, speakerId, form, index }]. `speakerId` is null when the
// name resolves to no admitted referent (the quote still stands, attributed by label).
// The scan is orthographic only — whether a word is a speech verb is the ledger's call
// (isSpeech), the same seam every other classifier in the parse leaf uses.
export const scanQuotes = (sentence, { isSpeech = defIsSpeech, admission = null } = {}) => {
  const s = String(sentence || '');
  const out = [];
  const re = new RegExp(QUOTE_RE.source, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    // A trailing comma sits INSIDE the quote marks before an attribution ("…nothing," said X)
    // by convention, but it is the sentence's grammar, not the quotation's content — strip it.
    // A trailing ? ! or . is the quote's own, and kept.
    const quote = m[1].trim().replace(/,\s*$/, '');
    if (!quote) continue;
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);

    // Speaker-first: "<Name> <speech-verb>[,:]?" immediately before the opening quote.
    let speaker = null, form = null;
    const bm = before.match(new RegExp(String.raw`(${NAME})\s+([a-z]+)\s*[,:]?\s*$`));
    if (bm && isSpeech(bm[2])) { speaker = bm[1]; form = 'speaker-first'; }

    // Quote-first: after the closing quote, either "<speech-verb> <Name>" ("said Reyes")
    // or "<Name> <speech-verb>" ("Reyes replied"). A leading comma/period/dash is stepped
    // over — the punctuation the quote closes with.
    if (!speaker) {
      const tail = after.replace(/^\s*[,.;:—–-]?\s*/, '');
      const vn = tail.match(new RegExp(String.raw`^([a-z]+)\s+(${NAME})`));
      if (vn && isSpeech(vn[1])) { speaker = vn[2]; form = 'quote-first'; }
      if (!speaker) {
        const nv = tail.match(new RegExp(String.raw`^(${NAME})\s+([a-z]+)`));
        if (nv && isSpeech(nv[2])) { speaker = nv[1]; form = 'quote-first'; }
      }
    }

    out.push({
      quote,
      speakerLabel: speaker,
      speakerId: speaker ? resolveSpeaker(speaker, admission) : null,
      form,
      index: m.index,
    });
  }
  return out;
};

// A quote belongs to the focus figure when its resolved speaker id is in the focus set, or
// — when the id did not resolve — when the surface names line up ("Reyes" ⊂ "Councilmember
// Reyes"). Label matching is the unresolved fallback; it never overrides a resolved id.
const quoteBelongs = (q, focusIds, focusLabels, rep) => {
  if (q.speakerId && focusIds.has(rep(q.speakerId))) return true;
  if (!q.speakerLabel) return false;
  const a = q.speakerLabel.toLowerCase();
  for (const lab of focusLabels) {
    const b = String(lab || '').toLowerCase();
    if (!b) continue;
    if (a === b || a.includes(b) || b.includes(a)) return true;
  }
  return false;
};

// The universe from their fold — their quotes re-read as their own document, yielding the
// figures they invoke and the claims they assert. Factored into figure-fold.js so idea-
// transmission can fold a single quote the same way; imported here as the figure's whole voice.

// THE FOLD. A focus referent (one or more coreferent ids) → its perspective: the figure's
// voice (verbatim quotes), its speech acts in the document graph (attributions), the
// universe its own words instantiate (fold), and whether it behaves like an agent at all.
//
// `focusIds` are canonicalised through the projection's representative, so an alias
// ("Councilmember Reyes" / "Reyes") lands on the same figure its edges do. `parse` is
// injected (default parseText) so the module stays testable without a browser.
export const perspectiveOf = (doc, focusIds, { parse = parseText, maxQuotes = 40, isSpeech = defIsSpeech } = {}) => {
  const empty = {
    id: null, label: null, isAgent: false,
    signals: { speaksQuotes: false, speechSource: false, personKey: false },
    quotes: [], attributions: [], fold: { text: '', figures: [], claims: [] },
  };
  if (!doc?.log || !focusIds?.length) return empty;
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const focus = new Set(focusIds.map(rep));
  if (focus.size === 0) return empty;

  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(id)?.label || id;
  const focusLabels = [...focus].map(labelOf);
  const primaryId = [...focus][0];
  const label = labelOf(primaryId);

  // Quotes across the whole document that this figure speaks, in reading order, capped so
  // a hub speaker (a novel's narrator) stays a readable panel rather than a dump.
  const sentences = Array.isArray(doc.sentences) ? doc.sentences : [];
  const quotes = [];
  for (let i = 0; i < sentences.length; i++) {
    for (const q of scanQuotes(sentences[i], { isSpeech, admission: doc.admission })) {
      if (!quoteBelongs(q, focus, focusLabels, rep)) continue;
      quotes.push({ text: q.quote, idx: i, form: q.form });
      if (quotes.length >= maxQuotes) break;
    }
    if (quotes.length >= maxQuotes) break;
  }

  // Their speech acts in the document graph — SIG out-edges whose verb is a speech verb
  // ("Reyes told the council …"): whom they addressed and how, distinct from a plain
  // attribution ("per Reyes", also a SIG but not a speech verb).
  const attributions = [];
  const seenAttr = new Set();
  for (const e of graph.edges) {
    if (e.kind !== 'sig') continue;
    if (!focus.has(rep(e.from))) continue;
    if (!isSpeech(e.via)) continue;
    const tgt = rep(e.to);
    const key = `${e.via}|${tgt}`;
    if (seenAttr.has(key)) continue;
    seenAttr.add(key);
    attributions.push({ id: tgt, label: labelOf(tgt), via: e.via, idx: e.sentIdx ?? null });
  }

  // The person-key: a functional attribute only a person carries (a birth year — the
  // canonical person-key admission harvests, entities.js §7 PER-4), off any focus referent.
  const personKey = [...focus].some((id) => !!graph.entities.get(id)?.props?.bornOn);

  // The universe from their fold — their quotes re-read as their own document.
  const fold = foldOfQuotes(quotes, label, parse);

  // Does it BEHAVE like a person/agent? It speaks (has quotes), it is a speech source in
  // the graph (it told/asked someone), or it carries a person-key. Any one is gravity
  // enough — read from the record, never a type stamped on the node.
  const signals = {
    speaksQuotes: quotes.length > 0,
    speechSource: attributions.length > 0,
    personKey,
  };
  const isAgent = signals.speaksQuotes || signals.speechSource || signals.personKey;

  return { id: primaryId, label, isAgent, signals, quotes, attributions, fold };
};
