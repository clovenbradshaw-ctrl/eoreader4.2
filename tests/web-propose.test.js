import { test } from 'node:test';
import assert from 'node:assert/strict';

import { proposeWebSearch, searchAnnouncement, COST_NOTICE } from '../src/turn/propose.js';
import { runTurnWithWeb, runWebFollowup, verifyAgainstWeb, formulateSearchQuery, extendClippedSubject } from '../src/turn/web.js';
import { admitWebSource } from '../src/organs/ingest/websource.js';

// "Search the internet to respond" actually firing (docs/web-search.md): the turn PROPOSES a
// query when the document can't close the gap (proposer-only — it never fetches), and a
// confirmed/auto go-ahead fetches+admits and re-runs with the web sources in scope.

// ── The proposer: a gap becomes a query, a sound turn proposes nothing ────────

test('a measured void proposes a web search; the question is the query', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'how much was the fine?',
    voidMeasure: true, bound: [], vetoes: [] });
  assert.ok(p);
  assert.equal(p.query, 'how much was the fine?');
  assert.match(p.rationale, /does not cover/);
  assert.equal(p.cost, COST_NOTICE);
});

test('an answer bound to nothing proposes, sharpened with the figure the reading centres on', () => {
  const p = proposeWebSearch({
    route: 'grounded', task: 'answer', question: 'what is her name?',
    bound: [{ claim: 'She is kind.', citation: null, score: 0 }],   // unbound: uncited, no contact
    rawOutput: 'She is kind.', refTarget: { label: 'Grete' }, vetoes: [],
  });
  assert.ok(p);
  assert.match(p.query, /what is her name\? Grete/);
});

test('a chat turn (no document) proposes a VERIFY — check the general-knowledge answer, do not replace it', () => {
  const p = proposeWebSearch({ route: 'chat', question: 'what is the capital of france?' });
  assert.ok(p);
  assert.equal(p.trigger, 'verify');
  assert.equal(p.query, 'what is the capital of france?');
  assert.match(p.rationale, /general knowledge/);
});

test('a bare grounded question is sharpened with the reading’s figure (surf.focus), so it does not match a namesake', () => {
  // The Metamorphosis bug: "what happens at the end?" with no figure went to the world as-is and
  // matched a film called "What Happens Later", whose pages then polluted the answer. The fold's
  // surf focus ("Gregor Samsa") is the subject when no prediction/referent named one.
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'what happens at the end?',
    voidMeasure: true, bound: [], vetoes: [], surf: { focus: 'Gregor Samsa' } });
  assert.ok(p);
  assert.equal(p.query, 'what happens at the end? Gregor Samsa');
});

test('a mechanical route (math / metadata / smalltalk) never proposes', () => {
  assert.equal(proposeWebSearch({ route: 'math', question: '2/3' }), null);
  assert.equal(proposeWebSearch({ route: 'metadata', question: 'who wrote this?' }), null);
});

test('a well-grounded turn proposes nothing; a whole-doc task never proposes', () => {
  assert.equal(proposeWebSearch({ route: 'grounded', task: 'answer', question: 'q',
    bound: [{ claim: 'a', citation: 's0' }], rawOutput: 'a', vetoes: [] }), null);
  assert.equal(proposeWebSearch({ route: 'grounded', task: 'summary', question: 'summarize',
    voidMeasure: true, bound: [], vetoes: [] }), null);          // summary gaps are not lookups
});

test('an interpretation-only turn proposes a WITNESS-seek, not a gap-fill', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'did Gregor change?',
    bound: [{ claim: 'a', citation: 's0' }], rawOutput: 'a',   // grounded (cited) — not a gap
    vetoes: [{ id: 'interpretation' }] });
  assert.ok(p);
  assert.equal(p.trigger, 'witness');
  assert.match(p.rationale, /engine’s own reading/);
});

test('a gap dominates: void + interpretation proposes a gap-fill', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'q',
    voidMeasure: true, bound: [], vetoes: [{ id: 'interpretation' }] });
  assert.equal(p.trigger, 'gap');
});

