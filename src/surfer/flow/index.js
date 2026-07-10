// EO: EVA·SYN·SEG(Network,Paradigm,Field → Lens,Network,Field, Tracing,Composing,Dissecting) — flow witness; trajectory scorer
// The flow holon — the FLOW WITNESS. (companion to write/witness.js §7)
//
// A book is a PATH through shape-space, not a point. This holon loads a distilled
// corpus prior (data/flow-prior.json) and scores text — whole documents or one
// paragraph-at-a-time continuations — against three questions the prior answers:
//
//   • DELTA      is each structural transition a move the corpus makes, or a lurch?
//   • MANIFOLD   does each step lie on the corpus's low-dim trajectory manifold?
//   • BUILD ARC  is cumulative structure accumulating on the corpus schedule?
//
// SEGMENTATION — one vector per NATURAL SECTION, not per arbitrary grid cell.
//   The reading articulates itself: runs of a dominant operator (the INS→SEG
//   alternation — introducing-mode vs segmenting/narrative-mode) bounded by NUL
//   births (the part boundaries). `sectionize()` recovers those sections from the
//   event log, and the delta between consecutive sections is a REAL structural
//   transition — the discourse genuinely changed mode there — not an artifact of
//   where a grid line fell. `trajectoryFromDoc` defaults to this; a fixed
//   sentence window and the legacy equal grid remain as options.
//
// DROP-IN CONTRACT
//   • Pure JS, zero imports — browser-safe (the reader bundle pulls this in via
//     write/witness.js). The reproduction pipeline lives in tools/flow/.
//   • trajectoryFromDoc() takes the SAME doc parseText() returns — no re-parsing.
//   • Wiring surface (each opt-in, default-off — no prior, no behavior change):
//       write/witness.js  ← flowVerdict()    per rendered beat (the spurt loop)
//       longgen/shape.js  ← arcTarget()      the build-arc schedule as a target
//       longgen/audit.js  ← scoreTrajectory() the whole-piece flow report
//
// The step math below is byte-identical to tools/flow/eo_trajectory.mjs; if you
// change one, change both. See docs/flow-prior.md.

// ── constants (must match tools/flow/eo_trajectory.mjs and the prior) ────────
export const OPERATORS = ["NUL","SIG","INS","SEG","CON","SYN","DEF","EVA","REC"];
export const OP_INDEX = Object.fromEntries(OPERATORS.map((o,i)=>[o,i]));
const OP_SET = new Set(OPERATORS);
const nOps=9, LOCAL_DIM=90, GRAPH_DIM=12, L3_DIM=7;
const GRAPH_END=LOCAL_DIM+GRAPH_DIM;   // 102: end of the local(90)+graph(12) block
const STEP_DIM=GRAPH_END+L3_DIM;        // 109: full per-section vector (+ the L3 mode-sequence block)
const sq=(x,k)=>x/(x+k);

