// EO: NUL·SIG·EVA(Entity,Network → Void,Network,Lens, Clearing,Binding,Composing) — the blind-structure loop + the propositional continuity gate
// model/blind-structure.js — hand a REMOTE model the EOT STRUCTURE of a referent and NOTHING
// of the referent, let it reason RATIONALLY over the opaque shape, then bind the real referents
// back on the return and GATE the result on propositional continuity.
//
// docs/blind-structure.md. This is the third membrane in the codebase, aimed at a new use:
// GENERATION, ideally CODE.
//   · write/cursor.js    keeps hashIds OUT so the model sees clean NAMES        (protects CORRECTNESS)
//   · write/redact.js    keeps NAMES  OUT so a remote model sees only TOKENS    (protects CONFIDENTIALITY)
//   · this file          keeps MEANING out so the model reasons over pure SHAPE (protects GROUNDING)
//
// The wager (docs/pocket-universe-grounding.md, factcheck/propositions.js): a frontier model is
// far better at STRUCTURE — ordering, dependency, what-uses-what, where a thread runs into the
// void — than it is at resisting the pull of what a name "should" mean. So we take the structure
// and throw the meaning away. `Referent7 -> Referent2 : imports` is something the model can reason
// about coldly; it cannot confabulate a fact about `chargeCard` it half-remembers, because it never
// learns `Referent7` is `chargeCard`. It does the hard reasoning blind; we re-attach the referents.
//
//   doc ──emitEot(alias)──▶ blinded EOT ──▶ ANTHROPIC API ──▶ EOT over handles ──restore──▶ EOT over referents
//    │        (redact.js membrane)          (any backend)                       (redact.js)          │
//    │                                                                                    semantic pass
//    │                                                                              (re-read as its own doc)
//    └──────────────────────── propositional continuity gate ◀───────────────────────────┘
//
// THE RETURN PATH is the part this file adds over the existing membrane:
//   1. RESTORE   every opaque handle back to its real referent (redact.js `restore`), live if streaming.
//   2. SEMANTIC PASS  re-read the restored EOT as the model's OWN conjecture — enactor door, so a note
//                     made of the reading cannot pass for the world (§8 type law, ingest/eot.js).
//   3. CONTINUITY GATE  the novel check. The model reasoned over BLIND handles, so any proposition it
//                     asserts among real referents that the input did NOT contain is a relation it
//                     FABRICATED about things it could not see — the one failure a blind reasoner is
//                     prone to. The gate is a correspondence between two readings (the veto posture of
//                     factcheck/*), never a claim against truth: it makes the output faithful to the
//                     STRUCTURE it was given, not the structure faithful to the world.
//
// It is a leaf over the existing membrane (redact.js), the ingester (eot.js), and the graph
// (core project/proposition). No DOM, no network of its own — a backend (`model.phrase`) is
// injected, so the ECHO backend drives it in a test and the CLAUDE backend (model/anthropic.js)
// drives it against the real Anthropic API with only a key changed. tests/blind-structure.test.js
// is the regression guard; probes/blind-structure.mjs is the runnable narrative.

import { redactEot, restore, assertNoNameLeak, EOT_LEGEND } from '../weave/write/index.js';
import { eotDoc } from '../organs/ingest/index.js';
import { projectGraph, propositionOfEdge } from '../core/index.js';
import { POLARITY } from './polarity.js';

// ── the charge — a REASONER over structure, not the prosifier redact.js ships ──────────────────
// redact.js's EOT carrier tells the model to turn the reading into speech. This tells it to REASON
// over the reading and answer in the SAME notation, over the SAME handles — the shape it can work,
// with the meaning withheld. The `!clm` register (redact.js EOT_LEGEND) is how it marks a relation
// it is PROPOSING rather than reading off the given structure; the gate reads that distinction.
export const blindCharge = (task) =>
  'You reason over STRUCTURE alone. The reading below is EOT — a graph of OPAQUE handles: '
  + 'Referent1, Referent2, … name entities; Value1, Value2, … name literal values. You do NOT '
  + 'know what any handle refers to and MUST NOT guess — reason only from the shape: the types, '
  + 'the relations, the attributes, the asserted absences, and how the handles connect.\n\n'
  + EOT_LEGEND
  + '\nAnswer in EOT — the SAME notation, over the SAME handles. Introduce a handle only with an '
  + 'explicit `X : T` line. Assert a relation between two handles ONLY if the given structure '
  + 'already contains it; a relation you are PROPOSING (not reading off the structure) must be '
  + 'marked a claim with `!clm`, never stated as settled fact. Add no meaning the handles do not carry.\n\n'
  + `TASK: ${task}`;

