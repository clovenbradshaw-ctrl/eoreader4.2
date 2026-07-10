// EO: DEF(Entity → Lens, Dissecting) — front-matter / metadata answerer
// The metadata answerer (docs/subjective-frame.md §3). A question about the document's
// own front matter — "who wrote this?", "when was it written?", "what's the title?" — is
// answered from doc.metadata as a DISTINCT FACT, mechanically, never warming the talker.
//
// This is the other half of restoring the recognition guard: the front matter no longer
// rides the content prompt (it would invite a talker to narrate a famous book from
// memory — model/prompt.js §3), but it stays ANSWERABLE. Title and author are facts the
// document carries about itself; a question that asks for one gets it, and a content
// question never sees it.
//
// Returns { route: 'metadata', text, sources } or null. Null when the question is not a
// front-matter question, OR when it is but the document carries no such fact — then the
// turn falls through to the ordinary path, where the subjective frame's absence clause
// ("I did not find that") is the honest answer.

// Intent groups: a matcher over the question and the ordered metadata keys it asks for
// (first present key wins), with a renderer that speaks the fact in plain prose. The keys
// mirror model/prompt.js's META_LABEL vocabulary, so any harvested front-matter key is
// reachable. Order matters — TITLE is read before the bare "what is this" so a pointed
// title question is not swallowed by the summary route upstream (it never reaches here
// anyway; the route tries this answerer before the talker).
const INTENTS = [
  {
    // Authorship — "who wrote this", "who is the author", "who composed it".
    re: /\bwho(?:'s|\s+is|\s+was)?\s+(?:the\s+)?(?:author|writer|wrote|composed|composer|directed|director|artist|creator|made|created|produced|producer|translat\w*|edit\w*)\b|\bwho\s+(?:wrote|authored|composed|directed|made|created|produced|translated|edited)\b/i,
    keys: ['author', 'composer', 'director', 'artist', 'creator', 'producer', 'translator', 'editor'],
    render: (label, value) => `It was ${VERB[label] || 'by'} ${value}.`,
  },
  {
    // When — "when was this written / published / composed / released".
    re: /\bwhen\s+(?:was|were|is)\b|\bwhat(?:'s|\s+is)?\s+(?:the\s+)?(?:date|year)\b/i,
    keys: ['date', 'updated'],
    render: (_label, value) => `It is dated ${value}.`,
  },
  {
    // Title — "what's the title", "what is it called", "what's its name".
    re: /\bwhat(?:'s|\s+is)?\s+(?:the\s+|its\s+)?(?:title|name)\b|\bwhat\s+(?:is\s+)?(?:this|it)\s+called\b/i,
    keys: ['title', 'subtitle'],
    render: (_label, value) => `It is titled “${value}”.`,
  },
  {
    re: /\bwho\s+published\b|\bwhat(?:'s|\s+is)?\s+(?:the\s+)?publisher\b/i,
    keys: ['publisher'],
    render: (_label, value) => `It was published by ${value}.`,
  },
  {
    re: /\bwhat\s+language\b/i,
    keys: ['language'],
    render: (_label, value) => `It is in ${value}.`,
  },
];

// The verb a role takes in "It was ___ X." — authored / composed / directed.
const VERB = {
  author: 'written by', composer: 'composed by', director: 'directed by',
  artist: 'by', creator: 'created by', producer: 'produced by',
  translator: 'translated by', editor: 'edited by',
};

// The first present value for any of `keys`, across a single doc or a composite (each
// member carries its own front matter — organs/in/composite.js). Returns { key, value }
// or null. A composite reports the first member that names the key, labelled by its docId
// so two works are never silently merged.
const metaValue = (doc, keys) => {
  const pick = (meta) => {
    for (const k of keys) {
      const v = meta?.[k];
      if (v != null && String(v).trim()) return { key: k, value: String(v).trim() };
    }
    return null;
  };
  const direct = pick(doc?.metadata);
  if (direct) return direct;
  if (Array.isArray(doc?.metadataByDoc)) {
    for (const { docId, metadata } of doc.metadataByDoc) {
      const hit = pick(metadata);
      if (hit) return { ...hit, docId };
    }
  }
  return null;
};

export const answerMetadata = (doc, question) => {
  if (!doc) return null;
  const q = String(question || '').trim();
  if (!q) return null;
  for (const intent of INTENTS) {
    if (!intent.re.test(q)) continue;
    const hit = metaValue(doc, intent.keys);
    if (!hit) return null;                 // a front-matter question with no such fact → fall through
    const text = intent.render(hit.key, hit.value);
    return { route: 'metadata', text: hit.docId ? `${text} (${hit.docId})` : text, sources: [] };
  }
  return null;
};
