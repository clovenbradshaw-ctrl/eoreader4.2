#!/usr/bin/env node
// Prints readingHash(doc) for one fixture, in a FRESH process — the other half
// of Tier 1 #1 ("byte-identical replay... same process and fresh process").
// Usage: node print-hash.mjs <fixtureId> [seed]
import { loadFixture } from './fixtures.js';
import { readWithSeed } from './read.js';
import { readingHash } from './reading-hash.js';

const [, , fixtureId, seed] = process.argv;
const f = loadFixture(fixtureId);
const doc = await readWithSeed(f.bytes, seed ? { seed } : {});
process.stdout.write(readingHash(doc));