// blindPrompt(doc, { task, max }) → { messages, table, names } — the outgoing payload, proven
// clean. It reuses redact.js's audited EOT carrier (the membrane that builds the alias and asserts
// no referent surface survives) and swaps in the reasoner charge; the trailing "say this as
// speech" line is replaced with the reasoning cue. assertNoNameLeak re-proves MY messages — the
// ones that actually leave — fail-closed, because the payload I send is the one that must be clean.
export const blindPrompt = (doc, { task = 'Read the structure and report what it implies.', max = Infinity } = {}) => {
  const { prompt, table, names } = redactEot(doc, { max });
  const body = prompt.user.replace(/\n*Now say this reading as natural speech:\s*$/, '');
  const messages = [
    { role: 'system', content: blindCharge(task) },
    { role: 'user', content: `${body}\n\nNow reason over this structure and answer in EOT:` },
  ];
  assertNoNameLeak(messages, names);   // the membrane invariant, on the exact payload that leaves
  return Object.freeze({ messages, table, names });
};

// ── live restoration (streaming) ───────────────────────────────────────────────────────────────
// The model streams opaque handles; we hand the caller real referents token by token without ever
// emitting a half-restored handle. Mirror of redact-remote.js's stream restorer, widened to the
// Referent|Value token shape (and its optional ex: QName prefix) redact.js `restore` inverts. A
// handle is a run of [A-Za-z0-9:]; we hold back the maximal trailing such run (it might still be
// growing into a handle), restore and emit the safe prefix, flush() releases the tail at stream end.
export const makeStreamRestorer = (table) => {
  let raw = '';
  let cut = 0;                       // chars of `raw` already emitted, at a safe boundary
  const TAIL = /[A-Za-z0-9:]+$/;
  const flushTo = (safe) => {
    if (safe <= cut) return '';
    const chunk = raw.slice(cut, safe);
    cut = safe;
    return restore(chunk, table);
  };
  return {
    push(piece) {
      raw += String(piece ?? '');
      const m = TAIL.exec(raw);
      return flushTo(raw.length - (m ? m[0].length : 0));
    },
    flush() { return flushTo(raw.length); },
  };
};

// ── propositions, keyed by REFERENT ──────────────────────────────────────────────────────────────
// propositionsOf(doc) → Map<base, { sub, rel, dif, pol }> where base = "sub ⟩ rel ⟩ dif" over the
// real LABELS (not the hashIds). Labels are what make two independent readings comparable: the input
// doc and the model's restored output mint different hashIds for the same referent, but they share
// the surface label the alias round-tripped. Polarity rides on the value, not the key, so a
// polarity FLIP (a contradiction) shows as the same base carrying an opposite pole — the gate's
// sharpest signal. Built off projectGraph's SIG/CON edges via the core's own propositionOfEdge, so
// this reads the same relation currency the edge-grounding veto does (factcheck/correspond.js).
const normLabel = (s) => String(s ?? '').trim().toLowerCase();
// propositionsOf(doc, { closure, universe }) — `closure: 'open'` (default) is the
// original behavior: an unread base is simply absent from the map, byte-identical to
// the pre-trichotomy reading. `closure: 'declared'` additionally materializes every
// base in the caller-supplied `universe` that this doc did NOT read, with
// `pol: POLARITY.NULL` — the third state (¬⊢A), never inferred, only ever declared.
export const propositionsOf = (doc, { closure = 'open', universe = null } = {}) => {
  const out = new Map();
  if (!doc?.log) {
    if (closure === 'declared') for (const base of universe || []) out.set(base, nullProposition(base));
    return out;
  }
  let graph;
  try { graph = projectGraph(doc.log, {}); } catch { graph = null; }
  const has = (id) => graph?.entities?.has?.(id);
  const labelOf = (id) => graph?.entities?.get?.(id)?.label ?? String(id);
  for (const e of graph?.edges || []) {
    const p = propositionOfEdge(e);
    const sub = labelOf(p.substrate);
    const dif = has(p.differentia) ? labelOf(p.differentia) : String(p.differentia);   // a type/literal rides as itself
    const pol = p.polarity === '-' ? POLARITY.NEG : POLARITY.POS;
    const base = `${normLabel(sub)} ⟩ ${normLabel(p.relation)} ⟩ ${normLabel(dif)}`;
    if (!out.has(base)) out.set(base, { sub, rel: p.relation, dif, pol });
  }
  if (closure === 'declared') {
    for (const base of universe || []) if (!out.has(base)) out.set(base, nullProposition(base));
  }
  return out;
};

