(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const store=new ZZXLocalStore("zzx-backabit-plan-v1");
  const state={plan:null};

  function localNow(){const d=new Date(),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,19);}
  function sats(n){return BitcoinTime.formatSats(n);}
  function dl(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function values(){
    return {
      start:Math.max(0,Number($("plan-start").value)||0),
      monthly:Math.max(0,Number($("plan-monthly").value)||0),
      months:Math.max(1,Math.min(12,Math.floor(Number($("plan-months").value)||1))),
      liquidPct:Math.max(0,Math.min(100,Number($("plan-liquid").value)||0)),
      anchorHeight:Math.max(0,Math.floor(Number($("anchor-height").value)||0)),
      anchorMs:new Date($("anchor-time").value).getTime()
    };
  }

  function build(){
    const v=values();
    if(!Number.isFinite(v.anchorMs))throw new Error("Anchor date/time is invalid.");
    const total=v.start+v.monthly*v.months;
    const liquid=Math.round(total*v.liquidPct/100);
    const locked=total-liquid;
    const tranches=[];
    const each=Math.floor(locked/v.months);
    let allocated=0;

    for(let i=1;i<=v.months;i++){
      const amount=i===v.months?locked-allocated:each;
      allocated+=amount;
      const unlockMs=new Date(v.anchorMs);
      unlockMs.setMonth(unlockMs.getMonth()+i);
      const ms=unlockMs.getTime();
      const height=BitcoinTime.estimateHeightAt(ms,v.anchorHeight,v.anchorMs);
      tranches.push({
        index:i,amountSats:amount,unlockMs:ms,estimatedHeight:height,
        cltv:BitcoinTime.cltvScript(height,"<savings_pubkey>")
      });
    }

    state.plan={schema:"zzx.backabit.plan.v1",createdAt:new Date().toISOString(),...v,totalSats:total,liquidSats:liquid,lockedSats:locked,tranches};
    render();
    return state.plan;
  }

  function render(){
    const p=state.plan;
    if(!p)return;
    $("metric-total").textContent=sats(p.totalSats);
    $("metric-liquid").textContent=sats(p.liquidSats);
    $("metric-locked").textContent=sats(p.lockedSats);
    $("metric-maturity").textContent=new Date(p.tranches.at(-1).unlockMs).toISOString().slice(0,10);

    const body=$("ladder-body");body.replaceChildren();
    for(const t of p.tranches){
      const tr=document.createElement("tr");
      [t.index,sats(t.amountSats),new Date(t.unlockMs).toISOString().slice(0,10),t.estimatedHeight,t.cltv].forEach((v,i)=>{
        const td=document.createElement("td");
        if(i===4){const code=document.createElement("code");code.textContent=v;td.appendChild(code);}else td.textContent=v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
    updateSim();
  }

  function buildContract(){
    const days=Math.max(1,Math.floor(Number($("contract-days").value)||1));
    const key=$("contract-key").value.trim()||"<savings_pubkey>";
    const p=state.plan||build();
    let script,details;

    if($("contract-type").value==="cltv"){
      const targetMs=Date.now()+days*86400000;
      const height=BitcoinTime.estimateHeightAt(targetMs,p.anchorHeight,p.anchorMs);
      script=BitcoinTime.cltvScript(height,key);
      details={type:"CLTV",days,targetEstimatedHeight:height,targetIso:new Date(targetMs).toISOString(),script};
    }else{
      const blocks=BitcoinTime.blocksForDays(days);
      script=BitcoinTime.csvScript(blocks,key);
      details={type:"CSV",days,relativeBlocks:blocks,script};
    }
    $("contract-output").textContent=JSON.stringify(details,null,2);
  }

  function updateSim(){
    const p=state.plan;
    if(!p)return;
    const r=Number($("sim-range").value)/1000;
    const start=p.anchorMs,end=p.tranches.at(-1).unlockMs;
    const now=start+(end-start)*r;
    const mature=p.tranches.filter(t=>t.unlockMs<=now);
    const matured=mature.reduce((s,t)=>s+t.amountSats,0);
    $("sim-date").textContent=new Date(now).toISOString().slice(0,10);
    $("sim-matured").textContent=sats(matured);
    $("sim-locked").textContent=sats(p.lockedSats-matured);
    $("sim-count").textContent=`${mature.length}/${p.tranches.length}`;
    draw(now);
  }

  function draw(now){
    const c=$("sim-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||320));c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
    if(!state.plan)return;
    const p=state.plan,pad=45,max=p.lockedSats||1,bw=(w-pad*2)/p.tranches.length*.65;
    p.tranches.forEach((t,i)=>{const x=pad+(w-pad*2)*(i+.5)/p.tranches.length,bar=t.amountSats/max*(h*.65);ctx.fillStyle=t.unlockMs<=now?"#c0d674":"#4b5443";ctx.fillRect(x-bw/2,h-35-bar,bw,bar);});
    ctx.fillStyle="#969696";ctx.font='10px "IBM Plex Mono", monospace';ctx.fillText("green = mature · gray = locked",pad,18);
  }

  function restore(p){
    state.plan=p;
    $("plan-start").value=p.start;$("plan-monthly").value=p.monthly;$("plan-months").value=p.months;$("plan-liquid").value=p.liquidPct;$("anchor-height").value=p.anchorHeight;
    const d=new Date(p.anchorMs),local=new Date(d.getTime()-d.getTimezoneOffset()*60000);$("anchor-time").value=local.toISOString().slice(0,19);render();
  }

  $("anchor-time").value=localNow();
  $("plan-build").addEventListener("click",()=>{try{build();}catch(e){alert(e.message);}});
  $("plan-save").addEventListener("click",()=>store.save(state.plan||build()));
  $("contract-build").addEventListener("click",()=>{try{buildContract();}catch(e){alert(e.message);}});
  $("sim-range").addEventListener("input",updateSim);
  $("export-json").addEventListener("click",()=>{const p=state.plan||build();dl(JSON.stringify(p,null,2),`backabit-${Date.now()}.json`);});
  $("import-json").addEventListener("change",async()=>{const f=$("import-json").files?.[0];if(!f)return;const p=JSON.parse(await f.text());if(p.schema!=="zzx.backabit.plan.v1")throw new Error("Unsupported BackABit plan.");restore(p);$("import-json").value="";});
  $("clear-plan").addEventListener("click",()=>{store.clear();$("export-output").textContent="Saved BackABit plan cleared.";});
  const saved=store.load(); if(saved?.schema==="zzx.backabit.plan.v1")restore(saved); else build();

  window.BackABit=Object.freeze({version:"0.1.0-alpha-web",buildPlan:build,getPlan:()=>state.plan?JSON.parse(JSON.stringify(state.plan)):null,save:()=>store.save(state.plan||build()),clear:()=>store.clear()});
  window.ZZXHooks?.emit("backabit:ready",{version:"0.1.0-alpha-web"});
})();
