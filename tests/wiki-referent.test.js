import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  titleAffinity, clipExtract, looksProperNoun, nameCore, articleNames,
  referentContext, pickReferent, wikiReferent,
} from '../src/rooms/reader/wiki-referent.js';

// The entity panel's wiki referent (4.1 `wikiBest`, restored): search Wikipedia, score
// the candidates against the entity's attested context, and CONFIRM only a corroborated
// match. All scoring is pure and tested offline; the fetch runs against a fake client.

test('titleAffinity — exact, head-noun, and coverage reads', () => {
  const exact = titleAffinity('Metro Council', 'Metro Council');
  assert.equal(exact.exact, true);
  assert.equal(exact.headMatch, true);
  const part = titleAffinity('Metro Council', 'Metropolitan Council of Nashville');
  assert.equal(part.exact, false);
  assert.equal(part.headMatch, true);          // 'council' agrees
  assert.ok(part.covL < 1);                    // 'metro' ≠ 'metropolitan'
  const none = titleAffinity('', 'Anything');
  assert.equal(none.covL, 0);
});

test('clipExtract is abbreviation-safe — "Roe v. Wade" never shatters', () => {
  const t = 'Roe v. Wade, 410 U.S. 113 (1973), was a landmark decision of the U.S. Supreme Court. Second sentence here.';
  const out = clipExtract(t, 300);
  assert.ok(out.startsWith('Roe v. Wade'));
  assert.match(out, /Supreme Court\./);        // not cut at "Roe v." or "U.S."
  assert.ok(clipExtract('', 300) === '');
});

test('looksProperNoun and nameCore — the name behind the office', () => {
  assert.equal(looksProperNoun('JD Vance'), true);
  assert.equal(looksProperNoun('immigrant neighborhoods'), false);
  assert.equal(looksProperNoun('reef'), false);
  assert.equal(nameCore('Vice President JD Vance'), 'JD Vance');
  assert.equal(nameCore('Dr. Jane Goodall'), 'Jane Goodall');
  assert.equal(nameCore('Nashville'), 'Nashville');   // a bare name is never stripped
});

test('articleNames keeps specific referents, drops generic org/geo/calendar filler', () => {
  const names = articleNames('The Louisville Metro Council is the city legislature of Louisville, Kentucky.');
  assert.ok(names.has('louisville'));
  assert.ok(names.has('kentucky'));
  assert.ok(!names.has('council'));            // generic filler never corroborates
});

test('referentContext — strong terms from the record, proper coref set minus self', () => {
  const ctx = referentContext({
    label: 'Metro Council',
    statements: ['The Metro Council voted to expand the transit line in Nashville.'],
    neighbors: ['Nashville', 'Tennessee'],
    pageTitles: ['City budget hearing'],
  });
  assert.ok(ctx.strong.has('nashville'));
  assert.ok(ctx.proper.has('nashville') && ctx.proper.has('tennessee'));
  assert.ok(!ctx.proper.has('metro'));         // the entity's own tokens never self-corroborate
  assert.ok(ctx.weak.has('budget'));
});

test('pickReferent CONFIRMS an exact-title match corroborated by the record', () => {
  const ctx = referentContext({
    label: 'Metro Council',
    statements: ['The Metro Council voted to expand the transit line.'],
    neighbors: ['Nashville', 'Tennessee'],
  });
  const best = pickReferent('Metro Council', ctx, [{
    title: 'Metro Council',
    description: 'governing body of Nashville',
    extract: 'The Metro Council is the governing body of Nashville and Davidson County, Tennessee.',
  }]);
  assert.equal(best.confirmed, true);
  assert.ok(best.coref >= 1);
  assert.equal(best.url, 'https://en.wikipedia.org/wiki/Metro_Council');
});

test('pickReferent DISCONFIRMS a same-name article anchored somewhere else entirely', () => {
  // 4.1's Louisville example: the graph knows Nashville/Tennessee/Davidson; an article
  // naming its OWN referents (Louisville, Kentucky) with zero coref is a different
  // thing wearing the same letters — refused even though the title matches exactly.
  const ctx = referentContext({
    label: 'Metro Council',
    statements: [],
    neighbors: ['Nashville', 'Tennessee', 'Davidson'],
  });
  const best = pickReferent('Metro Council', ctx, [{
    title: 'Metro Council',
    description: 'city legislature of Louisville',
    extract: 'The Louisville Metro Council is the legislature of Louisville, Kentucky, United States of America.',
  }]);
  assert.equal(best.confirmed, false);
  assert.equal(best.disconfirmed, true);
});

test('pickReferent confirms a specific multi-token proper NAME even on a sparse graph', () => {
  const ctx = referentContext({ label: 'Vice President JD Vance', statements: [], neighbors: [] });
  const best = pickReferent('Vice President JD Vance', ctx, [{
    title: 'JD Vance',
    description: 'American politician',
    extract: 'James David Vance is an American politician and author serving as the vice president of the United States.',
  }]);
  assert.equal(best.confirmed, true);
});

test('pickReferent — a generic concept accepts its general article on the name alone', () => {
  const ctx = referentContext({ label: 'reef', statements: [], neighbors: [] });
  const best = pickReferent('reef', ctx, [{
    title: 'Reef',
    description: 'ridge beneath the water surface',
    extract: 'A reef is a ridge or shoal of rock or coral lying beneath the surface of the water.',
  }]);
  assert.equal(best.confirmed, true);
});

