// EO: CON·SIG(Link,Entity → Link, Binding) — the relation-arc renderer
// draw.js — the one piece of the surface that must MEASURE the laid-out DOM: the Structure·
// Figure arcs. Given the overlay model and the mounted doc, it draws a smooth curve from each
// relation's subject to its object, with a small pill label at the apex. Arcs sharing a line
// are stacked so their labels never collide. Positive relations are solid, negative dashed.
//
// It reads the DOM but owns no state; the surface calls it after every render (and on resize).

import { esc, cssEsc } from './theme.js';

// The union top/centre of every element matching `sel`, preferring those in `preferSent`.
const anchor = (doc, docRect, sel, preferSent) => {
  let els = [...doc.querySelectorAll(sel)];
  if (!els.length) return null;
  const same = els.filter((e) => e.dataset.sent === String(preferSent));
  if (same.length) els = same;
  const rs = els.map((e) => e.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)) - docRect.left;
  const right = Math.max(...rs.map((r) => r.right)) - docRect.left;
  const top = Math.min(...rs.map((r) => r.top)) - docRect.top;
  return { x: (left + right) / 2, y: top };
};

export function drawArcs(shell, model) {
  const svg = shell.querySelector('.tr-arcs');
  const doc = shell.querySelector('.tr-doc');
  const oldLabels = shell.querySelector('.tr-alabels');
  if (oldLabels) oldLabels.remove();
  if (!svg || !doc) return;
  if (!model.arcs.length) { svg.innerHTML = ''; return; }

  requestAnimationFrame(() => {
    const dr = doc.getBoundingClientRect();
    const labels = document.createElement('div');
    labels.className = 'tr-alabels';
    const tier = {};   // arcs on the same line get stacked apexes so labels never collide
    let parts = '';
    for (const arc of model.arcs) {
      const from = arc.hasFrom ? anchor(doc, dr, `[data-ent="${cssEsc(arc.from)}"]`, arc.sent) : null;
      const to = arc.hasTo ? anchor(doc, dr, `[data-ent="${cssEsc(arc.to)}"]`, arc.sent)
        : anchor(doc, dr, `[data-rel="${cssEsc(arc.rel)}"]`, arc.sent);
      if (!from || !to) continue;
      const neg = arc.polarity === '−';
      const col = neg ? 'var(--neg)' : 'var(--pos)';
      const n = (tier[arc.sent] = (tier[arc.sent] || 0) + 1) - 1;   // 0,1,2… within a line
      const lift = Math.min(22, 12 + Math.abs(to.x - from.x) * 0.045) + n * 15;
      const cy = Math.max(14, Math.min(from.y, to.y) - lift);
      const mx = (from.x + to.x) / 2;
      // A smooth cubic that leaves each endpoint vertically, so the curve reads as a bond,
      // not a taut string. Control points sit above each endpoint.
      const c1y = from.y - lift * 0.7, c2y = to.y - lift * 0.7;
      parts += `<path d="M${from.x} ${from.y - 2} C${from.x} ${c1y} ${mx} ${cy} ${mx} ${cy}
        S${to.x} ${c2y} ${to.x} ${to.y - 2}" fill="none" stroke="${col}" stroke-width="1.75"
        ${neg ? 'stroke-dasharray="1 5" stroke-linecap="round"' : ''} opacity="0.72"/>`;
      parts += `<circle cx="${to.x}" cy="${to.y - 2}" r="2.4" fill="${col}" opacity="0.9"/>`;
      // Arcs stacked on one line share an x near their overlap; nudge the upper labels
      // sideways so two pills never sit on top of each other.
      const dx = n === 0 ? 0 : (n % 2 ? 1 : -1) * 34 * Math.ceil(n / 2);
      const lab = document.createElement('div');
      lab.className = 'tr-al';
      lab.style.left = (mx + dx) + 'px';
      lab.style.top = (cy - 3) + 'px';
      lab.innerHTML = esc(arc.rel);
      labels.appendChild(lab);
    }
    svg.setAttribute('viewBox', `0 0 ${doc.clientWidth} ${doc.scrollHeight}`);
    svg.style.height = doc.scrollHeight + 'px';
    svg.innerHTML = parts;
    doc.appendChild(labels);
  });
}
