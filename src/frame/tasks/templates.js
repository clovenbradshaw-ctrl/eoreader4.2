// EO: NUL(Paradigm,Void → Void,Paradigm, Tending) — templates store (JSON persist)
// tasks/templates.js — the `templates/` store: a learned/installed shape, as JSON.
//
// The library (spec.js) holds shapes in memory; this is how a shape becomes durable —
// the machine writes what it LEARNS into the `templates/` folder, and a person can drop a
// hand-written JSON in to INSTALL one. Either way it is the same artifact: a small,
// inspectable, shareable description of how to make a thing — never code.
//
// Two halves, like the output organs:
//   PURE (browser-safe): templateToJSON / templateFromJSON — serialize a shape to the
//     on-disk shape and back, validating it. A section's instruction is stored as its
//     NEUTRAL directive (act + detail), so an installed template is modality-neutral and
//     the output organ lowers it at run time; a legacy text `goal` string is also accepted.
//   NODE-ONLY (lazy import): loadTemplatesDir / saveTemplate / templatePersister — read
//     the folder into a seed map, write one shape as `<kind>.json`, and a persister the
//     library calls on every learn. These `await import('node:fs')` so the browser bundle
//     never pulls them in.

// The on-disk schema version, so an older store can be migrated rather than misread.
export const TEMPLATE_SCHEMA = 1;

const slug = (kind) => String(kind || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';

// templateToJSON(tmpl) → a plain, ordered object ready for JSON.stringify. Sections keep
// their role, share, and either a neutral `dir` or a resolved `goal` string. Goal BUILDERS
// (functions) cannot be serialized — they are resolved with a placeholder subject so the
// stored shape is concrete; prefer neutral `dir` for anything meant to be shared.
export const templateToJSON = (tmpl = {}) => {
  const sections = (tmpl.sections || []).map((s) => {
    const out = { role: s.role, share: Number(s.share) > 0 ? Number(s.share) : 1 };
    if (s.dir) out.dir = { act: s.dir.act, ...(s.dir.detail ? { detail: s.dir.detail } : {}) };
    else if (typeof s.goal === 'string') out.goal = s.goal;
    else if (typeof s.goal === 'function') out.goal = String(s.goal('{subject}'));
    return out;
  });
  return {
    schema: TEMPLATE_SCHEMA,
    kind: tmpl.kind,
    organ: tmpl.organ || 'text',
    format: tmpl.format || 'prose',
    size: tmpl.size ?? 600,
    note: tmpl.note || '',
    source: tmpl.source || 'learned',
    ...(tmpl.provenance ? { provenance: tmpl.provenance } : {}),
    ...(tmpl.form ? { form: tmpl.form } : {}),
    ...(tmpl.content ? { content: tmpl.content } : {}),
    sections,
  };
};

// The learned content block, validated: string arrays only, anything else dropped.
const contentFromJSON = (c) => {
  if (!c || typeof c !== 'object') return null;
  const strings = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string' && x) : []);
  const lexicon = strings(c.lexicon);
  const phrases = strings(c.phrases);
  if (!lexicon.length && !phrases.length) return null;
  return Object.freeze({ lexicon: Object.freeze(lexicon), phrases: Object.freeze(phrases) });
};

// templateFromJSON(json) → a validated template, or null when malformed (a bad install
// is skipped, never crashes the load). A `goal` string with the `{subject}` placeholder is
// rehydrated into a builder so it names the real subject at build.
export const templateFromJSON = (json) => {
  const j = typeof json === 'string' ? safeParse(json) : json;
  if (!j || typeof j !== 'object') return null;
  if (!j.kind || !Array.isArray(j.sections) || !j.sections.length) return null;
  const sections = j.sections.map((s) => {
    if (!s || !s.role) return null;
    const base = { role: String(s.role), share: Number(s.share) > 0 ? Number(s.share) : 1 };
    if (s.dir && s.dir.act) return { ...base, dir: { act: s.dir.act, detail: s.dir.detail || null } };
    if (typeof s.goal === 'string') {
      const tmpl = s.goal;
      return { ...base, goal: (subject) => tmpl.replace(/\{subject\}/g, subject || 'the requested topic') };
    }
    return null;
  }).filter(Boolean);
  if (!sections.length) return null;
  const content = contentFromJSON(j.content);
  return Object.freeze({
    kind: String(j.kind),
    organ: j.organ || 'text',
    format: j.format || 'prose',
    size: Number(j.size) > 0 ? Number(j.size) : 600,
    note: j.note || '',
    source: j.source || 'installed',
    ...(j.provenance ? { provenance: j.provenance } : {}),
    ...(j.form ? { form: j.form } : {}),
    ...(content ? { content } : {}),
    sections,
  });
};

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// ── Node-only filesystem helpers (lazy import, never in the browser bundle) ────

// loadTemplatesDir(dir) → { kind: template } seed map for createSpecLibrary({ seed }).
// Reads every *.json in the folder, skipping any that fail to validate (with a console
// note). Missing folder → empty seed, never an error.
export const loadTemplatesDir = async (dir) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')); }
  catch { return {}; }
  const seed = {};
  for (const f of files) {
    try {
      const tmpl = templateFromJSON(await fs.readFile(path.join(dir, f), 'utf8'));
      if (tmpl) seed[tmpl.kind] = tmpl;
      else console.warn(`templates: skipped malformed ${f}`);
    } catch { console.warn(`templates: could not read ${f}`); }
  }
  return seed;
};

