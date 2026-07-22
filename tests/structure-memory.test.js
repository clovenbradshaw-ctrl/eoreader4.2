// The §10 test protocol for the structural-memory & cross-source-binding holon
// (docs/structural-memory-cross-source.md). Each test below is one numbered item of the spec's own
// acceptance backbone — the six experiments it says the mechanisms must survive, plus the
// invariants the mechanisms are built to keep (a live VOID, no forced merge, corroboration earned
// internally, termination by VOID). All pure and model-free: the same run here as in the browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  // §3 detector
  detectStructure, boundaryProposals, SIGNALS,
  // §2 pattern
  makePattern, makePatternCorroboration, withCorroboration, withStatus, patternId, PATTERN_STATUS,
  // §4 promotion / demotion
  evaluatePromotion, evaluateDemotion, adjudicatePatternConflict, distinctWitnessDocs,
  // §6 binding
  bindAcrossSources, makeRegistryEntry, resolveSuperposition,
  // §7 references
  classifyReference, resolveReference, detectCycles, typedCycleStates, REF_STATES,
  // §8 nesting
  segmentContainer, flattenZones, maxDepthReached, nestTurn, descentGrade, addressDepth, childAddress,
  // §9 fetch scope
  mayFetch, markFetchedWitness, guardCorroboration, guardRuledOut, foldFetchedIntoConflict,
  // holon
  buildStructure, contentAnchor,
} from '../src/perceiver/structure/index.js';
import { createLog } from '../src/core/log.js';
import { contractOf } from '../src/core/contracts.js';

// ── shared fixtures ────────────────────────────────────────────────────────────────────────────
const EMAIL = [
  'From: alice@example.com', 'To: bob@example.org', 'Subject: Project meeting',
  'Date: Mon, 1 Jan 2026', '',
  'Hi Bob, can we meet on Tuesday to discuss the report?',
  'It should not take long at all.', 'Thanks, Alice',
].join('\n');

const HTML = [
  '<html>', '  <body>', '    <ul>',
  '      <li>one</li>', '      <li>two</li>', '      <li>three</li>',
  '    </ul>', '  </body>', '</html>',
].join('\n');

// A signal-set matchScore — the CHEAP library-match currency (§5.2). It knows no format; it compares
// which generic signals a zone fires against the ones a pattern remembers.
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const matchScore = (zone, pattern) => jaccard(detectStructure(zone.blob).signals, pattern.def.detection_params.signals || []);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.1 — CONVERGENCE. The generic detector recovers known structure on RFC-5322 email and
// well-formed HTML WITHOUT format-specific rules, and emits a live VOID on structureless prose.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§10.1 convergence — the detector recovers the RFC-5322 header/body split with no email rule', () => {
  const d = detectStructure(EMAIL);
  assert.equal(d.void, false, 'email has structure, not VOID');
  // the header block is read as field lines (delimiter density), the header/body split as whitespace
  assert.ok(d.signals.includes('delimiter-shift'), 'header lines read as field instantiations');
  assert.ok(d.signals.includes('whitespace'), 'the blank line splits header from body');
  // a boundary lands at the header/body seam (the blank line is unit 4)
  assert.ok(boundaryProposals(d).includes(4), `a boundary at the header/body seam, got ${boundaryProposals(d)}`);
  // and no signal read "From:" — the detector is format-blind: every signal is generic
  assert.ok(SIGNALS.every((s) => typeof s === 'string' && !/email|from|header/i.test(s)));
});

test('§10.1 convergence — the detector recovers indented HTML tree structure with no HTML rule', () => {
  const h = detectStructure(HTML);
  assert.equal(h.void, false, 'HTML tree has structure');
  // the repeated <li> run is periodicity; the indentation changes are whitespace
  assert.ok(h.signals.includes('periodicity') || h.signals.includes('whitespace'), 'recovers repetition / layout');
  assert.ok(boundaryProposals(h).length >= 2, 'multiple structural boundaries recovered');
});

