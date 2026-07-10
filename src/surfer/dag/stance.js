// EO: DEF(Field → Lens,Atmosphere, Dissecting) — dialectical CON stance
// The dialectical CON stance — accidental · essential · generative.
//
// CON (the bond at Relate × Structure) is the operator that ties this to that. On a
// CAUSAL reading it carries a dialectical stance, and the three values line up exactly
// with the distinction causal inference is forced to draw:
//
//   • accidental  — a spurious correlation: two things co-occur, no dependence claimed.
//   • essential   — a genuine dependence: X actually holds Y in place.
//   • generative  — a mechanism: X produces Y through an articulated pathway.
//
// THE BOUNDARY THIS MODULE ENFORCES, and it is the whole point. From co-occurrence alone
// the three are OBSERVATIONALLY IDENTICAL — you cannot tell an accidental edge from an
// essential one by reading that two things appear together. What breaks the tie is either
// intervention data (a design, outside the text) or an articulated mechanism (a pathway,
// which the text CAN carry). So this module types each edge AS THE SOURCE PROPOSED IT —
// reading the stance off the source's own words — and it deliberately offers NO function
// that upgrades a stance. `proposeStance` reads once, from the witnessing passage, and
// freezes. There is no `upgradeStance`, no `promote`, no path from accidental to essential.
// Only a design can do that, and a design is not text. That absence is the tool's honesty.

// The stance vocabulary, ordered by the strength of dependence each CLAIMS (not proves).
export const STANCES = Object.freeze(['accidental', 'essential', 'generative']);

// ── The witness lexicons. Each entry is a marker the SOURCE uses; the stance is read
// off which marker the source reached for, never off what we wish the edge were. Forms
// are enumerated (not stemmed) so a match is a real sighting of that word, and matching
// stays deterministic and inspectable — the same discipline as the relation-type ledger.

// ESSENTIAL — a direct causal dependence asserted. The source says X holds Y in place.
export const ESSENTIAL_VERBS = Object.freeze(new Set([
  'cause', 'causes', 'caused', 'causing',
  'reduce', 'reduces', 'reduced', 'reducing',
  'increase', 'increases', 'increased', 'increasing',
  'lower', 'lowers', 'lowered', 'lowering',
  'raise', 'raises', 'raised', 'raising',
  'produce', 'produces', 'produced', 'producing',
  'lead', 'leads', 'led',
  'drive', 'drives', 'drove', 'driven',
  'prevent', 'prevents', 'prevented', 'preventing',
  'boost', 'boosts', 'boosted', 'boosting',
  'cut', 'cuts', 'cutting',
  'curb', 'curbs', 'curbed', 'curbing',
  'worsen', 'worsens', 'worsened',
  'improve', 'improves', 'improved', 'improving',
  'affect', 'affects', 'affected', 'affecting',
  'influence', 'influences', 'influenced', 'influencing',
  'trigger', 'triggers', 'triggered', 'triggering',
  'diminish', 'diminishes', 'diminished',
  'elevate', 'elevates', 'elevated',
  'inhibit', 'inhibits', 'inhibited',
  'suppress', 'suppresses', 'suppressed',
  'stimulate', 'stimulates', 'stimulated',
  'foster', 'fosters', 'fostered',
  'deter', 'deters', 'deterred',
  'decrease', 'decreases', 'decreased',
  'mitigate', 'mitigates', 'mitigated',
  'exacerbate', 'exacerbates', 'exacerbated',
  'alleviate', 'alleviates', 'alleviated',
  'harm', 'harms', 'harmed',
  'damage', 'damages', 'damaged',
  'kill', 'kills', 'killed',
  'cure', 'cures', 'cured',
  'destroy', 'destroys', 'destroyed',
  'weaken', 'weakens', 'weakened',
  'strengthen', 'strengthens', 'strengthened',
  'enhance', 'enhances', 'enhanced',
  'undermine', 'undermines', 'undermined',
  'accelerate', 'accelerates', 'accelerated',
  'hinder', 'hinders', 'hindered',
  'spur', 'spurs', 'spurred',
  'depress', 'depresses', 'depressed',
  'revitalize', 'revitalizes', 'revitalized', 'revitalise', 'revitalised',
  'displace', 'displaces', 'displaced',
  'determine', 'determines', 'determined',
  'shape', 'shapes', 'shaped',
  // the subordinator link the parser already types (because/since/so/therefore/as →
  // via:'cause' on an inter-proposition CON) reaches here as the literal 'cause'.
  'cause-link',
]));

// GENERATIVE — a mechanism/pathway articulated. The source doesn't just say X holds Y,
// it says HOW: through what intermediary, by what channel. A phrase-level cue, so it is
// read off the passage, not the verb alone. Multi-word cues are matched as substrings.
export const MECHANISM_CUES = Object.freeze([
  'through', 'via', 'by means of', 'by way of', 'mechanism', 'pathway',
  'channel', 'medi',            // mediate/mediates/mediated/mediating/mediator/mediation
  'operates through', 'works by', 'acts through', 'so that', 'which in turn',
  'thereby', 'in turn', 'by increasing', 'by reducing', 'by lowering', 'by raising',
  'the way', 'as a signal', 'signals', 'signalling', 'signaling',
]);

