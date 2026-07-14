// EO: DEF·SEG·EVA(Field,Lens → Lens, Dissecting,Binding,Tracing) — the summary prompt + referential gate
// fold/summary-prompt.js — the model voice for the summary packet, and the discipline
// that makes a small CPU model safe to hand it to.
//
// The topline's containment gate (weave/topline/contain.js) is the strictest possible:
// every content WORD of the output must already be in the input. Right for a join —
// wrong for a summary, which must be allowed its own connective prose ("describes",
// "recounts", "argues") or it comes out telegraphic. The summary gate relaxes the
// right axis and holds the one that matters: PROSE WORDS ARE FREE, REFERENTS ARE NOT.
// A summary may say anything in its own words, but every proper name and every number
// it uses must already stand in the packet — a novel name or figure is exactly where
// summary fabrication lives (the wrong Armstrong, the invented date). A violation is
// detected deterministically (summaryAdditions) and the caller falls back to the
// telegram, so the model can only ever improve on the floor, never corrupt it.
//
// Prompt design AND output discipline, because on a small model the instruction is
// only half of it (the reflect-prompt lesson): cleanSummary strips the leaked
// scaffolding, caps the sentence count, and rejects degenerate residue.

import { telegramSummary, packetSurface } from './summary.js';

// ── the voices ────────────────────────────────────────────────────────────────────────
// One frame, three scopes. The notes vocabulary ("settles", "holds open", "turns") is
// carried into the ask so the model treats the held-open group as UNSETTLED — the void
// band as a prompt constraint, the same firewall-as-instruction move the reflect
// prompt makes.
const COMMON_RULES =
  ' Use only the people, places, works, dates and numbers that appear in the material.' +
  ' If the notes hold something open, report it as unsettled — never decide it.' +
  ' Plain prose only: no list, no heading, no preamble, and never mention notes,' +
  ' passages, documents-as-documents, or these instructions.';

const DOCUMENT_SYSTEM =
  'You have just read a document. Below are its key passages and the reading notes —' +
  ' what it settles, what it holds open, where it turns. Write the summary a careful' +
  ' reader would give: what the document is about and what actually happens or is' +
  ' claimed in it, concrete and specific.' + COMMON_RULES;

const ENTITY_SYSTEM =
  'You have just read a document, attending to one figure in it. Below are the' +
  ' passages where that figure appears and the reading notes about it. Write what this' +
  ' document says about the figure — who or what it is here, what it does, what is' +
  ' said of it. Only what this material carries.' + COMMON_RULES;

const CROSS_SYSTEM =
  'You have read several sources that discuss related figures. Below, grouped per' +
  ' figure, are passages and reading notes from each source. Write a summary that' +
  ' keeps every figure distinct: attribute each claim to the figure it belongs to,' +
  ' use full names, and never blend two people who happen to share a name.' + COMMON_RULES;

export const SUMMARY_SYSTEMS = Object.freeze({
  full: DOCUMENT_SYSTEM, cursor: DOCUMENT_SYSTEM, topic: DOCUMENT_SYSTEM,
  entity: ENTITY_SYSTEM, cross: CROSS_SYSTEM,
});

// ── the ask ───────────────────────────────────────────────────────────────────────────
// The packet rendered for the model: passages first (the prose it will echo), the three
// note groups after (the reading it must respect), the ask last with the length stated
// in sentences. Sources for the cross scope are rendered per referent.

// The turns group is deliberately NOT fed to the model: "the reading turns around X"
// is the surfer's navigation record, and a small model handed it echoes it back as if
// it were content (the parroted-frame failure the reflect prompt already met). The
// packet still carries turns for the audit; the summary ask reads settled + held-open.
const notesBlock = (groups) => {
  const parts = [];
  const block = (head, lines) => { if (lines && lines.length) parts.push(`${head}\n${lines.map((l) => `- ${l}`).join('\n')}`); };
  block('Settled:', groups?.settled);
  block('Held open (do not settle):', groups?.heldOpen);
  return parts.join('\n');
};

