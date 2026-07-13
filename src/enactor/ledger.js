// EO: INS·CON·SIG(Entity,Link → Entity,Network, Making,Binding,Tending) — the commitment ledger
// enactor/ledger.js — the ledger seam: a persisting line of commitments and corrections.
//
// The audit ring and the EOT ledger both record assertion and self-correction — and both
// are in-memory rings that drop off the front. Nothing durable ever said "turn 5 asserted
// X; turn 40 found X wrong." This is that spine: an append-only record of what the voice
// COMMITTED (each claim, with whether it spoke as a RELAY of the record — cited, witnessed
// — or in its OWN NAME, authored and uncited) and every CORRECTION appended beside what it
// corrects, never over it (the log's own SEG/retract law, applied to the system's public
// word). Serializable, restorable, exportable — a memory answerable to its own past: the
// thing that can be corrected in public and remain itself.
//
// Entry kinds:
//   assert    { turn, claim, citation, authored, under }     one committed claim; `under` is
//                                                            the def it was measured under (σ)
//   def       { turn, id, defKind, provenance, under }       a stance held fixed and used to cut
//   supersede { turn, was, now, why }                        REC as an act: a def abandoned
//   unsettle  { turn, ref, was, why }                        beside a claim whose basis was pulled
//   resettle  { turn, ref, under, onMass }                   the receipt of a re-measurement
//   correct   { turn, via, was, now, why }                   a correction, beside its error
//     via: 'revision'        the engine superseded its own draft mid-turn
//          'contradicted'    the record denied a committed relation (the libel-grade catch)
//          'self-mismatch'   the world (the user) pushed back on an earlier commitment
//          'absence'         the typed absence replaced an unwitnessed draft at a measured void
//          'expired'         a commitment's predicted return never came (never-witnessed)
//   reflect   { turn, summary }                              the answer's read-back census
//
// The def/supersede/unsettle/resettle projection is σ, the third Experience Engine function,
// lives pure in core/supersede.js, and is folded here at read time (see statusOf/standing/cost).
//
// Pure data — no I/O here. The reader session persists the serialized ledger beside its
// topics (rooms/reader/app.js), so the record survives reload.

import { supersedeEntries, costOfSuperseding, standing, statusOf, unsettledRefs } from '../core/supersede.js';

const MAX_TEXT = 240;
const trim = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

