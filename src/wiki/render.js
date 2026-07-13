// EO: SIG·CON(Entity → Lens,Atmosphere, Binding,Tending) — the narrow-panel article view
// The render layer for a terrain-typed article. Two forms, one projection:
//
//   PANEL  the article in a narrow right-hand column (the reader's inspector). Terse,
//          scannable, the lede and then the sections in render order, sparse slots
//          marked so an empty desert cell reads as expected, not as a TODO.
//   HERO   the same article promoted to headline content — a full-bleed card that LEADS
//          with the typed absence (what this region does not contain / what a place makes
//          expensive to say / the anomaly register), because for eight of the nine
//          terrains the absence is the most interesting thing the article carries and the
//          Entity-shaped "infobox + prose" layout buries it.
//
// This is deliberately NOT Wikipedia's chrome. There is no infobox rail, no citation
// superscript farm; the terrain sets the shape. Framework-agnostic: `articleView`
// returns a plain view-model (drop into React/DOM however the host renders), and
// `renderArticleHTML` returns a self-contained HTML string for a quick mount or a probe.
//
// Input is the frozen object renderArticle (project.js) returns — a fresh projection,
// never a stored struct. This layer adds no state and caches nothing.

import { glyphOf } from '../core/operators.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Domain accent — the three Site-face columns get three hues; the Ground column reads
// cool/ambient, Figure solid, Pattern woven. Kept as CSS custom properties so a host
// theme can override without touching this module.
const DOMAIN_HUE = { Existence: 212, Structure: 150, Interpretation: 276 };
const OBJECT_TONE = { Ground: 0.62, Figure: 0.48, Pattern: 0.55 };

export const accentOf = (article) => {
  const h = DOMAIN_HUE[article?.domain] ?? 220;
  const l = OBJECT_TONE[article?.object] ?? 0.5;
  return { hue: h, light: `hsl(${h} 55% ${Math.round(l * 100)}%)`, wash: `hsl(${h} 60% 96%)`, washDark: `hsl(${h} 30% 16%)` };
};

// ── the view-model ────────────────────────────────────────────────────────────────
// A plain, render-agnostic shape. `heroAbsence` is the typed absence the hero leads
// with; `sections` is only the non-empty (or expectedly-empty, flagged) ones in render
// order, each with its heading, glyph, flags, and rendered entries.
export const articleView = (article, { hero = false } = {}) => {
  if (!article) return null;
  const accent = accentOf(article);
  const heroAbsence = article.absence?.headline || null;

  const sections = (article.sections || []).map((s) => ({
    key: s.key,
    op: s.op,
    glyph: s.glyph || glyphOf(s.op),
    heading: s.heading,
    flags: {
      distinctive: !!s.distinctive, constitutive: !!s.constitutive,
      largest: !!s.largest, promoted: !!s.promoted, infobox: !!s.infobox,
    },
    sparse: s.sparse || null,
    expectedEmpty: !!s.expectedEmpty,
    empty: !!s.empty,
    entries: s.entries || [],
  }));

  return {
    terrain: article.terrain,
    domain: article.domain,
    object: article.object,
    name: article.name,
    nameSource: article.nameSource,
    lede: article.lede,
    identityKey: article.identityKey,
    accent,
    hero,
    heroAbsence,
    absenceStates: article.absence?.states || null,
    typedAbsence: article.absence?.typed || [],
    characteristicFailure: article.characteristicFailure,
    sections,
    provenance: article.provenance || [],
    asOf: article.asOf,
  };
};

// ── HTML rendering ──────────────────────────────────────────────────────────────────
const entryHTML = (e) => {
  switch (e.kind) {
    case 'lede': return `<p class="eo-wiki-lede-text">${esc(e.text)}${e.by ? ` <span class="eo-wiki-by">— ${esc(e.by)}</span>` : ''}</p>`;
    case 'attestation': {
      const prov = [e.provenance?.source, e.provenance?.span && `“${e.provenance.span}”`, e.provenance?.observer]
        .filter(Boolean).map(esc).join(' · ');
      return `<li class="eo-wiki-attest">${esc(e.text)}${prov ? `<span class="eo-wiki-prov">${prov}</span>` : ''}</li>`;
    }
    case 'edge': return `<li class="eo-wiki-edge"><span class="eo-wiki-etype">${esc(e.edge)}</span> ${e.dir === 'in' ? '←' : '→'} ${esc(e.to || e.from || '')}</li>`;
    case 'relation': return `<li>${esc(e.text)}${e.to ? ` <span class="eo-wiki-to">→ ${esc(e.to)}</span>` : ''}</li>`;
    case 'extent': return `<li>${esc(e.text)}</li>`;
    case 'registration': return `<li>${esc(e.address || '')}${e.at ? ` <span class="eo-wiki-prov">${esc(e.at)}</span>` : ''}</li>`;
    case 'judgment': return `<li>${esc(e.text)}${e.by ? ` <span class="eo-wiki-by">— ${esc(e.by)}</span>` : ''}</li>`;
    case 'reframing': return `<li class="eo-wiki-reframe">${esc(e.text)}${e.cause ? ` <span class="eo-wiki-prov">${esc(e.cause)}</span>` : ''}</li>`;
    case 'absence': return `<li class="eo-wiki-absent" data-state="${esc(e.state)}">${esc(e.note || e.field || '')} <span class="eo-wiki-state">${esc(e.state)}</span></li>`;
    default: return `<li>${esc(e.text || '')}</li>`;
  }
};

