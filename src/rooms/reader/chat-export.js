// EO: NUL·SEG(Field → Void, Clearing,Dissecting) — chat + audit export renderer
// chat-export.js — take a whole CHAT (one topic's conversation) and fold its full AUDIT
// trail in beneath each exchange, so a conversation can be downloaded as ONE auditable
// document: what was asked, what was answered, what it was grounded in — and, nested under
// each turn, the pipeline the answer was actually built from (route, the reading that came
// through, the verbatim prompt + raw output, the bindings, the vetoes, the flags, the
// cited spans). The chat is the record; the audit folded under it is the receipt.
//
// Pure, DOM-free, framework-free: the reader app assembles the string and wraps it in a
// Blob to download (rooms/reader/app.js `exportChat`); Node tests call the builders
// directly. It reads only plain data — a topic `{ title, created, memo, messages }`, the
// audit ring's `turns` (rooms/audit/log.js), and the S-registry entries (for a source's
// title/reg) — and never touches the DOM.
//
// THE CORRELATION. Each user question that reaches the grounded pipeline mints exactly one
// audit turn (`auditLog.turn(question)` in turn/pipeline.js), in message order. A question
// answered off the pipeline — an empty record, small talk — mints none, and one that has
// aged out of the ring (last N turns) is gone. So the pairing walks the topic's messages in
// order and consumes audit turns with a forward cursor, matching on the question text: a
// message with no matching turn simply carries no trail, which is the honest state.

const SCHEMA = 'eo-chat-export/1';

