// EO: NUL·SEG(Kind → Kind, Clearing) — the modifier law
// A word that predominantly stands BEFORE the noun of a description ("the OLD man", "the YOUNG
// wretch") is a MODIFIER — an adjective — not the body. Where its noun is elided ("the old", "the
// young") a description scan reads the adjective itself as a head and mints a phantom figure. The
// tell is emergent and model-free: a distributional census of THIS document — not a lexicon, so the
// same string heads an NP in one register and modifies in another, and the count decides.
//
// The one subtlety is telling a following NOUN ("the old MAN") from a following VERB ("the creature
// STRETCHED") — both are lowercase content words, but only the former makes the earlier word a
// modifier. The discriminator is itself distributional and needs no verb lexicon: a NOUN takes its
// own determiner somewhere ("the man"), a verb never does ("the stretched" does not occur). So a
// word is in the MODIFIER slot only when the word after it is a DETERMINER-TAKER (a head the text
// elsewhere fronts with the/a); otherwise it is in the HEAD slot.
//
// Shared leaf: any description read (unnamed-referent, uncased, the referent layer's mention scan) can
// refuse a modifier-dominated head the same way, so the law lives once here, not per silo.

const DET  = String.raw`(?:[Tt]he|[Aa]n?)`;
const RUN  = new RegExp(String.raw`\b${DET}\s+((?:[a-z][a-z'’-]+\s+){0,4}[a-z][a-z'’-]{2,})\b`, 'g');
const singular = (h) => (h.length > 4 && h.endsWith('s') && !h.endsWith('ss')) ? h.slice(0, -1) : h;

// censusModifiers(sentences, { isFunction }) → (head) → bool   (true = refuse it as a body).
// A head is refused only on REAL modifier evidence AND a clear (≥3:1) modifier majority.
export const censusModifiers = (sentences, { isFunction } = {}) => {
  const contentful = (w) => w.length >= 3 && !(isFunction?.(w) ?? false);
  const runsOf = (sent) => {
    const s = String(sent), out = []; let m; const re = new RegExp(RUN.source, 'g');
    while ((m = re.exec(s)) !== null) out.push(m[1].split(/\s+/).map((w) => singular(w.toLowerCase())));
    return out;
  };
  const sents = Array.isArray(sentences) ? sentences : [];
  // Pass 1 — the determiner-takers: the FIRST content word of every description run is a noun/adj
  // the text fronts with a determiner. Verbs never enter this set (nothing says "the stretched").
  const detTakers = new Set();
  const runs = [];
  for (const sent of sents) for (const ws of runsOf(sent)) {
    runs.push(ws);
    const first = ws.find(contentful);
    if (first) detTakers.add(first);
  }
  // Pass 2 — a word is in the MODIFIER slot when the next content word is a determiner-taker; else
  // it sits in the HEAD slot.
  const asHead = new Map(), asMod = new Map();
  for (const ws of runs)
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]; if (!contentful(w)) continue;
      const nxt = ws.slice(i + 1).find(contentful);
      const bank = (nxt && detTakers.has(nxt)) ? asMod : asHead;
      bank.set(w, (bank.get(w) || 0) + 1);
    }
  return (head) => {
    const md = asMod.get(head) || 0, hd = asHead.get(head) || 0;
    return md >= 4 && md / (md + hd) >= 0.75;
  };
};
