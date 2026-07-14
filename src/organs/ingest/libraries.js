// EO: DEF·SIG(Field → Lens,Paradigm, Dissecting,Binding) — the library shelf: a customized surface per kind
// The LIBRARY SHELF — one declarative descriptor per search library, each with the CUSTOMIZED
// SURFACE its kind of thing deserves. (docs/library-search.md)
//
// The engine already knows how to SEARCH each shelf (webfetch.js SEARCH_SOURCES) and how to READ
// each hit whole (FULL_TEXT). What it lacked was a surface that fits the thing: an encyclopedia hit
// is an ARTICLE (a title + a lede), a Gutenberg hit is a BOOK (a title, an author, "read the whole
// thing"), a Commons hit is a MEDIA FILE (a thumbnail, a mime type, a license), a GitHub hit is a
// REPO (owner/name, stars, language, "ingest the code"). A generic result row flattens all four
// into "title + snippet + url" and loses exactly what makes each shelf worth searching.
//
// This module is the missing layer: a pure, dependency-free registry the surface reads to render
// each library's own search box (placeholder, examples) and each hit as a CARD shaped for its type.
// `card(item)` normalizes a raw search item (whatever fields its organ attached) into the fields the
// surface paints; `surface` names WHICH layout to paint. Both the engine bridge and index.html
// stand on this one contract, so a new shelf is added HERE and both surfaces inherit it.

// The four surface layouts a card can ask for. The surface renders one component per value:
//   'article' — title · lede · source page          (an encyclopedia read)
//   'book'    — title · author · subjects · READ     (a whole book)
//   'media'   — thumbnail · type · dimensions · license · author   (a picture / clip / doc)
//   'code'    — owner/repo · language · ★stars · topics · INGEST    (a repository)
export const SURFACES = Object.freeze(['article', 'book', 'media', 'code']);

const str = (x) => (x == null ? '' : String(x)).trim();

// ── The card normalizers — a raw search item → the fields its surface paints ─────────────────────
const articleCard = (item) => ({
  surface: 'article',
  title: str(item?.title) || str(item?.url),
  lede: str(item?.text),
  url: str(item?.url) || null,
  source: str(item?.source) || 'wikipedia',
});

const bookCard = (item) => ({
  surface: 'book',
  // Prefer the clean, un-concatenated fields the Gutendex parser now carries; fall back to
  // splitting the combined "Title — Author" title an older item might have.
  title: str(item?.bookTitle) || str(item?.title).split(' — ')[0] || str(item?.title),
  author: str(item?.author) || (str(item?.title).includes(' — ') ? str(item.title).split(' — ').slice(1).join(' — ') : ''),
  subjects: Array.isArray(item?.subjects) ? item.subjects.slice(0, 6) : (str(item?.subjects) ? str(item.subjects).split('; ') : []),
  summary: str(item?.summary) || str(item?.text),
  url: str(item?.url) || null,
  gutenbergId: item?.gutenbergId ?? null,
  downloads: Number.isFinite(item?.downloads) ? item.downloads : null,
  canRead: true,   // a book hit's action is READ THE WHOLE THING (fetchPages pulls the ebook)
});

const mediaCard = (item) => ({
  surface: 'media',
  title: str(item?.title),
  caption: str(item?.text),
  thumbUrl: str(item?.thumbUrl) || str(item?.fileUrl) || null,
  fileUrl: str(item?.fileUrl) || null,
  mime: str(item?.mime) || null,
  mediaType: str(item?.mediaType) || (str(item?.mime).split('/')[0] || 'image'),
  width: item?.width || null,
  height: item?.height || null,
  license: str(item?.license) || null,
  artist: str(item?.artist) || null,
  url: str(item?.url) || null,   // the Commons description page
  source: 'commons',
});

const codeCard = (item) => ({
  surface: 'code',
  title: str(item?.title) || (item?.owner && item?.repo ? `${item.owner}/${item.repo}` : ''),
  owner: str(item?.owner) || null,
  repo: str(item?.repo) || null,
  description: str(item?.description) || str(item?.text),
  language: str(item?.language) || null,
  stars: Number.isFinite(item?.stars) ? item.stars : null,
  topics: Array.isArray(item?.topics) ? item.topics.slice(0, 8) : [],
  license: str(item?.license) || null,
  url: str(item?.url) || null,
  canIngest: true,   // a repo hit's action is INGEST THE CODE (fetchGithubRepo → the code organ)
});

