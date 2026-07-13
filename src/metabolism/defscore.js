// EO: EVA(Lens → Lens,Atmosphere, Binding·Dissecting) — score the judgment log's DEFs as DEFs
// The evaluator for the judgment substrate (The Work v2 #1). It scores whether the DEFs a turn
// minted are WELL-FORMED JUDGMENTS — grain-matched, witness-carrying, correctly INDETERMINATE
// when the witness is lacking, and stable under further reading — never whether the prose was
// fluent. The headline is the property that is actually fatal: CONFIDENT-AND-WRONG.
// Underconfident-and-wrong routes to VOID and is not penalized; a gold verdict may be
// "indeterminate is correct here", so correct suspension scores as correct, and confident
// guessing against a suspension gold is exactly the failure this counts. Deterministic by
// design (tools/evalkit LOCAL-RUN-FINDINGS: assertions 95% agreement with hand labels, a local
// LLM judge 51%) — everything mechanically checkable over the log is checked mechanically; the
// faithfulness axis that needs a held source lives in def-oracle.js, offline and budgeted.
//
// Pure functions over log.all() / log.project() output plus a gold sheet. It scores the LOG,
// not the judge — when the cuts themselves are retyped (v2 #2–#4), this file rides unchanged;
// only the verdicts it reads should move.

import { VERDICTS } from '../core/verdicts.js';
import { createJudgmentLog } from '../core/def.js';
import { violatesB1 } from '../core/cut.js';

// The four typed commitments. INDETERMINATE is the one suspended verdict — abstention, the
// honest "I lack the witness to cut same-from-other", never counted as a commitment.
export const CONFIDENT = Object.freeze(new Set([
  VERDICTS.CORROBORATED, VERDICTS.UNSUPPORTED, VERDICTS.CONTRADICTED, VERDICTS.OFF_DIAGONAL,
]));

// Verdict polarity for the stability read: +1 supports, −1 denies, 0 suspends. A polarity FLIP
// between the partial and the full reading is an OVERTURN — the fatal transition; 0→±1 is a
// suspension strengthened by more evidence, the transition a well-shaped DEF is built for.
export const POLARITY = Object.freeze({
  [VERDICTS.CORROBORATED]:  1,
  [VERDICTS.CONTRADICTED]: -1,
  [VERDICTS.UNSUPPORTED]:  -1,
  [VERDICTS.OFF_DIAGONAL]: -1,
  [VERDICTS.INDETERMINATE]: 0,
});

const pol = (v) => POLARITY[v] ?? 0;

// shapeAudit — the oracle trap made countable, over the FULL log (all(), not the projection:
// a malformed event out-voted by a later read is still a malformed event). Anonymous DEFs
// (of == null) are legal one-offs but are counted — they cannot be revised or gold-matched.
export const shapeAudit = (events = []) => {
  let malformed = 0, noWitness = 0, unknownVerdict = 0, unknownGrain = 0, anonymous = 0, b1 = 0;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.of == null) anonymous += 1;
    // Invariant B1 as a shape check (v3 #2): a CORROBORATED DEF whose witness carries cuts must
    // have every one of them ground out. The mapper enforces this pre-emptively (an unearned
    // affirmation downgrades to INDETERMINATE), so this must read ZERO on gold — a nonzero count
    // is an ungrounded comparative cut that shipped CORROBORATED, the about≠says failure.
    if (ev.verdict === VERDICTS.CORROBORATED && Array.isArray(ev.witness?.cuts)) {
      if (violatesB1(ev.verdict, ev.witness.cuts)) b1 += 1;
    }
    const m = ev.malformed;
    if (!m || !m.length) continue;
    malformed += 1;
    for (const tag of m) {
      if (tag === 'no-witness') noWitness += 1;
      else if (tag.startsWith('unknown-verdict:')) unknownVerdict += 1;
      else if (tag.startsWith('unknown-grain:')) unknownGrain += 1;
    }
  }
  return Object.freeze({ total: events.length, malformed, noWitness, unknownVerdict, unknownGrain, anonymous, b1 });
};

// normalizeOf — subject keys must compare across two PARSES of the same corpus. Every key is
// already stable text except the fold's `referent:<id>`, whose id is minted per-parse; map it
// through the doc's admission (id → label) so the partial and the full reading name the same
// subject. `referent:mention:<term>` (v2 #3) is already term-keyed and passes through; the
// anchorless `referent:∅` passes through.
export const normalizeOf = (def, { labelOf = null } = {}) => {
  const of = def?.of;
  if (typeof of !== 'string') return of ?? null;
  if (!of.startsWith('referent:') || of.startsWith('referent:mention:') || of === 'referent:∅') return of;
  if (typeof labelOf !== 'function') return of;
  const id = def.witness?.id ?? of.slice('referent:'.length);
  const label = labelOf(id);
  return label != null && label !== '' ? `referent:${String(label).toLowerCase()}` : of;
};

