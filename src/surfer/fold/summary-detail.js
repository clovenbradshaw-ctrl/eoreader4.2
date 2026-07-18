// EO: DEF·SEG(Lens,Field → Lens, Dissecting,Clearing) — the detail tiers: voices, budgets, the window fit
// fold/summary-detail.js — how MUCH summary, and at what cost. The prompt discipline
// (gate, cleaning, realize) stays in summary-prompt.js; this module owns the three
// detail tiers, the scope×detail voice table, and the deterministic fit that keeps a
// one-shot ask inside the smallest local window.

// ── the detail tiers ──────────────────────────────────────────────────────────────────
// One pipeline, three levels of detail — each a ONE-SHOT prompt (a single system+user
// pair; no multi-message chains), each sized for the small local window (webllm/wllama
// hold 4k tokens; the tier's inputBudget is what the whole ask may cost, leaving the
// decode its room even on the smallest backend):
//
//   brief      the fast voice — one sentence (two at most) from a small packet, decoded
//              in ≤64 tokens. Cheap enough to ask at ANY place in the fold as the reader
//              moves: prefill is the cost on a CPU model, so the budget is tight.
//   standard   the default — the 3-sentence summary the pipeline always made.
//   paragraph  the whole-work voice — ONE paragraph, never more, over an arc-coverage
//              packet whose spans run beginning → end. "The entire novel, in a paragraph."
//
// The budgets are deliberately conservative: they must fit under the smallest window in
// the fleet (4096) with the tier's own decode reserved and the chat template's framing
// paid, whatever the backend.
export const SUMMARY_DETAILS = Object.freeze({
  brief: Object.freeze({
    sentences: 1, maxSentences: 2, maxLen: 400, inputBudget: 700,
    decode: Object.freeze({ maxTokens: 64, temperature: 0, stop: ['\n'] }),
  }),
  standard: Object.freeze({
    sentences: 3, maxSentences: 4, maxLen: 900, inputBudget: 1800,
    decode: Object.freeze({ maxTokens: 220, temperature: 0, stop: ['\n\n'] }),
  }),
  paragraph: Object.freeze({
    sentences: 6, maxSentences: 7, maxLen: 1400, inputBudget: 2700,
    decode: Object.freeze({ maxTokens: 320, temperature: 0, stop: ['\n\n'] }),
  }),
});
export const tierOf = (detail) => SUMMARY_DETAILS[detail] || SUMMARY_DETAILS.standard;

// ── the voices ────────────────────────────────────────────────────────────────────────
// One frame, three scopes × three details. The notes vocabulary ("settles", "holds
// open", "turns") is carried into the ask so the model treats the held-open group as
// UNSETTLED — the void band as a prompt constraint, the same firewall-as-instruction
// move the reflect prompt makes.
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

export const CROSS_SYSTEM =
  'You have read several sources that discuss related figures. Below, grouped per' +
  ' figure, are passages and reading notes from each source. Write a summary that' +
  ' keeps every figure distinct: attribute each claim to the figure it belongs to,' +
  ' use full names, and never blend two people who happen to share a name.' + COMMON_RULES;

// The brief voice is kept SHORT on purpose — on a CPU model the system message is
// prefill the reader waits through, so the fast tier pays for no prose it can skip.
const BRIEF_DOCUMENT_SYSTEM =
  'Below are key sentences from a document with reading notes. In one sentence — two' +
  ' at most — say what is happening or being claimed here, concrete and specific.' + COMMON_RULES;

const BRIEF_ENTITY_SYSTEM =
  'Below are the passages of a document where one figure appears, with reading notes.' +
  ' In one sentence — two at most — say who or what the figure is here and what it does.' + COMMON_RULES;

// The whole-work voice: the spans arrive in reading order from across the entire work
// (arc coverage), so the paragraph is asked to carry the arc, not one scene.
const WORK_SYSTEM =
  'You have read an entire work from beginning to end. Below are passages drawn from' +
  ' across it, in reading order, with the reading notes — what it settles, what it' +
  ' holds open. Write ONE concise paragraph a careful reader would give of the whole' +
  ' work: what it is, who or what it concerns, and how it moves from its opening to' +
  ' its close. Never more than one paragraph.' + COMMON_RULES;

export const SUMMARY_SYSTEMS = Object.freeze({
  full: DOCUMENT_SYSTEM, cursor: DOCUMENT_SYSTEM, topic: DOCUMENT_SYSTEM, range: DOCUMENT_SYSTEM,
  entity: ENTITY_SYSTEM, cross: CROSS_SYSTEM,
});

