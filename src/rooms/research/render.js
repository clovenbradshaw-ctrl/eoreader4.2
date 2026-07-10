// EO: NUL(Network → Void, Clearing) — report → HTML renderer
// research/render.js — the report projector's output: projectReport → HTML
// (the deep-research template, now real; docs/deep-research-log.md).
//
// A readable serif summary with each factual clause tethered to a grounded
// finding; the mono evidence layer with exact spans, archive pins,
// corroboration counts, contradiction flags; the questions-asked band; the
// coverage grid; the convergence badge; the collapsible trace. Pure string
// work over the frozen projection — rendering twice yields identical bytes,
// because the report IS the log made visible.

import { spanAnchor } from '../archive/pin.js';
import { describeEvent, coverageSummary, coverageNote } from './live.js';
import { OPERATORS } from '../../core/operators.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BADGES = {
  settled:    ['#166534', '#dcfce7', 'settled — the analysis converges'],
  converging: ['#166534', '#dcfce7', 'converging — restructurings growing rare'],
  contested:  ['#92400e', '#fef3c7', 'contested — the reading keeps restructuring'],
  thrash:     ['#991b1b', '#fee2e2', 'thrash — oscillation, read with care'],
  open:       ['#3730a3', '#e0e7ff', 'open — nothing grounded yet'],
};

