// EO: NUL·DEF(Field,Lens → Void, Clearing) — typed absence / void answer
// The typed absence — the response when the field holds no answer.
//
// (docs/answerability.md) Realises eoreader3's void typology in eoreader4's
// mechanics: rather than let the talker invent on an empty field, the route answers
// the absence directly and mechanically, with its receipt. The membrane holds —
// there is no talker here to be told a kind; the absence is rendered post-hoc from
// the measured verdict, the way a mechanical answerer renders a lookup. NUL holds
// the field; the response is a DEF to VOID.

import { fieldVerdict } from '../../surfer/index.js';

// Render the measured verdict as plain prose. Each terrain renders as itself:
// never-set carries a scan receipt; elsewhere names the referent that is not here.
const renderAbsence = (v) => {
  if (v.kind === 'elsewhere' && v.term) return `"${v.term}" is not in this document.`;
  return `The document does not say — ${v.receipt}, and nothing here addresses that.`;
};

// A mechanical VOID answer, or null when there is an answer to give. Shape matches
// the other mechanical answerers — { route, text, sources } — plus a `void` stamp
// { kind, receipt, rode } for the audit. Cheap, deterministic, never warms the model.
export const answerVoid = (doc, question, spans = [], opts = {}) => {
  const v = fieldVerdict(doc, question, spans, opts);
  if (!v.void) return null;
  return {
    route: 'void',
    text: renderAbsence(v),
    sources: [],
    void: { kind: v.kind, receipt: v.receipt, rode: v.rode },
  };
};
