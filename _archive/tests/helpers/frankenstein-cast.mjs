// The Frankenstein cast — a real, full-length novel run through the exact reading path
// the app uses, so the golden it feeds (frankenstein-cast-golden.test.js) tracks the real
// CAST panel, not a proxy for it. Mirrors two real call sites, verbatim in shape:
//
//   registry.js's docFor      — nestComposite(parseText(text, { unnamedReferents: true }),
//                                { minGap: 20, unnamedReferents: true }): the ingest path
//                                every real text source takes.
//   index.html's _mvpCast()   — app.entities({ merge: true, level: 'names' }), filtered to
//                                grain !== 'setting' | 'kind', scored by
//                                (sourceCount*100 + mentions), top 8 for the bar chart /
//                                top 30 for the chip row: the "CAST · figures across the
//                                reading" panel.
//
// The text itself (tests/fixtures/frankenstein.txt) is Mary Shelley's Frankenstein, public
// domain, from Project Gutenberg EBook #84 (gutenberg.org/ebooks/84), Gutenberg's own
// license header/footer stripped so only the novel's text is parsed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseText } from '../../src/perceiver/parse/index.js';
import { nestComposite } from '../../src/perceiver/nest.js';
import { installEntities } from '../../src/rooms/reader/app/entities.js';
import { mergeEntitiesByReferent } from '../../src/rooms/reader/entity-merge.js';

export const FRANKENSTEIN_TEXT = readFileSync(
  fileURLToPath(new URL('../fixtures/frankenstein.txt', import.meta.url)), 'utf8');

const row = (e) => ({ label: e.label, mentions: e.mentions || 0, sourceCount: e.sourceCount || 1, grain: e.grain ?? null });

// frankensteinCast() → the cast list the MVP panel would render off this one book: `count`
// (figures only, post-filter — the "N on record" badge), `bars` (top 8, the bar chart),
// `rows` (top 30, the chip row), and `excluded` (every referent the grain reader confidently
// read as a setting or a kind — Geneva, Switzerland, Heaven… — sorted by mentions, so the
// golden also pins down exactly what the panel is now correctly leaving OUT). ~20s: nesting
// re-parses each of the book's ~28 letters/chapters from its own text (perceiver/nest.js).
export const frankensteinCast = () => {
  const whole = parseText(FRANKENSTEIN_TEXT, { docId: 'frankenstein', unnamedReferents: true });
  const doc = nestComposite(whole, { minGap: 20, unnamedReferents: true });

  const appCtx = {};
  installEntities(appCtx);
  const rows = appCtx.entitiesInDoc(doc, 1);
  const merged = mergeEntitiesByReferent(rows, { entityKey: appCtx.entityKey });

  const figures = merged.filter((e) => e.grain !== 'setting' && e.grain !== 'kind');
  const excluded = merged.filter((e) => e.grain === 'setting' || e.grain === 'kind');

  const scored = figures.slice()
    .map((e) => ({ e, score: (e.sourceCount || 1) * 100 + (e.mentions || 0) }))
    .sort((a, b) => b.score - a.score);

  return {
    count: figures.length,
    bars: scored.slice(0, 8).map(({ e }) => row(e)),
    rows: scored.slice(0, 30).map(({ e }) => row(e)),
    excluded: excluded.slice().sort((a, b) => (b.mentions || 0) - (a.mentions || 0)).map(row),
  };
};
