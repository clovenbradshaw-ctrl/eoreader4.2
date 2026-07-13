import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  registrableHost, witnessDescriptor, sameWitness, distinctVoices,
  distinctWitnessCount, distinctEnough, reflectionWitnesses, underCorroborated, corroborationCensus,
} from '../src/enactor/ground/corroboration.js';

// ARE THE WITNESSES MEANINGFULLY DISTINCT? (enactor/ground/corroboration.js) reflectAnswer counts
// independent root origins; this asks whether those origins are really independent VOICES — not
// mirrors, reprints, or the same publisher — and whether they reach two. The measure that keys the
// "not sourced from multiple, meaningfully distinct sources" trigger and the corroboration walk.

// ── registrableHost — mirrors of one publisher collapse to one host ───────────
test('registrableHost reads the registrable domain, www-stripped, mirrors fused', () => {
  assert.equal(registrableHost('https://en.wikipedia.org/wiki/Dolphin'), 'wikipedia.org');
  assert.equal(registrableHost('https://simple.wikipedia.org/wiki/Dolphin'), 'wikipedia.org');
  assert.equal(registrableHost('https://www.apnews.com/article/x'), 'apnews.com');
  assert.equal(registrableHost('https://news.bbc.co.uk/story'), 'bbc.co.uk');   // two-label suffix kept
  assert.equal(registrableHost('example.com'), 'example.com');                  // bare host, no scheme
  assert.equal(registrableHost(''), '');
});

// ── sameWitness — one voice by IDENTITY FACTS and the ONE surprise, no coefficient ──
test('sameWitness collapses same host / same hash / same id / same author', () => {
  assert.equal(sameWitness({ id: 'a', host: 'wikipedia.org' }, { id: 'b', host: 'wikipedia.org' }), true);
  assert.equal(sameWitness({ id: 'a', hash: 'h1' }, { id: 'b', hash: 'h1' }), true);
  assert.equal(sameWitness({ id: 'x' }, { id: 'x' }), true);
  assert.equal(sameWitness({ id: 'a', host: 'x.com', author: 'A. Byline' }, { id: 'b', host: 'y.com', author: 'A. Byline' }), true);
});

test('sameWitness keeps two different publishers with different text apart', () => {
  const a = { id: 'a', host: 'apnews.com', text: 'the fine was fifty thousand dollars levied by the court against the retailer' };
  const b = { id: 'b', host: 'reuters.com', text: 'a penalty of fifty thousand was imposed following the tribunal ruling on the data breach' };
  assert.equal(sameWitness(a, b), false, 'two publishers reporting the same fact are still two voices');
});

test('sameWitness collapses a byte-identical reprint across two hosts by content hash', () => {
  // A wire story reprinted verbatim on two sites: the hosts differ, but the proxy's content hash
  // is the same bytes — the fact that catches syndication without a guessed similarity threshold.
  assert.equal(sameWitness(
    { id: 'a', host: 'site-one.com', hash: 'fnv:deadbeef' },
    { id: 'b', host: 'site-two.com', hash: 'fnv:deadbeef' },
  ), true, 'the same bytes on two hosts is one voice');
});

test('sameWitness keeps two same-fact reports apart — content sameness is not source sameness', () => {
  // The failure a content threshold would cause: two independent reports MUST share the fact
  // (the fine, the figure), so nothing about their overlapping words makes them one voice.
  assert.equal(sameWitness(
    { id: 'a', host: 'apnews.com', text: 'Zylbrook was fined fifty thousand dollars over the breach.' },
    { id: 'b', host: 'reuters.com', text: 'Regulators fined Zylbrook fifty thousand dollars for the breach.' },
  ), false, 'same fact, different publishers → two voices');
});

// ── distinctVoices — the integer "how many distinct sources" ──────────────────
test('distinctVoices: two mirrors are one voice, two publishers are two', () => {
  const mirrors = [{ id: 1, host: 'wikipedia.org' }, { id: 2, host: 'wikipedia.org' }];
  assert.equal(distinctVoices(mirrors), 1);
  const two = [
    { id: 1, host: 'apnews.com', text: 'alpha beta gamma delta' },
    { id: 2, host: 'reuters.com', text: 'epsilon zeta eta theta' },
  ];
  assert.equal(distinctVoices(two), 2);
});

test('distinctVoices: two mirrors + one independent publisher is two voices', () => {
  const set = [
    { id: 1, host: 'wikipedia.org', text: 'a b c' },
    { id: 2, host: 'wikipedia.org', text: 'a b c' },
    { id: 3, host: 'apnews.com', text: 'x y z' },
  ];
  assert.equal(distinctVoices(set), 2, 'wikipedia (twice) + AP = two meaningfully distinct sources');
});