// ── step construction (identical math to eo_trajectory.mjs) ─────────────────
function localBlock(evs){
  const v=new Float64Array(LOCAL_DIM);
  if(!evs.length) return v;
  const seq=evs.map(e=>OP_INDEX[e.op]);
  for(const o of seq) v[o]+=1;
  let s=0; for(let i=0;i<nOps;i++) s+=v[i]; if(s>0) for(let i=0;i<nOps;i++) v[i]/=s;
  for(let i=0;i<seq.length-1;i++) v[9+seq[i]*nOps+seq[i+1]]+=1;
  for(let op=0;op<nOps;op++){ let t=0; for(let j=0;j<nOps;j++) t+=v[9+op*nOps+j]; if(t>0) for(let j=0;j<nOps;j++) v[9+op*nOps+j]/=t; }
  return v;
}
function cumGraph(evs, mentions, cut, nSentSoFar){
  const opc={}; for(const e of evs) opc[e.op]=(opc[e.op]||0)+1;
  const total=Object.values(opc).reduce((a,b)=>a+b,0)||1;
  const mcounts=[];
  for(const arr of mentions.values()){ const c=arr.filter(u=>u<=cut).length; if(c>0) mcounts.push(c); }
  const nEnt=mcounts.length||1, tot=mcounts.reduce((a,b)=>a+b,0)||1;
  const shares=mcounts.map(c=>c/tot);
  const herf=shares.reduce((a,x)=>a+x*x,0);
  const entRaw=-shares.filter(x=>x>0).reduce((a,x)=>a+x*Math.log(x),0);
  const entNorm=nEnt>1?entRaw/Math.log(nEnt):0;
  const con=evs.filter(e=>e.op==='CON'); const nCON=con.length;
  const deg={}; for(const e of con) deg[e.src]=(deg[e.src]||0)+1;
  const maxDeg=Math.max(0,...Object.values(deg),0);
  const nSent=Math.max(1,nSentSoFar);
  let spanSum=0,spanN=0;
  for(const arr of mentions.values()){ const a=arr.filter(u=>u<=cut); if(a.length>=2){ spanSum+=(Math.max(...a)-Math.min(...a))/nSent; spanN++; } }
  return Float64Array.from([
    sq(nEnt/nSent,0.3), herf, entNorm, sq(nCON/nEnt,4),
    nCON?maxDeg/nCON:0, sq((opc.SYN||0)/nEnt,0.3),
    ((opc.SIG||0)+(opc.CON||0)+(opc.EVA||0))/total,
    ((opc.INS||0)+(opc.SYN||0)+(opc.REC||0))/total,
    nCON?con.filter(e=>e.relType).length/nCON:0,
    spanN?spanSum/spanN:0, sq((opc.DEF||0)/nEnt,1.5),
    nCON?con.reduce((a,e)=>a+(typeof e.w==='number'?e.w:0.5),0)/nCON:0,
  ]);
}

// anchored events (op, sentence, src/relType/w) in reading order — the raw material
// every segmentation reads. `s` is carry-forward: an event with no sentIdx inherits
// the last one seen (matches the extractor).
function anchoredEvents(doc){
  const raw=(doc.log?.events||[]).filter(e=>e.op in OP_INDEX).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
  const evs=[]; let last=0;
  for(const e of raw){ if(typeof e.sentIdx==='number') last=e.sentIdx; evs.push({op:e.op,s:last,src:e.src,relType:e.relType,w:e.w}); }
  return evs;
}
function mentionsOf(doc){
  return doc.mentions instanceof Map?doc.mentions
    :new Map(Object.entries(doc.mentions||{}).map(([k,v])=>[k,Array.isArray(v)?v:[]]));
}
function spanStep(evs, mentions, lo, hi){
  const local=localBlock(evs.filter(e=>e.s>=lo&&e.s<=hi));
  const graph=cumGraph(evs.filter(e=>e.s<=hi),mentions,hi,hi+1);
  const step=new Float64Array(GRAPH_END); step.set(local,0); step.set(graph,LOCAL_DIM);   // L3 appended later
  return step;
}

