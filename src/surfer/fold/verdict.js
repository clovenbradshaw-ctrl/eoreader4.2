// EO: EVA·DEF(Network,Lens → Lens, Tracing,Binding) — living-or-dead + sayable-or-not
// fold/verdict.js — THE TWO CROSS-CUTTING CLASSIFIERS: living-or-dead, sayable-or-not.
//
// docs/cognition-catalog.md is the map; this is the machine. Both classifiers are
// reads over what the substrate and the log already hold — no model, no new state,
// nothing written back (the same discipline as every fold).
//
// LIVING OR DEAD — the successor-mode verdict. core/spectral.js sorts the three
// Modes into operations on ρ: Differentiate SHARPENS (project, dephase — entropy
// falls), Relate PRESERVES the spectrum (identity, rotation, transport), Generate
// PRODUCES (raise rank or entropy). Read against a held tension, that table IS the
// sustain-or-collapse verdict, and it is ternary:
//
//   Relate-close        → sustained   the tension coordinate survives (live)
//   Differentiate-close → spent-down  projected away; one side kept (dead, stored)
//   Generate-close      → spent-up    consumed into a new whole or frame (dead, transformed)
//
// So the verdict is not new machinery: it is the MODE of the next operator to touch
// the tension — a projection of the bigram predict/recurrence.js already counts,
// checkable in ρ by the sign of the entropy change. The substrate default is life:
// detectTensions mints every eo:Tension resolved:false and nothing ever spends one,
// so a tension with no successor is sustained. What this module adds is the death
// certificate. Applied to the EVA row of the compound grid (a tension IS a held
// EVA), the nine successors name the nine fates of a contradiction — FATE_OF.
//
// The stream handed to classifyTensions is the SUCCESSOR stream — enacted deposits
// (readReflections · readConnections) and located RECs (recEventsOf), which are
// post-constitution by nature. Do not hand it the depicted events the tension was
// minted FROM: the two competing DEFs that constitute a tension are its birth, not
// its death.
//
// SAYABLE OR NOT — the router. docs/chorus.md: "Model output is a compression,
// structure narrated into prose with the coordinate lost, invisibly. A fold is a
// projection, addressed and recoverable." A reframing, a held tension, or a
// straining EVA parks a coordinate prose cannot address → narrate-only (hand it to
// the phraser marked, never as a flat fact). A flat DEF or CON verbalizes without
// loss — an analogy connection is void AND verbalizable, because its whole content
// is the enumerable correspondences. heldBy routing is the membrane's existing rule
// ("voice the tension instead of asserting either side" — substrate.js) generalized
// from one node kind to all of them. The line is drawn by the operator signature,
// never by band: sayability is about what prose can carry, the firewall is about
// what can witness, and the two must not be confused.
//
// Deterministic, DOM-free, model-free, import-free — shapes in, verdicts out.

// The ACT face's Mode axis (docs/operators.md): the one lookup everything rides.
export const MODE_OF = Object.freeze({
  NUL: 'differentiate', SEG: 'differentiate', DEF: 'differentiate',
  SIG: 'relate',        CON: 'relate',        EVA: 'relate',
  INS: 'generate',      SYN: 'generate',      REC: 'generate',
});

export const modeOf = (op) => MODE_OF[op] || null;

// The ternary verdict, by mode — the spectral families read as fates of a held tension.
const VERDICT_OF_MODE = Object.freeze({
  relate: 'sustained', differentiate: 'spent-down', generate: 'spent-up',
});

export const verdictOf = (op) => VERDICT_OF_MODE[MODE_OF[op]] || null;

// The EVA row of the composition grid — the nine fates of a contradiction, one per
// successor operator (docs/cognition-catalog.md; the assignments are projection sketch).
export const FATE_OF = Object.freeze({
  SIG: 'flagged',       CON: 'juxtaposed',     EVA: 'irony',
  NUL: 'aporia',        SEG: 'disambiguated',  DEF: 'sarcasm',
  INS: 'experiment',    SYN: 'sublation',      REC: 'metaphor',
});

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// The referent keys a tension answers to: the endpoints of its held members (ids and
// labels, both — a successor may speak either), plus the tension's own id, so a
// bears-on connection (whose `b` is the tension id) touches it directly.
const referentKeysOf = (t, { assertions = [], values = [] } = {}) => {
  const keys = new Set([norm(t.id)]);
  const members = new Set(t.holds || []);
  for (const a of assertions) {
    if (!members.has(a.id)) continue;
    for (const k of [a.s?.id, a.s?.label, a.o?.id, a.o?.label]) { const n = norm(k); if (n) keys.add(n); }
  }
  for (const v of values) {
    if (!members.has(v.id)) continue;
    for (const k of [v.ref, v.label]) { const n = norm(k); if (n) keys.add(n); }
  }
  return keys;
};

// What an event touches — the referent-bearing fields the enacted deposits actually
// carry (focus/about on reflections, a/b on connections, alongAxis on reframings)
// plus the depicted endpoint shapes. A floor, not a ceiling: coreference-grade touch
// detection is the documented next step (docs/cognition-catalog.md, seams).
const touchKeysOf = (e) => {
  const out = [];
  const push = (x) => { const n = norm(x); if (n) out.push(n); };
  for (const f of ['focus', 'about', 'particular', 'a', 'b', 'ref', 'label']) {
    if (e[f] != null && typeof e[f] !== 'object') push(e[f]);
  }
  for (const f of ['s', 'o', 'src', 'tgt']) {
    const x = e[f];
    if (x && typeof x === 'object') { push(x.id); push(x.label); }
  }
  if (Array.isArray(e.alongAxis)) for (const ax of e.alongAxis) push(ax);
  return out;
};

