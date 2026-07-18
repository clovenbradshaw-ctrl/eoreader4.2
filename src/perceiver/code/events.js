// EO: SIG·SYN(Entity,Link → Network, Tending,Composing) — the typed operator
// event log
// Walks a corpus reconciliation, its propagation results, and its NUL ledger,
// emitting the proposal's nine-operator roster as EVENTS describing what a
// reconciliation pass found — never as a permanent label glued onto a syntax
// kind (docs/code-holons.md §9). `same` entries produce no event: nothing
// happened, nothing to report.

const opEvent = (op, path, holon, detail) => ({ op, path, holonId: holon?.id ?? null, name: holon?.anchor?.declaredName ?? null, detail });

// emitEvents(reconciliationByFile, propagationList, nullsByFile, readingsByHolonId)
// -> ordered Event[]. `readingsByHolonId` maps a holon id to its ChangeReading
// (change-reading.js), used only to label the EVA event with the verdict.
export const emitEvents = (reconciliationByFile, propagationList = [], nullsByFile = {}, readingsByHolonId = new Map()) => {
  const events = [];

  for (const [path, entries] of Object.entries(reconciliationByFile)) {
    for (const entry of entries) {
      if (entry.category === 'same') continue;
      const holon = entry.new ?? entry.old;

      if (entry.category === 'added') {
        events.push(opEvent('SEG', path, holon, `a new holon boundary qualifies for admission`));
        events.push(opEvent('INS', path, holon, `admitted with no old-side match`));
        events.push(opEvent('SYN', path, holon, `lower facts composed into one holon`));
      } else if (entry.category === 'removed') {
        events.push(opEvent('SEG', path, holon, `a holon boundary no longer qualifies for admission`));
      } else {
        events.push(opEvent('SIG', path, holon, `witness re-registered (${entry.category})`));
      }

      if (entry.category === 'renamed' && entry.exported) {
        events.push(opEvent('DEF', path, entry.new, 'exported signature asserted — the declared name is part of the contract'));
      }

      const reading = readingsByHolonId.get(holon.id);
      events.push(opEvent('EVA', path, holon, reading ? `${reading.semanticVerdict}${reading.equivalenceTier ? `/${reading.equivalenceTier}` : ''}` : entry.category));
    }
  }

  for (const p of propagationList) {
    if (p.contractChanged) events.push({ op: 'DEF', path: p.path, holonId: p.holonId, name: p.exportName, detail: 'contract change asserted' });
    for (const c of [...p.typeConsumers, ...p.behavioralConsumers]) {
      events.push({ op: 'CON', path: c.path, holonId: p.holonId, name: p.exportName, detail: `dependency edge to ${c.localName ?? p.exportName} in ${c.path}` });
    }
  }

  for (const [path, nulls] of Object.entries(nullsByFile)) {
    for (const n of nulls) events.push({ op: 'NUL', path, holonId: null, name: null, detail: `${n.reason} — ${n.grounds}` });
  }

  return events;
};

// A prior ChangeReading revised by a later AnalysisWitness (docs/code-holons.md
// §7/§9) — called by index.js at the point a witness actually flips a verdict,
// never fired for an ordinary recursive call (that is a CON edge whose endpoints
// happen to cycle — the proposal's own §3 correction, kept).
export const witnessRevisionEvent = (path, holon, diagnostic) => opEvent('REC', path, holon, `reading revised by analysis witness: ${diagnostic}`);

export const renderEventLog = (events) => events.map((e) => `${e.op.padEnd(4)} ${e.path}${e.name ? ` · ${e.name}` : ''} — ${e.detail}`);