test('low-coverage alone proposes (few claims grounded)', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'what happened?',
    bound: [{ citation: 's0' }, { citation: null }], rawOutput: 'a lot happened across the report',
    vetoes: [{ id: 'low-coverage' }] });
  assert.ok(p && /few of the claims/.test(p.rationale));
});

test('an honest abstention proposes a GAP search — the clearest "sources do not contain it" signal', () => {
  // The exported failure: over a loaded doc the reader honestly said "I didn't find that in what I
  // read" and NOTHING proposed a search — isUnbound needs claims, low-coverage self-suppresses on an
  // abstention, and voidMeasure never fired. The settled abstention itself is the gap.
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'what is the best elvis movie?',
    doc: { docId: 'elvis.txt' }, answer: 'I did not find that in what I read.', bound: [], vetoes: [] });
  assert.ok(p, 'an abstention must propose — the reading declared it did not hold the answer');
  assert.equal(p.trigger, 'gap');
  assert.match(p.rationale, /did not contain the answer/);
});

test('the abstention gap announces in the first person', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'which is the best?',
    doc: { docId: 'elvis.txt' }, answer: 'The text does not mention any films.', bound: [], vetoes: [] });
  const line = searchAnnouncement(p);
  assert.match(line, /didn't find that/i);
  assert.match(line, /Searching the web for/);
});

test('a real cited answer (not an abstention) still proposes nothing on the abstention path', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'what colour is the code?',
    doc: { docId: 'z.txt' }, sources: [2], answer: 'The document says the code is teal.',
    bound: [{ claim: 'The code is teal.', citation: 's2' }], vetoes: [] });
  assert.equal(p, null, 'a grounded, non-abstaining answer is not a gap');
});

// ── The announcement: the proposal promoted into a first-person, pre-search line ──

test('a gap proposal announces in the first person, naming the gap and the query', () => {
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'what happens at the end?',
    voidMeasure: true, bound: [], vetoes: [], surf: { focus: 'Gregor Samsa' } });
  const line = searchAnnouncement(p);
  assert.match(line, /don't think the document covers this/);
  assert.match(line, /Searching the web for/);
  assert.match(line, /what happens at the end\? Gregor Samsa/);   // the sharpened query, verbatim
});

test('a verify (chat) proposal promises to CHECK against the web, not replace the answer', () => {
  const line = searchAnnouncement({ trigger: 'verify', query: 'capital of france', rationale: 'general knowledge' });
  assert.match(line, /answered from what I already know/);
  assert.match(line, /capital of france/);
});

test('a witness proposal promises to CONFIRM the engine’s own reading', () => {
  const line = searchAnnouncement({ trigger: 'witness', query: 'gregor samsa transformation', rationale: 'engine’s own reading' });
  assert.match(line, /rests on my own reading/);
});

test('a bare { query } (the auto path, no proposal yet) falls back to a neutral "let me look that up"', () => {
  const line = searchAnnouncement({ query: 'eiffel tower height' });
  assert.match(line, /Let me look that up/);
  assert.match(line, /eiffel tower height/);
});

test('nothing to announce → null (no proposal, or an empty query)', () => {
  assert.equal(searchAnnouncement(null), null);
  assert.equal(searchAnnouncement({ query: '   ' }), null);
});

test('low-coverage does NOT propose when a loaded document already grounded the answer (no redundant fetch)', () => {
  // The contradiction-trap wrinkle: the answer was grounded and cited to the loaded document
  // (teal, not crimson), but a few bled-in cross-turn fragments dragged coverage down and
  // fired `low-coverage`. With the document already grounding the answer, that flag must not
  // pull a web search — the answer is sitting in the loaded file.
  const p = proposeWebSearch({ route: 'grounded', task: 'answer', question: 'isn’t the colour code crimson?',
    doc: { docId: 'zylbrook.txt' }, sources: [2],
    bound: [{ claim: 'The code is teal.', citation: 's2' }, { claim: 'and more.', citation: null }],
    rawOutput: 'No, the document says teal, not crimson.', vetoes: [{ id: 'low-coverage' }] });
  assert.equal(p, null, 'a doc-grounded answer with an incidental low-coverage flag does not reach for the web');
});

