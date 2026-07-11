// EO: DEF·EVA·SIG(Atmosphere → Lens,Atmosphere, Making,Binding,Tending) — style edits + the Atmosphere checkpoint
// The style layer — addressable, layered, checked at the Atmosphere grain.
//
// A page's LOOK is Atmosphere work (the EO terrain for ambient interpretive conditions).
// A user's later edit — "change the background to red", "make the buttons look better" —
// is not a mutation of the foraged framework (a minified monolith you cannot address);
// it is a new OVERRIDE layered over the base, keyed by selector, cascading on top. Each
// edit is one DEF event, so the sequence of edits is an ordered, auditable, reversible
// log — the page is re-projected from it, exactly like every other reading in the engine.
//
// The two requests are two KINDS of change:
//   · "change the background to red"  — a DEF: target + property + value, all precise.
//     Deterministic. But CHECKED: a color set at Atmosphere must still support the
//     reading — the organ computes WCAG contrast against the text and flags an
//     unreadable choice (the law "you may set a tone, but not one the reading can't
//     survive"), surfacing it, never silently overriding the instruction.
//   · "make the buttons look better"  — a REC: taste, which the model does NOT hold in
//     its weights. Taste is SOURCED — from the page's own design tokens (coherent with
//     the accent already chosen) or foraged from the web — never invented here. Vague and
//     iterative by nature; the override log makes each pass cheap and revertible.
//
// Pure functions, no DOM: color math, the contrast check, the override renderer, and a
// small interpreter from a plain request to an override.

// ── color ───────────────────────────────────────────────────────────────────────────
const NAMED = Object.freeze({
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080',
  grey: '#808080', darkred: '#8b0000', navy: '#000080', teal: '#008080', crimson: '#dc143c',
  slate: '#334155', indigo: '#4b0082', coral: '#ff7f50', gold: '#ffd700', ink: '#0b0d12',
});
export const parseColor = (c) => {
  const s = String(c ?? '').trim().toLowerCase();
  const hex = NAMED[s] ?? s;
  let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(hex))) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  if ((m = /^#([0-9a-f]{6})$/.exec(hex))) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  if ((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(hex))) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
};
const relLum = ({ r, g, b }) => {
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrastRatio = (a, b) => {
  const ca = parseColor(a), cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = relLum(ca), lb = relLum(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// ── the Atmosphere checkpoint — the look must still support the reading ─────────────
// styleCheck({ background, text }) → a finding (or null). This is the EVA at Atmosphere
// grain: not "is the CSS valid" (the browser handles that) but "is the ambient condition
// one the reading survives". WCAG AA is 4.5:1 for body text, 3:1 for large.
export const styleCheck = ({ background, text }) => {
  const ratio = contrastRatio(background, text);
  if (ratio == null) return null;
  const r = Math.round(ratio * 100) / 100;
  if (ratio >= 4.5) return { law: 'contrast', severity: 'note', ratio: r, aa: true, message: `background ${background} on text ${text}: ${r}:1 — passes AA` };
  const suggestion = readableAgainst(background, text);   // darken/lighten the BACKGROUND, keeping its hue
  return {
    law: 'contrast', severity: 'warn', ratio: r, aa: false, suggestion,
    message: `background ${background} on text ${text} is ${r}:1 — below AA (4.5:1); the reading is hard to see. Nearest readable ${background.replace(/[^a-z].*/i, '') || 'shade'}: ${suggestion}`,
  };
};
// the nearest shade of `color` (kept in hue) that clears AA against `text` — so "red"
// stays red, just a readable red. Darkens or lightens toward whichever side passes.
const readableAgainst = (color, text) => {
  const base = parseColor(color), t = parseColor(text);
  if (!base || !t) return color;
  const dir = relLum(t) > 0.5 ? -1 : 1;            // light text → darken the bg, and vice-versa
  let best = base;
  for (let k = 1; k <= 20; k++) {
    const f = 1 + dir * (k / 20);
    const c = { r: clamp(base.r * f), g: clamp(base.g * f), b: clamp(base.b * f) };
    if ((Math.max(relLum(c), relLum(t)) + 0.05) / (Math.min(relLum(c), relLum(t)) + 0.05) >= 4.5) { best = c; break; }
    best = c;
  }
  return `#${[best.r, best.g, best.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
};
const clamp = (v) => Math.max(0, Math.min(255, v));

// ── the addressable override layer — keyed by HOLON ADDRESS, not an invented selector ─
// An edit targets a holon by its address (`holon: "site.root.hero.h1"` → the one node) or
// a holon CLASS by tag (`tag: "button"` → all buttons), rendered as `[data-h="…"]` /
// `[data-h-tag="…"]` — the path IS the selector. `selector` (e.g. "body") stays for the
// document canvas, which is not a holon in the tree. The list is the append-only edit log;
// overridesToCss layers it AFTER the foraged base, so the cascade applies it.
export const editSelector = (e) =>
  e.selector ?? (e.holon ? `[data-h="${e.holon}"]` : e.tag ? `[data-h-tag="${e.tag}"]` : '*');
export const overridesToCss = (edits) => (edits ?? [])
  .filter((e) => e.decls && (e.face ?? 'style') === 'style')
  .map((e) => `${editSelector(e)} { ${Object.entries(e.decls).map(([k, v]) => `${k}: ${v}`).join('; ')} }`)
  .join('\n');

// ── a plain edit request → an override (+ any check) ────────────────────────────────
// ctx carries what the checkpoint needs: { text } (the current text color), { accent }.
// Precise edits resolve deterministically; "better" pulls taste from the design tokens
// (coherent with the accent already chosen) — the honest stand-in for foraged taste.
export const interpretStyleEdit = (request, ctx = {}) => {
  const s = String(request ?? '').toLowerCase();
  const text = ctx.text ?? '#e7ecf3';

  // "change the background to <color>" — the page canvas (body is the document, not a
  // holon in the tree), so it keeps the `body` selector; every other target is a holon.
  // Scan for the first token that is actually a color (so "to"/"the" are skipped).
  if (/background|\bbg\b|backdrop/.test(s)) {
    const value = (s.match(/#[0-9a-f]{3,6}|[a-z]+/g) || []).find((t) => parseColor(t) && !/^(background|bg|backdrop)$/.test(t));
    if (value) return {
      edits: [{ selector: 'body', decls: { background: value }, why: request }],
      check: styleCheck({ background: value, text }),
    };
  }

  // "make the buttons look better" — a holon CLASS (tag=button), taste from the tokens
  if (/button/.test(s) && /(better|nicer|nice|polish|improve|prettier|modern)/.test(s)) {
    const accent = ctx.accent ?? '#5eb0ff';
    const on = (contrastRatio(accent, '#04121f') ?? 0) >= (contrastRatio(accent, '#ffffff') ?? 0) ? '#04121f' : '#ffffff';
    return {
      edits: [{
        tag: 'button',
        decls: {
          background: accent, color: on, border: '0',
          'border-radius': '0.6rem', padding: '0.6rem 1.15rem', 'font-weight': '650',
          cursor: 'pointer', transition: 'transform .08s ease, filter .15s ease',
          'box-shadow': '0 1px 0 rgba(255,255,255,.15) inset, 0 6px 18px rgba(0,0,0,.35)',
        },
        why: request,
      }, {
        selector: '[data-h-tag="button"]:hover',
        decls: { transform: 'translateY(-1px)', filter: 'brightness(1.06)' },
        why: request,
      }],
      check: styleCheck({ background: accent, text: on }),   // the button's own text must be readable too
    };
  }

  return { edits: [], check: null, unresolved: request };
};
