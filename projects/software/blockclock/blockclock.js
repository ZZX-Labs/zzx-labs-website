(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={metrics:null,history:[],timer:null,lastHeight:null,hardware:null};

function drawLine(id,vals){
  const c=$(id),ctx=c.getContext("2d"),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(240,Math.round(r.height||280)),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
  c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
  if(vals.length<2)return;
  const lo=Math.min(...vals),hi=Math.max(...vals),rg=Math.max(hi-lo,1e-9),pad=36;
  ctx.strokeStyle="#c0d674";ctx.lineWidth=2;ctx.beginPath();
  vals.forEach((v,i)=>{const x=pad+(w-pad*2)*i/(vals.length-1),y=h-26-(v-lo)/rg*(h-52);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
}
function drawEpoch(){
  const c=$("cl-canvas"),ctx=c.getContext("2d"),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(220,Math.round(r.height||280)),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
  c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
  if(!state.metrics)return;
  const p=Math.max(0,Math.min(100,state.metrics.epoch.progressPct)),x=40,y=h/2-18,bw=w-80,bh=36;
  ctx.fillStyle="#222";ctx.fillRect(x,y,bw,bh);ctx.fillStyle="#c0d674";ctx.fillRect(x,y,bw*p/100,bh);
  ctx.fillStyle="#e8e8e8";ctx.font="14px monospace";ctx.fillText(`${p.toFixed(4)}% of epoch ${state.metrics.epoch.epoch}`,x,y-14);
}
function render(){
  const m=state.metrics;if(!m)return;
  $("cl-height").textContent=m.height.toLocaleString();$("cl-epoch").textContent=m.epoch.epoch;$("cl-progress").textContent=`${m.epoch.progressPct.toFixed(4)}%`;$("cl-subsidy").textContent=`${(m.epoch.subsidySats/1e8).toFixed(8)} BTC`;
  $("cl-output").textContent=JSON.stringify({height:m.height,epoch:m.epoch,nextHalvingHeight:m.nextHalvingHeight,estimatedNextHalving:m.estimatedNextHalving,estimatedNextBlock:m.estimatedNextBlock,source:m.source},null,2);
  $("mp-count").textContent=Number(m.mempool.count||0).toLocaleString();$("mp-vsize").textContent=Number(m.mempool.vsize||0).toLocaleString();$("mp-fees").textContent=Number(m.mempool.totalFeeBTC||0).toFixed(8);$("mp-updated").textContent=new Date(m.updatedAt).toLocaleTimeString();
  $("fe-fast").textContent=`${m.fees.fastest} sat/vB`;$("fe-half").textContent=`${m.fees.halfHour} sat/vB`;$("fe-hour").textContent=`${m.fees.hour} sat/vB`;$("fe-econ").textContent=`${m.fees.economy} sat/vB`;
  drawEpoch();drawLine("mp-canvas",state.history.map(x=>x.mempool.count));drawLine("fe-canvas",state.history.map(x=>x.fees.fastest));
}
function notify(text){if("Notification"in window&&Notification.permission==="granted")new Notification("BlockClock",{body:text});}
function alerts(m){
  const hits=[];
  if(+m.fees.fastest >= Math.max(0,+$("al-fee").value||0))hits.push(`Fastest fee ${m.fees.fastest} sat/vB reached threshold.`);
  if(+m.mempool.count >= Math.max(0,+$("al-mempool").value||0))hits.push(`Mempool ${m.mempool.count} transactions reached threshold.`);
  if($("al-block").value==="yes"&&state.lastHeight!=null&&m.height>state.lastHeight)hits.push(`New block height ${m.height}.`);
  for(const h of hits)notify(h);
  $("al-output").textContent=JSON.stringify({evaluatedAt:new Date().toISOString(),hits},null,2);
}
function apply(m){alerts(m);state.lastHeight=state.metrics?.height??state.lastHeight;state.metrics=m;state.history.push(m);if(state.history.length>180)state.history.shift();render();}
async function live(){
  const base=$("ds-url").value.replace(/\/+$/,""),badge=$("bc-live");badge.textContent="DATA: FETCHING";badge.className="runtime-badge partial";
  try{
    const [hR,mR,fR]=await Promise.all([fetch(`${base}/blocks/tip/height`,{cache:"no-store"}),fetch(`${base}/mempool`,{cache:"no-store"}),fetch(`${base}/v1/fees/recommended`,{cache:"no-store"})]);
    if(!hR.ok||!mR.ok||!fR.ok)throw new Error(`HTTP ${hR.status}/${mR.status}/${fR.status}`);
    const h=Number(await hR.text()),mp=await mR.json(),fees=await fR.json();
    const m=BlockClockCore.normalized({height:h,mempoolCount:mp.count??0,mempoolVsize:mp.vsize??0,mempoolTotalFee:mp.total_fee??0,fees,lastBlockTimeMs:Date.now(),source:base});
    apply(m);$("ds-output").textContent=JSON.stringify(m,null,2);badge.textContent="DATA: LIVE";badge.className="runtime-badge ok";
  }catch(e){badge.textContent="DATA: ERROR";badge.className="runtime-badge bad";$("ds-output").textContent=`ERROR: ${e.message}`;}
}
function manual(){
  const m=BlockClockCore.normalized({height:+$("dm-height").value||0,mempoolCount:+$("dm-count").value||0,mempoolVsize:+$("dm-vsize").value||0,mempoolTotalFee:+$("dm-fee-total").value||0,fees:{fastestFee:+$("dm-fast").value||0,halfHourFee:+$("dm-hour").value||0,hourFee:+$("dm-hour").value||0,economyFee:Math.max(1,(+$("dm-hour").value||0)-1)},lastBlockTimeMs:Date.now(),source:"manual"});
  apply(m);$("ds-output").textContent=JSON.stringify(m,null,2);$("bc-live").textContent="DATA: MANUAL";$("bc-live").className="runtime-badge ok";
}
function fetchOrApply(){return $("ds-mode").value==="live"?live():manual();}
function auto(){if(state.timer){clearInterval(state.timer);state.timer=null;$("ds-auto").textContent="AUTO: OFF";}else{const sec=Math.max(2,+$("ds-sec").value||10);state.timer=setInterval(fetchOrApply,sec*1000);$("ds-auto").textContent=`AUTO: ${sec}S`;fetchOrApply();}}
$("ds-fetch").addEventListener("click",fetchOrApply);$("ds-auto").addEventListener("click",auto);$("al-test").addEventListener("click",()=>state.metrics&&alerts(state.metrics));$("al-permission").addEventListener("click",async()=>{if("Notification"in window)$("al-output").textContent=`Notification permission: ${await Notification.requestPermission()}`;else $("al-output").textContent="Notification API unavailable.";});
$("hw-send").addEventListener("click",async()=>{try{if(!state.hardware)throw new Error("No hardware adapter registered.");if(!state.metrics)throw new Error("No metrics yet.");const r=await state.hardware(JSON.parse(JSON.stringify(state.metrics)));$("hw-output").textContent=JSON.stringify(r,null,2);}catch(e){$("hw-output").textContent=`ERROR: ${e.message}`;}});
manual();
window.BlockClock=Object.freeze({version:"0.1.0-alpha-web",getMetrics:()=>state.metrics,applyMetrics:apply,registerHardwareAdapter(fn){state.hardware=fn;}});
window.ZZXHooks?.emit("blockclock:ready",{version:"0.1.0-alpha-web"});
})();
