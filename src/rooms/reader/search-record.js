// EO: EVA·SEG(Network,Field → Lens, Tracing,Dissecting) — search over the record itself
// One query over everything the record holds (docs/search-and-pins.md): entities, claims,
// passages, sources — grouped by kind, because a reader wants different KINDS of answer, not one
// blob. This is the read path that retires the conversational posture: search retrieves what the
// machinery already grounded; it computes nothing new and can therefore fabricate nothing.
//
// Operators map onto fields the record already carries — none of them is a new judgment:
//   entity:X       — the entity group matches X; claims/passages narrow to rows that mention it.
//   source:X       — every group narrows to the source whose sn/reg/domain/title matches X.
//   contradicts:   — claims narrow to Contested (the projection's own standing).
//   unique:        — single-witness only: entities in one source, claims of standing 'stated'.
//   type:X         — entities narrow by the DERIVED type (person/place/work/proper/theme). The
//                    type is composed from signals already computed — the label's proper-noun
//                    shape and the typed relations incident on the entity — never stored, never
//                    guessed by a model.
//
// Ranking is the spec's one rule made arithmetic: grounded beats external (this module only ranks
// the record — external extension is the surface's footer, always below), corroborated beats
// single-witness, verbatim beats inferred. Honesty: an empty group is an empty array — the
// surface says so and offers the outward extension; nothing here pads a thin result.
//
// Pure and model-free: (query, providers) in, grouped rows out. Runs in a unit test exactly as it
// does in the browser.

import { typeOf } from '../../core/index.js';
import { looksProperNoun } from './wiki-referent.js';
import { canon } from './anchor.js';

// ── the query ──────────────────────────────────────────────────────────────────────────────────

const OPS = ['entity', 'source', 'type', 'contradicts', 'unique'];

// parseQuery('entity:"Mont Blanc" ice type:place') → { text, terms, ops }. An operator value may
// be quoted for multi-word arguments; a bare `contradicts:` / `unique:` is a flag. Unknown
// prefixes stay ordinary text (a URL's `https:` must not be eaten).
export const parseQuery = (raw) => {
  const ops = { entity: null, source: null, type: null, contradicts: false, unique: false };
  let rest = String(raw || '');
  rest = rest.replace(/(^|\s)(\w+):("([^"]*)"|(\S*))/g, (m, pre, name, _v, quoted, bare) => {
    const key = name.toLowerCase();
    if (!OPS.includes(key)) return m;
    const val = (quoted ?? bare ?? '').trim();
    if (key === 'contradicts') ops.contradicts = true;
    else if (key === 'unique') ops.unique = true;
    else if (val) ops[key] = val;
    else if (key === 'entity' || key === 'source' || key === 'type') ops[key] = ops[key] || '';
    return pre;
  });
  const text = rest.replace(/\s+/g, ' ').trim();
  const terms = canon(text).split(' ').filter(Boolean);
  return { text, terms, ops };
};

export const hasQuery = (parsed) =>
  !!(parsed && (parsed.terms.length || parsed.ops.entity || parsed.ops.source || parsed.ops.type ||
     parsed.ops.contradicts || parsed.ops.unique));

// ── the derived entity type ────────────────────────────────────────────────────────────────────

// entityTypeOf({ label, viasAsSrc, viasAsTgt }) → 'person' | 'place' | 'work' | 'proper' | 'theme'.
// Composed from what is already computed: the typed relations incident on the entity (kinship and
// social bonds make a person; being the object of `located` makes a place; being authored makes a
// work) and, failing a typed vote, the label's proper-noun shape. 'theme' is the honest floor —
// the abstract vocabulary the tiering keeps out of the default view.
export const entityTypeOf = ({ label = '', viasAsSrc = [], viasAsTgt = [] } = {}) => {
  const votes = { person: 0, place: 0, work: 0 };
  const vote = (via, side) => {
    const t = typeOf(via)?.type || null;
    if (!t) return;
    if (['sibling', 'parent', 'child', 'spouse', 'ancestor', 'social'].includes(t)) votes.person++;
    else if (t === 'leads' && side === 'src') votes.person++;
    else if (t === 'authored') { if (side === 'src') votes.person++; else votes.work++; }
    else if (t === 'located' && side === 'tgt') votes.place++;
  };
  for (const v of viasAsSrc) vote(v, 'src');
  for (const v of viasAsTgt) vote(v, 'tgt');
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0];
  return looksProperNoun(label) ? 'proper' : 'theme';
};

