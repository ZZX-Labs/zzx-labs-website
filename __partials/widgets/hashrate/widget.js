// __partials/widgets/hashrate/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="hashrate";
  const EFF_KEY="zzx.widget.hashrate.j-per-th.v2";

  function q(root,sel){return root?root.querySelector(sel):null}

  function num(v,d=2){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})
      : "—";
  }

  function sci(v){
    const n=Number(v);
    if(!Number.isFinite(n))return "—";
    return n>=1e12?n.toExponential(4):Math.round(n).toLocaleString();
  }

  function status(root,label,state){
    const el=q(root,"[data-hr-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function safeGet(){
    try{
      const n=Number(localStorage.getItem(EFF_KEY));
      return Number.isFinite(n)&&n>0?n:NaN;
    }catch(_){return NaN}
  }

  function safeSet(value){
    try{localStorage.setItem(EFF_KEY,String(value))}catch(_){}
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/hashrate";

    for(const [globalName,relative] of [
      ["ZZXHashrateSources","js/sources.js"],
      ["ZZXHashrateFetch","js/fetch.js"],
      ["ZZXHashrateModel","js/model.js"],
      ["ZZXHashrateChart","js/chart.js"]
    ]){
      if(W[globalName])continue;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/${relative}`):`${base}/${relative}`;
      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.onload=resolve;s.onerror=reject;
        (D.head||D.documentElement).appendChild(s);
      });
    }
  }

  function draw(root,state){
    if(!state.model)return;
    W.ZZXHashrateChart.draw(
      q(root,"[data-hr-canvas]"),
      state.model.values
    );
  }

  function renderEnergy(root,state){
    if(!state.model)return;

    const input=q(root,"[data-hr-eff]");
    const jPerTH=Number(input?.value);
    const energy=W.ZZXHashrateModel.energy(
      state.model.currentEH,
      state.model.meanEH,
      jPerTH
    );

    if(!energy)return;

    q(root,"[data-hr-power]").textContent=`${num(energy.currentGW,2)} GW`;
    q(root,"[data-hr-e1]").textContent=`${num(energy.currentGWhPerHour,2)} GWh`;
    q(root,"[data-hr-e24]").textContent=`${num(energy.meanGWhPerDay,1)} GWh`;

    safeSet(energy.efficiency);
  }

  function render(root,state){
    const m=state.model;

    q(root,"[data-hr-eh]").textContent=num(m.currentEH,2);
    q(root,"[data-hr-diff]").textContent=sci(m.difficulty);
    q(root,"[data-hr-mean]").textContent=`${num(m.meanEH,2)} EH/s`;
    q(root,"[data-hr-low]").textContent=`${num(m.lowEH,2)} EH/s`;
    q(root,"[data-hr-high]").textContent=`${num(m.highEH,2)} EH/s`;
    q(root,"[data-hr-delta]").textContent=
      Number.isFinite(m.deltaPct)?`${m.deltaPct>=0?"+":""}${m.deltaPct.toFixed(2)}%`:"—";

    q(root,"[data-hr-source]").textContent=m.source||"configured mempool API";
    q(root,"[data-hr-updated]").textContent=new Date(m.updated).toLocaleString();
    q(root,"[data-hr-points]").textContent=`${m.values.length} points`;

    q(root,"[data-hr-sub]").textContent=
      "24h window from mempool mining hashrate series";

    q(root,"[data-hr-meta]").textContent=
      "energy estimate = hashrate × assumed J/TH · Tor-node share is not used as a mining-hashrate proxy";

    // Publish only defensible globally useful values.
    W.ZZXMiningStats=W.ZZXMiningStats||{};
    W.ZZXMiningStats.globalHashrateEH=m.currentEH;
    W.ZZXMiningStats.difficulty=m.difficulty;

    renderEnergy(root,state);
    draw(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const data=await W.ZZXHashrateFetch.load(state.core);
      state.model=W.ZZXHashrateModel.build(data);
      render(root,state);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-hr-meta]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      busy:false,
      timer:null,
      resize:null
    };

    root.__zzxHashrateState=state;

    try{
      await ensureModules(state.core);

      const saved=safeGet();
      const input=q(root,"[data-hr-eff]");
      input.value=Number.isFinite(saved)
        ? String(saved)
        : String(W.ZZXHashrateSources.defaultJPerTH);

      input.addEventListener("input",()=>renderEnergy(root,state));
      q(root,"[data-hr-refresh]")?.addEventListener("click",()=>refresh(root,state));

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>draw(root,state)));
        state.resize.observe(q(root,"[data-hr-canvas]"));
      }

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,W.ZZXHashrateSources.refreshMs);
      }

      state.timer=W.setTimeout(loop,W.ZZXHashrateSources.refreshMs);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-hr-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
