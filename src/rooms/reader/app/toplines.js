// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// auto-generated toplines — a summary for every source and every entity
import { projectGraph } from '../../../core/index.js';
import { describeModel } from '../../../model/index.js';
import { emitEot } from '../../../organs/ingest/index.js';
import { figureSurface, rankProperties } from '../../../perceiver/index.js';
import { generateTopline, definitionSpans, definitionCompetency, composeChorus, entityInventory, sourceInventory } from '../../../weave/topline/index.js';
import { groundSpans } from '../../../enactor/ground/index.js';
import { nowIso } from './util.js';

export const installToplines = (appCtx) => {
  const { emit, state } = appCtx;
  // ── auto-generated toplines — a summary for every source and every entity ──
  // docs/topline.md. A topline is an ordering and a phrasing of the CLOSED set of objects the
  // machinery already decided about a source or an entity — never a summary of the text, because
  // the model never sees the text, only the objects (claims with their citations and standing,
  // computed facts, at most one marked inference, and the gap if there is one). Generation runs in
  // two passes; the second, model-free CONTAINMENT check is the safety — the join may lose
  // information, never add it. It is model-OPTIONAL: the deterministic telegram is stored the moment
  // a source is recorded (there is a summary before any talker is warm), and a loaded talker only
  // refines the join in the background. Feedback STEERS the closed set (re-order, bound, suppress);
  // it can never add a fact the record does not carry — an out-of-record request is reported, not
  // fabricated (the same discipline as the void answerer).
  const TOPLINE_FIGURES = 6;

  // The source's reading, shaped for sourceInventory: its dominant figures' strongest standing
  // properties and incident bonds, its front matter, and its log tallies. Pure and model-free.
  const sourceReading = (src) => {
    const doc = appCtx.docFor(src);
    if (!doc?.log) return null;
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const bySight = new Map();                          // dominant figures by merged sighting mass
    for (const [id, ent] of g.entities || []) {
      const r = rep(id);
      const label = doc.admission?.labelOf?.(r) || ent.label || r;
      const cur = bySight.get(r);
      if (cur) cur.sightings += ent.sightings || 0;
      else bySight.set(r, { id: r, label, sightings: ent.sightings || 0 });
    }
    const topFigs = [...bySight.values()].sort((a, b) => b.sightings - a.sightings).slice(0, TOPLINE_FIGURES);
    const fs = figureSurface(doc, topFigs.map((f) => f.id));
    const claims = rankProperties(fs.defs).slice(0, 6).map((d) => ({
      subject: d.label, value: d.value, cite: d.witnesses, count: d.count, polarity: d.polarity, modality: d.modality,
    }));
    const relations = fs.relations.filter((r) => r.type).slice(0, 4).map((r) => ({  // typed (noun) bonds only
      subject: r.src.label, via: r.via, object: r.tgt.label, cite: [r.idx], polarity: r.polarity, kinship: true,
    }));
    const md = doc.metadata || {};
    let propositions = 0;
    try { propositions = emitEot(doc.log).lines.length; } catch { propositions = 0; }
    return {
      title: src.title, sn: src.sn,
      metadata: { author: md.author, date: md.date || md.published, publisher: md.publisher },
      claims, relations,
      figures: topFigs.map((f) => ({ label: f.label, count: f.sightings })),
      counts: { entities: g.entities?.size || 0, propositions, sentences: doc.sentences?.length || 0, bytes: src.bytes || 0 },
    };
  };

  // The one figure a source most CENTRES on — its dominant referent (the subject of a bio or an
  // article). Returns { docId, entId, label, sightings } for the top figure by merged sighting mass,
  // or null when no figure is named repeatedly enough to carry the whole source. A single-subject
  // document (a Wikipedia bio) surfaces this figure's dossier — its contextual reading, provenance
  // DAG and settled Wikipedia referent — in place of a machine telegram; a figure-less or evenly
  // diffuse document keeps its plain source summary. Pure and model-free (mirrors sourceReading's
  // dominance read, exposing the rep id the entity surfaces key on).
  const DOMINANT_FLOOR = 2;                              // named at least twice — not a one-off passer-by
  const sourceDominantEntity = (sn) => {
    const src = appCtx.sourceBySn(sn);
    const doc = src ? appCtx.docFor(src) : null;
    if (!doc?.log) return null;
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const bySight = new Map();
    for (const [id, ent] of g.entities || []) {
      const r = rep(id);
      const label = doc.admission?.labelOf?.(r) || ent.label || r;
      const cur = bySight.get(r);
      if (cur) cur.sightings += ent.sightings || 0;
      else bySight.set(r, { id: r, label, sightings: ent.sightings || 0 });
    }
    let top = null;
    for (const f of bySight.values()) if (!top || f.sightings > top.sightings) top = f;
    if (!top || !top.label || (top.sightings || 0) < DOMINANT_FLOOR) return null;
    return { docId: src.docId, entId: top.id, label: top.label, sightings: top.sightings };
  };

  // Compose (or refine) a topline over a closed inventory into the stored shape. `modelless` marks a
  // telegram-only topline a warm talker can later refine; `sha` lets a source topline invalidate if
  // its content ever moves. Never throws — a summary must never cost the caller its record.
  const composeTopline = async (inv, { steer = null, useModel = false } = {}) => {
    const m = useModel ? appCtx.model : null;
    let top;
    try { top = await generateTopline({ inventory: inv, steer, model: m }); }
    catch { top = await generateTopline({ inventory: inv, steer, model: null }); }
    return {
      text: top.text, telegram: top.telegram, joined: top.joined, kind: top.kind,
      objects: top.objects, cites: top.cites, unmet: top.unmet,
      modelless: !m, generatedAt: nowIso(),
      model: m ? (describeModel(m)?.label || describeModel(m)?.backend || null) : null,
    };
  };

  // In-flight guard so an auto-gen kick and a surface open never race to double-generate one subject.
  const _summaryInFlight = new Map();
  const guarded = (key, regenerate, run) => {
    if (_summaryInFlight.has(key) && !regenerate) return _summaryInFlight.get(key);
    const p = Promise.resolve().then(run).finally(() => { if (_summaryInFlight.get(key) === p) _summaryInFlight.delete(key); });
    _summaryInFlight.set(key, p);
    return p;
  };

  // The two-phase store: phase A writes the deterministic telegram at once (so the surface always has
  // something); phase B refines the join with the loaded talker, if any. `write` persists each phase.
  const composeTwoPhase = async (inv, prev, write, { useModel = true } = {}) => {
    const steer = prev?.steer || null;
    const feedback = prev?.feedback || [];
    if (!prev || prev.regenerate) {
      const tele = await composeTopline(inv, { steer, useModel: false });
      write({ ...tele, steer, feedback });
    }
    if (appCtx.model && useModel) {
      const full = await composeTopline(inv, { steer, useModel: true });
      write({ ...full, steer, feedback });
    }
  };

  const sourceSummaryOf = (snId) => appCtx.sourceBySn(snId)?.summary || null;

  // Generate/refresh a source topline. Returns the stored summary; stores on src.summary and emits.
  const sourceSummary = (snId, { regenerate = false } = {}) => guarded(`s:${snId}`, regenerate, async () => {
    const src = appCtx.sourceBySn(snId);
    if (!src) return null;
    const prev = src.summary || null;
    const upgrade = prev && prev.modelless && !!appCtx.model;           // a warm talker can now refine a telegram
    if (prev && !regenerate && !upgrade) return prev;
    const reading = sourceReading(src);
    if (!reading) return prev;
    const inv = sourceInventory(reading);
    await composeTwoPhase(inv, prev ? { ...prev, regenerate } : { regenerate: true }, (s) => {
      src.summary = { ...s, sha: src.sha }; appCtx.persist(); emit('sources');
    });
    return src.summary;
  });

  const entitySummaryFor = (label) => state.summaries.entities[appCtx.entityKey(label)] || null;

  // Generate/refresh an entity topline, keyed by the merged label the explorer groups by. Returns
  // the stored summary; stores in state.summaries.entities and emits.
  const entitySummary = (docId, entId, { regenerate = false, telegramOnly = false } = {}) => guarded(`e:${docId}#${entId}`, regenerate, async () => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return null;
    const key = appCtx.entityKey(profile.label);
    const prev = state.summaries.entities[key] || null;
    // A telegram-only kick (the auto-gen on record) never upgrades or re-runs a summary that already
    // stands — it only fills an empty slot, so it costs no model and never contends with a panel open.
    const upgrade = prev && prev.modelless && !!appCtx.model && !telegramOnly;
    if (prev && !regenerate && !upgrade) return prev;
    const inv = entityInventory(profile, { mentionCount: profile.mentionCount ?? profile.mentions.length, sourceCount: profile.sourceCount || 1 });
    // When a model is loaded a written reading (the contextual definition) is coming a beat behind
    // this telegram — so mark the telegram as `contextualPending`. The surface holds the panel on
    // "composing…" rather than flashing the machine telegram and swapping it for the reading; it is
    // cleared the moment the reading lands below. With no model, nothing more is coming, so the flag
    // stays false and the telegram is shown at once.
    await composeTwoPhase(inv, prev ? { ...prev, regenerate } : { regenerate: true }, (s) => {
      state.summaries.entities[key] = { ...s, key, label: profile.label, docId, entId, contextualPending: !!appCtx.model && !telegramOnly }; appCtx.persist(); emit('sources');
    }, { useModel: !telegramOnly });
    // The fold-aware contextual definition — a model-WRITTEN companion to the telegram, framed by
    // the document in hand (its title, and the figures it most centres on beside this one). It is
    // safe to let the model write here because the entity panel flanks it: the settled Wikipedia
    // referent leads above it and the provenance DAG receipts it below (docs/topline.md).
    //
    // It is produced by a CHORUS of definer strategies under selection (weave/topline/chorus.js): the
    // reigning champion (and, on an exploration beat, a challenger) each write a candidate; each is
    // graded with NO human in the loop — grounding coverage (does it fabricate) × fold-salience (does
    // it speak to this reading), anchored by predictive COMPETENCY (does it predict the entity's
    // held-out mentions, the parrot-killer). The fittest is shown; a challenger that wins by a margin
    // becomes the new champion, so the system gets better — and, as the champion stabilises, cheaper
    // — at defining, especially similar things.
    const cur0 = state.summaries.entities[key];
    if (appCtx.model && !telegramOnly && cur0 && (regenerate || !cur0.contextual)) {
      const themes = [...(profile.figures || [])]
        .filter((f) => f.entId !== entId && f.label && f.label !== profile.label)
        .sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 4).map((f) => f.label);
      const fold = { title: profile.sourceTitle || '', themes };
      const src = appCtx.sourceBySn(profile.sn);
      const doc = src ? appCtx.docFor(src) : null;
      const passages = (profile.mentions || []).map((m2) => ({ u: profile.sn, idx: m2.idx, text: m2.text }));
      const mentionTexts = (profile.mentions || []).map((m2) => m2.text).filter(Boolean);
      const factTexts = (cur0.objects || []).map((o) => o.text).filter(Boolean);
      // The wiki referent as the un-authored fitness ANCHOR — but only if it is already resolved in
      // the cache (a plain confirmed def, not a still-pending promise). Never kick a fetch from here:
      // the anchor is optional (definer.js falls back to competency alone), and the panel's own
      // _ensureWiki owns the lookup. Reading a settled value costs nothing and adds no network.
      let wikiText = null;
      try {
        const cached = appCtx.wikiCache.get(`${docId}#${entId}`);
        if (cached && typeof cached.then !== 'function' && cached.confirmed && cached.text) wikiText = cached.text;
      } catch { wikiText = null; }

      // Ground each candidate span-by-span (nothing rejected; every span anchored to a mention/doc
      // or flagged as the model's own word — enactor/ground/spans.js) and grade its held-out
      // competency. The winner keeps its spans for the surface to render the flags.
      let winnerSpans = [];
      const grade = async (text) => {
        let spans = [];
        try {
          spans = groundSpans(definitionSpans(text), { passages, doc }).map((v) => ({
            text: v.text, grounded: v.kind === 'source',
            role: v.kind === 'source' ? 'source' : (v.role || 'assertion'),
            cite: v.source && Number.isInteger(v.source.idx) ? v.source.idx : null,
          }));
        } catch { spans = []; }
        const coverage = spans.length ? spans.filter((s) => s.grounded).length / spans.length : 0;
        const competency = definitionCompetency(text, { seen: factTexts, heldOut: mentionTexts });
        grade._spansByText = grade._spansByText || new Map();
        grade._spansByText.set(text, spans);
        return { coverage, competency };
      };

      const defs = state.summaries.definer || (state.summaries.definer = { champion: null, runs: 0 });
      // A failed chorus must never strand the panel on "composing…" — swallow it and fall through to
      // the pending clear below, which reveals the telegram already in hand.
      let chorus = null;
      try {
        chorus = await composeChorus(
          { label: profile.label, telegram: cur0.text, objects: cur0.objects || [], fold, wikiText },
          { model: appCtx.model, champion: defs.champion, runs: defs.runs || 0, grade },
        );
      } catch { chorus = null; }
      const winner = chorus && chorus.winner;
      winnerSpans = (winner && grade._spansByText && grade._spansByText.get(winner.text)) || [];

      // Carry the champion forward (heritability) and count the run (drives the explore beat).
      defs.champion = (chorus && chorus.champion) || defs.champion;
      defs.runs = (defs.runs || 0) + 1;

      const cur = state.summaries.entities[key];
      if (cur && winner) {
        state.summaries.entities[key] = {
          ...cur, contextual: winner.text, contextualWritten: !!winner.written,
          contextualSpans: winnerSpans, contextualPending: false,
          contextualCoverage: winner.fitness?.terms?.coverage ?? 0,
          contextualFitness: winner.fitness?.score ?? 0,
          contextualStrategy: winner.strategy, fold,
        };
        appCtx.persist(); emit('sources');
      }
    }
    // Never leave the panel stranded on "composing…": if the reading never landed (no winner, or the
    // chorus threw before storing), drop the pending flag so the telegram it already holds is shown.
    const done = state.summaries.entities[key];
    if (done && done.contextualPending) {
      state.summaries.entities[key] = { ...done, contextualPending: false }; appCtx.persist(); emit('sources');
    }
    return state.summaries.entities[key];
  });

  // Auto-compose the toplines of a source's dominant figures the moment it is recorded — the entity
  // half of "a summary for every source and every entity" (docs/topline.md). Telegram-only and
  // fire-and-forget: the deterministic, containment-checked one-liner lands with no model and no
  // network, so entity panels open with a real summary instead of "nothing found yet", and a turn can
  // fold these figures' summaries into its prompt. A loaded talker still refines each on panel-open
  // (the modelless-upgrade path). Capped at the top figures by sighting mass, mirroring sourceReading.
  const autoEntitySummaries = (src) => {
    try {
      const doc = src ? appCtx.docFor(src) : null;
      if (!doc?.log) return;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      const bySight = new Map();
      for (const [id, ent] of g.entities || []) {
        const r = rep(id);
        const cur = bySight.get(r);
        if (cur) cur.sightings += ent.sightings || 0;
        else bySight.set(r, { id: r, sightings: ent.sightings || 0 });
      }
      const top = [...bySight.values()].sort((a, b) => b.sightings - a.sightings).slice(0, TOPLINE_FIGURES);
      for (const f of top) entitySummary(src.docId, f.id, { telegramOnly: true }).catch(() => {});
    } catch { /* a summary must never cost the record */ }
  };

  // The entity toplines as a label → text map, for feeding a turn (turn/stages.js composeFoldSummary
  // folds in the ones the turn centres on). Reads the standing store; never generates.
  const entitySummaryMap = () => {
    const out = {};
    for (const e of Object.values(state.summaries.entities || {}))
      if (e && e.label && e.text) out[e.label] = e.text;
    return out;
  };

  Object.assign(appCtx, { autoEntitySummaries, entitySummary, entitySummaryFor, entitySummaryMap, guarded, sourceDominantEntity, sourceSummary, sourceSummaryOf });
};
