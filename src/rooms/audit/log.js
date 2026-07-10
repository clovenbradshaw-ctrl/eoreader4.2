// EO: INS·NUL(Void,Entity → Entity, Making,Tending) — per-turn audit trail (ring)
// Ring buffer of turns. Each turn is a structured trail of one user message
// through the pipeline. Subscribers see updates live; export is JSONL.
//
// The audit is the optimization surface. Tune against the trail, not the
// symptoms.

import { SCHEMA_VERSION } from './schema.js';

let nextTurnId = 1;

export const createAuditLog = ({ capacity = 300 } = {}) => {
  const turns = [];
  const subscribers = new Set();

  const notify = (t) => {
    for (const fn of subscribers) {
      try { fn(t); } catch { /* best-effort */ }
    }
  };

  const turn = (question) => {
    const t = {
      schema: SCHEMA_VERSION,
      id: `t${nextTurnId++}`,
      question,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      route: null,
      grounding: null,   // the register the user selected: 'auto' | 'grounded' | 'free'
      steps: [],
      reading: null,     // the MECHANICAL reading the surfer/retrieval delivered to the phraser:
                         // the spans (idx + text + via + score), the surfer's per-cursor field
                         // (bayes/surprise, peak, stops), and the fold's assembled note. The full
                         // "what came through" so the audit shows every piece, not just counts.
      prompt: null,
      rawOutput: null,
      bound: null,
      vetoes: null,
      flags: [],
      answer: null,
      sources: [],
      gated: false,      // §5: true when a refusing edge-grounded veto on a load-bearing claim
                         // engaged the gate and regenerated (turn/stages.js `revise`). The answer
                         // still ships — the gate regenerates toward an honest absence, not a substitution.
      revisions: null,   // superseded drafts from a confab rewrite, kept beside the answer (never erased)
      arc: null,         // the arc's record (spec-the-arc §7): the section events and the
                         // length-decision trace, when this record is a multi-section arc
                         // rather than a single turn. Null on every turn — additive.
      step(name, data) {
        this.steps.push({
          name, t: Date.now() - this.startedAt, data: cloneShallow(data),
        });
        notify(this);
        return this;
      },
      finish(fields = {}) {
        Object.assign(this, fields);
        this.finishedAt = Date.now();
        this.durationMs = this.finishedAt - this.startedAt;
        notify(this);
        return this;
      },
    };
    turns.push(t);
    while (turns.length > capacity) turns.shift();
    notify(t);
    return t;
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const exportJSONL = () =>
    turns.map(t => {
      const record = {
        schema:     t.schema,
        id:         t.id,
        question:   t.question,
        startedAt:  t.startedAt,
        finishedAt: t.finishedAt,
        durationMs: t.durationMs,
        route:      t.route,
        grounding:  t.grounding ?? null,
        steps:      t.steps,
        reading:    t.reading ?? null,
        prompt:     t.prompt,
        rawOutput:  t.rawOutput,
        bound:      t.bound,
        vetoes:     t.vetoes,
        flags:      t.flags,
        answer:     t.answer,
        sources:    t.sources,
        gated:      t.gated,
        revisions:  t.revisions,
        arc:        t.arc ?? null,
      };
      try {
        return JSON.stringify(record);
      } catch (err) {
        // One un-serializable turn (e.g. a circular ref that reached a step's
        // data) must not sink the whole export — emit a minimal valid line.
        return JSON.stringify({
          schema: t.schema, id: t.id, question: t.question,
          export_error: String(err?.message || err),
        });
      }
    }).join('\n');

  return { turn, subscribe, exportJSONL, get turns() { return turns; } };
};

const cloneShallow = (x) => {
  if (x == null) return x;
  if (Array.isArray(x)) return x.slice(0, 64);
  if (typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).slice(0, 32)) o[k] = x[k];
    return o;
  }
  return x;
};
