// EO: DEF·REC(Lens → Lens,Atmosphere,Paradigm, Dissecting,Clearing,Composing) — the judgment DEF + the append-only judgment log
// A judgment is a DEF. The whole system asks one question — SAME or OTHER — and the object
// that answers it is a judgment made by the reader: Differentiate × Significance, cut same
// from other at the level of meaning. The binder was making DEFs all along ("this citation
// is valid" is a DEF); the bug was making them OUTSIDE the log — uncontestable, unrevisable,
// where the physics could not reach them. This module gives that judgment its shape.
//
// A DEF is not an oracle. An oracle is a stamp with no log grammar: nothing appended, no
// provenance, no counter-DEF possible, no later reading able to overturn it. A DEF is the
// opposite by construction: it is a TYPED verdict (core/verdicts.js) that carries its WITNESS
// (the derivation that earned it), lands on an append-only log, and is revisable — a later
// read appends a counter-DEF and the projection recomputes. That is what makes "grounding"
// a claim-open-to-reassessment rather than a verdict-frozen-at-a-moment.
//
// INDETERMINATE is a first-class verdict here — a SUSPENDED DEF, "I judge that I lack the
// witness to cut same-from-other." It stands in the log until re-judged; abstention is an
// honest output, not a dodge.
//
// The recursion terminates DOWNWARD at INS: a judgment's `of` is the identity of what it
// judges (the minted subject), so sameness against an anchor is trivially decidable at the
// floor. It has no top — the log of a DEF is itself re-judgeable — which is what makes
// contestability real.

import { VERDICTS } from './verdicts.js';

// The GRAIN a same-vs-other judgment is cut at — and the link from a DEF back to the judge
// that emits it. Each names one of the four gates the reframe unifies.
export const GRAINS = Object.freeze({
  CLAIM:       'claim',        // binding: does this span predicate the claim?            (enactor/ground/bind.js)
  PREDICATION: 'predication',  // correspondence: does the source hold the relation?      (enactor/factcheck/correspond.js)
  REFERENT:    'referent',     // reference: is this mention the same referent as the anchor? (perceiver/referent.js)
  FIELD:       'field',        // void: what kind of absence is this?                     (enactor/answer/void.js)
  INTAKE:      'intake',       // collapse: does this open-web span earn custody in the log? (organs/in/web.js)
});

const VERDICT_SET = new Set(Object.values(VERDICTS));
const GRAIN_SET   = new Set(Object.values(GRAINS));

export const isVerdict = (v) => VERDICT_SET.has(v);
export const isGrain   = (g) => GRAIN_SET.has(g);

// The verdict value → the camelCase census key the distribution reports (and the label reads).
const VERDICT_KEY = Object.freeze({
  [VERDICTS.CORROBORATED]:   'corroborated',
  [VERDICTS.CONSONANT]:      'consonant',
  [VERDICTS.CIRCUMSTANTIAL]: 'circumstantial',
  [VERDICTS.CONTRADICTED]:   'contradicted',
  [VERDICTS.UNDERMINED]:     'undermined',
  [VERDICTS.UNSUPPORTED]:    'unsupported',
  [VERDICTS.INDETERMINATE]:  'indeterminate',
  [VERDICTS.SILENT]:         'silent',
  [VERDICTS.OFF_DIAGONAL]:   'offDiagonal',
});
const zeroCounts = () => ({
  corroborated: 0, consonant: 0, circumstantial: 0, contradicted: 0, undermined: 0,
  unsupported: 0, indeterminate: 0, silent: 0, offDiagonal: 0,
});