const passagesBlock = (spans) =>
  (spans || []).map((s) => `- ${s.text}`).join('\n');

export const summaryMessages = (packet, { sentences = 3 } = {}) => {
  const scope = packet?.scope || 'full';
  const system = SUMMARY_SYSTEMS[scope] || DOCUMENT_SYSTEM;
  const head = scope === 'entity' && packet.entity ? `Figure: ${packet.entity}\n`
    : scope === 'topic' && packet.topic ? `Theme: ${packet.topic}\n`
    : packet.title ? `Title: ${packet.title}\n` : '';
  const user =
    `${head}Passages:\n${passagesBlock(packet?.spans)}\n\n` +
    `Reading notes:\n${notesBlock(packet?.groups)}\n\n` +
    `Summary (${sentences} sentence${sentences === 1 ? '' : 's'}):`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
};

// The cross-source ask — several referent packets, each block naming its figure and its
// sources, so the attribution the CROSS_SYSTEM demands is right there in the material.
export const crossSummaryMessages = (referents, { sentences = 4 } = {}) => {
  const blocks = (referents || []).map((r) => {
    const srcs = (r.docs || []).map((d) => d.title || d.docId).filter(Boolean).join('; ');
    return `Figure: ${r.referent}${srcs ? ` (sources: ${srcs})` : ''}\n` +
      `Passages:\n${passagesBlock(r.spans)}\n` +
      (notesBlock(r.groups) ? `Notes:\n${notesBlock(r.groups)}\n` : '');
  });
  const user = `${blocks.join('\n')}\nSummary (${sentences} sentences, every figure kept distinct):`;
  return [{ role: 'system', content: CROSS_SYSTEM }, { role: 'user', content: user }];
};

// Decode hint — enough room for the asked sentences, greedy, stop on the blank line a
// small model uses to start a second "paragraph" of drift.
export const SUMMARY_DECODE = Object.freeze({ maxTokens: 220, temperature: 0, stop: ['\n\n'] });

// ── output discipline ────────────────────────────────────────────────────────────────

