// EO: INS·NUL·CON·SEG(Void,Network → Entity,Link, Making,Binding,Tending) — encrypted append-only event store
//
// The durable substrate, pulled from amino (INTEGRATION-EOREADER4 B1) and re-cut
// for eoreader's native log. amino's thesis, verbatim: "rooms are tables, events
// are rows, fold(events) is the query, and the store holds only ciphertext it
// cannot read." A room's whole append-only event log lives as one encrypted byte
// file; the fold (src/core/project.js projectGraph) is the query over it.
//
// File format (v1), owned here — a backend (backends.js) only holds the bytes:
//
//   [MAGIC(4) "EOEV"]
//   [VERSION(2)]                 // 1
//   [NS_LEN(2)][NS(NS_LEN)]
//   [chunk]*                     // 0..N append chunks
//
//   chunk = [IV(12)][CT_LEN(4)][CT(CT_LEN)]   // CT decrypts to packBatch() bytes
//
// The chunk plaintext is exactly what pack.js packBatch() emits. On open we
// decrypt every chunk in order and header-scan the plaintext to rebuild the
// cursor + dedup state without decoding a single event body.
//
// The vault must be unlocked to persist. If it is locked (or absent) the store
// still opens and still accepts appends into memory — it just does not write to
// the backend, so the attached log keeps working on a device that has not
// unlocked yet (amino's memory-only fallback).

import { packBatch, unpackAll, unpackSince, scanMeta } from './pack.js';
import { vault as defaultVault } from './vault.js';
import { autoBackend } from './backends.js';

const MAGIC = new Uint8Array([0x45, 0x4f, 0x45, 0x56]); // "EOEV"
const VERSION = 1;
const IV_BYTES = 12;
const DEFAULT_NS = 'eo.events';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Small non-crypto hash for stable file names from arbitrary room ids.
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const roomFileName = (roomId) => `eoroom_${fnv1a32(String(roomId))}.bin`;
const checkpointFileName = (roomId) => `eoroom_${fnv1a32(String(roomId))}_checkpoint.bin`;

function makeHeader(namespace) {
  const nsBytes = encoder.encode(namespace);
  const buf = new ArrayBuffer(8 + nsBytes.length);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);
  arr.set(MAGIC, 0);
  view.setUint16(4, VERSION);
  view.setUint16(6, nsBytes.length);
  arr.set(nsBytes, 8);
  return arr;
}

function parseHeader(data) {
  if (!data || data.length < 8) return null;
  if (data[0] !== MAGIC[0] || data[1] !== MAGIC[1] || data[2] !== MAGIC[2] || data[3] !== MAGIC[3]) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint16(4);
  const nsLen = view.getUint16(6);
  if (data.length < 8 + nsLen) return null;
  const namespace = decoder.decode(data.subarray(8, 8 + nsLen));
  return { version, namespace, headerSize: 8 + nsLen };
}

export class EventStore {
  constructor({ roomId, namespace = DEFAULT_NS, vault = defaultVault, backend = null, checkpointBackend } = {}) {
    if (!roomId) throw new Error('EventStore requires a roomId');
    this.roomId = roomId;
    this.namespace = namespace;
    this._vault = vault;
    this._backend = backend;
    this._checkpointBackend = checkpointBackend; // undefined → auto; null → disabled
    this._headerSize = 0;
    this._headerWritten = false;
    this._maxSeq = -1;
    this._count = 0;
    this._cursor = 0;
    this._opened = false;
    this._appendQueue = Promise.resolve();
  }

  /** Resolve backends (from roomId when not injected) and rebuild cursor state. */
  async open() {
    if (!this._backend) this._backend = await autoBackend(roomFileName(this.roomId));
    if (this._checkpointBackend === undefined) {
      this._checkpointBackend = await autoBackend(checkpointFileName(this.roomId));
    }
    this._opened = true;

    const raw = await this._backend.read();
    if (!raw || raw.length === 0) return this;

    const header = parseHeader(raw);
    if (!header || header.version !== VERSION) {
      // Foreign or future format — refuse to touch it; treat as empty.
      console.warn('[store] unrecognized event file for', this.roomId, '— ignoring');
      return this;
    }
    this._headerSize = header.headerSize;
    this._headerWritten = true;

    if (!this._vault.isUnlocked()) return this; // locked — can't scan bodies yet

    const plain = await this._decryptChunks(raw.subarray(header.headerSize));
    const meta = scanMeta(plain);
    this._count = meta.count;
    this._maxSeq = meta.maxSeq;
    this._cursor = meta.maxT;
    return this;
  }

  /** Append the events whose seq is new (seq > cursor). Returns the accepted subset. */
  async append(events) {
    const run = this._appendQueue.then(() => this._doAppend(events));
    this._appendQueue = run.catch(() => {});
    return run;
  }

