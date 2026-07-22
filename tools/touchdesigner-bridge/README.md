# TouchDesigner bridge

The reader's pipeline surface (Sources tab → **Surface**) can wire any source's derivations —
its transcript, its waveform, its admitted characters, a text's recurring motifs — to a
**TouchDesigner (OSC)** output node. A browser tab can't open a raw UDP socket, and
TouchDesigner's OSC In CHOP/DAT only speaks UDP, so this small script is the seam:

```
browser (pipeline surface) --WebSocket--> bridge.mjs --OSC/UDP--> TouchDesigner
```

It has **zero dependencies** (matching the rest of this repo — see `package.json`): the WebSocket
server is hand-rolled from `http` + `crypto`, and OSC packets go out over Node's built-in `dgram`.

## Run it

```sh
node tools/touchdesigner-bridge/bridge.mjs
# [td-bridge] listening ws://127.0.0.1:8765 — forwarding to TouchDesigner (OSC/UDP) at 127.0.0.1:7000
```

Flags (all optional):

| flag | default | meaning |
|---|---|---|
| `--ws-port` | `8765` | where the browser's pipeline surface connects |
| `--td-host` | `127.0.0.1` | where TouchDesigner is running |
| `--td-port` | `7000` | TouchDesigner's OSC In network port |

## Set up TouchDesigner

1. Add an **OSC In CHOP** (numeric channels) or **OSC In DAT** (raw address/args) to your network.
2. Set its **Network Port** to match `--td-port` (`7000` by default) and protocol to **UDP**.
3. Messages arrive at whatever address the pipeline node's **OSC address** param names
   (default `/eo/pipeline`) — an OSC In CHOP turns that into a channel automatically.

## Set up the pipeline surface

In the app, open **Sources → Surface**, add a **TouchDesigner (OSC)** node, and wire any upstream
node (Waveform, Characters, Motifs, Transcript, or a raw Source) into it. Its two params:

- **Bridge WS URL** — `ws://127.0.0.1:8765` by default; only change this if you started the bridge
  on a different `--ws-port`, or are reaching a bridge on another machine on your LAN.
- **OSC address** — the OSC path TouchDesigner will see this node's data arrive under.

Running the graph opens (or reuses) a WebSocket to the bridge and sends `{ address, args }` once
per run; the bridge encodes it as a real OSC 1.0 packet and forwards it over UDP to TouchDesigner.
Numeric series (a waveform) become one float arg per sample; a character/motif list becomes
alternating `(label, weight)` args; plain text is truncated to 512 chars as a single string arg.

## Multiple TouchDesigner nodes / repeated runs

The pipeline surface keeps one open WebSocket per bridge URL and reuses it across nodes and runs,
so wiring several TouchDesigner nodes to the same bridge (or re-running the graph repeatedly)
doesn't reopen a new connection each time.

## Security note

This bridge has no authentication and binds to `127.0.0.1` by default — it is meant to run on the
same machine as both the browser tab and TouchDesigner. Don't point `--ws-port` at a
publicly-reachable interface without adding your own access control in front of it.