// matchGold — grade a projection against the gold sheet. A gold row names a GRAIN, a MATCHER
// over the normalized subject key ('*' = every DEF at that grain; otherwise a lowercase
// substring), and an ACCEPT set of verdicts — which may be {indeterminate}: "suspension is
// correct here". Outcomes, worst kept when a matcher touches several DEFs:
//   correct          projected verdict ∈ accept
//   underconfident   projected INDETERMINATE where a commitment was acceptable — reported,
//                    NEVER penalized (the doc's law: underconfident-and-wrong routes to VOID)
//   confident-wrong  a typed commitment outside the accept set — the fatal outcome
//   wrong-grain      the subject was judged, but at a different grain than gold names
//   unjudged         no DEF matched at all — a shape gap, not a wrong verdict
const BADNESS = Object.freeze({ correct: 0, underconfident: 1, 'wrong-grain': 2, unjudged: 2, 'confident-wrong': 3 });

const gradeOne = (verdict, accept) => {
  if (accept.includes(verdict)) return 'correct';
  if (verdict === VERDICTS.INDETERMINATE) return 'underconfident';
  return 'confident-wrong';
};

// gradeCuts — the Cut-level grade (§7). A gold row may carry the DECOMPOSITION a human drew —
// the sub-cuts they affirm (kind · grounds · verdict) and, for a CORROBORATED subject, the
// ruled-out other the affirmation must exclude. This grades the DEF's witness cuts against that
// gold, so the scorer reads whether the JUDGE cut the same way the human did, not only whether the
// folded verdict matched. Backward compatible: a gold row with no `cuts` returns null and scores
// exactly as before. Outcomes, worst kept:
//   cut-correct         every gold cut has a witness cut of the same kind and verdict
//   cut-mismatch        a witness cut of the right kind cut the OTHER way (a located defect)
//   cut-absent          the gold names a cut the witness never drew
//   ruledout-missing    the gold says this affirmation must rule one other out; the witness did not
const cutOrder = Object.freeze({ 'cut-correct': 0, 'ruledout-missing': 1, 'cut-absent': 2, 'cut-mismatch': 3 });
const gradeCuts = (goldRow, def) => {
  const goldCuts = Array.isArray(goldRow.cuts) ? goldRow.cuts : null;
  const wantRuledOut = !!goldRow.ruledOut || (Array.isArray(goldRow.accept) ? goldRow.accept : [goldRow.accept]).includes(VERDICTS.CORROBORATED);
  if (!goldCuts && !goldRow.ruledOut) return null;
  const wCuts = Array.isArray(def?.witness?.cuts) ? def.witness.cuts : [];
  const perCut = (goldCuts || []).map((gc) => {
    const match = wCuts.find((w) => w && w.kind === gc.kind && (gc.grounds == null || w.grounds === gc.grounds));
    if (!match) return Object.freeze({ kind: gc.kind, outcome: 'cut-absent', expected: gc.verdict, got: null });
    return Object.freeze({ kind: gc.kind, expected: gc.verdict, got: match.verdict,
      outcome: match.verdict === gc.verdict ? 'cut-correct' : 'cut-mismatch' });
  });
  // the ruled-out other (§3): a CORROBORATED affirmation the gold marks must carry exactly one.
  const hasRuledOut = def?.witness?.ruledOut != null && def.witness.ruledOut.other !== undefined;
  const affirmed = def?.verdict === VERDICTS.CORROBORATED;
  const ruledOutOk = !wantRuledOut || !affirmed || hasRuledOut;
  let outcome = 'cut-correct';
  for (const r of perCut) if (cutOrder[r.outcome] > cutOrder[outcome]) outcome = r.outcome;
  if (!ruledOutOk && cutOrder['ruledout-missing'] > cutOrder[outcome]) outcome = 'ruledout-missing';
  return Object.freeze({ outcome, perCut: Object.freeze(perCut), ruledOut: ruledOutOk });
};

