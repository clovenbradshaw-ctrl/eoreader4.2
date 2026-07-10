// EO: INS·SIG·SEG(Void → Entity,Field, Making·Tending·Dissecting) — foraging the un-authored world
// metabolism/forage.js — the judge's material: random documents pulled from a WIDE range of real
// sources, so the un-authored anchor is anchored in the actual world and not a fixture.
//
// The judge (judge.js) is the fitness anchor the Goodhart defense needs — a standard the system
// cannot author. But a judge that grades against the SAME few passages every run is an author
// after all: the population overfits the fixture. So the material itself must come from outside,
// unpredictably, across genres — an encyclopedia article, a news dispatch, a quotation, a page of
// a textbook, a primary source, a public-domain book. Breadth is the point: a body that reads the
// encyclopedia well and the primary source badly is a clerk with a narrow beat, and only a wide,
// shifting diet of real sources exposes it. This is the material the delayed-binding falsifier
// needs too — real documents surfacing over time is exactly how a held thread later grounds.
//
// OUTSIDE THE ENVELOPE. Foraging touches the network, so it is NON-deterministic by nature and
// sits outside the replay-stable core (like the judge's API calls — development scaffolding, not
// genome). It takes an injected `fetch`, so tests pin it and the surface wires the real one; a
// failed source is skipped, never fatal — a forage returns whatever came back. No key, CORS-safe.

// SOURCES — a wide range, each a real, public, key-free endpoint. The Wikimedia REST `random/
// summary` route exists across projects, so one shape spans encyclopedia, news, quotations,
// textbooks, and primary sources; Gutendex adds public-domain literature. Add a source by adding
// a recipe: a URL and a parse from its JSON to { title, text, url, source, genre }.
export const SOURCES = Object.freeze([
  wikimedia('wikipedia',  'Wikipedia',       'encyclopedia'),
  wikimedia('wikinews',   'Wikinews',        'news'),
  wikimedia('wikiquote',  'Wikiquote',       'quotation'),
  wikimedia('wikibooks',  'Wikibooks',       'textbook'),
  wikimedia('wikisource', 'Wikisource',      'primary-source'),
  { id: 'simplewiki', source: 'Simple Wikipedia', genre: 'plain-language',
    url: () => 'https://simple.wikipedia.org/api/rest_v1/page/random/summary',
    parse: (j) => doc(j.title, j.extract, j.content_urls?.desktop?.page, 'Simple Wikipedia', 'plain-language') },
  { id: 'gutenberg', source: 'Project Gutenberg', genre: 'literature',
    url: (pick) => `https://gutendex.com/books?page=${1 + (Math.abs(pick | 0) % 40)}`,
    parse: (j) => {
      const b = (j.results || [])[0];
      if (!b) return null;
      const title = b.title, author = (b.authors || [])[0]?.name;
      // a compact, groundable blurb — bibliographic facts the answerer can actually cite.
      const text = `${title}${author ? `, by ${author}` : ''}. Subjects: ${(b.subjects || []).slice(0, 4).join('; ') || 'n/a'}. Languages: ${(b.languages || []).join(', ')}. Downloads: ${b.download_count}.`;
      return doc(title, text, `https://www.gutenberg.org/ebooks/${b.id}`, 'Project Gutenberg', 'literature');
    } },
]);

// forage — pull `n` documents from a rotating spread of the sources (a wide range, not one well).
// `pick` (a period index, say) rotates which sources are drawn, deterministically, so successive
// forages sample different genres. Every source is independently fetched; failures are dropped.
export const forage = async ({ fetch, sources = SOURCES, n = 3, pick = 0, timeoutMs = 6000 } = {}) => {
  if (typeof fetch !== 'function') throw new TypeError('forage: an injected fetch is required (tests stub it; the surface wires window.fetch)');
  const order = rotate(sources, pick);
  const chosen = order.slice(0, Math.max(1, Math.min(n, order.length)));
  // fetch every source CONCURRENTLY — a slow or dead source cannot hold up the others, so the
  // whole forage takes the slowest single request, not their sum. A failure is skipped, never fatal.
  const results = await Promise.allSettled(chosen.map(async (src, i) => {
    const res = await withTimeout(fetch(src.url(pick + i)), timeoutMs);
    const json = typeof res.json === 'function' ? await res.json() : res;   // Response or already-parsed
    return src.parse(json);
  }));
  const out = results
    .filter((r) => r.status === 'fulfilled' && r.value && r.value.text && r.value.text.trim())
    .map((r) => r.value);
  return Object.freeze(out);
};

// createForager — ties foraging to the judge: pull real material, hand it to the judge to AUTHOR
// a battery on, and expose the documents for grading answers against. The judge sees the full
// document (the hard-oracle over the whole source); only its scalar verdict reaches fitness.
export const createForager = ({ fetch, judge = null, sources = SOURCES } = {}) => {
  const library = [];      // recently foraged documents — the shifting diet, kept for grading/binding
  return Object.freeze({
    // draw fresh material and (if a judge is armed) author an evaluation battery on it.
    async gather({ n = 3, pick = 0, tests = 3 } = {}) {
      const docs = await forage({ fetch, sources, n, pick });
      for (const d of docs) { library.push(d); if (library.length > 64) library.shift(); }
      let battery = null;
      if (judge && typeof judge.authorTests === 'function' && docs.length) {
        battery = await judge.authorTests({ passages: docs.map((d) => `${d.title}: ${d.text}`), n: tests });
      }
      return Object.freeze({ docs, battery: battery || null, sources: docs.map((d) => d.source) });
    },
    // grade a local answer against a foraged document (the un-authored anchor).
    async grade({ question, answer, doc: d } = {}) {
      if (!judge || typeof judge.grade !== 'function') return null;
      return judge.grade({ question, answer, document: d ? `${d.title}\n\n${d.text}` : null });
    },
    library: () => library.slice(),
    genres: () => [...new Set(library.map((d) => d.genre))],
  });
};

// ── recipes ───────────────────────────────────────────────────────────────────
function wikimedia(project, source, genre) {
  return {
    id: project, source, genre,
    url: () => `https://en.${project}.org/api/rest_v1/page/random/summary`,
    parse: (j) => doc(j.title, j.extract || j.description, j.content_urls?.desktop?.page, source, genre),
  };
}
const doc = (title, text, url, source, genre) => (title && text)
  ? Object.freeze({ title: String(title), text: String(text), url: url || null, source, genre })
  : null;

// rotate — a deterministic spread starting at `pick` (no RNG; replay-stable ordering, real
// randomness comes from the endpoints' own random routes), so successive forages sample across.
const rotate = (xs, pick) => {
  const n = xs.length; if (!n) return [];
  const start = ((Math.abs(pick | 0) % n) + n) % n;
  return Array.from({ length: n }, (_, i) => xs[(start + i) % n]);
};
const withTimeout = (p, ms) => {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('forage-timeout')), ms); });
  return Promise.race([Promise.resolve(p), timer]).finally(() => clearTimeout(t));
};
