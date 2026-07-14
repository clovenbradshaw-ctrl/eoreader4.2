// EO: CON·EVA(Network → Link, Binding,Tracing) — the entity panel's wiki referent
// The entity panel's Wikipedia search — find, score, and CONFIRM the settled referent.
// Ported whole from 4.1's shell (app.dc.js `wikiBest` and its helpers); the honesty rule
// is unchanged: show an encyclopedia meaning only when the article demonstrably corefers
// to what the record already knows about this entity — never on a bare name match.
//
// The mechanism:
//   · search Wikipedia for the label — and once more with the entity's attested context
//     terms, so "Outside" + "published obituary" surfaces the magazine, not the jazz
//     technique. One api.php generator=search call each (extract + description arrive
//     in-line), CORS-direct through the app's web client (direct-cors.js);
//   · score each candidate by lexical AFFINITY of its title to the label plus
//     CORROBORATION from the record: shared predicate/topic terms (strong hits) and —
//     the real coref test — shared SPECIFIC proper names beyond the entity's own
//     (Nashville, Tennessee, DMC…), never generic org/geo/calendar filler;
//   · CONFIRM the winner only when the affinity holds AND the record corroborates it —
//     or the name alone is a specific multi-token proper name ("JD Vance" rarely
//     collides), or the label is a generic concept ("reef") whose general article IS
//     the meaning. An article that names ≥3 of its OWN specific referents while sharing
//     none with the record is a different thing wearing the same letters ("trigger
//     laws" vs "Trigger Law", the 1944 Western) — refused, even on an exact title.
//
// Pure scoring (pickReferent and every helper) is offline and unit-testable; only
// wikiReferent touches the network, through the injected client.

import { wikiPageUrlOn } from '../../organs/ingest/index.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

// The context stopwords — function words that identify nothing (4.1's STOP).
const STOP = new Set(('the a an of to in on at for and or but with by from as is are was were be been being this that ' +
  'these those it its their his her our your they we you i he she him them us me year years some most many few what who ' +
  'whom which when where how why than then so if not no nor only also just very more less new over under into out up ' +
  'down off above below').split(' '));

// Org-type / geographic / calendar filler that is NOT an identifying referent. These
// collide across unrelated topics (a solar "corporation" vs a security "corporation"),
// so they must never count as coref corroboration — only true proper names do.
const GENERIC_NAMES = new Set(('state city cities county counties court courts board council councils department ' +
  'departments division office agency authority commission committee bureau national federal american inc llc ltd co ' +
  'company companies corporation corp management partnership group holdings services service systems system solutions ' +
  'association foundation institute university college school center centre downtown district new north south east west ' +
  'northern southern eastern western street road avenue region area january february march april may june july august ' +
  'september october november december monday tuesday wednesday thursday friday saturday sunday').split(' '));

// Leading honorific/role tokens an encyclopedia article is never keyed on.
const ROLE_TOKENS = new Set(('president vice senator sen senate representative rep congressman congresswoman governor ' +
  'gov mayor secretary justice judge general gen colonel col captain capt lieutenant lt sergeant sgt admiral major ' +
  'chancellor chairman chairwoman chair chief ceo cfo cto coo founder director minister ambassador pope king queen ' +
  'prince princess emperor empress sir lord lady dame dr doctor prof professor mr mrs ms mx rev reverend father rabbi ' +
  'imam sheikh saint commissioner sheriff attorney detective officer agent coach deputy former acting interim elect ' +
  'speaker premier dictator pres vp').split(' '));

// Only proper-noun-like labels are named entities; a lowercase common phrase
// ("immigrant neighborhoods", "reef") is a discourse concept — its GENERAL article
// is its meaning, so the confirmation bar differs (see pickReferent).
export const looksProperNoun = (label) => {
  const toks = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  const small = new Set('of the and for in on at to a an or de la van von &'.split(' '));
  let content = 0, capped = 0;
  for (const t of toks) {
    const w = t.replace(/[^A-Za-z0-9]/g, '');
    if (!w || small.has(w.toLowerCase())) continue;
    content++;
    if (/^[A-Z0-9]/.test(w)) capped++;
  }
  if (!content) return false;
  return capped === content && /[A-Za-z]/.test(label);
};

