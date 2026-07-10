// EO: SIG(Network → Atmosphere, Tending) — model-host reachability probe
// When NO local model can load, the error the runtimes surface is almost never the
// cause — a school/corporate filter that blocks huggingface.co reads as a bare
// "network error" after minutes of a silent 0%. This module answers the one
// question that error can't: WHICH origin is unreachable from here. The probes are
// `no-cors` HEADs — an opaque response proves the network path works (we never read
// the body), a rejection proves it doesn't; that distinction needs no CORS headers
// on the far side. Fail-soft everywhere: no fetch (Node/tests) or a probe fault
// reads as "unknown", never as a verdict, and explainReach says nothing it can't
// stand behind.

// Every origin the local model path actually touches, and what it carries — so the
// failure note can say what is lost, not just name a hostname.
export const MODEL_ORIGINS = Object.freeze([
  { origin: 'https://cdn.jsdelivr.net',          role: 'the model runtimes' },
  { origin: 'https://huggingface.co',            role: 'the model weights' },
  { origin: 'https://raw.githubusercontent.com', role: 'the WebGPU kernels' },
]);

// Probe each origin: ok true / false / null (could not probe — unknown, not a
// verdict). `fetchImpl` is injectable for tests; absent fetch ⇒ all-unknown.
export const probeOrigins = async (origins = MODEL_ORIGINS, fetchImpl = undefined, timeoutMs = 3500) => {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return origins.map((o) => ({ ...o, ok: null }));
  return Promise.all(origins.map(async (o) => {
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        await f(`${o.origin}/`, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', ...(ctrl ? { signal: ctrl.signal } : {}) });
        return { ...o, ok: true };     // opaque or not — the wire answered
      } finally { if (timer) clearTimeout(timer); }
    } catch { return { ...o, ok: false }; }
  }));
};

// One honest sentence from the probe results — or '' when there is nothing to
// add (all reachable, or nothing provable). Pure; the unit under test.
export const explainReach = (results = []) => {
  const down = results.filter((r) => r && r.ok === false);
  if (!down.length) return '';
  const names = down.map((r) => {
    try { return new URL(r.origin).host; } catch { return String(r.origin); }
  });
  const roles = [...new Set(down.map((r) => r.role).filter(Boolean))];
  return `this network can't reach ${names.join(' or ')}` +
    (roles.length ? ` (${roles.join(', ')})` : '') +
    ' — try another network or VPN, or pick Claude · hosted API from the model chip';
};