const sectionHTML = (s) => {
  const flag = s.flags.distinctive ? ' · distinctive' : s.flags.constitutive ? ' · constitutive' : s.flags.largest ? ' · largest' : '';
  if (s.empty && s.expectedEmpty) {
    const why = s.sparse === 'desert' ? 'structurally sparse — the desert cell (SYN × Ground)' : 'structurally absent at this terrain';
    return `<section class="eo-wiki-sec eo-wiki-sparse"><h3>${s.glyph} ${esc(s.heading)}</h3><p class="eo-wiki-desert">${why}</p></section>`;
  }
  if (s.empty) return ''; // an ordinary empty section is simply not shown in the narrow panel
  const isLede = s.op === 'DEF';
  const body = isLede ? s.entries.map(entryHTML).join('') : `<ul>${s.entries.map(entryHTML).join('')}</ul>`;
  return `<section class="eo-wiki-sec"><h3>${s.glyph} ${esc(s.heading)}<span class="eo-wiki-flag">${flag}</span></h3>${body}</section>`;
};

const heroAbsenceHTML = (v) => {
  const a = v.heroAbsence;
  if (!a) return '';
  const states = v.absenceStates
    ? Object.entries(v.absenceStates).filter(([, n]) => n > 0).map(([k, n]) => `<span class="eo-wiki-chip">${esc(k)} ${n}</span>`).join('')
    : '';
  return `<div class="eo-wiki-hero-absence">
    <div class="eo-wiki-kicker">The absence — ${esc(v.terrain)}</div>
    <h2 class="eo-wiki-headline">${esc(a.headline)}</h2>
    <p class="eo-wiki-what">${esc(a.what)}</p>
    ${states ? `<div class="eo-wiki-states">${states}</div>` : ''}
  </div>`;
};

// renderArticleHTML(article, { hero }) → a self-contained HTML string. Wrap with the
// exported WIKI_PANEL_CSS once per page. In hero mode the typed absence leads; in panel
// mode the lede leads and the absence sits in its section like any other.
export const renderArticleHTML = (article, opts = {}) => {
  const v = articleView(article, opts);
  if (!v) return '';
  const cls = `eo-wiki${v.hero ? ' eo-wiki-hero' : ' eo-wiki-panel'}`;
  const style = `--eo-wiki-hue:${v.accent.hue}`;
  const header = `<header class="eo-wiki-head">
    <span class="eo-wiki-terrain">${esc(v.terrain)}<span class="eo-wiki-coord">${esc(v.domain)} × ${esc(v.object)}</span></span>
    <h1 class="eo-wiki-name">${esc(v.name)}${v.nameSource && v.nameSource !== 'referent' ? `<span class="eo-wiki-namesrc">${esc(v.nameSource)}</span>` : ''}</h1>
  </header>`;
  const lede = v.lede ? `<p class="eo-wiki-lede">${esc(v.lede.text)}${v.lede.by ? ` <span class="eo-wiki-by">— ${esc(v.lede.by)}</span>` : ''}</p>` : '';
  const body = v.sections.filter((s) => s.op !== 'DEF').map(sectionHTML).join('');
  const inner = v.hero
    ? `${header}${heroAbsenceHTML(v)}${lede}${body}`
    : `${header}${lede}${body}`;
  return `<article class="${cls}" style="${style}" data-terrain="${esc(v.terrain)}">${inner}</article>`;
};

// A make-hero affordance is a pure re-render — the projection is unchanged, only `hero`
// flips. So promotion never re-reads or re-stores; it is the same article, larger.
export const promoteToHero = (article) => renderArticleHTML(article, { hero: true });