export const matchGold = (projection, gold = [], { labelOf = null } = {}) => {
  const defs = [...(projection?.values?.() ? projection.values() : [])]
    .map((d) => ({ def: d, key: String(normalizeOf(d, { labelOf }) ?? '').toLowerCase() }));
  return Object.freeze(gold.map((g) => {
    const accept = Array.isArray(g.accept) ? g.accept : [g.accept];
    const wildcard = g.match === '*';
    const matcher = wildcard ? null : String(g.match || '').toLowerCase();
    const touched = wildcard
      ? defs.filter(({ def }) => def.grain === g.grain)
      : defs.filter(({ key }) => matcher && key.includes(matcher));
    const graded = touched.filter(({ def }) => def.grain === g.grain);
    let outcome, worst = null;
    if (!touched.length) outcome = 'unjudged';
    else if (!graded.length) { outcome = 'wrong-grain'; worst = touched[0]; }
    else {
      outcome = 'correct';
      for (const t of graded) {
        const o = gradeOne(t.def.verdict, accept);
        if (BADNESS[o] > BADNESS[outcome]) { outcome = o; worst = t; }
        else if (!worst) worst = t;
      }
    }
    const cutGrade = worst ? gradeCuts(g, worst.def) : (g.cuts || g.ruledOut ? { outcome: 'cut-absent', perCut: [], ruledOut: false } : null);
    return Object.freeze({
      grain: g.grain, match: g.match, accept: Object.freeze(accept.slice()),
      of: worst ? normalizeOf(worst.def, { labelOf }) : null,
      projected: worst ? worst.def.verdict : null,
      outcome,
      ...(cutGrade ? { cutGrade } : {}),
      ...(g.why ? { why: g.why } : {}),
    });
  }));
};

// scoreVerdicts — fold gold rows to the census. judged = correct + confidentWrong +
// underconfident (wrong-grain and unjudged are SHAPE gaps, reported beside, never mixed in).
//   cwr            = confidentWrong / judged      ← THE HEADLINE (null when nothing judged)
//   underconfidence = underconfident / judged      reported, not penalized
//   accuracy        = correct / judged             reported
const zeroCell = () => ({ correct: 0, confidentWrong: 0, underconfident: 0, wrongGrain: 0, unjudged: 0 });
const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);
const closeCell = (c) => {
  const judged = c.correct + c.confidentWrong + c.underconfident;
  return Object.freeze({ ...c, judged, cwr: rate(c.confidentWrong, judged),
    underconfidence: rate(c.underconfident, judged), accuracy: rate(c.correct, judged) });
};

export const scoreVerdicts = (rows = []) => {
  const byGrain = {}; const overall = zeroCell();
  const bump = (cell, outcome) => {
    if (outcome === 'correct') cell.correct += 1;
    else if (outcome === 'confident-wrong') cell.confidentWrong += 1;
    else if (outcome === 'underconfident') cell.underconfident += 1;
    else if (outcome === 'wrong-grain') cell.wrongGrain += 1;
    else if (outcome === 'unjudged') cell.unjudged += 1;
  };
  for (const r of rows) {
    const g = r.grain || 'other';
    byGrain[g] = byGrain[g] || zeroCell();
    bump(byGrain[g], r.outcome); bump(overall, r.outcome);
  }
  const closed = {};
  for (const [g, cell] of Object.entries(byGrain)) closed[g] = closeCell(cell);
  return Object.freeze({ byGrain: Object.freeze(closed), overall: closeCell(overall) });
};

// classifyTransition — what further reading did to a subject's verdict. Only a polarity FLIP
// is an overturn; unsupported→corroborated flips too (a confident negative on a half-read
// source was a premature commitment — the correct partial verdict was suspension).
export const classifyTransition = (prev, next) => {
  if (prev === next) return 'stable';
  const p = pol(prev), n = pol(next);
  if (p === 0 && n !== 0) return 'strengthened';
  if (p !== 0 && n === 0) return 'retreated';
  if (p * n === -1) return 'overturned';
  return 'drifted';   // same polarity, different verdict (unsupported → contradicted)
};

// scoreStability — compare the partial reading's projection with the full reading's, per
// normalized subject. overturnRate = overturned / |subjects the partial read committed on| —
// the second headline: does adding evidence overturn the DEF, or only strengthen it?
// Subjects only in the full read are EMERGENT (new material judged — fine); only in the
// partial are DROPPED (counted; a judge that loses subjects under more evidence is suspect).
const projectByKey = (projection, labelOf) => {
  const m = new Map();
  for (const def of projection?.values?.() ? projection.values() : []) {
    const key = normalizeOf(def, { labelOf });
    if (key != null) m.set(key, def);
  }
  return m;
};