// The bare name a label refers to, leading honorific/role stripped: "Vice President
// JD Vance" → "JD Vance", "Dr. Jane Goodall" → "Jane Goodall". The title tells you the
// office; the NAME is what the article is keyed on. Only a leading run of role tokens
// is stripped (never the final token), stopping at the first non-role token.
export const nameCore = (label) => {
  const toks = String(label || '').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < toks.length - 1) {
    const w = toks[i].replace(/[^A-Za-z]/g, '').toLowerCase();
    if (w && ROLE_TOKENS.has(w)) i++; else break;
  }
  return toks.slice(i).join(' ');
};

// Token affinity between an entity label and a candidate article title: light-stemmed
// content-token coverage in both directions + head-noun match — never a bare span check.
export const titleAffinity = (label, title) => {
  const small = new Set('the of and for a an on in to at de la von van el le with by as from'.split(' '));
  const toks = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !small.has(w)).map(stem);
  const L = toks(label), T = toks(title);
  if (!L.length || !T.length) return { covL: 0, covT: 0, headMatch: false, headBack: false, exact: false };
  const Ls = new Set(L), Ts = new Set(T);
  let inter = 0;
  Ls.forEach((w) => { if (Ts.has(w)) inter++; });
  const headL = L[L.length - 1], headT = T[T.length - 1];
  return { covL: inter / Ls.size, covT: inter / Ts.size, headMatch: Ts.has(headL), headBack: Ls.has(headT),
    exact: Ls.size === Ts.size && inter === Ls.size };
};

