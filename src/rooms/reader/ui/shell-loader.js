// EO: SIG·INS(Network,Void → Field,Link, Tending,Binding) — the boot-shell loader
// The one seam between the static shell (index.html) and the DC surface it used to carry inline.
// index.html no longer embeds the <x-dc> template or the <script data-dc-script> controller —
// this module fetches shell.template.html + shell.logic.js (and starts shell.css loading) in
// parallel, builds the same two elements support.js's dc-runtime expects (parseDcDocument reads
// document.querySelector('x-dc') and 'script[data-dc-script]'), appends them, and calls the
// runtime's own window.__dcBoot() — the exact entry point support.js already exposes for a
// surface that mounts after the runtime is up (see support.js `init()` / `boot()`). The reader
// surface's Component constructor already tolerates mounting before window.EO exists (it adopts
// the engine on the later 'eo:ready' event), so fetching these two files first changes nothing
// the surface wasn't already built to handle.
const BASE = new URL('.', import.meta.url);
const url = (name) => new URL(name, BASE).href;

// data-props from the original inline <script data-dc-script data-props="...">
// ({"$preview":{"width":1440,"height":900}}) — the dc-runtime's own preview-size metadata.
const DC_PROPS = { $preview: { width: 1440, height: 900 } };

function fetchText(name) {
  return fetch(url(name)).then((res) => {
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText}`);
    return res.text();
  });
}

function waitForDcRuntime(timeoutMs = 15000) {
  if (typeof window.__dcBoot === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (typeof window.__dcBoot === 'function') {
        clearInterval(iv);
        clearTimeout(to);
        resolve();
      }
    }, 30);
    const to = setTimeout(() => {
      clearInterval(iv);
      reject(new Error('dc-runtime (support.js) never initialised'));
    }, timeoutMs);
  });
}

async function mount() {
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = url('shell.css');
  document.head.appendChild(cssLink);

  const [template, logic] = await Promise.all([
    fetchText('shell.template.html'),
    fetchText('shell.logic.js'),
  ]);
  await waitForDcRuntime();

  const dc = document.createElement('x-dc');
  dc.innerHTML = template;

  const script = document.createElement('script');
  script.type = 'text/x-dc';
  script.setAttribute('data-dc-script', '');
  script.setAttribute('data-props', JSON.stringify(DC_PROPS));
  script.textContent = logic;

  document.body.appendChild(dc);
  document.body.appendChild(script);

  window.__dcBoot();
}

mount().catch((err) => {
  // Left to the static failsafe (index.html's inline boot script): its own timers show the
  // reload prompt if #dc-root never appears. Surfacing the real cause here just helps debugging.
  console.error('[shell-loader] failed to mount the reader surface:', err);
});