export const scoreStability = (prevProjection, nextProjection, { labelOfPrev = null, labelOfNext = null } = {}) => {
  const prev = projectByKey(prevProjection, labelOfPrev);
  const next = projectByKey(nextProjection, labelOfNext);
  const counts = { stable: 0, strengthened: 0, retreated: 0, overturned: 0, drifted: 0 };
  const byGrain = {}; const overturns = [];
  let committed = 0, emergent = 0, dropped = 0;
  for (const [key, p] of prev) {
    const n = next.get(key);
    if (!n) { dropped += 1; continue; }
    const cls = classifyTransition(p.verdict, n.verdict);
    counts[cls] += 1;
    const g = n.grain || p.grain || 'other';
    byGrain[g] = byGrain[g] || { stable: 0, strengthened: 0, retreated: 0, overturned: 0, drifted: 0 };
    byGrain[g][cls] += 1;
    if (pol(p.verdict) !== 0) committed += 1;
    if (cls === 'overturned') overturns.push(Object.freeze({ of: key, prev: p.verdict, next: n.verdict }));
  }
  for (const key of next.keys()) if (!prev.has(key)) emergent += 1;
  return Object.freeze({
    ...counts, byGrain: Object.freeze(byGrain), committed, emergent, dropped,
    overturnRate: rate(counts.overturned, committed),
    overturns: Object.freeze(overturns),
  });
};

// mergeRuns — replay the two readings onto ONE fresh log: the partial projection lands via
// judge(), then the full projection revises where the subject already stands and judges where
// it is emergent. This exercises the substrate's revision rail end-to-end (revise() had no
// call site before this): the merged projection must equal the full run's, and every revised
// subject carries its `revises` pointer back to the partial DEF it superseded.
export const mergeRuns = (partialLog, fullLog, { labelOfPrev = null, labelOfNext = null } = {}) => {
  const merged = createJudgmentLog();
  for (const def of partialLog?.project?.().values() ?? []) {
    const key = normalizeOf(def, { labelOf: labelOfPrev });
    if (key == null) continue;
    merged.judge({ verdict: def.verdict, grain: def.grain, of: key, witness: def.witness });
  }
  for (const def of fullLog?.project?.().values() ?? []) {
    const key = normalizeOf(def, { labelOf: labelOfNext });
    if (key == null) continue;
    if (merged.latestOf(key)) merged.revise(key, { verdict: def.verdict, grain: def.grain, witness: def.witness });
    else merged.judge({ verdict: def.verdict, grain: def.grain, of: key, witness: def.witness });
  }
  return merged;
};

// scoreCuts — the Cut-level census (§7), folded from the rows' cutGrade. graded = the gold rows
// that carried a decomposition; the rest fold to the verdict census as before. This is what makes
// twin generation principled: a bad twin perturbs exactly one cut, and a judge that fails to
// separate it shows a specific, located cut-mismatch here — not just a folded miss.
const zeroCuts = () => ({ graded: 0, cutCorrect: 0, cutMismatch: 0, cutAbsent: 0, ruledOutMissing: 0 });
export const scoreCuts = (rows = []) => {
  const c = zeroCuts();
  for (const r of rows) {
    const cg = r.cutGrade;
    if (!cg) continue;
    c.graded += 1;
    if (cg.outcome === 'cut-correct') c.cutCorrect += 1;
    else if (cg.outcome === 'cut-mismatch') c.cutMismatch += 1;
    else if (cg.outcome === 'cut-absent') c.cutAbsent += 1;
    else if (cg.outcome === 'ruledout-missing') c.ruledOutMissing += 1;
  }
  return Object.freeze({ ...c, cutAccuracy: rate(c.cutCorrect, c.graded) });
};

// scoreSpecimen — one specimen's summary: the shape audit, the gold census, the stability read,
// and the Cut-level census (additive — unlocks cut-level scoring where the gold drew cuts).
export const scoreSpecimen = ({ id = null, shape = null, rows = [], stability = null } = {}) => Object.freeze({
  id, shape, verdicts: scoreVerdicts(rows), cuts: scoreCuts(rows), stability, rows,
});

