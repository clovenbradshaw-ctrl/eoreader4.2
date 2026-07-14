// EO: SEG·DEF·EVA·REC(Field,Network,Lens → Field,Lens, Dissecting,Binding,Composing) — the dispatcher
// Parse a SURF of the graph into discrete quests for patterns (docs/tiny-model-form-surface.md,
// "the dispatcher decides where to look, not what's true"). This is the head of the synthesis
// pipeline: given a region already routed to, cut it into the parallel pattern-quests the folds
// will pursue. Crucially it is MODEL-FREE by default — the cut is graph algebra, and the number of
// quests FALLS OUT OF THE SPECTRUM (voidnull.DEF), never out of a model's choice.
//
// It runs the significance triad as a loop:
//
//   DEF  — discretize: propose the quests off the graph's own geometry (referents, bonds, the
//          born spectrum's readings). Pure, deterministic, replayable to the token.
//   EVA  — findable: evaluate whether that discretization is discrete ENOUGH to be found — do the
//          quests stand apart from the noise (deriveNull), and does the spectrum resolve (DEF)?
//   REC  — pull apart: ONLY when EVA says "not findable" and a model is present, run the local
//          model to restructure the frame the geometry couldn't cut. Its output is a SEARCH PLAN
//          (angle labels), re-grounded against referents actually in the surf — never a claim.
//
// The model is the EXCEPTION, not the hot path: a well-structured surf never touches it, and a
// thin surf with no model degrades to one honest coarse quest (abstained) rather than inventing
// discretization it cannot measure. Reaching for the model is exactly and only where the geometry
// is missing — which is the discipline the whole design turns on.

import { DEF as spectralReadings } from '../../core/voidnull.js';
import { speak } from '../../model/index.js';

// A quest: one discrete pattern-hunt handed to a downstream fold. Frozen; carries its seed (the
// referent / bond / reading it centres on), a salience (how strongly the surf argues for it), and
// provenance (which surf elements formed it, so the fan-out stays replayable and auditable).
const quest = ({ id, kind, seed, label = '', salience = 0, members = [], via = null, method = 'def' }) =>
  Object.freeze({ id, kind, seed, label, salience, members: Object.freeze([...members]), via, method });

