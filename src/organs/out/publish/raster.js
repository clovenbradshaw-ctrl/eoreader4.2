// EO: NUL·EVA(Void → Void, Clearing,Binding) — SVG→PNG raster + static-subset guard
// Publish → raster. The SVG→PNG seam for LIMNER, on resvg-wasm.
//
// LIMNER draws SVG. When that SVG is itself an ARCHIVED ARTIFACT — a figure a claim
// points at, a card that gets pinned to a record — it has to rasterize the SAME way
// every time, on every machine, or the archived PNG stops matching its own hash.
// Canvas `drawImage` will not do that: it rasterizes with whatever fonts and
// hinting the host happens to have. resvg (Rust, compiled to a pure-WASM browser
// artifact) will — it bakes supplied fonts and produces deterministic output.
//
// The tradeoff is deliberate and worth stating: resvg supports only the STATIC SVG
// subset — no animation, no <script>, no dynamic features. That is exactly right for
// an archived document figure (it should not move) and means anything interactive
// stays live SVG and is never rasterized. (Takumi is the one to watch as a faster,
// more-complete-CSS successor to the Satori/resvg path; same injection seam here.)
//
// The renderer is INJECTED — nothing bundled. The caller passes a resvg-wasm handle;
// this organ owns the deterministic contract around it.

const DEFAULTS = Object.freeze({ background: 'white', fitTo: { mode: 'width', value: 1200 } });

// rasterize(svg, { rasterizer, fonts, background, fitTo }) → Uint8Array PNG.
// `rasterizer` is the resvg-wasm module's `Resvg` class (or anything exposing the same
// `new R(svg, opts).render().asPng()` shape). `fonts` is an array of font buffers —
// resvg needs the glyphs in hand to bake them; a missing font silently drops text.
export const rasterize = async (svg, opts = {}) => {
  const { rasterizer, fonts = [], background = DEFAULTS.background, fitTo = DEFAULTS.fitTo } = opts;
  if (!rasterizer) throw new Error('rasterize: inject a resvg-wasm `rasterizer` (the Resvg class); nothing is bundled');
  assertStatic(svg);
  const resvgOpts = {
    background,
    fitTo,
    font: fonts.length ? { fontBuffers: fonts, loadSystemFonts: false } : { loadSystemFonts: false },
  };
  const r = new rasterizer(svg, resvgOpts);
  const png = r.render();
  const bytes = png.asPng();
  if (typeof png.free === 'function') png.free();
  return bytes;
};

// The static-subset guard, made explicit rather than discovered at render time: an
// SVG carrying animation or script is not archivable-deterministic, so refuse it
// loudly instead of rasterizing a frame-zero snapshot that silently drops motion.
export const assertStatic = (svg) => {
  const s = String(svg || '');
  if (/<script[\s/>]/i.test(s)) throw new Error('rasterize: SVG contains <script> — resvg renders only the static subset');
  if (/<(animate|animateTransform|animateMotion|set)[\s/>]/i.test(s)) throw new Error('rasterize: SVG contains SMIL animation — resvg renders only the static subset');
  return true;
};