const typeMatches = (want, got) => {
  const w = String(want || '').toLowerCase();
  if (!w) return true;
  if (w === got) return true;
  // person/place/work are all proper referents — `type:proper` gathers them with the untyped ones.
  if (w === 'proper') return got !== 'theme';
  return false;
};

// ── matching ───────────────────────────────────────────────────────────────────────────────────

const allTermsIn = (terms, hay) => { const h = canon(hay); return terms.every((t) => h.includes(t)); };
const srcMatches = (needle, s) => {
  const n = canon(needle);
  if (!n) return true;
  return [s.sn, s.reg, s.domain, s.title].some((f) => f && canon(f).includes(n));
};

// ── the search ─────────────────────────────────────────────────────────────────────────────────

const CAPS = { entities: 8, claims: 10, passages: 12, sources: 6, perSourcePassages: 4 };

// searchRecord(rawOrParsed, { sources, entities, claims, docFor, relationsOf }) → grouped rows.
//   sources     — the topic's S-registry rows (sn, reg, docId, title, domain, kind, text)
//   entities    — merged explorer rows ({ key, entId, docId, sn, label, mentions, sourceCount })
//   claims      — the findings projection rows (claims.js recordClaims)
//   docFor      — src → parsed doc (sentences), for the passage group
//   relationsOf — optional (row → { viasAsSrc, viasAsTgt }) for the type: operator; absent, the
//                 label shape alone types (proper vs theme).
export const searchRecord = (rawOrParsed, {
  sources = [], entities = [], claims = [], docFor = () => null, relationsOf = null,
} = {}) => {
  const parsed = typeof rawOrParsed === 'string' ? parseQuery(rawOrParsed) : (rawOrParsed || parseQuery(''));
  const { terms, ops } = parsed;
  const empty = { parsed, entities: [], claims: [], passages: [], sources: [] };
  if (!hasQuery(parsed)) return empty;

  const srcPool = (sources || []).filter((s) => srcMatches(ops.source, s));
  const srcBySn = new Map(srcPool.map((s) => [s.sn, s]));
  const srcByDocId = new Map(srcPool.map((s) => [s.docId, s]));

  // entities — label match (entity: operator, else the free terms), then the type facet.
  const entNeedle = ops.entity != null ? canon(ops.entity) : null;
  let entRows = (entities || [])
    .filter((r) => r && r.label)
    .filter((r) => !ops.source || r.sn == null || srcBySn.has(r.sn))
    .filter((r) => {
      const l = canon(r.label);
      if (entNeedle) return entNeedle ? l.includes(entNeedle) : true;
      return terms.length ? terms.every((t) => l.includes(t)) : false;
    });
  if (ops.unique) entRows = entRows.filter((r) => (r.sourceCount || 1) <= 1);
  // Relation-informed typing (entityProfile behind relationsOf) is priced per row, so it runs only
  // when the type: facet asks for it; display rows below get the label-shape reading for free.
  const typed = new Map();
  if (ops.type != null) {
    for (const r of entRows) {
      const rel = relationsOf ? (relationsOf(r) || {}) : {};
      typed.set(r, entityTypeOf({ label: r.label, viasAsSrc: rel.viasAsSrc || [], viasAsTgt: rel.viasAsTgt || [] }));
    }
    entRows = entRows.filter((r) => typeMatches(ops.type, typed.get(r)));
  }
  const entGroup = entRows
    .map((r) => ({ score: (r.sourceCount || 1) * 100 + (r.mentions || 0), row: r }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CAPS.entities)
    .map(({ row: r }) => ({
      kind: 'entity', label: r.label, docId: r.docId, entId: r.entId, sn: r.sn ?? null,
      mentions: r.mentions || 0, sourceCount: r.sourceCount || 1,
      type: typed.get(r) || entityTypeOf({ label: r.label }),
    }));

  // claims — the projection's rows, faceted by standing. Corroborated (Witnessed) above
  // single-witness (Stated) above the rest; a Contested row always announces itself.
  const entFilterTerms = entNeedle ? [entNeedle] : [];
  let clmRows = (claims || [])
    .filter((c) => c && c.text)
    .filter((c) => !ops.source || (c.sn && srcBySn.has(c.sn)))
    .filter((c) => (terms.length ? allTermsIn(terms, `${c.text} ${c.quote || ''}`) : true))
    .filter((c) => (entFilterTerms.length ? allTermsIn(entFilterTerms, `${c.text} ${c.subject || ''} ${c.quote || ''}`) : true));
  if (ops.contradicts) clmRows = clmRows.filter((c) => c.status === 'Contested');
  if (ops.unique) clmRows = clmRows.filter((c) => c.band === 'stated' || c.status === 'Uncited');
  if (!terms.length && !entFilterTerms.length && !ops.contradicts && !ops.unique) clmRows = [];
  const CLAIM_RANK = { Contested: 0, Witnessed: 1, Promoted: 2, Supported: 3, Stated: 4, Uncited: 5 };
  const clmGroup = clmRows
    .sort((a, b) => (CLAIM_RANK[a.status] ?? 9) - (CLAIM_RANK[b.status] ?? 9))
    .slice(0, CAPS.claims)
    .map((c) => ({ kind: 'claim', ...c }));

  // passages — verbatim sentences carrying every term (or the entity: label). The grounding floor.
  const pasTerms = terms.length ? terms : entFilterTerms;
  const pasGroup = [];
  if (pasTerms.length) {
    for (const s of srcPool) {
      if (pasGroup.length >= CAPS.passages) break;
      let doc = null;
      try { doc = docFor(s); } catch { doc = null; }
      const units = doc?.sentences || [];
      let inSource = 0;
      for (let i = 0; i < units.length && inSource < CAPS.perSourcePassages && pasGroup.length < CAPS.passages; i++) {
        if (!allTermsIn(pasTerms, units[i])) continue;
        pasGroup.push({
          kind: 'passage', docId: s.docId, sn: s.sn, reg: s.reg || '', title: s.title || s.domain || '',
          unit: i, text: String(units[i]).slice(0, 280),
        });
        inSource++;
      }
    }
  }

  // sources — title/domain/body, the palette's original leg, now one group among four.
  const srcGroup = [];
  if (terms.length) {
    const scored = [];
    for (const s of srcPool) {
      const title = canon(s.title), domain = canon(s.domain), body = canon(s.text || '');
      let score = 0, all = true;
      for (const t of terms) {
        let hit = false;
        if (title.includes(t)) { score += 9; hit = true; }
        if (domain.includes(t)) { score += 4; hit = true; }
        if (body.includes(t)) { score += 2; hit = true; }
        if (!hit) { all = false; break; }
      }
      if (all && score) scored.push({ s, score });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const { s } of scored.slice(0, CAPS.sources)) {
      srcGroup.push({ kind: 'source', sn: s.sn, reg: s.reg || '', docId: s.docId, title: s.title || s.domain || s.url || '(untitled source)', domain: s.domain || '', srcKind: s.kind || '' });
    }
  } else if (ops.source) {
    for (const s of srcPool.slice(0, CAPS.sources)) {
      srcGroup.push({ kind: 'source', sn: s.sn, reg: s.reg || '', docId: s.docId, title: s.title || s.domain || s.url || '(untitled source)', domain: s.domain || '', srcKind: s.kind || '' });
    }
  }

  return { parsed, entities: entGroup, claims: clmGroup, passages: pasGroup, sources: srcGroup };
};
