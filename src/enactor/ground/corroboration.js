// EO: EVA·DEF(Network,Link → Lens, Binding,Tracing) — source-diversity measure (are the witnesses meaningfully distinct?)
// Corroboration — is the answer sourced from MULTIPLE, MEANINGFULLY DISTINCT sources?
//
// (docs/multi-source-corroboration.md) reflectAnswer (reflect.js) already reads the answer BACK
// through the document graph and counts, per claim, the independent ROOT origins that witness it —
// folding a document and the note taken off it into ONE origin. That is the diversity story at the
// grain of derivation. This is the half it leaves open: two origins with DIFFERENT docIds are not
// automatically two INDEPENDENT voices. Two Wikipedia mirrors, the same wire story syndicated on
// ten sites, a page and its own reprint — these are the same witness wearing different URLs. A fact
// "corroborated" by ten of them is still single-source.
//
// So this measures the answer's witnesses for MEANINGFUL distinctness — and it does so the way the
// rest of the engine avoids a hand-tuned coefficient soup: two sources are the SAME voice only when
// a FACT says so. The same id, the same content hash (a byte-identical reprint), the same registrable
// host (one publisher and its mirrors), the same byline (one voice across two hosts). This is a
// PROVENANCE test on purpose, NOT a content one: two INDEPENDENT reports of one event necessarily
// share the fact — the fine, the figure, the name — so any content-similarity threshold would fuse
// them, and there is no honest cutoff that separates "the same wire copy reworded" from "two
// reporters who saw the same thing". Content sameness is not source sameness, so it plays no part
// here; where the engine DOES measure (does a page support the claim, which lead to chase next) the
// Born-rule/one-surprise machinery does it (turn/corroborate.js, surfer/salience.js). The one
// residual blind spot — a reworded syndication across two hosts that shares no content hash — is left
// as a known limitation rather than papered over with a tuned similarity bar.
//
// The count that decides corroboration is then just how many distinct voices remain, and the bar is
// TWO — the definition of corroboration (a second, independent witness), not a tuned number. Below
// it the answer rests on a single voice; the proposer (turn/propose.js) reads that as a gap
// addressed to the world and the corroboration walk (turn/corroborate.js) goes to find an
// independent second source, or hops until it can say one does not exist.
//
// Pure and model-free: identity facts are arithmetic over source descriptors, so it runs in a unit
// test exactly as it does in the browser — the one import is the shared witness-diversity currency
// (core/witness.js), which is itself pure. This module supplies that currency's VOICES dimension:
// reflect.js mints a diversity whose voices default to origins (it cannot see mirrors); the census
// here re-mints it with the mirror-collapsed voice count, so the answer's first-class standing
// downgrades honestly when its "two origins" turn out to be one publisher.
import { makeDiversity } from '../../core/witness.js';

// A small allow-set of two-label public suffixes, so bbc.co.uk registers as bbc.co.uk (not the
// bare co.uk that would fuse every UK site into one witness). Deliberately short — the common
// country second-levels — with a plain last-two fallback for everything else.
const MULTI_TLD = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'co.jp', 'or.jp', 'ne.jp',
  'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.mx', 'co.in', 'co.za', 'com.sg', 'com.hk']);

// registrableHost(url) → the registrable domain, lowercased and www-stripped. An approximation of
// the public-suffix eTLD+1 (en.wikipedia.org and simple.wikipedia.org both → wikipedia.org, so
// mirrors of one publisher count as ONE voice), honest about being one: it reads the last two
// labels, extended to three for the handful of common two-label suffixes above. A bare host with
// no scheme parses too. Empty in → ''. A FACT extractor, not a weight.
export const registrableHost = (url) => {
  let host = '';
  try { host = new URL(String(url)).host.toLowerCase(); }
  catch { host = String(url || '').toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]; }
  host = host.replace(/^www\./, '').replace(/:\d+$/, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return MULTI_TLD.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
};

// witnessDescriptor(source) → the { id, host, author, text, hash } the sameness test reads. Accepts
// either an admitted web doc ({ docId, web:{ url, byline, content_hash }, text }) or a plain
// descriptor ({ id/docId, host/url, author, text, hash }). The one shape the module speaks, so a
// caller can hand in whatever it has.
export const witnessDescriptor = (source) => {
  if (!source) return null;
  const web = source.web || null;
  const url = web?.url || web?.final_url || source.url || source.host || '';
  return {
    id: source.docId ?? source.id ?? null,
    host: registrableHost(url),
    author: web?.byline || source.author || source.byline || null,
    text: String(source.text || web?.excerpt || source.excerpt || '').slice(0, 4000),
    hash: web?.content_hash || source.hash || source.content_hash || null,
  };
};

