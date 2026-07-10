// EO: DEF·SEG·EVA(Field,Void → Lens,Void, Dissecting,Binding) — the reflect prompt + output discipline
// fold/reflect-prompt.js — the SIGNIFICANCE reflection prompt: elicit ONLY the one form
// the generation fold wants, and enforce it on the way out.
//
// The deep reader leaves `reflect` injected (fold/deep-reading.js) so the model voice is a
// first-class, tunable artifact. A reflection is an EVA — the reader judging WHY a place
// matters (significance), not WHAT it says (existence/structure). For it to slot into the
// writer's fold it must be:
//   · a judgment of significance, not a summary of content;
//   · ONE plain sentence in the writer's own register (input must not be far from output —
//     a continuation model handed a list or a "Certainly, here's…" preamble mimics it);
//   · free of preamble, quotation, and enumeration.
// A small model will not obey the instruction alone, so `cleanReflection` enforces the shape
// deterministically — strip the leaked scaffolding, keep the first plain sentence. Prompt
// design AND output discipline, because on a 0.5B model the instruction is only half of it.

// A reflection is an EVA — the reader judging a place against its frame — and an EVA is
// meaningless without its DEF, the terms it evaluates against. The surprise the surfer used
// to pick this peak IS that gap: what the reading held (the frame) vs what it hit (the
// arrival). deepReading already computes both sides (verdict = surprise < band; focus; the
// back=1 span is the frame) and the model-free note uses them — so we hand the model the
// decomposition, not the arrival prose alone. Then it reports a surprise instead of
// performing one, and it stops parroting because we never put the meta-vocabulary in the ask.
// The note is a COMPLETION of the reading's own margin note, not an answer to a critic.

// reflectionInput — the DEF→EVA decomposition, built from what deepReading hands `reflect`
// (fold, ctx). frame = the span the reading was holding (behind); arrival = the peak it hit;
// verdict = confirm|strain; highStrain gates the optional REC (reframe) invitation.
export const reflectionInput = (fold, ctx = {}) => {
  const sents = (ctx.doc && (ctx.doc.units || ctx.doc.sentences)) || [];
  const c = Number.isInteger(ctx.cursor) ? ctx.cursor : 0;
  const arrival = String(sents[c] ?? '').trim();
  const frame = String(sents[c - 1] ?? '').trim();          // back=1 — what the reading held coming in
  const verdict = (ctx.surprise != null && ctx.band != null) ? (ctx.surprise < ctx.band ? 'confirm' : 'strain') : 'strain';
  const highStrain = verdict === 'strain' && ctx.band != null && ctx.surprise > ctx.band * 1.6;
  return { frame, arrival, verdict, highStrain, focus: ctx.focus ? String(ctx.focus).trim() : null };
};

// The two reactions the verdict names — a strain and a confirm are different judgments, and
// the old single ask collapsed them. Fenced to significance over WHAT IS PRESENT ("add no new
// facts") — the firewall the reflection rides made a prompt constraint, which also structurally
// blocks the honeybees drift where a model told to conclude invents content.
const CONFIRM_SYSTEM =
  "Continue a reader's private margin note. The next line landed where the reader was already " +
  "heading. In one plain sentence, finish the note with what it now makes plain — the link it " +
  "confirms between what was held and what came. The reader's own voice; judge only what is " +
  "already here, and add no new facts.";
const STRAIN_SYSTEM =
  "Continue a reader's private margin note. The reader was holding one understanding; the next " +
  "line cut against it. In one plain sentence, finish the note with what that forces — the link " +
  "it exposes, or how the earlier reading now has to bend. The reader's own voice; judge only " +
  "what is already here, and add no new facts.";
// Offered ONLY at high strain, never commanded — a located REC (docs/deep-reading.md's
// eo:Reframing). Forcing a reframe on a weak model is the restatement failure; at low strain a
// plain confirm is the honest output.
const RECAST_TAIL =
  ' The strain is large — you may say how the earlier line now has to be read differently.';
// Kept as the exported default (tests / callers that want a single string) — the strain voice.
export const SIGNIFICANCE_REFLECT_SYSTEM = STRAIN_SYSTEM;

