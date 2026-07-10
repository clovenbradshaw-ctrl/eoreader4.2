// EO: SIG·EVA·SEG(Network,Field → Lens,Atmosphere, Tending·Binding·Tracing·Dissecting) — the audit
// metabolism/audit.js — make the evolution FULLY AUDITABLE: a complete, inspectable, exportable
// record of a run, and an honest evaluation of what it actually did.
//
// The metabolism already keeps an append-only record — beats (per-period), lineage (every genome
// edit), and an optional hash-chained provenance (persist.js). This module PROJECTS all of it into
// one audit artifact you can read, download, and check: the timeline, the lineage, the challenges a
// simulated user posed and how it scored them, the constitution (what could and could not evolve),
// and the tamper-evidence of the provenance chain. Nothing here is a new fact — it is the log made
// legible, the same discipline the reading side runs (a projection over an append-only log).
//
// It also EVALUATES, because a dump is not an audit. The summary states, in plain words, whether the
// evolution did anything (edits, structural growth), whether its fitness is anchored or merely self-
// reported (the Goodhart honesty flag, carried through), how the body moved, and it raises pathology
// FLAGS a reader should not have to hunt for: an inert run, an all-provisional run, a collapsed or
// monoculture population. Pure — no Date, no I/O; the caller stamps `at` and writes the bytes.

const round = (x) => (Number.isFinite(+x) ? Math.round(+x * 1000) / 1000 : 0);
const mean = (xs) => (xs.length ? round(xs.reduce((s, v) => s + (+v || 0), 0) / xs.length) : 0);
const organCount = (genotype) => (genotype && genotype.soma && Array.isArray(genotype.soma.organs) ? genotype.soma.organs.length : null);
const species = (genotype) => (genotype && genotype.soma && Array.isArray(genotype.soma.organs))
  ? genotype.soma.organs.filter((o) => o.origin !== 'founder').map((o) => o.kind) : [];

