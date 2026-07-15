// EO: SIG·CON(Field,Network → Field, Tending,Binding) — the EOT ledger feed
// Translate the three live activity streams the reader ALREADY emits — the app's
// activity log (app.state.log), the per-turn audit trail (audit), and the murmur
// side-channel — onto the EOT ledger's named verbs, so the full terminal
// (audit/eot-terminal.js) shows every real operation without a single instrumented
// call site. One translator, wired once at boot; no per-op plumbing anywhere else.
//
// Pure w.r.t. the engine: it only READS (the log array, the audit turns, the murmur
// snapshot) and WRITES to the ledger, itself a ring buffer that touches nothing. It
// never enters the answer, never appends to any durable log, and the murmur lines it
// prints ride the ENACTOR door (reafferent, witness:false) — so the §9 firewall is
// untouched: a murmur voicing in the terminal can no more witness a fact than the
// strip's can. wireEotFeed(...) returns an unsubscribe that detaches all three.

const slugish = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
const idNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || '')); return m ? Number(m[1]) : 0; };

export const wireEotFeed = ({ app, audit, murmur, eot } = {}) => {
  if (!eot) return () => {};
  const unsubs = [];

  // ── 1. the app activity log → the world/act verbs ────────────────────────────
  // logIt pushes { id:'L<n>', t, kind, text, effect } then emit('log'); we read the
  // entries past our high-water mark once each and map the entry's kind to a ledger
  // verb. A search/read comes through the PERCEIVER door (the world came in); a claim
  // bind is the model's own act (ENACTOR) — the ledger stamps that, we only name it.
  if (app && typeof app.subscribe === 'function' && app.state) {
    let hwm = 0;
    const drain = () => {
      const log = Array.isArray(app.state.log) ? app.state.log : [];
      for (const e of log) {
        if (!e || idNum(e.id) <= hwm) continue;
        hwm = idNum(e.id);
        const text = String(e.text || '').trim();
        const effect = String(e.effect || '').trim();
        try {
          switch (e.kind) {
            case 'search': if (text) eot.search({ query: text }); break;
            case 'record':
            case 'open':   if (text) eot.read({ source: text }); break;
            case 'web':    eot.found({ urls: [text || effect].filter(Boolean) }); break;
            case 'claim':  if (text) eot.bind({ claim: text, cite: effect || 'source' }); break;
            case 'learning': if (text) eot.learned({ entity: text }); break;
            default:       if (text) eot.note({ text: `${e.kind}: ${text}` });
          }
        } catch { /* a bad entry never breaks the feed */ }
      }
    };
    drain();                                              // seed with whatever's already there
    unsubs.push(app.subscribe((kind) => { if (kind === 'log') drain(); }));
  }

  // ── 2. the per-turn audit trail → the reafferent turn verbs ──────────────────
  // audit.subscribe fires on every step AND finish of the SAME turn object, so we
  // de-dupe per (turn.id, field): each turn-level op is printed once, the moment its
  // field first lands. These are the ops the activity log doesn't carry — the route
  // taken, the spans retrieved, the prompt built, the answer generated, the vetoes.
  if (audit && typeof audit.subscribe === 'function') {
    const done = new Map();                               // turnId → Set<field>
    const once = (t, field) => {
      let s = done.get(t.id);
      if (!s) {
        s = new Set(); done.set(t.id, s);
        if (done.size > 512) { const oldest = done.keys().next().value; done.delete(oldest); }
      }
      if (s.has(field)) return false;
      s.add(field); return true;
    };
    unsubs.push(audit.subscribe((t) => {
      if (!t || !t.id) return;
      try {
        if (t.route && once(t, 'route')) eot.route({ turn: t.id, route: String(t.route) });
        const spans = t.reading && Array.isArray(t.reading.spans) ? t.reading.spans : null;
        if (spans && spans.length && once(t, 'retrieve')) eot.retrieve({ turn: t.id, n: spans.length, top: spans[0] ? spans[0].score : null });
        if (t.prompt && once(t, 'prompt')) eot.prompt({ turn: t.id, text: String(t.prompt) });
        if (t.rawOutput && once(t, 'generate')) eot.generate({ turn: t.id, text: String(t.rawOutput), ms: t.durationMs ?? null });
        const vetoes = Array.isArray(t.vetoes) ? t.vetoes : [];
        vetoes.forEach((v, i) => {
          if (!once(t, `veto:${i}`)) return;
          eot.veto({ turn: t.id, id: (v && (v.id || v.claim)) || `claim${i}`, message: (v && (v.message || v.reason)) || null });
        });
      } catch { /* never let the feed throw into a turn's notify */ }
    }));
  }

  // ── 3. the murmur side-channel → reafferent voicings (witness:false) ─────────
  // Each real voiced thought becomes ONE enactor-door note tagged kind:'murmur', so
  // the terminal's addressOf reads its organ as `murmur`. De-duped by text (the last
  // fold's propositions trail every mutter snapshot) so the same line isn't reprinted.
  // Reafferent by the door — it cannot witness; the strip's firewall holds here too.
  if (murmur && typeof murmur.subscribe === 'function') {
    const recent = [];                                    // small LRU of texts already logged
    const seen = (txt) => {
      if (recent.includes(txt)) return true;
      recent.push(txt); if (recent.length > 24) recent.shift();
      return false;
    };
    unsubs.push(murmur.subscribe((s) => {
      const voice = s && Array.isArray(s.voice) ? s.voice : [];
      for (const v of voice) {
        const txt = v && String(v.text || '').trim();
        if (!txt || seen(txt)) continue;
        const site = v.sites && v.sites[0] && v.sites[0].hash ? slugish(v.sites[0].hash) : 'reading';
        try {
          eot.record({
            op: 'SIG', door: 'enactor', agent: 'murmur', kind: 'murmur',
            target: site,
            operand: { designation: slugish(txt) },
            raw: { text: txt, register: v.register || null, op: v.op || null },
          });
        } catch { /* the sense must never cost anything on the surface */ }
      }
    }));
  }

  return () => { for (const u of unsubs) { try { u(); } catch { /* best-effort */ } } };
};