// significanceReflectMessages — the reflect prompt over the decomposition. Accepts the
// reflectionInput object; a bare string is treated as an arrival with unknown verdict (strain).
// The user turn is the reading's note trailing off ("Note on X: ") for the model to COMPLETE —
// no "what is surprising/interesting/connected" meta-vocabulary for it to echo.
export const significanceReflectMessages = (input) => {
  const x = typeof input === 'string' ? { arrival: input, verdict: 'strain' } : (input || {});
  const system = (x.verdict === 'confirm' ? CONFIRM_SYSTEM : STRAIN_SYSTEM) + (x.highStrain ? RECAST_TAIL : '');
  const held = x.frame ? `Held: ${x.frame}\n` : '';
  const then = x.arrival ? `Then: ${x.arrival}\n` : '';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${held}${then}\nNote${x.focus ? ` on ${x.focus}` : ''}: ` },
  ];
};

// Decode hint for the caller — one short sentence, greedy, stop at a line break so the model
// cannot slide into a second "Also,…" clause or a bulleted expansion.
export const REFLECT_DECODE = Object.freeze({ maxTokens: 45, greedy: true, stop: ['\n'] });

// A leading interjection ("Certainly!", "Sure,", "Of course —") with its trailing
// punctuation, stripped whole so the first-sentence match never grabs the stray "!".
const INTERJECTION = /^(?:certainly|sure|of course|absolutely|indeed|well|okay|ok|right)\b[\s!,.:;—-]*/i;
// A "here's … :" / "the point is :" / "what's striking is :" scaffold lead.
const PREAMBLE = /^(?:here(?:'s| is)\b[^:.]*[:.]?|the (?:key |main |central )?(?:point|insight|significance|takeaway)\b[^:.]*[:.]?|this (?:passage|paragraph|text|excerpt)\b[^,.]*[,.]?|in (?:summary|short)[,.]?|to summarize[,.]?|what(?:'s| is)\b[^:.]*[:.]?)\s*/i;
// The parroted evaluation FRAME — "The most surprising and interesting aspect of X is [that]"
// and kin — that a small model echoes back from a "what is most surprising/interesting"
// prompt. Stripping it leaves the actual observation (the tail), which de-boilerplates the
// reflections so they stop colliding into churn. The subject X is recoverable from context.
const FRAME = /^the most\s+\w+(?:\s+(?:and|or|,)\s+\w+)*\s+(?:aspect|thing|part|feature|point|fact|idea)\s+(?:of|about)\s+.+?\s+(?:is|was)\s+(?:that\s+)?/i;
// The parroted CONNECTION frame — the implicit-connection prompt's own echo ("The (implicit)
// connection between X and Y is that …", "These statements imply that …", "Together they
// suggest …"). Stripped to the link itself so the reflections stop opening the same way.
const CONNECTION_FRAME = /^(?:the\s+(?:implicit\s+|unstated\s+|underlying\s+|key\s+)?(?:connection|link|implication|relationship)\b.*?\b(?:is|seems to be|indicates?|means?|shows?|reveals?|suggests?)\s+(?:that\s+)?|(?:these|the)\s+(?:statements|facts|points|two)\b.*?\b(?:imply|suggest|show|reveal|indicate)\s+(?:that\s+)?|together[,]?\s+(?:they|these)\b.*?\b(?:imply|suggest|show|reveal|indicate)\s+(?:that\s+)?)/i;
const LIST_LEAD = /^\s*(?:[-*•]|\d+[.)])\s+/;
// "It's implied that X" / "This implies that X" — a frame around a real link X; strip it and
// keep X (distinct from the bare non-answer below, which has no X).
const IMPLIES_FRAME = /^(?:it'?s?|it is|this|which)\s+(?:implied|implies|means|suggests?)\s+(?:that\s+)?/i;
// A NON-ANSWER — the model echoing the prompt ("implied but not explicitly stated") or
// gesturing at a link without stating one. Rejected so the caller feeds nothing rather than
// scaffolding. (A small model reaches for these when it cannot actually find the connection.)
const NON_ANSWER = /^(?:implied\b|not\s+(?:explicitly\s+)?stated|it\s+(?:is|'?s)\s+related\b|there(?:'s| is)\s+(?:a\s+)?(?:connection|link|relationship)\b)/i;

// cleanReflection — enforce the one-sentence, no-scaffolding form the prompt asks for.
// Strips a leaked interjection, a scaffold preamble, and any list lead, unwraps surrounding
// quotes, keeps the first sentence, caps length. Returns '' when nothing survives (a pure
// preamble / empty) so the caller feeds no reflection rather than a scaffold.
const triSet = (s) => {
  const w = String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const g = new Set(); for (let i = 0; i + 3 <= w.length; i++) g.add(w.slice(i, i + 3).join(' ')); return g;
};

// `against` — the source spans (the frame and the arrival). A reaction that merely REPEATS a
// span is a non-judgment (the failure a weak model falls to once it stops parroting): reject
// it so the walk injects only a genuine reaction, else falls back to baseline. The mirror of
// the NON_ANSWER guard — one rejects an empty gesture, this rejects an echo.
export const cleanReflection = (raw, { maxLen = 220, against = [] } = {}) => {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // take the first non-empty line (the decode stop is '\n', but be robust if it leaked more)
  t = t.split('\n').map((s) => s.trim()).find(Boolean) || '';
  t = t.replace(LIST_LEAD, '');
  // reject a bare non-answer BEFORE stripping frames (so "implied but not stated" dies whole)
  if (NON_ANSWER.test(t)) return '';
  // strip up to two stacked scaffolds ("Certainly! Here's the point:") and the parroted frames
  for (let i = 0; i < 2; i++) { const s = t.replace(INTERJECTION, '').replace(PREAMBLE, '').replace(FRAME, '').replace(CONNECTION_FRAME, '').replace(IMPLIES_FRAME, ''); if (s === t) break; t = s.trim(); }
  // unwrap a fully-quoted sentence
  const q = t.match(/^["“'](.+?)["”']\.?$/); if (q) t = q[1].trim();
  // keep the first sentence
  const m = t.match(/^.*?[.!?](?=\s|$)/); if (m) t = m[0].trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  // a stripped frame leaves a lowercase tail ("their ability to …") — capitalize so it reads
  // as a statement the writer can drop in.
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  // reject a degenerate residue: too short, a prompt-echo non-answer, or a truncation left
  // dangling on a function word ("… related to the") — an incomplete link is worse than none.
  if (t.replace(/[^a-z]/gi, '').length < 8) return '';
  if (NON_ANSWER.test(t)) return '';
  if (!/[.!?]$/.test(t) && /\b(?:the|a|an|of|to|and|or|with|for|that|is|are)$/i.test(t)) return '';
  // restatement guard: if most of the reaction's trigrams already sit in a source span, it is
  // an echo of the given, not a judgment of it — reject.
  if (against && against.length) {
    const rt = triSet(t);
    if (rt.size) for (const a of against) {
      const at = triSet(a); if (!at.size) continue;
      let inter = 0; for (const x of rt) if (at.has(x)) inter++;
      if (inter / rt.size > 0.6) return '';
    }
  }
  return t;
};
