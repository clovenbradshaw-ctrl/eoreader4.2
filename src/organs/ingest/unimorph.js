// EO: SIG·INS(Void → Kind, Binding,Making) — UniMorph as an on-demand morphology lookup
// Outside morphological knowledge, pulled in as needed. UniMorph (https://unimorph.github.io) is
// a comprehensive, language-agnostic inflection dataset: one flat TSV per language, each row
//   lemma <TAB> form <TAB> feature-bundle        (e.g.  eat  ate  V;PST)
// so a verb's SIMPLE PAST is the row whose bundle is exactly `V;PST` (distinct from the past
// PARTICIPLE `V;V.PTCP;PST` — "ate" vs "eaten"). The realizer's productive rules (write/morph.js)
// derive the regular cases; this organ answers the irregular LONG TAIL the packaged seed table
// deliberately omits, without shipping the whole dump.
//
// This is a SOURCING function of the same kind as websource.admitWebSource: the mechanical layer
// reaches the network (through the injected fetchUrl seam, off the talker's path), the parse is
// OFFLINE and pure. UniMorph has no per-word endpoint — the language file is fetched ONCE per
// session, indexed, and cached, so the first lookup pays the fetch and every later one is local.
// A miss, a timeout, or a failed fetch returns null: the caller falls back to its own rules and
// nothing on the generation path ever blocks.

// The raw UniMorph language file. Repos are per-ISO-639-3 code (eng, spa, deu, eus, jpn, …), each
// serving its data as a single top-level file named for the code.
export const UNIMORPH_BASE = 'https://raw.githubusercontent.com/unimorph';
export const unimorphUrl = (lang = 'eng') => `${UNIMORPH_BASE}/${lang}/master/${lang}`;

// parseUnimorph(text, { tag }) → Map(lemma → form) for ONE feature bundle, matched EXACTLY.
// The exact match is deliberate: `V;PST` is the finite simple past; the participle carries the
// wider bundle `V;V.PTCP;PST`, which merely CONTAINS "PST", so a substring test would fold
// "eaten" in with "ate". First form wins when a lemma lists dialectal variants. Pure and
// offline-testable — the whole reason the fetch is a separate, injected seam.
export const parseUnimorph = (text, { tag = 'V;PST' } = {}) => {
  const want = String(tag);
  const out = new Map();
  const src = String(text || '');
  let start = 0;
  while (start <= src.length) {
    let nl = src.indexOf('\n', start);
    if (nl < 0) nl = src.length;
    const line = src.slice(start, nl);
    start = nl + 1;
    const a = line.indexOf('\t');
    if (a < 0) continue;
    const b = line.indexOf('\t', a + 1);
    if (b < 0) continue;
    if (line.slice(b + 1).trim() !== want) continue;       // exact feature bundle only
    const lemma = line.slice(0, a).trim().toLowerCase();
    const form = line.slice(a + 1, b).trim().toLowerCase();
    if (!lemma || !form) continue;
    if (!out.has(lemma)) out.set(lemma, form);
  }
  return out;
};

// A best-effort timeout so a slow or hung fetch degrades to a miss rather than stalling a
// caller. Resolves to a rejection the loader catches; the real abort (when the injected client
// supports { signal }) is threaded by the caller if it wants one.
const withTimeout = (promise, ms) => {
  if (!(ms > 0)) return promise;
  let timer;
  const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('unimorph timeout')), ms); });
  // Clear the timer once the real fetch settles, so a completed load never leaves a pending
  // timeout holding the event loop open (or, in the app, leaking a handle per lookup).
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

// createMorphology({ fetchUrl, lang, timeoutMs }) → an on-demand morphology instrument.
//   pastOf(lemma)  → the simple past for a verb LEMMA, or null (caller POS-gates: pass a word
//                    already known to be a verb, so nouns/pronoun homographs never enter).
//   table(lang?)   → the whole lemma→past map for a language (the loaded index), or an empty map.
//   loaded(lang?)  → true once the language file is indexed (a miss/failure also counts as
//                    settled, so callers don't retry the 18 MB fetch on every miss).
// fetchUrl matches the web client's seam: (url) → { text }. The language file loads lazily on
// first use and is cached for the session; a concurrent second call awaits the same in-flight
// load rather than fetching twice.
export const createMorphology = ({ fetchUrl, lang = 'eng', timeoutMs = 15000, tag = 'V;PST' } = {}) => {
  const cache = new Map();   // lang → Map(lemma→form) | null (settled failure) | Promise (in flight)

  const load = (lg) => {
    const hit = cache.get(lg);
    if (hit !== undefined) return Promise.resolve(hit);    // Map, null, or an in-flight Promise
    if (typeof fetchUrl !== 'function') { cache.set(lg, null); return Promise.resolve(null); }
    const p = (async () => {
      await Promise.resolve();   // yield so the outer cache.set(lg, p) records the in-flight load
      let result = null;         // before a SYNCHRONOUS fetch throw would settle the cache to null
      try {
        const res = await withTimeout(Promise.resolve(fetchUrl(unimorphUrl(lg))), timeoutMs);
        result = parseUnimorph(res?.text || '', { tag });
      } catch { result = null; }
      cache.set(lg, result);                               // replace the in-flight Promise
      return result;
    })();
    cache.set(lg, p);
    return p;
  };

  const pastOf = async (lemma, lg = lang) => {
    const key = String(lemma || '').trim().toLowerCase();
    if (!key) return null;
    const map = await load(lg);
    return map ? (map.get(key) || null) : null;
  };

  const table = async (lg = lang) => (await load(lg)) || new Map();
  const loaded = (lg = lang) => { const v = cache.get(lg); return v instanceof Map || v === null; };

  return { pastOf, table, loaded };
};

// warmMorphology({ morphology | fetchUrl, learn, lang }) → load one language's irregular pasts and
// hand them to a synchronous consumer (write/morph.js `learnIrregular`), so the realizer's
// hot-path toPast() stays synchronous while gaining UniMorph's coverage for the session. Returns
// the number of forms learned (0 on a failed/empty load). This is the bridge between the async
// organ and the sync writer — the one place the network touches the morphology overlay.
export const warmMorphology = async ({ morphology, fetchUrl, learn, lang = 'eng', timeoutMs, tag } = {}) => {
  const m = morphology || createMorphology({ fetchUrl, lang, timeoutMs, tag });
  const map = await m.table(lang);
  if (typeof learn === 'function' && map.size) learn(map);
  return map.size;
};
