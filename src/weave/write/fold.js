// EO: INS·SIG·NUL(Entity → Entity,Void, Making,Binding,Tending) — frontier + integral; the running state (§2)
// write/fold.js — the fold: frontier + integral. (SPEC §2)
//
// The fold is the substrate's running state. Two parts:
//
//   frontier: Set<hash>            the APPEARED Sites — the DAG frontier (§3a). What
//                                  has occupied a slot, hence what is now connectable.
//   integral: Map<hash, Dossier>   per-referent γ-decayed FIRM standing readout.
//
//   Dossier = {
//     head:        string,                     the canonical name ("Gregor Samsa")
//     descriptors: [{ attr, w, prov, t }],     γ-decayed FIRM descriptors, provenance-tagged
//     open:        [{ attr, prov, t }],         VOID attributes — held OUT of the name (§5)
//   }
//
// integralName folds the FIRM descriptor events with γ-decay into a standing
// readout (the audit + model-input name) and collects void attributes separately,
// surfaced as "unsettled — do not assert." Two disciplines are mandatory or the
// integral becomes a laundering channel (§2):
//
//   γ-DECAY    it is the STANDING dossier, not the raw biography. Bounded by a
//              keep-threshold. In the live system this REUSES the γ-decayed
//              coref/standing-descriptor state src/perceiver/ already computes —
//              this is a READOUT, not new accumulation. Here the descriptor events
//              arrive from the caller (the perceiver, or a test), and the fold
//              folds them; where they came from is the perceiver's concern.
//   FIRM-ONLY  void-resolved attributes are EXCLUDED from `name` and surfaced in
//              `open`. Baking a void claim into the name firms it up by stealth
//              (the sister/mother / overclaim failure). Each descriptor also carries
//              its `prov` so the dossier knows which contents it READ (exafference,
//              can anchor) vs SAID (reafference, cannot — §8).
//
// The integral is the readout earlier coref work threw away after binding. The fold
// keeps it and the cursor surfaces it at the point of use (§5).

import { BANDS, isVoid, mintHash } from '../../core/index.js';

export const DEFAULT_GAMMA = 0.8;   // recency decay (cursor.mjs)
export const DEFAULT_KEEP  = 0.25;  // the standing-dossier keep-threshold (bounds the budget)