test('distinctEnough gates on two distinct voices by default', () => {
  assert.equal(distinctEnough([{ id: 1, host: 'w.org' }, { id: 2, host: 'w.org' }]), false);
  assert.equal(distinctEnough([
    { id: 1, host: 'a.com', text: 'a b c' }, { id: 2, host: 'b.com', text: 'x y z' },
  ]), true);
});

// ── witnessDescriptor — a web doc and a plain descriptor both normalise ───────
test('witnessDescriptor normalises an admitted web doc and a plain descriptor', () => {
  const fromDoc = witnessDescriptor({ docId: 'web-abc', text: 'body', web: { url: 'https://www.apnews.com/x', byline: 'A. Reporter', content_hash: 'fnv:1' } });
  assert.equal(fromDoc.id, 'web-abc');
  assert.equal(fromDoc.host, 'apnews.com');
  assert.equal(fromDoc.author, 'A. Reporter');
  assert.equal(fromDoc.hash, 'fnv:1');
  const fromDesc = witnessDescriptor({ id: 's1', url: 'https://reuters.com/y', text: 'body' });
  assert.equal(fromDesc.host, 'reuters.com');
  assert.equal(witnessDescriptor(null), null);
});

// ── reflectionWitnesses + underCorroborated — the answer-grain decision ───────
const singleSourceReflection = {
  summary: { relations: 1, corroborated: 0, singleSource: 1, crossModal: 0, unwitnessed: 0, interpretation: 0, origins: 1 },
  eot: [{ kind: 'relation', status: 'single-source', sources: [{ docId: 'docA', text: 'the fine was fifty thousand dollars' }], origins: 1 }],
};

test('underCorroborated: a single-source answer is under-corroborated', () => {
  assert.equal(underCorroborated(singleSourceReflection), true);
  const census = corroborationCensus(singleSourceReflection);
  assert.equal(census.witnessed, 1);
  assert.equal(census.distinct, 1);
  assert.equal(census.under, true);
});

test('underCorroborated: an answer on two independent publishers is NOT under-corroborated', () => {
  const reflection = {
    summary: { relations: 1, corroborated: 1, singleSource: 0, crossModal: 0, unwitnessed: 0, interpretation: 0, origins: 2 },
    eot: [{ kind: 'relation', status: 'corroborated', origins: 2,
      sources: [{ docId: 'docA', text: 'alpha beta gamma' }, { docId: 'docB', text: 'delta epsilon zeta' }] }],
  };
  const enrich = { docA: { url: 'https://apnews.com/x' }, docB: { url: 'https://reuters.com/y' } };
  assert.equal(underCorroborated(reflection, enrich), false);
});

test('underCorroborated: two docIds that are the same publisher collapse — still under-corroborated', () => {
  // reflectAnswer counted TWO origins (two docIds), but the enrichment reveals both are the same
  // host: two mirrors of one voice, not two. The refinement reflect can't make on docId alone.
  const reflection = {
    summary: { relations: 1, corroborated: 1, singleSource: 0, crossModal: 0, unwitnessed: 0, interpretation: 0, origins: 2 },
    eot: [{ kind: 'relation', status: 'corroborated', origins: 2,
      sources: [{ docId: 'web-1', text: 'same body text here' }, { docId: 'web-2', text: 'same body text here' }] }],
  };
  const enrich = { 'web-1': { url: 'https://en.wikipedia.org/wiki/X' }, 'web-2': { url: 'https://simple.wikipedia.org/wiki/X' } };
  assert.equal(underCorroborated(reflection, enrich), true, 'two Wikipedia mirrors are one voice');
});

test('underCorroborated: no witnessed relation (a void / interpretation) is NOT this trigger', () => {
  assert.equal(underCorroborated({ summary: { relations: 1, corroborated: 0, singleSource: 0, crossModal: 0, unwitnessed: 1, interpretation: 0 }, eot: [] }), false);
  assert.equal(underCorroborated(null), false, 'no reflection → never fires (opt-in)');
  assert.equal(underCorroborated(undefined), false);
});

test('reflectionWitnesses de-duplicates by docId across relations', () => {
  const reflection = { eot: [
    { sources: [{ docId: 'docA', text: 'one' }, { docId: 'docB', text: 'two' }] },
    { sources: [{ docId: 'docA', text: 'one again' }] },
  ] };
  const w = reflectionWitnesses(reflection);
  assert.equal(w.length, 2);
  assert.deepEqual(w.map((d) => d.id).sort(), ['docA', 'docB']);
});
