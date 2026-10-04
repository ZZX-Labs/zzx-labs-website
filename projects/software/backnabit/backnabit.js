(() => {
  "use strict";
  const $=id=>document.getElementById(id),store=new ZZXLocalStore("zzx-backnabit-plan-v1");
  const state={plan:null};
  function localNow(){const d=new Date(),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,19);}
  function sats(n){return BitcoinTime.formatSats(n);}
  function dl(t,n){const b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function build(){
    const start=Math.max(0,Number($("plan-start").value)||0),monthly=Math.max(0,Number($("plan-monthly").value)||0),months=Math.max(12,Math.min(60,Math.floor(Number($("plan-months").value)||36))),interval=Math.max(1,Math.floor(Number($("plan-interval").value)||6)),bufferPct=Math.max(0,Math.min(50,Number($("plan-buffer").value)||0)),anchorHeight=Math.max(0,Math.floor(Number($("anchor-height").value)||0)),anchorMs=new Date($("anchor-time").value).getTime();
    if(!Number.isFinite(anchorMs))throw new Error("Invalid anchor date/time.");
    const total=start+monthly*months,buffer=Math.round(total*bufferPct/100),locked=total-buffer,count=Math.max(1,Math.ceil(months/interval)),each=Math.floor(locked/count),tranches=[];let allocated=0;
    for(let i=1;i<=count;i++){const amount=i===count?locked-allocated:each;allocated+=amount;const m=Math.min(months,i*interval),d=new Date(anchorMs);d.setMonth(d.getMonth()+m);const unlockMs=d.getTime(),height=BitcoinTime.estimateHeightAt(unlockMs,anchorHeight,anchorMs);tranches.push({index:i,amountSats:amount,monthsLocked:m,unlockMs,estimatedHeight:height});}
    state.plan={schema:"zzx.backnabit.plan.v1",createdAt:new Date().toISOString(),start,monthly,months,interval,bufferPct,anchorHeight,anchorMs,totalSats:total,bufferSats:buffer,lockedSats:locked,tranches};render();return state.plan;
  }

  function render(){
    const p=state.plan;if(!p)return;
    $("metric-total").textContent=sats(p.totalSats);$("metric-buffer").textContent=sats(p.bufferSats);$("metric-locked").textContent=sats(p.lockedSats);$("metric-tranches").textContent=p.tranches.length;
    $("budget-buffer").textContent=sats(p.bufferSats);$("budget-monthly").textContent=sats(p.monthly);$("budget-months").textContent=p.monthly?(p.bufferSats/p.monthly).toFixed(2):"∞";$("budget-ratio").textContent=`${(p.lockedSats/p.totalSats*100||0).toFixed(1)}%`;
    $("budget-output").textContent=JSON.stringify({purpose:"mid-term operating buffer",bufferSats:p.bufferSats,monthlyContributionSats:p.monthly,contributionMonthsCovered:p.monthly?p.bufferSats/p.monthly:null,lockedSats:p.lockedSats},null,2);
    const body=$("ladder-body");body.replaceChildren();for(const t of p.tranches){const tr=document.createElement("tr");[t.index,sats(t.amountSats),new Date(t.unlockMs).toISOString().slice(0,10),t.estimatedHeight,t.monthsLocked].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}draw();
  }

  function draw(){const p=state.plan,c=$("ladder-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||320));c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);if(!p)return;const pad=45,max=Math.max(...p.tranches.map(t=>t.amountSats),1),bw=(w-pad*2)/p.tranches.length*.55;p.tranches.forEach((t,i)=>{const x=pad+(w-pad*2)*(i+.5)/p.tranches.length,bar=t.amountSats/max*(h*.68);ctx.fillStyle=i%2?"#e6a42b":"#c0d674";ctx.fillRect(x-bw/2,h-32-bar,bw,bar);ctx.fillStyle="#969696";ctx.font='9px "IBM Plex Mono", monospace';ctx.fillText(`${t.monthsLocked}m`,x-bw/2,h-12);});}

  function policy(){const p=state.plan||build(),key=$("policy-key").value.trim()||"<midterm_pubkey>";let out;if($("policy-type").value==="cltv"){const i=Math.max(1,Math.min(p.tranches.length,Math.floor(Number($("policy-tranche").value)||1))),t=p.tranches[i-1];out={type:"CLTV",tranche:i,unlockIso:new Date(t.unlockMs).toISOString(),estimatedHeight:t.estimatedHeight,script:BitcoinTime.cltvScript(t.estimatedHeight,key)};}else{const days=Math.max(1,Math.floor(Number($("policy-days").value)||180)),blocks=BitcoinTime.blocksForDays(days);out={type:"CSV",days,relativeBlocks:blocks,script:BitcoinTime.csvScript(blocks,key)};}$("policy-output").textContent=JSON.stringify(out,null,2);}
  function restore(p){state.plan=p;$("plan-start").value=p.start;$("plan-monthly").value=p.monthly;$("plan-months").value=p.months;$("plan-interval").value=p.interval;$("plan-buffer").value=p.bufferPct;$("anchor-height").value=p.anchorHeight;const d=new Date(p.anchorMs),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);$("anchor-time").value=x.toISOString().slice(0,19);render();}

  $("anchor-time").value=localNow();$("plan-build").addEventListener("click",()=>{try{build();}catch(e){alert(e.message);}});$("plan-save").addEventListener("click",()=>store.save(state.plan||build()));$("policy-build").addEventListener("click",policy);$("export-json").addEventListener("click",()=>{const p=state.plan||build();dl(JSON.stringify(p,null,2),`backnabit-${Date.now()}.json`);});$("import-json").addEventListener("change",async()=>{const f=$("import-json").files?.[0];if(!f)return;const p=JSON.parse(await f.text());if(p.schema!=="zzx.backnabit.plan.v1")throw new Error("Unsupported BackNABit plan.");restore(p);$("import-json").value="";});$("clear-plan").addEventListener("click",()=>{store.clear();$("export-output").textContent="Saved plan cleared.";});
  const saved=store.load();if(saved?.schema==="zzx.backnabit.plan.v1")restore(saved);else build();
  window.BackNABit=Object.freeze({version:"0.1.0-alpha-web",buildPlan:build,getPlan:()=>state.plan?JSON.parse(JSON.stringify(state.plan)):null,save:()=>store.save(state.plan||build())});
  window.ZZXHooks?.emit("backnabit:ready",{version:"0.1.0-alpha-web"});
})();
