import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLearning, createMurmur, murmurConfig,
  learnTerms, profileOf, curiosityOf, foldInto, leadTerms, plausibleTopic,
} from '../src/murmur/index.js';
import { canWitness } from '../src/core/provenance.js';

// Self-guided learning (murmur/learn). The wander picks the most INTERESTING place (the one
// surprise pointed inward), keeps a REAFFERENT note (canWitness===false — the firewall), and
// decides, one lead at a time, whether to reach out. Pure + offline: no model, no network.

const monotonicNow = () => { let t = 0; return () => (t += 1000); };

test('curiosity is the one surprise: a new passage moves belief, a restatement does not', () => {
  const learn = createLearning({ now: monotonicNow() });
  const first = { text: 'The harbor tariffs reshaped the shipping lanes and the port authority.', source: { docId: 'd1', cursor: 3 } };
  const pick1 = learn.wander([first]);
  assert.ok(pick1, 'a fresh passage is interesting');
  assert.ok(pick1.curiosity > 0, 'it carries positive curiosity (bits)');
  learn.learn(pick1);

  // The SAME passage, once learned, is no longer news — every term is already turned over.
  const pick2 = learn.wander([first]);
  assert.equal(pick2, null, 'a restatement of what was learned raises nothing new');
});

test('wander picks the single MOST interesting candidate (best-first, one step)', () => {
  const learn = createLearning({ now: monotonicNow() });
  // prime the profile with maritime terms so the maritime candidate is familiar
  learn.learn(learn.wander([{ text: 'harbor port shipping tariffs lanes vessels cargo' }]));
  const dull = { text: 'harbor port shipping tariffs again', source: { id: 'dull' } };
  const novel = { text: 'quantum entanglement decoherence qubits superposition', source: { id: 'novel' } };
  const pick = learn.wander([dull, novel]);
  assert.ok(pick, 'something is interesting');
  assert.equal(pick.source.id, 'novel', 'the unfamiliar thread wins, not the restatement');
});

test('a learning note is REAFFERENT — canWitness(prov) === false (the firewall, surfaced)', () => {
  const learn = createLearning({ now: monotonicNow() });
  const note = learn.learn(learn.wander([{ text: 'vibranium metallurgy wakanda alloys' }]));
  assert.ok(note, 'a note was minted');
  assert.equal(note.layer, 'learning', 'it belongs to the toggleable learning layer');
  assert.equal(note.canWitness, false, 'a note can never be a citable fact');
  assert.equal(canWitness(note.prov), false, 'its provenance is reafferent by construction');
  assert.equal(note.grounded, false);
  assert.ok(typeof note.phrase === 'string' && note.phrase.length, 'it carries a prose mutter');
});

test('the notebook is the learning graph layer — bounded, ordered, readable', () => {
  const learn = createLearning({ config: { maxNotes: 3 }, now: monotonicNow() });
  for (const t of ['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota', 'kappa lambda mu']) {
    learn.learn(learn.wander([{ text: t }]));
  }
  const notes = learn.notes();
  assert.equal(notes.length, 3, 'the notebook is capped');
  assert.ok(notes.every((n) => n.layer === 'learning' && n.canWitness === false), 'every note is a firewalled learning note');
  assert.equal(learn.count(), 3);
});

test('outwardLead: reach out for a term the record does NOT explain, anchored, never a bare namesake', () => {
  const learn = createLearning({ now: monotonicNow() });
  const pick = learn.wander([{ text: 'The revival is directed by coogler, a striking choice.' }]);
  const note = learn.learn(pick);
  // "coogler" is not in what the record already explains → a lead, sharpened by the anchor.
  const lead = learn.outwardLead(note, { known: new Set(['revival', 'directed']), anchor: 'x-files revival' });
  assert.ok(lead, 'an unexplained figure is worth reaching out about');
  assert.ok(lead.query.toLowerCase().includes('x-files revival'), 'the query rides the anchor, not the bare term');
  assert.ok(lead.query.toLowerCase().includes(lead.term), 'and carries the lead');

  // Everything the note names is already known → nothing to chase.
  const none = learn.outwardLead(note, { known: new Set(note.terms), anchor: 'x' });
  assert.equal(none, null, 'no outward lead when the record already explains it');
});

test('artifact shapes never become leads (OCR/markup crumbs)', () => {
  assert.equal(plausibleTopic('coogler'), true);
  assert.equal(plausibleTopic('covid19'), true);
  assert.equal(plausibleTopic('c0mpany'), false);   // digit spliced between letters
  assert.equal(plausibleTopic('rn'), false);        // vowelless
  assert.equal(plausibleTopic('vvv'), false);       // smear
  const by = { coogler: 0.9, c0mpany: 1.2 };
  assert.deepEqual(leadTerms(by, new Set()), ['coogler'], 'the garbage token, though heaviest, is dropped');
});

test('minimal helpers: terms drop stopwords, profile counts repetition, foldInto γ-decays', () => {
  assert.deepEqual(learnTerms('The port and the harbor'), ['port', 'harbor']);
  assert.equal(profileOf('port port harbor').get('port'), 2, 'repetition is signal');
  const prior = new Map([['port', 1]]);
  const next = foldInto(prior, new Map([['harbor', 1]]), 0.8);
  assert.equal(next.get('port'), 0.8, 'the incumbent decays by γ');
  assert.equal(next.get('harbor'), 1, 'the arrival deposits at full mass');
  assert.equal(prior.get('port'), 1, 'the input prior is untouched');
});

test('murmur.mutter broadcasts a LIVE thought to watchers without touching the log or prompt', () => {
  const appended = [];
  const murmur = createMurmur({ config: murmurConfig(), appendLog: (e) => appended.push(e) });
  let seen = null;
  const un = murmur.subscribe((s) => { seen = s; });
  const snap = murmur.mutter({ phrase: 'turning over the harbor tariffs', register: 'curiosity', intensity: 0.6 });
  assert.ok(seen, 'a watcher was notified');
  assert.equal(seen, snap, 'the broadcast snapshot is the last state');
  assert.equal(murmur.state().mutter.phrase, 'turning over the harbor tariffs');
  const imp = murmur.state().impressions.find((i) => i.phrase);
  assert.ok(imp && imp.register === 'curiosity', 'the strip can read the mutter as a phrase-bearing impression');
  assert.equal(appended.length, 0, 'a mutter is NEVER a log write (canAppendLog stays false)');
  un();
});

test('murmur exposes the learning notebook and it survives resetSession → cleared', () => {
  const murmur = createMurmur({ config: murmurConfig() });
  assert.ok(murmur.learn && typeof murmur.learn.wander === 'function', 'the notebook is exposed');
  murmur.learn.learn(murmur.learn.wander([{ text: 'novel unfamiliar terms here today' }]));
  assert.equal(murmur.learn.count(), 1);
  murmur.resetSession();
  assert.equal(murmur.learn.count(), 0, 'a new session starts with an empty notebook');
});
