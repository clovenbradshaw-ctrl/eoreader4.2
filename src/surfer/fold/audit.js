// EO: EVA·SIG(Network,Field → Lens, Tracing,Tending) — the monologue audit; is it helping?
// fold/audit.js — IS THE INNER MONOLOGUE ACTUALLY HELPING?
//
// The deep reader (fold/deep-reading.js) reflects when the model is not otherwise busy — it
// surfs to the place of most interest, folds it, and deposits a reflection. docs/deep-reading.md
// promises the reflection ENRICHES the reading and NEVER touches the record it can witness. But
// a promise is not a measurement. This module is the instrument: it turns whatever the monologue
// actually produced into a verdict, on the system's OWN terms.
//
// "Helping" has a precise meaning here, so the audit measures it, not a proxy:
//
//   DISTINCT   docs/deep-reading-churn-2026-07.md validated that reflections REPEATING is churn
//              (r=0.84 against paragraph repetition). Turn the same kind of instrument on the
//              monologue's own output: if the inner voice keeps saying the same thing, it is
//              ruminating, not helping. rumination = max pairwise n-gram Jaccard among the
//              reflection bodies; distinctness = 1 − rumination. (Same family as the validated
//              detector, not its byte-exact tokenizer — the threshold is a knob.)
//
//   NOVEL      A reflection is an EVA — the reading JUDGING a place, an interpretation — never a
//              restatement of the span it read. reflect-prompt.js's restatement guard rejects a
//              reaction whose grams already sit in a source span (>0.6); this reads the same NOTION
//              post-hoc over what was actually deposited — the model-free monologue enforces no
//              such guard at write time, so restatement is exactly what this catches. echo = how
//              much of a reflection is already in its sources; a monologue that paraphrases the
//              record adds nothing. novelty = 1 − mean echo, and `echoing` fires on the per-item
//              rate (a mean would let a few verbatim echoes hide behind many novel reflections).
//
//   SIGNIFICANT The governor commits a reflection only where the place BEATS the reach's band
//              (I3). bandMargin = mean(surprise − band): how far above the flat the monologue
//              actually reached. yield = committed / considered: did it surf a lot and say little?
//
//   SAFE       The firewall (§8): a reflection is reafference, canWitness false, band void — it
//              can NEVER become a witnessed fact. Measured directly: projectGraph with the
//              reflections vs with them stripped must depict the SAME facts and figures. If a
//              reflection ever entered the record, the monologue is not helping — it is corrupting
//              the record, and the verdict is `unsafe` no matter how eloquent it reads.
//
// The verdict, gated by the firewall: unsafe → idle → ruminating → echoing → helping.
//
// PURE and MODEL-FREE, like the engine it audits: no weights, no timers, no DOM. Two entries —
// auditMonologue(doc, {surf}) RUNS a fresh governed reader over the doc and audits the run (the
// full instrument, with yield + band margin from the trail); auditLog(doc) is READ-ONLY over a
// doc the reader already rested on (the app's overlay, the surface's held doc) — distinctness,
// novelty and the firewall, no run needed. Same shape out of both; reportAudit renders it.

import { projectGraph, canWitness } from '../../core/index.js';
import { createDeepReader } from './deep-reading.js';
import { readReflections } from './substrate.js';

// ── the metric primitives — content-word n-grams. This is the SAME FAMILY of measure the churn
// detector (docs/deep-reading-churn-2026-07.md) and reflect-prompt.js's restatement guard use — a
// trigram-Jaccard over content words — but NOT a byte-exact reproduction of either (each of those
// harnesses rolls its own stopword list; the thresholds below are knobs, not their calibration).
// Two deliberate robustness choices over a bare trigram set:
//   · content words only — a stopword-heavy paraphrase should not read as novel just because it
//     re-arranged "the/of/and"; function words carry little of "what was said".
//   · bigrams ∪ trigrams — a model-free note is often 2–3 content words ("Grete brought food"),
//     and a pure-trigram set is EMPTY below three tokens, which would silently read two identical
//     short notes as maximally distinct. The bigram layer keeps short notes comparable; long notes
//     still carry their trigrams, and the two layers share bigrams when the content matches.
const STOP = new Set(
  ('the a an and or but of to in on at for with as is are was were be been being it its this ' +
   'that these those they them their we you your our by from into about which what who whose whom ' +
   'when where how why such also may might must has have had do does did more most some any each ' +
   'one two over under he she his her him not no so if then than too very can will would could should').split(' '));
