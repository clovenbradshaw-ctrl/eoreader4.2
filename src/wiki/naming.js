// EO: DEF·SIG(Lens → Entity,Field, Dissecting,Binding) — self-generating article names
// Everyone arrives with a name for an Entity. Almost nothing arrives with a name for a
// Field, an Atmosphere, or a Lens — those terrains are not named referents, they are
// addresses (a region+relation, a region+community, a holder+target). So the non-entity
// terrains have to NAME THEMSELVES, and this module is where that happens.
//
// The design goal the user set: be efficient about WHEN a model call fires. So naming is
// a two-stage gate:
//
//   1. deriveName(article)  — PURE, sync, free. Composes a designator from the identity
//      facets the article already carries (the same facets identityKey reads). An Entity
//      is its attested referent; a Lens is "<holder>'s reading of <target>"; a Void is
//      "Absence in <region> (<interval>)". No I/O, unit-testable, and it covers the
//      common case: most non-entity articles have enough structured handles to name
//      themselves without a model.
//
//   2. nameArticle(article, { generate }) — async. Runs deriveName; if the derivation is
//      DEGENERATE (missing the facets it needs, so the best it can do is a bare terrain
//      word), and only then, and only if a `generate` function was injected, it asks the
//      model for a pithy designator. The model call is the exception, not the path.
//
// `source` on the result records which stage produced the name — 'referent' | 'derived'
// | 'generated' | 'placeholder' — so a caller can see (and a probe can count) how often
// the expensive path actually fired.

import { foldFacets } from './terrains.js';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const has = (s) => clean(s).length > 0;
const list = (xs) => (Array.isArray(xs) ? xs : xs == null ? [] : [xs]).map(clean).filter(Boolean);

// A human join for a small set: "A, B and C", capped so a 40-member Network does not
// spill its whole roster into a title.
const andList = (xs, cap = 3) => {
  const v = list(xs);
  if (!v.length) return '';
  const head = v.slice(0, cap);
  const tail = v.length > cap ? `${head.join(', ')} and ${v.length - cap} more` : head.length > 1
    ? `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}` : head[0];
  return tail;
};

// Per-terrain derivation from folded facets → { name, complete }. `complete` is false
// when the facets were too thin to name the thing (only then does the model get asked).
const DERIVE = {
  // Entity — the one terrain that names itself for free: its attested referent.
  Entity: (f) => {
    const n = clean(f.referent) || clean(f.label);
    return { name: n, complete: has(n) };
  },
  // Void — a region over an interval. "Absence in Beirut (1975–1990)".
  Void: (f) => {
    const r = clean(f.region), i = clean(f.interval);
    if (!r) return { name: '', complete: false };
    return { name: i ? `Absence in ${r} (${i})` : `Absence in ${r}`, complete: true };
  },
  // Kind — a criterion. "Things that <criterion>", or the criterion phrase itself.
  Kind: (f) => {
    const c = clean(f.criterion);
    if (!c) return { name: '', complete: false };
    return { name: /^(the|a|an)\b/i.test(c) || c.split(/\s+/).length > 4 ? c : `Things that ${c}`, complete: true };
  },
  // Field — a region and the relation it is of. "The unwritten rules of the trading floor".
  Field: (f) => {
    const r = clean(f.region), rel = clean(f.relationType);
    if (!r && !rel) return { name: '', complete: false };
    if (r && rel) return { name: `${rel} in ${r}`, complete: true };
    return { name: r ? `The unwritten rules of ${r}` : `The ${rel} field`, complete: true };
  },
  // Link — two endpoints and a relation. "Alice — Bob (co-signed)".
  Link: (f) => {
    const eps = list(f.endpoints);
    if (eps.length < 2) return { name: eps[0] ? `${eps[0]} — (open)` : '', complete: eps.length >= 1 && !!clean(f.relationType) };
    const rel = clean(f.relationType);
    const join = f.asymmetric ? '→' : '—';
    return { name: `${eps[0]} ${join} ${eps[1]}${rel ? ` (${rel})` : ''}`, complete: true };
  },
  // Network — a member set (or a topology label). "The <a, b and N more> network".
  Network: (f) => {
    const label = clean(f.label) || clean(f.topology);
    const members = andList(f.members);
    if (label) return { name: /network|web|ring|mesh/i.test(label) ? label : `The ${label} network`, complete: true };
    if (members) return { name: `The ${members} network`, complete: true };
    return { name: '', complete: false };
  },
  // Atmosphere — a region as read by a community. "How the newsroom reads to interns".
  Atmosphere: (f) => {
    const r = clean(f.region), c = clean(f.community);
    if (!r) return { name: '', complete: false };
    return { name: c ? `How ${r} reads to ${c}` : `The atmosphere of ${r}`, complete: true };
  },
  // Lens — a holder's reading of a target. "Nabokov's reading of Kafka".
  Lens: (f) => {
    const h = clean(f.holder), t = clean(f.target);
    if (!h && !t) return { name: '', complete: false };
    if (h && t) return { name: `${h}'s reading of ${t}`, complete: true };
    return { name: h ? `${h}'s reading` : `A reading of ${t}`, complete: false };
  },
  // Paradigm — a commitment set. "The <commitment> paradigm".
  Paradigm: (f) => {
    const label = clean(f.label);
    const commits = andList(f.commitments, 2);
    if (label) return { name: /paradigm|frame|school/i.test(label) ? label : `The ${label} paradigm`, complete: true };
    if (commits) return { name: `The ${commits} paradigm`, complete: true };
    return { name: '', complete: false };
  },
};

