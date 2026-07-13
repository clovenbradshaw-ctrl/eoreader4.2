// EO: SIG·INS·EVA·DEF·NUL(Field,Void,Entity,Atmosphere → Void,Entity,Atmosphere,Field,Lens, Tending,Making,Binding,Dissecting,Clearing) — barrel
// murmur — the impressionistic background sense (spec §1). A continuously-running, near-zero-cost
// peripheral faculty that watches the same events the turn emits and produces IMPRESSIONS: cheap,
// pre-verbal hunches about where attention should go. It does not decide what is true; it decides
// where to look harder.
//
// The division of labour is absolute (spec §1): murmur POINTS ("this doesn't smell right" / "we've
// wandered"); the deterministic checkers and the enactor VERIFY. An impression is worthless as a
// fact and perfect as a flag. This barrel is the one entrance; createMurmur wires the sense →
// valence → (Born-rule) steer → narrate → audit spine, defaulting to AUDIT-ONLY (spec §13 phase 1).

import { murmurConfig } from './config.js';
import { senseSignal, createSessionTopic, meanVec } from './sense/index.js';
import { classify, dominant, createWorkingFeel } from './valence/index.js';
import { bornCollapse, buildSteer, steerBias } from './steer/index.js';
import { createNarrator, innerVoice } from './narrate/index.js';
import { createImpressionSink } from './audit/index.js';
import { createLearning } from './learn/index.js';
import { nominateFromFeel, connectionKey } from './link/index.js';
import { assertLogAppendAllowed, assertMembraneSafe, canCite } from './membrane.js';

export { murmurConfig, MURMUR } from './config.js';
export * from './sense/index.js';
export * from './valence/index.js';
export * from './steer/index.js';
export * from './narrate/index.js';
export * from './audit/index.js';
export * from './learn/index.js';
export * from './link/index.js';
export * from './membrane.js';

