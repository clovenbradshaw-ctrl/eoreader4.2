import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCommonsMedia, renderCommonsMedia, commonsMediaSearchUrl,
  WIKIMEDIA_SOURCES, WIKIMEDIA_FULLTEXT,
} from '../src/organs/ingest/wikimedia.js';
import { routeKind, SEARCH_SOURCES } from '../src/organs/ingest/webfetch.js';

// Commons is a MEDIA repository — its answer to "sunflower" is photographs, not prose. The
// commonsmedia kind asks for the files themselves: a thumbnail, a mime type, dimensions, and the
// license/author that must ride with any reuse. Each test fails if the surface flattens a picture
// into a bare text row.

const MEDIA_JSON = JSON.stringify({
  query: { pages: {
    '222': {
      pageid: 222, index: 2, title: 'File:Second.jpg',
      imageinfo: [{
        url: 'https://upload.wikimedia.org/second.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Second.jpg',
        thumburl: 'https://upload.wikimedia.org/320px-second.jpg', thumbwidth: 320,
        mime: 'image/jpeg', width: 800, height: 600,
        extmetadata: { LicenseShortName: { value: 'CC0' } },
      }],
    },
    '111': {
      pageid: 111, index: 1, title: 'File:Sunflower sky.jpg',
      imageinfo: [{
        url: 'https://upload.wikimedia.org/sunflower.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sunflower_sky.jpg',
        thumburl: 'https://upload.wikimedia.org/320px-sunflower.jpg', thumbwidth: 320,
        mime: 'image/jpeg', width: 4000, height: 3000,
        extmetadata: {
          ImageDescription: { value: 'A <b>sunflower</b> against the sky' },
          LicenseShortName: { value: 'CC BY-SA 4.0' },
          Artist: { value: "<a href='/wiki/User:Jane'>Jane Photographer</a>" },
        },
      }],
    },
  } },
});

test('commons-media: parse yields real media, ranked, with thumb/mime/license/author', () => {
  const items = parseCommonsMedia(MEDIA_JSON, 12);
  assert.equal(items.length, 2);
  // sorted by the search rank in `index`, not the pageid hash order
  assert.equal(items[0].title, 'Sunflower sky.jpg');
  assert.equal(items[0].source, 'commonsmedia');
  assert.equal(items[0].thumbUrl, 'https://upload.wikimedia.org/320px-sunflower.jpg');
  assert.equal(items[0].fileUrl, 'https://upload.wikimedia.org/sunflower.jpg');
  assert.equal(items[0].mime, 'image/jpeg');
  assert.equal(items[0].mediaType, 'image');
  assert.equal(items[0].width, 4000);
  assert.equal(items[0].license, 'CC BY-SA 4.0');
  assert.equal(items[0].artist, 'Jane Photographer');    // HTML stripped from the credit
  assert.match(items[0].text, /sunflower against the sky/);
  assert.equal(items[0].url, 'https://commons.wikimedia.org/wiki/File:Sunflower_sky.jpg');
  assert.equal(items[1].license, 'CC0');
});

test('commons-media: renderCommonsMedia is legible attribution — a picture read as a source', () => {
  const [item] = parseCommonsMedia(MEDIA_JSON, 1);
  const text = renderCommonsMedia({ ...item, description: item.text });
  assert.match(text, /Sunflower sky\.jpg/);
  assert.match(text, /Media: image\/jpeg \(4000×3000\)/);
  assert.match(text, /Author: Jane Photographer/);
  assert.match(text, /License: CC BY-SA 4\.0/);
  assert.match(text, /File: https:\/\/upload\.wikimedia\.org\/sunflower\.jpg/);
});

test('commons-media: the search kind fetches the File namespace and parses', async () => {
  let seen = null;
  const ctx = { fetchUrl: async (u) => { seen = u; return { text: MEDIA_JSON }; } };
  const items = await WIKIMEDIA_SOURCES.commonsmedia(ctx, 'sunflower', 12);
  assert.equal(seen, commonsMediaSearchUrl('sunflower', 12));
  assert.match(seen, /gsrnamespace=6/);       // the File namespace
  assert.match(seen, /iiprop=/);              // imageinfo requested
  assert.equal(items.length, 2);
});

test('commons-media: the full-text hook renders attribution (+ the description extract)', async () => {
  const [item] = parseCommonsMedia(MEDIA_JSON, 1);
  const client = { fetchUrl: async () => ({ text: JSON.stringify({ query: { pages: { '1': { extract: 'A tall annual sunflower photographed at dusk.' } } } }) }) };
  const text = await WIKIMEDIA_FULLTEXT.commonsmedia(client, item);
  assert.match(text, /License: CC BY-SA 4\.0/);        // the rendered metadata
  assert.match(text, /photographed at dusk/);          // the description-page extract joined in
  // a failed extract still returns the attribution block, never empty
  const bad = { fetchUrl: async () => { throw new Error('down'); } };
  const only = await WIKIMEDIA_FULLTEXT.commonsmedia(bad, item);
  assert.match(only, /Media: image\/jpeg/);
});

test('commons-media: routeKind reaches the media surface on media phrasing', () => {
  assert.equal(routeKind('wikimedia commons sunflower photos'), 'commonsmedia');
  assert.equal(routeKind('photo of a steam locomotive'), 'commonsmedia');
  assert.equal(routeKind('free media of the moon'), 'commonsmedia');
  // plain "wikimedia commons …" (no media word) still routes to the description-text kind
  assert.equal(routeKind('wikimedia commons kafka portrait'), 'commons');
  assert.ok(SEARCH_SOURCES.commonsmedia, 'commonsmedia is a registered search kind');
});
