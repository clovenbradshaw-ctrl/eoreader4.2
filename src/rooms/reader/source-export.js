// EO: NUL·CON(Source,Log → Record,Cursor, Clearing,Binding) — source export folds
// A source is not only its current text. It is its registry record, its parsed
// document, and the append-only log the reader folds to make every projection.
// These helpers keep that distinction explicit for downloads and tests.

const jsonLine = (x) => JSON.stringify(x);
const arr = (x) => Array.isArray(x) ? x : [];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clean = (x) => JSON.parse(JSON.stringify(x ?? null));

const sourceRecord = (src) => {
  if (!src) return null;
  const { _doc, _eot, _nlDoc, ...rest } = src;
  return clean(rest);
};

const docRecord = (doc) => doc ? clean({
  docId: doc.docId || null,
  modality: doc.modality || null,
  metadata: doc.metadata || null,
  metaFields: doc.metaFields || null,
  sentences: arr(doc.sentences),
  units: arr(doc.units),
  mentions: arr(doc.mentions),
  admission: doc.admission || null,
  state: doc.state || null,
}) : null;

const logEvents = (doc) => {
  const log = doc?.log;
  if (log && typeof log.snapshot === 'function') return log.snapshot();
  if (Array.isArray(log?.events)) return log.events.slice();
  return [];
};

const eventTouchesUnit = (e, idx) => {
  if (!Number.isInteger(idx)) return true;
  if (Number.isInteger(e?.sentIdx)) return e.sentIdx <= idx;
  if (Number.isInteger(e?.unitIdx)) return e.unitIdx <= idx;
  if (Array.isArray(e?.span) && isNum(e.span[0])) return e.span[0] <= idx;
  return true;
};

export const cursorFromTextPoint = (doc, point = {}) => {
  const text = String(doc?.text || arr(doc?.units).join('\n'));
  const units = arr(doc?.units).length ? arr(doc.units) : arr(doc?.sentences);
  let char = isNum(point) ? point : isNum(point?.char) ? point.char : isNum(point?.offset) ? point.offset : null;
  if (char == null && typeof point?.quote === 'string' && point.quote) char = text.indexOf(point.quote);
  if (char == null) char = 0;
  char = Math.max(0, Math.min(text.length, Math.floor(char)));
  let at = 0, unitIdx = Math.max(0, units.length - 1);
  for (let i = 0; i < units.length; i++) {
    const u = String(units[i] || '');
    const found = text.indexOf(u, at);
    const start = found >= 0 ? found : at;
    const end = start + u.length;
    if (char <= end) { unitIdx = i; break; }
    at = end;
  }
  return { kind: 'text', char, unitIdx, unit: units[unitIdx] || '' };
};

export const cursorFromLogTime = (doc, at) => {
  const events = logEvents(doc);
  const t = at instanceof Date ? at.getTime() : typeof at === 'string' ? Date.parse(at) : Number(at);
  const time = Number.isFinite(t) ? t : Date.now();
  let seq = -1;
  for (const e of events) if (Number(e?.t) <= time) seq = Math.max(seq, Number(e.seq ?? seq));
  return { kind: 'log-time', t: time, iso: new Date(time).toISOString(), seq };
};

export const exportSourceJsonl = ({ source, doc, eot = null } = {}) => {
  const events = logEvents(doc);
  const lines = [
    { type: 'source', source: sourceRecord(source) },
    { type: 'document', document: docRecord(doc) },
  ];
  if (eot) lines.push({ type: 'eot', eot: clean(eot) });
  for (const event of events) lines.push({ type: 'event', seq: event.seq ?? null, t: event.t ?? null, event: clean(event) });
  return lines.map(jsonLine).join('\n') + '\n';
};

// The full CURRENT state as one pretty JSON object — every sentence/unit/mention the parse holds,
// not a cursor-truncated slice. The JSON sibling of exportSourceJsonl's NDJSON history: same three
// folds (source · document · log), read as a single snapshot instead of an append-only stream.
export const exportSourceSnapshot = ({ source, doc, eot = null } = {}) => {
  const events = logEvents(doc);
  return JSON.stringify({
    type: 'source-snapshot', exportedAt: new Date().toISOString(),
    source: sourceRecord(source), document: docRecord(doc),
    eot: eot ? clean(eot) : null,
    log: { eventCount: events.length, events: clean(events) },
  }, null, 2);
};

export const exportSourceAtCursor = ({ source, doc, cursor = {}, eot = null } = {}) => {
  const mode = cursor?.mode || cursor?.kind || (cursor?.at || cursor?.timestamp || cursor?.time ? 'log-time' : 'text');
  const cur = mode === 'log-time' || mode === 'timestamp'
    ? cursorFromLogTime(doc, cursor.at ?? cursor.timestamp ?? cursor.time)
    : cursorFromTextPoint(doc, cursor);
  const events = logEvents(doc).filter(e => cur.kind === 'log-time' ? Number(e.seq ?? -1) <= cur.seq : eventTouchesUnit(e, cur.unitIdx));
  const units = arr(doc?.units).length ? arr(doc.units) : arr(doc?.sentences);
  const upto = cur.kind === 'text' ? units.slice(0, cur.unitIdx + 1) : units;
  return JSON.stringify({
    type: 'source-cursor', exportedAt: new Date().toISOString(), cursor: cur,
    source: sourceRecord(source), document: docRecord(doc),
    projection: { text: upto.join('\n'), units: upto },
    eot: eot ? clean(eot) : null,
    log: { eventCount: events.length, events: clean(events) },
  }, null, 2);
};

// A source title/sn, made safe for a filename — shared by every export (original + jsonl + json)
// so a source's downloads all sit under the same base name.
export const safeSourceName = (baseName, source) =>
  String(baseName || source?.title || source?.sn || 'source').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'source';

export const buildSourceExport = ({ source, doc, eot = null, format = 'jsonl', cursor = null, baseName = 'source' } = {}) => {
  const safe = safeSourceName(baseName, source);
  // A cursor was explicitly given → fold the point-in-time projection it names. No cursor → the
  // full current state (exportSourceSnapshot), not a truncated one folded at the default (char 0).
  if (format === 'cursor-json' && cursor) return { text: exportSourceAtCursor({ source, doc, eot, cursor }), ext: 'json', mime: 'application/json', filename: `${safe}.cursor.json` };
  if (format === 'json' || format === 'cursor-json') return { text: exportSourceSnapshot({ source, doc, eot }), ext: 'json', mime: 'application/json', filename: `${safe}.json` };
  return { text: exportSourceJsonl({ source, doc, eot }), ext: 'jsonl', mime: 'application/x-ndjson', filename: `${safe}.history.jsonl` };
};
