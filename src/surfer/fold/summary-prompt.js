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
// The detail tiers, the scope×detail voice table, and the deterministic window fit all
// live in summary-detail.js (how MUCH summary, at what cost); this module keeps the
// discipline (build the ask, clean the output, hold the gate, guarantee the floor).
import {
  SUMMARY_DETAILS, tierOf, summarySystem, SUMMARY_SYSTEMS, CROSS_SYSTEM,
  notesBlock, passagesBlock, fitSummaryAsk,
} from './summary-detail.js';
export { SUMMARY_DETAILS, summarySystem, SUMMARY_SYSTEMS };

// ── the ask ───────────────────────────────────────────────────────────────────────────
// The packet rendered for the model: passages first (the prose it will echo), the note
// groups after (the reading it must respect — turns withheld, see summary-detail.js),
// the ask last with the length stated in sentences, the whole fit to the tier's input
// budget (fitSummaryAsk — the middle spans shed first, the arc's ends kept). Sources
// for the cross scope are rendered per referent.
export const summaryMessages = (packet, { sentences = null, detail = 'standard' } = {}) => {
  const tier = tierOf(detail);
  const n = sentences ?? tier.sentences;
  const scope = packet?.scope || 'full';
  const system = summarySystem(scope, detail, packet);
  const head = scope === 'entity' && packet.entity ? `Figure: ${packet.entity}\n`
    : scope === 'topic' && packet.topic ? `Theme: ${packet.topic}\n`
    : packet.title ? `Title: ${packet.title}\n` : '';
  const ask = detail === 'paragraph'
    ? `Summary (one paragraph, at most ${n} sentences):`
    : `Summary (${n} sentence${n === 1 ? '' : 's'}):`;
  const user = fitSummaryAsk(packet, system, head, ask, tier.inputBudget);
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
// gate it referentially, GROUND it against what was read, and fall back to the telegram
// whenever the model is absent, fails, scaffolds, fabricates, or speaks past the record.
// The result always says which voice shipped and, on a rejection, why — the audit trail
// the bench reads.
//
// TWO firewalls, not one. The referential gate (summaryAdditions) guards REFERENTS: a
// name or number the packet never carried is fabrication, deterministically caught. But
// a small model can write a fluent, plausible summary entirely from its own training
// using ONLY the packet's own vocabulary — no novel referent, so the referential gate
// passes it, yet nothing in it traces to what was actually read (the answer path's VOID
// case). That is the second firewall's job: `ground` (INJECTED, optional — the caller
// wires the enactor grounding stack: groundSpans → groundSummary → supportVerdict) holds
// the referentially-clean draft to the record and reports whether it stands on a source
// or on the void. A summary that grounds to nothing read ships the telegram — the honest
// floor — rather than passing the model's recollection off as a reading of the document.
// The gate guards the names; the ground guards the meaning. Absent an injected `ground`
// the behaviour is exactly as before (referential gate only), so callers opt in.

export const realizeSummary = async (packet, {
  phrase = null, detail = 'standard', sentences = null, maxSentences = null, telegram = null,
  ground = null,
} = {}) => {
  const tier = tierOf(detail);
  const want = sentences ?? tier.sentences;
  // An explicit `sentences` keeps the historical cap (sentences + 1); otherwise the
  // tier's own cap stands — a paragraph is never allowed a second paragraph.
  const cap = maxSentences ?? (sentences != null ? sentences + 1 : tier.maxSentences);
  const floor = typeof telegram === 'function'
    ? telegram(packet)
    : telegramSummary(packet, { maxSentences: cap });
  if (!packet) return { text: '', via: 'telegram', additions: null };
  if (typeof phrase !== 'function') return { text: floor, via: 'telegram', additions: null, detail };
  let raw = '';
  try {
    raw = await phrase(summaryMessages(packet, { sentences: want, detail }), tier.decode);
  } catch { raw = ''; }
  const cleaned = cleanSummary(raw, { maxSentences: cap, maxLen: tier.maxLen });
  if (!cleaned) return { text: floor, via: 'telegram', additions: null, raw, detail };
  const additions = summaryAdditions(cleaned, packetSurface(packet));
  if (additions.names.length || additions.numbers.length) {
    return { text: floor, via: 'telegram-gated', additions, rejected: cleaned, raw, detail };
  }
  // The referential gate passed — no novel name or number. Now the SECOND firewall: does
  // the draft actually stand on what was read? A grounding verdict of 'void' (substantive
  // claims that trace to nothing read) or 'empty' (no checkable claim at all) means the
  // model wrote past the record — ship the honest floor. 'partial'/'sourced' ride. A
  // thrown verdict (parse fault) must never cost a summary, so it degrades to shipping.
  if (typeof ground === 'function') {
    let verdict = null;
    try { verdict = ground(cleaned, packet); } catch { verdict = null; }
    if (verdict && verdict.supported === false && (verdict.kind === 'void' || verdict.kind === 'empty')) {
      return { text: floor, via: 'telegram-ungrounded', additions, rejected: cleaned, raw, detail, ground: verdict };
    }
    if (verdict) return { text: cleaned, via: 'model', additions, raw, detail, ground: verdict };
  }
  return { text: cleaned, via: 'model', additions, raw, detail };
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
  phrase = null, detail = 'standard', sentences = 4, telegram, maxSentences = null, mode = 'sequential',
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
        phrase, detail, sentences: per, maxSentences: per + 1,
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
    raw = await phrase(crossSummaryMessages(referents, { sentences }), tierOf(detail).decode);
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
