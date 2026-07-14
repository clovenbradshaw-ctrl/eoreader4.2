import { test } from 'node:test';
import assert from 'node:assert/strict';

import { innerVoice } from '../src/murmur/narrate/voice.js';
import { createMurmur } from '../src/murmur/index.js';

// The model-free inner voice (src/murmur/narrate/voice.js). The strip must read like a mind READING —
// it voices the ACTUAL propositions the fold parsed (the reader's grounded claims), not canned
// reactions to the geometry. The register only TINTS them (its colour, not its words). These assert:
// the propositions are surfaced verbatim, in order, ≤2; the feeling tints without rewriting; a wander
// phrase leads; the passage is the fallback when nothing was parsed; and a wired murmur carries the
// propositions handed to it straight onto the voice.

const imp = (register, decayedIntensity) => ({ register, decayedIntensity });

test('the actual parsed propositions are what flows through — voiced verbatim, in order', () => {
  const props = [{ text: 'Ryan Coogler directed Sinners.' }, { text: 'Sinners premiered in 2025.' }];
  const v = innerVoice({ propositions: props, impressions: [] });
  assert.equal(v.length, 2, 'the two most salient claims');
  assert.equal(v[0].text, 'Ryan Coogler directed Sinners.', 'the reader\'s real claim, unaltered');
  assert.equal(v[1].text, 'Sinners premiered in 2025.', 'no canned template rewrote it');
});

test('the feeling TINTS the claim (its colour) — it does not rewrite it', () => {
  const props = [{ text: 'Ryan Coogler directed Sinners.' }];
  const calm = innerVoice({ propositions: props, impressions: [] });
  assert.equal(calm[0].register, null, 'no register crossed → neutral ink');
  const uneasy = innerVoice({ propositions: props, impressions: [imp('unease', 0.8)] });
  assert.equal(uneasy[0].register, 'unease', 'a live unease tints the claim');
  assert.equal(uneasy[0].text, 'Ryan Coogler directed Sinners.', 'the words are still the real proposition');
});

test('plain-string propositions are accepted too', () => {
  const v = innerVoice({ propositions: ['Grete fed Gregor.'], impressions: [] });
  assert.equal(v[0].text, 'Grete fed Gregor.');
});

test('the strongest live register is the one that tints', () => {
  const props = [{ text: 'A did B.' }];
  const v = innerVoice({ propositions: props, impressions: [imp('drift', 0.4), imp('surprise', 0.9)] });
  assert.equal(v[0].register, 'surprise', 'the most intense feeling wins the tint');
});

test('a wander phrase leads verbatim, then the parsed claims trail', () => {
  const v = innerVoice({
    propositions: [{ text: 'Sinners premiered in 2025.' }],
    impressions: [],
    mutter: { register: 'curiosity', phrase: 'turning over the harbor treaty' },
  });
  assert.equal(v[0].text, 'turning over the harbor treaty', 'the murmur\'s own words first');
  assert.equal(v[1].text, 'Sinners premiered in 2025.', 'a real claim trails');
  assert.equal(v.length, 2, 'at most two thoughts at once');
});

test('nothing parsed → it voices the passage it is literally reading (still real content)', () => {
  const v = innerVoice({ propositions: [], passageText: 'The harbor treaty was signed in the spring, ending the long blockade of the northern ports.', impressions: [] });
  assert.equal(v.length, 1);
  assert.ok(/harbor treaty was signed/.test(v[0].text), 'a clause of the actual passage');
  assert.ok(v[0].text.length < 100, 'condensed to a thought, not a paragraph');
});

test('truly idle → a spare state line, never a fabricated reaction to content', () => {
  const idle = innerVoice({ propositions: [], passageText: '', signal: null, impressions: [] });
  assert.equal(idle.length, 1);
  assert.ok(/still|reading along/.test(idle[0].text));
  assert.equal(idle[0].register, null, 'a state line carries no feeling-colour');
});

// ── the native-EOT tuple each voiced thought carries (op, sites, res) ────────────────────────────
// The strip reads like the log now: `glyph OP site(s) · res`. The tuple is a RENDERING of the same
// real impression the prose voices — derived deterministically from the feeling/content, never
// fabricated and never random. These assert the operator each act reads as, the void/firm default,
// the CON arity, SYN's promotion, and that a referent recurs with the same site (coref binds).

