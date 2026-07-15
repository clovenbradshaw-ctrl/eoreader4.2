// EO: NUL·SIG(Network,Entity → Void,Atmosphere, Clearing,Tending) — liveView — live process view
// research/live.js — the live process view (docs/deep-research-log.md).
//
// The significance loop made visible, because it is the distinctive,
// trust-building thing. NOT a second state machine: liveView(log, cursor) is
// projectReport at a cursor, reshaped for a panel that animates — the current
// frame as a standing panel (terms, a strain bar filling toward the REC
// threshold), the strain as the page's pulse, the coverage grid filling cell by
// cell (solid corroborated, amber contested, hollow empty), the surf as a path
// following measured surprise, questions surfacing as in-flow cards. Nothing
// animates that is not an event.

import { projectReport } from './project.js';
import { RKIND } from './events.js';
import { OPERATORS } from '../../core/index.js';

// The coverage read in PLAIN LANGUAGE — the operator-code grid (NUL/SEG/DEF/…)
// rewritten as the shape a person actually asks after a research run: how many
// claims were found, how many bind to a real quote, how much is the model's
// connective glue, what was set aside as a measured absence, how many sources,
// and the share of the answer bound to the record. Robust across stages: before
// a model phrases the sections there is no glue yet, so every grounded claim
// reads as bound; once phrased, the bound/glue split IS the honest VERIFY line.
// Same numbers, no jargon — a projection of the same fold the grid reads.
export const coverageSummary = (r) => {
  const phrased = r.verify.sentences > 0;
  const claims = phrased ? r.verify.sentences : r.propositions.length;
  const grounded = phrased ? r.verify.bound : r.propositions.length;
  const glue = r.verify.glue;
  const aside = r.voids.length;
  const sources = r.pins.length || r.reads.length;
  const pct = claims ? Math.round((grounded / claims) * 100) : 0;
  return [
    { key: 'claims',   value: claims,       label: 'claims found',        tone: 'ink'  },
    { key: 'grounded', value: grounded,     label: 'grounded to a quote', tone: 'grn'  },
    { key: 'glue',     value: glue,         label: 'connective glue',     tone: 'ink2' },
    { key: 'aside',    value: aside,        label: 'set aside',           tone: aside ? 'amb' : 'ink3' },
    { key: 'sources',  value: sources,      label: 'sources read',        tone: 'ink'  },
    { key: 'pct',      value: pct + '%',    label: 'bound to the record', tone: 'acc'  },
  ];
};

// The one-line plain-language gloss under the coverage tiles — what the numbers
// mean, so the grid never needs a legend of codes.
export const coverageNote = (r) => {
  const done = r.convergence.badge === 'settled' || r.convergence.badge === 'converging';
  const aside = r.voids.length;
  const asidePhrase = aside
    ? ` ${aside} absence${aside === 1 ? ' was' : 's were'} recorded and set aside, never silently mixed in.`
    : '';
  return (done
    ? 'Every claim that made the answer binds to a quote you can open. Connective glue is the model’s own words, marked as such.'
    : 'Grounded claims bind to an exact quote you can open. Connective glue is the model’s own words, marked. Absences are set aside, never smoothed over.')
    + asidePhrase;
};

