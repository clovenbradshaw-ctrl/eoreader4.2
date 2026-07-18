// Unit tests for the TouchDesigner bridge's wire encoders (tools/touchdesigner-bridge/bridge.mjs)
// — the OSC 1.0 packet builder and the minimal WebSocket frame codec. Importing the module must
// NOT bind any real port/socket (runBridge only runs when the file is executed directly), so this
// just exercises the pure encode/decode functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeOsc, encodeFrame, decodeFrame } from '../tools/touchdesigner-bridge/bridge.mjs';

// A small OSC decoder, independent of the encoder under test, so a round trip actually proves
// the wire format (address / type-tag / args each null-terminated + 4-byte padded) rather than
// just mirroring the same code back at itself.
function decodeOsc(buf) {
  const readOscString = (offset) => {
    let end = offset;
    while (buf[end] !== 0) end++;
    const str = buf.toString('utf8', offset, end);
    const total = end + 1;
    const padded = total + ((4 - (total % 4)) % 4);
    return { str, next: padded };
  };
  const { str: address, next: n1 } = readOscString(0);
  const { str: typeTag, next: n2 } = readOscString(n1);
  let offset = n2;
  const args = [];
  for (const tag of typeTag.slice(1)) {
    if (tag === 'i') { args.push(buf.readInt32BE(offset)); offset += 4; }
    else if (tag === 'f') { args.push(buf.readFloatBE(offset)); offset += 4; }
    else if (tag === 's') { const { str, next } = readOscString(offset); args.push(str); offset = next; }
  }
  return { address, typeTag, args };
}

test('encodeOsc round-trips address + mixed int/float/string args', () => {
  const packet = encodeOsc('/eo/pipeline', [3, 1.5, 'ahab']);
  assert.equal(packet.length % 4, 0, 'every OSC block is 4-byte aligned');
  const decoded = decodeOsc(packet);
  assert.equal(decoded.address, '/eo/pipeline');
  assert.equal(decoded.typeTag, ',ifs');
  assert.equal(decoded.args[0], 3);
  assert.ok(Math.abs(decoded.args[1] - 1.5) < 1e-6);
  assert.equal(decoded.args[2], 'ahab');
});

test('encodeOsc handles an empty arg list (bare address ping)', () => {
  const packet = encodeOsc('/eo/ping', []);
  const decoded = decodeOsc(packet);
  assert.equal(decoded.address, '/eo/ping');
  assert.equal(decoded.typeTag, ',');
  assert.deepEqual(decoded.args, []);
});

test('WS frame codec: an unmasked server→client frame decodes back to the same payload', () => {
  const payload = Buffer.from(JSON.stringify({ hello: 'world' }));
  const frame = encodeFrame(payload, 0x1);
  const decoded = decodeFrame(frame);
  assert.equal(decoded.opcode, 0x1);
  assert.deepEqual(decoded.payload, payload);
  assert.equal(decoded.total, frame.length);
});

test('WS frame codec: a masked client→server frame is unmasked correctly', () => {
  const payloadText = JSON.stringify({ address: '/eo/x', args: [1, 2] });
  const payload = Buffer.from(payloadText, 'utf8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  const header = Buffer.from([0x81, 0x80 | payload.length]);   // fin+text, masked bit + len<126
  const frame = Buffer.concat([header, mask, masked]);
  const decoded = decodeFrame(frame);
  assert.equal(decoded.opcode, 0x1);
  assert.equal(decoded.payload.toString('utf8'), payloadText);
});

test('WS frame codec: returns null on a partial frame (more bytes still to arrive)', () => {
  const payload = Buffer.from('x'.repeat(200));
  const frame = encodeFrame(payload, 0x1);
  assert.equal(decodeFrame(frame.subarray(0, 3)), null);
});
