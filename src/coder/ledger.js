// EO: INS·CON·SIG(Entity,Link → Network, Making,Binding,Tending) — the build ledger
// Stage 4 of the roadmap (docs/eot-coder-roadmap.md): provenance as the product,
// not a debug log. An app assembled by the coder carries the trace of its own
// construction — what was emitted, in response to what, what the mask disallowed,
// every checkpoint verdict, every !REC widening, and every veto. And the trace is
// a SIGNED, append-only chain: each entry's signature folds in the prior entry's,
// so a tampered or reordered ledger fails verification. An app whose construction
// is a signed ledger is a categorically different object from one generated in a
// chat window — the moat a probabilistic generator cannot retrofit (§Stage 4).
//
// Pure data + a pure hash (browser-safe, no crypto import) — the way the rest of
// the engine stays runnable everywhere (docs/code-organ.md). The clock is injected
// (`now`), so a build is reproducible and a test is deterministic.

const MAX_TEXT = 240;
const trim = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

// FNV-1a over a string → 8 hex chars. Not a cryptographic hash — a tamper-evident
// chain check that runs in every runtime the engine runs in (no Web Crypto, no node
// crypto). The signature folds the prior entry's signature in, so the chain is the
// witness: change one entry and every signature after it stops matching.
const GENESIS = '00000000';
const fnv1a = (s) => {
  let x = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return (x >>> 0).toString(16).padStart(8, '0');
};

export const createBuildLedger = ({ now = () => new Date().toISOString() } = {}) => {
  let entries = [];
  let seq = 0;
  let lastSig = GENESIS;

  // Every entry is signed over (its own payload + the prior signature). The door
  // is the provenance: emissions and repairs are the coder's OWN word (enactor,
  // reafference); a verdict is the kernel's judgment of that word.
  const push = (e) => {
    const payload = { seq: seq++, t: now(), ...e };
    const sig = fnv1a(lastSig + JSON.stringify(payload));
    const entry = Object.freeze({ ...payload, prev: lastSig, sig });
    lastSig = sig;
    entries.push(entry);
    return entry;
  };

  return Object.freeze({
    // an assembly begins — its address, kind, and (for surfaces) its catalog surface
    recordOpen: (assembly) => push({ kind: 'open', assembly: assembly?.id ?? '_', akind: assembly?.kind ?? null, surface: assembly?.surface ?? null, door: 'enactor' }),
    // one emitted event — the coder's word, disposed by the mask (§Stage 1)
    recordEmission: (assemblyId, ev) => push({ kind: 'emit', assembly: assemblyId, op: ev?.op ?? null, terrain: ev?.terrain ?? null, stance: ev?.stance ?? null, id: ev?.id ?? null, ref: ev?.ref ?? null, door: 'enactor' }),
    // what the model WANTED to say but the mask disallowed — the research artifact
    // Stage 1's risk note asks for: an audit of what the model reached for.
    recordDivergence: (assemblyId, d) => push({ kind: 'diverge', assembly: assemblyId, event: d?.event ?? null, face: d?.face ?? null, wanted: d?.wanted ?? null, chosen: d?.chosen ?? null, allowed: Object.freeze([...(d?.allowed ?? [])]), door: 'enactor' }),
    // a checkpoint verdict — the kernel's judgment, beside the word it judges
    recordVerdict: (assemblyId, v) => push({ kind: 'verdict', assembly: assemblyId, ok: !!v?.ok, errors: Object.freeze((v?.findings ?? []).map((f) => `${f.error}@${f.address}`)), door: 'enactor' }),
    // a repair — a typed error consumed as a repair target; a widening is a logged !REC
    recordRepair: (assemblyId, finding, strategy) => push({ kind: 'repair', assembly: assemblyId, error: finding?.error ?? null, address: finding?.address ?? null, strategy: trim(strategy), rec: strategy === '!REC', door: 'enactor' }),
    // a veto — "this part cannot be built as asked; here is exactly what failed"
    recordVeto: (assemblyId, veto) => push({ kind: 'veto', assembly: assemblyId, message: trim(veto?.message), errors: Object.freeze((veto?.findings ?? []).map((f) => `${f.error}@${f.address}`)), door: 'enactor' }),

    entries: () => entries.slice(),
    get size() { return entries.length; },
    get head() { return lastSig; },

    // the chain is the witness — recompute every signature from the genesis and
    // confirm each folds the prior. A single altered/reordered entry breaks it.
    verifyChain() {
      let prev = GENESIS;
      for (const e of entries) {
        const { prev: _p, sig: _s, ...payload } = e;
        const sig = fnv1a(prev + JSON.stringify(payload));
        if (e.prev !== prev || e.sig !== sig) return false;
        prev = sig;
      }
      return true;
    },

    exportJSONL: () => entries.map((e) => JSON.stringify(e)).join('\n'),

    // the human-readable build report — what goes in the methods note of a story,
    // the appendix of a records request, or in front of a court (§Stage 4). Rendered
    // from the ledger; a skeptical outside party can read it and check the chain.
    buildReport() {
      const byAssembly = [];
      const idx = new Map();
      for (const e of entries) {
        if (!idx.has(e.assembly)) { idx.set(e.assembly, byAssembly.length); byAssembly.push({ id: e.assembly, lines: [] }); }
        byAssembly[idx.get(e.assembly)].lines.push(e);
      }
      const out = ['BUILD REPORT', '============'];
      for (const grp of byAssembly) {
        const open = grp.lines.find((l) => l.kind === 'open');
        const label = open?.surface ? `surface:${open.surface}` : (open?.akind ?? 'assembly');
        out.push('', `assembly '${grp.id}' (${label})`);
        for (const l of grp.lines) {
          if (l.kind === 'emit') out.push(`  emit   ${[l.op, l.terrain, l.stance].filter(Boolean).join(' ') || '—'}${l.id ? ` [id=${l.id}]` : ''}${l.ref ? ` [->${l.ref}]` : ''}`);
          else if (l.kind === 'diverge') out.push(`  mask   model wanted ${l.face}=${l.wanted}; allowed {${l.allowed.join(', ') || '∅'}} → chose ${l.chosen ?? '∅'}`);
          else if (l.kind === 'verdict') out.push(l.ok ? '  ✓ checkpoint passed' : `  ✗ checkpoint: ${l.errors.join(', ')}`);
          else if (l.kind === 'repair') out.push(`  ↻ repair ${l.error} @ ${l.address}${l.rec ? ' (!REC widening)' : ` — ${l.strategy}`}`);
          else if (l.kind === 'veto') out.push(`  ⛔ veto: ${l.message}`);
        }
      }
      out.push('', `ledger: ${entries.length} entries · chain ${this.verifyChain() ? 'OK' : 'BROKEN'} · head ${lastSig}`);
      return out.join('\n');
    },
  });
};
