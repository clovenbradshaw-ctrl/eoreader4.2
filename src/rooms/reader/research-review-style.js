// EO: SIG(Void → Void, Tending) — Research Review's CSS-in-JS, split out of research-review-surface.js
// (the god-module ratchet, ~250 lines/file) so both the original surface and the newer sections
// (research-review-surface2.js) share ONE stylesheet instead of injecting two <style> tags.

const STYLE_ID = 'eo-rr-style';
const CSS = `
.eo-rr__body{padding:20px 22px 90px;overflow:auto;max-width:820px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1B1B22}
.eo-rr__crumb{font-size:11px;color:#9A9AA4;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace}
.eo-rr__title{font-family:'Newsreader',Georgia,serif;font-size:22px;font-weight:600;margin:2px 0 6px}
.eo-rr__stats{font-size:12px;color:#8A8A95;margin-bottom:14px}
.eo-rr__answer{border:1px solid #E5E5EC;background:#fff;border-radius:16px;padding:16px 18px;margin:0 0 12px;box-shadow:0 8px 24px rgba(20,20,30,.04)}
.eo-rr__answerKicker{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;letter-spacing:.08em;color:#6D5EF5;text-transform:uppercase;margin-bottom:8px}
.eo-rr__answerText{font-family:'Newsreader',Georgia,serif;font-size:18px;line-height:1.55;color:#1B1B22;margin:0 0 10px}
.eo-rr__answerSrc{font-size:12px;font-weight:600;color:#5B4BE6;background:none;border:none;cursor:pointer;padding:0}
.eo-rr__answerSrc:hover{text-decoration:underline}
.eo-rr__toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.eo-rr__toolbar input[type=text]{flex:1;min-width:160px;border:1px solid #E6E6EC;background:#F7F7FA;border-radius:9px;padding:8px 11px;font-size:13px;color:#1B1B22}
.eo-rr__btn{font-size:12px;font-weight:600;color:#3A3A44;background:#fff;border:1px solid #E0E0E6;border-radius:9px;padding:7px 12px;cursor:pointer}
.eo-rr__btn:hover{background:#F5F5F8}
.eo-rr__btn:focus-visible,.eo-rr__recipe:focus-visible,.eo-rr__filter:focus-visible,.eo-rr__areaRow:focus-visible,.eo-rr__cardTitle:focus-visible,.eo-rr__bar:focus-visible,.eo-rr__idRowBtn:focus-visible{outline:2px solid #5B4BE6;outline-offset:2px}
.eo-rr__btn--accent{color:#fff;background:#6D5EF5;border-color:#6D5EF5}
.eo-rr__btn--accent:hover{background:#5B4BE6}
.eo-rr__btn--sm{font-size:11px;padding:4px 9px;border-radius:7px}
.eo-rr__closeBtn{margin-left:auto;width:28px;height:28px;border-radius:7px;color:#8A8A95;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer}
.eo-rr__closeBtn:hover{background:#F2F2F6}
.eo-rr__recipes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.eo-rr__recipe{font-size:11.5px;font-weight:600;border-radius:999px;padding:5px 11px;border:1px solid #EAEAEF;background:#fff;color:#4E4E58;cursor:pointer}
.eo-rr__recipe--on{background:#EEEBFE;border-color:#DED8FD;color:#5B4BE6}
.eo-rr__why{font-size:11.5px;color:#8A8A95;margin-bottom:16px}
.eo-rr__section{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.07em;color:#B4B4BE;text-transform:uppercase;display:flex;align-items:center;gap:8px;margin:22px 0 10px}
.eo-rr__section::after{content:'';flex:1;height:1px;background:#EFEFF3}
.eo-rr__reading p{font-family:'Newsreader',Georgia,serif;font-size:15px;line-height:1.6;color:#3A3A44;margin:0 0 8px}
.eo-rr__areaRow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #F4F4F8;padding:8px 4px;cursor:pointer;font:inherit}
.eo-rr__areaRow--on{background:#FBFAFF}
.eo-rr__areaLabel{flex:1;font-size:13px;color:#1B1B22;font-weight:500}
.eo-rr__dots{display:flex;gap:2px}
.eo-rr__dot{width:6px;height:6px;border-radius:50%;background:#EAEAEF}
.eo-rr__dot--on{background:#6D5EF5}
.eo-rr__areaN{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9A9AA4;white-space:nowrap}
.eo-rr__filters{display:flex;gap:6px;margin-bottom:12px}
.eo-rr__filter{font-size:11.5px;font-weight:600;border-radius:999px;padding:4px 10px;border:1px solid #EAEAEF;background:#fff;color:#8A8A95;cursor:pointer}
.eo-rr__filter--on{background:#F4F4F7;color:#1B1B22;border-color:#D8D8E0}
.eo-rr__cards{display:flex;flex-direction:column;gap:10px}
.eo-rr__card{border:1px solid #EEEEF2;border-radius:12px;padding:12px 13px}
.eo-rr__cardHead{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.eo-rr__check{flex:0 0 auto}
.eo-rr__badges{display:flex;gap:5px;flex-wrap:wrap}
.eo-rr__badge{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.03em;border-radius:5px;padding:2px 6px}
.eo-rr__badge--rec{background:#E7F6EC;color:#1E8A50}
.eo-rr__badge--prim{background:#EEEBFE;color:#5B4BE6}
.eo-rr__badge--dup{background:#FBF1DA;color:#9A6B12}
.eo-rr__badge--origin{background:#F1EFFE;color:#6D5EF5}
.eo-rr__badge--neutral{background:#F2F2F6;color:#6E6E78}
.eo-rr__cardTitle{display:block;text-align:left;background:none;border:none;font-size:14px;font-weight:600;color:#1B1B22;cursor:pointer;padding:0;margin-bottom:2px}
.eo-rr__cardTitle:hover{color:#5B4BE6}
.eo-rr__cardMeta{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9A9AA4;margin-bottom:6px}
.eo-rr__cardRow{font-size:12px;color:#4E4E58;margin-bottom:3px}
.eo-rr__cardLbl{font-weight:600;color:#3A3A44;margin-right:6px}
.eo-rr__caution{font-size:11.5px;color:#9A6B12;background:#FBF4E6;border-radius:8px;padding:6px 9px;margin-top:6px}
.eo-rr__openLink{margin-top:8px;font-size:11.5px;font-weight:600;color:#5B4BE6;background:none;border:none;cursor:pointer;padding:0}
.eo-rr__narrative p{font-size:13px;color:#4E4E58;line-height:1.5;margin:0 0 6px}
.eo-rr__measureRow{border:1px solid #EEEEF2;border-radius:10px;padding:8px 10px;margin-bottom:6px}
.eo-rr__measureRow--conflict{border-color:#F2D3CD;background:#FDF7F6}
.eo-rr__measureLabel{font-weight:600;font-size:12.5px;margin-right:8px}
.eo-rr__measureReading{font-size:11.5px;color:#8A8A95}
.eo-rr__measureCells{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.eo-rr__measureCell{font-family:'IBM Plex Mono',monospace;font-size:10.5px;background:#F7F7FA;border:1px solid #EAEAEF;border-radius:6px;padding:3px 7px;cursor:pointer}
.eo-rr__discovered{display:flex;flex-direction:column;gap:6px}
.eo-rr__discoveredRow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;color:#4E4E58;border-bottom:1px solid #F4F4F8;padding:6px 2px}
.eo-rr__footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #EAEAEF;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.eo-rr__footerStats{font-size:12px;color:#4E4E58;flex:1;min-width:200px}
.eo-rr__empty{padding:40px 20px;text-align:center;color:#8A8A95;font-size:13px}
.eo-rr__live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.eo-rr__wave{display:flex;align-items:center;gap:1px;height:22px;margin:6px 0}
.eo-rr__bar{flex:1;min-width:2px;background:#E4E2F7;border:none;border-radius:1px;cursor:default;padding:0;align-self:center}
.eo-rr__bar--turn{cursor:pointer;background:#8C7DF3}
.eo-rr__bar--bridge{background:#C9963A}
.eo-rr__bar--measure{background:#1E8A50}
.eo-rr__waveCaption{font-size:10px;color:#9A9AA4;margin-top:-4px;margin-bottom:6px}
.eo-rr__table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;display:block;overflow-x:auto}
.eo-rr__table th,.eo-rr__table td{border:1px solid #EEEEF2;padding:5px 8px;text-align:left;white-space:nowrap}
.eo-rr__table th{font-family:'IBM Plex Mono',monospace;font-size:9.5px;text-transform:uppercase;color:#9A9AA4;font-weight:700}
.eo-rr__cell--supports{color:#1E8A50}
.eo-rr__cell--contests{color:#B23A2E;font-weight:600}
.eo-rr__cell--revises{color:#9A6B12}
.eo-rr__cell--candidate-correspondence{color:#6D5EF5}
.eo-rr__cell--silent{color:#C7C7D0}
.eo-rr__netRow{font-size:12.5px;color:#4E4E58;border-bottom:1px solid #F4F4F8;padding:6px 2px;display:flex;gap:8px;align-items:baseline}
.eo-rr__netType{font-family:'IBM Plex Mono',monospace;font-size:9.5px;text-transform:uppercase;color:#6D5EF5;background:#F1EFFE;border-radius:5px;padding:1px 6px;flex:0 0 auto}
.eo-rr__idRow{display:flex;align-items:center;gap:8px;border-bottom:1px solid #F4F4F8;padding:8px 2px;font-size:12.5px}
.eo-rr__idRowBtn{font-size:11px;font-weight:600;border-radius:7px;padding:4px 9px;border:1px solid #EAEAEF;background:#fff;cursor:pointer}
.eo-rr__idRowBtn--on{background:#EEEBFE;border-color:#DED8FD;color:#5B4BE6}
.eo-rr__gapTier{margin-bottom:10px}
.eo-rr__gapTierLabel{font-size:11px;font-weight:700;color:#4E4E58;margin-bottom:4px}
.eo-rr__gapArea{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#4E4E58;padding:4px 2px;flex-wrap:wrap}
.eo-rr__clusterActions{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px}

.eo-qr{max-width:980px;padding-top:28px}
.eo-qr__header{display:flex;gap:10px;align-items:center;margin:3px 0 6px}
.eo-qr__questionInput{flex:1;min-width:0;border:none;background:transparent;font-family:'Newsreader',Georgia,serif;font-size:28px;font-weight:650;color:#1B1B22;outline:none}
.eo-rr__verdict{border:1px solid #E5E5EC;border-radius:16px;background:#fff;padding:16px 18px;margin:0 0 12px;box-shadow:0 8px 24px rgba(20,20,30,.04)}
.eo-rr__verdict--supported{border-color:#CFEBD9}.eo-rr__verdict--contested{border-color:#F1C8C0}.eo-rr__verdict--single_source{border-color:#E8DCF8}.eo-rr__verdict--void{border-style:dashed;background:#FDFDFE}
.eo-rr__verdictKicker{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;letter-spacing:.08em;color:#6D5EF5;text-transform:uppercase;margin-bottom:8px}
.eo-rr__verdictText{font-family:'Newsreader',Georgia,serif;font-size:22px;line-height:1.25;color:#1B1B22;margin-bottom:8px}
.eo-rr__verdictMeta{font-size:12.5px;color:#6E6E78;margin-bottom:12px}
.eo-rr__evidence{border-top:1px solid #EFEFF3;margin-top:12px;padding-top:12px}
.eo-rr__evidenceHead{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:800;letter-spacing:.07em;color:#8A8A95;margin:8px 0 5px}
.eo-rr__evidenceRow{display:block;width:100%;text-align:left;border:none;background:#F7F7FA;border-radius:9px;padding:8px 10px;margin:5px 0;font-size:12px;color:#3A3A44;cursor:pointer}
.eo-rr__evidenceSilent{font-size:11.5px;color:#9A9AA4;margin-top:8px}
.eo-qr__meaning{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid #E9E8F6;background:#FBFAFF;border-radius:16px;padding:14px;margin-bottom:10px}
.eo-qr__meaningCenter{border-radius:999px;background:#6D5EF5;color:#fff;padding:8px 12px;font-size:12.5px;font-weight:750}
.eo-qr__meaningNode{border:1px solid #DED8FD;background:#fff;color:#4E4E58;border-radius:999px;padding:7px 11px;font-size:12px;cursor:pointer}.eo-qr__meaningNode--contested{border-color:#F1C8C0}.eo-qr__meaningNode--supported{border-color:#CFEBD9}
.eo-qr__ledger{border:1px solid #EEEEF2;border-radius:14px;overflow:hidden;background:#fff}.eo-qr__ledgerRow{display:grid;grid-template-columns:minmax(0,1fr) 120px 60px;gap:10px;width:100%;border:none;border-bottom:1px solid #F4F4F8;background:#fff;padding:10px 12px;text-align:left;cursor:pointer;font-size:12.5px;color:#2A2A32}.eo-qr__ledgerRow b{font-size:12px;color:#4E5765}.eo-qr__ledgerRow em{font-family:'IBM Plex Mono',monospace;font-style:normal;color:#8A8A95;text-align:right}

@media (max-width:640px){
  .eo-rr__body{padding:14px 14px 90px}
  .eo-rr__title{font-size:19px}
  .eo-qr__questionInput{font-size:22px}
  .eo-qr__ledgerRow{grid-template-columns:1fr;gap:3px}
  .eo-rr__toolbar,.eo-rr__recipes{gap:6px}
  .eo-rr__toolbar input[type=text]{min-width:0;width:100%}
  .eo-rr__footer{flex-direction:column;align-items:stretch}
  .eo-rr__footer .eo-rr__btn{width:100%;text-align:center}
  .eo-rr__table{font-size:11px}
}
@media (prefers-color-scheme:dark){
  .eo-rr__body{color:#EDEDF2}
  .eo-rr__stats,.eo-rr__why,.eo-rr__areaN,.eo-rr__cardMeta,.eo-rr__measureReading,.eo-rr__empty{color:#9A9AA8}
  .eo-rr__title{color:#EDEDF2}
  .eo-rr__card,.eo-rr__measureRow,.eo-rr__table th,.eo-rr__table td{border-color:#2E2E38}
  .eo-rr__btn,.eo-rr__recipe,.eo-rr__idRowBtn{background:#1E1E26;border-color:#33333E;color:#D6D6DE}
  .eo-rr__footer{background:#17171D;border-color:#2E2E38}
}
`;
export const ensureStyle = (doc) => { if (doc.getElementById(STYLE_ID)) return; const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.appendChild(s); };
