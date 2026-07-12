// EO: EVA(Paradigm → Lens, Binding) — !EVA prompt — the checkpoint on what the talker is handed
// THE INPUT-SIDE CHECKPOINT (docs/prompt-as-site.md, Tier 3 §4). The coder pipeline
// judges what the model EMITS (src/coder/checkpoint.js); nothing judged what it is
// HANDED. This is that missing checkpoint: a read-only judgment over the projected
// band assembly (model/bands.js), run between `reason` and `llm` in the turn
// pipeline, with the same verdict shape the coder checkpoint established —
// { id, ok, findings } over a frozen error taxonomy — so the two checkpoints read
// as one discipline on both doors.
//
// ADVISORY BY DESIGN. `ok` is false only on the two STRUCTURAL errors (a band off
// the nine-terrain catalog, a band outside the declared width) — those cannot happen
// through the projection and mean the assembly did not come from the catalog. The
// three MEASURED verdicts (desert-cell, grain-mixed, ground-inflation) are advisory:
// today's production prompt trips them by design (the steer ships; the summary guard
// ships), and the checkpoint's job is to keep that worklist visible — typed, at the
// band it lands on — instead of letting it accrete silently. An advisory finding is
// the patch treadmill made legible, never a veto on the turn.
//
// The five verdicts:
//   closure-violation  a band that fits no terrain — the category error the closed
//                      catalog exists to make impossible (surfaced, never invented)
//   contract-violation a band landing outside the assembly's declared Site width
//   desert-cell        an instruction band declaring SYN·Cultivating — generate
//                      under an ambient condition, the cell empty across every
//                      language measured (core/contract.js DESERT_CELL). You cannot
//                      instruct Cultivating; you cultivate by arranging conditions.
//   grain-mixed        an instructed stance whose grain has NO material band at that
//                      grain to land on — the material always wins, so the
//                      instruction will under-deliver until the material matches
//                      (the summary guard over bare spans is the canonical case)
//   ground-inflation   the assembly's Ground-row share of handed text, judged
//                      against the corpus population gradient via deriveNull —
//                      the accretion pathology measured per turn, not per file

import { deriveNull } from '../core/voidnull.js';
import { TERRAIN_GRAIN } from './bands.js';

// The Stance face's grain column (core/cube.js STANCES, transposed): the grain each
// stance engages at. Used to judge an instructed stance against the material grains.
export const STANCE_GRAIN = Object.freeze({
  Clearing: 'Ground', Dissecting: 'Figure', Unraveling: 'Pattern',
  Tending: 'Ground', Binding: 'Figure', Tracing: 'Pattern',
  Cultivating: 'Ground', Making: 'Figure', Composing: 'Pattern',
});

// The corpus population gradient over the nine Site terrains — the consensus set of
// the clause study (docs/eo-wiki.md "EO Lexical Analysis v2", 7,808 clauses where
// both classifiers agreed, 41 languages). Shares of clauses whose target lands on
// each terrain. The Ground row (Void + Field + Atmosphere) carries 6.2% of language;
// this is the background an assembly's terrain mass is judged against.
export const GRADIENT_BACKGROUND = Object.freeze({
  Void: 0.0160, Entity: 0.2053, Kind: 0.0181,
  Field: 0.0314, Link: 0.3466, Network: 0.0745,
  Atmosphere: 0.0146, Lens: 0.2332, Paradigm: 0.0603,
});

// The taxonomy as DATA, the coder checkpoint's own shape (src/coder/checkpoint.js
// ERROR_TAXONOMY): face, severity, where it is detectable, which stage owns the fix.
export const PROMPT_ERROR_TAXONOMY = Object.freeze({
  'closure-violation': Object.freeze({
    face: 'site', severity: 'error', detectableAt: 'band', stage: 'catalog',
    fix: 'a band that fits no terrain is a category error — name its terrain in the catalog or do not emit it',
  }),
  'contract-violation': Object.freeze({
    face: 'site', severity: 'error', detectableAt: 'band', stage: 'projection',
    fix: 'the band lands outside the assembly\'s declared Site width — widen the contract deliberately or route the content upstream',
  }),
  'desert-cell': Object.freeze({
    face: 'stance', severity: 'advisory', detectableAt: 'band', stage: 'grounder',
    fix: 'you cannot instruct Cultivating — arrange the conditions instead: re-rank span selection and order upstream, then delete the prose',
  }),
  'grain-mixed': Object.freeze({
    face: 'stance', severity: 'advisory', detectableAt: 'assembly', stage: 'caller',
    fix: 'hand the instructed stance material at its own grain (the fold, the graph, the exemplar) — the material always wins over the instruction',
  }),
  'ground-inflation': Object.freeze({
    face: 'site', severity: 'advisory', detectableAt: 'assembly', stage: 'catalog',
    fix: 'the Ground row is the sparse row in every language — carry ambient work in selection and order, not in more ambient prose',
  }),
});

const finding = (error, address, message, extra = {}) => Object.freeze({
  error, address, message,
  ...PROMPT_ERROR_TAXONOMY[error],
  ...extra,
});

// The declared Site widths, per catalog — derived from the catalogs themselves in
// prompt.js's projections, or passed explicitly for a hand-built assembly. A width
// is { terrains: [names], note }. deriveWidth builds one from a band list.
export const deriveWidth = (bands, note = '') => Object.freeze({
  terrains: Object.freeze([...new Set(bands.map(b => b.terrain))]),
  note,
});

