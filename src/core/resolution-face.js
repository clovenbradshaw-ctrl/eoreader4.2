// EO: NUL(Kind → Kind, Clearing) — the EVA resolution face: Bearing × Determinacy → verdict
// spec:verdict-space-taxonomy — the derivation. The verdict space EVA emits is not a flat
// alphabet; it is a Resolution face, the same Mode × Object cross core/cube.js already names
// for the nine operators (STANCES), specialised to EVA's own act: reading a claim against a
// witness. Nine cells. One is not EVA's to emit (it belongs to DEF, the log). Eight are legal
// EVA verdicts. OFF_DIAGONAL is not a ninth cell but a well-formedness flag guarding one row.
// core/verdicts.js's vocabulary is a lossy read of this grid — this module is the generator,
// and the map back down to what actually ships.
//
// Axis 1 — Bearing: how the witness stands to the claim, read off the Mode of the
// claim-witness relation (core/operators.js MODES), under EVA's own names:
//   Binds        (Relate)        — the witness is FOR the claim.
//   Cuts         (Differentiate) — the witness is AGAINST the claim.
//   Doesn't-bear (Generate)      — the witness relates to the claim only if you originate a
//                                  link it does not contain. The generative/origination mode;
//                                  its signature failure is manufacturing a connection from
//                                  nothing.
//
// Axis 2 — Determinacy: the Object position the evaluation resolves to (core/operators.js
// GRAINS), unchanged:
//   Figure  — the evaluation crystallizes to a determinate resolved judgment.
//   Pattern — the ∥ held-open state; the sources decline to collapse. Not weak resolution —
//             the perpendicular axis fully engaged.
//   Ground  — no figure crystallizes; diffuse atmosphere or outright absence.
//
// This is a derivation, not settled fact: §5 of the spec names three load-bearing
// assumptions (Bearing really is the Mode trichotomy and not a bipolar for/against/none;
// separability of the eight cells is empirical, not geometric; the DEF export below is the
// only exit). Treat SHIPPED_FOLD's unpromoted cells as open questions, not omissions.

import { MODES, GRAINS } from './operators.js';
import { VERDICTS } from './verdicts.js';

export const BEARING = Object.freeze({ BINDS: 'Relate', CUTS: 'Differentiate', DOESNT_BEAR: 'Generate' });
export const DETERMINACY = GRAINS;   // Ground | Figure | Pattern — no new axis, the same GRAINS

// ── The grid ──────────────────────────────────────────────────────────────────────────────
// Cuts×Pattern is null: a witness that says yes-and-no and will not collapse is productive
// contradiction. Per the wiki, holding contradiction is DEF's job, not EVA's ("multiple DEFs
// on the same path coexist naturally… the holding is the log's job, the judging is EVA's").
// This cell is structurally exported to the log and never appears as a verdict — that export
// is why the legal count is eight, not nine. The asymmetry is principled: CONSONANT and
// INDETERMINATE also sit in the Pattern column and stay with EVA, because they are
// uncrystallized, not contradictory; only the contradictory Pattern cell leaves.
export const RESOLUTION_FACE = Object.freeze({
  Relate: Object.freeze({
    Figure:  VERDICTS.CORROBORATED,    // binds, figure crystallizes — witness genuinely supports
    Pattern: VERDICTS.CONSONANT,       // binds, held open — leans for; has not crystallized
    Ground:  VERDICTS.CIRCUMSTANTIAL,  // binds, ground — supportive atmosphere, no direct witness
  }),
  Differentiate: Object.freeze({
    Figure:  VERDICTS.CONTRADICTED,    // cuts, figure crystallizes — witness genuinely opposes
    Pattern: null,                     // cuts, held open — exported to DEF/log, never a verdict
    Ground:  VERDICTS.UNDERMINED,      // cuts, ground — ambient tension, no counter-figure
  }),
  Generate: Object.freeze({
    Figure:  VERDICTS.UNSUPPORTED,     // doesn't bear, figure present — relevant material exists, doesn't support
    Pattern: VERDICTS.INDETERMINATE,   // doesn't bear, held open — relevant material exists, won't settle
    Ground:  VERDICTS.SILENT,          // doesn't bear, ground — no material; the witness is simply absent
  }),
});

// The cell exported to DEF instead of a verdict — Cuts × Pattern, "productive contradiction".
export const DEF_EXPORT_CELL = Object.freeze({ mode: 'Differentiate', grain: 'Pattern' });

// The verdict at (mode, grain), or null off the grid / at the DEF-exported cell.
export const verdictOf = (mode, grain) => RESOLUTION_FACE[mode]?.[grain] ?? null;