// createFold — a fresh running state. `gamma` and `keep` are the integral's two
// disciplines made into knobs; sweeping them against the renderer's working span
// is open question §13.4.
export const createFold = ({ gamma = DEFAULT_GAMMA, keep = DEFAULT_KEEP } = {}) => {
  const frontier = new Set();              // appeared hashes (§3a)
  const refs = new Map();                  // hash → { head, pron, log: [descriptorEvent] }
  let seq = 0;                             // appearance order — the mint counter (§1)

  const ref = (hash) => refs.get(hash);

  // register — bind a hash to its canonical head and pronouns WITHOUT making it
  // appear. Minting is once (§1); a second register keeps the first head (identity
  // is stable under learning). Returns the hash.
  const register = (hash, { head = null, pron = null } = {}) => {
    if (!refs.has(hash)) refs.set(hash, { head: head ?? hash, pron: pron ?? null, log: [] });
    else {
      const r = refs.get(hash);
      if (head && r.head === hash) r.head = head;          // fill a placeholder head, never overwrite a real one
      if (pron && !r.pron) r.pron = pron;
    }
    return hash;
  };

  // mint — the EXISTENCE handle for a brand-new referent, minted once from the
  // appearance seq (§1). Registers head/pron and returns the opaque hash.
  const mint = ({ head = null, pron = null } = {}) => {
    const hash = mintHash(++seq);
    register(hash, { head, pron });
    return hash;
  };

  // appear — INS-by-appearance (§3a): the Site occupies a slot and joins the
  // frontier, so a CON may now connect it. Idempotent. Optionally registers head.
  const appear = (hash, meta) => {
    if (meta) register(hash, meta);
    else if (!refs.has(hash)) register(hash);
    frontier.add(hash);
    return hash;
  };

  const has = (hash) => frontier.has(hash);

  // record — push a descriptor event onto a referent's log. A FIRM descriptor
  // joins the dossier (γ-decayed at query); a VOID one is held OUT, surfaced as an
  // open question (§2 FIRM-ONLY). `prov` rides along so the dossier knows read vs
  // said (§8). The INS's bare name is the head, not a descriptor — it is skipped.
  const record = (hash, { attr, res = BANDS.FIRM, prov = null, t = 0, op = 'DEF' } = {}) => {
    if (!refs.has(hash)) register(hash);
    if (op === 'INS') return;                              // the head carries the bare name
    refs.get(hash).log.push({ attr, void: isVoid(res), prov, t });
  };

  // dossierOf — the γ-decayed FIRM standing readout + the void open list, at cursor
  // `t`. The shape the spec names; integralName is the flattened, model-facing view.
  const dossierOf = (hash, t = Infinity, { gamma: g = gamma, keep: k = keep } = {}) => {
    const r = ref(hash);
    if (!r) return { head: hash, descriptors: [], open: [] };
    const descriptors = [];
    const open = [];
    for (const e of r.log) {
      if (e.t > t) continue;                               // only what is known at the cursor
      if (e.void) { open.push({ attr: e.attr, prov: e.prov, t: e.t }); continue; }
      const w = Math.pow(g, Math.max(0, t === Infinity ? 0 : t - e.t));  // recency weight
      descriptors.push({ attr: e.attr, w, prov: e.prov, t: e.t });
    }
    // keep the strongest-standing descriptors (γ-decayed); drop the faded ones, so
    // the dossier is the STANDING readout, not the raw biography (bounded by keep).
    descriptors.sort((a, b) => b.w - a.w);
    const kept = descriptors.filter(d => d.w > k);
    return { head: r.head, descriptors: kept, open };
  };

  // integralName — the flattened readout that does double duty (§5, cursor.mjs):
  //   name  head + γ-kept firm descriptors   (the audit + model-input name)
  //   head  the bare canonical name
  //   open  the void attributes              (surfaced as "unsettled, do not assert")
  const integralName = (hash, t = Infinity, { full = true, gamma: g = gamma, keep: k = keep } = {}) => {
    const d = dossierOf(hash, t, { gamma: g, keep: k });
    const kept = d.descriptors.map(x => x.attr);
    const name = full && kept.length ? `${d.head} — ${kept.join(', ')}` : d.head;
    return { name, head: d.head, open: d.open.map(x => x.attr) };
  };

  const headOf = (hash) => ref(hash)?.head ?? hash;
  const pronOf = (hash) => ref(hash)?.pron ?? null;
  const appeared = () => [...frontier];

  // update — the loop's fold advance, `fold = update(fold, out)` (§6). An event
  // moves the frontier (INS / CON arguments / SYN promotion appear) and the
  // integral (DEF/SIG/EVA descriptors record). One spine, two readouts.
  const update = (event, { head = null, pron = null } = {}) => {
    if (!event) return self;
    const { op } = event;
    const sites = sitesOfEvent(event);
    if (op === 'INS') {
      for (const s of sites) appear(s.hash, head || pron ? { head, pron } : undefined);
    } else if (op === 'CON' || op === 'SIG' || op === 'EVA') {
      for (const s of sites) appear(s.hash);               // arity: arguments are appeared by use
      // a relation that asserts a descriptor about its first slot records it
      if (event.attr != null && sites[0])
        record(sites[0].hash, { attr: event.attr, res: event.res, prov: event.prov, t: event.t, op });
    } else if (op === 'DEF' || op === 'NUL' || op === 'SEG') {
      if (sites[0]) record(sites[0].hash, { attr: event.attr, res: event.res, prov: event.prov, t: event.t, op });
    } else if (op === 'SYN' || op === 'REC') {
      if (event.promotes) appear(event.promotes.hash ?? event.promotes, event.promoteMeta);
    }
    return self;
  };

  const self = {
    get frontier() { return frontier; },
    get refs() { return refs; },
    register, mint, appear, has, inFrontier: has, record,
    dossierOf, integralName, headOf, pronOf, appeared, update,
  };
  return self;
};

// sitesOfEvent — tolerate both the formal Event (site: Site | [Site]) and the
// kernel's plain cells; normalize to a list of { hash }.
const sitesOfEvent = (event) => {
  const s = event?.site ?? event?.sites ?? null;
  if (s == null) return [];
  const arr = Array.isArray(s) ? s : [s];
  return arr.map(x => (typeof x === 'string' ? { hash: x } : x)).filter(x => x && x.hash);
};
