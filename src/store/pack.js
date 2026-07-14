// EO: SEG·DEF(Network → Field, Dissecting,Unraveling) — binary event codec
//
// The compact wire format for eoreader's log events. The append-only log
// (src/core/log.js) carries sealed events of the shape { op, seq, t, eo?,
// ...fields } — the operator, a monotonic per-log sequence, a timestamp, the
// sealed cube geometry, and arbitrary operator payload at the top level. So the
// body here is the WHOLE event as UTF-8 JSON (lossless round-trip), and the fixed
// header carries just enough to scan without decoding a body:
//
//   ┌───────────────────────────────────────┐
//   │ op_code    : uint8   (1 byte)  │  HELIX index of event.op (0..8)
//   │ flags      : uint8   (1 byte)  │  reserved (redacted, …)
//   │ timestamp  : uint48  (6 bytes) │  event.t (ms since epoch)
//   │ seq        : uint32  (4 bytes) │  event.seq — the per-log dedup/cursor key
//   │ body_len   : uint32  (4 bytes) │  byte length of the JSON body
//   ├───────────────────────────────────────┤
//   │ body       : [u8]    (variable)│  UTF-8 JSON of the full event object
//   └───────────────────────────────────────┘
//
// Total: 16 + body_len per event. Sequential scans read at memory bandwidth; a
// header-only walk yields count / max-seq / max-t without touching any body.

// The nine operators in dependency (helix) order — the order eoreader's HELIX
// (src/core/contract.js) fixes. Index ⇄ op is stable, so the on-disk op_code
// never depends on spelling.
const ORDER = ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC'];
const OP_TO_ORDER = Object.freeze(Object.fromEntries(ORDER.map((op, i) => [op, i])));

export const HEADER_SIZE = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const opOrderOf = (op) => (op in OP_TO_ORDER ? OP_TO_ORDER[op] : 0);

/** Pack a single sealed log event into a Uint8Array. */
export function packEvent(event) {
  return packBatch([event]);
}

/** Pack many events into one contiguous buffer (cheaper than concatenating). */
export function packBatch(events) {
  const bodies = events.map((e) => encoder.encode(JSON.stringify(e)));
  const total = events.length * HEADER_SIZE + bodies.reduce((s, b) => s + b.length, 0);

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  let offset = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const body = bodies[i];
    const ts = Number(e.t) || 0;
    const seq = (Number(e.seq) || 0) >>> 0;

    view.setUint8(offset, opOrderOf(e.op));
    view.setUint8(offset + 1, 0); // flags — reserved
    view.setUint16(offset + 2, (ts / 0x100000000) & 0xffff); // ts high 16
    view.setUint32(offset + 4, ts >>> 0);                    // ts low 32
    view.setUint32(offset + 8, seq);
    view.setUint32(offset + 12, body.length);
    arr.set(body, offset + HEADER_SIZE);

    offset += HEADER_SIZE + body.length;
  }

  return arr;
}

/**
 * Unpack every event from a packed buffer, in order. Each returned object is the
 * event exactly as it was packed (the JSON body); the header fields are trusted
 * only for the fast-path scans below, never to reconstruct payload.
 */
export function unpackAll(data) {
  if (!data || data.length === 0) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const events = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= data.length) {
    const bodyLength = view.getUint32(offset + 12);
    if (offset + HEADER_SIZE + bodyLength > data.length) break; // truncated tail
    const bodySlice = data.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + bodyLength);
    let event;
    try { event = JSON.parse(decoder.decode(bodySlice)); } catch { event = null; }
    if (event) events.push(event);
    offset += HEADER_SIZE + bodyLength;
  }
  return events;
}

/**
 * Unpack only events with seq STRICTLY GREATER than `sinceSeq`. Walks headers
 * (no body decode) and only parses the bodies past the cursor — for a store of
 * 100k events where 10 are new, this skips 99,990 JSON parses.
 */
export function unpackSince(data, sinceSeq = -1) {
  if (!data || data.length === 0) return [];
  if (sinceSeq < 0) return unpackAll(data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const events = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= data.length) {
    const seq = view.getUint32(offset + 8);
    const bodyLength = view.getUint32(offset + 12);
    if (offset + HEADER_SIZE + bodyLength > data.length) break;
    if (seq > sinceSeq) {
      const bodySlice = data.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + bodyLength);
      try { events.push(JSON.parse(decoder.decode(bodySlice))); } catch { /* skip corrupt */ }
    }
    offset += HEADER_SIZE + bodyLength;
  }
  return events;
}

/**
 * Header-only scan: { count, maxSeq, maxT, byOp }. Body bytes are never touched,
 * so this is a byte-stride loop — used to rebuild the cursor/dedup state on open
 * without decoding a single event payload.
 */
export function scanMeta(data) {
  const out = { count: 0, maxSeq: -1, maxT: 0, byOp: new Array(9).fill(0) };
  if (!data || data.length === 0) return out;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + HEADER_SIZE <= data.length) {
    const opOrder = view.getUint8(offset);
    const tsHi = view.getUint16(offset + 2);
    const tsLo = view.getUint32(offset + 4);
    const ts = tsHi * 0x100000000 + tsLo;
    const seq = view.getUint32(offset + 8);
    const bodyLength = view.getUint32(offset + 12);
    if (offset + HEADER_SIZE + bodyLength > data.length) break;

    out.count++;
    if (seq > out.maxSeq) out.maxSeq = seq;
    if (ts > out.maxT) out.maxT = ts;
    if (opOrder < 9) out.byOp[opOrder]++;
    offset += HEADER_SIZE + bodyLength;
  }
  return out;
}

export { ORDER as OP_ORDER };
