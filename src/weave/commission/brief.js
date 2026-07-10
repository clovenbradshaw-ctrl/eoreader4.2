// EO: DEF·SEG(Field → Lens, Dissecting,Binding) — read the ask into a commission brief
// "write me an essay in the style of Montaigne" → a structured intent the creature can act on.
//
// This is the DIFFERENTIATE step in front of the whole capability: peel the ask apart into the
// deliverable (what to make), the exemplar (whose form to borrow), the topic (what it is about),
// and the register (which library to hunt in). It is a heuristic — a decisive first read, not the
// last word — deliberately kept separate so the measured router (turn/meta-route.js: FORM/KIND/
// developDrive) can refine `deliverable`/`longform` later without re-parsing the sentence.
//
// The one thing that lives ONLY here, because it is absent from the whole codebase: the
// "in the style of X" peeler. That clause is the seam between a plain answer and a commission.

const DELIVERABLES = Object.freeze({
  essay: /\b(essays?|essayistic)\b/i,
  story: /\b(short\s+stor(?:y|ies)|stor(?:y|ies)|tales?|fiction|narrativ\w*)\b/i,
  poem: /\b(poems?|poetry|sonnets?|verse|ode|elegy)\b/i,
  letter: /\b(letters?|epistle)\b/i,
  review: /\b(literature\s+review|reviews?|critique)\b/i,
  report: /\b(reports?|white\s*paper|brief(?:ing)?)\b/i,
  treatise: /\b(treatise|meditation|dissertation|monograph)\b/i,
  dialogue: /\b(dialogue|dialog)\b/i,
});

// A produce-verb: the ask is a COMMISSION only when the user asks the creature to MAKE something,
// not merely mention a form ("what is an essay?"). Kept generous; the exemplar clause reinforces it.
const PRODUCE = /\b(write|compose|draft|make|create|produce|pen|author|generate|give\s+me|craft)\b/i;

// The exemplar peelers, tried in order — the capture group is the raw exemplar phrase. Ordered
// most-specific first so "in the style of X's essays" doesn't get eaten by a looser "like".
const EXEMPLAR_PATTERNS = [
  /\bin\s+the\s+style\s+of\s+([^,.;:!?]+)/i,
  /\bin\s+([A-Z][\w.''-]+(?:\s+[A-Z][\w.''-]+){0,3})['']s\s+(?:style|manner|voice|vein)\b/,
  /\b(?:styled?|modell?ed|patterned|fashioned)\s+(?:after|on|upon)\s+([^,.;:!?]+)/i,
  /(?:^|\s)(?:à\s+la|a\s+la)\s+([^,.;:!?]+)/i,   // \b won't fire before the non-ASCII "à"
  /\b(?:channell?ing|emulating|imitating|mimicking|evoking|echoing|after|like)\s+([^,.;:!?]+)/i,
  /\bin\s+the\s+(?:manner|voice|vein|spirit)\s+of\s+([^,.;:!?]+)/i,
];

// Words that trail an exemplar name but are not part of it — trimmed off the capture.
const NAME_TAIL = /\b(the\s+)?(essayist|novelist|poet|philosopher|writer|author|style|manner|voice|but|and|about|on|when|who|which|would|it|please)\b.*$/i;
const LEADING_ART = /^(?:a|an|the)\s+/i;

