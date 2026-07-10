// EO: NUL(Lens → Void, Clearing) — receipt card (Satori element tree)
// Publish → receipt card. A shareable image for a published NPJ claim.
//
// When a claim is published, it gets a "receipt" — a small card that states the
// claim, names its source, and carries the provenance hash, so a screenshot of it is
// self-verifying. Satori (Vercel) is the right generator: it converts a subset of
// HTML/CSS to SVG with the TEXT BAKED TO PATH, so the output is deterministic — then
// we rasterize through resvg (organs/out/publish/raster.js). Two Satori gotchas the
// caller must respect, surfaced here so they are not learned at crash time:
//   • it emits only PNG or JPEG — WebP fails with a cryptic error;
//   • it needs at least one font provided — there is no system fallback.
//
// This organ is PURE: it builds the Satori element tree (the deterministic spec).
// The caller runs `satori(tree, { width, height, fonts })` → SVG, then `rasterize`.
// Nothing bundled — the element tree is plain data.

const box = (style, children) => ({ type: 'div', props: { style, children } });
const span = (style, text) => ({ type: 'div', props: { style, children: String(text ?? '') } });

// receiptCard(claim) → { element, width, height, requires }. `claim`:
//   { text, source?, sourceId?, hash?, date?, url?, verdict? }
export const receiptCard = (claim = {}, theme = {}) => {
  const t = {
    bg: theme.bg || '#fbfbf9', ink: theme.ink || '#1a1c1a', faint: theme.faint || '#6b716e',
    accent: theme.accent || '#3a7d6e', font: theme.font || 'Newsreader', mono: theme.mono || 'IBM Plex Mono',
    width: theme.width || 1200, height: theme.height || 630,
  };
  const verdictColor = claim.verdict === 'refuted' ? '#a85c52' : claim.verdict === 'confirmed' ? '#2f7d5b' : t.accent;

  const element = box(
    { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: t.bg,
      padding: '64px', justifyContent: 'space-between', fontFamily: t.font, color: t.ink },
    [
      box({ display: 'flex', fontFamily: t.mono, fontSize: 20, color: t.faint, letterSpacing: '0.08em' },
        [span({}, 'NPJ · verified claim')]),
      span({ fontSize: 52, lineHeight: 1.25, fontWeight: 600, marginTop: 24, marginBottom: 24 }, claim.text || ''),
      box({ display: 'flex', flexDirection: 'column', fontFamily: t.mono, fontSize: 22, color: t.faint },
        [
          claim.source ? span({ color: t.ink }, claim.source) : null,
          claim.url ? span({}, claim.url) : null,
          box({ display: 'flex', marginTop: 12, justifyContent: 'space-between' },
            [
              span({ color: verdictColor }, (claim.verdict || 'recorded').toUpperCase()),
              span({}, [claim.date, claim.hash ? claim.hash.slice(0, 18) : (claim.sourceId || '')].filter(Boolean).join(' · ')),
            ]),
        ].filter(Boolean)),
    ]);

  return {
    element,
    width: t.width, height: t.height,
    // Surfaced so the caller wires them before Satori throws on their absence.
    requires: { fonts: [t.font, t.mono], formats: ['png', 'jpeg'], note: 'Satori needs ≥1 font and emits PNG/JPEG only (no WebP).' },
  };
};