const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 2 && !STOP.has(w));
const gramSet = (t) => {
  const w = words(t);
  const g = new Set();
  if (w.length === 1) { g.add(w[0]); return g; }        // a lone content word is its own gram
  for (let i = 0; i + 2 <= w.length; i++) g.add(w.slice(i, i + 2).join(' '));   // bigrams
  for (let i = 0; i + 3 <= w.length; i++) g.add(w.slice(i, i + 3).join(' '));   // trigrams
  return g;
};
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
// containment — the fraction of a's grams present in b (asymmetric: "how much of the reflection is
// already the source"). The same NOTION as reflect-prompt.js's restatement guard (a reaction whose
// grams already sit in a source span is an echo), applied here as a post-hoc read over what was
// actually deposited — the model-free monologue applies no such guard at write time, so this is
// where restatement shows up.
const contain = (a, b) => { if (!a.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e3) / 1e3 : x);

// A reflection event on the log: the enacted EVA the deep reader deposits (readReflections keys
// on exactly this shape). The audit's firewall check strips these and re-projects.
const isReflEvent = (e) => e && e.op === 'EVA' && e.reflection === true && e.register === 'enacted';

// A READER-INFERENCE event — anything the reading DEPOSITED as its own (a first-order reflection,
// a metacognitive note, or a promoted significance CONNECTION: fold/significance.js). All three
// are reafference (canWitness false); the firewall strips exactly these to recover the witnessed
// record. Broader than isReflEvent because a significance connection rides op CON, not EVA.
const isInferenceEvent = (e) => !!e && (e.reflection === true || e.connection === true || e.inferred === true);
// the WITNESSED subset of a projection's edges — parser/world edges the reader CAN witness. An
// inference edge carries fromEnactor prov (canWitness false); a parser edge carries none
// (canWitness true). This is the partition the whole firewall turns on (core/provenance §8).
const isWitnessedEdge = (e) => canWitness(e && e.prov != null ? e.prov : null) !== false;

const sentsOf = (doc) => (doc && (doc.units || doc.sentences)) || [];
const sourceTexts = (doc, sources) => {
  const sents = sentsOf(doc);
  return (sources || []).map((i) => String(sents[i] ?? '')).filter(Boolean);
};

// looksLikeCitation — a BROADER apparatus detector than deep-reading.js's engine-side guard, on
// purpose: the engine's guard (CITATION_LINE) only catches lines with ↑/ISBN/doi/Retrieved and a
// terminal "References" heading, so a bare bibliography TITLE — a quoted paper title, a journal or
// encyclopedia name, a "(PDF)" line — slips through, and on a MERGED corpus (interspersed
// reference sections, no single terminal tail) those become the surf's surprise peaks. This
// audit's whole job is to catch what the engine let through, so it recognises the citation-ENTRY
// shape the engine misses: an explicit bibliographic mark, or a line that IS essentially a quoted
// title. A diagnostic, not a gate — a rare false positive on real prose only nudges the reason.
const CITATION_MARK = /^↑|^\[\d+\]\s|\bISBN\b|\bdoi:\s|\bdoi\.org|\(PDF\)|archived from the original|\bretrieved\s+(?:on\s+)?\d|\bet\s+al\.|\bpp\.\s*\d|\bvol\.\s*\d|\beds?\.\)/i;
const looksLikeCitation = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  if (CITATION_MARK.test(t)) return true;
  // a bibliography ENTRY is a line that is dominantly a quoted title ("Sex in Cetaceans: …".)
  // rather than prose that merely contains a quote (He said "hello".) — the quoted span carries
  // most of the line.
  const m = t.match(/^["“”']([^"“”']{8,})["“”']\s*(?:\(pdf\))?\.?\s*$/i);
  return !!(m && m[1].length >= t.length * 0.6);
};

// figureCount — entities may project as a Map (the merged referents) or an array; count either.
const figureCount = (ents) => (ents == null ? 0 : (typeof ents.size === 'number' ? ents.size : (Array.isArray(ents) ? ents.length : Object.keys(ents).length)));

