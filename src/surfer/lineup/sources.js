// EO: NUL·SIG·INS·CON(Void,Field,Network → Entity,Field,Network,Void, Clearing·Tending·Making·Binding) — the search gate + the source commons
// lineup/sources.js — when to reach for the net, and what to keep of what comes back.
//
// Two disciplines, both borrowed from parts of the engine that already earned them:
//
//   THE GATE (needsWeb). turn/propose.js's whole posture is "a sound turn never reaches
//     for the net" — a search fires only on a MEASURED VOID the material cannot close.
//     The walk grades itself off the log (reason/walk.js), so the void is already
//     measured: a surfer that SATURATED on ground-covered (it ran out of corpus-anchored
//     moves and only reaches remained) with open idle leads has hit a gap the graph
//     cannot fill — that, and only that, earns a forage. A surfer that closed cleanly on
//     ground asks the world nothing. This is why the chorus does not search wastefully
//     even though every voice CAN: the gate is the measured void, not an appetite.
//
//   THE COMMONS (createSourceCommons). commons.js's niche construction — a shared store
//     that APPRECIATES on what proves useful and DECAYS what does not, evicting stale
//     grounding rather than hoarding it. Here the store holds SOURCES, and "useful" has a
//     sharp meaning: a source is meaningful to a surfer iff one of that surfer's SIGNAL
//     findings actually used it (signal.js kept a finding whose sites touch the source).
//     A foraged page that grounded nothing the chorus kept is never contributed — it
//     lived only in that surfer's fork and is gone at round's end. A page that did is
//     contributed, borrowable by every voice next round, and must keep proving useful or
//     it decays out. So the chorus does not "store everything forever": it keeps what a
//     signal was built on, and only for as long as it stays load-bearing.
//
// Sources enter the graph through the PERCEIVER door (seedCorpus) — they are witnessed
// external material, so a bond onto one can grade grounded, exactly as an uploaded
// document's can. A source is bonded only to the corpus figures its text actually names
// (label-token overlap), so an OFF-TOPIC page bonds to nothing, is never walked, never
// proves meaningful, and is evicted — the relevance filter falls out of the admission,
// not a separate rule.

import { seedCorpus, readGraph } from '../reason/index.js';
import { createCommons } from '../../metabolism/index.js';

// ── The gate ────────────────────────────────────────────────────────────────
// needsWeb(surfResult, opts) → { search, because } . Reads the surfer's void reading
// (surfer.js `walk`) and its open leads. Search only on a measured void: the graph is
// spent (ground-covered) OR the commit was mostly ungrounded reach (below the floor), AND
// there is an actual open lead to ASK — a saturated-but-closed reading asks nothing.
export const needsWeb = (surfResult, { groundFloor = 0.5 } = {}) => {
  const w = surfResult?.walk || {};
  const leads = surfResult?.openLeads || [];
  const hasLead = leads.length > 0 || w.lastReason === 'ground-covered';
  const groundSpent = w.lastReason === 'ground-covered';
  const underGrounded = (surfResult?.steps || 0) > 0 && (w.groundedFraction ?? 1) < groundFloor;
  const search = hasLead && (groundSpent || underGrounded);
  return Object.freeze({
    search,
    because: !hasLead ? 'no open lead — nothing to ask'
      : groundSpent ? 'the graph is spent (ground-covered) with a lead still open'
        : underGrounded ? 'the commit is mostly ungrounded reach — the graph did not anchor it'
          : 'the reading closed on ground — no need',
  });
};

// queryFor(surfResult) — turn the strongest open lead into a query to the world, sharpened
// with the surfer's focus the way proposeWebSearch sharpens a bare question with surf.focus.
// Falls back to the loudest thing the surfer said when no lead carries words.
export const queryFor = (surfResult) => {
  const leads = surfResult?.openLeads || [];
  const said = leads.map((l) => l.said).filter(Boolean)[0]
    || (surfResult?.findings || []).slice().sort((a, b) => b.bits - a.bits)[0]?.said
    || '';
  return String(said || '').replace(/\s+/g, ' ').trim();
};

