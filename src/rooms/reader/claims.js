// EO: SEG·CON(Network,Link → Network,Entity, Dissecting,Binding) — the findings projection
// The findings projection (docs/search-and-pins.md): claims stop being chat by-products. Reading
// is full of claims — the machinery mints them everywhere — and this module is the one projection
// that reads every mint, so Findings (and search, and pins) see the whole record rather than the
// last few turns:
//
//   reading  — the source topline's closed inventory, composed the moment a source is recorded
//              (the refined projection of the reading's admitted propositions, telegram-first).
//   summary  — every entity topline's inventory, composed at ingest for the dominant figures and
//              on the reader's beat for the rest.
//   murmur   — the promoted connections (enactor/connect/promote.js): document-witnessed,
//              citation-carrying CON events stamped `connection`/`nominatedBy` — murmur POINTED,
//              the document witnessed. (Tier-1 echoes are band void and are NOT claims; they stay
//              marginalia by design and never appear here.)
//   turn     — what an answer asserted (msg.bound), with its fact-check verdicts.
//
// Each row carries its mint (`origin`) and the standing it arrived with, so the provenance banding
// is one field read, everywhere. Phrasing REUSES the topline's own mechanical telegram
// (weave/topline/phrase.js phraseMechanical) — this module never invents a phrasing discipline.
//
// Two joins here replace latent defects in the old derivation: the citation join is exact on the
// cite's index (the old substring test let 's12' match cite 1), and the contested join compares
// canon-folded sentences within the same message (the old exact-equality join compared against a
// claim string rebuilt from entity ids, so it essentially never fired).
//
// Pure and model-free: (messages, sources, docs, summaries) in, rows out. Runs in a unit test
// exactly as it does in the browser.

import { phraseMechanical } from '../../weave/topline/phrase.js';
import { webContentHash } from '../../organs/ingest/websource.js';
import { canon } from './anchor.js';

// The durable claim identity — content-addressed, never positional. A findings row id like C7 is
// regenerated per render and pins must never hold one; claimKey survives re-derivation because it
// is the claim's own words plus the place it stands on.
export const claimKey = (text, docId, unit) =>
  `clm-${webContentHash(`${canon(text)}|${docId ?? ''}:${Number.isInteger(unit) ? unit : ''}`)}`;