// The inner report markup — embedded by the surface, wrapped by renderReportHTML
// for the standalone artifact. Every claim is tethered: a summary sentence that
// bound carries a superscript link to its proposition; glue is greyed and
// carries no claim; every proposition shows its exact span, embedded, with the
// pin as corroboration.
export const renderReportFragment = (report, { title = null } = {}) => {
  const r = report;
  const pinById = r.pinById || {};
  const propById = Object.fromEntries(r.propositions.map((p) => [p.id, p]));
  const num = new Map(r.propositions.map((p, i) => [p.id, i + 1]));
  const [bFg, bBg, bLabel] = BADGES[r.convergence.badge] || BADGES.open;

  const h = [];
  h.push(`<div class="dr-report">`);
  h.push(`<header class="dr-head">`);
  h.push(`<h1>${esc(title || r.root?.question || 'Deep research')}</h1>`);
  h.push(`<div class="dr-meta">`);
  h.push(`<span class="dr-badge" style="color:${bFg};background:${bBg}">${esc(bLabel)}</span>`);
  h.push(`<span>${r.pins.length} pinned source${r.pins.length === 1 ? '' : 's'}</span>`);
  h.push(`<span>${r.propositions.length} grounded proposition${r.propositions.length === 1 ? '' : 's'}</span>`);
  h.push(`<span>${r.recs.length} reframing${r.recs.length === 1 ? '' : 's'}</span>`);
  if (r.verify.sections) h.push(`<span>${r.verify.bound} of ${r.verify.sentences} sentence${r.verify.sentences === 1 ? '' : 's'} bound to a passage · ${r.verify.glue} connective${r.verify.dropped ? ` · ${r.verify.dropped} dropped` : ''}</span>`);
  h.push(`</div></header>`);

  // Sections — the frame tree, evidence in significance order. The FIRST root
  // is the title; later roots (follow-up asks appended to the same log — the
  // live surface growing) get their own headings.
  for (let si = 0; si < r.sections.length; si++) {
    const sec = r.sections[si];
    h.push(`<section class="dr-section" style="margin-left:${sec.depth * 18}px">`);
    if (si > 0) h.push(`<h2>${esc(sec.question)}</h2>`);

    // The phrased summary, tethered clause by clause — the claim-to-span link
    // must be LEGIBLE, not just present: the citation shows its span on hover,
    // and clicking it jumps to (and highlights) the exact evidence block below.
    // Glue is visibly glue and carries no number at all.
    if (sec.phrase) {
      h.push(`<p class="dr-summary">`);
      for (const s of sec.phrase.sentences) {
        if (s.glue) h.push(`<span class="dr-glue" title="glue — carries no claim">${esc(s.text)}</span> `);
        else h.push(`<span class="dr-claim">${esc(s.text)}<a class="dr-cite" href="#${esc(s.boundTo)}" title="&ldquo;${esc(propById[s.boundTo]?.span.text ?? '')}&rdquo; — click to see the span">[${num.get(s.boundTo) ?? '•'}]</a></span> `);
      }
      h.push(`</p>`);
    }

    // Voids — the measured absences are findings, not omissions.
    for (const v of sec.voids) {
      h.push(`<p class="dr-void">The record is silent here — <strong>${esc(v.terrain)}</strong>${v.term ? ` (${esc(v.term)})` : ''}; ${esc(v.receipt)}.</p>`);
    }

    // The evidence layer: exact spans, embedded, in significance order.
    if (sec.propositions.length) {
      h.push(`<ol class="dr-evidence">`);
      for (const p of sec.propositions) {
        const pin = pinById[p.pinId];
        const anchor = pin ? spanAnchor(pin, p.span) : '';
        const flags = [];
        if (p.recForcing) flags.push(`<span class="dr-flag dr-flag-rec" title="this span forced a reframing">REC-forcing</span>`);
        if (p.corroboratedBy.length) flags.push(`<span class="dr-flag dr-flag-cor">corroborated ×${p.corroboratedBy.length}</span>`);
        if (p.contradictedBy.length) flags.push(`<span class="dr-flag dr-flag-con" title="contradicted by ${esc(p.contradictedBy.join(', '))}">contradicted</span>`);
        if (p.eva?.verdict === 'confirm') flags.push(`<span class="dr-flag dr-flag-bg">corroboration</span>`);
        h.push(`<li id="${esc(p.id)}" class="dr-prop">`);
        h.push(`<blockquote>&ldquo;${esc(p.span.text)}&rdquo;</blockquote>`);
        h.push(`<div class="dr-provenance">`);
        h.push(`<span class="dr-propnum">[${num.get(p.id)}]</span>`);
        if (pin) {
          const label = pin.title || pin.url || 'pinned source';
          h.push(anchor
            ? `<a href="${esc(anchor)}" target="_blank" rel="noopener">${esc(label)}</a>`
            : `<span>${esc(label)}</span>`);
          h.push(pin.snapshotUrl
            ? `<span title="archive snapshot">pinned ${esc(pin.capturedAt ?? pin.snapshotId ?? '')}</span>`
            : `<span title="archive unreachable — the embedded span is the record">local pin</span>`);
          h.push(`<span class="dr-hash" title="content hash of the pinned bytes">${esc(pin.contentHash)}</span>`);
        }
        h.push(`<span>chars ${p.span.start}–${p.span.end}</span>`);
        h.push(flags.join(''));
        h.push(`</div></li>`);
      }
      h.push(`</ol>`);
    }
    h.push(`</section>`);
  }

  // Coverage — the operator-code grid rewritten in plain language: claims found,
  // how many bind to a real quote, the model's connective glue, what was set
  // aside, sources read, and the share of the answer bound to the record. Same
  // fold the cube reads, said the way a person asks after a run.
  h.push(`<section class="dr-coverage"><h2>Coverage</h2><div class="dr-cov">`);
  for (const c of coverageSummary(r)) {
    h.push(`<div class="dr-cov-cell dr-cov-${c.tone}"><b>${esc(String(c.value))}</b><span>${esc(c.label)}</span></div>`);
  }
  h.push(`</div>`);
  h.push(`<p class="dr-covnote">${esc(coverageNote(r))}</p>`);
  // The cube's empty cells and residue stay as honest QA — what the run did not
  // reach — but they no longer front the coverage read.
  if (r.coverage.emptyCells.length) {
    h.push(`<p class="dr-gaps">Unreached facets of the cube: ${r.coverage.emptyCells.map((c) => `<b>${c.op}</b> (${esc(c.triage)})`).join(' · ')} — each a triaged absence or a gap to research, not a smoothing-over.</p>`);
  }
  if (r.coverage.residue.length) {
    h.push(`<p class="dr-residue">Residue — off the Object diagonal, the frame is incomplete: ${r.coverage.residue.map((x) => `${esc(x.propId)} (${esc(x.reason)})`).join('; ')}.</p>`);
  }
  h.push(`</section>`);

  // What to check next — the gaps the run measured, read-only. These were once
  // blocking questions; on a research surface they belong here as next steps, not
  // as a modal that parks the run. Answered ones show their resolution.
  if (r.questions.length) {
    h.push(`<section class="dr-questions"><h2>What to check next</h2><ul>`);
    for (const { ask, answer } of r.questions) {
      h.push(`<li><span class="dr-trigger">${esc(ask.trigger)}</span> ${esc(ask.text)}${answer ? `<div class="dr-reply">↳ ${esc(answer.reply)}</div>` : ''}</li>`);
    }
    h.push(`</ul></section>`);
  }

  h.push(`</div>`);
  return h.join('\n');
};

// The collapsible trace — the log itself, one line per event. The report is a
// projection; the trace is the projection showing its working.
export const renderTraceFragment = (log) => {
  const h = [`<details class="dr-trace"><summary>Trace — ${log.length} events (the log the report is projected from)</summary><ol>`];
  for (const e of log) h.push(`<li><code>${esc(e.kind)}</code> ${esc(describeEvent(e))}</li>`);
  h.push(`</ol></details>`);
  return h.join('\n');
};

