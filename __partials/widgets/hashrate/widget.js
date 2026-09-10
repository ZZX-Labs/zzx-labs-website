// __partials/widgets/hashrate/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="hashrate";
  const RANGE_KEY="zzx.widget.hashrate.range.v10.33";
  const EFFICIENCY_JTH=30;

  function q(root,selector){return root?.querySelector?.(selector)||null;}

  function set(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  }

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function fmtEH(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(3)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function fmtZH(value){
    const n=finite(value);
    return Number.isFinite(n)?n.toFixed(n>=1?3:4):"—";
  }

  function fmtDifficulty(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1e12)return `${(n/1e12).toFixed(3)} T`;
    if(n>=1e9)return `${(n/1e9).toFixed(3)} B`;
    return Math.round(n).toLocaleString();
  }

  function fmtPower(gw){
    const n=finite(gw);
    if(!Number.isFinite(n))return "—";
    if(n>=1)return `${n.toFixed(2)} GW`;
    return `${(n*1000).toFixed(1)} MW`;
  }

  function fmtEnergy(gwh){
    const n=finite(gwh);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(3)} TWh`;
    return `${n.toFixed(2)} GWh`;
  }

  function fmtChange(stats){
    const pct=finite(stats?.changePct);
    const delta=finite(stats?.change);
    if(!Number.isFinite(pct)||!Number.isFinite(delta))return "—";
    return `${delta>=0?"+":""}${fmtEH(delta)} · ${pct>=0?"+":""}${(pct*100).toFixed(2)}%`;
  }

  function safeGet(key){
    try{return W.localStorage.getItem(key);}catch(_){return null;}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value));}catch(_){}
  }

  function status(root,label,state){
    const el=q(root,"[data-hr-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/hashrate";
  }

  async function loadScript(path,test,tag){
    if(test())return;

    const src=new URL(resolve(path),W.location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<2500){
        await new Promise(done=>W.setTimeout(done,25));
      }
      if(test())return;
    }

    await new Promise((done,fail)=>{
      const script=D.createElement("script");
      script.src=src;
      script.defer=true;
      script.dataset.hrDependency=tag;
      script.addEventListener("load",done,{once:true});
      script.addEventListener(
        "error",
        ()=>fail(new Error(`Failed to load ${path}`)),
        {once:true}
      );
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test())throw new Error(`${path} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript(
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXHashrateModel?.__version||0)>=2,
      "ZZXHashrateModel"
    );

    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXHashrateProvider?.__version||0)>=2,
      "ZZXHashrateProvider"
    );

    await loadScript(
      `${base(core)}/js/chart.js`,
      ()=>Number(W.ZZXHashrateChart?.__version||0)>=2,
      "ZZXHashrateChart"
    );

    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXHashrateViewport?.__version||0)>=2,
      "ZZXHashrateViewport"
    );
  }

  function range(root){
    return root.__zzxHashrateState?.period||"1m";
  }

  function setRangeButtons(root,period){
    root.querySelectorAll("[data-hr-range]").forEach(button=>{
      button.setAttribute(
        "aria-pressed",
        button.dataset.hrRange===period?"true":"false"
      );
    });
  }

  function render(root,state){
    const m=state.model;
    const result=state.result;
    if(!m||!result)return;

    const stats=m.stats;
    const energy=W.ZZXHashrateModel.energy(m.currentEH,EFFICIENCY_JTH);

    set(root,"[data-hr-zh]",fmtZH(m.currentZH));
    set(root,"[data-hr-current-eh]",fmtEH(m.currentEH));

    set(root,"[data-hr-average]",fmtEH(stats.average));
    set(root,"[data-hr-high]",fmtEH(stats.high));
    set(root,"[data-hr-low]",fmtEH(stats.low));
    set(root,"[data-hr-change]",fmtChange(stats));

    set(root,"[data-hr-window-label]",result.label);
    set(root,"[data-hr-points]",`${stats.count.toLocaleString()} samples`);

    if(m.history.length>=2){
      const span=m.history.at(-1).t-m.history[0].t;
      const days=span/86400000;
      set(
        root,
        "[data-hr-span]",
        days>=365
          ? `${(days/365.25).toFixed(2)} years observed`
          : `${days.toFixed(days>=10?0:1)} days observed`
      );
    }else{
      set(root,"[data-hr-span]","insufficient history");
    }

    set(root,"[data-hr-diff]",fmtDifficulty(m.difficulty));
    set(root,"[data-hr-eff]",String(EFFICIENCY_JTH));
    set(root,"[data-hr-power]",fmtPower(energy.gigawatts));
    set(root,"[data-hr-e1]",fmtEnergy(energy.gwh1));
    set(root,"[data-hr-e24]",fmtEnergy(energy.gwh24));
    set(root,"[data-hr-tor]","unavailable");

    set(
      root,
      "[data-hr-updated]",
      m.updatedMs?new Date(m.updatedMs).toLocaleString():"—"
    );

    set(
      root,
      "[data-hr-source]",
      `${result.source} · ${result.transport}${result.stale?" · stale":""}`
    );

    set(
      root,
      "[data-hr-sub]",
      m.history.length>=2
        ? "time-series uses published network hashrate samples · power/energy are estimates at 30 J/TH · Tor attribution is not derivable from global hashrate"
        : "current hashrate available but chart history is sparse or unavailable"
    );

    setRangeButtons(root,state.period);
    W.ZZXHashrateChart.render(root,m.history);

    status(root,result.stale?"cached":"live",result.stale?"warn":"ok");

    W.ZZXHashrateLatest=Object.freeze({
      schema:"zzx-hashrate-export-v2",
      period:state.period,
      currentEH:m.currentEH,
      currentZH:m.currentZH,
      difficulty:m.difficulty,
      stats:m.stats,
      history:m.history,
      efficiencyJTH:EFFICIENCY_JTH,
      estimatedPowerGW:Number.isFinite(energy.gigawatts)?energy.gigawatts:null,
      estimatedEnergy24hGWh:Number.isFinite(energy.gwh24)?energy.gwh24:null,
      source:result.source,
      transport:result.transport,
      stale:!!result.stale,
      updatedMs:m.updatedMs
    });
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    state.controller?.abort?.();
    state.controller=
      typeof AbortController==="function"
        ? new AbortController()
        : null;

    try{
      const result=await W.ZZXHashrateProvider.load(
        state.period,
        {
          force,
          signal:state.controller?.signal||null
        }
      );

      state.result=result;
      state.model=W.ZZXHashrateModel.build(result.payload);
      render(root,state);
    }catch(error){
      if(error?.name==="AbortError")return;

      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      set(root,"[data-hr-sub]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxHashrateState;
    old?.abortController?.abort?.();
    old?.controller?.abort?.();
    old?.detachViewport?.();

    const abortController=
      typeof AbortController==="function"
        ? new AbortController()
        : null;

    const options=
      abortController
        ? {signal:abortController.signal}
        : undefined;

    const saved=safeGet(RANGE_KEY);
    const initial=
      ["1m","3m","6m","1y"].includes(saved)
        ? saved
        : "1m";

    const state={
      core:core||W.ZZXWidgetsCore||null,
      period:initial,
      result:null,
      model:null,
      busy:false,
      abortController,
      controller:null,
      detachViewport:null
    };

    root.__zzxHashrateState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXHashrateViewport.attach(root);

      root.querySelectorAll("[data-hr-range]").forEach(button=>{
        button.addEventListener(
          "click",
          ()=>{
            const next=String(button.dataset.hrRange||"1m");
            if(next===state.period)return;
            state.period=next;
            safeSet(RANGE_KEY,next);
            setRangeButtons(root,next);
            refresh(root,state,false);
          },
          options
        );
      });

      q(root,"[data-hr-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-hr-sub]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
