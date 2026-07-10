// EO: SYN·NUL·SEG(Field,Link → Field, Composing,Clearing) — the doorway carry / chunk
// essay/carry.js — the compressed state that crosses each doorway.
//
// Small by law: the carry is a CHUNK — the prior sections consolidated into
// one unit that costs one unit of budget in the next fold. It is never the
// text of prior sections (that lives only in the log); it is their compressed
// trace: the invariant thesis, the terminal claim of the last accepted
// section, the open threads (promises made, not yet paid), and the ledger of
// bound commitments for repeat and contradiction checks.
//
// Invariants enforced here:
//   - the thesis is COPIED, never rewritten, into every carry; it changes
//     only by replan (replanCarry is the single door).
//   - updateCarry closes paid threads, re-dates deferred ones, opens new
//     ones; a thread leaves the carry only by being paid.
//   - capCarry compresses old ledger entries to their contradiction-relevant
//     core (claim + section, spanRefs dropped) rather than forgetting them.

const freeze = Object.freeze;
const list = (xs) => freeze([...(xs || [])]);

const freezeThread = (th) => freeze({
  id: th.id, text: String(th.text ?? ''), openedAt: th.openedAt, dueBy: th.dueBy ?? null,
});

// `prop` — the pre-linguistic payload (proposition.js) — rides the carry in
// full: it IS the contradiction-relevant core, and it is what a non-text
// renderer folds. Compression drops the spanRefs texture, never the payload.
const freezeCommitment = (c) => freeze({
  claim: String(c.claim ?? ''), prop: c.prop ?? null,
  spanRefs: list(c.spanRefs), sectionId: c.sectionId,
  ...(c.compressed ? { compressed: true } : {}),
});

export const initCarry = (spine) => freeze({
  thesis: spine.thesis,   // copied from the spine, never rewritten
  priorClaim: '',
  threads: freeze([]),
  ledger: freeze([]),
});

// Fold an accepted section into the carry — the chunk update. The full
// section text now lives only in the log; only this trace rides forward.
export const updateCarry = (carry, {
  terminalClaim = '', commitments = [], paid = [], opened = [], deferred = [],
} = {}) => {
  const paidIds = new Set(paid);
  const deferredBy = new Map((deferred || []).map((d) => [d.id, d.dueBy]));
  const threads = carry.threads
    .filter((th) => !paidIds.has(th.id))
    .map((th) => (deferredBy.has(th.id) ? freezeThread({ ...th, dueBy: deferredBy.get(th.id) }) : th));
  return freeze({
    thesis: carry.thesis,   // untouched — only replanCarry may change it
    priorClaim: String(terminalClaim ?? ''),
    threads: freeze([...threads, ...(opened || []).map(freezeThread)]),
    ledger: freeze([...carry.ledger, ...(commitments || []).map(freezeCommitment)]),
  });
};

// The carry-size knob. Compression has a real limit — the ledger keeps the
// claim, not the texture — so old commitments shrink to their
// contradiction-relevant core: claim text and section, spanRefs dropped.
// Threads are all open debts and are never capped away (none are dropped
// silently); only the ledger compresses.
export const capCarry = (carry, { maxLedger = 64 } = {}) => {
  if (carry.ledger.length <= maxLedger) return carry;
  const cut = carry.ledger.length - maxLedger;
  const ledger = carry.ledger.map((c, i) => (
    i < cut && !c.compressed
      ? freezeCommitment({ claim: c.claim, prop: c.prop, spanRefs: [], sectionId: c.sectionId, compressed: true })
      : c
  ));
  return freeze({ ...carry, ledger: freeze(ledger) });
};

// The single door through which a thesis may change — replan, and nothing
// else. The rest of the carry rides through so open debts survive the
// restructure.
export const replanCarry = (carry, thesis) => freeze({ ...carry, thesis: String(thesis) });

// Threads due at a section — what the thread-accounting gate holds it to.
export const threadsDue = (carry, sectionId) =>
  carry.threads.filter((th) => th.dueBy === sectionId);
