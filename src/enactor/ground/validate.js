// EO: EVA(Lens, Dissecting) — the answer's own grounding check ("does this sound right?")
// The model-prompt validation — the check the mechanical veto battery cannot do.
//
// ground/veto.js reads the answer's LEXICAL contact with the retrieved spans; it cannot
// tell a grounded paraphrase from a confident fabrication that merely shares the
// passages' vocabulary. So an answer whose every claim ties to nothing but still brushes
// a span — `unbound-contact` — rides, flagged yet shown as grounded. That is the observed
// failure (the audit export "New topic": over a set of skyscraper lists the talker was
// invited to "answer from general knowledge" and named a 10.4 m Korean straw hut "the
// tallest house in the world", which then shipped with a citation to a skyscraper list).
// Every mechanical guard fired — unbound-contact, referent-ambiguous, low-coverage — and
// by the deliberate "flag, never gate" design (ground/veto.js, turn/stages.js §5) the
// answer rode anyway.
//
// A reader handed its OWN draft beside the lines it read, and asked the one question the
// binder cannot — does this actually follow from these lines? — catches exactly that. This
// module builds that prompt and reads the verdict; the turn stage (turn/stages.js
// `validate`) decides what to do with the verdict. Model-INJECTED — it never imports a
// backend, so a test passes a stub and the app passes the live talker.

export const SYSTEM_VALIDATE = `You are double-checking a draft answer before it is shown to someone. You will be given the exact lines a reader found in a source, the question that was asked, and the draft answer. Judge one thing only: does the draft answer actually follow from those lines?

- If the lines contain the answer, or clearly imply it, it is SUPPORTED.
- If the lines do not contain the answer — it names things the lines never mention, or states something that is plainly not true — it is UNSUPPORTED.

Ignore writing style, tone, and how complete it is. Judge only whether the lines back up what the answer claims. Begin your reply with a single word — SUPPORTED or UNSUPPORTED — then a brief reason.`;

// The messages for the check: the lines the reader found, the question, and the draft,
// laid out plainly. `lines` are already trimmed strings (validateAnswer selects them off
// the spans). No [sN] tags, no ids — the same clean surface the talker always sees.
export const buildValidationMessages = ({ question, lines = [], answer } = {}) => {
  const linesBlock = lines.map((l) => `- ${l}`).join('\n') || '- (no lines were found)';
  const user =
    `Lines the reader found:\n${linesBlock}\n\n` +
    `Question: ${String(question || '').trim()}\n\n` +
    `Draft answer: ${String(answer || '').trim()}\n\n` +
    `Does the draft answer follow from those lines? Reply SUPPORTED or UNSUPPORTED, then a brief reason.`;
  return [
    { role: 'system', content: SYSTEM_VALIDATE },
    { role: 'user', content: user },
  ];
};

// The reason, stripped of the leading verdict token, normalised and capped — the human
// gloss the audit shows beside the verdict.
const reasonOf = (text) =>
  String(text || '')
    .replace(/^[\s\W]*\b(?:un)?supported\b[\s:.,)\-—]*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

// Read a weak local model's reply into one of three verdicts. The prompt asks for a single
// leading word, but a 3B model paraphrases — "the answer is not supported", "no, it does
// not follow" — so the PHRASAL negatives are matched first, before the bare `supported`
// positive can fire on "not supported". Only a clear negative reads as `unsupported`; a
// clear positive as `supported`; anything muddy stays `unclear`. The stage gates ONLY on
// `unsupported`, so an unreadable verdict never manufactures a refusal (the paraphrase that
// rides stays protected). The one accepted risk — a double negative ("not unsupported") —
// would gate an answer the mechanical battery already flags as unbound: low harm, honest
// direction.
export const parseValidationVerdict = (raw) => {
  const text = String(raw || '');
  const t = text.toLowerCase();
  if (!t.trim()) return { verdict: 'unclear', reason: '' };
  const negative =
    /\bunsupported\b|\bnot\s+supported\b|\b(?:does|do|did|is|it)\s*n['’]?t\s+(?:follow|support|in)\b|\bdoes\s+not\s+(?:follow|support)\b|\bnot\s+in\s+(?:the|those|these|what)\b|^\s*no[,.\s)]/;
  const positive = /\bsupported\b|^\s*yes[,.\s)]|\bit\s+follows\b|\bdoes\s+follow\b/;
  const verdict = negative.test(t) ? 'unsupported' : positive.test(t) ? 'supported' : 'unclear';
  return { verdict, reason: reasonOf(text) };
};

// Ask the reader to check its own draft against the lines. Returns { verdict, reason, raw }
// or null when the check could not run (no model, no answer, no lines) or the model faulted
// — a validation that cannot complete must never cost the answer, so the stage falls back to
// the flag-and-tell default. `spans` may be span objects ({ text }) or bare strings; the top
// few of the lines the answer actually read are what the check sees.
export const validateAnswer = async ({ model, question, spans = [], answer, maxTokens = 160, signal = null } = {}) => {
  if (!model || typeof model.phrase !== 'function' || !answer) return null;
  const lines = spans
    .map((s) => (typeof s === 'string' ? s : s?.text) || '')
    .map((s) => String(s).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return null;
  const messages = buildValidationMessages({ question, lines, answer });
  let raw;
  try {
    raw = await model.phrase(messages, { maxTokens, ...(signal ? { signal } : {}) });
  } catch {
    return null; // a validation fault must never cost the answer
  }
  const { verdict, reason } = parseValidationVerdict(raw);
  return { verdict, reason, raw: String(raw || '').slice(0, 500) };
};
