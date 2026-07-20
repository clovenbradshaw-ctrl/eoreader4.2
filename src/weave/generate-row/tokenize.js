// EO: SEG(Link → Link, Dissecting) — the one tokenizer render.js and row-veto.js share
// docs/generate-row-stance-templates.md §8: trace coverage is checked by walking
// `renderedText`'s tokens against `row.trace`. Both the renderer (which produces the
// spans) and the veto (which counts them) must split text identically, or coverage would
// be an artifact of two different tokenizers disagreeing rather than a real check —
// hence one shared, tiny, whitespace/punctuation splitter, not two.

// tokenize(text) -> { text, start, end }[] — words and standalone punctuation, by
// character offset. "Board, because" -> ["Board", ",", "because"]. Deliberately crude:
// this is a trace-accounting device, not a linguistic tokenizer.
export const tokenize = (text) => {
  const s = String(text ?? '');
  const re = /[A-Za-z0-9$%]+(?:['’][A-Za-z]+)?|[.,;:!?()"“”]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(s))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
};

export const tokenCount = (text) => tokenize(text).length;
