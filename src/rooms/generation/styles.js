// EO: NUL(Field → Void, Clearing) — the generation surface's CSS, as data
// styles.js — pure presentation data (docs/holons.md: a surface's styling is
// not itself an act on any face; it carries no ops). Split out of surface.js
// only to keep that file under the tree's own god-module line (docs/eo-
// compliance-2026-07.md) — the rules the Build tab's own catalog panel would
// otherwise be the first to violate.
export const CSS = `
.gen{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--accent2:#b98bff;--ok:#59c08a;--warn:#e0b24a;--bad:#e06a5a;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;
  display:flex;flex-direction:column;min-height:100%}
@media (prefers-color-scheme:light){.gen{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--accent:#2a7fd0;--accent2:#7d4fd0;--ok:#1e8a50;--warn:#9a6b12;--bad:#c0392b}}
:root[data-theme="dark"] .gen{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
:root[data-theme="light"] .gen{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}
.gen *{box-sizing:border-box}
.gen a{color:var(--accent)}
.gen button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s}
.gen button:hover:not(:disabled){border-color:var(--accent)}
.gen button:disabled{opacity:.45;cursor:not-allowed}
.gen button.primary{background:var(--accent);border-color:var(--accent);color:#08121c}
.gen button.primary:hover:not(:disabled){filter:brightness(1.08)}
.gen input,.gen textarea{font-family:var(--sans);font-size:13px;padding:9px 11px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
.gen textarea{font-family:var(--mono);font-size:12.5px;resize:vertical;min-height:90px}
.gen input:focus,.gen textarea:focus{outline:none;border-color:var(--accent)}
.gen-hero{padding:30px 26px 18px;border-bottom:1px solid var(--line);background:radial-gradient(120% 140% at 10% -20%,color-mix(in srgb,var(--accent) 20%,var(--panel)) 0%,var(--panel) 55%)}
.gen-hero-inner{max-width:880px;margin:0 auto}
.gen-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.gen-h1{font-size:28px;font-weight:800;letter-spacing:-.5px;margin:10px 0 0}
.gen-sub{color:var(--dim);font-size:13.5px;line-height:1.55;margin:9px 0 0;max-width:66ch}
.gen-model{display:flex;align-items:center;gap:9px;margin-top:16px;font-size:12.5px}
.gen-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.gen-tabs{display:flex;gap:6px;margin-top:18px}
.gen-tab{padding:8px 16px;border-radius:9px 9px 0 0;border:1px solid var(--line);border-bottom:none;background:var(--panel2);color:var(--dim);cursor:pointer;font-weight:650;font-size:13px}
.gen-tab.on{background:var(--panel);color:var(--ink);border-color:var(--accent)}
.gen-body{flex:1 1 auto;padding:22px 26px 60px;max-width:880px;width:100%;margin:0 auto}
.gen-panel{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:18px}
.gen-field{margin-bottom:14px}
.gen-label{display:block;font-size:11.5px;font-weight:700;letter-spacing:.03em;color:var(--dim);margin-bottom:6px;text-transform:uppercase}
.gen-hint{font-size:11.5px;color:var(--dim);margin-top:5px;line-height:1.5}
.gen-row{display:flex;gap:10px;align-items:center;margin-top:14px}
.gen-err{margin-top:12px;padding:10px 12px;border-radius:9px;background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid color-mix(in srgb,var(--bad) 40%,transparent);color:var(--bad);font-size:12.5px}
.gen-ok{margin-top:12px;padding:10px 12px;border-radius:9px;background:color-mix(in srgb,var(--ok) 12%,transparent);border:1px solid color-mix(in srgb,var(--ok) 40%,transparent);color:var(--ok);font-size:12.5px}
.gen-log{margin-top:14px;max-height:180px;overflow-y:auto;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:var(--mono);font-size:11.5px;color:var(--dim)}
.gen-log div{padding:1px 0}
.gen-out{margin-top:18px;background:var(--panel2);border:1px solid var(--line);border-radius:13px;padding:18px 20px}
.gen-out h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:0 0 10px}
.gen-prose{white-space:pre-wrap;line-height:1.7;font-size:14.5px}
.gen-sections{margin-top:14px;display:flex;flex-direction:column;gap:6px}
.gen-sec{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dim)}
.gen-sec b{color:var(--ink);font-weight:600}
.gen-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.gen-report{white-space:pre-wrap;font-family:var(--mono);font-size:11.5px;line-height:1.6;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px;max-height:320px;overflow-y:auto}
.gen-catalog{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.gen-chip{font-size:11px;color:var(--dim);background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:3px 9px;font-family:var(--mono)}
.gen-copy{font-size:11px;color:var(--accent);background:none;border:none;padding:2px 0;font-weight:600}
.gen-plan{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:12px 14px;font-size:12.5px}
.gen-plan p{margin:0 0 8px;color:var(--ink)}
.gen-plan ul{margin:0;padding-left:18px;line-height:1.7}
.gen-preview{width:100%;height:360px;border:1px solid var(--line);border-radius:9px;background:#fff;margin-top:12px}
.gen-code{white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:11.5px;line-height:1.6;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px;max-height:340px;overflow-y:auto;margin-top:10px}
`;