// Per-terrain character shares of the handed text — the assembly-level measure
// (what the model actually reads this turn). The file-level instructional measure
// lives in tools/prompt-census; the two are complementary and documented as such.
export const terrainShares = (bands) => {
  const mass = {};
  let total = 0;
  for (const b of bands) {
    const n = (b.text || '').length;
    mass[b.terrain] = (mass[b.terrain] || 0) + n;
    total += n;
  }
  const shares = {};
  for (const [t, n] of Object.entries(mass)) shares[t] = total ? n / total : 0;
  return Object.freeze({ shares: Object.freeze(shares), total });
};

// judgePrompt(bands, opts) → Object.freeze({ id, ok, findings, shares })
//
//   bands   a projected band assembly (model/bands.js projectBands output, or any
//           [{ key, terrain, grain, role, cell, text }])
//   opts.id       verdict id (default 'prompt')
//   opts.width    the declared Site width ({ terrains }); defaults to the width the
//                 assembly itself spans — contract-violation then only fires for a
//                 band injected AFTER projection, which is exactly the foreign band
//                 the checkpoint exists to catch
//   opts.background  per-terrain corpus shares (default GRADIENT_BACKGROUND)
//   opts.alpha       deriveNull tail for ground-inflation (default 0.05)
//
// Pure, read-only, non-throwing: a projection cannot fire an act, and neither can
// its judge. ok = no error-severity findings (the coder checkpoint's own rule).
export const judgePrompt = (bands = [], {
  id = 'prompt',
  width = null,
  background = GRADIENT_BACKGROUND,
  alpha = 0.05,
} = {}) => {
  const findings = [];
  const w = width ?? deriveWidth(bands);

  // ── Band-level: the closed catalog and the declared width ──────────────────
  for (const b of bands) {
    if (!TERRAIN_GRAIN[b.terrain]) {
      findings.push(finding('closure-violation', b.key,
        `band '${b.key}' names no terrain the Site face carries (${String(b.terrain)})`));
      continue;
    }
    if (!w.terrains.includes(b.terrain)) {
      findings.push(finding('contract-violation', b.key,
        `band '${b.key}' lands on ${b.terrain}, outside the declared width [${w.terrains.join(', ')}]`));
    }
    // The desert cell, judged off the band's own declaration (core/contract.js
    // DESERT_CELL: SYN resolving at Ground). The steer is today's occupant.
    if (b.cell && b.cell.op === 'SYN' && b.cell.stance === 'Cultivating') {
      findings.push(finding('desert-cell', b.key,
        `band '${b.key}' instructs SYN·Cultivating — generation governed by an ambient condition, ` +
        'the cell empty across every language measured'));
    }
  }

  // ── Assembly-level: grain coherence between instruction and material ───────
  // Material = the cell-less user bands (what the talker is handed to work FROM).
  // An instructed stance at grain g is grain-mixed when no material band carries g.
  const materialGrains = new Set(bands
    .filter(b => b.role === 'user' && !b.cell && TERRAIN_GRAIN[b.terrain])
    .map(b => TERRAIN_GRAIN[b.terrain]));
  for (const b of bands) {
    if (!b.cell || !TERRAIN_GRAIN[b.terrain]) continue;
    const g = STANCE_GRAIN[b.cell.stance];
    // Only stances that ask the talker to WORK the material are judged for grain
    // coherence: the generate row (Making / Composing / Cultivating). The
    // differentiate/relate rows (a boundary, a register) do not consume material.
    const generative = ['Making', 'Composing', 'Cultivating'].includes(b.cell.stance);
    if (generative && materialGrains.size && !materialGrains.has(g)) {
      findings.push(finding('grain-mixed', b.key,
        `band '${b.key}' instructs ${b.cell.stance} (${g}-grain) over material at ` +
        `[${[...materialGrains].join(', ')}] — no ${g}-grain material to land on`));
    }
  }

  // ── Assembly-level: ground-inflation against the population gradient ───────
  // The corpus terrain shares are the background; deriveNull gives the extreme-value
  // threshold a share must exceed to be an outlier against that population. The
  // assembly's Ground-ROW share (Void + Field + Atmosphere together) is the measure:
  // the row language populates at ~6%, judged as one mass.
  const { shares, total } = terrainShares(bands);
  const groundShare = (shares.Void || 0) + (shares.Field || 0) + (shares.Atmosphere || 0);
  const nul = deriveNull(Object.values(background), { scale: 'linear', alpha });
  if (total > 0 && Number.isFinite(nul) && groundShare > nul) {
    findings.push(finding('ground-inflation', 'assembly',
      `the Ground row carries ${(groundShare * 100).toFixed(1)}% of the handed text, past the ` +
      `population null of ${(nul * 100).toFixed(1)}% (corpus Ground row: ` +
      `${(((background.Void || 0) + (background.Field || 0) + (background.Atmosphere || 0)) * 100).toFixed(1)}%)`,
      { share: groundShare, threshold: nul }));
  }

  return Object.freeze({
    id,
    ok: findings.every(f => f.severity !== 'error'),
    findings: Object.freeze(findings),
    shares,
  });
};
