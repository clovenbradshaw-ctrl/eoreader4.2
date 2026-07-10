// EO: SYN·EVA·DEF(Network,Field → Network,Field,Lens, Composing,Tracing,Making) — weight of the turn; the arc broadcast
// write/gravity.js — the weight of the turn: the surf's discarded dynamics, broadcast.
// (docs/weight-of-the-turn.md)
//
// The surf computes a reading's DYNAMICS — where it arrested, where it was rewritten
// (the RECs), how much each stop matters to the live thread — and the write path kept
// almost none of it: stopToCell takes the node, not the movement between nodes, and the
// reader gets equally-weighted conclusions without the arriving-at. In the global-
// workspace sense that trajectory was computed and never broadcast. This module is the
// broadcast, in four coupled moves, each riding an organ that already exists:
//
//   1. arcGravity  — the brief widened from propositions to RELATIONS-BETWEEN: the
//                    trajectory's phases and turns (surfer/trajectory.js), lifted into a
//                    weighted payload a brief can carry.
//   2. speakArc    — the turn RENDERED as a turn ("at first…, then…"), the superseded
//                    reading carried forward as what the new one rose out of (a REC
//                    transcends and includes the bond it supersedes) — never flattened
//                    into juxtaposed equal claims.
//   3. connectiveLeash — every rendered connective is a CLAIMED edge at the discourse
//                    grain. A contrast ("but", "at first…then") claims a turn; a sequence
//                    ("then", "later") claims an order; a cause ("therefore") claims what
//                    an arc never holds. Each is licensed against the arc or flagged —
//                    the correspond.js discipline, one grain up.
//   4. turnWeights — gravity is not uniform heaviness. The rewrite magnitude at each REC
//                    (the surf field's own Bayesian surprise over its median) and the
//                    thread salience (the Born weight |⟨T|s⟩|², surfer/salience.js) set
//                    the DISTRIBUTION of emphasis: the heaviest form goes to the turn
//                    where the reading worked hardest; an off-thread relation is
//                    subordinated below the same noise null the surfer rides — marked,
//                    never erased.
//
// Everything here operates on graph and prose — no decode-time logits — so it runs on
// any backend. And the honest accounting stands in both directions: a rendered turn is a
// REPORTED reconsolidation, not a felt one; but because every form is read off the log
// (the recCursors are append-only supersessions, the weights are measured surprise), the
// system can only render a revision it genuinely underwent. Gravity that cannot earn
// itself decays to the flat surface — which is the correct failure.

import { deriveNull } from '../../core/index.js';
import { linkSalience } from '../../surfer/index.js';
import { toPast } from './morph.js';
import { createRule } from './eva.js';
import { claimsOf } from './witness.js';

