#!/usr/bin/env node
// touchdesigner-bridge — the local companion process for the reader's pipeline surface
// (src/rooms/reader/pipeline-nodes.js's "TouchDesigner (OSC)" output node).
//
// A browser tab cannot open a raw UDP socket, and TouchDesigner's "OSC In" CHOP/DAT only speaks
// UDP — so this tiny process is the seam: the reader's TouchDesigner node opens a WebSocket to
// it and sends `{ address, args }` JSON; this forwards each one as a real OSC 1.0 packet over UDP
// to TouchDesigner, running on the SAME machine as this script (127.0.0.1 by default).
//
//   browser (pipeline surface) --WebSocket--> this bridge --OSC/UDP--> TouchDesigner
//
// Zero dependencies, on purpose — the whole repo ships with none (see package.json), and this
// runs standalone with plain Node (http + crypto for the WS handshake, dgram for OSC/UDP).
//
// Usage:
//   node tools/touchdesigner-bridge/bridge.mjs [--ws-port 8765] [--td-host 127.0.0.1] [--td-port 7000]
//
// TouchDesigner side: drop an "OSC In CHOP" (or "OSC In DAT" for raw messages) into your network,
// set its Network Port to match --td-port (7000 by default), protocol UDP. Addresses arrive
// exactly as the pipeline node's "OSC address" param names them (default /eo/pipeline).

import http from 'node:http';
import crypto from 'node:crypto';
import dgram from 'node:dgram';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── OSC 1.0 encoding — address + type-tag string + argument bytes, each OSC-string null- ──
// terminated and padded to a 4-byte boundary (the wire format TouchDesigner's OSC In expects).
const oscString = (str) => {
  const bytes = Buffer.from(`${str}\0`, 'utf8');
  const pad = (4 - (bytes.length % 4)) % 4;
  return pad ? Buffer.concat([bytes, Buffer.alloc(pad)]) : bytes;
};
const oscArg = (value) => {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < 2 ** 31) {
      const b = Buffer.alloc(4); b.writeInt32BE(value, 0); return { tag: 'i', bytes: b };
    }
    const b = Buffer.alloc(4); b.writeFloatBE(value, 0); return { tag: 'f', bytes: b };
  }
  return { tag: 's', bytes: oscString(String(value)) };
};
export const encodeOsc = (address, argList = []) => {
  const encoded = argList.map(oscArg);
  const typeTag = `,${encoded.map((a) => a.tag).join('')}`;
  return Buffer.concat([oscString(address), oscString(typeTag), ...encoded.map((a) => a.bytes)]);
};

// ── a minimal RFC 6455 WebSocket server — text frames only, exactly what the pipeline node sends ──
const acceptKeyFor = (key) => crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');

// Decodes ONE frame off the front of `buf`, or null if it doesn't hold a whole frame yet.
// Returns { opcode, payload, total } where `total` is how many bytes to drop from the buffer.
export const decodeFrame = (buf) => {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f, offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  let maskKey = null;
  if (masked) { if (buf.length < offset + 4) return null; maskKey = buf.subarray(offset, offset + 4); offset += 4; }
  if (buf.length < offset + len) return null;
  let payload = buf.subarray(offset, offset + len);
  if (masked) {
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i % 4];
    payload = out;
  }
  return { opcode, payload, total: offset + len };
};
export const encodeFrame = (payload, opcode = 0x1) => {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
};

// runBridge({ wsPort, tdHost, tdPort }) → starts the WS server + UDP socket and returns a
// `close()` to tear both down. Exported (rather than run as a bare top-level side effect) so
// tests can import this module's pure encoders without accidentally binding a real port.
export const runBridge = ({ wsPort = 8765, tdHost = '127.0.0.1', tdPort = 7000 } = {}) => {
  const udp = dgram.createSocket('udp4');
  const forwardToTouchDesigner = (address, argList) => {
    const packet = encodeOsc(address, argList);
    udp.send(packet, tdPort, tdHost, (err) => {
      if (err) console.error(`[td-bridge] UDP send failed: ${err.message}`);
      else console.log(`[td-bridge] → ${tdHost}:${tdPort} ${address} (${argList.length} arg${argList.length === 1 ? '' : 's'})`);
    });
  };
  const handleMessage = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { console.warn('[td-bridge] dropped a non-JSON message'); return; }
    const address = typeof msg.address === 'string' && msg.address ? msg.address : '/eo/pipeline';
    const argList = Array.isArray(msg.args) ? msg.args : [];
    forwardToTouchDesigner(address, argList);
  };

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('touchdesigner-bridge is up — connect a WebSocket here; this is not a browsable page.\n');
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKeyFor(key)}`,
      '\r\n',
    ].join('\r\n'));

    let buffered = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      for (;;) {
        const frame = decodeFrame(buffered);
        if (!frame) break;
        buffered = buffered.subarray(frame.total);
        if (frame.opcode === 0x8) { socket.end(); return; }               // close
        if (frame.opcode === 0x9) { socket.write(encodeFrame(frame.payload, 0xA)); continue; }   // ping → pong
        if (frame.opcode === 0x1) handleMessage(frame.payload.toString('utf8'));                 // text
      }
    });
    socket.on('error', () => { /* the pipeline surface will just reopen next send */ });
  });

  server.listen(wsPort, () => {
    console.log(`[td-bridge] listening ws://127.0.0.1:${wsPort} — forwarding to TouchDesigner (OSC/UDP) at ${tdHost}:${tdPort}`);
    console.log('[td-bridge] point the pipeline surface\'s TouchDesigner node\'s "Bridge WS URL" at the ws:// address above.');
  });

  return { close: () => { server.close(); udp.close(); } };
};

// Only bind real ports when this file is run directly (`node bridge.mjs`), never on import —
// so tests can pull in encodeOsc/decodeFrame/encodeFrame without side effects.
const isMain = () => {
  try { return process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]; } catch { return false; }
};
if (isMain()) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  runBridge({
    wsPort: Number(flag('ws-port', 8765)),
    tdHost: flag('td-host', '127.0.0.1'),
    tdPort: Number(flag('td-port', 7000)),
  });
}