// ── The orchestration: confirm / auto / proposer-only, with injected runTurn ──

const groundedDoc = (text) => admitWebSource({ url: 'https://w/x', text }).doc;

// A fake runTurn: first call returns a turn with a proposal; the re-run (docs grew) returns a
// grounded answer. Records what scope each call saw.
const fakeRunner = () => {
  const calls = [];
  const impl = async (args) => {
    calls.push(args);
    if (calls.length === 1) return { answer: 'I did not find it.', webProposal: { query: 'grete samsa', rationale: 'void', cost: COST_NOTICE }, flags: [] };
    return { answer: 'Her name is Grete.', webProposal: null, flags: [], sources: [0] };
  };
  return { impl, calls };
};

test('auto mode: a proposal is fetched, admitted, and the turn re-runs with the web sources in scope', async () => {
  const { impl, calls } = fakeRunner();
  let searched = null;
  const webSearch = async (q) => { searched = q; return [{ doc: groundedDoc('His sister was named Grete.') }]; };
  const out = await runTurnWithWeb({ question: 'what is her name?', docs: [] },
    { mode: 'auto', webSearch, runTurnImpl: impl });
  assert.equal(searched, 'grete samsa', 'the proposed query was searched');
  assert.equal(out.answer, 'Her name is Grete.', 'the re-run answer is returned');
  assert.equal(out.webFetched.results, 1);
  assert.equal(calls.length, 2, 're-ran once with the web source');
  assert.equal(calls[1].docs.length, 1, 'the web doc joined the scope');
});

test('confirm mode: nothing is fetched without a go-ahead (proposer-only)', async () => {
  let fetched = false;
  const webSearch = async () => { fetched = true; return [{ doc: groundedDoc('x') }]; };

  const r1 = fakeRunner();
  const declined = await runTurnWithWeb({ question: 'q', docs: [] },
    { mode: 'confirm', confirm: () => false, webSearch, runTurnImpl: r1.impl });
  assert.equal(fetched, false, 'declined → no network');
  assert.equal(declined.answer, 'I did not find it.', 'the first answer stands');
  assert.equal(r1.calls.length, 1);

  const r2 = fakeRunner();
  const approved = await runTurnWithWeb({ question: 'q', docs: [] },
    { mode: 'confirm', confirm: () => true, webSearch, runTurnImpl: r2.impl });
  assert.equal(fetched, true, 'approved → fetched');
  assert.equal(approved.answer, 'Her name is Grete.');
});

test('a witness-trigger proposal feeds the fetched source in as the witnessSource on the re-run', async () => {
  const calls = [];
  const impl = async (args) => {
    calls.push(args);
    return calls.length === 1
      ? { answer: 'Gregor changed.', webProposal: { query: 'gregor samsa transformation', trigger: 'witness', rationale: 'interp', cost: COST_NOTICE }, flags: [] }
      : { answer: 'Gregor changed — confirmed.', webProposal: null, flags: [] };
  };
  const webSearch = async () => [{ doc: groundedDoc('Gregor Samsa woke transformed into an insect.') }];
  const out = await runTurnWithWeb({ question: 'did Gregor change?', docs: [] },
    { mode: 'auto', webSearch, runTurnImpl: impl });
  assert.equal(out.webFetched.trigger, 'witness');
  assert.ok(calls[1].witnessSource, 'the re-run received the web source as witnessSource');
  assert.ok(calls[1].docs.length === 1, 'and it also joined the scope');
});

test('verifyAgainstWeb: the answer’s DISTINCTIVE term decides — Paris confirmed, Lyon not', () => {
  const corpus = 'Paris is the capital and most populous city of France.';
  const q = 'what is the capital of france?';
  assert.ok(verifyAgainstWeb('The capital of France is Paris.', corpus, { question: q }).supported);
  const bad = verifyAgainstWeb('The capital of France is Lyon.', corpus, { question: q });
  assert.ok(!bad.supported, 'a wrong answer shares the question terms but its novel term is absent');
  assert.ok(bad.missing.includes('lyon'));
});

