// EO: SIG(Field → Lens, Tending) — the PDF page surface: render a PDF's real pages, cross-platform
// The prior PDF surface was a bare <iframe src="blob:…">, leaning on the browser's own PDF plugin.
// That plugin doesn't exist on Android Chrome (an iframe/embed there shows blank or triggers a
// download instead of drawing pages), and iOS Safari has a long-standing bug where a blob: URL
// nested in an iframe fails to render even though the identical URL renders fine navigated to at
// the top level. Mobile users got a blank grey pane with no explanation.
//
// This surface never hands the browser a PDF to interpret — it reads the bytes itself and draws
// them: pdf.js (the same build already used for OCR rendering in eo/pdf-eyes.js) rasterises each
// page to its own <canvas>, lazily as the page scrolls into view, so every platform the app runs
// on draws identical pixels with no PDF plugin in the loop.
//   mountPdfView(el, { app, sn })  — drop the surface into any element. Returns { show, destroy }.

const PDFJS_VERSION = '4.8.69';
let pdfjsPromise = null;
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`).then((pdfjs) => {
      try { pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`; } catch {}
      return pdfjs;
    });
  }
  return pdfjsPromise;
};

const STYLE_ID = 'eo-pdfview-style';
const CSS = `
.eo-pdfview{display:flex;flex-direction:column;height:100%;background:#525659}
.eo-pdfview__bar{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 10px;background:#3a3d42;border-bottom:1px solid #24262a}
.eo-pdfview__bar button{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#D8D8DE;background:#4a4d52;border:1px solid #5a5d62;border-radius:6px;padding:4px 11px}
.eo-pdfview__bar button:disabled{opacity:.4}
.eo-pdfview__count{font-family:'IBM Plex Mono',monospace;font-size:11px;color:#D8D8DE;min-width:64px;text-align:center}
.eo-pdfview__pages{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 0 24px;display:flex;flex-direction:column;align-items:center;gap:14px}
.eo-pdfview__page{position:relative;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);flex:0 0 auto}
.eo-pdfview__page canvas{display:block;width:100%;height:100%}
.eo-pdfview__msg{margin:auto;padding:30px;text-align:center;color:#D8D8DE;font-size:13px;line-height:1.6}
.eo-pdfview__msg a,.eo-pdfview__msg button{color:#B9AEFF;font-weight:600;display:inline}
`;
const ensureStyle = (doc) => {
  if (doc.getElementById(STYLE_ID)) return;
  const st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; doc.head.appendChild(st);
};
const el = (doc, tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };
const msg = (doc, text) => { const m = el(doc, 'div', 'eo-pdfview__msg'); m.textContent = text; return m; };