// ── move 4 (the measure): the rewrite magnitude per turn ─────────────────────
// turnWeights(surf) → [{ cursor, weight }] — for each REC frame-break, how hard the
// reading was rewritten there: the surf field's Bayesian surprise at the cursor over the
// field's median (the same margin frame.js reads at the peak), normalised so the
// strongest turn weighs 1. A surf with no field (the EOT path) yields no weights — the
// turns are still real (they are on the log), they just carry no measured magnitude.
export const turnWeights = (surf) => {
  const recs = surf?.recCursors || [];
  if (!recs.length) return [];
  const field = surf?.field || [];
  const bayes = new Map(field.filter(f => Number.isFinite(f?.bayes)).map(f => [f.idx, f.bayes]));
  const xs = [...bayes.values()];
  const med = median(xs);
  const raw = [...new Set(recs)].map(c => ({
    cursor: c,
    margin: Math.max(0, (bayes.get(c) ?? med) - med),
  }));
  const top = Math.max(0, ...raw.map(r => r.margin));
  return raw
    .sort((a, b) => a.cursor - b.cursor)
    .map(r => Object.freeze({ cursor: r.cursor, weight: top > 0 ? r.margin / top : 0 }));
};

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── move 1: the arc lifted into a weighted brief ─────────────────────────────
// arcGravity(traj, { surf, thread }) → the trajectory (surfer/trajectory.js) with its
// dynamics made carryable: each turn weighted by rewrite magnitude, each relation scored
// against the live thread (the Born weight of the link's participants), the off-thread
// ones SUBORDINATED below the thread's own noise null — marked, never erased (suppress-
// never-erase). Null when there is no trajectory to lift.
export const arcGravity = (traj, { surf = null, thread = null } = {}) => {
  if (!traj || !traj.phases?.length) return null;

  // every REC boundary the trajectory pivots on, weighted where the surf measured it
  const measured = new Map(turnWeights(surf).map(t => [t.cursor, t.weight]));
  const turns = [...new Set(traj.turns || [])].sort((a, b) => a - b)
    .map(c => Object.freeze({ cursor: c, weight: measured.get(c) ?? 0 }));
  let heaviest = null;
  for (const t of turns) if (heaviest == null || t.weight > heaviest.weight) heaviest = t;

  // salience per relation: the Born weight of the LINK (focus ↔ other) against the
  // thread's figures — null (unmeasured) when no thread is live, so an unconditioned
  // brief subordinates nothing.
  const figures = thread?.figures instanceof Set ? thread.figures : new Set(thread?.figures || []);
  const focusLab = traj.focus != null ? String(traj.focus).toLowerCase() : null;
  const scoreOf = (b) => {
    if (!figures.size) return null;
    const participants = [focusLab, b.other != null ? String(b.other).toLowerCase() : null]
      .filter(x => x != null);
    return linkSalience(figures, { participants });
  };
  const rels = [];
  const phases = traj.phases.map(ph => ({
    phase: ph.phase,
    span: ph.span,
    relations: ph.relations.map(b => {
      const r = { ...b, salience: scoreOf(b), subordinate: false };
      rels.push(r);
      return r;
    }),
  }));

  // SUBORDINATION (move 4, the distribution): a link whose far participant is ON the
  // thread lies along it and always speaks; a link reaching off the thread (the focus's
  // bond to an unactivated figure) is subordinate unless its Born weight beats the
  // thread's own noise null (deriveNull — the same VOID boundary the surfer rides; an
  // unmeasurable null spares nothing, honest abstention). And subordination may TRIM the
  // telling, never silence it: when fewer than two phases would still speak, the arc
  // rides whole — the movement is the thing being broadcast.
  if (figures.size && rels.length) {
    const series = rels.map(r => r.salience || 0).filter(s => s > 0);
    for (const r of rels) {
      const farOn = r.other != null && figures.has(String(r.other).toLowerCase());
      if (farOn) { r.subordinate = false; continue; }
      if ((r.salience || 0) <= 0) { r.subordinate = true; continue; }
      const nul = deriveNull(series, { scale: 'linear', alpha: 0.05, leaveOut: r.salience });
      r.subordinate = !Number.isFinite(nul) || r.salience <= nul;
    }
    const speaks = (ph) => ph.relations.some(x => x.role === 'subj' && !x.subordinate);
    if (phases.filter(speaks).length < 2) for (const r of rels) r.subordinate = false;
  }

  return Object.freeze({
    focus: traj.focus,
    phases: Object.freeze(phases.map(ph => Object.freeze({ ...ph, relations: Object.freeze(ph.relations.map(Object.freeze)) }))),
    turns: Object.freeze(turns),
    heaviest: heaviest ? heaviest.cursor : null,
    gained: traj.gained,
    lost: traj.lost,
    subordinated: rels.filter(r => r.subordinate).length,
  });
};

// ── move 2: the turn voiced ───────────────────────────────────────────────────
// Content has gravity when you can feel it was revised. The recCursors are the revision,
// on the record — so the renderer voices the supersession instead of flattening it:
// "At first S fed O. Then, where she had fed him, she renounced him." The subordinate
// clause carries the abandoned reading forward as the thing the new one rose out of
// (transcend-and-include), and only the HEAVIEST turn earns that full form — everything
// heavy is nothing heavy — the lighter turns take plain sequence.

const SUBJECT_PRONOUN = { m: 'he', f: 'she', p: 'they' };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const joinList = (xs) => xs.length <= 1 ? (xs[0] || '')
  : xs.length === 2 ? `${xs[0]} and ${xs[1]}`
  : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;

// How many predicates the supersession compound may carry, and how long it may run,
// before a reader cannot hold it in one breath — the read-back bounds (realize.js's
// CONJUNCT_CAP discipline at the arc grain).
const SUPERSEDE_PRED_CAP = 3;
const SUPERSEDE_CHAR_CAP = 220;