// a declared-but-unread base: no sub/rel/dif is known beyond the base string itself
// (the universe is a list of base keys, not full triples), so those ride null and the
// polarity carries the whole signal — ¬⊢A, no reading either way.
const nullProposition = (base) => ({ sub: null, rel: null, dif: null, pol: POLARITY.NULL, base });

// ── the propositional continuity gate ─────────────────────────────────────────────────────────────
// continuityGate(before, after, { scope, requireTotal }) → the return-path check.
//
//   before  the propositions of the INPUT structure (a doc or a prebuilt Map)
//   after   the propositions of the RESTORED output (a doc or a Map)
//
// TWO DIFFERENT LOGICAL COMMITMENTS were living under one `mode` flag; `scope` names
// them and asks a different QUESTION of the same two readings:
//
//   scope: 'derivability'  — a ⊢ question: is every relation in `after` DERIVABLE from
//                            the tape in `before`? Closed-world / negation-as-failure.
//                            An addition nothing derives is UNGROUNDED, and refuses.
//   scope: 'truth'         — a ⊨ question: is `after` merely CONSISTENT with `before`?
//                            Open-world. An addition is a PROPOSAL — the deliverable of
//                            a generation task — and never refuses.
//
// The verdict table, per base proposition:
//   preserved     same base, same pole — a relation the model kept faithfully
//   contradicted  same base, OPPOSITE pole — the model flipped a bond's sign. No scope
//                 gives a blind reasoner ground to overturn a given bond: hard fail,
//                 BOTH scopes, always refuses.
//   witnessed     the base was POLARITY.NULL in `before` (declared-closure: no reading
//                 either way) and now carries +/- in `after` — a genuine new witness,
//                 not a fabrication; never refuses.
//   ungrounded    a base only `after` has, scope='derivability' — nothing in the given
//                 tape derives it. Refuses.
//   proposal      a base only `after` has, scope='truth' — the deliverable. Never refuses.
//   eroded        a base only `before` has — EROSION. Soft; a hard fail only under
//                 `requireTotal`.
//
// Migration: the old `mode` param ('closed'|'open') is accepted for one release, mapped
// 'closed'→'derivability', 'open'→'truth', and logged as a deprecation via this file's
// `logEvent` — the SAME channel core/log.js callers already emit through. During this
// release an ungrounded verdict ALSO appears under the old id `proposition-fabricated`
// in `fired` (alongside the new `proposition-ungrounded`), so a downstream consumer
// still keying on `fabricated` does not silently break.
const logEvent = (name, detail) => {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      globalThis.dispatchEvent(new CustomEvent(name, { detail }));
      return;
    }
  } catch { /* no DOM-like event target — fall through */ }
  try { console.warn?.(`[${name}]`, detail); } catch { /* no console — silent */ }
};

