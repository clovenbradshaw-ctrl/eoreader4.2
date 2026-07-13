// EO: EVA·SYN·INS·NUL(Field,Network,Void → Field,Entity,Atmosphere, Tracing,Composing,Making,Clearing) — barrel
// murmur/learn — SELF-GUIDED LEARNING (docs/murmur.md "self-guided learning"). The peripheral
// sense does not only watch a turn go by; at REST it WANDERS — it looks at the place in the
// current reading that is most interesting (the engine's ONE surprise, core/surprise.js, pointed
// INWARD at what murmur has already learned), mutters what caught it, and keeps a NOTE. When it is
// allowed to reach the web, an outward-pointing note seeds a curiosity walk (turn/research.js) —
// but that decision lives here, one lead at a time, so the walk is guided by what is interesting
// and never a shotgun.
//
// The firewall is unchanged (spec §9, the §8 provenance type law): every note is REAFFERENT by
// construction (`fromEnactor`), so `canWitness(note.prov) === false`. A learning note is the
// murmur's OWN notebook — visible, toggleable as a graph layer — never a citable fact and never
// injected into an answer prompt. murmur POINTS ("this is interesting, I went and read about it");
// the enactor is still the only thing that may WITNESS.
//
// Pure but for the injected `now`: the term basis, the curiosity measure (the shared surprise
// core), the wander pick, the mutter phrasing, and the outward-lead decision are all offline-
// testable with hand-fed candidates — no model, no network. The web fetch itself is the caller's
// (the app injects `search`); this holon only decides WHERE the curiosity points.

import { surpriseAt } from '../../core/surprise.js';
import { fromEnactor, canWitness } from '../../core/provenance.js';

export const LEARN_ENACTMENT = 'murmur-wander';

// The content terms that carry a passage's topic — the surprise BASIS, kept LOCAL so murmur
// imports nothing from the turn pipeline (docs/murmur.md §10). Embedder-free and offline, so the
// curiosity measure runs in a unit test exactly as in the browser. (turn/research.js keeps its own
// copy for the same reason; a small duplicated stoplist is the price of the holon boundary.)
const STOP = new Set(('the a an of to in on for and or but is are was were be been being with as at by from this that these those ' +
  'it its his her their your our my we you they he she them then than so not no yes do does did has have had will would can could ' +
  'should about into over under more most some any all what who whom whose when where why which how there here just only also very ' +
  'much many out up off down one two three new said says say like get got make made well still even now per via amid though although ' +
  'however while thus hence therefore rather quite somewhat use uses used using upon within without toward towards among across ' +
  'whether either neither may might must shall around along already always never sometimes mostly largely mainly each other another ' +
  'both such including include includes included').split(/\s+/));