  async _doAppend(events) {
    if (!this._opened) await this.open();
    const fresh = [];
    for (const e of events || []) {
      const seq = Number(e?.seq);
      if (!Number.isFinite(seq) || seq <= this._maxSeq) continue;
      fresh.push(e);
      this._maxSeq = seq;
      if (Number(e.t) > this._cursor) this._cursor = Number(e.t);
    }
    if (fresh.length === 0) return [];
    this._count += fresh.length;

    // No key or no backend → in-memory only (the attached log still holds them).
    if (!this._vault.isUnlocked() || !this._backend) return fresh;

    const packed = packBatch(fresh);
    const chunk = await this._encryptChunk(packed);
    if (!this._headerWritten) {
      const header = makeHeader(this.namespace);
      this._headerSize = header.length;
      await this._backend.append(header);
      this._headerWritten = true;
    }
    await this._backend.append(chunk);
    return fresh;
  }

  /** Every stored event, decrypted and unpacked in order. [] when locked/empty. */
  async getAll() {
    const plain = await this._readPlaintext();
    return plain ? unpackAll(plain) : [];
  }

  /** Stored events with seq strictly greater than `sinceSeq`. */
  async getSince(sinceSeq = -1) {
    const plain = await this._readPlaintext();
    return plain ? unpackSince(plain, sinceSeq) : [];
  }

  async _readPlaintext() {
    if (!this._opened) await this.open();
    if (!this._vault.isUnlocked() || !this._backend) return null;
    const raw = await this._backend.read();
    const header = parseHeader(raw);
    if (!header || header.version !== VERSION) return null;
    return this._decryptChunks(raw.subarray(header.headerSize));
  }

  // ── chunk crypto ──

  async _encryptChunk(plaintext) {
    // vault.encryptBytes returns [iv(12)][ct]; repackage as [iv][ctLen][ct] so
    // the file stays walkable without a trial decrypt.
    const blob = await this._vault.encryptBytes(plaintext);
    const iv = blob.subarray(0, IV_BYTES);
    const ct = blob.subarray(IV_BYTES);
    const out = new Uint8Array(IV_BYTES + 4 + ct.length);
    out.set(iv, 0);
    new DataView(out.buffer).setUint32(IV_BYTES, ct.length);
    out.set(ct, IV_BYTES + 4);
    return out;
  }

  async _decryptChunks(body) {
    if (!body || body.length === 0) return new Uint8Array(0);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const parts = [];
    let offset = 0;
    while (offset + IV_BYTES + 4 <= body.length) {
      const iv = body.subarray(offset, offset + IV_BYTES);
      const ctLen = view.getUint32(offset + IV_BYTES);
      const ctStart = offset + IV_BYTES + 4;
      const ctEnd = ctStart + ctLen;
      if (ctEnd > body.length) break;
      const blob = new Uint8Array(IV_BYTES + ctLen);
      blob.set(iv, 0);
      blob.set(body.subarray(ctStart, ctEnd), IV_BYTES);
      try {
        parts.push(await this._vault.decryptBytes(blob));
      } catch (e) {
        // A tampered or wrong-key chunk fails AES-GCM auth — surface, skip, keep going.
        console.warn('[store] chunk decrypt failed at', offset, e?.message || e);
      }
      offset = ctEnd;
    }
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ── folded-state checkpoints (optional, encrypted, single-blob overwrite) ──

  /** Persist an encrypted snapshot of folded state so a cold open can skip the re-fold. */
  async saveCheckpoint(state) {
    if (!this._opened) await this.open();
    if (!this._vault.isUnlocked() || !this._checkpointBackend) return false;
    const payload = await this._vault.encryptJSON({
      cursor: this._cursor, maxSeq: this._maxSeq, count: this._count,
      savedAt: Number(state?.savedAt) || 0, state,
    });
    await this._checkpointBackend.clear();
    await this._checkpointBackend.append(payload);
    return true;
  }

  /** Load the last checkpoint, or null. Discards one that is ahead of the log. */
  async loadCheckpoint() {
    if (!this._opened) await this.open();
    if (!this._vault.isUnlocked() || !this._checkpointBackend) return null;
    const raw = await this._checkpointBackend.read();
    if (!raw || raw.length === 0) return null;
    try {
      const obj = await this._vault.decryptJSON(raw);
      if (Number(obj.maxSeq) > this._maxSeq) return null; // stale/ahead
      return obj;
    } catch {
      return null;
    }
  }

  getCursor() { return this._cursor; }
  getMaxSeq() { return this._maxSeq; }
  getCount() { return this._count; }
  hasData() { return this._count > 0; }

  async clear() {
    if (this._backend) await this._backend.clear();
    if (this._checkpointBackend) await this._checkpointBackend.clear();
    this._headerWritten = false;
    this._headerSize = 0;
    this._maxSeq = -1;
    this._count = 0;
    this._cursor = 0;
  }
}

/** Open a store for `roomId` in one call. */
export async function openEventStore(opts) {
  return new EventStore(opts).open();
}

export { roomFileName, checkpointFileName };