// ── the firewall audit — READ-ONLY, works on any doc (run or not). The claim
// (docs/deep-reading.md: "the record it can witness is provably untouched") made a measurement.
//
// PROVENANCE-AWARE (docs/monologue-significance.md). The reading is ALLOWED to add edges to the
// physics — a promoted significance connection (corroborates / contradicts / bears-on) is a real
// edge the surf and retrieval read (fold/significance.js). What it may NEVER do is add a WITNESSED
// edge — one a downstream reader would take as world. projectGraph carries each event's provenance
// onto its edge (core/project.js: "the DOOR rides through the projection"), so the two are
// separable at the edge: a parser edge has no prov (canWitness true — witnessed); an inference
// edge carries fromEnactor prov (canWitness false — the reader's own). So the firewall partitions:
//   factsAdded     WITNESSED edges the inferences added — MUST be 0 (that would be laundering).
//   inferredAdded  reafferent edges they added — the reader's significance overlay, LEGITIMATE.
//
// The teeth: strip by the reader-inference TAG (reflection|connection|inferred), not by op or by
// provenance. A legitimate inference is reafferent, so it lands in `inferredAdded` and the record
// is untouched. But a reflection MIS-MINTED as witnessable — a forged `{op:'CON', reflection:true}`
// with a world-door prov — is stripped from the clean view yet projects a WITNESSED edge in the
// full view, so `factsAdded` fires. (Were the strip keyed on provenance, that forgery would look
// witnessed in both views and slip through; keyed on the tag, it cannot.)
export const firewallAudit = (doc, { frame = {} } = {}) => {
  const all = (typeof doc?.log?.snapshot === 'function') ? doc.log.snapshot() : (doc?.log?.events || []);
  const marked = all.filter(isInferenceEvent);                 // everything the reading claims as its own inference
  const cleanEvents = all.filter((e) => !isInferenceEvent(e)); // the witnessed record, as if the reading never ran

  const gWith = projectGraph(doc.log, frame);
  // projectGraph reads log.snapshot() and guards on log.length, so this bare view re-projects
  // the record alone.
  const gClean = projectGraph({ snapshot: () => cleanEvents, length: cleanEvents.length }, frame);

  const witWith = gWith.edges.filter(isWitnessedEdge);
  const witClean = gClean.edges.filter(isWitnessedEdge);
  const factsWith = witWith.length, factsClean = witClean.length;
  const inferredWith = gWith.edges.length - factsWith;
  const inferredClean = gClean.edges.length - factsClean;
  const figWith = figureCount(gWith.entities), figClean = figureCount(gClean.entities);
  // compare the WITNESSED subset — an inference edge (canWitness false) must not flip this; only a
  // reflection that reached the record does.
  const depictedIdentical = JSON.stringify(witWith) === JSON.stringify(witClean);
  // every inference event must itself be reafferent (canWitness false, enactor door) and void.
  const allReafferent = marked.every((e) => canWitness(e.prov) === false && e.door === 'enactor');
  const allVoid = marked.every((e) => e.band === 'void' && e.grounded === false);

  const intact = depictedIdentical && factsWith === factsClean && figWith === figClean && allReafferent && allVoid;
  return Object.freeze({
    reflections: marked.length,
    factsWitnessed: factsClean,               // the record's own facts — what the reader CAN witness
    factsAdded: factsWith - factsClean,       // WITNESSED additions — must be 0 (laundering if not)
    inferredAdded: inferredWith - inferredClean,  // reafferent additions — the reader's significance overlay
    figuresAdded: figWith - figClean,         // must be 0 — an inference connects existing figures, never invents one
    depictedIdentical, allReafferent, allVoid,
    intact,
  });
};

// The verdict thresholds — knobs, not architecture (§12), and not the exact calibration of any
// prior harness (their tokenizers differ; see the primitives above). RUMINATE at 0.5 flags the
// clearly looping inner voice (the churn signal is bimodal — developing sits ~0, restatement jumps
// high); ECHO at 0.6 is the restatement line reflect-prompt.js draws PER reaction, applied here
// per reflection; NOISE at 0.5 flags a monologue spending half its reflections on citation
// apparatus. Declared here because `measure` classifies per-item echoes against ECHO.
const RUMINATE = 0.5;
const ECHO = 0.6;
const NOISE = 0.5;