export const liveView = (log, cursor = null) => {
  const r = projectReport(log, cursor);
  const at = r.cursor;

  // The standing frame panel: the deepest frame still gathering, its current
  // terms (DEF), its strain against a nominal bar. The bar is strain relative
  // to the last REC's firing sum (or 1.5, the skeleton threshold) — a calm
  // topic barely fills it; a contested one keeps breaking it.
  const activeFrame = [...r.frames].reverse().find((f) => f) ?? null;
  const lastRec = r.recs.length ? r.recs[r.recs.length - 1] : null;
  const bar = lastRec?.strainSum || 1.5;
  const framePanel = activeFrame ? {
    id: activeFrame.id, question: activeFrame.question,
    terms: activeFrame.terms, recs: activeFrame.recs,
    strain: activeFrame.strain, strainRatio: Math.max(0, Math.min(1, bar ? activeFrame.strain / bar : 0)),
  } : null;

  // The grid, cell by cell: solid (corroborated), amber (contested), plain
  // (present), hollow (empty). Read off the coverage fold + the con record.
  const contestedOps = new Set(), corroboratedOps = new Set();
  for (const p of r.propositions) {
    const op = p.address?.op;
    if (!op) continue;
    if (p.contradictedBy.length) contestedOps.add(op);
    else if (p.corroboratedBy.length) corroboratedOps.add(op);
  }
  const grid = Object.keys(OPERATORS).map((op) => ({
    op, label: OPERATORS[op].label, count: r.coverage.actFace[op] || 0,
    state: !r.coverage.actFace[op] ? 'empty'
      : contestedOps.has(op) ? 'contested'
      : corroboratedOps.has(op) ? 'corroborated' : 'present',
  }));

  // The surf as a path of measured surprise; the REC moments ride on it so the
  // signature reframe ("this read as X; the third source makes it Y") is one
  // click from the span that forced it.
  const path = r.pulse.map((p) => ({ t: p.t, surprise: p.surprise, strain: p.strain, propId: p.propId }));
  const recMoments = r.recs.map((rec) => ({
    t: rec.t, from: rec.from, to: rec.to, strainSum: rec.strainSum,
    forcedBy: rec.forcedBy,
  }));

  // ── the prototype live shape: the run narrated the way a person reads it ────
  const badge = r.convergence.badge;
  const SETTLE = {
    open:       { pct: r.propositions.length ? 22 : 8, label: 'gathering',  color: '#b45309' },
    converging: { pct: 64,  label: 'converging', color: '#5b34d6' },
    settled:    { pct: 100, label: 'settled',    color: '#15803d' },
    contested:  { pct: 46,  label: 'contested',  color: '#b45309' },
    thrash:     { pct: 34,  label: 'thrashing',  color: '#dc2626' },
  };
  const settle = SETTLE[badge] || SETTLE.open;
  const query = (r.root && r.root.question) || (framePanel && framePanel.question) || '';
  const pinName = (pin) => pin ? (pin.title || prettyUrl(pin.url) || 'a source') : '';
  const pinHost = (pin) => { try { return new URL(pin.url).hostname.replace(/^www\./, ''); } catch { return pin && pin.url ? '' : 'local'; } };

  // sub-questions: the frame tree (minus the root — it's the query pill above),
  // each done / reading / queued. A frame is "done" once it has read anything
  // into it (promoted OR background evidence, or a phrased summary).
  const activeId = activeFrame ? activeFrame.id : null;
  const rootId = r.root ? r.root.id : null;
  const subs = r.sections.filter((s) => s.frameId !== rootId).map((s) => {
    const done = (s.propositions && s.propositions.length) || (s.background && s.background.length) || s.phrase;
    const reading = !done && s.frameId === activeId;
    return { text: s.question, state: done ? 'done' : reading ? 'reading' : 'queued' };
  });

  // The terms actually under research — the load-bearing DEF terms each frame is
  // reading against, unioned across the frame tree (root subject first, so the
  // headline terms lead), with the active frame's current terms flagged so the
  // panel can show what it is chasing right now. This is the "what is it looking
  // for" the run never used to name out loud.
  const activeTerms = new Set((activeFrame?.terms || []).map((t) => String(t).toLowerCase()));
  const terms = []; const seenTerm = new Set();
  for (const f of r.frames) for (const t of (f.terms || [])) {
    const k = String(t).toLowerCase();
    if (!k || seenTerm.has(k)) continue; seenTerm.add(k);
    terms.push({ text: t, active: activeTerms.has(k) });
  }

  // the source being read now (the newest pin), and what's been found so far
  const lastPin = r.pins.length ? r.pins[r.pins.length - 1] : null;
  const reading = (lastPin && badge !== 'settled') ? { title: pinName(lastPin), host: pinHost(lastPin), note: 'pulling quotes…' } : null;
  const findings = [];
  for (const p of r.propositions.slice(-6)) {
    const pin = r.pinById[p.pinId];
    findings.push({ text: clip(p.span.text, 96), host: pin ? pinName(pin) : '', icon: (p.corroboratedBy && p.corroboratedBy.length) ? '◆' : '▤', warn: false });
  }
  for (const v of r.voids.slice(-2)) findings.push({ text: `${v.term || v.terrain} — off-topic, set aside`, host: '', icon: '⚠', warn: true });

  const statusText = badge === 'settled' ? 'Converged — the picture is settled'
    : lastPin ? `Reading source ${r.pins.length}${r.reads.length ? ` · ${r.propositions.length} claims so far` : ''}`
    : (at ? describeEvent(log[at - 1]) : 'Planning the lines of inquiry…');

  return {
    cursor: at,
    framePanel, grid, coverage: coverageSummary(r), coverageNote: coverageNote(r), path, recMoments,
    // prototype fields
    query, settle, subs, terms: terms.slice(0, 16), reading, findings, statusText, phase: badge === 'settled' ? 'done' : 'live',
    // ── the going-and-looking loop, surfaced for the live panel ──────────────
    // What it's searching for and why (confirm vs. disprove), how many of the
    // searches went looking to be wrong, the stopping rule you can watch, what
    // was kept vs. thrown out, whether a disprove source changed the story, and
    // how many earlier answers the search has left needing a re-check.
    searchAudit: r.searchAudit,
    searches: r.searches.map((s) => ({ frameId: s.frameId, query: s.query, stance: s.stance, found: s.found, kept: s.kept })),
    stopRule: r.stopRule,
    documents: r.documents,
    storyChanges: r.storyChanges,
    recheck: r.recheck.length,
    // state A — the record is silent: nothing grounded, so the gap is the door.
    gap: (!r.propositions.length && (r.voids.length || (query && r.frames.length))) ? {
      question: query,
      note: r.voids.length ? 'The pinned sources are silent on this.' : 'Nothing grounded yet.',
    } : null,
    questions: r.questions.map(({ ask, answer }) => ({
      id: ask.id, trigger: ask.trigger, text: ask.text, options: ask.options,
      answered: !!answer, reply: answer?.reply ?? null,
    })),
    badge,
    counts: {
      pins: r.pins.length, reads: r.reads.length,
      propositions: r.propositions.length,
      promoted: r.propositions.filter((p) => p.promoted).length,
      recs: r.recs.length, voids: r.voids.length,
    },
    lastEvent: at ? describeEvent(log[at - 1]) : null,
  };
};