// First 1–3 sentences of an extract, ABBREVIATION-SAFE. A naive split on ". " shatters
// "Roe v. Wade, 410 U.S. 113 (1973)…" into meaningless stubs. Split only before a
// capital/quote, re-merge any piece that ended on an abbreviation, fill to length.
export const clipExtract = (text, maxChars = 300) => {
  const t = norm(text);
  if (!t) return '';
  const raw = t.split(/(?<=[.!?])\s+(?=["“'A-Z])/);
  const ABBR = /(?:^|[\s(])(?:[A-Za-z]|Mr|Mrs|Ms|Dr|Prof|Gen|Sen|Rep|Gov|Lt|Sgt|Sr|Jr|St|vs|v|etc|Inc|Ltd|Co|Corp|No|pp|al|Ave|Rd|Rev|Hon|Capt|U\.S|U\.K|U\.N|D\.C)\.$/i;
  const parts = [];
  for (const p of raw) {
    if (parts.length && ABBR.test(parts[parts.length - 1])) parts[parts.length - 1] += ' ' + p;
    else parts.push(p);
  }
  let out = '', n = 0;
  for (const p of parts) {
    const next = out ? out + ' ' + p : p;
    if (out.length >= 80 && next.length > maxChars) break;
    out = next; n++;
    if (out.length >= maxChars || n >= 3) break;
  }
  return out || parts[0] || t.slice(0, maxChars);
};

// Proper-noun referents named INSIDE an external text (a Wikipedia extract) — the same
// shape as the context's proper set, so the two intersect to coref-resolve.
export const articleNames = (text) => {
  const set = new Set();
  (String(text || '').match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*\b/g) || [])
    .forEach((ph) => ph.toLowerCase().split(/\s+/).forEach((w) => {
      const s = stem(w);
      if (s.length >= 3 && !STOP.has(s) && !GENERIC_NAMES.has(s)) set.add(s);
    }));
  return set;
};

// The context that proves a referent, graded by specificity. STRONG terms are what the
// record predicates about the entity (its standing properties, the sentences that
// mention it) plus the entities it bonds to; WEAK terms are the page titles it merely
// appeared on. PROPER is the coref set: the specific proper names among its neighbours
// (minus its own tokens, minus generic filler) — what an external text must actually
// share to be the SAME referent, not just the same topic.
export const referentContext = ({ label, statements = [], neighbors = [], pageTitles = [] }) => {
  const strong = new Set(), weak = new Set();
  const addTo = (set, t) => String(t || '').toLowerCase().split(/[^a-z0-9]+/)
    .forEach((w) => { if (w.length >= 4 && !STOP.has(w)) set.add(stem(w)); });
  neighbors.slice(0, 16).forEach((l) => addTo(strong, l));
  statements.slice(0, 10).forEach((s) => addTo(strong, s));
  pageTitles.forEach((t) => addTo(weak, t));
  const proper = new Set(), self = new Set();
  String(label || '').toLowerCase().split(/[^a-z0-9]+/).forEach((w) => { if (w) self.add(stem(w)); });
  neighbors.slice(0, 24).forEach((l) => {
    if (!l || !/[A-Z]/.test(l) || /^https?:\/\//i.test(l)) return;
    l.toLowerCase().split(/[^a-z0-9]+/).forEach((w) => {
      const st = stem(w);
      if (w.length >= 3 && !STOP.has(w) && !GENERIC_NAMES.has(st)) proper.add(st);
    });
  });
  self.forEach((w) => proper.delete(w));
  return { strong, weak, proper };
};

// pickReferent(label, ctx, cands) → the ranked best candidate with the confirmation
// verdict, or null when nothing came back. cands: [{ title, description, extract }].
export const pickReferent = (label, ctx, cands) => {
  if (!cands || !cands.length) return null;
  const strong = ctx?.strong || new Set(), weak = ctx?.weak || new Set(), proper = ctx?.proper || new Set();
  const hayOf = (c) => `${c.extract || ''} ${c.description || ''} ${c.title || ''}`.toLowerCase();
  const hits = (set, hay) => { let n = 0; set.forEach((t) => { if (t && hay.indexOf(t) >= 0) n++; }); return n; };
  const namesOf = (c) => articleNames(`${c.extract || ''} ${c.description || ''}`);
  const corefOf = (c) => { const a = namesOf(c); let n = 0; proper.forEach((t) => { if (a.has(t)) n++; }); return n; };
  // Ranking blends specific-referent coref with lexical affinity of title to label —
  // coverage of the label's content tokens AND agreement on the head noun (4.1 weights).
  const score = (c) => {
    const af = titleAffinity(label, c.title);
    return 1.3 * hits(strong, hayOf(c)) + 0.5 * hits(weak, hayOf(c)) + 2.4 * Math.min(3, corefOf(c))
      + 3.0 * af.covL * (af.headMatch ? 1 : 0.25) + (af.exact ? 2 : 0)
      + ((af.headMatch && af.headBack) ? 0.6 : 0)
      + (String(c.title || '').toLowerCase() === String(label || '').toLowerCase() ? 0.5 : 0);
  };
  const ranked = [...cands].sort((a, b) => score(b) - score(a));
  const top = ranked[0];

  const af = titleAffinity(label, top.title);
  const sh = hits(strong, hayOf(top)), ch = corefOf(top), artN = namesOf(top).size;
  const isGen = !looksProperNoun(label);              // a generic concept: the general article IS the meaning
  const canJudge = proper.size >= 3;                  // graph rich enough to coref-check
  // Zero shared names against a rich graph — while the article names its OWN specific
  // referents — is DISCONFIRMATION: a different thing that merely shares the label.
  const disconfirmed = !isGen && canJudge && ch === 0 && artN >= 3;
  const lexOK = af.exact || (af.headMatch && af.covL >= 0.6 && af.covT >= 0.5)
    || (af.headMatch && af.covL >= 0.85 && af.covT >= 0.55);
  // STRONG NAME IDENTITY — a full multi-token proper name whose whole article title
  // sits inside it rarely collides, so it may confirm even on a sparse graph. The
  // disconfirmation guard above still wins whenever the graph CAN judge.
  const core = nameCore(label), afc = titleAffinity(core, top.title);
  const coreToks = core.split(/\s+/).filter((w) => w.replace(/[^A-Za-z0-9]/g, '').length > 1).length;
  const specificName = looksProperNoun(core) && coreToks >= 2 && afc.headMatch && afc.headBack && afc.covT >= 1 && afc.covL >= 0.5;
  // Confirmation needs CORROBORATION from the attested context — a shared specific
  // referent or a shared predicate/topic term — never a bare name match.
  const corroborated = ch >= 1 || sh >= 1;
  // Sanity guard against a perfect-spelling collision, generic or not.
  const articleConflict = artN >= 3 && ch === 0 && sh === 0;
  const confirmed = !disconfirmed && (specificName
    || (!articleConflict && lexOK && (isGen ? (af.exact || af.covL >= 0.85) : corroborated)));

  return {
    title: top.title, description: top.description || '',
    text: clipExtract(top.extract, 300),
    url: wikiPageUrlOn('en.wikipedia.org', top.title),
    // The lead image (a REST thumbnail), carried through only for a CONFIRMED referent — the
    // surface shows it beside the reading's own account of the figure, never as a bare name match.
    thumb: top.thumb || '', thumbW: top.thumbW || 0, thumbH: top.thumbH || 0,
    confirmed, disconfirmed,
    score: Math.round(score(top) * 100) / 100, ctxStrong: sh, coref: ch,
  };
};

// ── the fetch ─────────────────────────────────────────────────────────────────────────
// One generator=search call returns the hits WITH their lead extract, short description,
// disambiguation flag, and lead-image thumbnail in-line — no per-title round trips (4.1
// needed one REST call per candidate). Rides client.fetchUrl, so it is CORS-direct via
// direct-cors.js and falls back to the proxy chain like every other Wikimedia call.
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const THUMB_PX = 360;   // the lead image's requested longest edge (the panel renders it smaller)
const searchUrl = (q, k) => `${WIKI_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}` +
  `&gsrlimit=${k}&prop=extracts|description|pageprops|pageimages&exintro=1&explaintext=1&exlimit=max` +
  `&piprop=thumbnail&pithumbsize=${THUMB_PX}&ppprop=disambiguation&redirects=1&format=json`;

const fetchCands = async (client, q, k) => {
  try {
    const j = JSON.parse((await client.fetchUrl(searchUrl(q, k))).text);
    return Object.values(j?.query?.pages || {})
      .filter((pg) => pg?.extract && pg.pageprops?.disambiguation === undefined)
      .map((pg) => ({
        title: pg.title, description: pg.description || '', extract: pg.extract,
        thumb: pg.thumbnail?.source || '', thumbW: pg.thumbnail?.width || 0, thumbH: pg.thumbnail?.height || 0,
      }));
  } catch { return []; }
};

// wikiReferent(client, { label, statements, neighbors, pageTitles }) → the confirmed-or-
// refused referent (pickReferent's shape), or null when the label isn't lookup-worthy or
// the wiki has nothing. Any network failure degrades to null — the panel says "no
// confirmed match", never an error.
export const wikiReferent = async (client, { label, statements = [], neighbors = [], pageTitles = [] } = {}) => {
  const lab = norm(label);
  if (!lab || !/[A-Za-z]/.test(lab) || /^https?:\/\//i.test(lab)) return null;
  const ctx = referentContext({ label: lab, statements, neighbors, pageTitles });
  const cands = await fetchCands(client, lab, 5);
  // Context-augmented retrieval: the attested context words bias the candidate set
  // toward the right referent when the bare label is ambiguous.
  const ctxTerms = [...ctx.strong].filter((t) => t.length >= 4).slice(0, 4).join(' ');
  if (ctxTerms) {
    for (const c of await fetchCands(client, `${lab} ${ctxTerms}`, 3))
      if (!cands.some((x) => x.title === c.title)) cands.push(c);
  }
  return pickReferent(lab, ctx, cands);
};