// ── level 3: the section-MODE SEQUENCE (the holon above sections). Properties of the
// PATTERN of modes — the discourse rhythm visible only at the scale of sections-as-
// units. Phase groups follow the significance row: open (NUL/SIG/INS/DEF), develop
// (SEG/CON/EVA), close (SYN/REC). 7 features per step, all ~[0,1].
const L3_EARLY=new Set([OP_INDEX.NUL,OP_INDEX.SIG,OP_INDEX.INS,OP_INDEX.DEF]);
const L3_MID  =new Set([OP_INDEX.SEG,OP_INDEX.CON,OP_INDEX.EVA]);
const L3_CTX=5;
const argmax9=(s)=>{ let bi=0,bv=-Infinity; for(let i=0;i<nOps;i++) if(s[i]>bv){bv=s[i];bi=i;} return bi; };
function level3(modes,k){
  let run=1; for(let j=k-1;j>=0&&modes[j]===modes[k];j--) run++;
  const sl=modes.slice(Math.max(0,k-L3_CTX+1),k+1);
  const freq=new Array(nOps).fill(0); for(const m of sl) freq[m]++;
  let ent=0; for(const f of freq){ if(f>0){ const p=f/sl.length; ent-=p*Math.log(p); } }
  const localEntropy=ent/(Math.log(Math.min(sl.length,nOps))||1);
  const modeNovelty=modes.slice(0,k).includes(modes[k])?0:1;
  let transNovelty=1;
  if(k>0){ const t=modes[k-1]*nOps+modes[k]; let seen=0; for(let j=1;j<k;j++) if(modes[j-1]*nOps+modes[j]===t) seen++; transNovelty=1/(1+seen); }
  let eC=0,mC=0,lC=0;
  for(let j=0;j<=k;j++){ if(L3_EARLY.has(modes[j])) eC++; else if(L3_MID.has(modes[j])) mC++; else lC++; }
  const sigRowPhase=(mC+2*lC)/(eC+mC+lC||1);
  const echo=modes[k]===modes[0]?1:(modes.slice(0,Math.min(3,k)).includes(modes[k])?0.5:0);
  let accel=0;
  if(k>=L3_CTX*2){ const e2=new Set(modes.slice(0,L3_CTX)).size, r2=new Set(modes.slice(k-L3_CTX+1,k+1)).size; accel=(r2-e2)/L3_CTX; }
  return [run/(run+3), localEntropy, modeNovelty, transNovelty, sigRowPhase, echo, (accel+1)/2];
}
export function level3summary(modes){
  const n=modes.length||1;
  const freq=new Array(nOps).fill(0); for(const m of modes) freq[m]++;
  let ent=0; for(const f of freq){ if(f>0){ const p=f/n; ent-=p*Math.log(p); } }
  let maxRun=1,cur=1; for(let i=1;i<modes.length;i++){ if(modes[i]===modes[i-1]) cur++; else cur=1; if(cur>maxRun) maxRun=cur; }
  const bg=new Set(); for(let i=1;i<modes.length;i++) bg.add(modes[i-1]*nOps+modes[i]);
  const half=Math.floor(modes.length/2), first=modes.slice(0,half), second=modes.slice(modes.length-half).reverse();
  let match=0; for(let i=0;i<half;i++) if(first[i]===second[i]) match++;
  const phase=modes.map(m=>L3_EARLY.has(m)?0:L3_MID.has(m)?1:2);
  let mono=0; for(let i=1;i<phase.length;i++) if(phase[i]>=phase[i-1]) mono++;
  return { overallEntropy:+(ent/(Math.log(Math.min(n,nOps))||1)).toFixed(3), maxRun,
    transDiversity:+(bg.size/Math.max(1,modes.length-1)).toFixed(3),
    palindrome:+(match/Math.max(1,half)).toFixed(3), arcOrder:+(mono/Math.max(1,phase.length-1)).toFixed(3) };
}

