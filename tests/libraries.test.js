import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIBRARIES, LIBRARY_LIST, LIBRARY_IDS, SURFACES, surfaceCard,
  libraryFor, libraryForKind, describeLibrary, librariesManifest,
} from '../src/organs/ingest/libraries.js';

// The library shelf gives each kind of thing the customized surface it deserves: an article, a
// book, a media file, a repo — never a flattened "title + snippet". Each test fails if a card
// loses exactly what makes its shelf worth searching.

test('libraries: the four featured shelves are present, each with its surface', () => {
  assert.deepEqual(LIBRARY_IDS, ['wikipedia', 'gutenberg', 'commons', 'github']);
  assert.equal(LIBRARIES.wikipedia.surface, 'article');
  assert.equal(LIBRARIES.gutenberg.surface, 'book');
  assert.equal(LIBRARIES.commons.surface, 'media');
  assert.equal(LIBRARIES.github.surface, 'code');
  // each is fully described for the surface — a kind to search, copy, examples, a card fn
  for (const lib of LIBRARY_LIST) {
    assert.ok(lib.kind && SURFACES.includes(lib.surface), lib.id);
    assert.ok(lib.label && lib.icon && lib.placeholder, lib.id);
    assert.ok(Array.isArray(lib.examples) && lib.examples.length >= 1, lib.id);
    assert.equal(typeof lib.card, 'function', lib.id);
  }
});

test('libraries: the article card leads with the lede', () => {
  const card = surfaceCard({ source: 'wikipedia', title: 'Ada Lovelace', text: 'English mathematician…', url: 'https://en.wikipedia.org/wiki/Ada_Lovelace' });
  assert.equal(card.surface, 'article');
  assert.equal(card.title, 'Ada Lovelace');
  assert.equal(card.lede, 'English mathematician…');
  assert.match(card.url, /Ada_Lovelace/);
});

test('libraries: the book card splits title/author/subjects and offers READ', () => {
  const card = surfaceCard({
    source: 'gutenberg', title: 'Frankenstein — Mary Shelley',
    bookTitle: 'Frankenstein', author: 'Mary Shelley', subjects: ['Horror tales', 'Science fiction'],
    summary: 'A creature…', gutenbergId: 84, downloads: 90000, url: 'https://www.gutenberg.org/ebooks/84',
  });
  assert.equal(card.surface, 'book');
  assert.equal(card.title, 'Frankenstein');
  assert.equal(card.author, 'Mary Shelley');
  assert.deepEqual(card.subjects, ['Horror tales', 'Science fiction']);
  assert.equal(card.gutenbergId, 84);
  assert.equal(card.canRead, true);
  // an older item with only the combined title still splits cleanly
  const legacy = surfaceCard({ source: 'gutenberg', title: 'Emma — Jane Austen' });
  assert.equal(legacy.title, 'Emma');
  assert.equal(legacy.author, 'Jane Austen');
});

test('libraries: the media card carries the thumbnail, type, and attribution', () => {
  const card = surfaceCard({
    source: 'commonsmedia', title: 'Sunflower.jpg', text: 'A sunflower',
    thumbUrl: 'https://u/320px.jpg', fileUrl: 'https://u/full.jpg', mime: 'image/jpeg',
    mediaType: 'image', width: 4000, height: 3000, license: 'CC BY-SA 4.0', artist: 'Jane',
    url: 'https://commons.wikimedia.org/wiki/File:Sunflower.jpg',
  });
  assert.equal(card.surface, 'media');
  assert.equal(card.thumbUrl, 'https://u/320px.jpg');
  assert.equal(card.mediaType, 'image');
  assert.equal(card.license, 'CC BY-SA 4.0');
  assert.equal(card.artist, 'Jane');
  assert.equal(card.width, 4000);
});

test('libraries: the code card carries owner/repo/stars/topics and offers INGEST', () => {
  const card = surfaceCard({
    source: 'github', title: 'octocat/Hello-World', owner: 'octocat', repo: 'Hello-World',
    description: 'My first repo', language: 'JavaScript', stars: 2500, topics: ['demo'],
    license: 'MIT', url: 'https://github.com/octocat/Hello-World',
  });
  assert.equal(card.surface, 'code');
  assert.equal(card.owner, 'octocat');
  assert.equal(card.repo, 'Hello-World');
  assert.equal(card.language, 'JavaScript');
  assert.equal(card.stars, 2500);
  assert.deepEqual(card.topics, ['demo']);
  assert.equal(card.canIngest, true);
});

test('libraries: surfaceCard routes by source or kind, and degrades to an article card', () => {
  assert.equal(surfaceCard({ kind: 'github', owner: 'o', repo: 'r' }).surface, 'code');   // routed by kind
  assert.equal(surfaceCard({ source: 'commons' }).surface, 'media');                       // the text-desc alias too
  assert.equal(surfaceCard({ source: 'news', title: 'Headline', text: 'body' }).surface, 'article');   // no shelf → article
  assert.equal(surfaceCard(null).surface, 'article');                                      // never throws
});

test('libraries: libraryForKind maps kinds (incl. aliases) to shelves', () => {
  assert.equal(libraryForKind('wikipedia').id, 'wikipedia');
  assert.equal(libraryForKind('commonsmedia').id, 'commons');
  assert.equal(libraryForKind('commons').id, 'commons');
  assert.equal(libraryForKind('github').id, 'github');
  assert.equal(libraryForKind('news'), null);
  assert.equal(libraryFor('gutenberg').surface, 'book');
});

test('libraries: describeLibrary / manifest are plain serializable data (no card fn)', () => {
  const d = describeLibrary('github');
  assert.equal(d.id, 'github');
  assert.equal(d.card, undefined);          // the function is dropped for the surface
  assert.doesNotThrow(() => JSON.stringify(d));
  const manifest = librariesManifest();
  assert.equal(manifest.length, 4);
  assert.doesNotThrow(() => JSON.stringify(manifest));
  assert.equal(describeLibrary('nope'), null);
});