// ACCIDENTAL — mere co-occurrence, or an explicit denial of dependence, or a named
// confound. The source withholds the causal claim: association only. Verb forms plus
// multi-word cues (matched as substrings on the passage).
export const ASSOCIATION_VERBS = Object.freeze(new Set([
  'associate', 'associates', 'associated',
  'correlate', 'correlates', 'correlated',
  'coincide', 'coincides', 'coincided',
  'accompany', 'accompanies', 'accompanied',
]));
export const ASSOCIATION_CUES = Object.freeze([
  'associated with', 'association between', 'association with', 'correlated with',
  'correlation between', 'correlation with', 'linked to', 'link between',
  'co-occur', 'cooccur', 'coincides with', 'goes with', 'tends to accompany',
  'related to', 'relationship between', 'no causal', 'not cause', 'not causal',
  'spurious', 'confound', 'common cause', 'selection effect', 'selection bias',
  'reverse caus', 'correlation is not causation', 'does not mean',
]);

// NULL / no-effect cues — a source LOOKING and finding no effect. Distinct from silence
// (see nul.js: the three NULs must never collapse). These flip a claim's polarity to '−'.
export const NULL_CUES = Object.freeze([
  'no effect', 'no significant', 'not significant', 'found no', 'no association',
  'no relationship', 'no evidence', 'null result', 'null effect', 'no impact',
  'did not reduce', 'did not increase', 'did not affect', 'did not change',
  'no difference', 'no measurable', 'failed to',
]);

// Hedge cues — epistemic modality on the claim ("may", "might", "could", "suggests").
// A hedge does NOT change the stance (a hedged causal claim is still a causal claim);
// it rides ALONGSIDE as modality, so the reading can weight by how surely it was made.
export const HEDGE_CUES = Object.freeze([
  'may ', 'might ', 'could ', 'suggests', 'suggest ', 'appears to', 'seems to',
  'possibly', 'perhaps', 'potentially', 'is thought to', 'is believed to',
]);

const hasAny = (text, cues) => { const t = text.toLowerCase(); return cues.some((c) => t.includes(c)); };

// Read the stance the source PROPOSED, from the witnessing passage. Frozen and final:
// there is intentionally no path to strengthen it later. `verb` is the causal verb (or
// 'cause-link' for a subordinator link); `context` is the surrounding passage text used
// for the phrase-level mechanism/association cues.
//
//   generative  wins when a mechanism is articulated (a pathway is the only thing besides
//               a design that can license "essential", and the text CAN carry it).
//   accidental  when the marker is an association/denial cue — the source withheld cause.
//   essential   when a causal verb is used with no mechanism and no association hedge.
//
// The default, when nothing marks it, is null — HONEST: the source made no causal claim
// here, so no stance is invented (additive, exactly like an untyped relation verb).
export const proposeStance = (verb, context = '') => {
  const v = String(verb || '').toLowerCase();
  const isEssentialVerb = ESSENTIAL_VERBS.has(v);
  const isAssocVerb = ASSOCIATION_VERBS.has(v);
  const assocPhrase = hasAny(context, ASSOCIATION_CUES);
  const mechanism = hasAny(context, MECHANISM_CUES);

  // Association/denial dominates: if the source hedged to co-occurrence or explicitly
  // denied cause, that is what it proposed, even if a causal-sounding verb is nearby.
  if (isAssocVerb || assocPhrase) {
    return Object.freeze({ stance: 'accidental', warrant: isAssocVerb ? `assoc-verb:${v}` : 'assoc-cue' });
  }
  if (isEssentialVerb) {
    return mechanism
      ? Object.freeze({ stance: 'generative', warrant: `mechanism+${v}` })
      : Object.freeze({ stance: 'essential', warrant: `causal-verb:${v}` });
  }
  // A mechanism cue with no causal verb still proposes a generative reading (the passage
  // articulates a pathway), but only weakly — flagged so the caller can require a verb.
  if (mechanism) return Object.freeze({ stance: 'generative', warrant: 'mechanism-cue' });
  return Object.freeze({ stance: null, warrant: 'unmarked' });
};

// Read polarity off the passage: a null/no-effect cue, or a negation adjacent to the
// causal verb, means the source asserted the ABSENCE of the effect (a measured null),
// not the effect. '−' = null asserted; '+' = effect asserted.
export const readPolarity = (context = '') => (hasAny(context, NULL_CUES) ? '−' : '+');

// Read modality: 'epistemic' when the claim is hedged, else 'realis'. Rides alongside
// the stance; never changes it.
export const readModality = (context = '') => (hasAny(context, HEDGE_CUES) ? 'epistemic' : 'realis');

export const isCausalVerb = (v) => ESSENTIAL_VERBS.has(String(v || '').toLowerCase());
export const isAssociationVerb = (v) => ASSOCIATION_VERBS.has(String(v || '').toLowerCase());