// ── Admitting sources into a surfer's graph ───────────────────────────────────
// A stable, dependency-free id for a source (its content decides identity, so the same
// page borrowed and re-foraged lands on one figure). FNV-1a over title+url+text.
export const sourceId = (src) => {
  const s = `${src?.id || ''}|${src?.title || ''}|${src?.url || ''}|${String(src?.text || '').slice(0, 512)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return 'web:' + (h >>> 0).toString(16).padStart(8, '0');
};

const tokens = (s) => String(s || '').toLowerCase().match(/[a-z]{3,}/g) || [];

// admitSources — seed source records into `log` as witnessed figures, each bonded (via
// 'attests') to the corpus figures its text NAMES (label-token overlap). Returns the map
// of admitted source-figure id → record, so the caller can later ask which sources a
// signal finding touched. A source that names no corpus figure is still admitted (it can
// be bonded by a reaching surfer) but starts isolated — the honest baseline for a page
// nothing in the graph asked for.
export const admitSources = (log, sources = [], { enactment = 'web' } = {}) => {
  const idMap = new Map();
  if (!sources.length) return idMap;
  const figures = [...readGraph(log).figures.values()];
  const spec = [];
  for (const src of sources) {
    const id = sourceId(src);
    if (idMap.has(id)) continue;                 // one figure per source, even if borrowed AND foraged
    idMap.set(id, Object.freeze({ ...src, id }));
    spec.push({ op: 'INS', id, label: String(src.title || src.source || id) });
    const bodySet = new Set(tokens(`${src.title || ''} ${src.text || ''}`));
    // bond the source to the corpus figures it actually names — the relevance filter — but
    // to at most a few, so one wide page cannot flood a single relation across the graph.
    let bonded = 0;
    for (const f of figures) {
      if (bonded >= 3) break;
      if (tokens(f.label).some((t) => bodySet.has(t))) {
        spec.push({ op: 'CON', src: id, tgt: f.id, via: 'attests' });
        bonded += 1;
      }
    }
  }
  seedCorpus(log, spec, { enactment });          // through the PERCEIVER door — witnessed, groundable
  return idMap;
};

// ── The source commons — meaningful-only, decaying, borrowable ────────────────
// createSourceCommons — the shared habitat of sources the chorus has PROVEN useful. Wraps
// commons.js for the appreciate/decay/evict arithmetic (so retention is the same niche-
// construction the metabolism already trusts) and holds the records themselves in a
// registry pruned to whatever the decaying strength still carries — so eviction of a
// stale source drops its bytes, not just its score.
export const createSourceCommons = ({ decay = 0.9, cap = 4, saturation = 2 } = {}) => {
  const strength = createCommons({ decay, cap, saturation });   // sourceId → built usefulness
  const registry = new Map();                                   // sourceId → record (lives only while strength holds it)

  // contribute(record, quality) — mark a source meaningful: it grounded a signal finding.
  // quality is the finding's grade weight (signal.js). Appreciates the habitat on this id.
  const contribute = (record, quality = 1) => {
    const id = record.id || sourceId(record);
    strength.contribute(id, quality);
    registry.set(id, Object.freeze({ ...record, id }));
    return strength.subsidy(id);
  };

  // step — one period of ecological inheritance: decay the usefulness, then EVICT from the
  // registry every source the decay dropped below the keep-floor. This is the "don't store
  // everything forever": a source not re-proven useful fades and its record is released.
  const step = () => {
    strength.step();
    const kept = new Set(Object.keys(strength.snapshot()));
    for (const id of [...registry.keys()]) if (!kept.has(id)) registry.delete(id);
    return level();
  };

  // borrowable — the meaningful sources a surfer may seed for FREE next round (borrowing
  // instead of re-foraging), strongest usefulness first. This is the cooperative payoff:
  // one voice's confirmed source becomes every voice's starting material.
  const borrowable = ({ max = 4 } = {}) => {
    const s = strength.snapshot();
    return [...registry.values()]
      .sort((a, b) => (s[b.id] || 0) - (s[a.id] || 0) || (a.id < b.id ? -1 : 1))
      .slice(0, Math.max(0, max));
  };

  const level = () => strength.level();
  return Object.freeze({
    contribute, step, borrowable, level,
    size: () => registry.size,
    snapshot: () => strength.snapshot(),
    records: () => [...registry.values()],
  });
};
