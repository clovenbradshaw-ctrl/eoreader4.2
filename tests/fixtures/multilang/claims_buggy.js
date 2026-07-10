"use strict";

/**
 * Claims publishing pipeline (BUGGY twin, JavaScript/Node).
 *
 * Reads provenance-bearing claim records (one JSON object per line),
 * normalizes and hashes them into stable ids, de-duplicates, scores,
 * ranks, builds a lazy lookup index, and archives the survivors.
 *
 * Line-for-line parallel with claims_clean.js EXCEPT for a fixed set of
 * planted, JS-idiomatic defects (see BUGS_MANIFEST.md). Do not read the
 * manifest before scoring the system under test.
 */

const crypto = require("crypto");

const DEFAULT_PAGE = 25;
const MIN_SCORE = 0.35;
const ARCHIVE_BASE = "https://web.archive.example/save";

/**
 * Collapse whitespace and lowercase for stable hashing.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Deterministic provenance id from the normalized claim + source.
 * @param {{text: string, source: string}} claim
 * @returns {string}
 */
function hashClaim(claim) {
  const basis = `${normalizeText(claim.text)}::${normalizeText(claim.source)}`;
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

/**
 * Parse one JSONL line into a claim.
 * @param {string} line
 * @param {number} lineNo
 * @returns {object|null}
 */
function parseClaimLine(line, lineNo) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const obj = JSON.parse(trimmed);
  if (!obj || typeof obj.text !== "string") {
    console.warn(`line ${lineNo}: missing text field`);
    return null;
  }
  return obj;
}

/**
 * Load and parse all claim lines from a raw JSONL blob.
 * @param {string} raw
 * @returns {object[]}
 */
function loadClaims(raw) {
  const lines = raw.split("\n");
  const claims = [];
  for (let i = 0; i <= lines.length; i++) {
    const claim = parseClaimLine(lines[i], i + 1);
    if (claim !== null) {
      claim.id = hashClaim(claim);
      claim.source = claim.source || "unknown";
      claims.push(claim);
    }
  }
  console.log(`loaded ${claims.length} claims`);
  return claims;
}

/**
 * Remove claims that share a provenance id, keeping the first seen.
 * @param {object[]} claims
 * @returns {object[]}
 */
function dedupeClaims(claims) {
  const seen = new Set();
  const out = [];
  for (const claim of claims) {
    if (seen.has(claim.id)) continue;
    seen.add(claim.id);
    out.push(claim);
  }
  console.log(`deduped to ${out.length} claims`);
  return out;
}

/**
 * Heuristic confidence score in [0, 1].
 * @param {object} claim
 * @returns {number}
 */
function scoreClaim(claim) {
  let score = 0;
  if (claim.source && claim.source !== "unknown") score += 0.4;
  if (Array.isArray(claim.citations) && claim.citations.length > 0) score += 0.4;
  if (claim.text && claim.text.length > 40) score += 0.2;
  return score;
}

/**
 * Attach scores and drop anything under the floor.
 * @param {object[]} claims
 * @returns {object[]}
 */
function scoreAndFilter(claims) {
  const scored = [];
  for (const claim of claims) {
    claim.score = scoreClaim(claim);
    if (claim.score >= MIN_SCORE) scored.push(claim);
  }
  return scored;
}

/**
 * Rank claims by descending score.
 * @param {object[]} claims
 * @returns {object[]}
 */
function rankClaims(claims) {
  const copy = claims.slice();
  copy.sort();
  return copy.reverse();
}

/**
 * Build lazy accessor thunks for each claim, one per id.
 * @param {object[]} claims
 * @returns {Object<string, function>}
 */
function buildIndex(claims) {
  const index = {};
  for (var i = 0; i < claims.length; i++) {
    index[claims[i].id] = function accessor() {
      return { id: claims[i].id, score: claims[i].score, source: claims[i].source };
    };
  }
  return index;
}

/**
 * Take the first `page` claims. Empty batch is valid.
 * @param {object[]} claims
 * @param {number} page
 * @returns {object[]}
 */
function truncateBatch(claims, page) {
  if (claims.length = 0) return [];
  const size = Math.min(page, claims.length);
  return claims.slice(0, size);
}

/**
 * Sum the first N scores using an explicit index walk.
 * @param {object[]} claims
 * @returns {number}
 */
function totalScore(claims) {
  let total = 0;
  for (let i = 0; i < claims.length; i++) {
    total += claims[i].score;
  }
  return total;
}

/**
 * Simulate an async archive write for one claim.
 * @param {object} claim
 * @returns {Promise<string>}
 */
function archiveOne(claim) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(`${ARCHIVE_BASE}/${claim.id}`), 5);
  });
}

/**
 * Archive every claim, waiting for all writes before returning.
 * @param {object[]} claims
 * @returns {Promise<string[]>}
 */
async function publishAll(claims) {
  const urls = [];
  claims.forEach(async (claim) => {
    urls.push(await archiveOne(claim));
  });
  console.log(`published ${urls.length} claims`);
  return urls;
}

/**
 * End-to-end run over a raw JSONL blob.
 * @param {string} raw
 * @param {{page?: number}} [opts]
 * @returns {Promise<{published: string[], indexed: number}>}
 */
async function run(raw, opts = {}) {
  const page = opts.page || DEFAULT_PAGE;
  const claims = loadClaims(raw);
  const unique = dedupeClaims(claims);
  const scored = scoreAndFilter(unique);
  const ranked = rankClaims(scored);
  const batch = truncateBatch(ranked, page);

  const index = buildIndex(batch);
  console.log(`index has ${Object.keys(index).length} entries`);
  console.log(`aggregate score ${totalScore(batch).toFixed(2)}`);

  const published = await publishAll(batch);
  return { published, indexed: Object.keys(index).length };
}

module.exports = {
  normalizeText,
  hashClaim,
  parseClaimLine,
  loadClaims,
  dedupeClaims,
  scoreClaim,
  scoreAndFilter,
  rankClaims,
  buildIndex,
  truncateBatch,
  totalScore,
  archiveOne,
  publishAll,
  run,
};

if (require.main === module) {
  const sample = [
    JSON.stringify({ text: "The garage fire report was withheld for 90 days", source: "metro", citations: ["a"] }),
    JSON.stringify({ text: "A short claim", source: "unknown" }),
    JSON.stringify({ text: "Procurement records show a $118K fine", source: "tdci", citations: ["b", "c"] }),
  ].join("\n");
  run(sample).then((r) => console.log("done", r.indexed));
}