// sectionize — the reading's OWN sections. Per-sentence dominant operator, smoothed
// over a small window to kill flicker, cut on a mode change or a NUL birth once a
// minimum length is met. Returns sections in reading order, each with its span,
// length, dominant-operator label, and whether it opens on a birth. This is what the
// screenshot means by "one vector per natural section": variable-length sections
// (the text moves in uneven beats), the INS↔SEG alternation, the NUL-birth parts.
export function sectionize(doc, { minRun=6, window=8, minLen } = {}){
  const run = minLen ?? minRun;                       // accept either name
  const nSent=doc.sentences.length;
  if(nSent<=0) return { sections:[], nulBirths:[] };
  const evs=(doc.log?.events||[]).filter(e=>OP_SET.has(e.op)&&typeof e.sentIdx==='number');
  const counts=Array.from({length:nSent},()=>new Array(nOps).fill(0));
  const nulAt=new Set();
  for(const e of evs){ if(e.sentIdx<0||e.sentIdx>=nSent) continue; counts[e.sentIdx][OP_INDEX[e.op]]++; if(e.op==='NUL') nulAt.add(e.sentIdx); }
  // smoothed dominant operator, EXCLUDING NUL — NUL is a birth/boundary, not a mode.
  const domAt=(si)=>{ const acc=new Array(nOps).fill(0);
    for(let j=Math.max(0,si-window);j<=Math.min(nSent-1,si+window);j++) for(let d=0;d<nOps;d++) acc[d]+=counts[j][d];
    let best=OP_INDEX.INS,bv=-1; for(let d=0;d<nOps;d++){ if(d===OP_INDEX.NUL) continue; if(acc[d]>bv){bv=acc[d];best=d;} } return best; };
  // NUL RUN-STARTS are authoritative births (the text re-grounding from the void);
  // mode-shifts are secondary joints, gated by min-run. A dense NUL cluster (Kafka's
  // opening) collapses to its run-start, so births are the real parts, not flicker.
  const joints=[0]; const births=new Set([0]); let prev=domAt(0);
  for(let si=1;si<nSent;si++){
    if(nulAt.has(si)&&!nulAt.has(si-1)){ if(joints[joints.length-1]!==si){ joints.push(si); births.add(si); } prev=domAt(si); continue; }
    const d=domAt(si);
    if(d!==prev && si-joints[joints.length-1]>=run){ joints.push(si); prev=d; }
  }
  joints.push(nSent);
  const dom=(lo,hi)=>{ const acc=new Array(nOps).fill(0);
    for(let s=lo;s<=hi;s++) for(let d=0;d<nOps;d++) acc[d]+=counts[s][d];
    let best=OP_INDEX.INS,bv=-1; for(let d=0;d<nOps;d++){ if(d===OP_INDEX.NUL) continue; if(acc[d]>bv){bv=acc[d];best=d;} } return OPERATORS[best]; };
  const sections=[];
  for(let k=0;k<joints.length-1;k++){ const lo=joints[k], hi=joints[k+1]-1; if(hi<lo) continue;
    sections.push({ lo, hi, len:hi-lo+1, op:dom(lo,hi), born:births.has(lo) }); }
  return { sections, nulBirths:[...births].sort((a,b)=>a-b) };
}

// Build a trajectory from an eoreader parseText() doc. INSIDE eoreader4.1 this is
// the only entry you need — hand it the live doc, get steps + their fractional
// reading positions back.
//   opts (default {segment:'sections'}):
//     {segment:'sections', minLen, window}  one vector per natural section (default)
//     {segment:'sentences', perSentences}   a fixed sentence window (running critic)
//     {segment:'equal', steps} | <number>   the legacy equal grid (comparability)
//   Returns { steps, nSent, pos, sections, segment }: pos[k]∈[0,1] is the fractional
//   reading position of step k's midpoint — scoreTrajectory maps by it, so variable-
//   count section trajectories still align to the prior's position grid.
export function trajectoryFromDoc(doc, opts={ segment:'sections' }){
  const nSent=doc.sentences.length;
  const evs=anchoredEvents(doc);
  const mentions=mentionsOf(doc);
  const cfg = typeof opts==='number' ? { segment:'equal', steps:opts }
    : (opts && opts.perSentences ? { segment:'sentences', ...opts }
      : { segment:(opts&&opts.segment)||'sections', ...opts });

  let spans;
  if(cfg.segment==='sections'){
    const { sections }=sectionize(doc, cfg);
    spans = sections.length ? sections.map(s=>({lo:s.lo,hi:s.hi,op:s.op,len:s.len,born:s.born}))
      : gridSpans(nSent, Math.max(2, Math.min(40, nSent)));   // fallback for a doc with no events
  } else {
    const K = cfg.segment==='sentences'
      ? Math.max(2, Math.floor(nSent/(cfg.perSentences||8)))
      : (cfg.steps||40);
    spans = gridSpans(nSent, K);
  }
  const base=[], pos=[];
  for(const sp of spans){
    base.push(spanStep(evs, mentions, sp.lo, sp.hi));
    pos.push(nSent>1 ? ((sp.lo+sp.hi)/2)/(nSent-1) : 0);
  }
  // append the L3 mode-sequence block → the full 109-dim step vector
  const modes=base.map(argmax9);
  const steps=base.map((s,k)=>{ const v=new Float64Array(STEP_DIM); v.set(s,0);
    const l3=level3(modes,k); for(let i=0;i<L3_DIM;i++) v[GRAPH_END+i]=l3[i]; return v; });
  return { steps, nSent, pos, sections: cfg.segment==='sections'?spans:null,
    segment: cfg.segment, l3summary: level3summary(modes) };
}
function gridSpans(nSent, K){
  const out=[];
  for(let k=0;k<K;k++) out.push({ lo:Math.floor(nSent*k/K), hi:Math.floor(nSent*(k+1)/K)-1 });
  return out;
}