// saveTemplate(dir, tmpl) → write one shape as `<kind>.json`. Creates the folder if
// absent. Returns the path written.
export const saveTemplate = async (dir, tmpl) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug(tmpl.kind)}.json`);
  await fs.writeFile(file, JSON.stringify(templateToJSON(tmpl), null, 2) + '\n', 'utf8');
  return file;
};

// templatePersister(dir) → an `onLearn(kind, tmpl)` for createSpecLibrary, so every shape
// the machine learns is written to the folder. Returns the write PROMISE (the library
// collects it for `flush()`); a write failure is logged, never thrown (persistence must
// not sink a run), and the returned promise always resolves.
export const templatePersister = (dir) => (kind, tmpl) =>
  saveTemplate(dir, tmpl).catch((e) => { console.warn(`templates: could not save ${kind}: ${e?.message || e}`); });

// ── Browser store (localStorage) — the templates/ folder's in-browser twin ─────
// The Node helpers above read/write files; in the browser the durable memory is
// localStorage, one JSON map under `eo_templates`. Same role: seed a library, persist
// what it learns, and let a viewer (templates.html) list them. Browser-safe — a missing
// or throwing `localStorage` degrades to empty/no-op, never an error.
export const LOCAL_KEY = 'eo_templates';
const safeStorage = (s) => s || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null) || null;

const readMap = (storage) => {
  const s = safeStorage(storage);
  if (!s) return {};
  try { return JSON.parse(s.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
};
const writeMap = (map, storage) => {
  const s = safeStorage(storage);
  if (!s) return;
  try { s.setItem(LOCAL_KEY, JSON.stringify(map)); } catch { /* quota / disabled — best effort */ }
};

// loadTemplatesLocal(storage?) → { kind: template } seed map, validated, for
// createSpecLibrary({ seed }). Skips any malformed entry.
export const loadTemplatesLocal = (storage) => {
  const seed = {};
  for (const [kind, json] of Object.entries(readMap(storage))) {
    const t = templateFromJSON(json);
    if (t) seed[t.kind || kind] = t;
  }
  return seed;
};

// saveTemplateLocal(tmpl, storage?) → write one shape into the map (keyed by kind).
export const saveTemplateLocal = (tmpl, storage) => {
  if (!tmpl || !tmpl.kind) return;
  const map = readMap(storage);
  map[tmpl.kind] = templateToJSON(tmpl);
  writeMap(map, storage);
};

// removeTemplateLocal(kind, storage?) → forget a learned/installed shape.
export const removeTemplateLocal = (kind, storage) => {
  const map = readMap(storage);
  if (kind in map) { delete map[kind]; writeMap(map, storage); }
};

// templateLocalPersister(storage?) → an `onLearn(kind, tmpl)` for createSpecLibrary that
// persists to localStorage — the browser analogue of templatePersister(dir).
export const templateLocalPersister = (storage) => (kind, tmpl) => saveTemplateLocal(tmpl, storage);