test('§10.1 false-witness — structureless run-on prose yields a live VOID (the detector says so)', () => {
  const prose = 'The morning was cold and grey and she stood at the window for a long while watching the empty street below and thinking of nothing much at all as the pale light slowly rose over the wet rooftops.';
  const p = detectStructure(prose);
  assert.equal(p.void, true, 'no confident boundary → the detector emits VOID, not a false witness');
  assert.equal(p.clms.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.2 — TRANSFER, ingestion variant. A pattern PROMOTED from corpus A (email headers) is
// recognised on corpus B (a chat log) WITHOUT being told the format — the email-gets-easier
// phenomenon. Promotion counts DISTINCT documents only (§4.2) and demands a ruled-out-other (§4.3).
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§10.2 transfer (ingestion) — a pattern promoted from 5 email docs recognises a chat log', () => {
  // Learn email-header-block from FIVE independently-encountered email documents.
  let pat = makePattern({ name: 'structured-metadata-block', detection_params: { signals: ['delimiter-shift'] }, promotion_threshold: 5 });
  for (const docId of ['doc:1', 'doc:2', 'doc:3', 'doc:4', 'doc:5'])
    pat = withCorroboration(pat, makePatternCorroboration({ witness_span: `${docId}:hdr`, source_doc: docId, ruled_out_other: patternId('narrative-paragraph') }));

  const promo = evaluatePromotion(pat);
  assert.ok(promo.fires, 'crosses the threshold and a promotion REC fires');
  assert.equal(promo.fires.op, 'REC');
  assert.equal(promo.distinct, 5, 'five DISTINCT documents corroborate');
  pat = withStatus(pat, PATTERN_STATUS.PROMOTED);

  // Corpus B: a chat log — never labelled as such. Its "Alice: hi" lines are ALSO field lines.
  const chat = ['Alice: hey are you around', 'Bob: yeah what is up', 'Alice: can you review the PR', 'Bob: on it now', 'Carol: i can help too'].join('\n');
  const tree = segmentContainer(chat, { library: [pat], matchScore, matchFloor: 0.4 });
  const matched = flattenZones(tree).filter((z) => z.kind === 'matched');
  assert.ok(matched.length >= 1, 'the email-learned pattern MATCHES the chat log — transfer, no format rule');
  assert.equal(matched[0].pattern, 'pattern:structured-metadata-block');
});

test('§10.2 corroboration is cross-document — recurrence within one doc is one witness (§4.2)', () => {
  let pat = makePattern({ name: 'x', promotion_threshold: 3 });
  for (let i = 0; i < 6; i++) pat = withCorroboration(pat, makePatternCorroboration({ witness_span: `s${i}`, source_doc: 'doc:same', ruled_out_other: 'pattern:y' }));
  assert.equal(distinctWitnessDocs(pat.corroboration).count, 1, 'six witnesses on ONE doc count as one');
  assert.equal(evaluatePromotion(pat).fires, null, 'so the pattern does NOT promote off a single verbose file');
});

test('§10.2 a witness with no ruled-out-other does not count toward promotion (§4.3)', () => {
  let pat = makePattern({ name: 'x', promotion_threshold: 2 });
  pat = withCorroboration(pat, makePatternCorroboration({ witness_span: 's', source_doc: 'doc:a' /* no ruled_out_other */ }));
  pat = withCorroboration(pat, makePatternCorroboration({ witness_span: 's', source_doc: 'doc:b' /* no ruled_out_other */ }));
  assert.equal(distinctWitnessDocs(pat.corroboration).count, 0, 'about-witnesses do not count — only supporting ones');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.3 — TRANSFER, entity-binding variant. A common-name entity (the Mr. Smith case) binds across
// two documents' frames via the three sub-cuts, with the merely-lexical other Smith RULED OUT — the
// exact case the ruled-out-other requirement was built for. Lexical match alone never binds.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const reg = (anchor, texts, preds) => makeRegistryEntry({ anchor, signs: texts.map((t) => ({ text: t, source_doc: anchor })), corroborating_predicates: preds });

test('§10.3 transfer (entity) — Mr. Smith binds to the Smith who shares a predicate, ruling out the other', () => {
  const acme = reg('@smith-acme', ['J. Smith'], ['employer:acme', 'spouse:jane-smith']);
  const globex = reg('@smith-globex', ['Smith'], ['employer:globex']);
  const dec = bindAcrossSources({ text: 'Mr. Smith', source_doc: 'doc:A', span: 'span:1' }, [acme, globex], { predicates: ['employer:acme', 'spouse:jane-smith'] });
  assert.equal(dec.verdict, 'corroborated');
  assert.equal(dec.binding.to, '@smith-acme', 'binds to the predicate-sharing Smith');
  assert.equal(dec.binding.op, 'INS', 'the binding is an INS onto the committed anchor');
  assert.ok(dec.ruled_out_other && dec.ruled_out_other.other === '@smith-globex', 'the other Smith is the MANDATORY ruled-out-other');
});

test('§10.3 lexical match alone is worthless — no shared predicate → held ∥, never a forced merge', () => {
  const acme = reg('@smith-acme', ['J. Smith'], ['employer:acme']);
  const globex = reg('@smith-globex', ['Smith'], ['employer:globex']);
  const dec = bindAcrossSources({ text: 'Smith', source_doc: 'doc:C', span: 'span:9' }, [acme, globex], { predicates: ['title:manager'] });
  assert.equal(dec.binding, null, 'a bare common name never mints a binding (§6)');
  assert.ok(dec.superposition, 'two lexical candidates → DEF-superposition on identity');
  assert.equal(dec.superposition.op, 'DEF');
  assert.deepEqual([...dec.superposition.candidates].sort(), ['@smith-acme', '@smith-globex']);
});

test('§10.3 a functional-predicate clash contradicts a merge (two births → two people)', () => {
  const a = reg('@x', ['A. Smith'], ['bornon:1970']);
  const dec = bindAcrossSources({ text: 'Smith', source_doc: 'd', span: 's' }, [a], { predicates: ['bornon:1985'] });
  assert.equal(dec.verdict, 'contradicted');
  assert.equal(dec.binding, null);
});

test('§10.3 a superposition is resolved LATER by EVA when evidence arrives — not at ingest', () => {
  const sup = { candidates: ['@a', '@b'], mention: 'span:9' };
  const held = resolveSuperposition(sup, {});                       // no evidence yet
  assert.equal(held.verdict, 'indeterminate', 'evidence that does not decide is not a decision');
  const resolved = resolveSuperposition(sup, { corroborates: '@a', predicate: 'spouse:jane' });
  assert.equal(resolved.verdict, 'corroborated');
  assert.equal(resolved.winner, '@a');
  assert.equal(resolved.ruled_out_other, '@b');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.4 — WORST-CASE COMPOSITE. A mutable container with narrative content and an unresolved external
// reference, nested inside a multi-document file. Every part is handled by its own typed mechanism.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§10.4 worst-case composite — multi-doc file segments; its references type correctly', () => {
  // A multi-document file: two forwarded messages, the second narrative, each with metadata blocks.
  const file = [
    'From: alice@x.com', 'To: team@x.com', 'Subject: Q1 plan', '',
    'The quarter opened slowly. We shipped the parser and the budget held. See the attached page.', '',
    'From: bob@y.com', 'To: alice@x.com', 'Subject: Re: Q1 plan', '',
    'Agreed. The numbers look right. I pulled the figure from the live dashboard.',
  ].join('\n');

  const tree = segmentContainer(file, {});
  assert.ok(tree.zones.length >= 2, 'the multi-document file splits into its documents');

  // an unresolved external reference (the "attached page" not yet ingested) → VOID-until-resolved
  const unresolved = resolveReference({ target: 'page:attached' }, { anchors: new Set() });
  assert.equal(unresolved.state, REF_STATES.EXTERNAL_UNRESOLVED);
  assert.equal(unresolved.event.void, true, 'a provisional CON, held VOID until the target is ingested');
  assert.equal(unresolved.handling.fetch, true, 'and this is the ONE state where a fetch is legitimate (§9)');

  // a live-mutable reference (the "live dashboard") → the OPEN question, flagged not defaulted (§11)
  assert.equal(classifyReference({ target: 'dash:live', live: true }), REF_STATES.LIVE_MUTABLE);

  // once the attached page IS ingested, the same reference transitions to external-resolved
  const resolved = resolveReference({ target: 'page:attached' }, { anchors: new Set(['page:attached']) });
  assert.equal(resolved.state, REF_STATES.EXTERNAL_RESOLVED);
  assert.equal(resolved.event.verdict, 'corroborated');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.5 — CYCLE. A genuine reference cycle (a self-quoting forwarded email chain) surfaces as a
// TYPED cycle state, not infinite descent or silent truncation.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§10.5 cycle — a self-quoting forwarded chain surfaces as a typed cycle state', () => {
  const edges = [{ from: 'msg:A', to: 'msg:B' }, { from: 'msg:B', to: 'msg:C' }, { from: 'msg:C', to: 'msg:A' }];
  const cycles = detectCycles(edges);
  assert.equal(cycles.length, 1, 'the A→B→C→A cycle is detected exactly once');
  const states = typedCycleStates(edges);
  assert.equal(states[0].state, REF_STATES.CYCLE);
  assert.equal(states[0].op, 'SEG', 'a typed, detected SEG state — recursion stops here, no infinite descent');
});

test('§10.5 an acyclic reference DAG yields no cycle state (no false cycle)', () => {
  assert.equal(detectCycles([{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]).length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §10.6 — DEMOTION. A promoted pattern fed a run of instances that fail its detection_params fires a
// revise/retire REC rather than silently absorbing bad matches.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§10.6 demotion — a promoted pattern fed failing instances fires a retire REC', () => {
  const prom = withStatus(makePattern({ name: 'p', promotion_threshold: 3 }), PATTERN_STATUS.PROMOTED);
  const evas = Array.from({ length: 10 }, () => ({ verdict: 'contradicted' }));   // all fail EVA
  const decision = evaluateDemotion(prom, evas, { noiseRate: 0.1 });
  assert.equal(decision.action, 'retire');
  assert.equal(decision.fires.op, 'REC');
  assert.equal(decision.fires.to, PATTERN_STATUS.DEMOTED, 'the pattern is retired, not calcified');
});

test('§10.6 demotion is symmetric but not trigger-happy — within-noise failures keep the pattern', () => {
  const prom = withStatus(makePattern({ name: 'p', promotion_threshold: 3, corroboration: [] }), PATTERN_STATUS.PROMOTED);
  const evas = [...Array(9).fill({ verdict: 'corroborated' }), { verdict: 'contradicted' }];   // 10% failure
  const decision = evaluateDemotion(prom, evas, { noiseRate: 0.1 });
  assert.equal(decision.action, 'keep', 'a failure rate within noise does not demote');
  assert.equal(decision.fires, null);
});

test('§4 conflict between two promoted patterns for one zone is an ordinary EVA-adjudicated DEF-conflict', () => {
  const email = makePattern({ name: 'email-header-block', detection_params: { signals: ['delimiter-shift', 'whitespace'] } });
  const chat = makePattern({ name: 'chat-log-header', detection_params: { signals: ['delimiter-shift'] } });
  const zone = { blob: EMAIL };
  const adj = adjudicatePatternConflict(zone, [email, chat], { score: matchScore });
  assert.equal(adj.op, 'EVA');
  assert.equal(adj.verdict, 'corroborated');
  assert.equal(adj.winner, 'pattern:email-header-block', 'the email zone scores the email pattern higher');
  assert.equal(adj.ruled_out_other, 'pattern:chat-log-header', 'the loser is the mandatory ruled-out-other');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// §8 — recursive nesting & termination; §9 — the web-fetch scope boundary; the holon append seam.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
test('§8 termination is VOID — a leaf frame stops descent, and depth is invariant', () => {
  const leafDetect = () => ({ clms: [], void: true, units: ['x'] });
  const turn = nestTurn({ blob: 'x' }, { detect: leafDetect, depth: 1 });
  assert.equal(turn.leaf, true);
  assert.equal(turn.descend, false, 'a VOID frame is a leaf — descent stops, no base case in code');
  assert.equal(turn.event.op, 'NUL');
  // a depth-40 leaf is the same signal as a depth-1 leaf
  const deep = nestTurn({ blob: 'x' }, { detect: leafDetect, depth: 40 });
  assert.equal(deep.leaf, true);
  assert.equal(addressDepth(childAddress('container.doc:2.section:3', 'mention:M2')), 4, 'addressing is depth-invariant');
});

test('§8 the guardrail is economic — a collapse in corroboration density grades idle (stop by cost)', () => {
  assert.equal(descentGrade({ density: 0.8, depth: 2 }), 'grounded');
  assert.equal(descentGrade({ density: 0.3, depth: 2 }), 'warranted');
  assert.equal(descentGrade({ density: 0, depth: 5 }), 'idle', 'no structure → idle → descent stops by cost, not a max-depth');
  assert.equal(descentGrade({ density: 0.05, depth: 5, priorDensity: 0.8 }), 'idle', 'a sharp collapse from the parent grades idle');
});

test('§9 a fetch resolves a specific external-unresolved target only — never structure discovery', () => {
  assert.equal(mayFetch({ state: REF_STATES.EXTERNAL_UNRESOLVED, target: 'x' }).allowed, true);
  assert.equal(mayFetch({ state: REF_STATES.EXTERNAL_UNRESOLVED }).allowed, false, 'no target → refused (not a corroboration substitute)');
  assert.equal(mayFetch({ state: REF_STATES.INTERNAL_ANCHOR, target: 'x' }).allowed, false, 'internal refs resolve with no fetch');
  assert.equal(mayFetch({ state: REF_STATES.EXTERNAL_UNRESOLVED, target: 'x', purpose: 'discover-structure' }).allowed, false, 'structure discovery is out of scope');
});

test('§9 a fetched result never counts toward corroboration nor supplies a ruled-out-other', () => {
  const corro = [
    makePatternCorroboration({ source_doc: 'doc:a', ruled_out_other: 'p' }),
    markFetchedWitness(makePatternCorroboration({ source_doc: 'web:1', ruled_out_other: 'p' })),
  ];
  const guarded = guardCorroboration(corro);
  assert.equal(guarded.internal.length, 1, 'the fetched witness is excluded from the count');
  assert.equal(guarded.dropped.length, 1, 'and surfaced, not silently discarded');
  assert.equal(guardRuledOut(markFetchedWitness({ other: 'p' })), null, 'a fetched ruled-out-other is refused');
  // a fetched witness MAY only tip a genuinely tied conflict
  const tie = { verdict: 'indeterminate' };
  const tipped = foldFetchedIntoConflict(tie, { url: 'web:1' }, { favours: 'pattern:a' });
  assert.equal(tipped.trustedWitness, false, 'it rides as untrusted');
  const notie = foldFetchedIntoConflict({ verdict: 'corroborated' }, { url: 'web:1' }, { favours: 'pattern:a' });
  assert.equal(notie.refusedFetch, true, 'no genuine tie → the fetch is refused');
});

test('the holon appends its decisions to the log and never violates Law 1', () => {
  const log = createLog({ docId: 'test', contractOf });
  let clk = 0;
  const S = buildStructure({ log, now: () => ++clk, mintId: (() => { let n = 0; return () => `id-${n++}`; })() });

  S.observeStructure(EMAIL, { docId: 'doc:1' });                     // SIG clms + no void
  const seg = S.segment(EMAIL, {});                                   // SEG container-seg
  assert.ok(seg.zones.length >= 1);

  let pat = makePattern({ name: 'blk', detection_params: { signals: ['delimiter-shift'] }, promotion_threshold: 2 });
  ({ pattern: pat } = S.corroboratePattern(pat, { witness_span: 'd1', source_doc: 'doc:1', ruled_out_other: 'pattern:z' }));
  const { decision } = S.corroboratePattern(pat, { witness_span: 'd2', source_doc: 'doc:2', ruled_out_other: 'pattern:z' });
  assert.ok(decision.fires, 'the second distinct-doc corroboration promotes');

  S.bindMention({ text: 'Mr. Smith', source_doc: 'doc:1', span: 'sp' }, [reg('@a', ['J. Smith'], ['employer:acme'])], { predicates: ['employer:acme'] });
  S.markCycles([{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]);

  assert.equal(log.law1Violations().length, 0, 'every appended op is within the holon’s declared contract');
  assert.ok(log.length > 0, 'the decisions are recorded on the append-only log');
  // the content anchor is deterministic — the same shape mints the same anchor (cross-organ reuse §2)
  assert.equal(contentAnchor({ a: 1, b: 2 }), contentAnchor({ b: 2, a: 1 }));
});