// classifyTensions — the living-or-dead read. For every held tension: walk the
// successor stream in log order, keep each on-alphabet event that touches the
// tension's referents, and report the whole trajectory (the career — analogy→REC→
// DEF is the life of a metaphor read off one log) plus the current verdict: the
// LAST toucher's, or sustained/held when nothing has touched it.
export const classifyTensions = (substrate, events = []) => {
  const tensions = substrate?.tensions || [];
  return tensions.map((t) => {
    const refs = referentKeysOf(t, substrate || {});
    const trajectory = [];
    for (const e of (events || [])) {
      if (!e || !MODE_OF[e.op]) continue;                       // off-alphabet → not a move
      if (!touchKeysOf(e).some((k) => refs.has(k))) continue;   // elsewhere → not a successor
      trajectory.push(Object.freeze({
        op: e.op, mode: MODE_OF[e.op], verdict: verdictOf(e.op), fate: FATE_OF[e.op],
        at: e.cursor ?? e.sentIdx ?? e.seq ?? null,
      }));
    }
    const last = trajectory.length ? trajectory[trajectory.length - 1] : null;
    return Object.freeze({
      tension: t.id, kind: t.kind ?? null, label: t.label ?? null,
      referents: Object.freeze([...refs]),
      successor: last?.op ?? null,
      verdict: last?.verdict ?? 'sustained',   // the substrate default is life
      fate: last?.fate ?? 'held',
      trajectory: Object.freeze(trajectory),
    });
  });
};

// recEventsOf — the located RECs (surf.recAxes) as successor-shaped events, so a
// reframing can close a tension upward. The surfer writes recCursors, not log
// events; this is the one adapter the verdict needs to see them.
export const recEventsOf = (surf) =>
  Object.freeze((surf?.recAxes || []).map((rec) => Object.freeze({
    op: 'REC', cursor: rec.cursor ?? null,
    alongAxis: Object.freeze((rec.alongAxis || []).slice()),
    trigger: rec.trigger ?? null, layer: rec.layer ?? null,
  })));

// ── SAYABLE OR NOT ─────────────────────────────────────────────────────────────

export const VERBALIZABLE = 'verbalizable';
export const NARRATE_ONLY = 'narrate-only';

const say = (route, reason) => Object.freeze({ route, reason });

// sayability — which of the reading's own holdings prose can carry without loss.
// Reads the signature the node already wears (op · kind · verdict · heldBy); the
// caution default is narrate-only, because compressing an unrecognized holding
// loses its coordinate invisibly — the exact failure the router exists to prevent.
export const sayability = (node) => {
  if (!node || typeof node !== 'object') return say(NARRATE_ONLY, 'unrecognized — held with caution');

  // REC-involving — the reframe carries a coordinate the structure plane cannot address.
  if (node.op === 'REC' || 'alongAxis' in node) {
    return say(NARRATE_ONLY, 'REC-involving — the reframe carries a coordinate prose loses');
  }

  // A tension — voice the held-both, never a side. (A spent one's product is a plain value.)
  if (node.kind === 'competing-fills' || node.kind === 'polarity-clash' || Array.isArray(node.holds)) {
    return node.resolved === true
      ? say(VERBALIZABLE, 'spent tension — its product is a stored value')
      : say(NARRATE_ONLY, 'held tension — voice the tension, not a side');
  }

  // A member a tension has claimed — the membrane's rule, generalized to the router.
  if (node.heldBy) return say(NARRATE_ONLY, 'claimed by a tension — the tension speaks for it');

  // EVA-flavoured nodes (reflections, meta-reflections, EVA events) route by verdict:
  // a settled judgment is a flat report; an open one is still holding.
  const evaish = node.op === 'EVA' || node.reflection === true || node.meta === true
    || ('reading' in node && 'verdict' in node && !('kind' in node));
  if (evaish) {
    return node.verdict === 'confirm'
      ? say(VERBALIZABLE, 'settled EVA — the judgment closed')
      : say(NARRATE_ONLY, 'held EVA — the judgment is still open');
  }

  // Flat CON — echo, analogy, bears-on, or a firm arrow. The content is the enumerable
  // correspondence, so it verbalizes without loss; band does not enter into it.
  if (node.op === 'CON' || node.kind === 'echo' || node.kind === 'analogy' || node.kind === 'bears-on') {
    return say(VERBALIZABLE, 'flat CON — enumerable correspondence');
  }
  if (node.s && node.p && node.o) return say(VERBALIZABLE, 'firm CON — lossless');

  // Flat DEF — a fixed value reads as a state and hands over clean.
  if ('ref' in node && 'value' in node) return say(VERBALIZABLE, 'firm DEF — lossless');

  // Any other on-alphabet flat event (SIG, INS, NUL, SEG, SYN) — nothing parked.
  if (MODE_OF[node.op]) return say(VERBALIZABLE, `flat ${node.op} — no coordinate parked`);

  return say(NARRATE_ONLY, 'unrecognized — held with caution');
};

// routeSubstrate — the whole substrate partitioned for the membrane: what may be
// phrased as-is, and what must be handed over marked. Pure presentation prep;
// nothing is dropped and nothing is upgraded.
export const routeSubstrate = (substrate) => {
  const groups = ['assertions', 'values', 'tensions', 'reframings', 'reflections', 'metaReflections', 'connections'];
  const verbalizable = [];
  const narrateOnly = [];
  for (const g of groups) {
    for (const node of (substrate?.[g] || [])) {
      const s = sayability(node);
      (s.route === VERBALIZABLE ? verbalizable : narrateOnly)
        .push(Object.freeze({ id: node.id ?? null, group: g, reason: s.reason }));
    }
  }
  return Object.freeze({ verbalizable: Object.freeze(verbalizable), narrateOnly: Object.freeze(narrateOnly) });
};
