// EO: SIG·DEF(Entity,Field → Lens, Tending,Making) — a topic names itself after what it holds
// reader/topic-name.js — derive a sidebar title for a topic from its own content.
//
// A fresh topic is born "New topic" — a placeholder, not a name. The moment it holds
// something (a first question asked, a first source filed), the placeholder can be
// replaced by a title DERIVED from that content, the way a chat app titles a thread
// from its opening message. The preference order is deliberate:
//
//   1. the first user question — what the topic is ABOUT, in the reader's own words
//   2. the first source's title — what the topic is READING, when nothing was asked yet
//
// Pure and total: (messages, sources) → string | null. Null means "nothing to name
// from yet" — the caller keeps the placeholder. The caller (app.js topicAutoName)
// owns the policy of WHEN to apply a derived title (never over a manual rename);
// this module only answers WHAT the title would be. Deriving is idempotent — the
// first question / first source doesn't change as a topic grows, so re-deriving on
// every event never makes a title jitter.

export const DEFAULT_TOPIC_TITLE = 'New topic';

// Is this title still the untouched placeholder? Accepts the numbered variants older
// sessions produced ("New topic 8"), so a backfill can rename those too.
export const isDefaultTopicTitle = (title) => /^new topic(\s+\d+)?$/i.test(String(title || '').trim());

// Clip to a sidebar-sized title on a word boundary (never mid-word unless the first
// word alone overflows), with a single ellipsis marking the cut.
const MAX_TITLE = 48;
const clip = (s, max = MAX_TITLE) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > max / 2 ? at : max).replace(/[\s,;:.!?—-]+$/, '')}…`;
};

// The conversational lead-ins a question wears that a title shouldn't: greetings,
// politeness, "can you …" framings. Stripped repeatedly so "hey, please can you
// tell me about X" sheds all three layers, but only while something remains — a
// question that IS just a lead-in ("can you help?") keeps its own words.
const LEAD_INS = [
  /^(?:hey|hi|hello|ok(?:ay)?|so|please|um+|well)[,!.\s]+/i,
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i,
  /^(?:tell|show)\s+(?:me|us)\s+(?:(?:more\s+)?about\s+)?/i,
  /^please\s+/i,
];

// A user question → a title: markdown/quote dressing off, lead-ins off, first line
// only, trailing punctuation dropped, first letter capitalized, clipped.
export const titleFromQuestion = (q) => {
  let t = String(q || '').split(/\n/)[0]
    .replace(/[*_`#>]+/g, ' ')
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < LEAD_INS.length * 2; guard++) {
    const before = t;
    for (const re of LEAD_INS) { const s = t.replace(re, ''); if (s.trim()) t = s.trim(); }
    if (t === before) break;
  }
  t = t.replace(/[?!.,;:\s]+$/, '');
  if (!t) return null;
  return clip(t.charAt(0).toUpperCase() + t.slice(1));
};

// A source title → a topic title: already a name, so just tidy and clip. "Untitled",
// ingest's "Pasted text" fallback, and bare URLs-as-titles are not names — better to
// keep the placeholder and wait for a question.
export const titleFromSource = (title) => {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t || /^(?:untitled|pasted text)$/i.test(t) || /^https?:\/\//i.test(t)) return null;
  return clip(t);
};

// The derivation the app applies: first user question, else first named source, else
// null (keep the placeholder). Messages and sources arrive in topic order, so "first"
// is genuinely the topic's opening move.
export const deriveTopicTitle = ({ messages = [], sources = [] } = {}) => {
  const q = (messages || []).find((m) => m && m.role === 'user' && String(m.text || '').trim());
  const fromQ = q ? titleFromQuestion(q.text) : null;
  if (fromQ) return fromQ;
  for (const s of sources || []) {
    const fromS = s ? titleFromSource(s.title) : null;
    if (fromS) return fromS;
  }
  return null;
};