const str = (x) => String(x ?? '');
const collapse = (s) => str(s).replace(/\s+/g, ' ').trim();
const truncate = (s, n) => { const t = str(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const round2 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const quote = (s) => '“' + collapse(s) + '”';

// A time as a stable ISO string — message `at`/topic `created` are already ISO; audit
// stamps are epoch ms. Both land on the same readable form, deterministic for tests.
const fmtWhen = (t) => {
  if (t == null || t === '') return '';
  if (typeof t === 'number') { try { return new Date(t).toISOString(); } catch { return str(t); } }
  return str(t);
};

// A fenced block whose backtick run is always longer than any run inside the body, so a
// prompt or a raw output that itself contains ``` can never break out of its fence.
const fence = (body, lang = '') => {
  const s = str(body);
  const runs = s.match(/`+/g);
  const ticks = runs ? Math.max(3, Math.max(...runs.map((r) => r.length)) + 1) : 3;
  const bar = '`'.repeat(ticks);
  return `${bar}${lang}\n${s}\n${bar}`;
};

// Each user question → its answer (the next assistant message) → its audit turn. Returns an
// ordered list of `{ user, assistant, audit }`; any of the three may be null.
export const pairExchanges = (topic, turns = []) => {
  const msgs = Array.isArray(topic?.messages) ? topic.messages : [];
  const audit = Array.isArray(turns) ? turns : [];
  const exchanges = [];
  let cursor = 0;
  let current = null;
  const matchTurn = (question) => {
    for (let i = cursor; i < audit.length; i++) {
      if (audit[i] && audit[i].question === question) { cursor = i + 1; return audit[i]; }
    }
    return null;
  };
  for (const m of msgs) {
    if (!m) continue;
    if (m.role === 'user') {
      current = { user: m, assistant: null, audit: matchTurn(m.text) };
      exchanges.push(current);
    } else if (m.role === 'assistant') {
      if (current && !current.assistant) current.assistant = m;
      else { current = { user: null, assistant: m, audit: null }; exchanges.push(current); }
    }
  }
  return exchanges;
};

// The distinct sources an answer bound to, in first-seen order — the human-facing "grounded
// in" line (the audit turn's own `sources` are cited-span indices, rendered separately).
const dedupeCites = (cites, /* sources */ _s) => {
  const seen = new Set();
  const out = [];
  for (const c of cites || []) {
    const key = c.sn || c.reg || c.docId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ sn: c.sn ?? null, reg: c.reg ?? null, title: c.title ?? null, quote: c.text ?? null });
  }
  return out;
};

const citeLabel = (c) => `${c.reg || (c.sn ? 'S-' + c.sn : 'source')}${c.title ? ` (${collapse(c.title)})` : ''}`;

// One audit step as a single line — its name, when it fired, and a compact read of its data.
const stepDetail = (s) => {
  const d = s && s.data;
  if (!d || typeof d !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(d).slice(0, 4)) {
    if (v == null || v === '') continue;
    let val;
    if (Array.isArray(v)) val = `${v.length}`;
    else if (typeof v === 'object') val = '{…}';
    else val = truncate(collapse(v), 60);
    parts.push(`${k}: ${val}`);
  }
  return parts.join(' · ');
};

// The mechanical reading, summarised: the spans it retrieved, the fold note it handed the
// phraser, and the surfer's own trace. (The verbatim prompt/output are rendered separately.)
const readingLines = (r) => {
  const L = [];
  if (!r) return L;
  L.push(`**The reading** — what came through, mechanically`);
  L.push('');
  const spans = r.spans || [];
  if (spans.length) {
    L.push(`- ${spans.length} span${spans.length === 1 ? '' : 's'} retrieved`);
    spans.slice(0, 8).forEach((sp) => L.push(
      `  - §${sp.idx}${sp.via ? ` · ${sp.via}` : ''}${sp.score != null ? ` · ${round2(sp.score)}` : ''} — ${quote(truncate(sp.text, 160))}`));
  }
  if (r.note) L.push(`- **fold note:** ${quote(truncate(r.note, 400))}`);
  if (r.surf) L.push(`- **surf:** anchor ${r.surf.anchor} · peak ${r.surf.peak}${Array.isArray(r.surf.stops) ? ` · ${r.surf.stops.length} stop${r.surf.stops.length === 1 ? '' : 's'}` : ''}`);
  if (Array.isArray(r.inquiry) && r.inquiry.length) L.push(`- **inquiry:** asked ${r.inquiry.length} of its own open question${r.inquiry.length === 1 ? '' : 's'}`);
  L.push('');
  return L;
};

// The full audit trail for one turn, as a collapsible `<details>` block (GitHub-flavoured).
const auditLines = (turn) => {
  const L = [];
  if (!turn) {
    L.push('<details><summary>Audit trail — none retained</summary>');
    L.push('');
    L.push('_This turn was answered off the grounded pipeline (an empty record or small talk), or it has aged out of the audit ring — so no per-stage trail is on the record for it._');
    L.push('');
    L.push('</details>');
    L.push('');
    return L;
  }
  const steps = turn.steps || [];
  const dur = turn.durationMs != null ? `${(turn.durationMs / 1000).toFixed(2)}s` : '—';
  L.push(`<details><summary>Audit trail — ${steps.length} stage${steps.length === 1 ? '' : 's'} · ${dur}</summary>`);
  L.push('');
  L.push(`- **route:** ${turn.route || '—'}`);
  L.push(`- **grounding:** ${turn.grounding || 'auto'}`);
  if (turn.gated) L.push('- **gated:** yes — the gate engaged on a load-bearing claim and the turn regenerated toward an honest absence');
  L.push(`- **duration:** ${dur}`);
  L.push('');

  if (steps.length) {
    L.push(`**Stages** (${steps.length})`);
    L.push('');
    steps.forEach((s, i) => {
      const detail = stepDetail(s);
      L.push(`${i + 1}. \`${s.name}\` · ${(Number(s.t) / 1000 || 0).toFixed(2)}s${detail ? ` — ${detail}` : ''}`);
    });
    L.push('');
  }

  L.push(...readingLines(turn.reading));

  // What the model was actually handed, and what it gave back — verbatim, grounded turns only.
  const brief = turn.reading && turn.reading.llm;
  const promptText = turn.prompt
    || (brief ? [brief.system && `[system]\n${brief.system}`, brief.user && `[user]\n${brief.user}`].filter(Boolean).join('\n\n') : null);
  if (promptText) {
    L.push('**The prompt the model was handed** — verbatim');
    L.push('');
    L.push(fence(promptText));
    L.push('');
  }
  if (turn.rawOutput) {
    L.push('**Raw model output** — verbatim, before binding & veto');
    L.push('');
    L.push(fence(turn.rawOutput));
    L.push('');
  }

  if (Array.isArray(turn.bound) && turn.bound.length) {
    L.push(`**Bound claims** (${turn.bound.length})`);
    L.push('');
    turn.bound.forEach((b) => L.push(
      `- ${quote(b.claim)}${b.citation ? ` → ${b.citation}` : ' → _uncited_'}${b.score != null ? ` · ${round2(b.score)}` : ''}`));
    L.push('');
  }

  if (Array.isArray(turn.vetoes) && turn.vetoes.length) {
    L.push(`**Vetoes** (${turn.vetoes.length})`);
    L.push('');
    turn.vetoes.forEach((v) => L.push(
      `- \`${v.id || 'veto'}\`${v.refuses ? ` refuses ${quote(v.refuses)}` : ''}${v.message ? ` — ${collapse(v.message)}` : ''}`));
    L.push('');
  }

  const flags = (turn.flags || []).map((f) => f.id || f.note || f).filter(Boolean);
  if (flags.length) { L.push(`**Flags:** ${flags.join(', ')}`); L.push(''); }

  if (Array.isArray(turn.revisions) && turn.revisions.length) {
    L.push(`**Superseded drafts** (${turn.revisions.length}) — kept beside the answer, never unwritten`);
    L.push('');
    turn.revisions.forEach((r, i) => L.push(`- draft ${i + 1}${r.why ? ` (${collapse(r.why)})` : ''}: ${quote(truncate(r.draft, 240))}`));
    L.push('');
  }

  if (Array.isArray(turn.sources) && turn.sources.length) {
    L.push(`**Cited spans:** ${turn.sources.join(', ')}`);
    L.push('');
  }

  L.push('</details>');
  L.push('');
  return L;
};

// ── the human-readable export ───────────────────────────────────────────────────
// The whole chat as one Markdown document: each exchange, and the audit trail folded
// under it. The conversation reads top to bottom; every answer carries its receipt.
export const toMarkdown = ({ topic, turns = [], sources = [] } = {}) => {
  const exchanges = pairExchanges(topic, turns);
  const audited = exchanges.filter((e) => e.audit).length;
  const L = [];
  const title = collapse(topic?.title) || 'Chat';

  L.push(`# ${title}`);
  L.push('');
  const created = topic?.created ? ` · started ${fmtWhen(topic.created)}` : '';
  L.push(`_EO Reader 4.2 — chat export${created}. ${exchanges.length} exchange${exchanges.length === 1 ? '' : 's'}, ${audited} with a full audit trail._`);
  L.push('');
  L.push('> Every answer here is a projection of an append-only audit trail. The conversation is the record; the trail folded under each turn is the receipt — the reasoning the answer was actually built from.');
  L.push('');
  if (topic?.memo && collapse(topic.memo)) {
    L.push('## Memo');
    L.push('');
    L.push(str(topic.memo).trim());
    L.push('');
  }
  L.push('---');
  L.push('');

  exchanges.forEach((ex, i) => {
    if (ex.user) {
      L.push(`## ${i + 1}. You${ex.user.at ? ` — ${fmtWhen(ex.user.at)}` : ''}`);
      L.push('');
      L.push(str(ex.user.text).trim().split('\n').map((l) => `> ${l}`).join('\n'));
      L.push('');
    }
    const a = ex.assistant;
    if (a) {
      const tags = [];
      if (a.route) tags.push(a.route);
      if (a.grounding && a.grounding !== 'auto') tags.push(a.grounding);
      if (a.grounded) tags.push('grounded'); else if (a.unbound) tags.push('unbound');
      if (a.stopped) tags.push('stopped');
      const tagLine = [...new Set(tags)].join(' · ');
      L.push(`### EOReader${tagLine ? ` · ${tagLine}` : ''}`);
      L.push('');
      L.push(collapse(a.text) ? str(a.text).trim() : '_(no answer recorded)_');
      L.push('');
      const cites = dedupeCites(a.cites, sources);
      if (cites.length) { L.push(`**Grounded in:** ${cites.map(citeLabel).join(' · ')}`); L.push(''); }
      const flags = (a.flags || []).map((f) => f.id || f).filter(Boolean);
      if (flags.length) { L.push(`**Flags:** ${flags.join(', ')}`); L.push(''); }
    }
    L.push(...auditLines(ex.audit));
    L.push('---');
    L.push('');
  });

  return L.join('\n');
};

// ── the machine-readable export ─────────────────────────────────────────────────
// A cleaned subset of one audit turn — the same fields the audit JSONL keeps, kept whole
// beside its exchange (the objects already serialize; this just fixes the shape).
const cleanTurn = (turn) => {
  if (!turn) return null;
  return {
    id: turn.id ?? null,
    route: turn.route ?? null,
    grounding: turn.grounding ?? null,
    gated: !!turn.gated,
    startedAt: turn.startedAt ?? null,
    finishedAt: turn.finishedAt ?? null,
    durationMs: turn.durationMs ?? null,
    steps: turn.steps ?? [],
    reading: turn.reading ?? null,
    prompt: turn.prompt ?? null,
    rawOutput: turn.rawOutput ?? null,
    bound: turn.bound ?? null,
    vetoes: turn.vetoes ?? null,
    flags: turn.flags ?? [],
    answer: turn.answer ?? null,
    sources: turn.sources ?? [],
    revisions: turn.revisions ?? null,
    arc: turn.arc ?? null,
  };
};

const safeStringify = (obj) => {
  try { return JSON.stringify(obj, null, 2); }
  catch {
    try {
      const slim = { ...obj, exchanges: (obj.exchanges || []).map((e) => ({ ...e, audit: e.audit ? { id: e.audit.id, note: 'audit omitted — unserializable' } : null })) };
      return JSON.stringify(slim, null, 2);
    } catch { return '{"schema":"' + SCHEMA + '","error":"export failed"}'; }
  }
};

export const toJSON = ({ topic, turns = [], sources = [] } = {}) => {
  const exchanges = pairExchanges(topic, turns);
  const payload = {
    schema: SCHEMA,
    exportedFrom: 'eoreader4.2 · chat + audit',
    topic: {
      id: topic?.id ?? null,
      title: topic?.title ?? null,
      created: topic?.created ?? null,
      memo: topic?.memo || '',
    },
    counts: {
      exchanges: exchanges.length,
      audited: exchanges.filter((e) => e.audit).length,
      sources: Array.isArray(sources) ? sources.length : 0,
    },
    exchanges: exchanges.map((ex, i) => ({
      n: i + 1,
      question: ex.user ? ex.user.text ?? null : null,
      askedAt: ex.user ? ex.user.at ?? null : null,
      answer: ex.assistant ? {
        text: ex.assistant.text ?? '',
        route: ex.assistant.route ?? null,
        grounding: ex.assistant.grounding ?? null,
        grounded: !!ex.assistant.grounded,
        unbound: !!ex.assistant.unbound,
        stopped: !!ex.assistant.stopped,
        flags: (ex.assistant.flags || []).map((f) => f.id || f).filter(Boolean),
        cites: dedupeCites(ex.assistant.cites, sources),
      } : null,
      audit: cleanTurn(ex.audit),
    })),
  };
  return safeStringify(payload);
};

// ── the menu the surface iterates ───────────────────────────────────────────────
// id, human label, extension, MIME, and the builder — the same descriptor shape the
// transcript export uses, so a download menu can render either the same way.
export const FORMATS = [
  { id: 'md',   label: 'Chat + audit — Markdown', ext: 'md',   mime: 'text/markdown;charset=utf-8', build: toMarkdown },
  { id: 'json', label: 'Chat + audit — JSON',     ext: 'json', mime: 'application/json',             build: toJSON },
];

// A chat has something to export the moment it holds a message.
export const hasChat = (topic) => !!(topic && Array.isArray(topic.messages) && topic.messages.length);

// Build one format by id — the single call the surface makes. Returns { text, ext, mime,
// filename } or null for an unknown id / a chat with no messages.
export const buildChatExport = (bundle = {}, id = 'md', baseName = 'chat') => {
  const fmt = FORMATS.find((f) => f.id === id);
  if (!fmt || !hasChat(bundle.topic)) return null;
  const safe = str(baseName || 'chat').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'chat';
  return { text: fmt.build(bundle), ext: fmt.ext, mime: fmt.mime, filename: `${safe}.${fmt.ext}` };
};
