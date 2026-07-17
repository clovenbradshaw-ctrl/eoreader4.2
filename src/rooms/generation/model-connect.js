// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — connect to the active model
// model-connect.js — the generation surface's own model handle. It does not
// pick a backend (that is the Models room's whole job — src/rooms/models/) or
// re-teach the reader's fallback ladder; it reads the SAME choice both already
// share (localStorage eo_backend — same origin, same weight cache, same pick),
// loads it, and hands back a live { phrase(messages, opts) } the two writers
// (longform.js, codegen.js) drive. No backend is picked here, so this file
// stays tiny and the three surfaces can never disagree about which model is
// "the" model.

import { createModel, describeModel } from '../../model/index.js';

const BACKEND_KEY = 'eo_backend';

export const activeBackendName = () => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(BACKEND_KEY) : null;
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
};

// connectModel({ onProgress }) -> { model, description }
// Throws a legible Error (never a raw SDK/engine fault) when no backend is
// picked, or when load() itself fails — the caller shows it as-is; every
// backend's own load() already produces a human-readable message.
export const connectModel = async ({ onProgress = null } = {}) => {
  const name = activeBackendName();
  if (!name || name === 'none') {
    throw new Error('no model is picked yet — open Models and choose one (Claude · hosted is the fastest to set up)');
  }
  const model = createModel(name);
  await model.load(onProgress);
  return { model, description: describeModel(model) };
};