// Same claim, canon-folded — equality or containment either way. The verdict's sentence and the
// bound claim are two splits of the same answer text, so they can differ by a clause boundary.
export const sameClaim = (a, b) => {
  const x = canon(a), y = canon(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

const citeIdsOf = (citation) => (String(citation || '').match(/\d+/g) || []).map(Number);

const STANDING_STATUS = {
  witnessed: 'Witnessed', asserted: 'Witnessed', stated: 'Stated', contested: 'Contested',
};

// One topline inventory → claim rows. Only type:'claim' objects are claims — facts are counts,
// gaps are absences, inferences are ours; none of them may masquerade as the record's assertion.
const inventoryRows = (objects, { origin, sn, reg, docId, doc, subject }) => {
  const rows = [];
  for (const obj of objects || []) {
    if (!obj || obj.type !== 'claim') continue;
    const text = phraseMechanical(obj);
    if (!text) continue;
    const unit = Number.isInteger(obj.cite?.[0]) ? obj.cite[0] : null;
    const quote = (unit != null && doc?.sentences?.[unit]) ? String(doc.sentences[unit]).slice(0, 280) : '';
    rows.push({
      key: claimKey(text, docId, unit),
      origin, band: obj.standing || 'stated',
      status: STANDING_STATUS[obj.standing] || 'Stated',
      text, subject: subject || obj.fields?.subject || null,
      sn: sn ?? null, reg: reg ?? null, docId: docId ?? null, unit, quote,
      msgId: null,
    });
  }
  return rows;
};

// The reading mint — a source's own topline inventory (src.summary.objects).
export const readingClaims = (src, doc) =>
  inventoryRows(src?.summary?.objects, {
    origin: 'reading', sn: src?.sn, reg: src?.reg, docId: src?.docId, doc,
    subject: src?.title || null,
  });

// The summary mint — entity toplines, resolved to their lead source by the caller.
export const summaryClaims = (entitySummaries, docOf = () => null) => {
  const rows = [];
  for (const e of entitySummaries || []) {
    const sum = e?.summary;
    if (!sum) continue;
    rows.push(...inventoryRows(sum.objects, {
      origin: 'summary', sn: e.sn, reg: e.reg, docId: e.docId, doc: docOf(e.docId),
      subject: sum.label || null,
    }));
  }
  return rows;
};

// The murmur mint — promoted connections in a doc's own log. The document is the witness; the
// event carries its citation and its nomination, and the row says so.
export const murmurClaims = (src, doc) => {
  const rows = [];
  const events = doc?.log?.events || [];
  const labelOf = (id) => doc?.admission?.labelOf?.(id) || String(id ?? '');
  for (const e of events) {
    if (!e || e.op !== 'CON' || !e.connection) continue;
    const a = labelOf(e.src), b = labelOf(e.tgt);
    const text = e.via ? `${a} ${e.via} ${b}.` : `${a} — ${b}.`;
    const unit = Number.isInteger(e.sentIdx) ? e.sentIdx : null;
    rows.push({
      key: claimKey(text, src?.docId, unit),
      origin: 'murmur', band: 'promoted', status: 'Promoted',
      text, subject: e.echoes?.sharedLabel || a || null,
      sn: src?.sn ?? null, reg: src?.reg ?? null, docId: src?.docId ?? null,
      unit, quote: (unit != null && doc?.sentences?.[unit]) ? String(doc.sentences[unit]).slice(0, 280) : '',
      msgId: null,
    });
  }
  return rows;
};

// The turn mint — what answers asserted, with the two joins fixed. Returns rows plus the
// contradiction count the verdicts carry (a verdict can fire without a matching bound claim).
export const turnClaims = (messages) => {
  const rows = [];
  let contradictions = 0;
  for (const m of messages || []) {
    if (m.role !== 'assistant') continue;
    const mine = [];
    for (const b of m.bound || []) {
      if (!b.claim) continue;
      const ids = citeIdsOf(b.citation);
      const cite = ids.length ? (m.cites || []).find((c) => ids.includes(c.idx)) : null;
      const unit = cite ? (Number.isInteger(cite.unit) ? cite.unit : cite.idx) : null;
      const row = {
        key: claimKey(b.claim, cite?.docId, unit),
        origin: 'turn', band: b.citation ? 'cited' : 'uncited',
        status: b.citation ? 'Supported' : 'Uncited',
        text: b.claim, subject: null,
        sn: cite?.sn || null, reg: cite?.reg || null, docId: cite?.docId || null,
        unit, quote: cite?.text || '',
        msgId: m.id,
      };
      rows.push(row); mine.push(row);
    }
    for (const v of m.verdicts || []) {
      if (!/contradict/i.test(v.verdict)) continue;
      contradictions++;
      const hit = mine.find((r) => sameClaim(r.text, v.claim));
      if (hit) { hit.status = 'Contested'; hit.band = 'contested'; }
    }
  }
  return { rows, contradictions };
};

// The whole projection: every mint, merged and deduped by claimKey. First mint wins a duplicate
// (reading before summary before murmur before turn), except that a Contested duplicate upgrades
// the kept row — a contradiction is never hidden by dedup.
export const recordClaims = ({ messages = [], sources = [], docFor = () => null, entitySummaries = [] } = {}) => {
  const docs = new Map();
  const docOfSrc = (src) => {
    if (!src) return null;
    if (!docs.has(src.docId)) { try { docs.set(src.docId, docFor(src)); } catch { docs.set(src.docId, null); } }
    return docs.get(src.docId);
  };
  const docOfId = (docId) => {
    const src = (sources || []).find((s) => s.docId === docId);
    return src ? docOfSrc(src) : null;
  };
  const turns = turnClaims(messages);
  const all = [
    ...(sources || []).flatMap((s) => readingClaims(s, docOfSrc(s))),
    ...summaryClaims(entitySummaries, docOfId),
    ...(sources || []).flatMap((s) => murmurClaims(s, docOfSrc(s))),
    ...turns.rows,
  ];
  const byKey = new Map();
  for (const row of all) {
    const kept = byKey.get(row.key);
    if (!kept) { byKey.set(row.key, row); continue; }
    if (row.status === 'Contested' && kept.status !== 'Contested') { kept.status = 'Contested'; kept.band = 'contested'; }
  }
  const claims = [...byKey.values()];
  const contested = claims.filter((c) => c.status === 'Contested').length;
  return { claims, contradictions: Math.max(turns.contradictions, contested) };
};