// Scoped, theme-aware CSS. Injected once per page (id-guarded by the host). Narrow by
// design: the panel maxes at a column width; the hero goes full-bleed and leads with the
// absence pull-quote. Uses the --eo-wiki-hue set per article for the domain accent.
export const WIKI_PANEL_CSS = `
.eo-wiki{--h:var(--eo-wiki-hue,220);color:#1b1b22;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  --accent:hsl(var(--h) 55% 46%);--wash:hsl(var(--h) 60% 96%);--edge:hsl(var(--h) 40% 88%)}
.eo-wiki-panel{max-width:360px;padding:14px 16px}
.eo-wiki-hero{max-width:720px;margin:0 auto;padding:28px 24px}
.eo-wiki-head{border-left:3px solid var(--accent);padding-left:10px;margin-bottom:12px}
.eo-wiki-terrain{display:inline-flex;gap:8px;align-items:baseline;font-size:11px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent)}
.eo-wiki-coord{font-weight:500;opacity:.6;letter-spacing:0}
.eo-wiki-name{font-size:20px;line-height:1.2;margin:.15em 0 0;font-weight:650}
.eo-wiki-hero .eo-wiki-name{font-size:28px}
.eo-wiki-namesrc{font-size:10px;font-weight:600;vertical-align:super;margin-left:6px;color:#8a8a95;
  border:1px solid var(--edge);border-radius:3px;padding:1px 4px;text-transform:none;letter-spacing:0}
.eo-wiki-lede{font-size:15px;color:#2a2a33;margin:0 0 14px}
.eo-wiki-hero .eo-wiki-lede{font-size:16px;color:#3a3a44}
.eo-wiki-by{color:#8a8a95;font-style:italic}
.eo-wiki-hero-absence{background:var(--wash);border:1px solid var(--edge);border-radius:10px;padding:18px 20px;margin:0 0 20px}
.eo-wiki-kicker{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
.eo-wiki-headline{font-size:22px;line-height:1.25;margin:0 0 8px;font-weight:680}
.eo-wiki-what{margin:0;color:#3a3a44}
.eo-wiki-states{margin-top:12px;display:flex;gap:6px;flex-wrap:wrap}
.eo-wiki-chip{font-size:11px;font-weight:600;background:#fff;border:1px solid var(--edge);border-radius:20px;padding:2px 9px;color:var(--accent)}
.eo-wiki-sec{margin:0 0 14px}
.eo-wiki-sec h3{font-size:12px;font-weight:700;letter-spacing:.03em;color:#54545e;margin:0 0 5px;display:flex;gap:6px;align-items:baseline}
.eo-wiki-flag{font-size:10px;font-weight:500;color:#a0a0aa;letter-spacing:0}
.eo-wiki-sec ul{margin:0;padding-left:18px}
.eo-wiki-sec li{margin:0 0 4px}
.eo-wiki-lede-text{margin:0 0 6px}
.eo-wiki-prov,.eo-wiki-to,.eo-wiki-etype{font-size:11px;color:#8a8a95;margin-left:6px}
.eo-wiki-etype{font-family:ui-monospace,monospace;color:var(--accent)}
.eo-wiki-absent{list-style:none;margin-left:-18px}
.eo-wiki-state{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#a0a0aa;margin-left:6px}
.eo-wiki-absent[data-state="cleared"] .eo-wiki-state{color:#b26a2e}
.eo-wiki-absent[data-state="unknown"] .eo-wiki-state{color:var(--accent)}
.eo-wiki-sparse .eo-wiki-desert{font-size:12px;font-style:italic;color:#a0a0aa;margin:0}
.eo-wiki-reframe{color:#54545e}
@media (prefers-color-scheme:dark){
  .eo-wiki{color:#e6e6ec;--wash:hsl(var(--h) 30% 15%);--edge:hsl(var(--h) 25% 28%);--accent:hsl(var(--h) 60% 68%)}
  .eo-wiki-name,.eo-wiki-headline{color:#f2f2f6}
  .eo-wiki-lede,.eo-wiki-what,.eo-wiki-hero .eo-wiki-lede{color:#c4c4cc}
  .eo-wiki-chip{background:#1c1c22}
  .eo-wiki-sec h3{color:#a8a8b2}
}
:root[data-theme="dark"] .eo-wiki{color:#e6e6ec;--wash:hsl(var(--h) 30% 15%);--edge:hsl(var(--h) 25% 28%);--accent:hsl(var(--h) 60% 68%)}
:root[data-theme="light"] .eo-wiki{color:#1b1b22;--wash:hsl(var(--h) 60% 96%);--edge:hsl(var(--h) 40% 88%);--accent:hsl(var(--h) 55% 46%)}
`;