const INTERJECTION = /^(?:certainly|sure|of course|absolutely|indeed|well|okay|ok|right)\b[\s!,.:;—-]*/i;
const PREAMBLE = /^(?:here(?:'s| is)\b[^:.]*[:.]?|(?:the|this) (?:document|text|passage|article|story|chat|conversation|excerpt|material|source)\b[^,.]*?(?:summariz\w+|describ\w+|is about|discusses|covers|tells)\s*[:,]?|in (?:summary|short)[,.:]?|to summarize[,.:]?|summary\s*[:.-]\s*)\s*/i;
const LIST_LEAD = /^\s*(?:[-*•]|\d+[.)])\s+/;
const META = /\b(?:the (?:reading )?notes|the passages? (?:above|below|given)|as (?:instructed|requested)|based on the (?:material|provided)|the reading turns|stays? in focus)\b|^as read\b/i;

// cleanSummary — enforce the shape the prompt asks for: no scaffolding, no list, at
// most `maxSentences` sentences, prose that ends where a sentence ends. Returns ''
// when nothing survives, so the caller ships the telegram rather than a scaffold.
export const cleanSummary = (raw, { maxSentences = 4, maxLen = 900 } = {}) => {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (let i = 0; i < 2; i++) {
    const s = t.replace(INTERJECTION, '').replace(PREAMBLE, '').replace(LIST_LEAD, '');
    if (s === t) break;
    t = s.trim();
  }
  const q = t.match(/^["“'](.+?)["”']\.?$/);
  if (q) t = q[1].trim();
  // keep at most maxSentences sentences
  const sents = t.match(/[^.!?]+[.!?]+(?:["”'])?/g) || (t ? [t] : []);
  t = sents.slice(0, maxSentences).map((s) => s.trim()).join(' ').trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  // degenerate residue: too short, meta-commentary the prompt forbade, or a dangling
  // function-word truncation — worse than the telegram, so reject.
  if (t.replace(/[^a-z]/gi, '').length < 20) return '';
  if (META.test(t)) return '';
  if (!/[.!?…]$/.test(t) && /\b(?:the|a|an|of|to|and|or|with|for|that|is|are)$/i.test(t)) return '';
  return t;
};

// ── the referential gate ─────────────────────────────────────────────────────────────
// summaryAdditions — the proper names and numbers a summary uses that the packet's
// surface never carried. Empty ⇔ the summary is referentially contained. Deterministic
// and model-free; the caller treats a non-empty result as a fabrication and ships the
// telegram instead. Prose words are deliberately NOT checked — a summary is allowed
// its own words; it is not allowed its own referents.

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const lowerTokens = (text) => (String(text || '').toLowerCase().match(WORD_RE) || [])
  .map((w) => w.replace(/[’]/g, "'").replace(/'s$/, ''));

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const numbersOf = (text) =>
  (String(text || '').match(NUMBER_RE) || []).map((n) => n.replace(/,/g, '').replace(/\.0+$/, ''));

// A proper-name candidate: a run of capitalized tokens. Judged by membership of the
// LOWERCASED form in the surface token set, with one carve-out: a SINGLE capitalized
// token at sentence start is ordinary sentence case ("Ultimately, …"), not a name —
// a multi-token run at sentence start ("Neil Armstrong went…") is still a name.
// Digits stay inside a name token ("X-15", "F8F") so a designation is one token on
// both sides of the comparison, never a dangling "X-" that false-positives the gate.
const NAME_SEQ_RE = /\p{Lu}[\p{L}\p{N}'’-]*(?:\s+\p{Lu}[\p{L}\p{N}'’-]*)*/gu;
const atSentenceStart = (text, at) => {
  const before = text.slice(0, at).trimEnd();
  return before === '' || /[.!?…:]["”']?$/.test(before);
};

// Words that are never proper names even capitalized — determiners, pronouns,
// prepositions, and the discourse adverbs a summary opens clauses with. These are
// free wherever they appear; everything else capitalized mid-run must be in surface.
const SENTENCE_CASE_FREE = new Set((
  'the a an this that these those it he she they we you i his her its their ' +
  'in on at by of to for with from as and or but so then thus ' +
  'ultimately later meanwhile however eventually finally overall throughout ' +
  'although while after before during despite initially first second both there here'
).split(/\s+/));

export const summaryAdditions = (text, surface) => {
  const t0 = String(text || '');
  const allowed = new Set(lowerTokens(surface));
  const names = new Set();
  for (const m of t0.matchAll(NAME_SEQ_RE)) {
    const toks = m[0].split(/\s+/);
    if (toks.length === 1 && atSentenceStart(t0, m.index)) continue;   // sentence case, not a name
    for (const tokRaw of toks) {
      const t = tokRaw.replace(/[’]/g, "'").replace(/'s$/, '').replace(/[^\p{L}\p{N}'-]/gu, '').replace(/^-+|-+$/g, '');
      if (!t) continue;
      const low = t.toLowerCase();
      if (SENTENCE_CASE_FREE.has(low)) continue;
      if (!allowed.has(low)) names.add(t);
    }
  }
  const allowedNums = new Set(numbersOf(surface));
  const numbers = new Set();
  for (const n of numbersOf(text)) if (!allowedNums.has(n)) numbers.add(n);
  return { names: [...names], numbers: [...numbers] };
};

export const referentiallyContained = (text, surface) => {
  const a = summaryAdditions(text, surface);
  return a.names.length === 0 && a.numbers.length === 0;
};

// ── realize — packet → summary, model-optional, floor-guaranteed ─────────────────────
// The whole pipeline in one call: build the ask, decode (INJECTED `phrase` — the
// caller wires model.phrase / speak; fold/ imports no model), discipline the output,
// gate it referentially, and fall back to the telegram whenever the model is absent,
// fails, scaffolds, or fabricates. The result always says which voice shipped and,
// on a gate rejection, what the model tried to add — the audit trail the bench reads.

export const realizeSummary = async (packet, {
  phrase = null, sentences = 3, maxSentences = null, telegram = null,
} = {}) => {
  const floor = typeof telegram === 'function'
    ? telegram(packet)
    : telegramSummary(packet, { maxSentences: maxSentences ?? sentences + 1 });
  if (!packet) return { text: '', via: 'telegram', additions: null };
  if (typeof phrase !== 'function') return { text: floor, via: 'telegram', additions: null };
  let raw = '';
  try {
    raw = await phrase(summaryMessages(packet, { sentences }), SUMMARY_DECODE);
  } catch { raw = ''; }
  const cleaned = cleanSummary(raw, { maxSentences: maxSentences ?? sentences + 1 });
  if (!cleaned) return { text: floor, via: 'telegram', additions: null, raw };
  const additions = summaryAdditions(cleaned, packetSurface(packet));
  if (additions.names.length || additions.numbers.length) {
    return { text: floor, via: 'telegram-gated', additions, rejected: cleaned, raw };
  }
  return { text: cleaned, via: 'model', additions, raw };
};

// The cross-source twin. Two modes, and the difference IS the coref discipline:
//
//   sequential (default) — one decode PER REFERENT, each ask built from that
//     referent's packet alone and each output gated against that packet's OWN
//     surface, then joined. The model never holds two namesakes in one context, so
//     it structurally CANNOT hand Louis the Moon landing: a foreign figure is not
//     in the packet, so the per-referent gate rejects it as a fabrication. The
//     joint failure mode is removed by construction, not by instruction.
//
//   joint — one decode over all referents at once (crossSummaryMessages), gated
//     against the UNION of surfaces. Fluent and cheaper, but the union gate cannot
//     see cross-ATTRIBUTION (every name is licensed somewhere) — that is what
//     summaryAttributionErrors measures. Kept as the bench's hard condition.
export const realizeCrossSummary = async (referents, {
  phrase = null, sentences = 4, telegram, maxSentences = null, mode = 'sequential',
} = {}) => {
  const floor = typeof telegram === 'function' ? telegram(referents) : '';
  if (!referents?.length) return { text: '', via: 'telegram', additions: null };
  if (typeof phrase !== 'function') return { text: floor, via: 'telegram', additions: null };

  if (mode === 'sequential') {
    const parts = [];
    const additions = { names: [], numbers: [] };
    let anyModel = false, anyGated = false;
    const per = Math.max(2, Math.ceil(sentences / referents.length));
    for (const r of referents) {
      const packet = { ...r, scope: 'entity', entity: r.referent };
      const one = await realizeSummary(packet, {
        phrase, sentences: per, maxSentences: per + 1,
        telegram: typeof telegram === 'function' ? () => telegram([r]) : null,
      });
      if (one.text) parts.push(one.text);
      if (one.via === 'model') anyModel = true;
      if (one.via === 'telegram-gated') {
        anyGated = true;
        additions.names.push(...(one.additions?.names || []));
        additions.numbers.push(...(one.additions?.numbers || []));
      }
    }
    const text = parts.join(' ') || floor;
    const via = anyGated ? (anyModel ? 'model+gated' : 'telegram-gated') : (anyModel ? 'model' : 'telegram');
    return { text, via, additions, mode };
  }

  let raw = '';
  try {
    raw = await phrase(crossSummaryMessages(referents, { sentences }), SUMMARY_DECODE);
  } catch { raw = ''; }
  const cleaned = cleanSummary(raw, { maxSentences: maxSentences ?? sentences + 2 });
  if (!cleaned) return { text: floor, via: 'telegram', additions: null, raw, mode };
  const surface = referents.map(packetSurface).join('\n');
  const additions = summaryAdditions(cleaned, surface);
  if (additions.names.length || additions.numbers.length) {
    return { text: floor, via: 'telegram-gated', additions, rejected: cleaned, raw, mode };
  }
  return { text: cleaned, via: 'model', additions, raw, mode };
};