export const continuityGate = (before, after, opts = {}) => {
  let { scope, mode, requireTotal = false } = opts;
  if (!scope) {
    if (mode === 'closed' || mode === 'open') {
      scope = mode === 'closed' ? 'derivability' : 'truth';
      logEvent('deprecation', {
        module: 'model/blind-structure.js', fn: 'continuityGate',
        message: `continuityGate({ mode: '${mode}' }) is deprecated — pass { scope: '${scope}' } instead. ` +
          `'mode' is honored for this release only.`,
      });
    } else {
      scope = 'derivability';
    }
  }

  const B = before instanceof Map ? before : propositionsOf(before);
  const A = after  instanceof Map ? after  : propositionsOf(after);

  const preserved = [];
  const contradicted = [];
  const introduced = [];
  const witnessed = [];
  const dropped = [];

  for (const [base, a] of A) {
    const b = B.get(base);
    if (!b) { introduced.push(a); continue; }
    if (b.pol === POLARITY.NULL && a.pol !== POLARITY.NULL) { witnessed.push({ base, was: b, now: a }); continue; }
    if (b.pol !== a.pol) contradicted.push({ base, was: b, now: a });
    else preserved.push(a);
  }
  for (const [base, b] of B) if (!A.has(base) && b.pol !== POLARITY.NULL) dropped.push(b);

  const ungrounded = scope === 'derivability' && introduced.length > 0;
  const proposals = scope === 'truth' ? introduced : [];
  const refuses = contradicted.length > 0 || ungrounded || (requireTotal && dropped.length > 0);

  const verdict = contradicted.length ? 'contradicted'
    : ungrounded ? 'ungrounded'
    : (requireTotal && dropped.length) ? 'eroded'
    : introduced.length ? (scope === 'truth' ? 'proposal' : 'ungrounded')
    : dropped.length ? 'narrowed'
    : witnessed.length ? 'witnessed'
    : 'continuous';

  const rel = (r) => `${r.sub ?? r.now?.sub} ${r.rel ?? r.now?.rel} ${r.dif ?? r.now?.dif}`.trim();
  const fired = [];
  if (contradicted.length) fired.push({ id: 'proposition-contradicted', refuses: true,
    message: `the blind reasoner flipped ${contradicted.length} bond(s) it was given`,
    relations: contradicted.map((c) => `${rel(c.was)}  (given)  ↮  ${rel(c.now)}  (returned)`) });
  if (ungrounded) {
    fired.push({ id: 'proposition-ungrounded', refuses: true,
      message: `the blind reasoner asserted ${introduced.length} relation(s) among referents it could not see, and nothing in the given tape derives them`,
      relations: introduced.map(rel) });
    // back-compat alias, one release only — see the migration note above.
    fired.push({ id: 'proposition-fabricated', refuses: true,
      message: `the blind reasoner asserted ${introduced.length} relation(s) among referents it could not see`,
      relations: introduced.map(rel) });
  }

  return Object.freeze({
    ok: !refuses, refuses, verdict, scope, mode: opts.mode,
    preserved, contradicted, introduced, witnessed, dropped, proposals,
    counts: {
      preserved: preserved.length, contradicted: contradicted.length,
      introduced: introduced.length, witnessed: witnessed.length,
      dropped: dropped.length, proposals: proposals.length,
    },
    fired,
  });
};

// ── the driver ─────────────────────────────────────────────────────────────────────────────────────
// generateOverStructure({ model, doc, task, mode, ... }) → the whole loop, one await.
//   model   a loaded backend (model/interface.js `createModel`): echo for a test, claude for the
//           real Anthropic API — the driver never learns which. Only `model.phrase` is used.
//   doc     the reading to blind (a code doc from organs/code, an EOT doc, or a parsed-text doc).
//   task    the natural-language charge, injected into the system prompt over the opaque structure.
//   mode    'closed' (audit — a new bond fabricates) | 'open' (generation — a new bond proposes).
// Returns { raw, restored, outDoc, gate, describe, messages } — the model's raw handle-EOT, the
// referent-restored EOT, the re-read output doc, the continuity verdict, and the backend's own
// provenance. onToken streams the RESTORED output live (real referents, never a half-restored handle).
export const generateOverStructure = async ({
  model, doc, task, mode = 'closed', max = Infinity,
  maxTokens = 1024, signal = null, onToken = null,
} = {}) => {
  if (!model || typeof model.phrase !== 'function') throw new Error('generateOverStructure: a loaded backend (model.phrase) is required');
  if (!doc?.log) throw new Error('generateOverStructure: doc must carry a log (an EOT / code / parsed-text reading)');

  const { messages, table, names } = blindPrompt(doc, { task, max });

  const restorer = onToken ? makeStreamRestorer(table) : null;
  const sink = restorer ? (piece) => { const out = restorer.push(piece); if (out) onToken(out); } : (onToken || null);

  const raw = await model.phrase(messages, { maxTokens, ...(signal ? { signal } : {}), ...(sink ? { onToken: sink } : {}) });
  if (restorer) { const tail = restorer.flush(); if (tail) onToken(tail); }

  const restored = restore(String(raw ?? ''), table);          // inject the real referents back in

  // Semantic pass — re-read the restored EOT as the model's OWN conjecture (enactor door). A
  // malformed answer must never break the loop: a failed re-read is an empty output reading, which
  // the gate reads as "the model asserted nothing", not as a pass.
  let outDoc = null;
  try { outDoc = eotDoc(restored, { docId: 'blind-out', frame: 'blind', door: 'enactor', agent: 'model:blind' }); }
  catch { outDoc = null; }

  const gate = continuityGate(doc, outDoc, { mode });
  return Object.freeze({
    raw: String(raw ?? ''), restored, outDoc, gate, messages, names,
    describe: (() => { try { return model.describe?.() ?? null; } catch { return null; } })(),
  });
};