// sameWitness(a, b) → are these the SAME source-of-record — one voice, not two? Decided by IDENTITY
// FACTS alone, never a tuned coefficient or a content-similarity bar:
//   · same id — literally the same document
//   · same content hash — a byte-identical reprint (the proxy stamps a sha256 at fetch time)
//   · same registrable host — one publisher (its mirrors, sections, and reprints)
//   · same author byline — one voice even across two hosts (a syndicated columnist)
// No text comparison: two independent reports of one event share the fact, so content sameness is
// not source sameness (see the header). A reworded syndication across hosts with no shared hash is
// the honest blind spot — kept distinct rather than merged on a guessed threshold.
export const sameWitness = (a, b) => {
  if (!a || !b) return false;
  if (a.id != null && a.id === b.id) return true;
  if (a.hash && b.hash && a.hash === b.hash) return true;
  if (a.host && b.host && a.host === b.host) return true;
  if (a.author && b.author && a.author === b.author) return true;
  return false;
};

// distinctVoices(descriptors, { same }) → how many MEANINGFULLY DISTINCT sources the set holds — the
// integer that answers "sourced from multiple distinct sources?" directly. It clusters the
// same-witness sources (union-find over the sameWitness relation) and counts the clusters. No floor
// and no coefficient: the relation is identity facts and the engine's measured surprise. Conservative
// under a near-verbatim chain — it only ever MERGES — so it under-counts voices rather than
// over-claiming corroboration.
export const distinctVoices = (descriptors, { same = sameWitness } = {}) => {
  const xs = (descriptors || []).filter(Boolean);
  const n = xs.length;
  if (n <= 1) return n;
  const parent = xs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (same(xs[i], xs[j])) parent[find(j)] = find(i);   // same voice → merge
  return new Set(xs.map((_, i) => find(i))).size;
};

// distinctWitnessCount(descriptors) → distinctVoices — the reportable "N meaningfully distinct
// sources" the audit and the proposer read.
export const distinctWitnessCount = (descriptors, opts) => distinctVoices(descriptors, opts);

// distinctEnough(descriptors, { target }) → does the answer rest on at least `target` meaningfully
// distinct voices? The corroboration bar is two — the DEFINITION of corroboration (a second,
// independent witness), not a tuned coefficient.
export const distinctEnough = (descriptors, { target = 2, same } = {}) =>
  distinctVoices(descriptors, { same }) >= target;

// reflectionWitnesses(reflection, enrich) → one descriptor per independent root origin the
// reflection found behind the answer, de-duplicated by docId. `enrich` (docId → { host/url,
// author, text, hash }) supplies the provenance the reflection does not carry — a source's host
// and author — so two DIFFERENT docIds that are the same publisher or the same syndicated text
// collapse. Absent enrichment, the cited sentence and the docId are the only signals, which is
// still enough to see that an answer stands on one document.
export const reflectionWitnesses = (reflection, enrich = {}) => {
  const byId = new Map();
  for (const r of reflection?.eot || []) {
    for (const s of r.sources || []) {
      if (s.docId == null || byId.has(s.docId)) continue;
      const e = enrich[s.docId] || {};
      byId.set(s.docId, witnessDescriptor({
        docId: s.docId, url: e.url || e.host || '', author: e.author || null,
        text: e.text || s.text || '', hash: e.hash || null,
      }));
    }
  }
  return [...byId.values()];
};

// underCorroborated(reflection, enrich) → true when the answer made WITNESSED factual claims but
// they rest on fewer than two meaningfully distinct sources — the "not sourced from multiple,
// meaningfully distinct sources" condition, at answer grain.
//
// It fires only when there is something witnessed TO corroborate: an answer with no witnessed
// relation is a void / interpretation / unwitnessed case the other triggers own (turn/propose.js),
// not a single-source one. When there is, it counts the distinct voices (collapsing mirrors and
// reprints) and returns true below two. Opt-in for the proposer by construction — no reflection →
// false, so the caller stays byte-identical without one.
export const underCorroborated = (reflection, enrich = {}) => {
  const s = reflection?.summary;
  if (!s) return false;
  const witnessed = (s.corroborated || 0) + (s.crossModal || 0) + (s.singleSource || 0);
  if (witnessed <= 0) return false;                 // nothing witnessed to corroborate
  return distinctWitnessCount(reflectionWitnesses(reflection, enrich)) < 2;
};

// corroborationCensus(reflection, enrich) → { witnessed, distinct, under } — the reportable read for
// the audit trail and the proposer's rationale. `witnessed` is how many of the answer's relations
// are witnessed by the world at all; `distinct` is how many meaningfully distinct voices stand
// behind them; `under` is the boolean the trigger reads.
export const corroborationCensus = (reflection, enrich = {}) => {
  const s = reflection?.summary || {};
  const witnessed = (s.corroborated || 0) + (s.crossModal || 0) + (s.singleSource || 0);
  const distinct = distinctVoices(reflectionWitnesses(reflection, enrich));
  // The answer's first-class standing, re-minted with the mirror-collapsed VOICE count — the
  // refinement reflect.js could not make on docId alone. Its tier is the honest rung: two mirrors
  // that reflect read as "corroborated" (two origins) collapse to single-source (one voice) here.
  const diversity = makeDiversity({
    origins: s.origins || 0, voices: distinct,
    senses: s.diversity?.senses || [], reafferent: s.interpretation || 0,
  });
  return { witnessed, distinct, under: witnessed > 0 && distinct < 2, diversity };
};
