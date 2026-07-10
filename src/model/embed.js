// EO: SIG·INS(Field → Atmosphere,Entity, Tending,Making) — MiniLM semantic embedder
// MiniLM embedder via @xenova/transformers, loaded by URL on demand.
// Cold consumers (the hot lexical retrieval path) no-op when it isn't warm.
//
// Warming is opt-in. The UI may call `embedder.warm()` after first idle to make
// semantic retrieval available without blocking page open. The boot installer
// warms it as the "instruments" stage of assembling the geometric reader.
//
// MODEL: paraphrase-multilingual-MiniLM-L12-v2 — the SAME space the phasepost
// centroids were built in. The geometric reader can only measure a proposition
// against the centroids if the proposition is embedded here; scoring a
// hash-space vector against a MiniLM centroid measures nothing. That is why
// `measuresMeaning` is true here and false on the hash embedder: it is the
// firewall the classifier reads to decide whether a cosine means anything.

const XENOVA_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17/+esm';
const MODEL_ID   = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export const createMiniLMEmbedder = () => {
  let warming  = null;
  let warm     = false;
  let pipeline = null;
  const cache  = new Map();

  return {
    id: 'minilm',
    // The no-commit guard, as a property of the embedder: this is the MiniLM
    // organ, so a cosine in its space is a meaning-distance. The classifier
    // commits only when this is true.
    measuresMeaning: true,
    organ: 'minilm',
    model: MODEL_ID,
    isWarm: () => warm,
    // onProgress receives transformers.js progress events ({ status, file,
    // progress, loaded, total }) so the boot's instruments stage can show a
    // real download percent rather than a spinner that hides the truth.
    async warm(onProgress) {
      if (warm)    return;
      if (warming) return warming;
      warming = (async () => {
        const mod = await import(/* @vite-ignore */ XENOVA_URL);
        pipeline = await mod.pipeline('feature-extraction', MODEL_ID, {
          quantized: true,
          progress_callback: onProgress || undefined,
        });
        warm = true;
      })();
      return warming;
    },
    async embed(text) {
      if (!warm) await this.warm();
      const key = String(text);
      if (cache.has(key)) return cache.get(key);
      const out = await pipeline(key, { pooling: 'mean', normalize: true });
      const v = new Float32Array(out.data);
      cache.set(key, v);
      return v;
    },
  };
};