// ── prior + scoring ──────────────────────────────────────────────────────────
export function loadPrior(json){
  const p=typeof json==='string'?JSON.parse(json):json;
  if(p.kind!=='eo-flow-prior') throw new Error('not a flow prior');
  return {
    mean:Float64Array.from(p.manifold.mean),
    comps:p.manifold.components.map(r=>Float64Array.from(r)),
    residQ:p.manifold.residualQ,
    arcMean:p.buildArc.mean, arcSd:p.buildArc.sd, arcKeys:p.buildArc.keys,
    dPosMean:p.delta.posMean, dPosSd:p.delta.posSd, dGlobalQ:p.delta.globalQ,
    bookFlowQ:p.books.flowQ, steps:p.meta.grid||p.meta.steps, meta:p.meta,
    sections:p.sections||null,
  };
}
const QLEVELS=[0.05,0.10,0.25,0.50,0.75,0.90,0.95];
function percentileFromQ(qmap, x){
  const qs=QLEVELS.map(q=>qmap[String(q)]);
  if(x<=qs[0]) return 5; if(x>=qs[qs.length-1]) return 95;
  for(let i=0;i<qs.length-1;i++){
    if(x>=qs[i]&&x<=qs[i+1]){
      const f=(x-qs[i])/Math.max(qs[i+1]-qs[i],1e-9);
      return Math.round(100*(QLEVELS[i]+f*(QLEVELS[i+1]-QLEVELS[i])));
    }
  }
  return 50;
}
const unit=v=>{ let n=0; for(const x of v)n+=x*x; n=Math.sqrt(n)||1; return v.map(x=>x/n); };
const cosD=(a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return 1-s; };
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));

function manifoldResidual(prior, step){
  const c=new Float64Array(step.length);
  for(let i=0;i<c.length;i++) c[i]=step[i]-prior.mean[i];
  let projNorm2=0;
  for(const comp of prior.comps){ let d=0; for(let i=0;i<c.length;i++) d+=c[i]*comp[i]; projNorm2+=d*d; }
  let cn2=0; for(const x of c) cn2+=x*x;
  return Math.sqrt(Math.max(0,cn2-projNorm2))/Math.sqrt(Math.max(cn2,1e-12));
}
export { manifoldResidual };