// makeDef — construct a frozen DEF event. The shape of a re-judgeable judgment:
//   verdict  — a typed verdict (core/verdicts.js); the cut, same vs other
//   grain    — where the cut was made (one of GRAINS), or null
//   of       — a STABLE key for the subject judged (the identity — the recursion's INS floor).
//              Two DEFs sharing `of` judge the SAME thing, so the later one supersedes the
//              earlier in the projection; a distinct `of` is a distinct subject.
//   witness  — the derivation that earned the verdict (spans, resolved arguments, margins).
//              A DEF WITHOUT a witness is an oracle wearing DEF clothes — recorded as malformed.
//   revises  — the sequence stamp of the DEF this one re-judges (null for a first judgment)
//   t        — a per-log sequence stamp, set by the log on append (null until then)
// Never throws: a bad verdict/grain or a missing witness is recorded on the DEF (`malformed`)
// so a turn that logs a judgment is never crashed by the logging.
export const makeDef = ({ verdict, grain = null, of = null, witness = null, revises = null, t = null } = {}) => {
  const malformed = [];
  if (!isVerdict(verdict)) malformed.push(`unknown-verdict:${String(verdict)}`);
  if (grain != null && !isGrain(grain)) malformed.push(`unknown-grain:${String(grain)}`);
  if (witness == null) malformed.push('no-witness');   // the oracle trap: a verdict with no derivation
  return Object.freeze({
    type: 'def',
    verdict,
    grain,
    of,
    witness,
    revises,
    t,
    ...(malformed.length ? { malformed: Object.freeze(malformed) } : {}),
  });
};

// createJudgmentLog — the per-turn append-only judgment log. Revisability is not a feature
// bolted on; it FALLS OUT of the append-only discipline: `revise` never mutates a prior DEF,
// it APPENDS a counter-DEF, and `project`/`distribution` recompute. The full history stays in
// `all()`, so a superseded verdict is never erased — only out-voted by a later read.
export const createJudgmentLog = () => {
  const events = [];
  let seq = 0;

  // The latest DEF logged for a subject (scan from the tail), or null.
  const latestOf = (of) => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].of === of) return events[i];
    return null;
  };

  const append = (def) => {
    const t = seq++;
    const stamped = def.t === t ? def : makeDef({ ...def, t });
    events.push(stamped);
    return stamped;
  };

  // judge — log a first (or independent) judgment of `of`.
  const judge = ({ verdict, grain = null, of = null, witness = null } = {}) =>
    append(makeDef({ verdict, grain, of, witness }));

  // revise — log a counter-DEF for the SAME subject. It carries `revises` = the sequence stamp
  // of the DEF it supersedes, so the audit chain is a linked list, never an overwrite. When no
  // prior DEF exists for `of`, this is simply a first judgment (revises = null). The grain
  // defaults to the prior DEF's grain so a revision keeps cutting at the same level.
  const revise = (of, { verdict, witness = null, grain = null } = {}) => {
    const prior = latestOf(of);
    return append(makeDef({
      verdict,
      grain: grain ?? prior?.grain ?? null,
      of,
      witness,
      revises: prior ? prior.t : null,
    }));
  };

  // project — the CURRENT judgment per subject: the latest DEF wins. Subjects with no `of`
  // (of == null) are anonymous one-offs and are not projected (they carry no identity to
  // supersede), but they still ride in `all()`.
  const project = () => {
    const m = new Map();
    for (const ev of events) if (ev.of != null) m.set(ev.of, ev);
    return m;
  };

  // distribution — the verdict census over the PROJECTION (current verdicts only), with a
  // by-grain split. This is what the answer chip (#5) summarizes: n corroborated / n
  // unsupported / n indeterminate, not the route. Anonymous DEFs (no `of`) are counted too,
  // since each is its own subject.
  const distribution = () => {
    const counts = zeroCounts();
    const byGrain = {};
    const tally = (ev) => {
      const key = VERDICT_KEY[ev.verdict];
      const g = ev.grain || 'other';
      byGrain[g] = byGrain[g] || zeroCounts();
      if (key) { counts[key] += 1; byGrain[g][key] += 1; }
    };
    for (const ev of project().values()) tally(ev);
    for (const ev of events) if (ev.of == null) tally(ev);
    counts.total = counts.corroborated + counts.consonant + counts.circumstantial
      + counts.contradicted + counts.undermined + counts.unsupported + counts.indeterminate
      + counts.silent + counts.offDiagonal;
    counts.byGrain = byGrain;
    return counts;
  };

  return {
    judge,
    revise,
    append,
    latestOf,
    all: () => events.slice(),
    project,
    distribution,
    get size() { return events.length; },
  };
};