export const createCommitmentLedger = ({ capacity = Infinity, spill = null, now = () => new Date().toISOString() } = {}) => {
  // A finite ledger with nowhere durable to put its cold prefix loses the past quietly at
  // turn 900. σ makes that fatal: statusOf folds the WHOLE log, so an assert shifted off the
  // front while its unsettle remains reports UNSETTLED for a claim that no longer exists, and
  // a def shifted off breaks the dependency walk mid-rebuild. So a finite capacity with no
  // durable spill is a misconfiguration and says so at construction, not at turn 4097.
  if (Number.isFinite(capacity) && typeof spill !== 'function') {
    throw new Error('a finite ledger needs a durable spill: pass spill(rows) or leave capacity Infinity');
  }
  let entries = [];
  let seq = 0, turnSeq = 0, spilled = 0;

  const push = (e) => {
    const entry = Object.freeze({ seq: seq++, t: now(), ...e });
    entries.push(entry);
    // Spill, never drop: the overflowing prefix goes to durable storage, and the fold pulls it
    // back when a read needs it. Nothing vanishes; a self whose past stops happening is not a self.
    if (entries.length > capacity) {
      const cold = entries.splice(0, entries.length - capacity);
      spilled += cold.length;
      spill(cold);
    }
    return entry;
  };

  // recordTurn — fold one finished turn into the ledger. Every field optional; the
  // ledger writes only what the turn actually carried. Returns the turn's index.
  const recordTurn = ({
    question = '', answer = '', route = null,
    bound = null,            // [{ claim, citation }] — the voice's committed claims
    verdicts = null,         // factcheck edge verdicts — 'contradicted' becomes a correction
    reflection = null,       // reflectAnswer(...) — the read-back census
    revisions = null,        // superseded drafts (turn/stages.js revise + absence)
    selfLine = null,         // the monitor's reading (selfline.js) — pushback and expiries
    gated = false, voidSpoken = false,
  } = {}) => {
    const turn = ++turnSeq;
    push({ kind: 'turn', turn, question: trim(question), route, gated: !!gated, voidSpoken: !!voidSpoken });

    for (const b of bound || []) {
      if (!b || !b.claim) continue;
      push({
        kind: 'assert', turn,
        claim: trim(b.claim),
        citation: b.citation || null,
        // authored — spoken in the system's own name (no citation earned, lexically or by
        // the graph): the self's production, distinguished from a relay of the record.
        authored: !b.citation,
        // under — the def this claim was measured under (σ's derivation edge). A turn that
        // measures under no declared def writes null, and every null here is a visible
        // confession: a place the system judged from a stance it did not name.
        under: b.under || null,
      });
    }
    if (!bound?.length && answer) {
      // a turn that produced no claim-grain record still commits its word as one line
      push({ kind: 'assert', turn, claim: trim(answer), citation: null, authored: !voidSpoken, under: null });
    }

    for (const v of verdicts || []) {
      if (v?.verdict !== 'contradicted') continue;
      push({
        kind: 'correct', turn, via: 'contradicted',
        was: trim(v.claim || v.sentence || [v.src, v.via, v.tgt].filter(Boolean).join(' ')),
        now: trim(v.reason || 'the record denies it'),
        why: 'the sources deny a committed relation',
      });
    }
    for (const r of revisions || []) {
      push({
        kind: 'correct', turn, via: voidSpoken && r.replacedBy && trim(r.replacedBy) === trim(answer) ? 'absence' : 'revision',
        was: trim(r.draft), now: trim(r.replacedBy), why: trim(r.why) || null,
      });
    }
    for (const c of selfLine?.corrections || []) {
      push({
        kind: 'correct', turn, via: 'self-mismatch',
        was: trim(c.expected), now: trim(c.sensed),
        why: 'the world pushed back on an earlier commitment',
      });
    }
    for (const e of selfLine?.expired || []) {
      push({ kind: 'correct', turn, via: 'expired', was: trim(e), now: null, why: 'the predicted return never came' });
    }

    if (reflection?.summary) {
      const s = reflection.summary;
      push({ kind: 'reflect', turn, summary: Object.freeze({
        relations: s.relations ?? 0, corroborated: s.corroborated ?? 0,
        singleSource: s.singleSource ?? 0, interpretation: s.interpretation ?? 0,
        unwitnessed: s.unwitnessed ?? 0, origins: s.origins ?? 0,
      }) });
    }
    return turn;
  };

  const ofKind = (k) => entries.filter((e) => e.kind === k);

  // def — a stance the system holds and will be judged under. A basis, a frame, anything held
  // fixed and used to cut. It gets an id because it can be lost. The basis stops being an
  // import and becomes a thing in the log with a name, a provenance, and a lifespan.
  const def = ({ id, kind, provenance = null, under = null, turn = turnSeq }) =>
    push({ kind: 'def', turn, id, defKind: kind, provenance, under });

  // supersede — REC as an act. Everything measured under the old def is unsettled: not wrong,
  // not retracted, not standing. It returns to standing only by being measured again. The bill
  // is read (costOfSuperseding) before the entries are appended (supersedeEntries), and the
  // bill quoted is the bill returned.
  const supersede = ({ was, now: replacement = null, why = null } = {}) => {
    const bill = costOfSuperseding(entries, was);
    for (const e of supersedeEntries(entries, { was, now: replacement, why, turn: turnSeq })) push(e);
    return bill;
  };

  return Object.freeze({
    recordTurn,
    // direct appends, for callers outside the turn (the metabolism, a room)
    correct: (c) => push({ kind: 'correct', turn: turnSeq, ...c }),
    def,
    supersede,
    cost: (defId) => costOfSuperseding(entries, defId),   // see the bill before paying
    standing: () => standing(entries),                     // what the system still stands behind
    statusOf: (s) => statusOf(entries, s),
    unsettled: () => unsettledRefs(entries),
    entries: () => entries.slice(),
    asserts: () => ofKind('assert'),
    corrections: () => ofKind('correct'),
    get size() { return entries.length; },
    get turns() { return turnSeq; },
    get spilled() { return spilled; },
    exportJSONL: () => entries.map((e) => JSON.stringify(e)).join('\n'),
    serialize: () => ({ v: 1, seq, turnSeq, spilled, entries: entries.slice() }),
    restore(snap) {
      if (!snap || snap.v !== 1 || !Array.isArray(snap.entries)) return false;
      entries = snap.entries.map((e) => Object.freeze({ ...e }));
      seq = Number.isFinite(+snap.seq) ? +snap.seq : entries.length;
      turnSeq = Number.isFinite(+snap.turnSeq) ? +snap.turnSeq : 0;
      spilled = Number.isFinite(+snap.spilled) ? +snap.spilled : 0;
      return true;
    },
  });
};