const BRIEF_SYSTEMS = Object.freeze({
  full: BRIEF_DOCUMENT_SYSTEM, cursor: BRIEF_DOCUMENT_SYSTEM, topic: BRIEF_DOCUMENT_SYSTEM, range: BRIEF_DOCUMENT_SYSTEM,
  entity: BRIEF_ENTITY_SYSTEM, cross: CROSS_SYSTEM,
});

// The system message for a scope at a detail. The paragraph tier speaks the whole-work
// voice only when the packet actually covers the arc (or is the full scope) — a
// paragraph-length entity or topic summary keeps its scope's own frame.
export const summarySystem = (scope, detail = 'standard', packet = null) => {
  if (detail === 'brief') return BRIEF_SYSTEMS[scope] || BRIEF_DOCUMENT_SYSTEM;
  if (detail === 'paragraph' && (scope === 'full' || packet?.coverage === 'arc')) return WORK_SYSTEM;
  return SUMMARY_SYSTEMS[scope] || DOCUMENT_SYSTEM;
};

// ── the ask's blocks ──────────────────────────────────────────────────────────────────
// The turns group is deliberately NOT fed to the model: "the reading turns around X"
// is the surfer's navigation record, and a small model handed it echoes it back as if
// it were content (the parroted-frame failure the reflect prompt already met). The
// packet still carries turns for the audit; the summary ask reads settled + held-open.
export const notesBlock = (groups) => {
  const parts = [];
  const block = (head, lines) => { if (lines && lines.length) parts.push(`${head}\n${lines.map((l) => `- ${l}`).join('\n')}`); };
  block('Settled:', groups?.settled);
  block('Held open (do not settle):', groups?.heldOpen);
  return parts.join('\n');
};

export const passagesBlock = (spans) =>
  (spans || []).map((s) => `- ${s.text}`).join('\n');

// ── the window guard, prompt side ─────────────────────────────────────────────────────
// The tier's inputBudget is a hard ceiling on what the ONE-SHOT ask may cost, so the
// prompt fits the smallest local window with the decode's room reserved — BEFORE the
// backend's own context guard ever has to blind-cut it (that guard elides the middle of
// the largest block, which for a summary ask is the passages: exactly the material).
// This fit is deterministic and knows what matters: shed the MIDDLE spans first (the
// first and last passages carry the arc's ends — for a whole-work packet they are the
// opening and the close), then the tail of the note groups, and only then truncate the
// longest surviving span. The same token rule as model/context-budget.js (a private
// copy, the converse/history.js precedent — fold/ imports no model internals): ASCII at
// bytes/4, non-ASCII at bytes/2, so a CJK or Cyrillic packet is never under-counted.
const estTokens = (str) => {
  const s = String(str ?? '');
  if (!s.trim()) return 0;
  let t = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const bytes = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    t += bytes === 1 ? 0.25 : bytes * 0.5;
  }
  return Math.ceil(t);
};

export const fitSummaryAsk = (packet, system, head, ask, budget) => {
  let spans = [...(packet?.spans || [])];
  let settled = [...(packet?.groups?.settled || [])];
  let heldOpen = [...(packet?.groups?.heldOpen || [])];
  const render = () =>
    `${head}Passages:\n${passagesBlock(spans)}\n\n` +
    `Reading notes:\n${notesBlock({ settled, heldOpen })}\n\n` + ask;
  const cost = () => estTokens(system) + estTokens(render()) + 16;   // + chat-template framing
  for (let guard = 0; guard < 64 && cost() > budget; guard++) {
    if (spans.length > 3) spans.splice(Math.floor(spans.length / 2), 1);      // middle out — keep the arc's ends
    else if (heldOpen.length > 1) heldOpen.pop();
    else if (settled.length > 2) settled.pop();
    else {
      // last resort: truncate the longest span's own middle, keeping both of its ends
      let li = -1, ln = 120;
      for (let i = 0; i < spans.length; i++) if (spans[i].text.length > ln) { li = i; ln = spans[i].text.length; }
      if (li < 0) break;
      const t = spans[li].text;
      const keep = Math.floor(t.length * 0.6);
      spans[li] = { ...spans[li], text: `${t.slice(0, Math.floor(keep * 0.6))} … ${t.slice(t.length - Math.ceil(keep * 0.4))}` };
    }
  }
  return render();
};
