// EO: REC(Paradigm → Paradigm, Tracing) — the crosswalk that learns
// docs/coreference-timeline.md § "The crosswalk that learns" / "The promotion threshold".
//
// A corroborated cross-source synonym pair (two labels a proposer/witness has judged denote the
// same referent, survived a second independent reader) becomes a standing engine-tier candidate
// the NEXT document's proposer can check deterministically — reusing core/conventions/ledger.js's
// support/strain register VERBATIM (no new machinery, no hand-tuned promotion count), gated by
// enactor/ground/corroboration.js's existing distinctEnough (target 2) so one document's habitual
// phrasing never promotes a pair on its own. Promotion never touches the negative-evidence /
// convergence check itself — it only shortens the path to a PROPOSAL, never to a commit.
import { createConventions } from '../../core/index.js';
import { distinctEnough, distinctVoices } from './corroboration.js';

const KIND = 'synonym-pair';

// The order-independent normalized pair key (surfer/reason/cursor.js defines the identical
// helper for the same shape of problem — a token from an unordered id pair); kept local here
// rather than imported so this holon does not reach across another's boundary for one line.
const pairKey = (a, b) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);

// createSynonymPromotion({ conventions }) → the corpus-scoped promotion register. One instance
// per corpus-cursor scope (a topic's whole reading), not per document — a synonym pair earns its
// trust from the CORPUS, in full, every time (no PRIOR_SUPPORT head start, unlike the seeded
// grammatical registers).
export const createSynonymPromotion = ({ conventions = createConventions({ seeds: false }) } = {}) => {
  const seen = new Map();   // pairKey → { descriptors: [], everPromoted: boolean }

  // corroborate(labelA, labelB, descriptor) — a proposed/asserted merge of this pair, witnessed by
  // `descriptor` (a corroboration.js witnessDescriptor-shaped source identity). Below the two-
  // distinct-voice gate, every occurrence stays at the model tier (nothing recorded here changes
  // that — the witness channel still runs every time). Crossing the gate the FIRST time enters the
  // ledger at support:2 (one unit per corroborating voice, never a head start); each further
  // distinct-voice corroboration reinforces by ledger.eva(kind, token, true) — support += 1, exactly
  // as the spec's accounting names it.
  const corroborate = (labelA, labelB, descriptor) => {
    const key = pairKey(labelA, labelB);
    const st = seen.get(key) || { descriptors: [], everPromoted: false };
    seen.set(key, st);
    st.descriptors.push(descriptor);
    if (conventions.has(KIND, key)) {
      conventions.eva(KIND, key, true);
    } else if (!st.everPromoted && distinctEnough(st.descriptors, { target: 2 })) {
      conventions.learn(KIND, key, 2);
      st.everPromoted = true;
    }
    // else: either below the gate still, or DEFEATED — no silent re-promotion (§ below).
    return { key, promoted: conventions.has(KIND, key), voices: distinctVoices(st.descriptors) };
  };

  // dispute(labelA, labelB) — a reader's assertDistinct, or a later document's own negative
  // evidence, committed against this STANDING RULE (not one mention pair): strain += 1, exactly
  // ledger.eva(kind, token, false). Auto-defeats (strain > support) via the ledger's own rule.
  const dispute = (labelA, labelB) => conventions.eva(KIND, pairKey(labelA, labelB), false);

  // isPromoted(labelA, labelB) — has this pair crossed the gate and not since been defeated? The
  // engine tier can check this deterministically before falling back to the witness channel.
  const isPromoted = (labelA, labelB) => conventions.has(KIND, pairKey(labelA, labelB));

  // reinstate(labelA, labelB) — the ONE deliberate, non-automatic way a defeated pair returns:
  // a person's explicit assertCoreference (warrant:'reader-assertion'), never a mechanical re-cross
  // of the corroboration gate.
  const reinstate = (labelA, labelB) => conventions.reinstate(KIND, pairKey(labelA, labelB));

  return { corroborate, dispute, isPromoted, reinstate, conventions, pairKey };
};
