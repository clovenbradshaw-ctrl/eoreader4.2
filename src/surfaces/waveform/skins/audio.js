// EO: SIG(Lens → Lens, Tending) — the audio skin (docs/omnimodal-waveform.md §5)
// Restyle only. Takes the Scene `buildScene` already produced (never the
// WaveformModel, never a Reading, never the source) and returns it with
// presentational hints added — a theme name and a background-glyph choice
// ("spectral bars" instead of the strict render's plain filled area). It may
// not add, remove, reorder, or re-threshold a single mark: every mark array on
// the returned scene is the SAME array the strict scene carried.

export const applyAudioSkin = (scene) => ({
  ...scene,
  style: { theme: 'audio', backgroundGlyph: 'spectral-bars' },
});
