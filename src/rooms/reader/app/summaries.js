// EO — one section of the reader session controller (rooms/reader/app.js).
// FOLD SUMMARIES — the fold → summary pipeline (docs/fold-summary-pipeline.md), wired.
//
// The topline phrases the record's closed INVENTORY; this section hands the model the
// fold's READING — the packet summaryFold builds at any place and scope — and realizes
// it behind the referential gate, at a chosen DETAIL:
//
//   brief      one fast sentence from a small packet (≤64 decode tokens) — cheap enough
//              to ask at ANY place in the fold as the reader moves
//   standard   the 3-sentence default
//   paragraph  the ENTIRE work as one paragraph, never more — the packet's stops are
//              stratified across the document's own grain (arc coverage: the author's
//              chapters when it carries them), so a novel's summary spans opening → close
//
// Every ask is ONE one-shot prompt, budget-fitted to the smallest local window before
// the backend's blind context guard could ever cut the passages. The discipline is the
// pipeline's own: the deterministic telegram lands FIRST (stored at once, model-free),
// the model only refines it, and a decode that adds a name or number the packet never
// carried ships the telegram instead. A summary must never cost the caller its record.
import { surfFold, detectGrain } from '../../../surfer/index.js';
import { summaryFold, telegramSummary, realizeSummary, SUMMARY_DETAILS } from '../../../surfer/fold/index.js';
import { describeModel } from '../../../model/index.js';
import { nowIso } from './util.js';

// The packet sized to its tier: the brief voice reads a small packet (prefill is the
// cost the reader waits through on a CPU model); the paragraph voice reads a wide one
// (twelve spans across the arc — still inside the tier's input budget after the fit).
const PACKET_CAPS = Object.freeze({
  brief: Object.freeze({ maxSpans: 4, maxRelations: 3, maxProperties: 3, maxFigures: 4 }),
  standard: Object.freeze({ maxSpans: 8, maxRelations: 6, maxProperties: 6, maxFigures: 8 }),
  paragraph: Object.freeze({ maxSpans: 12, maxRelations: 8, maxProperties: 8, maxFigures: 8 }),
});

// The stored fold summaries are a bounded ring — cursor-scope keys churn as the reader
// moves, so the store keeps the freshest and lets the stale fall off rather than grow.
const FOLDS_CAP = 48;

export const installSummaries = (appCtx) => {
  const { emit, state } = appCtx;

  const normalize = (q = {}) => {
    const detail = SUMMARY_DETAILS[q.detail] ? q.detail : 'standard';
    const scope = ['full', 'cursor', 'entity', 'topic'].includes(q.scope) ? q.scope : 'full';
    return {
      sn: q.sn ?? null, scope, detail,
      cursor: scope === 'cursor' ? (q.cursor | 0) : null,
      entity: scope === 'entity' ? (q.entity || null) : null,
      topic: scope === 'topic' ? (q.topic || null) : null,
    };
  };
  const keyOf = (q) => `${q.sn}|${q.scope}|${q.cursor ?? ''}|${q.entity || ''}|${q.topic || ''}|${q.detail}`;

  const folds = () => (state.summaries.folds || (state.summaries.folds = {}));
  const store = (key, rec) => {
    const all = folds();
    all[key] = rec;
    const keys = Object.keys(all);
    if (keys.length > FOLDS_CAP) {
      keys.sort((a, b) => String(all[a].generatedAt || '').localeCompare(String(all[b].generatedAt || '')));
      for (const k of keys.slice(0, keys.length - FOLDS_CAP)) delete all[k];
    }
    appCtx.persist(); emit('sources');
  };

  // Read a stored fold summary back synchronously (the surface renders this; generation
  // is separate and never auto-kicked from here).
  const foldSummaryFor = (q = {}) => folds()[keyOf(normalize(q))] || null;

  // Generate (or refresh) a fold summary at any place, scope, and detail. The telegram
  // is stored the moment the packet exists; a loaded talker refines it in the same call.
  // Returns the stored record: { text, via, detail, scope, telegram, generatedAt, … }.
  const foldSummary = (q = {}) => {
    const norm = normalize(q);
    const key = keyOf(norm);
    const prev = folds()[key] || null;
    const upgrade = prev && prev.modelless && !!appCtx.model;   // a warm talker can now refine a telegram
    if (prev && !q.regenerate && !upgrade) return Promise.resolve(prev);
    return appCtx.guarded(`fold:${key}`, !!q.regenerate, async () => {
      const src = appCtx.sourceBySn(norm.sn);
      const doc = src ? appCtx.docFor(src) : null;
      if (!doc?.log) return prev;
      let packet = null;
      try {
        packet = summaryFold(doc, {
          surf: surfFold,
          grain: (d) => detectGrain(d, { grain: 'auto' }),
          scope: norm.scope, cursor: norm.cursor, entity: norm.entity, topic: norm.topic,
          title: src.title || null,
          coverage: norm.detail === 'paragraph' && norm.scope === 'full' ? 'arc' : 'peak',
          ...PACKET_CAPS[norm.detail],
        });
      } catch { packet = null; }
      if (!packet) return prev;
      const tier = SUMMARY_DETAILS[norm.detail];
      const base = {
        key, sn: norm.sn, scope: norm.scope, detail: norm.detail, coverage: packet.coverage,
        cursor: packet.cursor, entity: norm.entity, topic: norm.topic, sha: src.sha || null,
      };
      // Phase A — the deterministic floor, stored at once so the surface always has something.
      const telegram = telegramSummary(packet, { maxSentences: tier.maxSentences });
      store(key, { ...base, text: telegram, telegram, via: 'telegram', modelless: true, generatedAt: nowIso() });
      // Phase B — the model voice, behind the referential gate. Hold the fore-model count
      // so the at-rest murmur yields the decode gate to the summary the user is watching.
      if (appCtx.model) {
        state.foreModel = (state.foreModel || 0) + 1;
        try {
          const out = await realizeSummary(packet, {
            detail: norm.detail,
            phrase: (m, o) => appCtx.model.phrase(m, o),
            telegram: () => telegram,
          });
          store(key, {
            ...base, text: out.text, telegram, via: out.via,
            additions: out.additions && (out.additions.names?.length || out.additions.numbers?.length) ? out.additions : null,
            modelless: out.via !== 'model',
            model: describeModel(appCtx.model)?.label || describeModel(appCtx.model)?.backend || null,
            generatedAt: nowIso(),
          });
        } finally { state.foreModel = Math.max(0, (state.foreModel || 0) - 1); }
      }
      return folds()[key];
    });
  };

  Object.assign(appCtx, { foldSummary, foldSummaryFor });
};