test('verify trigger: the model answer is kept and a web-grounded answer is attached (augment, not replace)', async () => {
  const calls = [];
  const impl = async (args) => {
    calls.push(args);
    if (calls.length === 1) return { answer: 'The capital of France is Lyon.',
      webProposal: { query: 'capital of france', trigger: 'verify', rationale: 'general knowledge', cost: COST_NOTICE }, flags: [] };
    return { answer: 'Paris is the capital of France.', route: 'grounded', flags: [], sources: [0] };  // the re-run over web pages
  };
  const webSearch = async () => [{ doc: { ...groundedDoc('Paris is the capital of France.'), docId: 's1', web: { title: 'Paris', url: 'https://a/p' } } }];
  const out = await runTurnWithWeb({ question: 'what is the capital of france?', docs: [] },
    { mode: 'auto', webSearch, runTurnImpl: impl });

  assert.equal(out.answer, 'The capital of France is Lyon.', 'the model answer is KEPT, not replaced');
  assert.equal(calls.length, 2, 'verify re-runs once to build the web-grounded answer');
  assert.equal(out.webFetched.trigger, 'verify');
  assert.equal(out.webFetched.augmented.answer, 'Paris is the capital of France.', 'a web-grounded answer is attached');
  assert.equal(out.webFetched.augmented.sources[0].title, 'Paris');
  assert.equal(out.webFetched.augmented.sources[0].url, 'https://a/p');
  assert.equal(calls[1].onToken, undefined, 'the side re-run does not stream into the live bubble');
  assert.equal(calls[1].stream, false);
});

test('verify trigger: a failed web-grounded re-run still keeps the model answer and lists the sources', async () => {
  const impl = async (args) => (!args.docs?.length
    ? { answer: 'Model answer.', webProposal: { query: 'q', trigger: 'verify', rationale: 'r', cost: COST_NOTICE }, flags: [] }
    : { route: 'error', answer: '' });   // the re-run failed
  const webSearch = async () => [{ doc: { ...groundedDoc('Some page text.'), docId: 's1', web: { title: 'S1', url: 'https://a/1' } } }];
  const out = await runTurnWithWeb({ question: 'q?', docs: [] }, { mode: 'auto', webSearch, runTurnImpl: impl });
  assert.equal(out.answer, 'Model answer.', 'the model answer is kept');
  assert.equal(out.webFetched.augmented, null, 'no augmented answer when the re-run fails');
  assert.equal(out.webFetched.sources[0].title, 'S1', 'the sources are still listed');
});

test('runWebFollowup honours a query override (the confirmation card lets the user sharpen it)', async () => {
  const calls = [];
  const impl = async (args) => { calls.push(args); return { answer: 'Gregor dies.', flags: [], sources: [0] }; };
  const first = { answer: 'I did not find it.',
    webProposal: { query: 'what happens at the end?', trigger: 'gap', rationale: 'void', cost: COST_NOTICE }, flags: [] };
  let searched = null;
  const webSearch = async (q) => { searched = q; return [{ doc: groundedDoc('The Metamorphosis ends with Gregor dead.') }]; };
  const out = await runWebFollowup({ question: 'q', docs: [] }, first,
    { webSearch, query: 'Metamorphosis Kafka ending', runTurnImpl: impl });
  assert.equal(searched, 'Metamorphosis Kafka ending', 'the user-edited query is what gets searched');
  assert.equal(out.answer, 'Gregor dies.');
  assert.equal(out.webFetched.query, 'Metamorphosis Kafka ending');
  assert.equal(out.webFetched.results, 1);
});

test('off mode (and a no-proposal turn) never reach for the net', async () => {
  const { impl } = fakeRunner();
  let fetched = false;
  const webSearch = async () => { fetched = true; return []; };
  const off = await runTurnWithWeb({ question: 'q', docs: [] }, { mode: 'off', webSearch, runTurnImpl: impl });
  assert.equal(fetched, false);
  assert.equal(off.answer, 'I did not find it.');
});