export const REPORT_CSS = `
.dr-report{font-family:Georgia,'Times New Roman',serif;color:#1a1c20;line-height:1.55;max-width:760px;margin:0 auto;padding:8px 4px 40px}
.dr-report h1{font-size:26px;margin:0 0 10px;line-height:1.25}
.dr-report h2{font-size:16px;margin:26px 0 8px}
.dr-meta{display:flex;flex-wrap:wrap;gap:10px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#5b6572;align-items:center}
.dr-badge{padding:2px 9px;border-radius:99px;font-weight:700}
.dr-summary{font-size:15.5px;margin:10px 0}
.dr-claim a.dr-cite{font-size:10px;vertical-align:super;text-decoration:none;color:#2563eb;margin:0 3px 0 1px;font-family:ui-monospace,monospace}
.dr-glue{color:#9aa2ad}
.dr-void{font-size:13.5px;color:#7c2d12;background:#fff7ed;border-left:3px solid #fdba74;padding:7px 10px;border-radius:0 6px 6px 0}
.dr-evidence{list-style:none;padding:0;margin:12px 0}
.dr-prop{border:1px solid #e5e7eb;border-radius:9px;padding:10px 13px;margin:8px 0;background:#fafbfc}
.dr-prop:target{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 3px rgba(37,99,235,.18)}
.dr-prop blockquote{margin:0 0 7px;font-size:13.5px}
.dr-provenance{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#5b6572;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dr-provenance a{color:#2563eb;text-decoration:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dr-hash{opacity:.65;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dr-propnum{font-weight:700;color:#1a1c20}
.dr-flag{padding:1px 7px;border-radius:99px;font-size:10px;font-weight:600}
.dr-flag-rec{background:#ede9fe;color:#5b21b6}
.dr-flag-cor{background:#dcfce7;color:#166534}
.dr-flag-con{background:#fee2e2;color:#991b1b}
.dr-flag-bg{background:#f1f5f9;color:#64748b}
.dr-coverage h2,.dr-questions h2{font-size:15px}
.dr-grid{display:grid;grid-template-columns:repeat(9,minmax(52px,1fr));gap:6px;font-family:ui-monospace,monospace}
.dr-cell{border:1px solid #e5e7eb;border-radius:7px;text-align:center;padding:6px 2px;font-size:11px;display:flex;flex-direction:column;gap:2px}
.dr-cell-full{background:#eff6ff;border-color:#bfdbfe}
.dr-cell-empty{color:#9aa2ad;border-style:dashed}
.dr-cov{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-family:ui-monospace,Menlo,monospace}
.dr-cov-cell{border:1px solid #e5e7eb;border-radius:9px;padding:9px 11px;background:#fff;display:flex;flex-direction:column;gap:4px}
.dr-cov-cell b{font-size:19px;font-weight:800;line-height:1}
.dr-cov-cell span{font-size:10.5px;color:#9aa2ad;line-height:1.2}
.dr-cov-grn{background:#dcfce7;border-color:#bbf7d0}
.dr-cov-grn b{color:#166534}
.dr-cov-amb{background:#fff7ed;border-color:#fed7aa}
.dr-cov-amb b{color:#b45309}
.dr-cov-acc{background:#eef2ff;border-color:#c7d2fe}
.dr-cov-acc b{color:#4338ca}
.dr-cov-ink2 b{color:#5a626d}
.dr-cov-ink3 b{color:#9aa1ab}
.dr-covnote{font-size:12.5px;color:#5b6572;margin:9px 0 0;line-height:1.5}
.dr-gaps,.dr-residue{font-size:12.5px;color:#5b6572}
.dr-residue{color:#991b1b}
.dr-questions ul{list-style:none;padding:0}
.dr-questions li{border-left:3px solid #c7d2fe;padding:6px 10px;margin:7px 0;font-size:13.5px;background:#f8fafc;border-radius:0 6px 6px 0}
.dr-trigger{font-family:ui-monospace,monospace;font-size:10px;font-weight:700;color:#3730a3;background:#e0e7ff;border-radius:99px;padding:1px 8px;margin-right:7px}
.dr-reply{font-size:12.5px;color:#374151;margin-top:3px}
.dr-reply.dr-open{color:#9aa2ad;font-style:italic}
.dr-trace{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#5b6572;margin-top:26px}
.dr-trace summary{cursor:pointer;font-weight:600}
.dr-trace ol{margin:8px 0 0;padding-left:26px}
.dr-trace code{background:#f1f5f9;border-radius:4px;padding:0 5px;margin-right:5px}
@media (max-width:640px){.dr-grid{grid-template-columns:repeat(3,1fr)}.dr-cov{grid-template-columns:repeat(2,1fr)}}
`;

// The standalone artifact: one self-contained HTML file, evidence embedded, so
// deleting the live source does not remove what the claims rest on.
export const renderReportHTML = (report, { title = null, log = null } = {}) => {
  const t = title || report.root?.question || 'Deep research';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<style>body{margin:0;background:#fff}${REPORT_CSS}</style>
</head>
<body>
${renderReportFragment(report, { title: t })}
${log ? renderTraceFragment(log) : ''}
</body>
</html>
`;
};