// Score a whole trajectory (array of Float64Array steps). Pass `pos` (from
// trajectoryFromDoc) so non-uniform section positions map correctly to the prior.
export function scoreTrajectory(prior, steps, pos=null){
  const S=steps.length;
  const per=[];
  const locals=steps.map(s=>unit(Array.from(s.slice(0,LOCAL_DIM))));
  for(let k=0;k<S;k++){
    const resid=manifoldResidual(prior, steps[k]);
    const entry={ step:k, manifoldResidual:+resid.toFixed(4),
      residualPercentile: percentileFromQ(prior.residQ, resid) };
    if(pos) entry.pos=+pos[k].toFixed(4);
    if(k>0){
      const d=cosD(locals[k],locals[k-1]);
      const pk = pos ? clamp(Math.round(pos[k]*(prior.steps-1)),0,prior.steps-2)
        : Math.min(prior.steps-2, Math.floor((k-1)*(prior.steps-1)/Math.max(1,S-1)));
      entry.delta=+d.toFixed(4);
      entry.deltaPercentile=percentileFromQ(prior.dGlobalQ,d);
      entry.deltaZ=+(((d-prior.dPosMean[pk])/prior.dPosSd[pk])).toFixed(2);
    }
    const pk = pos ? clamp(Math.round(pos[k]*(prior.steps-1)),0,prior.steps-1)
      : Math.min(prior.steps-1, Math.floor(k*(prior.steps-1)/Math.max(1,S-1)));
    const g=steps[k].slice(LOCAL_DIM);
    const zs={}; let zsum=0;
    for(let j=0;j<GRAPH_DIM;j++){ const z=(g[j]-prior.arcMean[pk][j])/prior.arcSd[pk][j]; zs[prior.arcKeys[j]]=+z.toFixed(2); zsum+=Math.abs(z); }
    entry.arcZ=zs; entry.arcAdherence=+(zsum/GRAPH_DIM).toFixed(2);   // mean |z|: <1 on-schedule
    per.push(entry);
  }
  const deltas=per.filter(e=>e.delta!=null).map(e=>e.delta);
  const flow=deltas.reduce((a,b)=>a+b,0)/Math.max(1,deltas.length);
  return {
    flowScore:+flow.toFixed(4),
    flowPercentile: percentileFromQ(prior.bookFlowQ, flow),   // low = smoother than corpus
    meanResidual:+(per.reduce((a,e)=>a+e.manifoldResidual,0)/S).toFixed(4),
    meanArcAdherence:+(per.reduce((a,e)=>a+e.arcAdherence,0)/S).toFixed(2),
    nSections:S,
    steps:per,
  };
}

// ── THE WIRING SURFACE for eoreader4.1 ───────────────────────────────────────
// 1) write/witness.js — per-beat flow verdict in the paragraph-at-a-time loop.
//    Returns {ok, delta, deltaPercentile, residualPercentile, ...} — treat
//    deltaPercentile>90 or residualPercentile>95 as a source-veto-class flag: don't
//    hard-fail, surface it. Null if no prior is wired.
export function flowVerdict(prior, prevStep, doc, opts={}){
  if(!prior||!doc) return null;
  const seg = opts.segment || (opts.perSentences ? undefined : { segment:'sections' });
  const { steps }=trajectoryFromDoc(doc, opts.perSentences ? {perSentences:opts.perSentences} : (opts.steps||seg));
  const cur=steps[steps.length-1];
  const out={ step:cur };
  out.manifoldResidual=manifoldResidual(prior,cur);
  out.residualPercentile=percentileFromQ(prior.residQ,out.manifoldResidual);
  if(prevStep){
    const d=cosD(unit(Array.from(prevStep.slice(0,LOCAL_DIM))), unit(Array.from(cur.slice(0,LOCAL_DIM))));
    out.delta=d; out.deltaPercentile=percentileFromQ(prior.dGlobalQ,d);
  }
  out.ok=(out.deltaPercentile==null||out.deltaPercentile<=90)&&out.residualPercentile<=95;
  return out;
}
// 2) longgen/shape.js — the build-arc SCHEDULE as a phase target: at arc phase
//    t∈[0,1], arcTarget(prior,t) returns the corpus-typical cumulative graph state
//    (each feature's {mean, sd}). Condition the artifact, not the behavior: the
//    target is a measured state, not a rule. Null if no prior.
export function arcTarget(prior, t){
  if(!prior) return null;
  const pk=Math.min(prior.steps-1, Math.max(0, Math.round(t*(prior.steps-1))));
  const out={};
  for(let j=0;j<GRAPH_DIM;j++) out[prior.arcKeys[j]]={mean:prior.arcMean[pk][j], sd:prior.arcSd[pk][j]};
  return out;
}
// arcState — the READ half of the build-arc comparison, symmetric with arcTarget.
// arcTarget hands back the corpus-typical cumulative state at position t; arcState
// reads the SAME 12 graph features off a LIVE step vector (its graph block, the 12
// dims after the local(90) block — byte-identical to scoreTrajectory's `g`), keyed by
// the same arcKeys. So `arcState(step)[k] − arcTarget(t)[k].mean` is the gap the move
// deriver reads — where the trajectory actually is vs where the corpus would be here.
// Null-safe: no prior or no step ⇒ null (longgen/fold.js then falls back to the phase).
export function arcState(prior, step){
  if(!prior||!step) return null;
  const g=step.slice(LOCAL_DIM);
  const out={};
  for(let j=0;j<GRAPH_DIM;j++) out[prior.arcKeys[j]]=g[j];
  return out;
}
// 3) longgen/audit.js — whole-piece report: scoreTrajectory(prior,
//    ...trajectoryFromDoc(doc)) in the export audit, alongside diagnose().

