// EO: SIG·EVA(Link,Entity → Atmosphere, Tending,Binding) — the self line at the voice
// enactor/selfline.js — the honesty seam: the self/world line wired to the live turn.
//
// core/self defines the me as a closed loop and enactor/monitor draws the line — and
// until now neither ran: the gate cast efference copies nothing held, and createMonitor
// had no call site. This module is the wire. Each turn the voice COMMITS: the answer's
// propositions are cast as efference copies and held outstanding on the session's one
// monitor. Each turn the world RETURNS: the user's next words are sensed against the
// outstanding copies, and the line is drawn —
//
//   SELF           the user handed back what the voice itself said (an echo). Attenuated:
//                  one's own words returning carry no news, and — the point — they are
//                  never independent confirmation. You cannot tickle yourself; the voice
//                  cannot corroborate itself through the user's mouth.
//   SELF_MISMATCH  the user pushed back on a committed claim — same figures, diverged
//                  relation. The world interfering with an act: NEWS, and a correction
//                  the monitor holds for the record (the ledger writes it down).
//   WORLD          unbidden — the not-me, the ordinary case.
//
// One monitor, one self model, for every modality — the copies carry propositions, not
// organs (efference.js §4). The turn calls senseReturn BEFORE commit (the question
// arrives before the answer), so a question can only match copies from EARLIER turns:
// the line is causal, never a turn matching its own output.

import { parseProps } from './props.js';
import { efferenceCopiesOf } from './efference.js';
import { isSelf, SELF_MISMATCH } from '../core/self/index.js';

// How many outstanding commitments a session monitor keeps live. Beyond it the oldest
// are expired and reported (never silently dropped) — the never-returned productions.
export const OUTSTANDING_KEEP = 128;

// senseReturn — draw the self/world line over incoming text (the user's question)
// against the copies held from earlier turns. Returns the reading, or null when the
// text yields no propositions (no admission, pure chat) — the line simply isn't drawn.
// A bound answer carries [sN] citation tags; the line is drawn over the words, not the tags.
const untag = (text) => String(text || '').replace(/\[s\d+(?:,\s*s?\d+)*\]/g, ' ');

export const senseReturn = (monitor, { text, doc, cursor = Infinity } = {}) => {
  if (!monitor || !doc) return null;
  let props = [];
  try { props = parseProps(untag(text), doc, cursor); } catch { return null; }
  if (!props.length) return null;
  const before = monitor.corrections().length;
  const observed = props.map((p) => monitor.observe(p, { modality: 'text' }));
  const echoes = observed.filter((o) => isSelf(o.tag)).map((o) => surfaceOf(o.prop));
  const pushback = observed.filter((o) => o.tag === SELF_MISMATCH).map((o) => surfaceOf(o.prop));
  const corrections = monitor.corrections().slice(before);
  return Object.freeze({
    observed: observed.length,
    self: echoes.length,
    mismatched: pushback.length,
    world: observed.length - echoes.length - pushback.length,
    echoes, pushback, corrections,
  });
};

// commitVoice — cast the answer's propositions as efference copies and hold them
// outstanding: the voice's commitments, awaiting the world's return. Returns what was
// committed plus anything the bounded window expired (the never-returned productions).
export const commitVoice = (monitor, { text, doc, cursor = Infinity, keep = OUTSTANDING_KEEP } = {}) => {
  if (!monitor || !doc) return null;
  let props = [];
  try { props = parseProps(untag(text), doc, cursor); } catch { return null; }
  if (!props.length) return null;
  const startId = monitor.self.size + monitor.outstanding().length;
  monitor.hold(efferenceCopiesOf(props, { startId, modality: 'text' }));
  const expired = typeof monitor.expire === 'function' ? monitor.expire(keep) : [];
  return Object.freeze({
    committed: props.length,
    outstanding: monitor.outstanding().length,
    expired: expired.map((c) => surfaceOf(c.prop)),
  });
};

const surfaceOf = (p) => String(p?.surface || '').replace(/\s+/g, ' ').trim().slice(0, 160);
