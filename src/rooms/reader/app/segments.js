// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// answer/viewer segmentation (text | entity | cite)
import { projectGraph } from '../../../core/index.js';
import { LINK_TITLES } from './util.js';

export const installSegments = (appCtx) => {
  const { state } = appCtx;
  // ── answer/viewer segmentation (text | entity | cite) ─────────────────────
  // The entity lexicon for a doc set: admitted label → { docId, entId }, longest
  // labels first so "New York City" wins over "New York".
  const entityLexicon = (docs) => {
    const lex = [];
    for (const doc of docs) {
      if (!doc?.admission?.admitted) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      for (const [label, id] of doc.admission.admitted) {
        if (String(label).length < 3) continue;
        lex.push({ label: String(label), docId: doc.docId, entId: rep(id) });
      }
    }
    lex.sort((a, b) => b.label.length - a.label.length);
    return lex;
  };

  // Match a surface span back to its label period- and whitespace-insensitive, so the reverse
  // lookup survives the same normalisation the forward pattern tolerates. Hoisted here so the
  // compiled matcher and the linkifier share one definition of the key.
  const linkKey = (s) => String(s).replace(/\./g, '').replace(/\s+/g, ' ').trim();

  // Compile a lexicon into its reusable matcher: the longest-label-first alternation regex AND
  // the reverse label→entity lookups. This is a PURE function of `lex`, but the surface calls
  // linkifySegs ONCE PER PARAGRAPH with the SAME lex (readerLink / viewerParas / answerSegments
  // each close over one lex for the life of a render). Rebuilding a several-hundred-alternative
  // regex — and re-scanning `lex` with two Array.find per match — on every paragraph turned a
  // large PDF's book render into a multi-second main-thread freeze (a 330-page source split into
  // ~12,000 line-blocks rebuilt it ~12,000 times: ~8s, and the peak allocation crashed the tab).
  // So compile once and memoise on the lex identity (below); a fresh render builds a fresh lex,
  // so the WeakMap entry is dropped with it — no staleness, no leak.
  const compileLexicon = (lex) => {
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A label is matched as a run of its TOKENS, not as a literal string, because admission
    // NORMALISES what it admits: a leading title's trailing period is dropped and the title joined
    // to the name ("Mr. Dupree" → the label "Mr Dupree"), and interior whitespace is collapsed to
    // one space. A literal-string regex built from that label can no longer find the surface it was
    // read from — "Mr Dupree" never matches "Mr. Dupree" — so the honorific is stranded as loose
    // text and only the bare surname links, splitting one figure into two. Rejoin the tokens with
    // run-of-whitespace (which also lets a name broken across a line-wrap still link), and tolerate
    // the ONE period admission actually strips: the dot after a leading title. Scoping the optional
    // dot to that title alone — not to every gap — keeps "Chief Justice" from matching a stray
    // "…the Chief. Justice…" across a sentence end. Longest-label-first then carries the whole
    // "Mr. Dupree" into ONE span, winning over the bare "Dupree".
    const labelRe = (label) => {
      const toks = String(label).trim().split(/\s+/);
      return toks.map((t, i) => escRe(t) + (i === 0 && toks.length > 1 && LINK_TITLES.has(t.toLowerCase()) ? '\\.?' : '')).join('\\s+');
    };
    const re = new RegExp(`\\b(${lex.map((e) => labelRe(e.label)).join('|')})\\b`, 'gi');
    // The reverse lookups, first-match-wins to mirror the Array.find over the (longest-first) lex
    // this replaced: set-if-absent while iterating lex IN ORDER preserves exactly which entry
    // `find` returned, so the elected span is byte-identical to the per-match scan.
    const byExact = new Map(), byLower = new Map();
    for (const e of lex) {
      const k = linkKey(e.label);
      if (!byExact.has(k)) byExact.set(k, e);
      const kl = k.toLowerCase();
      if (!byLower.has(kl)) byLower.set(kl, e);
    }
    return { re, byExact, byLower };
  };
  const compiledLex = new WeakMap();
  const matcherFor = (lex) => {
    let m = compiledLex.get(lex);
    if (!m) { m = compileLexicon(lex); compiledLex.set(lex, m); }
    return m;
  };

  const linkifySegs = (text, lex) => {
    const segs = [];
    const rest = String(text);
    if (!lex.length) return rest ? [{ t: 'text', s: rest }] : [];
    // one pass, longest-label-first alternation; word-bounded, case-insensitive so EVERY
    // mention links — "the dolphin's sonar" reaches the same entity as "Dolphin" in a heading.
    const { re, byExact, byLower } = matcherFor(lex);
    re.lastIndex = 0;   // the matcher's regex is shared across paragraphs — reset before each scan
    let last = 0, mArr;
    while ((mArr = re.exec(rest)) !== null) {
      const matched = mArr[1];
      if (mArr.index > last) segs.push({ t: 'text', s: rest.slice(last, mArr.index) });
      // exact-case wins; else a case-insensitive hit, so a lowercase mention of a capitalised
      // figure ("dolphins" for the admitted "Dolphins") still renders as its entity — but the
      // relaxed match is only trusted for labels long enough that it can't grab a common word off
      // a short acronym ("who" for "WHO"), which falls back to plain text.
      const mk = linkKey(matched);
      const exact = byExact.get(mk);
      const hit = exact || byLower.get(mk.toLowerCase());
      if (hit && (exact || hit.label.length >= 4)) segs.push({ t: 'ent', s: matched, docId: hit.docId, entId: hit.entId });
      else segs.push({ t: 'text', s: matched });
      last = mArr.index + matched.length;
      if (mArr.index === re.lastIndex) re.lastIndex++;   // a reused /g regex must never spin on a zero-width hit
    }
    if (last < rest.length) segs.push({ t: 'text', s: rest.slice(last) });
    return segs;
  };

  // Answer text → paragraphs of segments; [sN] markers become cite chips. With cites off the
  // markers are still consumed (never rendered as raw [sN] text) but no chip seg is emitted.
  // With `sources` on, every prose seg carries the source that grounds it (gsn/greg): the run of
  // text since the last citation is grounded in the source that citation resolves to, and a run
  // with no trailing citation stays ungrounded (gsn null) — so the surface can disclose, span by
  // span, exactly what stands behind each stretch of the answer.
  const answerSegments = (msg, { entities = true, cites = true, sources = false } = {}) => {
    const lex = entities ? entityLexicon(appCtx.topicReferentDocs()) : [];
    const citeOf = new Map((msg.cites || []).map((c) => [c.idx, c]));
    const paras = [];
    for (const para of String(msg.text || '').split(/\n{2,}|\n(?=[-•*])/)) {
      if (!para.trim()) continue;
      const segs = [];
      let last = 0, runStart = 0;
      // back-fill the current run's grounding when its [sN] marker arrives (the claim precedes
      // its citation, so the source is only known once the marker is read)
      const ground = (sn, reg) => { for (let k = runStart; k < segs.length; k++) if (segs[k].t === 'text' || segs[k].t === 'ent') { segs[k].gsn = sn; segs[k].greg = reg; } };
      const re = /\[s(\d+)(?:,\s*s?\d+)*\]/g;
      let m2;
      while ((m2 = re.exec(para)) !== null) {
        if (m2.index > last) segs.push(...linkifySegs(para.slice(last, m2.index), lex));
        const resolved = (m2[0].match(/\d+/g) || []).map((n) => citeOf.get(Number(n))).filter(Boolean);
        if (sources && resolved[0]) ground(resolved[0].sn, resolved[0].reg);
        if (cites) for (const c of resolved) segs.push({ t: 'cite', idx: c.idx, sn: c.sn, reg: c.reg, title: c.title, quote: c.text });
        runStart = segs.length;
        last = m2.index + m2[0].length;
      }
      if (last < para.length) segs.push(...linkifySegs(para.slice(last), lex));
      if (segs.length) paras.push({ segs });
    }
    return paras;
  };

  // The document viewer — full text as paragraphs; cited sentences marked. (Still used by the
  // Facing page's left leaf; the standalone Document tab is now folded into the Reader.)
  const viewerParas = (snId, { entities = true } = {}) => {
    const src = appCtx.sourceBySn(snId);
    if (!src) return [];
    const refDoc = appCtx.referentDocFor(src);
    const lex = entities ? entityLexicon(refDoc ? [refDoc] : []) : [];
    const citedTexts = [];
    for (const t of state.topics) {
      for (const m of t.messages) {
        for (const c of m.cites || []) if (c.docId === src.docId && c.text) citedTexts.push(c.text.slice(0, 80));
      }
    }
    const paras = [];
    for (const para of String(src.text).split(/\n{2,}|\n/)) {
      if (!para.trim()) continue;
      const cited = citedTexts.some((ct) => ct.length > 20 && para.includes(ct.slice(0, Math.min(60, ct.length))));
      paras.push({ cited, segs: linkifySegs(para, lex) });
    }
    return paras;
  };

  // The Reader's link layer — the Document view merged INTO the themed book. reader-render reflows
  // and themes the source; this supplies the two things the book can't know on its own: which words
  // are entities (so it can underline them and open the entity panel on click) and which paragraphs
  // a citation grounds (so they pick up the gold rule). Both reuse the Document view's own machinery
  // over WHATEVER text reader-render hands back — the reflowed paragraph, not the raw newline split —
  // so a Gutenberg book links the same as a web page. Returns { linkify, isCited } for readerHtml's
  // opts.segsOf / opts.isCited; with `entities:false` no lexicon is built and nothing links.
  const readerLink = (snId, { entities = true } = {}) => {
    const src = appCtx.sourceBySn(snId);
    if (!src) return null;
    const refDoc = appCtx.referentDocFor(src);
    const lex = entities ? entityLexicon(refDoc ? [refDoc] : []) : [];
    const citedTexts = [];
    for (const t of state.topics) {
      for (const m of t.messages) {
        for (const c of m.cites || []) if (c.docId === src.docId && c.text) citedTexts.push(c.text.slice(0, 80));
      }
    }
    return {
      linkify: (text) => linkifySegs(String(text == null ? '' : text), lex),
      isCited: (text) => { const s = String(text == null ? '' : text); return citedTexts.some((ct) => ct.length > 20 && s.includes(ct.slice(0, Math.min(60, ct.length)))); },
    };
  };

  // The record's entity linker mapped onto a CLIP's TIMED word stream: which runs of words spell an
  // admitted figure, so the Listen surface's interactive transcript can underline them and open the
  // entity on click — linking exactly what the Reader/Native views link (same lexicon, same rules).
  // `words` is the projected transcript ([{ text, start, end }, …]); returns non-overlapping runs
  // [{ i0, i1, docId, entId }] over it (inclusive word indices). The linker runs on the text the
  // words spell, and each entity match is mapped back to the words its characters cover.
  const transcriptEntityRuns = (snId, words) => {
    if (!Array.isArray(words) || !words.length) return [];
    const src = appCtx.sourceBySn(snId);
    if (!src) return [];
    const refDoc = appCtx.referentDocFor(src);
    const lex = refDoc ? entityLexicon([refDoc]) : [];
    if (!lex.length) return [];
    // Spell the words into one string, remembering each word's [a,b) char span — the same single
    // space the transcript renders between words, so a match's char range lands on word boundaries.
    let text = ''; const span = [];
    for (let i = 0; i < words.length; i++) {
      if (i) text += ' ';
      const a = text.length;
      text += String(words[i] && words[i].text != null ? words[i].text : '');
      span.push([a, text.length]);
    }
    const segs = linkifySegs(text, lex);
    const runs = [];
    let pos = 0, wi = 0;                                  // char cursor, and a monotonically-advancing word cursor
    for (const sg of segs) {
      const a = pos, b = pos + (sg.s ? sg.s.length : 0);
      pos = b;
      if (sg.t !== 'ent') continue;
      let i0 = -1, i1 = -1;
      for (let i = wi; i < span.length; i++) {
        if (span[i][0] >= b) break;                       // this word starts after the match — done
        if (span[i][1] > a && span[i][0] < b) { if (i0 < 0) i0 = i; i1 = i; }
      }
      if (i0 >= 0) { runs.push({ i0, i1, docId: sg.docId, entId: sg.entId }); wi = i1 + 1; }
    }
    return runs;
  };

  Object.assign(appCtx, { answerSegments, entityLexicon, readerLink, transcriptEntityRuns, viewerParas });
};
