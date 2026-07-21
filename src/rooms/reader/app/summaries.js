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
// richSurf, not bare surfFold: the full-power surf (significance column + multi-level chorus).
// A safe drop-in — byte-identical on a single-source doc — but when the reading doc is a
// COMPOSITE (a multi-file source, a video's motion+transcript), the chorus reads the relevant
// sub-document and drops the rest, instead of the single-ride surf drifting into one neighbourhood.
import { richSurf, detectGrain, sentenceIndexOfText } from '../../../surfer/index.js';
import { summaryFold, telegramSummary, realizeSummary, SUMMARY_DETAILS } from '../../../surfer/fold/index.js';
import { documentFieldAt } from '../../../enactor/factcheck/index.js';
import { groundText } from '../../../enactor/ground/index.js';
import { describeModel } from '../../../model/index.js';
import { nowIso } from './util.js';

// The grounding a fold summary stands on — the SAME span-provenance the answer path runs.
// The packet's witnessed spans ARE the read passages ({ u, idx, text } — the jumpable
// "where"); the doc gives the propositional, coref-intact witness. A referentially-clean
// draft that nonetheless traces to nothing read grounds to the void, and realizeSummary
// ships the telegram floor instead of the model's own recollection.
const groundFold = (doc, packet) => (text) => groundText(text, {
  passages: (packet.spans || []).map((s) => ({ u: packet.docId, idx: s.idx, text: s.text })),
  doc,
});

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
    const scope = ['full', 'cursor', 'entity', 'topic', 'range'].includes(q.scope) ? q.scope : 'full';
    // excludeEntities rides EVERY scope (not range-only — excluding a figure from a full-document
    // reading is just as sensible), normalized once here so a caller's array order never fragments
    // the cache key or the packet's own filter (surfer/fold/summary.js lowercases on its own end).
    const excludeEntities = Array.isArray(q.excludeEntities) && q.excludeEntities.length
      ? [...new Set(q.excludeEntities.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))].sort()
      : null;
    return {
      sn: q.sn ?? null, scope, detail, excludeEntities,
      cursor: scope === 'cursor' ? (q.cursor | 0) : null,
      entity: scope === 'entity' ? (q.entity || null) : null,
      topic: scope === 'topic' ? (q.topic || null) : null,
      // range — an in-point/out-point on the reader's own axis (a waveform selection resolved to
      // sentence indices, or any bounded window a caller already knows). `to` defaults to `from`
      // (a single-sentence range) rather than the whole document, so a caller can never accidentally
      // widen the ask by omitting it.
      from: scope === 'range' ? (q.from | 0) : null,
      to: scope === 'range' ? (Number.isFinite(q.to) ? (q.to | 0) : (q.from | 0)) : null,
    };
  };
  const keyOf = (q) => `${q.sn}|${q.scope}|${q.cursor ?? ''}|${q.entity || ''}|${q.topic || ''}|${q.from ?? ''}|${q.to ?? ''}|${(q.excludeEntities || []).join(',')}|${q.detail}`;

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
          surf: richSurf,
          grain: (d) => detectGrain(d, { grain: 'auto' }),
          scope: norm.scope, cursor: norm.cursor, entity: norm.entity, topic: norm.topic,
          from: norm.from, to: norm.to, excludeEntities: norm.excludeEntities,
          title: src.title || null,
          coverage: norm.detail === 'paragraph' && norm.scope === 'full' ? 'arc' : 'peak',
          ...PACKET_CAPS[norm.detail],
        });
      } catch { packet = null; }
      if (!packet) return prev;
      const tier = SUMMARY_DETAILS[norm.detail];
      const base = {
        key, sn: norm.sn, scope: norm.scope, detail: norm.detail, coverage: packet.coverage,
        cursor: packet.cursor, entity: norm.entity, topic: norm.topic, range: packet.range,
        excludeEntities: norm.excludeEntities, sha: src.sha || null,
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
            ground: groundFold(doc, packet),
          });
          store(key, {
            ...base, text: out.text, telegram, via: out.via,
            additions: out.additions && (out.additions.names?.length || out.additions.numbers?.length) ? out.additions : null,
            // The grounding badge for the shipped voice — source/void span tally + the
            // support kind — so the surface can say whether the summary stands on the record.
            // `verdicts` rides along too (groundText's per-SENTENCE read, ground/spans.js
            // groundSpans): text + which source line it came from, so a surface can render
            // the summary sentence by sentence and let the reader jump to exactly where each
            // one came from — only ever present when text===out.text (the 'model' via; a
            // gate/ground rejection ships the telegram, which these verdicts were never read against).
            ground: out.ground ? { kind: out.ground.kind, supported: out.ground.supported, source: out.ground.source, claims: out.ground.claims, verdicts: out.ground.verdicts || null } : null,
            modelless: out.via !== 'model',
            model: describeModel(appCtx.model)?.label || describeModel(appCtx.model)?.backend || null,
            generatedAt: nowIso(),
          });
        } finally { state.foreModel = Math.max(0, (state.foreModel || 0) - 1); }
      }
      return folds()[key];
    });
  };

  // ── TEMPORARY — the fold at a cursor, made visible ──────────────────────────────────────────
  // Reads Entity-terrain referent labels + Binding-stance salience (documentFieldAt) — a
  // deliberate REC widening of this file's own eo-contract.js entry, not a silent one.
  // foldSummary REALIZES the fold as prose; this exposes the fold's own READING, unrealized, so a
  // surface can SEE what the engine is reading at a place rather than only its summary. Two channels
  // the prose deliberately drops:
  //   · objects — the referents the engine holds in focus at the cursor (documentFieldAt: the
  //               γ-salience field over the page's own mention positions), most salient first. This
  //               is the "objects at the cursor" the summary never names.
  //   · reading — the ASSERTIONS the fold has made there: the settled bonds, the held-open tensions,
  //               the located turns, the ranked standing properties, the strongest relations. These
  //               are the reading — NOT the verbatim spans (which are carried alongside, distinct):
  //               a summary drawn from spans alone shows the prose, never what the system claims of it.
  // Synchronous and model-free — a peek, not a summary. Nothing is stored (the caller renders it and
  // lets it churn as the reader moves). The cursor is an explicit sentence index, or resolved from the
  // block under the reader's eye (visibleText), exactly as co-reading resolves its position.
  const cursorFold = ({ sn = null, cursor = null, visibleText = null, after = 0, maxObjects = 6 } = {}) => {
    const src = appCtx.sourceBySn(sn);
    const doc = src ? appCtx.docFor(src) : null;
    if (!doc?.log) return null;
    const sents = doc.units || doc.sentences || [];
    if (!sents.length) return null;
    let at = Number.isInteger(cursor) ? cursor
      : (visibleText ? sentenceIndexOfText(doc, visibleText, { from: after | 0 }) : -1);
    if (!Number.isInteger(at) || at < 0) return null;
    at = Math.max(0, Math.min(sents.length - 1, at));

    let packet = null;
    try {
      packet = summaryFold(doc, {
        surf: richSurf, scope: 'cursor', cursor: at,
        title: src.title || null, ...PACKET_CAPS.brief,
      });
    } catch { packet = null; }
    if (!packet) return null;

    // The objects the reading is ABOUT at this place — the salience field, labelled (never ids in
    // the display; the referent id is the fallback only when the page carries no label for it).
    const labelOf = (id) => doc.admission?.labelOf?.(id) || id;
    const objects = documentFieldAt(doc, at).slice(0, maxObjects)
      .map(({ id, w }) => ({ label: String(labelOf(id) || '').trim(), weight: Math.round(w * 1000) / 1000 }))
      .filter((o) => o.label);

    const g = packet.groups || {};
    return Object.freeze({
      sn, cursor: at, peak: packet.cursor,
      sentence: String(sents[at] ?? '').trim(),
      objects,
      reading: Object.freeze({
        settled: (g.settled || []).slice(),
        heldOpen: (g.heldOpen || []).slice(),
        turns: (g.turns || []).slice(),
        properties: (packet.properties || []).map(({ label, value, count }) => ({ label, value, count })),
        relations: (packet.relations || []).map(({ subject, verb, object, polarity }) => ({ subject, verb, object, polarity })),
        figures: (packet.figures || []).slice(),
      }),
      spans: (packet.spans || []).slice(),
      telegram: telegramSummary(packet, { maxSentences: SUMMARY_DETAILS.brief.maxSentences }),
    });
  };

  // sentenceAtTime — a waveform TIME (seconds) resolved to the sentence index a 'range' scope
  // ask wants (doc.utteranceAt, ingestAudio's own time→utterance lookup; null on a non-audio
  // doc or a doc that carries no timing). The UI reads an in/out point off the waveform click
  // fraction × duration; this is the one place that becomes a sentence index, so the waveform
  // and the fold never have to agree on anything beyond "seconds since the clip started".
  const sentenceAtTime = (sn, t) => {
    const src = appCtx.sourceBySn(sn);
    const doc = src ? appCtx.docFor(src) : null;
    if (!doc || typeof doc.utteranceAt !== 'function') return null;
    const at = doc.utteranceAt(Math.max(0, Number(t) || 0));
    return at >= 0 ? at : null;
  };

  Object.assign(appCtx, { foldSummary, foldSummaryFor, cursorFold, sentenceAtTime });
};