// buildAudit — project a metabolism (+ any challenge cycles) into the full audit record. `meta`
// carries the run's world (regime/ration) and `at` (a caller-stamped timestamp — the engine holds
// no clock). `challenges` are the runChallengeCycle records, when Claude was in the loop.
export const buildAudit = ({ metabolism, challenges = [], meta = {} } = {}) => {
  const beats = typeof metabolism?.beats === 'function' ? metabolism.beats() : [];
  const lineage = typeof metabolism?.lineage === 'function' ? metabolism.lineage() : [];
  const vitals = typeof metabolism?.vitals === 'function' ? metabolism.vitals() : {};
  const cond = vitals.condition || (typeof metabolism?.condition === 'function' ? metabolism.condition() : {}) || {};

  // ── the timeline: one row per beat (period, season, the ratios, the body, the event) ──
  const timeline = beats.map((b) => Object.freeze({
    seq: b.seq, period: b.period, season: b.season?.name ?? null, mult: b.season?.mult ?? null,
    ran: b.ran, fitness: b.fitness, quality: b.quality, energy: b.energy,
    provisional: b.provisional, viable: b.viable, starved: b.starved,
    organs: organCount(b.champion), event: b.event ? (b.event.note || b.event.kind || null) : null,
    persisted: b.persisted ? b.persisted.hash : null,
  }));

  // ── the edit ledger: split the lineage into what actually moved ──
  const edits = lineage.filter(Boolean);
  const structural = edits.filter((e) => e.structural || e.level === 'organ' || /organ|body|grow|prune|fuse/i.test(e.note || ''));
  const promotions = edits.filter((e) => e.kind === 'promote' || e.kind === 'inherit');
  const culls = edits.filter((e) => e.kind === 'cull' || e.kind === 'prune');

  // ── fitness trend: early vs late, so a reader sees direction, not just a final number ──
  const fits = timeline.map((t) => t.fitness).filter((x) => Number.isFinite(x));
  const head = fits.slice(0, Math.max(1, Math.floor(fits.length / 4)));
  const tail = fits.slice(-Math.max(1, Math.floor(fits.length / 4)));
  const fitness = { start: mean(head), end: mean(tail), mean: mean(fits), trend: round(mean(tail) - mean(head)) };

  // ── the body's trajectory ──
  const organTrail = timeline.map((t) => t.organs).filter((n) => n != null);
  const soma = vitals.soma || null;
  const body = soma ? {
    founding: organTrail.length ? organTrail[0] : soma.count,
    final: soma.count, peak: organTrail.length ? Math.max(...organTrail) : soma.count,
    upkeep: soma.upkeep, desert: vitals.desert ?? null, species: species(vitals.champion),
  } : null;

  // ── the challenges Claude posed, and how it scored them (grounded/flowing, not truth) ──
  const chs = (challenges || []).filter(Boolean);
  const sat = chs.map((c) => c.satisfaction).filter(Boolean);
  const challengeSummary = chs.length ? {
    n: chs.length,
    meanGrounded: mean(sat.map((s) => s.grounded).filter((x) => x != null)),
    meanFlowing: mean(sat.map((s) => s.flowing).filter((x) => x != null)),
    meanSatisfied: mean(sat.map((s) => s.satisfied)),
    resolvedRate: sat.length ? round(sat.filter((s) => s.resolved).length / sat.length) : 0,
  } : null;

  // ── the through-line's governance ledger (sanction.js / homeostat.js), when wired: every graduated
  //    sanction, controlled death, and homeostat band-transition — so selection is auditable, not silent ──
  const popEvents = typeof metabolism?.population?.events === 'function' ? metabolism.population.events() : [];
  const sanctions = popEvents.filter((e) => e.kind === 'sanction');
  const deaths = popEvents.filter((e) => e.kind === 'death');
  const homeostatEvents = popEvents.filter((e) => e.kind === 'homeostat');
  const governance = popEvents.length ? {
    sanctions: { n: sanctions.length, forgiven: sanctions.filter((e) => e.action === 'forgive').length,
      culls: sanctions.filter((e) => e.rung === 'cull').length, shed: sanctions.filter((e) => e.rung === 'shed').length },
    deaths: { n: deaths.length, energyReturned: round(deaths.reduce((s, e) => s + (e.returned || 0), 0)),
      organsReleased: deaths.reduce((s, e) => s + (e.released || 0), 0), byCause: countBy(deaths, (e) => e.cause) },
    homeostat: { bands: [...new Set(homeostatEvents.map((e) => e.band))], transitions: homeostatEvents.length },
  } : null;

  // ── the provenance chain (persist.js), when armed: the tamper-evidence of the DNA record ──
  const chain = vitals.chain || null;

  // ── FINDINGS: the plain-words evaluation + the pathology flags a reader shouldn't hunt for ──
  const findings = [];
  const flags = [];
  if (!edits.length) { findings.push('INERT: no genome edits — the metabolism ran but nothing was selected (plenty is inert by design; impose scarcity to evolve).'); flags.push('inert'); }
  else findings.push(`${edits.length} genome edit${edits.length === 1 ? '' : 's'} — ${promotions.length} carried forward, ${structural.length} structural (the body plan${structural.length ? ' is' : ' is not'} under selection).`);
  if (fits.length >= 4) findings.push(`Fitness ${fitness.trend >= 0 ? 'rose' : 'fell'} ${Math.abs(fitness.trend)} (${fitness.start} → ${fitness.end}), mean ${fitness.mean}.`);
  const provisionalRate = timeline.length ? round(timeline.filter((t) => t.provisional).length / timeline.length) : 1;
  if (provisionalRate > 0.5) { findings.push(`PROVISIONAL: ${Math.round(provisionalRate * 100)}% of beats had no un-authored anchor — treat fitness as self-reported (wire the judge or Claude-as-user to anchor it).`); flags.push('provisional'); }
  else findings.push(`Anchored: fitness rested on an un-authored signal (${round(cond.anchorRate ?? (1 - provisionalRate))} anchor rate).`);
  if (body) findings.push(`Body: ${body.founding} → ${body.final} organs (peak ${body.peak})${body.species.length ? `, grew ${[...new Set(body.species)].join(', ')}` : ', no new organs kept'}.`);
  if (cond.humanRate > 0) findings.push(`Human interaction evolved ${Math.round(cond.humanRate * 100)}% of the recent record.`);
  if (cond.voidRespect > 0) findings.push(`Void-respect (held threads that later bound) earning ${round(cond.voidRespect)} recently; exchange rate ${round(cond.voidValue ?? 0)} (${Math.round((cond.signalRate ?? 0) * 100)}% measured signal).`);
  if (challengeSummary) findings.push(`Claude posed ${challengeSummary.n} challenge${challengeSummary.n === 1 ? '' : 's'}; grounded ${challengeSummary.meanGrounded}, flowing ${challengeSummary.meanFlowing}, resolved ${Math.round(challengeSummary.resolvedRate * 100)}%.`);
  if (vitals.ecology) {
    if (vitals.ecology.size <= 1) { findings.push('COLLAPSE: the population fell to one lineage.'); flags.push('collapse'); }
    if ((vitals.ecology.diversity ?? 1) < 0.02) { findings.push('MONOCULTURE: gene-pool diversity ≈ 0 — the population converged to one strategy (de-differentiation / mode collapse).'); flags.push('monoculture'); }
  }
  if (governance) {
    findings.push(`Selection was graduated, not binary: ${governance.sanctions.n} sanction transition${governance.sanctions.n === 1 ? '' : 's'} (${governance.sanctions.forgiven} forgiven — paths back to ok), ${governance.deaths.n} controlled death${governance.deaths.n === 1 ? '' : 's'} releasing ${governance.deaths.organsReleased} organ${governance.deaths.organsReleased === 1 ? '' : 's'} as standing variation.`);
    if (governance.homeostat.bands.length) findings.push(`Homeostat governed diversity across bands: ${governance.homeostat.bands.join(', ')}${governance.homeostat.bands.includes('freezing') ? ' (relaxed selection when freezing toward monoculture)' : ''}.`);
  }
  if (chain) findings.push(`Provenance chain: ${chain.length} block${chain.length === 1 ? '' : 's'}, ${chain.intact ? 'intact (verifies)' : 'BROKEN — tamper detected'}.`);

  return Object.freeze({
    kind: 'evolution-audit', version: 1,
    meta: Object.freeze({ at: meta.at ?? null, regime: meta.regime ?? vitals.season?.regime ?? null, ration: meta.ration ?? null, ...meta }),
    summary: Object.freeze({
      periods: vitals.season?.period ?? beats.length,
      beatsCaptured: beats.length,
      beatsWindowed: beats.length >= 512,   // the beat buffer caps at 512; older beats rolled off
      edits: { total: edits.length, structural: structural.length, promotions: promotions.length, culls: culls.length },
      fitness, honesty: { anchorRate: round(cond.anchorRate ?? 0), provisionalRate, humanRate: round(cond.humanRate ?? 0) },
      voidRespect: { recent: round(cond.voidRespect ?? 0), boundLater: cond.boundLater ?? 0, exchangeRate: round(cond.voidValue ?? 0), signalRate: round(cond.signalRate ?? 0) },
      body, ecology: vitals.ecology || null, provenance: chain, governance,
      challenges: challengeSummary,
      champion: { notation: vitals.championNotation ?? null, genotype: vitals.champion ?? null },
      findings: Object.freeze(findings), flags: Object.freeze(flags),
    }),
    lineage: Object.freeze(edits),
    timeline: Object.freeze(timeline),
    challenges: Object.freeze(chs.map((c) => Object.freeze({
      question: c.question, intent: c.intent, difficulty: c.difficulty,
      answer: (c.answer || '').slice(0, 2000),
      sources: summarizeSources(c.sources),
      satisfaction: c.satisfaction || null,
    }))),
    constitution: vitals.constitution || null,
    // the through-line ledger, whole (capped) — every sanction, death, and homeostat transition.
    governanceLedger: Object.freeze(popEvents.slice(-200).map((e) => Object.freeze({ ...e }))),
  });
};

