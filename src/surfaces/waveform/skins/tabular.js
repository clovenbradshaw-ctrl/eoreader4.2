// EO: SIG(Lens → Lens, Tending) — the tabular/meteorological skin
// (docs/omnimodal-waveform.md §5). Restyle only, same discipline as
// skins/audio.js: takes the Scene buildScene already produced and returns it
// with a theme and a background-glyph choice ("raw-channel trace" instead of
// the strict render's plain filled area) — never a new mark, never a
// recomputed threshold, never anything read off the Reading or source.

export const applyTabularSkin = (scene) => ({
  ...scene,
  style: { theme: 'tabular', backgroundGlyph: 'raw-channel-trace' },
});