// ── READING SELF-DIAGNOSIS (docs/flow-reading.md) ────────────────────────────
// The reading-side companion to flowVerdict. A section that lies OFF the manifold of
// competent readings is more likely a FAILED reading — missed relations, fragmented
// coreference, dropped entities — than a strange text. Validated by
// tools/flow/reading_probe.mjs: corrupting the parse raises the residual and it
// localizes to the corrupted region (dose-response, ~190× inside/outside at 80%).
// Returns per-section residual with the likely-under-read sections flagged, so the
// reader can re-read them. opts.residualPct (default 95) is the flag threshold; scored
// against a REGISTER-MATCHED prior (see selectPrior) — the residual is deviation from
// competent readings of that register.
export function diagnoseReading(prior, doc, opts={}){
  if(!prior||!doc) return null;
  const { steps, pos, sections }=trajectoryFromDoc(doc, opts.segment||{segment:'sections'});
  const r=scoreTrajectory(prior, steps, pos);
  const thr=opts.residualPct??95;
  const per=r.steps.map((s,i)=>({
    i, pos:s.pos,
    from: sections?.[i]?.lo ?? null, to: sections?.[i]?.hi ?? null, dom: sections?.[i]?.op ?? null,
    residual:s.manifoldResidual, residualPercentile:s.residualPercentile, arcAdherence:s.arcAdherence,
    underRead: s.residualPercentile>=thr,
  }));
  const flagged=per.filter(s=>s.underRead);
  return { meanResidual:r.meanResidual, meanArcAdherence:r.meanArcAdherence,
    flaggedCount:flagged.length, flagged, sections:per, prior:prior.meta?.facets||null };
}

// ── INSTALLABLE PRIORS — a facet-keyed registry (region · era · language · domain) ──
// A prior is a modality-register grammar; the right one depends on the target. These
// pure helpers do the SELECTION; file/fetch I/O is the caller's (tools/flow read files,
// the browser fetches). `entries` is a manifest list, each with a `facets` block:
//   { name, file, facets:{ lang, region, era, domain, register }, books }
// selectPrior returns the best match. Language is a hard filter when both sides declare
// it (a different language is a different operator grammar); domain/register/era/region
// are scored; a larger corpus breaks ties.
export function selectPrior(entries, query={}){
  const W={ domain:4, register:3, era:2, region:1 };
  let best=null, bestScore=-Infinity;
  for(const e of entries||[]){
    const f=e.facets||{};
    if(query.lang && f.lang && f.lang!==query.lang) continue;   // hard filter: language
    let score=0;
    if(query.lang && f.lang===query.lang) score+=8;
    for(const k of Object.keys(W)) if(query[k] && f[k] && String(f[k]).toLowerCase()===String(query[k]).toLowerCase()) score+=W[k];
    score += Math.min(1,(e.books||0)/500);                      // tie-break: reliability
    if(score>bestScore){ bestScore=score; best=e; }
  }
  return best;
}
// A short, human-readable provenance line for an installed prior.
export function describePrior(prior){
  const m=prior?.meta||{}, f=m.facets||{};
  const facet=['lang','domain','register','era','region'].map(k=>f[k]).filter(Boolean).join(' · ')||'unlabelled';
  return { facets:f, books:m.books, segment:m.segment, grid:m.grid,
    generated:m.generated, sourceSha:m.sourceSha256, label:`${facet} (${m.books||'?'} docs)` };
}
