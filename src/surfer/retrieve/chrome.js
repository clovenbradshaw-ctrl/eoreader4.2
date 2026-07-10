// EO: DEF(Field → Lens, Dissecting) — reference-chrome filter
// isReferenceChrome — is this span REFERENCE / NAVIGATION apparatus rather than answer content?
//
// A reader extracts a source into sentences, but a web page is not all prose: its reference list,
// external-links section, archive/citation footers and bare section titles come through as
// "sentences" too. Handed to the talker as evidence they are NOISE — a small model weaves them into
// a baggy, part-invented answer — and as CITATION TARGETS they are worse than nothing: a claim bound
// to "CMS - Convention on the Conservation of Migratory Species of Wild Animals." (a bare nav title)
// or to a reference-list headline ("Dolphins save surfer from becoming shark's bait") points the
// reader at apparatus, not at a passage that witnesses the claim. Both dolphin-essay audits were
// padded with exactly this: archive lines, "↑ Wickert, Janaína …" author lists, quoted paper/news
// titles, "External links Definitions from Wiktionary …", and the CMS nav title that a fabricated
// answer then cited. Dropping it from the SHOWN excerpts leaves the reading thinner but HONEST —
// better one real passage than one real plus a title fragment the badge reads as grounding.
//
// Conservative by design: it fires only on high-confidence apparatus (markers, citation shapes, a
// whole-line quoted title, a verbless nav title). Real article prose — even short — carries a finite
// verb and no citation shape, so it rides through. Pure and embedder-free; the one lexical boundary.

// Citation apparatus — archive/retrieval footers, DOIs/ISBNs, "cite web|journal|…", page/volume refs,
// ".pdf". (Mirrors the reader's own _refLike so the engine and app agree on what a reference line is.)
const CITATION = /(archived from|retrieved\b|\bdoi:|\bisbn\b|wayback|\boriginal (on|pdf)|\bpp?\.\s*\d|\b\d+\s*pp\.|\bvol\.\s*\d|cite (web|journal|news|book)|\.pdf\b)/i;
// A line whose ONLY content is a quoted title — a reference/external-link entry, not prose.
const QUOTED_TITLE = /^["“][^"”]{0,220}["”][.\s]*$/;
// Section headers that introduce apparatus, not content.
const SECTION = /^(external links|further reading|see also|references|notes|bibliography|citations|retrieved from)\b/i;
// A trailing "(PDF)" / "(video …)" — a media-type tag on a reference.
const MEDIA_TAG = /\((?:pdf|video[^)]*)\)\.?\s*$/i;
// A "ACRONYM/Name – Descriptor" NAV TITLE (dash-joined) that states no relation — the CMS case. Only
// counts as chrome when the line carries no finite verb, so a real sentence with a dash rides through.
const NAV_TITLE = /^[A-Z][A-Za-z.&' ]{0,45}\s[–-]\s[A-Z]/;
const HAS_VERB  = /\b(is|are|was|were|has|have|had|can|will|would|which|that|when|who|because|since|after|before|during|include|features?)\b/i;

export const isReferenceChrome = (text) => {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t[0] === '↑' || t[0] === '^') return true;   // footnote / reference marker line
  if (CITATION.test(t)) return true;
  if (QUOTED_TITLE.test(t)) return true;
  if (SECTION.test(t)) return true;
  if (MEDIA_TAG.test(t)) return true;
  if (NAV_TITLE.test(t) && !HAS_VERB.test(t)) return true;
  return false;
};

// Drop reference/nav chrome from a list of spans (each { text, ... }). Never empties a NON-empty
// list to nothing on its own — if every span reads as chrome the whole set was apparatus and the
// caller's "thin/absent grounding" path is the honest outcome; this only removes the junk.
export const dropReferenceChrome = (spans = []) =>
  (spans || []).filter((s) => s && !isReferenceChrome(s.text ?? s));