// Reverse lookup — the (mode, grain) a verdict names. A name uniquely fixes its cell.
const VERDICT_CELL = new Map();
for (const mode of MODES)
  for (const grain of GRAINS) {
    const v = RESOLUTION_FACE[mode][grain];
    if (v != null) VERDICT_CELL.set(v, Object.freeze({ mode, grain }));
  }
export const cellOfVerdict = (verdict) => VERDICT_CELL.get(verdict) ?? null;

// The eight legal EVA verdicts — the grid minus the one DEF-exported cell. OFF_DIAGONAL is
// deliberately absent from this list: it is the legality guard over the Doesn't-bear/Generate
// row (fires when a claim demands Figure-grade resolution — CORROBORATED — while the witness
// sits at Ground in that row), not a ninth grid cell.
export const LEGAL_VERDICTS = Object.freeze(
  MODES.flatMap((mode) => GRAINS.map((grain) => RESOLUTION_FACE[mode][grain])).filter((v) => v != null)
);

// ── The map from generator to shipped subset ────────────────────────────────────────────
// core/verdicts.js ships CORROBORATED, CONTRADICTED, UNSUPPORTED, INDETERMINATE, SILENT, and
// the orthogonal OFF_DIAGONAL flag. This is not aspiration — it is what today's actual call
// sites do with each of the eight legal cells, so the honesty debt is named rather than
// silent (spec §4). Three cells still fold into a neighbor; each entry below names the
// folding site and, where the spec takes a position, whether the split is even expected to
// hold up (§6's pre-registered separation test is the thing that decides this, not this file).
export const SHIPPED_FOLD = Object.freeze({
  [VERDICTS.CORROBORATED]:  Object.freeze({ ships: true }),
  [VERDICTS.CONTRADICTED]:  Object.freeze({ ships: true }),
  [VERDICTS.UNSUPPORTED]:   Object.freeze({ ships: true }),
  [VERDICTS.INDETERMINATE]: Object.freeze({ ships: true }),
  [VERDICTS.SILENT]: Object.freeze({
    ships: true,
    note: 'promoted out of UNSUPPORTED — enactor/factcheck/correspond.js\'s `no-edge` reason and ' +
          'turn/judgments.js\'s VOID_LOCATION (\'elsewhere\'/\'never-set\'/\'not-in-corpus\') now emit ' +
          'this directly. The one cell the spec calls the highest-value split (§4, §6.1).',
  }),
  [VERDICTS.CONSONANT]: Object.freeze({
    ships: false, foldsInto: VERDICTS.CORROBORATED,
    note: 'enactor/factcheck/correspond.js\'s `adjacent()` (perceiver/classify/phasepost.js) treats ' +
          '"same cell" and "merely adjacent cell" as one boolean, so a leaning-for match that has not ' +
          'crystallized reads as full corroboration today. The spec predicts this split will NOT ' +
          'reliably separate without a REC boundary (§6.2) — the hardest of the eight, expect failure.',
  }),
  [VERDICTS.CIRCUMSTANTIAL]: Object.freeze({
    ships: false, foldsInto: null,
    note: 'no dedicated detection exists, and the shipped code does not agree on a single fold: ' +
          'correspond.js reads it as UNSUPPORTED (no candidate edge at all — indistinguishable from ' +
          'SILENT today); organs/in/web-keep.js reads a same-shaped case (real content match, no ' +
          'independent lineage — the "echo") as INDETERMINATE. Two shadows, no promotion.',
  }),
  [VERDICTS.UNDERMINED]: Object.freeze({
    ships: false, foldsInto: VERDICTS.CONTRADICTED,
    note: 'every Cuts-mode hit (disjoint-axiom, functional-axiom, object-functional-axiom, the ' +
          'voidDenial check) emits CONTRADICTED unconditionally today — none of core/relation-types.js\'s ' +
          'checkers or correspond.js\'s voidDenial carry a grain input, so a Figure-grade and a ' +
          'Ground-grade denial are not yet distinguished. The spec predicts this split WILL separate ' +
          '(§6.3), unlike CONSONANT — untested, not unpromising.',
  }),
});

// Self-check, in the spirit of cube.js's own "exactly nine operators" discipline: eight legal
// cells, one DEF export, no drift. Fails loudly at load rather than silently admitting a ninth
// verdict or losing one.
{
  const legal = new Set(LEGAL_VERDICTS);
  if (legal.size !== 8)
    throw new Error(`resolution-face self-check failed: expected 8 legal EVA verdicts, got ${legal.size}`);
}