// createMurmur({ config, audit, narratorBackend, appendLog, rng, now })
//   audit:           optional rooms/audit log — impressions flush here as marginalia
//   narratorBackend: optional async (prompt,{maxTokens})=>string — the tiny LM (silent if absent)
//   appendLog:       optional (steerEvent)=>void — the ONE log-write seam; called only when the
//                    membrane permits (canAppendLog) AND a collapse fires. Absent/false membrane
//                    → murmur is audit-only (phases 1–2).
//   rng, now:        injectable for deterministic replay/tests.
export const createMurmur = ({
  config = murmurConfig(), audit = null, narratorBackend = null,
  appendLog = null, rng = Math.random, now = () => Date.now(),
} = {}) => {
  const cfg = config;
  const topic = createSessionTopic({
    decay: cfg.sense.topicDecay, shiftFloor: cfg.sense.topicShiftFloor,
    deicticMaxWords: cfg.sense.deicticMaxWords, historyTurns: cfg.sense.historyTurns,
  });
  const feel = createWorkingFeel({
    lambdaDecay: cfg.sense.lambdaDecay, ttlMs: cfg.sense.ttlMs,
    refractoryMs: cfg.narrator.refractoryMs, now,
  });
  const narrator = createNarrator({
    backend: narratorBackend, maxTokens: cfg.narrator.maxTokens,
    refractoryMs: cfg.narrator.refractoryMs, workingFeel: feel,
  });
  const sink = createImpressionSink({ audit });
  // The self-guided-learning notebook (learn/index.js) — the murmur's OWN reafferent record of what
  // it found interesting at rest. It POINTS the app at where to wander; the app advances it one
  // human-paced step at a time. Every note is canWitness===false (§8/§9) — never a citable fact.
  const learning = createLearning({ config: cfg.learn || {}, now });
  let voiceTick = 0;        // monotonic rotation for the inner voice's phrasing (deterministic, no clock/rng)
  const steerEvents = [];   // the session's own copy of appended steer events (append-only)
  const nominations = [];   // candidate connections awaiting the idle promotion gate (read side-channel)
  const nominatedKeys = new Set();   // dedup — one candidate per (from→to) locus pair (anti-rumination)

  // The live-feel broadcast (audit-only, spec §9.4): a surface may WATCH the peripheral sense
  // without ever touching the answer. `subscribe` returns an unsubscribe; `state()` is the last
  // observed snapshot so a late subscriber can paint immediately. This is a read side-channel —
  // it carries impressions/signal, never a citable fact, and cannot append to the log.
  const watchers = new Set();
  let lastState = null;
  const notifyWatchers = (s) => { for (const fn of watchers) { try { fn(s); } catch { /* a watcher must never cost a turn */ } } };

  // observe(rawSnapshot, { turn }) — the core entry. `rawSnapshot` carries the fold data for one
  // stop (see sense/geometry.js snapshotShape) PLUS `query`/`queryVec` for the anchor. Runs the
  // whole spine and returns { signal, registers, impressions, collapse, steer } for inspection.
  // Pure w.r.t. the answer: it can hold the stream / lower confidence / append a steer, never add
  // answer content (spec §9.4).
  const observe = async (rawSnapshot = {}, { turn = null } = {}) => {
    if (!cfg.enabled) return null;

    // 1. resolve the drift anchor and update the session topic BEFORE measuring — a user redirect
    //    re-anchors to the query so it never reads as drift; a deictic follow-up keeps the topic
    //    (spec §5, §9.6). The anchor is the SESSION TOPIC, not the raw live query.
    const readingCentroid = rawSnapshot.readingCentroid || meanVec(rawSnapshot.readingVecs);
    const topicNote = topic.resolve({ query: rawSnapshot.query, queryVec: rawSnapshot.queryVec });
    const priorCentroids = topic.priors();

    // 2. the pre-verbal geometric signal.
    const signal = senseSignal({ ...rawSnapshot, anchorVec: topicNote.anchor, readingCentroid, priorCentroids });

    // 3. registers + the working-feel ring (decay + anti-rumination live here). A `recognition`
    //    impression carries a `link` back to the earlier reading it echoes — the pointer the
    //    connective nominator reads (phase 4). It stays a kind:'impression' (audit-only, §9.1).
    const registers = classify(signal, cfg.triggers);
    const impressions = registers.map(r =>
      feel.raise({
        register: r.register, intensity: r.intensity, source: 'geometry',
        ref: signal.ref, vector: readingCentroid,
        link: (r.register === 'recognition' && signal.recognitionRef)
          ? { ref: signal.recognitionRef, sim: round3(signal.recognitionSim) } : null,
      }));

    // 4. the narrator — wakes only on a twitch past a trigger, refractory-gated, audit-only. Its
    //    phrase is for legibility; it NEVER enters the answer prompt (spec §9.3/§9.5). Recognition
    //    twitches too now (phase 4): a "we've seen this" mutter voices the connection it points at.
    let phrase = null;
    const top = dominant(signal, cfg.triggers);
    const twitched = top && (top.register === 'drift' || top.register === 'surprise'
      || top.register === 'unease' || top.register === 'recognition');
    if (twitched && narrator.available) {
      phrase = await narrator.mutter({ register: top.register, ref: signal.ref, passageText: rawSnapshot.passageText });
      if (phrase) for (const imp of impressions) if (imp.register === top.register) { imp.phrase = phrase; imp.source = 'narrator'; }
    }

    // 4b. NOMINATE connections (phase 4): a fresh recognition impression pointing back at an earlier
    //     locus becomes a CANDIDATE connection — reafferent, grounded:false, deduped per locus pair.
    //     It rides the READ side-channel (nominations()/subscribe), NEVER the log: murmur POINTS,
    //     the document (via the idle promotion gate) witnesses (spec §9 firewall / §8 type law).
    for (const c of nominateFromFeel(impressions, { from: signal.ref, now })) {
      const key = connectionKey(c);
      if (nominatedKeys.has(key)) continue;
      nominatedKeys.add(key);
      nominations.push(c);
    }

    // 5. the Born-rule collapse — commit iff sample(s·d) fires (spec §4a). Stochastic; the same
    //    nag cannot machine-gun the log.
    const collapse = bornCollapse({ surprise: signal.novelty, drift: signal.drift }, rng);
    let steer = null;
    if (collapse.commit) {
      steer = buildSteer({
        anchor: signal.anchor, awayFrom: signal.readingCentroid,
        amplitude: collapse.psi, phrase, ref: signal.ref, ttlMs: cfg.sense.ttlMs,
      }, now);
      sink.noteSteer(turn, steer);                     // audit legibility copy (always)
      // the ONE log write — only when the membrane permits (phases 1–2 keep it false).
      if (cfg.membrane.canAppendLog && typeof appendLog === 'function') {
        assertLogAppendAllowed(steer, cfg.membrane);   // firewall (spec §9.1)
        appendLog(steer);
        steerEvents.push(steer);
      }
    }

    // 6. flush the working feel to rooms/audit as marginalia (spec §10 turn-end; safe every stop).
    sink.flush(turn, feel.feel(), { drift: round3(signal.drift), concentration: round3(signal.concentration), novelty: round3(signal.novelty), geometric: signal.geometric });

    // 7. append this turn's reading centroid — WITH its locus (signal.ref) — to the novelty/
    //    recognition ring AFTER measuring, so the current reading is never compared against itself
    //    (spec §5) and a future recognition can name this event as the one it echoes (phase 4).
    topic.pushReading(readingCentroid, signal.ref);

    // 8. VOICE it (narrate/voice.js) — the geometry as first-person oppositions, model-free, so the
    //    strip reads like a mind muttering, not a gauge cluster (spec §6/§9.5: a voicing, never a
    //    fact, never in the answer prompt). Rides the same READ side-channel as `signal` (§9.4).
    const feltNow = feel.feel();
    const voice = innerVoice({ signal, impressions: feltNow, rotate: voiceTick++ });
    const snapshot = Object.freeze({ signal, registers, impressions: feltNow, voice, collapse, steer, topicNote, at: now() });
    lastState = snapshot;
    notifyWatchers(snapshot);
    return snapshot;
  };

  // mutter(m) — broadcast a LIVE at-rest thought to the watchers so the strip paints it as the
  // sense wanders (self-guided learning). This is a READ side-channel exactly like the fold-driven
  // broadcast (spec §9.4): it only sets lastState + notifies watchers. It NEVER appends to the log
  // and NEVER touches the answer prompt — canEditPrompt is pinned false by construction, and the
  // phrase here is voicing/legibility only, so nothing the app "learns" can become a citable fact.
  //   { phrase, register='curiosity', intensity=0.5, source='wander', learning }
  const mutter = ({ phrase = null, register = 'curiosity', intensity = 0.5, source = 'wander', learning: learnedNote = null } = {}) => {
    const imp = {
      register, source,
      decayedIntensity: Math.max(0, Math.min(1, intensity)),
      phrase: phrase ? String(phrase).slice(0, 240) : null,
      at: now(),
    };
    const base = lastState || {};
    const impressions = [imp, ...(feel.feel() || [])].slice(0, 6);
    // VOICE the wander (narrate/voice.js): its own phrase leads verbatim (the murmur's words),
    // then any live register trails as a second thought — prose oppositions, not gauges (§9.4).
    const voice = innerVoice({ signal: base.signal || null, impressions, mutter: imp, rotate: voiceTick++ });
    const snapshot = Object.freeze({
      signal: base.signal || null,          // keep the last signal (drift/footing/novelty) if any
      registers: base.registers || [],
      impressions,
      voice,
      collapse: null, steer: null,
      mutter: imp,
      learning: learnedNote,                // the note just minted (audit-only, canWitness===false)
      at: now(),
    });
    lastState = snapshot;
    notifyWatchers(snapshot);
    return snapshot;
  };

  // shouldHoldStream() — spec §10: hold the stream (pending the deterministic checkers) when a
  // live unease/drift impression exceeds the stream-hold threshold. Attention only (spec §9.4).
  const shouldHoldStream = () => {
    const held = feel.feel().find(i => (i.register === 'unease' || i.register === 'drift') && i.decayedIntensity >= cfg.triggers.streamHold);
    return held ? { hold: true, register: held.register, decayedIntensity: held.decayedIntensity } : { hold: false };
  };

  // confidenceModulation() — spec §7/§10: unease/drift LOWER the turn's confidence (the enactor
  // already consumes a confidence). Returns a multiplier in (0,1]; 1 = no change.
  const confidenceModulation = () => {
    const worst = feel.feel().find(i => i.register === 'unease' || i.register === 'drift');
    if (!worst) return 1;
    return Math.max(0.4, 1 - worst.decayedIntensity * 0.5);
  };

  // The projection's steer consumer (spec §10) — the ONE reader of appended steer events.
  const bias = () => steerBias(steerEvents, now());

  return {
    config: cfg,
    observe,
    mutter,
    learn: learning,          // the self-guided-learning notebook (wander/learn/outwardLead/notes)
    shouldHoldStream,
    confidenceModulation,
    bias,
    sink,
    // introspection for tests / audit surfaces
    feel: () => feel.feel(),
    steers: () => steerEvents.slice(),
    membraneOk: () => assertMembraneSafe(cfg),
    canCite,
    // the live-feel side-channel a surface watches (read-only; never a citable fact, spec §9.4)
    subscribe(fn) { if (typeof fn === 'function') { watchers.add(fn); return () => watchers.delete(fn); } return () => {}; },
    state: () => lastState,
    // The connective nominations queue (phase 4) — a READ side-channel exactly like state()
    // (spec §9.4). nominations() DRAINS it (returns + clears) so the idle promotion gate consumes
    // each candidate once; peekNominations() is a non-destructive read for tests/audit. Never a log
    // write (canAppendLog stays false); every candidate is reafferent (canGround === false).
    nominations() { const out = nominations.slice(); nominations.length = 0; return out; },
    peekNominations: () => nominations.slice(),
    resetSession() { topic.reset(); feel.clear(); steerEvents.length = 0; nominations.length = 0; nominatedKeys.clear(); learning.reset(); lastState = null; notifyWatchers(null); },
  };
};

const round3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
