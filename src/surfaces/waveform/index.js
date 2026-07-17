// EO: SIG(Lens → Lens, Tending) — barrel
// The waveform render's entrance (docs/omnimodal-waveform.md §5): the strict,
// modality-blind render plus the two reference skins. A consumer (index.html,
// a future reader surface) imports only from here — never render.strict.js or
// skins/<modality>.js directly.

export { buildScene, renderToContainer } from './render.strict.js';
export { applyAudioSkin } from './skins/audio.js';
export { applyTabularSkin } from './skins/tabular.js';