// A one-line narration of an event — for the feed. Reads the event, never
// invents; the live view is a rendering of the log, not a second truth. Each
// line names WHAT the event touched — the source, the span it read, the terms
// it reframed around — so a run of them reads as a research trail rather than a
// column of opaque hashes.
export const describeEvent = (e) => {
  if (!e) return '';
  switch (e.kind) {
    case RKIND.OPEN: return `frame opened — ${e.question}`;
    case RKIND.SEARCH: return `${e.stance === 'disprove' ? 'searched to disprove' : 'searched'} “${clip(e.query, 60)}” — ${e.kept} kept${e.found - e.kept > 0 ? `, ${e.found - e.kept} set aside` : ''}`;
    case RKIND.PIN: return describePin(e);
    case RKIND.READ: return e.span?.text
      ? `read “${clip(e.span.text)}” — binds ${e.bind?.overlap ?? '?'} frame term${e.bind?.overlap === 1 ? '' : 's'}`
      : `read a span (binds ${e.bind?.overlap ?? '?'} terms)`;
    case RKIND.EXTRACT: return `extracted: “${clip(e.span.text)}”`;
    case RKIND.EVA: return e.verdict === 'strain' ? `strain +${e.strainDelta} (sum ${e.strain})` : 'confirms the frame';
    case RKIND.CON: return `${e.relation}: ${e.a} ↔ ${e.b}`;
    case RKIND.REC: return `frame broke — reconceived around ${e.to.join(', ')}`;
    case RKIND.VOID: return `measured absence (${e.terrain}) — ${e.receipt}`;
    case RKIND.ASK: return `question (${e.trigger}): ${clip(e.text, 90)}`;
    case RKIND.ANSWER: return `answered: ${clip(e.reply, 90)}`;
    case RKIND.PROMOTE: return `${e.propId} enters the report`;
    case RKIND.PHRASE: return `phrased section — ${e.sentences.filter((s) => !s.glue).length}/${e.sentences.length} sentences bind`;
    default: return e.kind;
  }
};

// A pin narrated for a human: WHICH source, how big, and — the part the old
// line hid — WHY it landed where it did. An archive snapshot is the strong case
// (the citation can never rot). A LOCAL pin is the honest fallback, not a
// failure: the exact bytes are still fingerprinted and embedded, so the claim
// stands on the quote itself and the link was only ever corroboration. The two
// local cases read differently because they ARE different — archive.org
// unreachable vs. a pasted source that never had a URL — and both facts were
// already in the event, just never surfaced.
const describePin = (e) => {
  const name = sourceName(e);
  const size = e.chars ? ` · ${humanChars(e.chars)}` : '';
  if (e.snapshotUrl) return `pinned ${name} to archive.org @ ${shortStamp(e.capturedAt ?? e.snapshotId)}${size}`;
  const why = e.url
    ? 'archive.org didn’t answer, so the embedded quote is the record'
    : 'no URL to archive, so the pasted text is the record';
  return `embedded ${name} locally${size} — ${why}`;
};

// A readable label for a source: a prettified URL (a Wikipedia slug reads back
// as its title) beats a bare link; a human-given title beats a hash; a short
// hash is the last resort so a line is never empty.
const sourceName = (e) => {
  const viaUrl = e.url ? prettyUrl(e.url) : null;
  if (viaUrl) return `“${viaUrl}”`;
  const t = String(e.title || '').trim();
  if (t && !/^https?:\/\//i.test(t)) return `“${clip(t, 60)}”`;
  const viaTitle = prettyUrl(t);
  if (viaTitle) return `“${viaTitle}”`;
  return `a source (${String(e.contentHash || '').slice(0, 12)}…)`;
};

// A URL reduced to its readable core: the last path segment (decoded, de-
// underscored, de-suffixed) at its host — ".../wiki/Bottlenose_dolphin" →
// "Bottlenose dolphin · en.wikipedia.org". Null when the input is not a URL.
const prettyUrl = (u) => {
  try {
    const url = new URL(String(u));
    const host = url.hostname.replace(/^www\./, '');
    const seg = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_+]/g, ' ').trim();
    return seg ? `${seg} · ${host}` : host;
  } catch { return null; }
};

const humanChars = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M chars`
  : n >= 1e3 ? `${Math.round(n / 1e3)}k chars` : `${n} chars`;

const shortStamp = (s) => {
  const m = String(s ?? '').match(/(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s ?? '');
};

const clip = (s, n = 70) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
