// EO — reader-app support (split from rooms/reader/app.js, 2026-07 compliance pass:
// "no god module — no file over ~250 lines", docs/architecture.md). Same holon.
// Small shared utilities of the reader app.
import { TITLE_WORDS } from '../../../perceiver/parse/index.js';
export const nowIso = () => new Date().toISOString();
export const nowMs = () => { try { return Date.now(); } catch { return 0; } };
// How far a reader web-search walks. 4.1 reached the net by a multi-hop curiosity walk (follow the
// surprise while it stays on topic), not a single fetch; this restores that depth. The budget is
// generous ON PURPOSE: the walk's own knobs (a low curiosity floor, a deep frontier, strayPatience)
// are tuned so multi-hop walks are the COMMON case, and the saliency leash — not this cap — is what
// ends a walk that has left the question. The cap only stops a runaway.
export const RESEARCH_HOPS = 8;
// Does the ask want a DEVELOPED, multi-paragraph piece — an essay, a report, a detailed
// write-up — rather than a pointed answer? 4.1 had a system-decided long-form route; 4.2 had
// dropped it, so EVERY reader turn was capped at the small per-task budgets (answer 384 tokens)
// and "write me an essay about dolphins" came back as two sentences. This restores a long-form
// lane: when the ask names a long-form artifact, the turn gets a much larger budget and the
// paragraph loop is allowed to develop the piece. Mirrors 4.1's _longformIntent keyword floor.
export const LONGFORM_RE = /\b(essays?|treatise|report|deep[\s-]?dive|comprehensive(?:ly)?|in[\s-]?depth|at\s+length|long[\s-]?form|thorough(?:ly)?|detailed|\d{3,}\s*words?|(?:write|compose|draft|create|produce|generate|give)\s+(?:me\s+|us\s+)?(?:a|an|the|some)\b[^.?!]{0,40}?\b(?:essay|report|overview|account|piece|article|guide|breakdown|story|analysis|write[-\s]?up|blog\s*post|review))\b/i;
export const wantsLongform = (q) => LONGFORM_RE.test(String(q || ''));
export const LONGFORM_MAX_TOKENS = 1600;
export const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const shaShort = (h) => String(h || '').replace(/^[^:]*:/, '').slice(0, 12);
// Honorifics whose trailing period admission drops when it joins them to a name ("Mr." → the
// label "Mr Dupree"). Lowercased once, from the admission's own list, so the reader's entity
// linker tolerates the same normalisation when matching the label back onto the surface text.
export const LINK_TITLES = new Set([...TITLE_WORDS].map((w) => w.toLowerCase()));
export const bytesOf = (text) => { try { return new TextEncoder().encode(text).length; } catch { return String(text).length; } };
export const esc = (s) => String(s ?? '');