export const learnTerms = (s) =>
  (String(s || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []).filter((t) => !STOP.has(t));

// profileOf(text) → Map<term, mass> — a passage reduced to its term-frequency profile, the unit a
// wander step measures and deposits. Repetition is signal, so mass is the raw count (a passage
// ABOUT one thing names it many times).
export const profileOf = (text) => {
  const m = new Map();
  for (const t of learnTerms(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

// curiosityOf(prior, arrival) → { bits, by } — the engine's ONE surprise, pointed INWARD. `bits`
// is D_KL(this passage ‖ what I've learned): how much it would move belief = how interesting it is.
// `by` names the terms belief moved toward — the leads worth turning over (or reaching out about).
// A thin rename over surpriseAt so the call site speaks "curiosity" while the arithmetic stays the
// one shared core — a drift there is a drift here, by construction (docs/curiosity-research.md).
export const curiosityOf = (prior, arrival, { gamma = 0.8 } = {}) => {
  const { bayesBits, bayesBy } = surpriseAt(prior, arrival, { gamma });
  return { bits: bayesBits, by: bayesBy };
};

// foldInto(prior, arrival, gamma) → the NEW learned profile after a wander step: every incumbent
// decays by γ, every term the passage delivered deposits its mass. Exactly the posterior mass
// surpriseAt forms internally (γ·prior + arrival). Returns a fresh Map; `prior` is untouched.
export const foldInto = (prior, arrival, gamma = 0.8) => {
  const next = new Map();
  for (const [k, m] of prior) next.set(k, gamma * m);
  for (const [k, m] of arrival) next.set(k, (next.get(k) || 0) + m);
  return next;
};

// plausibleTopic(term) → is this a real word worth being curious ABOUT, or an extraction artifact?
// Mirrors research.js plausibleLead: surprise ranks the most NOVEL token first, and the most novel
// "word" on a page is often garbage (an OCR crumb, a markup smear). A learning note that reaches the
// web must not chase junk, so the artifact SHAPES are rejected before a lead is followed.
const VOWEL = /[aeiouy]/;
export const plausibleTopic = (term) => {
  const t = String(term || '').toLowerCase();
  if (t.length < 3) return false;
  if (!VOWEL.test(t)) return false;                // vowelless run: rn, thc
  if (/[a-z]\d[a-z]/.test(t)) return false;        // letter-digit-letter splice: c0mpany
  if (/[a-z]\d/.test(t) && /\d[a-z]/.test(t)) return false;  // digit wedged inside letters: l1ne
  if (/(.)\1\1/.test(t)) return false;             // a triple-repeated char: vvv
  if (/[^aeiouy\d'’-]{6,}/.test(t)) return false;  // 6+ consonants in a row: an OCR smudge
  return true;
};

// leadTerms(by, seen, max) → the heaviest surprising terms of a passage, artifacts and already-seen
// terms dropped. The few things belief actually moved toward — the notebook's tags, and the
// candidate outward leads.
export const leadTerms = (by, seen = new Set(), max = 3) =>
  Object.entries(by || {})
    .filter(([term, w]) => w > 0 && !seen.has(term) && plausibleTopic(term))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term]) => term);

// A short, readable clause from a passage — the murmur's own words for what caught it, kept prose-y
// (it renders in the strip's serif italic, so it must read like a mutter, not a token dump).
const snippet = (text, words = 9) => {
  const ws = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, words);
  return ws.join(' ').replace(/[.,;:—–-]+$/, '').trim();
};

// The mutter templates — a mutter, not an analysis (spec §6). Rotated deterministically by the
// notebook's length so a run of wanders reads varied without any randomness (replayable in tests).
const READING_MUTTERS = [
  (focus) => `turning over ${focus}`,
  (focus) => `something here about ${focus} keeps catching me`,
  (focus) => `sitting a moment with ${focus}`,
  (focus) => `${focus} — that's the part that won't quite let go`,
];
const OUTWARD_MUTTERS = [
  (t) => `wondering what ${t} is — I might go read about it`,
  (t) => `curious about ${t}; I'd like to read around it`,
];
const WEB_MUTTERS = [
  (t, gist) => `read a little about ${t}${gist ? ` — ${gist}` : ''}`,
  (t, gist) => `went looking into ${t}${gist ? `: ${gist}` : ''}`,
];

// mutterFor(pick, meta) → the prose phrase the strip shows. reading → a clause from the passage;
// outward → the term it wants to chase; web → what it just read.
const mutterFor = (pick, { register = 'curiosity', origin = 'reading', web = null, rotate = 0 } = {}) => {
  const term = (pick && pick.terms && pick.terms[0]) || null;
  if (origin === 'web') {
    const f = WEB_MUTTERS[rotate % WEB_MUTTERS.length];
    return f(term || 'it', web && web.gist ? snippet(web.gist, 8) : '');
  }
  if (register === 'outward' && term) {
    return OUTWARD_MUTTERS[rotate % OUTWARD_MUTTERS.length](term);
  }
  const focus = snippet(pick && pick.text, 9) || term || 'this';
  return READING_MUTTERS[rotate % READING_MUTTERS.length](focus);
};

// createLearning({ config, now, gamma }) — the self-guided-learning notebook.
//   config.curiosityFloor  bits below which a place taught nothing new → not learned. Default 0.08.
//   config.maxNotes        the notebook cap (the graph layer stays bounded). Default 200.
//   now, gamma             injected for deterministic replay/tests.
export const createLearning = ({ config = {}, now = () => 0, gamma = 0.8 } = {}) => {
  const cfg = {
    curiosityFloor: config.curiosityFloor ?? 0.08,
    maxNotes: config.maxNotes ?? 200,
  };
  let prior = new Map();          // the γ-decayed profile of everything learned so far
  const seenTerms = new Set();    // terms already turned over — anti-rumination (spec §8)
  const notes = [];               // the self-guided-learning notebook (bounded, the graph layer)
  let learnedCount = 0;

  // wander(candidates, opts) → the single most interesting place among the candidates, or null when
  // nothing is new enough to be worth a note. ONE step, PURE (no state moves) — the caller advances
  // it one beat at a time, so learning runs at human pace, not in a burst.
  //   candidates: [{ text, source } | string] — the places at rest (deep-reading reflections, the
  //               record's most-surprising passages); source is opaque locus metadata.
  const wander = (candidates = [], { floor = cfg.curiosityFloor } = {}) => {
    let best = null;
    for (const c of candidates || []) {
      const text = typeof c === 'string' ? c : (c && c.text) || '';
      const arrival = profileOf(text);
      if (!arrival.size) continue;
      const freshTerms = [...arrival.keys()].filter((t) => !seenTerms.has(t));
      if (!freshTerms.length) continue;                 // nothing here I haven't turned over already
      const { bits, by } = curiosityOf(prior, arrival, { gamma });
      if (bits < floor) continue;                       // too familiar to be worth a note
      if (!best || bits > best.curiosity) {
        best = { text, source: (c && c.source) || null, arrival, curiosity: round(bits), by, terms: leadTerms(by, seenTerms) };
      }
    }
    return best;
  };

  // learn(pick, opts) → fold the pick into the learned profile and MINT a note. The note is
  // reafferent by construction — canWitness(prov) === false — so it is the murmur's own notebook,
  // never a citable fact (the §9 firewall, restated as the §8 type law and SURFACED on the note).
  //   origin 'reading' (looked & thought over the record) | 'web' (read a page it went to find)
  //   register 'curiosity' (a plain notice) | 'outward' (a thing it wants to chase) | 'discovery'
  //   web { url, title, gist } when learned from a fetched page — the provenance, inspectable.
  const learn = (pick, { source = null, register = 'curiosity', origin = 'reading', web = null } = {}) => {
    if (!pick) return null;
    const arrival = pick.arrival instanceof Map ? pick.arrival : profileOf(pick.text || '');
    prior = foldInto(prior, arrival, gamma);
    for (const t of arrival.keys()) seenTerms.add(t);
    const rotate = learnedCount;
    learnedCount += 1;
    const prov = fromEnactor(LEARN_ENACTMENT);
    const note = Object.freeze({
      id: `L${learnedCount}`,
      at: now(),
      register,                                    // curiosity | outward | discovery
      origin,                                      // reading | web
      layer: 'learning',                           // the toggleable graph layer this note belongs to
      phrase: mutterFor(pick, { register, origin, web, rotate }),
      terms: (pick.terms && pick.terms.length) ? pick.terms : leadTerms(pick.by || {}, new Set()),
      curiosity: pick.curiosity ?? null,
      source: source || pick.source || null,       // where in the record it was reading
      web: web || null,                            // { url, title } when learned from the web
      prov,
      grounded: false,
      canWitness: canWitness(prov),                // false — the firewall, surfaced (never a fact)
    });
    notes.push(note);
    if (notes.length > cfg.maxNotes) notes.splice(0, notes.length - cfg.maxNotes);
    return note;
  };

  // outwardLead(pick|note, { known, anchor }) → the heaviest surprising term this note names that
  // the record does NOT already explain (not in `known` labels), shaped into a coherent query with
  // the anchor (never a bare namesake term — the same discipline research.nextQuery keeps). Returns
  // null when the note points at nothing new, or the murmur has no license to reach out. This is the
  // ONE decision that turns "interesting" into "go look" — one lead, guided by curiosity.
  const outwardLead = (item, { known = new Set(), anchor = '' } = {}) => {
    const terms = (item && item.terms) || [];
    for (const term of terms) {
      if (!plausibleTopic(term)) continue;
      if (known.has(term)) continue;               // the record already explains it — nothing to chase
      const a = String(anchor || '').trim();
      const query = a && !a.toLowerCase().includes(term.toLowerCase()) ? `${a} ${term}` : (a || term);
      return { term, query };
    }
    return null;
  };

  return {
    wander,
    learn,
    outwardLead,
    mutterFor,                                     // exposed for the app's live-strip mutter
    // the notebook — the self-guided-learning graph layer (a READ view; never a log write)
    notes: () => notes.slice(),
    layer: () => notes.slice(),
    count: () => notes.length,
    // introspection for tests / audit
    profile: () => new Map(prior),
    seen: () => new Set(seenTerms),
    reset() { prior = new Map(); seenTerms.clear(); notes.length = 0; learnedCount = 0; },
  };
};

const round = (x) => Math.round(x * 100) / 100;