test('pickReferent ranks the corroborated referent above the lexical stranger', () => {
  // "Outside" the magazine vs "Outside (jazz)": the record's context terms (magazine,
  // published, obituary) corroborate the magazine, so it wins the ranking.
  const ctx = referentContext({
    label: 'Outside',
    statements: ['Outside published a lengthy obituary for the climber.'],
    neighbors: [],
  });
  const best = pickReferent('Outside', ctx, [
    { title: 'Outside (jazz)', description: 'improvisation approach', extract: 'In jazz improvisation, playing outside means departing from the underlying harmony.' },
    { title: 'Outside (magazine)', description: 'American magazine', extract: 'Outside is an American magazine that has published articles and obituary features about climbers and outdoor athletes.' },
  ]);
  assert.equal(best.title, 'Outside (magazine)');
});

test('pickReferent returns null on an empty candidate set', () => {
  assert.equal(pickReferent('Anything', referentContext({ label: 'Anything' }), []), null);
});

test('pickReferent carries the lead image through for the confirmed referent', () => {
  const ctx = referentContext({
    label: 'Neil Armstrong', statements: ['Neil Armstrong walked on the Moon.'], neighbors: ['Apollo', 'NASA'],
  });
  const best = pickReferent('Neil Armstrong', ctx, [{
    title: 'Neil Armstrong', description: 'American astronaut',
    extract: 'Neil Armstrong was an American astronaut and the first person to walk on the Moon, commanding Apollo 11.',
    thumb: 'https://upload.wikimedia.org/x/Neil_Armstrong.jpg', thumbW: 320, thumbH: 400,
  }]);
  assert.equal(best.confirmed, true);
  assert.equal(best.thumb, 'https://upload.wikimedia.org/x/Neil_Armstrong.jpg');
  assert.equal(best.thumbW, 320);
  // a candidate with no image degrades to an empty string, never undefined
  const noPic = pickReferent('reef', referentContext({ label: 'reef' }),
    [{ title: 'Reef', description: 'ridge beneath the water', extract: 'A reef is a ridge of rock or coral beneath the water surface.' }]);
  assert.equal(noPic.thumb, '');
});

// ── the fetch, against a fake client ─────────────────────────────────────────────────
const page = (id, title, extract, description = '', disambig = false, thumb = '') => [id, {
  pageid: id, title, extract, description,
  ...(disambig ? { pageprops: { disambiguation: '' } } : {}),
  ...(thumb ? { thumbnail: { source: thumb, width: 320, height: 400 } } : {}),
}];

test('wikiReferent asks for a lead thumbnail and threads it onto the confirmed referent', async () => {
  const client = { fetchUrl: async (url) => {
    // the search asks the pageimages prop for a thumbnail
    assert.match(url, /prop=[^&]*pageimages/);
    assert.match(url, /pithumbsize=\d+/);
    const pages = Object.fromEntries([
      page(1, 'Neil Armstrong', 'Neil Armstrong was an American astronaut and the first person to walk on the Moon.',
        'American astronaut', false, 'https://upload.wikimedia.org/x/Neil_Armstrong.jpg'),
    ]);
    return { text: JSON.stringify({ query: { pages } }) };
  } };
  const best = await wikiReferent(client, {
    label: 'Neil Armstrong', statements: ['Neil Armstrong walked on the Moon.'], neighbors: ['Apollo'],
  });
  assert.equal(best.confirmed, true);
  assert.equal(best.thumb, 'https://upload.wikimedia.org/x/Neil_Armstrong.jpg');
});

test('wikiReferent searches, filters disambiguation pages, merges the context search, confirms', async () => {
  const calls = [];
  const client = { fetchUrl: async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams.get('gsrsearch');
    const pages = q === 'Metro Council'
      ? Object.fromEntries([
          page(1, 'Metro Council', 'The Metro Council is the governing body of Nashville and Davidson County, Tennessee.', 'governing body'),
          page(2, 'Metro (disambiguation)', 'Metro may refer to:', '', true),
        ])
      : Object.fromEntries([
          page(3, 'Nashville', 'Nashville is the capital city of the U.S. state of Tennessee.', 'capital of Tennessee'),
        ]);
    return { text: JSON.stringify({ query: { pages } }) };
  } };
  const best = await wikiReferent(client, {
    label: 'Metro Council',
    statements: ['The Metro Council voted to expand the transit line.'],
    neighbors: ['Nashville', 'Tennessee'],
  });
  assert.equal(calls.length, 2);                          // label search + context-augmented search
  assert.match(calls[0], /generator=search/);
  assert.equal(best.title, 'Metro Council');              // the disambiguation page never competes
  assert.equal(best.confirmed, true);
});

test('wikiReferent refuses lookup-unworthy labels without touching the network', async () => {
  let called = 0;
  const client = { fetchUrl: async () => { called++; return { text: '{}' }; } };
  assert.equal(await wikiReferent(client, { label: '' }), null);
  assert.equal(await wikiReferent(client, { label: 'https://example.org/x' }), null);
  assert.equal(await wikiReferent(client, { label: '12 §§ 34' }), null);
  assert.equal(called, 0);
});

test('wikiReferent degrades to null on a network failure', async () => {
  const client = { fetchUrl: async () => { throw new Error('offline'); } };
  assert.equal(await wikiReferent(client, { label: 'Metro Council' }), null);
});