// ── The shelf ─────────────────────────────────────────────────────────────────────────────────
// Each library: the search KIND it routes to, the SURFACE its cards wear, the search-box copy
// tailored to the thing, and the card normalizer. Ordered as the surface should present them.
export const LIBRARIES = Object.freeze({
  wikipedia: Object.freeze({
    id: 'wikipedia', label: 'Wikipedia', icon: '📖', accent: '#3366cc',
    kind: 'wikipedia', surface: 'article',
    blurb: 'The encyclopedia — facts and entities, read as clean article prose.',
    placeholder: 'Search Wikipedia — a person, a place, an idea…',
    examples: ['photosynthesis', 'Ada Lovelace', 'the Meiji Restoration'],
    card: articleCard,
  }),
  gutenberg: Object.freeze({
    id: 'gutenberg', label: 'Project Gutenberg', icon: '📚', accent: '#8a6d3b',
    kind: 'gutenberg', surface: 'book',
    blurb: 'The public-domain library — search the catalog, read WHOLE books.',
    placeholder: 'Search Project Gutenberg — a title, an author…',
    examples: ['Frankenstein', 'Jane Austen', 'Meditations Marcus Aurelius'],
    card: bookCard,
  }),
  commons: Object.freeze({
    id: 'commons', label: 'Wikimedia Commons', icon: '🖼️', accent: '#339966',
    kind: 'commonsmedia', surface: 'media',
    blurb: 'Free media — photographs, diagrams, audio, video — with attribution.',
    placeholder: 'Search Wikimedia Commons — an image, a sound, a clip…',
    examples: ['sunflower', 'Saturn Cassini', 'steam locomotive'],
    card: mediaCard,
  }),
  github: Object.freeze({
    id: 'github', label: 'GitHub', icon: '💻', accent: '#24292f',
    kind: 'github', surface: 'code',
    blurb: 'The code shelf — search repositories, read READMEs, INGEST whole codebases.',
    placeholder: 'Search GitHub — a project, a topic, a language…',
    examples: ['tree-sitter parser', 'language:rust cli', 'react state machine'],
    card: codeCard,
  }),
});

// The featured shelf, in presentation order — the four the surface offers as first-class libraries.
export const LIBRARY_LIST = Object.freeze(Object.values(LIBRARIES));
export const LIBRARY_IDS = Object.freeze(Object.keys(LIBRARIES));

// kind → library, so a hit off the generic web search can still be dressed in its shelf's surface.
// Every library's own `kind`, plus the aliases a router might tag a hit with.
const KIND_TO_LIB = Object.freeze({
  wikipedia: 'wikipedia',
  gutenberg: 'gutenberg',
  commonsmedia: 'commons', commons: 'commons',
  github: 'github',
});

// libraryForKind(kind) → the descriptor whose surface fits a hit of that kind, or null.
export const libraryForKind = (kind) => LIBRARIES[KIND_TO_LIB[str(kind)]] || null;

// libraryFor(id) → a descriptor by its id (the shelf the user picked).
export const libraryFor = (id) => LIBRARIES[str(id)] || null;

// A generic card for a hit that belongs to no featured library (news, feed, arxiv, a raw page):
// the article layout is the sane default (title · lede · link).
const genericCard = (item) => articleCard(item);

// surfaceCard(item) → the CUSTOMIZED CARD for any search hit, routed by its source/kind to the
// right library's normalizer, falling back to the article layout. This is the one call the surface
// makes per hit; the surface then renders `card.surface`'s component. Never throws — a malformed
// item degrades to a bare article card rather than breaking the results list.
export const surfaceCard = (item) => {
  try {
    const lib = libraryForKind(item?.source) || libraryForKind(item?.kind);
    return (lib ? lib.card(item) : genericCard(item)) || genericCard(item);
  } catch { return genericCard(item); }
};

// describeLibrary(id) → the descriptor minus the (non-serializable) card function, for handing the
// shelf to a surface as plain data (chips, placeholders, example queries).
export const describeLibrary = (id) => {
  const lib = libraryFor(id);
  if (!lib) return null;
  const { card, ...rest } = lib;   // eslint-disable-line no-unused-vars
  return { ...rest };
};

// The shelf as plain data — the whole set of describeLibrary(), for `window.EO.libraries`.
export const librariesManifest = () => LIBRARY_LIST.map((l) => describeLibrary(l.id));
