// EO: CON·INS(Network,Field → Field, Binding,Making) — external-corpus adapters
// Map the larger open corpora onto the internal record schema the fit tool speaks —
// { id, intent, user_turn, response, role, source, weight? } — so shape-fit can abstract
// their RESPONSES to move-sequences exactly as it does the Cleo exemplars. Pure functions
// over already-parsed rows (or a JSONL string), so they are testable with synthetic input and
// ready the moment the data lands, whether or not the network reached it this session.
//
// The corpora play three ROLES (docs: the contrast-set argument):
//   target      the shapes we ship — Cleo's own exemplars, the positive register. Only these
//               become per-intent grammars.
//   background  the NEGATIVE set — an assistant corpus pooled into one grammar, the register a
//               draft is scored to be UNLIKE (s_intent − s_background). Human or synthetic prose,
//               it is the "what a chatbot sounds like" the discriminator needs.
//   reference   labelled assistant data whose task categories MAP onto some target intents — used
//               to report coverage. Its whole value is showing which intents it CANNOT cover:
//               the Cleo-distinctive half (pushback-repair, name-tension, meta-about-cleo, …) has
//               no assistant analog and never will, which is the proof the corpus is a contrast
//               set, not a source.

// ── Dolly 15k (databricks/databricks-dolly-15k, CC-BY-SA, human-written) ─────────
// Its task categories are free supervision: they pre-map onto a few target intents. The mapping
// is deliberately CONSERVATIVE — only genuine correspondences. A category with no honest analog
// maps to null: it still contributes to the background register, but it is NOT claimed as
// coverage of any Cleo intent. That asymmetry is the finding, not a gap to paper over.
export const DOLLY_INTENT = Object.freeze({
  open_qa: 'lookup',                 // a factual question answered from world knowledge
  general_qa: 'lookup',
  classification: 'lookup',          // pick the answer — a committed one-liner
  closed_qa: 'connect-passages',     // answer grounded in a provided passage
  information_extraction: 'connect-passages',
  summarization: 'synthesis',        // condense many into one
  brainstorming: null,               // no honest Cleo analog — background only
  creative_writing: null,            // no honest Cleo analog — background only
});

const clean = (s) => String(s || '').replace(/\r/g, '').trim();

// One Dolly row → a record. `role` defaults to 'reference' (labelled → coverage-bearing); pass
// 'background' to pool it into the negative grammar regardless of category.
export const dollyRecord = (row, i, { role = 'reference' } = {}) => {
  const response = clean(row?.response);
  if (!response) return null;
  const instruction = clean(row?.instruction);
  const context = clean(row?.context);
  const cat = clean(row?.category) || 'unknown';
  const intent = role === 'background' ? '_bg' : (DOLLY_INTENT[cat] ?? `dolly:${cat}`);
  return {
    id: `dolly-${cat}-${i}`,
    intent,
    user_turn: context ? `${instruction}\n\n${context}` : instruction,
    response,
    role,
    source: 'dolly',
    category: cat,
  };
};

// ── OpenAssistant (OpenAssistant/oasst1, Apache-2.0, human-written + human-ranked) ─
// The positive-register control: people composing, not the assistant attractor. The export is a
// flat message list; a record is a prompter turn paired with its highest-ranked assistant reply.
// Given an array of {message_id, parent_id, role, text, rank} rows, pair replies to their prompt.
export const oasstRecords = (rows = [], { role = 'background' } = {}) => {
  const byId = new Map(rows.map((r) => [r.message_id, r]));
  const out = [];
  for (const r of rows) {
    if (r.role !== 'assistant' || !clean(r.text)) continue;
    if (r.rank != null && r.rank !== 0) continue;          // keep the top-ranked reply only
    const parent = byId.get(r.parent_id);
    if (!parent || parent.role !== 'prompter') continue;
    out.push({
      id: `oasst-${r.message_id}`,
      intent: role === 'background' ? '_bg' : 'oasst',
      user_turn: clean(parent.text),
      response: clean(r.text),
      role, source: 'oasst',
    });
  }
  return out;
};

// ── HelpSteer3-Preference, General subset (nvidia/HelpSteer3, CC-BY-4.0, human-annotated) ─
// The winner-vs-loser gradient — abstracted to move-space it is the ONLY honest way to learn the
// per-shape `weight` (human taste, not GPT-4's ruler). Each row has two responses and an overall
// preference; emit the winner and loser as a pair the fit tool can diff in move-space. Filter to
// the General domain HARD — Code/STEM/Multilingual grammars would wreck the prose shapes.
export const helpSteer3Pairs = (rows = [], { domain = 'general' } = {}) => {
  const out = [];
  for (const r of rows) {
    if (domain && r?.domain && String(r.domain).toLowerCase() !== domain) continue;
    const a = clean(r?.response1), b = clean(r?.response2);
    if (!a || !b) continue;
    const pref = Number(r?.overall_preference ?? 0);        // <0 → response1 better, >0 → response2
    if (!pref) continue;                                     // ties carry no gradient
    const [winner, loser] = pref < 0 ? [a, b] : [b, a];
    out.push({ context: clean(r?.context) || clean(r?.prompt), winner, loser, strength: Math.abs(pref), source: 'helpsteer3' });
  }
  return out;
};

// Parse a JSONL string with a per-row adapter, skipping blank/malformed lines (never throwing),
// and honouring a `limit` so a bounded sample is cheap. Returns the adapted, non-null records.
export const fromJsonl = (text, adapt, { limit = Infinity } = {}) => {
  const out = [];
  let i = 0;
  for (const line of String(text || '').split('\n')) {
    if (out.length >= limit) break;
    const t = line.trim();
    if (!t) continue;
    let row;
    try { row = JSON.parse(t); } catch { continue; }
    const rec = adapt(row, i++);
    if (rec) out.push(rec);
  }
  return out;
};

// Convenience: a Dolly JSONL string → records.
export const fromDolly = (text, opts = {}) =>
  fromJsonl(text, (row, i) => dollyRecord(row, i, opts), opts);