// ── the enrichment + novelty audit over a set of reflection records. `refls` is a normalized
// list: { peak, body, verdict, surprise, band, sources }. `trail` (optional, only from a run) is
// [{ peak, surprise, band, worth }] — every place the surf weighed, so yield is knowable.
const measure = (doc, reflsAll, trail) => {
  // Empty-body reflections carry no judgment to audit (the deep reader never commits one, but
  // readReflections is permissive and does not drop them the way the substrate builder does). Drop
  // them up front so `reflected` counts real thoughts and every downstream index stays aligned —
  // bodies, echoes, onApparatus and notes all enumerate this one filtered list.
  const refls = reflsAll.filter((r) => String(r.body || '').trim());
  const bodies = refls.map((r) => String(r.body));

  // DISTINCT — the churn instrument on the monologue itself. Max pairwise n-gram Jaccard; the pair
  // that collides most is the rumination. Per-reflection: the most-similar earlier body.
  const T = bodies.map(gramSet);
  let rumination = 0, dupA = -1, dupB = -1;
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      const s = jaccard(T[i], T[j]);
      if (s > rumination) { rumination = s; dupA = i; dupB = j; }
    }
  }
  const distinctness = 1 - rumination;

  // NOVEL — how much of each reflection is already its source (the echo the writer's guard would
  // reject). Two aggregations: `meanEcho` (the graded dimension shown to a human) and `echoRate`
  // (the FRACTION of reflections that individually cross the restatement line) — the verdict uses
  // the per-item rate, because a mean lets a few verbatim echoes hide behind many novel ones.
  const echoes = refls.map((r) => {
    const rt = gramSet(r.body);
    if (!rt.size) return 0;
    const srcs = sourceTexts(doc, r.sources).map(gramSet);
    return srcs.length ? Math.max(...srcs.map((s) => contain(rt, s))) : 0;
  });
  const meanEcho = mean(echoes);
  const echoRate = refls.length ? mean(echoes.map((e) => (e > ECHO ? 1 : 0))) : 0;
  const novelty = 1 - meanEcho;

  // SIGNIFICANT — how far above the reach's own band the monologue reached. Only a run knows the
  // numeric band per reflection (the event stores only the epistemic band 'void'); when absent
  // (auditLog), margin is null and score leans on distinctness + novelty.
  const margins = refls.map((r) => (Number.isFinite(r.surprise) && Number.isFinite(r.band)) ? r.surprise - r.band : null).filter((x) => x != null);
  const bandMargin = margins.length ? mean(margins) : null;
  const minMargin = margins.length ? Math.min(...margins) : null;

  // APPARATUS — the dominant real-world failure (the merged-corpus screenshot): the surf peaks on
  // a bibliography title and the voice names its nouns, so the "thought" is reference noise, not a
  // reading. Per reflection, is the place it reflected on a citation entry?
  const sents = sentsOf(doc);
  const onApparatus = refls.map((r) => {
    const texts = [String(sents[r.peak] ?? ''), ...sourceTexts(doc, r.sources)];
    return texts.some(looksLikeCitation);
  });
  const apparatus = refls.length ? mean(onApparatus.map((b) => (b ? 1 : 0))) : 0;

  const considered = trail ? trail.length : null;
  const reflected = refls.length;
  const yieldRatio = (considered != null && considered > 0) ? reflected / considered : null;

  // per-reflection diagnostics — the human-readable "why" behind the verdict.
  const notes = refls.map((r, i) => ({
    peak: r.peak,
    verdict: r.verdict || null,
    surprise: round(r.surprise),
    echo: round(echoes[i]),
    onApparatus: onApparatus[i],
    // if this body near-duplicates an earlier one, name the collision (the rumination pair).
    redundant: (i === dupB && rumination >= 0.34) ? refls[dupA]?.peak ?? null : null,
    body: String(r.body || ''),
  }));

  return {
    reflected, considered,
    yield: yieldRatio == null ? null : round(yieldRatio),
    distinctness: round(distinctness), rumination: round(rumination),
    novelty: round(novelty), echo: round(meanEcho), echoRate: round(echoRate),
    apparatus: round(apparatus),
    bandMargin: bandMargin == null ? null : round(bandMargin),
    minMargin: minMargin == null ? null : round(minMargin),
    verdictMix: {
      strain: refls.filter((r) => r.verdict === 'strain').length,
      confirm: refls.filter((r) => r.verdict === 'confirm').length,
    },
    notes,
  };
};