// deriveName(article) → { name, source, complete }. Pure, sync, free. `source` is
// 'referent' for an Entity that had one, 'derived' for a composed non-entity name, and
// 'placeholder' when even the composition came up empty (a bare terrain word).
export const deriveName = (article) => {
  const terrain = article?.terrain;
  const f = foldFacets(article);
  const d = DERIVE[terrain];
  if (!d) return { name: clean(f.label) || String(terrain || 'Article'), source: 'placeholder', complete: false };
  const { name, complete } = d(f);
  if (has(name)) return { name, source: terrain === 'Entity' ? 'referent' : 'derived', complete };
  // nothing to compose from — a placeholder that says what KIND of thing this is
  return { name: `Untitled ${terrain}`, source: 'placeholder', complete: false };
};

// A compact prompt for the model, used ONLY when derivation is incomplete. Kept here so
// the one place a name can cost a model call is visible and auditable. The generator is
// injected (like wiki-referent's client) — this module never reaches a model itself.
export const namingPrompt = (article) => {
  const terrain = article?.terrain;
  const f = foldFacets(article);
  const facetLines = Object.entries(f)
    .filter(([, v]) => has(Array.isArray(v) ? v.join(' ') : v))
    .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? list(v).join(', ') : clean(v)}`)
    .join('\n');
  return `Name a ${terrain} article in 3–7 words. A ${terrain} is not a named thing; ` +
    `it is an address, so the name should describe the pattern, not invent a proper noun.\n` +
    `Known facets:\n${facetLines || '  (none)'}\nReturn only the name.`;
};

// nameArticle(article, { generate }) → Promise<{ name, source }>. Cheap path first; the
// model is asked exactly when the cheap path is incomplete AND a generator is available.
// `generate(prompt)` returns a Promise<string>; any fault degrades back to the derived
// placeholder (a name is never blocked on the model succeeding).
export const nameArticle = async (article, { generate = null } = {}) => {
  const derived = deriveName(article);
  if (derived.complete || !generate) return { name: derived.name, source: derived.source };
  try {
    const out = clean(await generate(namingPrompt(article)));
    if (has(out)) return { name: out, source: 'generated' };
  } catch { /* fall through to the derived placeholder */ }
  return { name: derived.name, source: derived.source };
};

// Would naming this article cost a model call? A read-only predicate so a caller can
// batch the ones that need generation and leave the rest free — the efficiency the user
// asked for is a QUERY, not a guess.
export const needsGeneration = (article) => !deriveName(article).complete;