const cleanName = (raw) => {
  let s = String(raw || '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  s = s.replace(NAME_TAIL, '').replace(LEADING_ART, '').trim();
  s = s.replace(/[\s,;:.]+$/g, '').trim();
  return s;
};

// author vs work: a capitalised multiword phrase in quotes, or containing "of the"/a colon, or all
// Title Case with >2 tokens, leans WORK; a short Capitalised name leans AUTHOR. Best-effort — the
// hunter searches the catalog either way, this only tunes the query.
const kindOfExemplar = (name, rawClause) => {
  if (/["'“”‘’]/.test(rawClause)) return 'work';
  const toks = name.split(/\s+/).filter(Boolean);
  if (toks.length >= 4 && toks.every((t) => /^[A-Z0-9]/.test(t))) return 'work';   // full names run ≤3 tokens
  if (/\bthe\b|\bof\b|:/i.test(name)) return 'work';
  return 'author';
};

const REGISTER = {
  scholarly: /\b(paper|papers|study|studies|research|academic|scholarly|journal|literature\s+review|citation|peer[-\s]?review|arxiv|abstract|methodology)\b/i,
  literary: /\b(essay|story|stories|poem|poetry|prose|tale|letter|memoir|fiction|novel|literary)\b/i,
};

const LONGFORM = /\b(essays?|report|chapter|book|treatise|dissertation|monograph|long|in[-\s]depth|comprehensive|thorough|full[-\s]length|multi[-\s]?part|series|at\s+length)\b/i;

const TOPIC_PATTERNS = [
  /\b(?:about|on\s+the\s+(?:subject|topic)\s+of|concerning|regarding|exploring|examining|on)\s+([^,.;:!?]+)/i,
];

// Strip the deliverable words and the exemplar clause, then look for the "about X" residue.
const readTopic = (text, exemplarClause) => {
  let t = text;
  if (exemplarClause) t = t.replace(exemplarClause, ' ');
  for (const re of TOPIC_PATTERNS) {
    const m = re.exec(t);
    if (m) {
      const topic = cleanTopic(m[1]);
      if (topic) return topic;
    }
  }
  return null;
};
const cleanTopic = (raw) => {
  let s = String(raw || '').trim();     // keep the article — "the ethics of attention" reads as the topic
  s = s.replace(/\bin\s+the\s+style\s+of\b.*$/i, '').trim();
  s = s.replace(/[\s,;:.]+$/g, '').trim();
  return s && s.length <= 120 ? s : (s ? s.slice(0, 120).trim() : null);
};

const firstMatch = (obj, text) => {
  for (const [key, re] of Object.entries(obj)) if (re.test(text)) return key;
  return null;
};

// readCommission(text) → a frozen CommissionBrief.
//   wantsCommission  true when this is a make-me-a-deliverable ask (a produce verb + a deliverable,
//                    or any exemplar clause) — the gate the app checks before drafting a plan.
//   deliverable      'essay' | 'story' | … | null (refinable by meta-route)
//   exemplar         { raw, name, kind:'author'|'work' } | null — whose FORM to borrow
//   topic            string | null — what it is ABOUT (may be open)
//   register         'scholarly' | 'literary' | null — which library to hunt first
//   longform         whether it reads as a multi-response piece
export const readCommission = (text) => {
  const raw = String(text || '');
  const deliverable = firstMatch(DELIVERABLES, raw);

  let exemplar = null, exemplarClause = null;
  for (const re of EXEMPLAR_PATTERNS) {
    const m = re.exec(raw);
    if (m && m[1]) {
      const name = cleanName(m[1]);
      if (name && name.length >= 2 && !/^(you|me|this|that|it)$/i.test(name)) {
        exemplarClause = m[0];
        exemplar = Object.freeze({ raw: m[1].trim(), name, kind: kindOfExemplar(name, m[0]) });
        break;
      }
    }
  }

  const topic = readTopic(raw, exemplarClause);
  const register = firstMatch(REGISTER, raw)
    || (exemplar && deliverable && DELIVERABLES.essay.test(raw) ? 'literary' : null);
  const longform = LONGFORM.test(raw) || deliverable === 'essay' || deliverable === 'report'
    || deliverable === 'treatise' || deliverable === 'review';

  const wantsCommission = !!exemplar || (!!deliverable && PRODUCE.test(raw));

  return Object.freeze({
    raw, wantsCommission, deliverable: deliverable || null,
    exemplar, topic, register: register || null, longform,
    wantsStyle: !!exemplar,
  });
};

// A one-line reading of the brief for the audit / the plan's opening note.
export const describeBrief = (b) => {
  if (!b || !b.wantsCommission) return 'no commission';
  const parts = [`${b.deliverable || 'piece'}`];
  if (b.topic) parts.push(`on "${b.topic}"`);
  if (b.exemplar) parts.push(`in the style of ${b.exemplar.name}`);
  else parts.push('(inspiration to be chosen)');
  return parts.join(' ');
};