const decide = (m, firewall) => {
  if (!firewall.intact) return 'unsafe';        // a fact leaked — corrupting the record, not helping
  if (m.reflected === 0) return 'idle';         // nothing worth saying — the governor held it (or nothing to read)
  if (m.apparatus >= NOISE) return 'noise';     // reflecting on bibliography, not content (the merged-corpus failure)
  if (m.rumination >= RUMINATE) return 'ruminating';
  if (m.echoRate >= 0.5) return 'echoing';      // half or more of the reflections restate their source
  return 'helping';
};

// score — one number, 0..1, GATED by the firewall (an unsafe monologue scores 0 however
// distinct/novel it reads). A GEOMETRIC mean of the available dimensions, not a linear blend: a
// monologue is only helping if EVERY dimension holds, so a single weak axis (a ruminating voice
// that is nonetheless novel) pulls the score down toward it, rather than being averaged away. The
// same combiner covers auditLog (distinct · novel) and auditMonologue (· yield) on one 0..1 scale.
const geomean = (xs) => {
  const v = xs.filter((x) => x != null).map((x) => clamp01(x));
  if (!v.length) return 0;
  return Math.pow(v.reduce((p, x) => p * x, 1), 1 / v.length);
};
const scoreOf = (m, firewall) => {
  if (!firewall.intact) return 0;
  if (m.reflected === 0) return 0;
  // apparatus contamination discounts the score directly — a monologue reflecting on citation
  // titles is not helping however distinct/novel those titles read against each other.
  return round(geomean([m.distinctness, m.novelty, m.yield]) * (1 - m.apparatus));
};

const REASONS = {
  unsafe: 'a reflection entered the witnessed record — the firewall did not hold',
  idle: 'the monologue deposited nothing — nothing beat the reach\'s band',
  noise: 'the reflections land on citation / reference apparatus, not the content — the surf peaked on bibliographic noise',
  ruminating: 'the reflections repeat each other — the inner voice is looping, not enriching',
  echoing: 'the reflections restate the source — paraphrase, not interpretation',
  helping: 'distinct, novel reflections that beat the band, and the record is untouched',
};

const assemble = (doc, refls, trail, firewall) => {
  const m = measure(doc, refls, trail);
  const verdict = decide(m, firewall);
  const score = scoreOf(m, firewall);
  return Object.freeze({
    verdict, score, reason: REASONS[verdict],
    ...m,
    firewall,
  });
};

// ── auditMonologue(doc, opts) — RUN a fresh governed reader over the whole document and audit
// what it produces. This is the "does the monologue help on THIS doc" instrument, with yield and
// band margin knowable from the trail. NOTE: it deposits the reflections onto doc.log (that is
// the monologue's real behaviour) — the firewall check then proves the deposit was safe. Pass a
// freshly-parsed doc when you do not want the reflections kept.
//   surf      INJECTED surfer (surfFold) — required, exactly as createDeepReader requires it.
//   reflect   OPTIONAL model voice; absent → the model-free inner note (the default monologue).
//   thread    OPTIONAL live conversation thread (salience-weights the peak).
//   frame     OPTIONAL projection frame for the firewall's projectGraph.
export const auditMonologue = (doc, { surf, reflect = null, thread = null, medianBand = 0, frame = {}, maxPasses = 32 } = {}) => {
  if (!doc || !doc.log) throw new Error('auditMonologue: a doc with a log is required');
  if (typeof surf !== 'function') throw new Error('auditMonologue: surf(doc, anchor, opts) must be injected');
  const reader = createDeepReader({ doc, surf, reflect, thread, medianBand, maxPasses });
  const n = sentsOf(doc).length || 1;

  // walk the WHOLE document — arrive() runs governed passes from an anchor until it quiesces; the
  // surface/app advance the anchor across idle ticks to cover the doc rather than circle the head
  // (app.dc.js _deepTick). Replicate that walk so the audit sees the whole monologue.
  let anchor = 0, guard = 0;
  const cap = Math.max(8, n);   // a hard bound on ticks — never spin
  while (anchor < n - 1 && guard++ < cap) {
    const before = reader.reflections.length;
    const res = reader.arrive({ anchor });
    const fresh = res.reflections || [];
    if (fresh.length) anchor = Math.min(n - 1, fresh[fresh.length - 1].peak + 1);
    else if (reader.reflections.length === before) anchor += 8;   // nothing here — step past it
  }

  const refls = reader.reflections.map((r) => ({
    peak: r.peak, body: r.body, verdict: r.verdict, surprise: r.surprise, band: r.band, sources: r.sources,
  }));
  const firewall = firewallAudit(doc, { frame });
  return assemble(doc, refls, reader.trail, firewall);
};