// ── DEF — discretize the surf off its own geometry ───────────────────────────────────────────
// Three structural cuts, each already computed elsewhere in the tree:
//   · per-referent  — each named node is a pattern seed; salience = its incident bond mass.
//   · per-relation  — each significance bond-group (a co-occurrence / contradiction) is a seed.
//   · per-reading   — spectralReadings(spectrum).k readings the field's geography holds.
// `surf` is a plain region: { referents:[{id,label,weight?}], bonds:[{src,tgt,via,kind?,w?}],
// spectrum:[weights…] }. Every field optional; a missing field simply yields no quests of that
// kind. Pure — no model, no state, no clock.
export const discretize = (surf = {}) => {
  const referents = Array.isArray(surf.referents) ? surf.referents : [];
  const bonds = Array.isArray(surf.bonds) ? surf.bonds : [];
  const spectrum = Array.isArray(surf.spectrum) ? surf.spectrum.filter(Number.isFinite) : [];

  // incident bond mass per referent — the salience of a per-referent quest.
  const mass = new Map();
  for (const b of bonds) {
    const w = Number.isFinite(b.w) ? b.w : 0.5;
    if (b.src != null) mass.set(b.src, (mass.get(b.src) || 0) + w);
    if (b.tgt != null) mass.set(b.tgt, (mass.get(b.tgt) || 0) + w);
  }

  const quests = [];

  // per-referent quests
  for (const r of referents) {
    if (r?.id == null) continue;
    const s = Number.isFinite(r.weight) ? r.weight : (mass.get(r.id) || 0);
    quests.push(quest({ id: `q:ref:${r.id}`, kind: 'referent', seed: r.id, label: r.label ?? String(r.id), salience: s, members: [r.id] }));
  }

  // per-relation quests: group bonds by the (unordered pair, stemmed via) they connect, so the
  // recurring bond — the one the surf argues for — becomes one quest carrying its whole group.
  const byPair = new Map();
  for (const b of bonds) {
    if (b.src == null || b.tgt == null) continue;
    const pair = [b.src, b.tgt].map(String).sort().join('|');
    const key = `${pair}|${stem(b.via)}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(b);
  }
  for (const [key, group] of byPair) {
    const g0 = group[0];
    const s = group.reduce((a, b) => a + (Number.isFinite(b.w) ? b.w : 0.5), 0);
    quests.push(quest({
      id: `q:rel:${key}`, kind: 'relation', seed: [g0.src, g0.tgt], via: g0.via ?? null,
      label: `${g0.src} ${stem(g0.via)} ${g0.tgt}`, salience: s, members: [g0.src, g0.tgt],
    }));
  }

  // per-reading quests: the born spectrum's own geography says HOW MANY readings the surf holds.
  // A resolved spectrum (≥2, not abstained) emits that many reading-quests; a flat one emits none
  // (the referent/relation cuts carry it, or EVA sends it to REC).
  const readings = spectralReadings(spectrum, { alpha: 0.05 });
  if (!readings.abstain && readings.k >= 2) {
    for (let i = 0; i < readings.k; i++) {
      quests.push(quest({ id: `q:read:${i}`, kind: 'reading', seed: i, label: `reading ${i + 1}`, salience: spectrum[i] ?? 0 }));
    }
  }

  return { quests: Object.freeze(quests), readings };
};

// ── EVA — is the discretization discrete enough to be findable? ──────────────────────────────
// A surf is findable when it holds ≥2 distinguishable things AND there is real STRUCTURE among
// them to hunt: at least one bond (a relation quest — a discrete pattern between named things), or
// a born spectrum that RESOLVED into separate readings (spectralReadings, itself a void-null on the
// eigenvalue gaps — deliberately conservative, so it only fires on a spectrum with a real elbow).
// A bag of disconnected referents over a flat spectrum is an undifferentiated blur: ≥2 things, but
// nothing separating them — not findable, and that measured verdict is what sends it to REC. This
// is deliberately NOT a noise-floor test over the quest saliences: every quest here is genuine
// structure, not a chance background, so there is no null to beat — the structure IS the signal.
export const findable = ({ quests, readings }) => {
  const referents = quests.filter((q) => q.kind === 'referent').length;
  const relations = quests.filter((q) => q.kind === 'relation').length;
  const distinct = referents + relations;                        // the distinguishable things
  const resolvedSpectrum = !!(readings && !readings.abstain && readings.k >= 2);
  const structured = relations >= 1 || resolvedSpectrum;         // a bond to hunt, or resolved readings
  const ok = distinct >= 2 && structured;
  return Object.freeze({ ok, distinct, structured, relations, resolvedSpectrum });
};

// ── REC — pull the surf apart with the local model, when the geometry couldn't ───────────────
// Only reached when EVA fails. The model is asked for a SEARCH PLAN — the distinct threads it sees
// in the surf — never for a claim. Every proposed thread is re-grounded: it survives only if it
// binds to a referent or a bond-via actually present in the surf (a kernel check on the surf's own
// vocabulary), so a hallucinated angle has nothing to attach to and is dropped. This is REC: the
// frame the geometry could not cut, restructured — and then re-measured, not trusted.
const PULL_APART_SYSTEM =
  'You are given the named things in one region of a reading and the connections between them. ' +
  'List the DISTINCT threads a reader could follow through it — one short noun phrase per line, ' +
  'each naming things already listed. Do not add anything not present. Output only the lines.';

export const pullApart = async (surf = {}, { model = null, signal = null } = {}) => {
  const referents = (surf.referents || []).map((r) => r.label ?? String(r.id)).filter(Boolean);
  const bonds = (surf.bonds || []).map((b) => `${b.src} ${stem(b.via)} ${b.tgt}`);
  if (!model || (!referents.length && !bonds.length)) return [];

  const draft = await speak(model, [
    { role: 'system', content: PULL_APART_SYSTEM },
    { role: 'user', content: `Things: ${referents.join(', ')}\nConnections: ${bonds.join('; ')}` },
  ], { fallback: '', maxTokens: 120, ...(signal ? { signal } : {}) });

  // Ground every proposed thread against the surf's own vocabulary; drop the ungrounded.
  const vocab = groundVocab(surf);
  const out = [];
  for (const line of String(draft || '').split(/\n+/)) {
    const label = line.replace(/^[\s\-*\d.)]+/, '').trim();
    if (!label) continue;
    const hits = tokens(label).filter((t) => vocab.has(t));
    if (!hits.length) continue;                       // ungrounded angle — nothing in the surf to attach to
    // bind to the referent(s) it named, so the quest carries real seeds, not the model's words.
    const members = (surf.referents || []).filter((r) => tokens(r.label ?? String(r.id)).some((t) => hits.includes(t))).map((r) => r.id);
    out.push(quest({ id: `q:rec:${out.length}`, kind: 'reading', seed: members[0] ?? label, label, salience: hits.length, members, method: 'rec' }));
  }
  return out;
};

// ── the loop — DEF, then EVA, then REC only on failure ───────────────────────────────────────
// The dispatcher. Returns the quests plus the trace of how it got them: whether the geometry
// discretized the surf on its own (`method:'def'`), needed the model to pull it apart
// (`method:'rec'`), or could not be discretized at all and abstained to one coarse quest
// (`method:'abstain'` — a thin surf, honestly flagged, never fabricated). Model-optional.
export const dispatch = async (surf = {}, { model = null, signal = null } = {}) => {
  const def = discretize(surf);
  const eva = findable(def);
  if (eva.ok) {
    return Object.freeze({ quests: def.quests, findable: eva, method: 'def', readings: def.readings });
  }

  // EVA says the surf did not discretize enough to be findable — REC, with the model, if present.
  const rec = await pullApart(surf, { model, signal });
  if (rec.length >= 2) {
    const evaRec = findable({ quests: rec, readings: def.readings });
    return Object.freeze({ quests: Object.freeze(rec), findable: evaRec, method: 'rec', readings: def.readings });
  }

  // No model, or the model could not ground ≥2 threads: abstain to one coarse quest over the whole
  // surf. A thin surf is an honest one coarse quest, not invented ones (the void-abstain discipline).
  const coarse = coarseQuest(surf, def.quests);
  return Object.freeze({ quests: Object.freeze(coarse ? [coarse] : []), findable: eva, method: 'abstain', readings: def.readings });
};

// The whole surf as a single quest — the abstention floor when nothing discretizes it.
const coarseQuest = (surf, quests) => {
  const members = (surf.referents || []).map((r) => r.id).filter((x) => x != null);
  if (!members.length && !quests.length) return null;
  const label = members.length ? members.map((m) => labelFor(surf, m)).join(', ') : 'the surf';
  return quest({ id: 'q:coarse', kind: 'coarse', seed: members, label, salience: 0, members, method: 'abstain' });
};

// ── small local helpers ──────────────────────────────────────────────────────────────────────
const stem = (v) => String(v || '').toLowerCase().replace(/(ed|ing|s)$/,'').trim() || String(v || '').toLowerCase();
const tokens = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const labelFor = (surf, id) => ((surf.referents || []).find((r) => r.id === id)?.label) ?? String(id);
// The grounding vocabulary: every content token the surf itself carries (referent labels + bond
// vias). A REC thread must draw only on this, or it has invented something the surf never held.
const groundVocab = (surf) => {
  const v = new Set();
  for (const r of surf.referents || []) for (const t of tokens(r.label ?? String(r.id))) v.add(t);
  for (const b of surf.bonds || []) for (const t of tokens(b.via)) v.add(t);
  return v;
};