const relKey = (r) => `${r.role}:${String(r.via).toLowerCase()}:${String(r.other ?? '').toLowerCase()}`;

// ONE predicate surface for a trajectory bond — narrative past — exported so every
// renderer of a bond (the arc speech here, a composition walk's turn directive) says it
// the same way and a morphology fix lands once. Byte-identical to what predsOf and
// speakArc always rendered.
export const predOf = (b) =>
  `${toPast(String(b.via))}${b.other != null ? ' ' + b.other : ''}`;

// the phase's speakable predicates: the focus's own (subj-role), non-subordinate bonds,
// deduped, in the narrative past.
const predsOf = (ph) => {
  const seen = new Set();
  const out = [];
  for (const b of ph.relations || []) {
    if (b.role !== 'subj' || b.subordinate) continue;
    const p = predOf(b);
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
};

// the relation the earlier phase held that the later one dropped — the superseded
// reading the turn rose out of. The first such bond, in the arrow-of-time order.
// Exported so a composition walk can voice the supersession at a phase boundary
// (the same distribution discipline speakArc keeps: the full form only at the
// heaviest turn).
export const supersededBetween = (before, after) => {
  const held = new Set((after.relations || []).map(relKey));
  return (before.relations || []).find(r => r.role === 'subj' && !r.subordinate && !held.has(relKey(r))) || null;
};

// speakArc(arc, { genders }) → the turn-voiced surface, or null when there is no
// movement to voice (fewer than two speakable phases, or no turn on the log) — the flat
// surface then stands, which is the correct failure: a turn is only ever rendered where
// a REC actually fired. The supersession form is a CONVENTION under an eva rule
// (write/eva.js): applied speculatively, read back against the breath bounds, committed
// only while it holds; a break falls back to the safe surface — plain sequence.
export const speakArc = (arc, { genders = {} } = {}) => {
  if (!arc) return null;
  const spoken = (arc.phases || []).map(ph => ({ ph, preds: predsOf(ph) })).filter(s => s.preds.length);
  if (spoken.length < 2 || !arc.turns.length) return null;

  const name = String(arc.focus ?? 'it');
  const g = genders[name] ?? genders[name.split(/\s+/)[0]] ?? 'n';
  const pron = SUBJECT_PRONOUN[g] || null;

  // which turn governs the boundary INTO a spoken phase: the last REC at or before the
  // phase's first bond — the restructuring the phase crossed to exist.
  const turnInto = (s) => {
    const at = s.ph.relations?.[0]?.at ?? s.ph.span?.[0] ?? 0;
    let best = null;
    for (const t of arc.turns) if (t.cursor <= at && (best == null || t.cursor > best.cursor)) best = t;
    return best;
  };

  const supersession = createRule();
  const sentences = [];
  let named = false;
  const subj = () => { const s = named && pron ? pron : name; named = true; return s; };

  for (let i = 0; i < spoken.length; i++) {
    const s = spoken[i];
    if (i === 0) {
      sentences.push(`At first, ${subj()} ${joinList(s.preds)}.`);
      continue;
    }
    const t = turnInto(s);
    const lost = supersededBetween(spoken[i - 1].ph, s.ph);
    // the full supersession form is reserved for the HEAVIEST turn (move 4: the
    // distribution of emphasis), and only while the eva rule holds.
    if (t && t.cursor === arc.heaviest && lost && supersession.on) {
      const lostPred = predOf(lost);
      const a = subj();
      const line = `Then, where ${a} had ${lostPred}, ${pron || name} ${joinList(s.preds)}.`;
      // READ-BACK (eva): commit the compound only while a reader can hold it in one
      // breath — within the predicate and length bounds. A break strains the rule and
      // falls back to the safe surface below.
      if (s.preds.length <= SUPERSEDE_PRED_CAP && line.length <= SUPERSEDE_CHAR_CAP) {
        supersession.hold();
        sentences.push(line);
        continue;
      }
      supersession.break();
    }
    // the safe surface: plain sequence — the order the log holds, no claimed weight.
    sentences.push(`Then ${subj()} ${joinList(s.preds)}.`);
  }
  return sentences.join(' ');
};

// ── the arc as a prompt block ─────────────────────────────────────────────────
// arcLines(arc) → the plain-language arc section a talker prompt carries (move 1's
// broadcast into the LLM path). Phases and turns in surface words — no operator codes,
// no ids (the surface discipline) — with each turn's measured weight, so the talker can
// place emphasis where the reading worked hardest. Empty string when there is no
// movement to carry (the byte-identical default everywhere it is threaded).
export const arcLines = (arc) => {
  if (!arc || (arc.phases || []).length < 2 || !arc.turns.length) return '';
  const spoken = arc.phases.map(ph => ({ ph, preds: predsOf(ph) })).filter(s => s.preds.length);
  if (spoken.length < 2) return '';
  const focus = String(arc.focus ?? 'the focus');
  const lines = [];
  for (let i = 0; i < spoken.length; i++) {
    if (i > 0) {
      const at = spoken[i].ph.relations?.[0]?.at ?? spoken[i].ph.span?.[0] ?? 0;
      let t = null;
      for (const c of arc.turns) if (c.cursor <= at && (t == null || c.cursor > t.cursor)) t = c;
      const w = t ? t.weight : 0;
      const tag = t && t.cursor === arc.heaviest && w > 0
        ? `— the turn (the strongest — weight ${w.toFixed(2)}) →`
        : `— a turn (weight ${w.toFixed(2)}) →`;
      lines.push(`  ${tag}`);
    }
    lines.push(`  ${focus}: ${spoken[i].preds.join(', ')}`);
  }
  return `How the reading moved on ${focus} — its own arc, phase to phase (each turn is where the reading was rewritten; the weight is how hard):\n${lines.join('\n')}`;
};

// ── move 3: the connective leash ──────────────────────────────────────────────
// A rendered connective is a CLAIMED edge at the discourse grain: a contrast claims a
// turn the log must hold, a sequence claims an order the arc must span, a cause claims
// what a trajectory NEVER holds (it carries order and turns, not causes — the post-hoc
// fallacy is exactly reading the arrow of time as an arrow of cause). connectiveLeash
// checks a talker's prose against the arc the way correspond.js checks its claimed
// edges against the graph: each connective licensed or flagged, nothing gagged — the
// caller strips or surfaces (flag-and-tell).
const CONNECTIVES = [
  { kind: 'contrast', re: /\b(?:but|yet|however|instead|whereas|no longer|at first|until)\b/gi },
  { kind: 'sequence', re: /\b(?:then|later|afterwards?|eventually|subsequently|by the end)\b/gi },
  { kind: 'cause',    re: /\b(?:therefore|thus|hence|consequently|as a result|because|so that|which is why)\b/gi },
];

// connectiveLeash(prose, arc) → { claims, unlicensed, clean }. Licensing is read off
// the arc alone: contrast needs a turn on the log, sequence needs at least two phases,
// cause is never licensed by an arc (the honest rule — a "therefore" needs a witness of
// a different type than order, and the arc cannot supply it). A null arc licenses
// nothing: the leash is only ever run where an arc was in hand.
export const connectiveLeash = (prose, arc) => {
  const turns = arc?.turns?.length || 0;
  const phases = arc?.phases?.length || 0;
  const claims = [];
  for (const sentence of claimsOf(prose)) {
    for (const { kind, re } of CONNECTIVES) {
      for (const m of sentence.matchAll(re)) {
        const licensed = kind === 'contrast' ? turns > 0
          : kind === 'sequence' ? phases >= 2
          : false;
        claims.push(Object.freeze({ connective: m[0].toLowerCase(), kind, licensed, sentence }));
      }
    }
  }
  const unlicensed = claims.filter(c => !c.licensed);
  return Object.freeze({
    claims: Object.freeze(claims),
    unlicensed: Object.freeze(unlicensed),
    clean: unlicensed.length === 0,
  });
};

// The system-prompt cue that teaches a talker to read the arc block — voice the turn as
// a turn, weight by the measured magnitude, and claim no cause the arc does not show.
export const ARC_CUE = 'After the graph is the reading\'s own arc — its phases and the '
  + 'turns where the reading was rewritten, each turn weighted by how hard. Voice the '
  + 'movement as movement — at first…, then… — carrying the earlier reading forward as '
  + 'what the later one rose out of, with the heaviest emphasis at the strongest turn. '
  + 'The arc shows order and turns, never causes: add no therefore it does not contain.';
