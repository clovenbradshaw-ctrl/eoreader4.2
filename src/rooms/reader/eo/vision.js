// EO: SIG·INS(Void → Entity,Atmosphere, Making,Tending) — Florence-2 vision organ eye
// The vision organ's eye — Florence-2 via Transformers.js, loaded by URL on demand.
// (embed.js is the meaning organ's wiring; this is the seeing organ's. The pure half —
// boxes → relations → narration — is src/organs/in/scene.js, model-free and CI-tested.)
//
// Florence-2 is driven through its STRUCTURED task tokens, not free-form prose:
//   <DENSE_REGION_CAPTION>  → { labels, bboxes }  — the regions, each phrase boxed
//   <CAPTION>               → one short gist sentence
// In a VLM the cost lives in the autoregressive decode, so the decode is kept to the
// shortest outputs that carry the structure; the spatial prose is composed downstream
// from the boxes for free. And because every emitted phrase arrives WITH its box, the
// output is groundable — a small model checked beats a large model trusted.
//
// The cheapest inference is the one never run: a description is a pure function of
// (image bytes, model, task set), so the result is CONTENT-ADDRESSED — sha-256 of the
// bytes keys a JSON artifact in the same OPFS raw store the web fetcher uses. The same
// evidence photo re-imported next session costs one hash, not a decode. (The weights
// themselves are cached separately by Transformers.js; this cache short-circuits even
// loading them.)

import { createRawStore } from '../../../organs/ingest/opfs-store.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm';
const MODEL_ID  = 'onnx-community/Florence-2-base-ft';
const CACHE_DIR = 'eoreader-vision';
const CACHE_VER = 'v1'; // bump when the task set or output shape changes — old artifacts must miss
const TASK_REGIONS = '<DENSE_REGION_CAPTION>';
const TASK_GIST    = '<CAPTION>';

// WebGPU if the browser offers it, else WASM — the same probe import-file.js uses.
const device = async () => {
  try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu'; } catch {}
  return 'wasm';
};

// No WebCrypto → no content address → no cache. Never a weak key: a colliding key
// would hand one image another image's description, which is worse than recomputing.
const sha256Hex = async (bytes) => {
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || null;
  if (!subtle) return null;
  try {
    const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
};

export const createFlorenceVision = () => {
  let warming = null;
  let warm    = false;
  let model = null, processor = null, tokenizer = null, RawImage = null;
  let dev = 'wasm';
  const store = createRawStore({ dir: CACHE_DIR });

  const generate = async (image, visionInputs, task, maxNew) => {
    const textInputs = tokenizer(processor.construct_prompts(task));
    const ids = await model.generate({ ...textInputs, ...visionInputs, max_new_tokens: maxNew });
    const out = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0];
    return processor.post_process_generation(out, task, image.size)[task];
  };

  return {
    id: 'florence2',
    organ: 'vision',
    model: MODEL_ID,
    isWarm: () => warm,
    // onProgress receives transformers.js progress events ({ status, file, progress })
    // so the caller can show a real download percent (the boot-installer convention).
    async warm(onProgress) {
      if (warm)    return;
      if (warming) return warming;
      warming = (async () => {
        dev = await device();
        const mod = await import(/* @vite-ignore */ TRANSFORMERS_URL);
        RawImage = mod.RawImage;
        // On WebGPU, fp16 vision + q4 language is the deployed sweet spot; the WASM
        // path takes uniform q8 (no fp16 kernels to lean on).
        const dtype = dev === 'webgpu'
          ? { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q4', decoder_model_merged: 'q4' }
          : 'q8';
        [model, processor, tokenizer] = await Promise.all([
          mod.Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, { device: dev, dtype, progress_callback: onProgress || undefined }),
          mod.AutoProcessor.from_pretrained(MODEL_ID),
          mod.AutoTokenizer.from_pretrained(MODEL_ID),
        ]);
        warm = true;
      })();
      // A failed warm must not poison the organ forever — reset so a later attempt
      // (transient CDN/WebGPU fault) can retry from scratch (embed.js's rule).
      warming.catch(() => { warming = null; });
      return warming;
    },
    // describe(blob) → { caption, regions:[{label,bbox:[x1,y1,x2,y2]}], width, height,
    //                    bboxFormat:'xyxy', witness, cached } — composeScene's input, verbatim.
    async describe(blob, { onProgress } = {}) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const key = hash ? `vision_${CACHE_VER}_${MODEL_ID.split('/').pop()}_sha256-${hash}` : null;
      if (key) {
        const hit = await store.get(key);
        if (hit) { try { return { ...JSON.parse(hit), cached: true }; } catch { /* corrupt artifact — recompute */ } }
      }

      if (!warm) await this.warm(onProgress);
      const image = await RawImage.fromBlob(new Blob([bytes], { type: blob.type || 'image/png' }));
      // One preprocessing of the pixels feeds both decodes below.
      const visionInputs = await processor(image);
      const dense = (await generate(image, visionInputs, TASK_REGIONS, 512)) || {};
      const gist  = await generate(image, visionInputs, TASK_GIST, 48);

      const regions = (dense.labels || [])
        .map((label, i) => ({ label: String(label).trim(), bbox: (dense.bboxes || [])[i] }))
        .filter((r) => r.label && Array.isArray(r.bbox) && r.bbox.length === 4);
      const size = Array.isArray(image.size) ? image.size : [image.width, image.height];
      const seen = {
        model: MODEL_ID,
        caption: String(gist || '').trim(),
        regions, width: size[0] || 0, height: size[1] || 0,
        bboxFormat: 'xyxy',
        witness: `florence-2-base-ft · ${dev}`,
      };
      if (key) await store.put(key, JSON.stringify(seen), { title: blob.name || null });
      return { ...seen, cached: false };
    },
  };
};