// The bytes to feed pdf.js: the raw persisted copy when there is one (app.pdfBytes — OPFS, off
// the critical path of blob-URL creation), else the blob: URL the app already resolved for this
// source (app.pdfUrl), fetched back into bytes — fetch() reads a blob: URL reliably even on the
// platforms whose <iframe>/<embed> plugin can't render one.
const bytesFor = async (app, src) => {
  try {
    const raw = app.pdfBytes ? await app.pdfBytes(src) : null;
    if (raw && raw.length) return raw;
  } catch { /* fall through to the blob URL */ }
  try {
    const url = app.pdfUrl ? await app.pdfUrl(src) : (src._pdfUrl || null);
    if (!url) return null;
    const res = await fetch(url);
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
};

export const mountPdfView = (host, { app, sn = null } = {}) => {
  const doc = host.ownerDocument || document;
  ensureStyle(doc);
  host.innerHTML = '';
  const root = el(doc, 'div', 'eo-pdfview');
  host.appendChild(root);

  let curSn = sn, token = 0, io = null, pdfDoc = null, scale = 1;

  const source = () => (app && app.sourceBySn ? app.sourceBySn(curSn) : null);

  const teardown = () => {
    try { io && io.disconnect(); } catch {} io = null;
    try { pdfDoc && pdfDoc.destroy(); } catch {} pdfDoc = null;
  };

  const drawPage = async (my, pdf, n, wrap) => {
    if (wrap.dataset.drawnAt === String(scale)) return;
    const page = await pdf.getPage(n);
    if (my !== token) return;
    const vp = page.getViewport({ scale });
    let canvas = wrap.querySelector('canvas');
    if (!canvas) { canvas = doc.createElement('canvas'); wrap.appendChild(canvas); }
    canvas.width = Math.max(1, Math.ceil(vp.width));
    canvas.height = Math.max(1, Math.ceil(vp.height));
    wrap.style.width = vp.width + 'px';
    wrap.style.height = vp.height + 'px';
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (my !== token) return;
    wrap.dataset.drawnAt = String(scale);
  };

  const render = async () => {
    const my = ++token;
    teardown();
    root.innerHTML = '';
    const src = source();
    if (!src) { root.appendChild(msg(doc, 'No PDF loaded.')); return; }
    root.appendChild(msg(doc, 'Opening the PDF…'));

    const bytes = await bytesFor(app, src);
    if (my !== token) return;
    if (!bytes || !bytes.length) {
      root.innerHTML = '';
      root.appendChild(msg(doc, "The original PDF isn't available for this source — reimport it to see its pages."));
      return;
    }

    let pdfjs, pdf;
    try {
      pdfjs = await loadPdfjs();
      if (my !== token) return;
      pdf = await pdfjs.getDocument({ data: bytes }).promise;
      if (my !== token) { try { pdf.destroy(); } catch {} return; }
    } catch {
      if (my !== token) return;
      root.innerHTML = '';
      root.appendChild(msg(doc, "This PDF couldn't be rendered here."));
      return;
    }
    pdfDoc = pdf;
    root.innerHTML = '';

    const bar = el(doc, 'div', 'eo-pdfview__bar');
    const zoomOut = el(doc, 'button'); zoomOut.type = 'button'; zoomOut.textContent = '−'; zoomOut.title = 'Zoom out';
    const zoomIn = el(doc, 'button'); zoomIn.type = 'button'; zoomIn.textContent = '+'; zoomIn.title = 'Zoom in';
    const count = el(doc, 'span', 'eo-pdfview__count');
    count.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`;
    bar.appendChild(zoomOut); bar.appendChild(count); bar.appendChild(zoomIn);
    root.appendChild(bar);

    const pagesEl = el(doc, 'div', 'eo-pdfview__pages');
    root.appendChild(pagesEl);

    const page1 = await pdf.getPage(1);
    if (my !== token) return;
    const baseVp = page1.getViewport({ scale: 1 });
    const availWidth = (pagesEl.clientWidth || host.clientWidth || 600) - 24;
    scale = Math.max(0.4, Math.min(3, availWidth / baseVp.width));

    const wraps = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const wrap = el(doc, 'div', 'eo-pdfview__page');
      wrap.dataset.page = String(n);
      pagesEl.appendChild(wrap);
      wraps.push(wrap);
    }

    const redrawVisible = () => {
      const pr = pagesEl.getBoundingClientRect();
      for (const w of wraps) {
        const r = w.getBoundingClientRect();
        if (r.bottom > pr.top - 900 && r.top < pr.bottom + 900) drawPage(my, pdf, Number(w.dataset.page), w).catch(() => {});
      }
    };

    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win && win.IntersectionObserver) {
      io = new win.IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) drawPage(my, pdf, Number(en.target.dataset.page), en.target).catch(() => {});
      }, { root: pagesEl, rootMargin: '900px 0px' });
      wraps.forEach((w) => io.observe(w));
    } else {
      redrawVisible();   // no IntersectionObserver — draw everything currently in view once
    }

    const rescale = (next) => {
      scale = Math.max(0.4, Math.min(3, next));
      wraps.forEach((w) => { delete w.dataset.drawnAt; });
      redrawVisible();
    };
    zoomOut.onclick = () => rescale(scale - 0.2);
    zoomIn.onclick = () => rescale(scale + 0.2);
  };

  render();
  return {
    show: (nextSn) => { if (nextSn != null && nextSn !== curSn) { curSn = nextSn; render(); } },
    destroy: () => { teardown(); host.innerHTML = ''; },
  };
};