test('a grounded proposition is a CON — the central bond — firm, with two argument sites', () => {
  const v = innerVoice({ propositions: [{ text: 'Ryan Coogler directed Sinners.' }], impressions: [] });
  assert.equal(v[0].op, 'CON', 'a parsed x→relation→y claim is a bond');
  assert.equal(v[0].sites.length, 2, 'CON reads two — subject and object slots (§3a arity)');
  assert.equal(v[0].res.band, 'firm', 'the reader grounded it → firm');
  assert.ok(v[0].res.p > 0.5, 'firm carries a high how-definitely');
  assert.ok(/^r#[0-9a-z]{3}$/.test(v[0].sites[0].hash), 'the site is an opaque r# handle');
});

test('unease or drift hedges the claim to VOID — the how-definitely is withheld', () => {
  const uneasy = innerVoice({ propositions: [{ text: 'A did B.' }], impressions: [imp('unease', 0.8)] });
  assert.equal(uneasy[0].op, 'CON', 'still the bond');
  assert.equal(uneasy[0].res.band, 'void', 'the sense is unsure — void, not firm');
  assert.ok(uneasy[0].res.p < 0.5, 'void withholds');
});

test('the idle hold is a NUL — void, low p — never a fabricated event', () => {
  const idle = innerVoice({ propositions: [], passageText: '', signal: null, impressions: [] });
  assert.equal(idle[0].op, 'NUL', 'a quiet mind holds (NUL), it does not assert');
  assert.equal(idle[0].res.band, 'void', 'the default posture is the void');
  assert.equal(idle[0].sites.length, 1, 'a hold reads one');
});

test('the passage the reader is turning over is a SEG (resplit), void', () => {
  const v = innerVoice({ propositions: [], passageText: 'The harbor treaty was signed in the spring.', impressions: [] });
  assert.equal(v[0].op, 'SEG', 'reading within a figure resplits it');
  assert.equal(v[0].res.band, 'void', 'nothing established yet — just reading');
});

test('the feeling picks the operator for a register-led wander mutter', () => {
  const surprise = innerVoice({ propositions: [], impressions: [], mutter: { register: 'surprise', phrase: 'something arrived' } });
  assert.equal(surprise[0].op, 'SIG', 'surprise is the first mark — SIG');
  assert.equal(surprise[0].res.band, 'firm', 'a mark against the field is firm');
  const recog = innerVoice({ propositions: [], impressions: [], mutter: { register: 'recognition', phrase: "we've seen this before" } });
  assert.equal(recog[0].op, 'CON', 'recognition BINDS two loci — CON');
  assert.equal(recog[0].sites.length, 2, 'a bond reads two');
  const discovery = innerVoice({ propositions: [], impressions: [], mutter: { register: 'discovery', phrase: 'folding what it found' } });
  assert.equal(discovery[0].op, 'SYN', 'discovery synthesizes a higher-grain figure');
});

test('a referent recurs with the SAME site — coref binds, it never re-mints', () => {
  const a = innerVoice({ propositions: [{ text: 'Ryan Coogler directed Sinners.' }], impressions: [] });
  const b = innerVoice({ propositions: [{ text: 'Sinners premiered in 2025.' }], impressions: [] });
  // "Sinners" is the object of the first claim and (leading) referent of the second — same handle both times.
  const sinnersInA = a[0].sites[a[0].sites.length - 1].hash;
  const sinnersInB = b[0].sites[0].hash;
  assert.equal(sinnersInA, sinnersInB, 'the same figure mints the same opaque site across events');
});

test('a wired murmur carries the handed-in propositions straight onto its voice', async () => {
  const V = (x, y) => Float32Array.from([x, y]);
  const m = createMurmur({ now: () => 1000 });
  const snap = await m.observe({
    ref: { turnId: 't1', stepName: 'fold', t: 1 },
    query: 'who directed Sinners', queryVec: V(1, 0), readingVecs: [V(1, 0)],
    concentration: { concentrated: true, top: 0.9 }, measuresMeaning: true,
    propositions: [{ text: 'Ryan Coogler directed Sinners.' }],
    passageText: 'Ryan Coogler directed the 2025 film Sinners.',
  });
  assert.ok(Array.isArray(snap.voice) && snap.voice.length >= 1, 'the snapshot carries the voice');
  assert.equal(snap.voice[0].text, 'Ryan Coogler directed Sinners.', 'it voices the real parsed claim');
  assert.equal(m.state().voice[0].text, 'Ryan Coogler directed Sinners.', 'exposed to the strip via the read side-channel');
});