// scoreboard — the battery aggregate: verdict-census cells and stability classes summed across
// specimens, rates recomputed over the sums (never averaged averages), shape totals beside.
export const scoreboard = (perSpecimen = []) => {
  const byGrain = {}; const overall = zeroCell();
  const stab = { stable: 0, strengthened: 0, retreated: 0, overturned: 0, drifted: 0, committed: 0, emergent: 0, dropped: 0 };
  const shape = { total: 0, malformed: 0, noWitness: 0, unknownVerdict: 0, unknownGrain: 0, anonymous: 0, b1: 0 };
  const cuts = { graded: 0, cutCorrect: 0, cutMismatch: 0, cutAbsent: 0, ruledOutMissing: 0 };
  for (const s of perSpecimen) {
    for (const [g, cell] of Object.entries(s.verdicts?.byGrain || {})) {
      byGrain[g] = byGrain[g] || zeroCell();
      for (const k of Object.keys(zeroCell())) byGrain[g][k] += cell[k] || 0;
      for (const k of Object.keys(zeroCell())) overall[k] += cell[k] || 0;
    }
    for (const k of Object.keys(stab)) stab[k] += s.stability?.[k] || 0;
    for (const k of Object.keys(shape)) shape[k] += s.shape?.[k] || 0;
    for (const k of Object.keys(cuts)) cuts[k] += s.cuts?.[k] || 0;
  }
  const closed = {};
  for (const [g, cell] of Object.entries(byGrain)) closed[g] = closeCell(cell);
  return Object.freeze({
    specimens: perSpecimen.length,
    byGrain: Object.freeze(closed),
    overall: closeCell(overall),
    stability: Object.freeze({ ...stab, overturnRate: rate(stab.overturned, stab.committed) }),
    cuts: Object.freeze({ ...cuts, cutAccuracy: rate(cuts.cutCorrect, cuts.graded) }),
    shape: Object.freeze(shape),
    perSpecimen: Object.freeze(perSpecimen.map((s) => Object.freeze({
      id: s.id,
      cwr: s.verdicts?.overall?.cwr ?? null,
      confidentWrong: s.verdicts?.overall?.confidentWrong ?? 0,
      underconfident: s.verdicts?.overall?.underconfident ?? 0,
      unjudged: s.verdicts?.overall?.unjudged ?? 0,
      overturned: s.stability?.overturned ?? 0,
      malformed: s.shape?.malformed ?? 0,
    }))),
  });
};

// renderScoreboard — the CLI face: plain text, one glance. Rates print '—' when nothing was
// judged at a grain (an honest blank, not a zero).
export const renderScoreboard = (agg) => {
  const fmt = (x) => (x == null ? '—' : String(x));
  const lines = [];
  lines.push(`judgment battery — ${agg.specimens} specimens`);
  lines.push('');
  lines.push('grain          judged  correct  conf-wrong  underconf  CWR     unjudged  wrong-grain');
  const row = (name, c) => `${name.padEnd(14)} ${String(c.judged).padStart(6)}  ${String(c.correct).padStart(7)}  ${String(c.confidentWrong).padStart(10)}  ${String(c.underconfident).padStart(9)}  ${fmt(c.cwr).padStart(6)}  ${String(c.unjudged).padStart(8)}  ${String(c.wrongGrain).padStart(11)}`;
  for (const [g, cell] of Object.entries(agg.byGrain)) lines.push(row(g, cell));
  lines.push(row('overall', agg.overall));
  lines.push('');
  const st = agg.stability;
  lines.push(`stability: ${st.stable} stable · ${st.strengthened} strengthened · ${st.retreated} retreated · ${st.drifted} drifted · ${st.overturned} OVERTURNED (rate ${fmt(st.overturnRate)}) · ${st.emergent} emergent · ${st.dropped} dropped`);
  const cu = agg.cuts;
  if (cu && cu.graded) lines.push(`cuts:      ${cu.graded} graded · ${cu.cutCorrect} correct · ${cu.cutMismatch} MISMATCH · ${cu.cutAbsent} absent · ${cu.ruledOutMissing} ruled-out-missing (accuracy ${fmt(cu.cutAccuracy)})`);
  const sh = agg.shape;
  lines.push(`shape:     ${sh.total} DEFs · ${sh.malformed} malformed (${sh.noWitness} no-witness, ${sh.unknownVerdict} bad-verdict, ${sh.unknownGrain} bad-grain) · ${sh.b1 || 0} B1-violations · ${sh.anonymous} anonymous`);
  lines.push('');
  lines.push('specimen                        CWR     conf-wrong  underconf  unjudged  overturned  malformed');
  for (const s of agg.perSpecimen) {
    lines.push(`${String(s.id).padEnd(30)}  ${fmt(s.cwr).padStart(6)}  ${String(s.confidentWrong).padStart(10)}  ${String(s.underconfident).padStart(9)}  ${String(s.unjudged).padStart(8)}  ${String(s.overturned).padStart(10)}  ${String(s.malformed).padStart(9)}`);
  }
  return lines.join('\n');
};