// ── Query formulation — the fix for "web search is useless" ──────────────────
test('formulateSearchQuery resolves back-references into a standalone query', async () => {
  const model = { phrase: async () => 'X-Files 2025 revival series producer' };
  const history = [
    { role: 'user', content: "what's the deal with the new x files?" },
    { role: 'assistant', content: 'The X-Files revival...' },
  ];
  const q = await formulateSearchQuery({ model, question: 'who is making the new series as of 2026?', history });
  assert.equal(q, 'X-Files 2025 revival series producer');
});

test('formulateSearchQuery falls back to the original with no model or a bad rewrite', async () => {
  assert.equal(await formulateSearchQuery({ question: 'who is making it?' }), 'who is making it?');
  const refusing = { phrase: async () => "I cannot help with that." };
  assert.equal(await formulateSearchQuery({ model: refusing, question: 'who is making it?' }), 'who is making it?');
  const throwing = { phrase: async () => { throw new Error('model down'); } };
  assert.equal(await formulateSearchQuery({ model: throwing, question: 'who is making it?' }), 'who is making it?');
  const tooLong = { phrase: async () => 'x'.repeat(200) };
  assert.equal(await formulateSearchQuery({ model: tooLong, question: 'who is making it?' }), 'who is making it?');
});

test('formulateSearchQuery strips quotes and a leading "query:" label', async () => {
  const model = { phrase: async () => 'Query: "X-Files new series 2026"' };
  assert.equal(await formulateSearchQuery({ model, question: 'q' }), 'X-Files new series 2026');
});

// ── Discourse-aware query generation ─────────────────────────────────────────
test('formulateSearchQuery is discourse-aware: a referential stall resolves to the open intent, no model', async () => {
  // The user opened a topic that went unanswered (an OPEN intent), then held on it with a pure
  // stall that carries no subject of its own. With no model, the query must still be anchored on
  // the discourse — the open intent's topic — not left as the bare, subject-less "tell me more".
  const history = [{ role: 'user', content: 'How does photosynthesis convert sunlight?' }];
  const q = await formulateSearchQuery({ question: 'tell me more about that', history });
  assert.notEqual(q, 'tell me more about that');       // the subject-less turn did NOT stand alone
  assert.match(q, /photosynthesis/i);                  // it was anchored on the open discourse intent
});

test('formulateSearchQuery hands the discourse subject to the model (discourse frame in the prompt)', async () => {
  // Capture what the model actually sees: the discourse SUBJECT/open-intent frame must be present,
  // so the rewrite is grounded in the conversation's subject, not just the six flat user lines.
  let seen = '';
  const model = { phrase: async (messages) => { seen = messages.map(m => m.content).join('\n'); return 'photosynthesis light reaction'; } };
  const history = [{ role: 'user', content: 'How does photosynthesis convert sunlight?' }];
  const q = await formulateSearchQuery({ model, question: 'tell me more about that', history });
  assert.equal(q, 'photosynthesis light reaction');
  assert.match(seen, /Discourse state:/);              // the discourse frame was handed to the model
  assert.match(seen, /photosynthesis/i);               // carrying the subject the conversation is on
});

test('formulateSearchQuery instructs the model to strip task/format framing and read through typos', async () => {
  // The "wrtie me an essay about dolphins" run: a typo defeats the deterministic subject peel, so the
  // whole framed sentence reaches this formulator. The prompt must tell the model to search the
  // SUBJECT, not the chore — dropping the "essay/report/…" piece noun and the "write/compose" verb —
  // and to read through the typo. If it doesn't, the query stays "essay about dolphins" and Wikipedia
  // lands on "Island of the Blue Dolphins", never the Dolphin article. Capture what the model sees.
  let seen = '';
  const model = { phrase: async (messages) => { seen = messages.map(m => m.content).join('\n'); return 'dolphins'; } };
  const q = await formulateSearchQuery({ model, question: 'wrtie me an essay about dolphins' });
  assert.equal(q, 'dolphins');                          // the bare subject passes through
  assert.match(seen, /wrtie me an essay about dolphins/); // the framed, misspelled turn reached the model
  assert.match(seen, /essay/i);                          // and the prompt names the produce-a-piece framing
  assert.match(seen, /typo/i);                           // …and tells it to read through the misspelling
});

