// EO: SEG·INS(Network → Entity, Dissecting,Making) — cross-source entity merge, surname-aware
// mergeEntitiesByReferent — collapse per-source entity instances into cross-source rows WITHOUT
// conflating distinct people who merely share a surname.
//
// The topic explorer folds "the eight Iran rows" (one per source that names it) into a single row
// so the panel is about entities, not entity-in-one-source. The fold is by NORMALISED LABEL, and
// for a FULL identity that is exactly right — one Iran, spelled the same everywhere. For a bare
// SURNAME it is wrong: "Armstrong" names Neil, Louis and Gerry Armstrong at once. A bare surname
// stands as its OWN node whenever a source names two people who share it — the within-document
// surname merge is correctly DEFEATED (perceiver/parse/pipeline.js: "distinct-agent-shares-surname"),
// so the Neil Armstrong article (which also names his wife Janet Armstrong) keeps a standalone
// "Armstrong" node, and the Louis Armstrong article (Lucille Armstrong) keeps its own. Merging by
// label then unions those standalone "Armstrong" nodes across unrelated sources into ONE entity —
// the bug the panel showed: a read about Neil Armstrong whose "Armstrong" entity is settled on
// Louis Armstrong and carries his chapters (What a Wonderful World, the Star of David…).
//
// This merge keeps the label-fold for every full identity and for every single-token name that is
// NOT a contested surname (Iran, Europe, Apollo — byte-identical to the old behaviour), and only
// special-cases a CONTESTED surname: a single token that is the last token of ≥2 DISTINCT full names
// somewhere in the corpus. For those,
//   · a bare surname is FOLDED into the same-source full-name bearer that DOMINATES it (by mentions)
//     — "Armstrong" in the Neil article joins "Neil Armstrong", in the Louis article "Louis
//     Armstrong", so the two never cross;
//   · a bare surname with NO full-name bearer in its own source is keyed to THAT source alone, so it
//     can never conflate with another source's namesake (a small honest one-source "Armstrong" row,
//     never a merged one);
//   · the merged row OPENS on the full-name node — its label, and so its Wikipedia referent, resolve
//     the right person — while its mention/link counts still aggregate the surname's reach.
//
// Pure over the per-source rows (each { label, mentions, links, sn, docId, entId, key, kind, level }).
// Same input → same output; no clock, no Map-order dependence leaks into a tie (every max is the
// first-seen on a tie, and the rows arrive in a deterministic reading order).

const DEFAULT_KEY = (label) => String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');

// A crude singular↔plural fold so "Armstrong"/"Armstrongs" (the family, "the Armstrongs") compare
// equal — the same stem the sense-disambiguation prior uses (turn/disambiguate.js).
const stem = (w) => String(w || '').toLowerCase().replace(/(?:es|s)$/, '');
const tokensOf = (label) => String(label || '').trim().split(/\s+/).filter(Boolean);
const isMulti = (label) => tokensOf(label).length >= 2;
// The surname a name is filed under — its last token, stemmed. For "Neil Armstrong" it is
// "armstrong"; for a bare "Armstrong" it is the token itself.
const surnameOf = (label) => { const t = tokensOf(label); return t.length ? stem(t[t.length - 1]) : ''; };

// The separator that keeps a per-source stray key from ever colliding with a real label key.
const SEP = '␟';

export const mergeEntitiesByReferent = (rows, { entityKey = DEFAULT_KEY } = {}) => {
  const all = Array.isArray(rows) ? rows : [];

  // ── which single tokens are CONTESTED surnames ──────────────────────────────
  // A surname is contested when ≥2 DISTINCT full names across the corpus end in it — "Armstrong"
  // (Neil / Louis / Gerry), never "Iran" (only "Islamic Republic of Iran" ends in it, one referent,
  // so bare "Iran" stays a normal cross-source merge).
  const fullNamesBySurname = new Map();   // surnameStem → Set<normalized full label>
  const bearersByDocSurname = new Map();  // `${docId}${SEP}${surnameStem}` → row[] (same-source full bearers)
  for (const it of all) {
    if (!isMulti(it.label)) continue;
    const s = surnameOf(it.label);
    if (!s) continue;
    let set = fullNamesBySurname.get(s);
    if (!set) fullNamesBySurname.set(s, set = new Set());
    set.add(entityKey(it.label));
    const bk = `${it.docId}${SEP}${s}`;
    const arr = bearersByDocSurname.get(bk);
    if (arr) arr.push(it); else bearersByDocSurname.set(bk, [it]);
  }
  const isContested = (surnameStem) => (fullNamesBySurname.get(surnameStem)?.size || 0) >= 2;

  // The merge key + display label a row folds under, and whether the row is a genuine full-name node.
  const routeOf = (it) => {
    if (isMulti(it.label)) return { key: entityKey(it.label), label: it.label, origFull: true };
    const s = surnameOf(it.label);
    if (!s || !isContested(s)) return { key: entityKey(it.label), label: it.label, origFull: false };
    // A contested bare surname folds into the EARLIEST-introduced same-source bearer of that surname.
    // Introduction order, not mention or link count, is what names the subject: a page leads with the
    // figure it is about (rows arrive in admission order), and that figure's full name often appears
    // just once — in the lead — while a relative the lead also names ("married Janet Armstrong") can
    // carry more edges. So "Armstrong" in the Neil Armstrong article lands on Neil, the first bearer,
    // never on the wife. `bearersByDocSurname` preserves that order, so the first entry is the subject.
    const cands = bearersByDocSurname.get(`${it.docId}${SEP}${s}`);
    if (cands && cands.length) {
      const dom = cands[0];
      return { key: entityKey(dom.label), label: dom.label, origFull: false };
    }
    // No same-source bearer — key to this source alone so it never conflates across sources.
    return { key: `${entityKey(it.label)}${SEP}${it.docId}`, label: it.label, origFull: false };
  };

  const groups = new Map();
  for (const it of all) {
    const r = routeOf(it);
    let grp = groups.get(r.key);
    if (!grp) { grp = { lead: it, fullLead: null, label: r.label, labelFull: false, labelAt: -1, mentions: 0, links: 0, sns: new Set(), instances: [] }; groups.set(r.key, grp); }
    grp.mentions += (it.mentions || 0);
    grp.links += (it.links || 0);
    grp.sns.add(it.sn);
    grp.instances.push({ docId: it.docId, entId: it.entId, sn: it.sn });
    // The overall lead (richest node) orders the panel; the FULL lead is what the row opens on, so a
    // folded surname lands on the correctly-named person (and its wiki referent resolves that person).
    if ((it.mentions || 0) > (grp.lead.mentions || 0)) grp.lead = it;
    if (r.origFull && (!grp.fullLead || (it.mentions || 0) > (grp.fullLead.mentions || 0))) grp.fullLead = it;
    // Display label: a genuine full name wins over a bare token; among full names, the busiest.
    const cand = r.origFull ? (it.mentions || 0) : -1;
    if ((r.origFull && !grp.labelFull) || (r.origFull === grp.labelFull && cand > grp.labelAt)) {
      grp.label = r.label; grp.labelFull = r.origFull; grp.labelAt = cand;
    }
  }

  const merged = [...groups.values()].map((grp) => {
    const open = grp.fullLead || grp.lead;   // open on the full-name node when the group has one
    return {
      key: open.key, entId: open.entId, docId: open.docId, sn: open.sn,
      label: grp.label, mentions: grp.mentions, links: grp.links,
      sourceCount: grp.sns.size, instances: grp.instances,
      kind: open.kind, level: open.level,
    };
  });
  merged.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
  return merged;
};