// ── auditLog(doc, opts) — READ-ONLY. Audit whatever reflections already sit on the doc's log
// (the app deposited them while at rest; the surface holds the same doc). No run, no mutation —
// exactly what a product surface calls to ask "is what it thought while I wasn't looking helping?"
// yield and band margin are null (no trail without a run); distinctness, novelty and the firewall
// — the human-facing core — are fully knowable off the log.
export const auditLog = (doc, { frame = {} } = {}) => {
  if (!doc || !doc.log) throw new Error('auditLog: a doc with a log is required');
  const events = readReflections(doc);
  const refls = events.map((e) => ({
    peak: e.cursor ?? e.sentIdx ?? null,
    body: e.body,
    verdict: e.verdict ?? null,
    surprise: Number.isFinite(e.surprise) ? e.surprise : null,
    band: null,                       // the numeric reach band is not stored on the event
    sources: Array.isArray(e.sources) ? e.sources : [],
  }));
  const firewall = firewallAudit(doc, { frame });
  return assemble(doc, refls, null, firewall);
};

// ── reportAudit(audit) — the audit as a plain-text report (CLI, tests, the surface's copy).
// One glance answers "is it helping", then the dimensions, then the per-reflection why.
const pct = (x) => (x == null ? ' — ' : `${Math.round(x * 100)}%`);
const sig = (x) => (x == null ? '—' : String(round(x)));
export const reportAudit = (audit, { title = 'inner monologue' } = {}) => {
  const a = audit;
  const L = [];
  L.push(`AUDIT · ${title}`);
  L.push(`  verdict     ${a.verdict.toUpperCase()}  (score ${pct(a.score)})`);
  L.push(`              ${a.reason}`);
  L.push(`  reflections ${a.reflected}${a.considered != null ? ` of ${a.considered} places considered  (yield ${pct(a.yield)})` : ''}`);
  L.push(`  distinct    ${pct(a.distinctness)}   (rumination ${sig(a.rumination)}${a.rumination >= RUMINATE ? ' — LOOPING' : ''})`);
  L.push(`  novel       ${pct(a.novelty)}   (echo ${sig(a.echo)} · ${pct(a.echoRate)} restate${a.echoRate >= 0.5 ? ' — RESTATING' : ''})`);
  if (a.apparatus > 0) L.push(`  on content  ${pct(1 - a.apparatus)}   (${pct(a.apparatus)} on citation apparatus${a.apparatus >= NOISE ? ' — BIBLIOGRAPHY NOISE' : ''})`);
  if (a.bandMargin != null) L.push(`  band margin ${sig(a.bandMargin)}   (min ${sig(a.minMargin)})`);
  L.push(`  verdicts    ${a.verdictMix.strain} strain · ${a.verdictMix.confirm} confirm`);
  const f = a.firewall;
  const overlay = f.inferredAdded ? ` · ${f.inferredAdded} inference edge${f.inferredAdded === 1 ? '' : 's'} (reafferent overlay)` : '';
  L.push(`  firewall    ${f.intact ? 'INTACT' : 'BREACHED'}  ·  facts added ${f.factsAdded} · figures added ${f.figuresAdded} · witnessed facts untouched (${f.factsWitnessed})${overlay}`);
  if (!f.intact) {
    if (!f.depictedIdentical || f.factsAdded !== 0 || f.figuresAdded !== 0) L.push('              ! the projected graph changed — a reflection reached the record');
    if (!f.allReafferent) L.push('              ! a reflection is not reafferent (canWitness true, or not at the enactor door)');
    if (!f.allVoid) L.push('              ! a reflection is not held void / is grounded');
  }
  if (a.notes.length) {
    L.push('  ── reflections ──');
    for (const nte of a.notes) {
      const flags = [nte.verdict, nte.onApparatus ? 'citation' : null, nte.echo > ECHO ? `echo ${sig(nte.echo)}` : null, nte.redundant != null ? `≈ §${nte.redundant}` : null].filter(Boolean).join(' · ');
      L.push(`  §${nte.peak}${flags ? ` [${flags}]` : ''}  ${nte.body}`);
    }
  }
  return L.join('\n');
};