// ── The clipped-subject guard: regrow a bare head noun over its noun phrase ───
test('a clipped rewrite is regrown over the user\'s own adjacent words ("elvis" → "elvis films")', async () => {
  // The reported run: "research elvis films and tell me the best one" was rewritten by a
  // small model down to the bare "elvis" — dropping the qualifier that says WHICH elvis. The
  // search then chased the man, not the films. The guard grows it back to the full noun
  // phrase, stopping at the connector "and" (never absorbing "tell me the best one").
  const model = { phrase: async () => 'elvis' };
  const q = await formulateSearchQuery({ model, question: 'research elvis films and tell me the best one' });
  assert.equal(q, 'elvis films');
});

test('extendClippedSubject: grows over adjacent nouns, halts at connectors and task words', () => {
  // Grows a clipped head noun over the contiguous noun phrase in the user's turn...
  assert.equal(extendClippedSubject('elvis', 'research elvis films and tell me the best one'), 'elvis films');
  assert.equal(extendClippedSubject('tokyo', 'what is the population of tokyo japan?'), 'tokyo japan');
  // ...but halts at a connector, so trailing instruction clauses are never absorbed
  assert.equal(extendClippedSubject('dolphins', 'write me an essay about dolphins and cite sources'), 'dolphins');
  // no-op when the query is not the user's own words (a model rewrite with resolved context)
  assert.equal(extendClippedSubject('X-Files 2025 revival', 'who is making the new series?'), 'X-Files 2025 revival');
  // no-op on an already well-formed multi-word query (more than a bare clipped subject)
  assert.equal(extendClippedSubject('elvis presley films career', 'elvis presley films career and legacy'), 'elvis presley films career');
});

test('the guard leaves a resolved back-reference rewrite untouched (only the user\'s own words regrow)', async () => {
  const model = { phrase: async () => 'X-Files 2025 revival series producer' };
  const history = [{ role: 'user', content: "what's the deal with the new x files?" }];
  const q = await formulateSearchQuery({ model, question: 'who is making the new series as of 2026?', history });
  assert.equal(q, 'X-Files 2025 revival series producer');   // not a verbatim sub-phrase → not regrown
});

test('runWebFollowup reformulates the raw query before searching (conversation in scope)', async () => {
  let searched = null;
  const model = { phrase: async () => 'X-Files new series 2026 producer' };
  const webSearch = async (q) => { searched = q; return [{ doc: groundedDoc('Chris Carter is developing it.') }]; };
  const first = { answer: 'It is made by someone.',
    webProposal: { query: 'who is making the new series as of 2026?', trigger: 'verify', rationale: 'r', cost: COST_NOTICE }, flags: [] };
  const out = await runWebFollowup({ question: 'q', docs: [], model, history: [] }, first, { webSearch });
  assert.equal(searched, 'X-Files new series 2026 producer', 'the engine got the reformulated query, not the chat filler');
  assert.equal(out.webFetched.query, 'X-Files new series 2026 producer', 'the audit records the query actually searched');
});

test('runWebFollowup: an explicit user query override skips reformulation', async () => {
  let searched = null;
  const model = { phrase: async () => 'should not be used' };
  const webSearch = async (q) => { searched = q; return [{ doc: groundedDoc('x') }]; };
  const first = { answer: 'a', webProposal: { query: 'raw', trigger: 'verify', rationale: 'r', cost: COST_NOTICE }, flags: [] };
  await runWebFollowup({ question: 'q', docs: [], model }, first, { webSearch, query: 'user sharpened this' });
  assert.equal(searched, 'user sharpened this');
});