const countBy = (xs, key) => { const m = {}; for (const x of xs) { const k = key(x) || 'other'; m[k] = (m[k] || 0) + 1; } return m; };

export const auditToJSON = (audit) => JSON.stringify(audit, null, 2);

// auditToMarkdown — the human-readable evaluation: the findings first (what happened, honestly), then
// the lineage and the challenges as tables, then the timeline tail. What a reader opens to JUDGE a run.
export const auditToMarkdown = (audit) => {
  const s = audit.summary;
  const L = [];
  L.push('# Evolution audit');
  L.push(`_${audit.meta.at || 'unstamped'} · regime ${audit.meta.regime || '?'}${audit.meta.ration ? ` · ration ${audit.meta.ration}` : ''} · ${s.periods} periods_\n`);
  L.push('## Findings');
  for (const f of s.findings) L.push(`- ${f}`);
  if (s.flags.length) L.push(`\n> ⚠ flags: **${s.flags.join(', ')}**`);
  L.push('\n## Summary');
  L.push(`- **edits**: ${s.edits.total} (${s.edits.structural} structural, ${s.edits.promotions} promotions, ${s.edits.culls} culls)`);
  L.push(`- **fitness**: ${s.fitness.start} → ${s.fitness.end} (mean ${s.fitness.mean}, trend ${s.fitness.trend >= 0 ? '+' : ''}${s.fitness.trend})`);
  L.push(`- **honesty**: anchor ${s.honesty.anchorRate}, provisional ${Math.round(s.honesty.provisionalRate * 100)}%, human ${Math.round(s.honesty.humanRate * 100)}%`);
  if (s.body) L.push(`- **body**: ${s.body.founding} → ${s.body.final} organs (peak ${s.body.peak}), upkeep ${s.body.upkeep}${s.body.species.length ? `, species ${[...new Set(s.body.species)].join(', ')}` : ''}`);
  if (s.ecology) L.push(`- **ecology**: ${s.ecology.size} alive, diversity ${s.ecology.diversity}`);
  if (s.provenance) L.push(`- **provenance**: ${s.provenance.length} blocks, ${s.provenance.intact ? 'intact' : 'BROKEN'}`);
  if (s.governance) L.push(`- **selection (graduated)**: ${s.governance.sanctions.n} sanctions (${s.governance.sanctions.forgiven} forgiven), ${s.governance.deaths.n} controlled deaths releasing ${s.governance.deaths.organsReleased} organs, homeostat bands ${s.governance.homeostat.bands.join('/') || '·'}`);
  if (s.champion?.notation) L.push(`- **champion**: \`${s.champion.notation}\``);
  if (audit.lineage.length) {
    L.push('\n## Lineage — every genome edit');
    L.push('| period | op | edit |'); L.push('|---|---|---|');
    for (const e of audit.lineage.slice(-40)) L.push(`| ${e.period ?? '·'} | ${e.op || e.kind || '·'} | ${(e.note || e.kind || '').replace(/\|/g, '\\|')} |`);
  }
  if (audit.challenges.length) {
    L.push('\n## Claude challenges — grounded / flowing (judged against retrieved sources, not truth)');
    L.push('| # | question | grounded | flowing | satisfied | critique |'); L.push('|---|---|---|---|---|---|');
    audit.challenges.forEach((c, i) => {
      const sat = c.satisfaction || {};
      L.push(`| ${i + 1} | ${(c.question || '').slice(0, 80).replace(/\|/g, '\\|')} | ${sat.grounded ?? '·'} | ${sat.flowing ?? '·'} | ${sat.satisfied ?? '·'} | ${(sat.critique || '').slice(0, 80).replace(/\|/g, '\\|')} |`);
    });
  }
  if (audit.timeline.length) {
    L.push('\n## Timeline (last 24 beats)');
    L.push('| period | season | fitness | quality | organs | event |'); L.push('|---|---|---|---|---|---|');
    for (const t of audit.timeline.slice(-24)) L.push(`| ${t.period} | ${t.season || '·'} | ${t.fitness ?? '·'} | ${t.quality ?? '·'} | ${t.organs ?? '·'} | ${(t.event || '').replace(/\|/g, '\\|')} |`);
  }
  return L.join('\n');
};

const summarizeSources = (sources) => {
  if (!sources) return null;
  const arr = Array.isArray(sources) ? sources : [sources];
  return arr.slice(0, 12).map((x) => (typeof x === 'string' ? x.slice(0, 120) : { title: x?.title || null, url: x?.url || null, chars: (x?.text || '').length }));
};
