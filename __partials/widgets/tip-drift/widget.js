// __partials/widgets/tip-drift/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="tip-drift";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function set(root,sel,value){
    const el=q(root,sel);
    if(el)el.textContent=String(value??"—");
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? Math.trunc(n).toLocaleString()
      : "—";
  }

  function minutes(seconds,digits=2){
    const n=Number(seconds);
    return Number.isFinite(n)
      ? `${(n/60).toFixed(digits)}m`
      : "—";
  }

  function signedMinutes(seconds,digits=2){
    const n=Number(seconds);
    if(!Number.isFinite(n))return "—";

    const m=n/60;
    return `${m>=0?"+":""}${m.toFixed(digits)}m`;
  }

  function tzLabel(){
    try{
      return Intl.DateTimeFormat().resolvedOptions().timeZone||"Local";
    }catch(_){
      return "Local";
    }
  }

  function fmtUTC(tsSec){
    const d=new Date(Number(tsSec)*1000);
    if(!Number.isFinite(d.getTime()))return "—";

    return d.toLocaleString("en-CA",{
      timeZone:"UTC",
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit",
      hour12:false
    })+" UTC";
  }

  function fmtLocal(tsSec){
    const d=new Date(Number(tsSec)*1000);
    if(!Number.isFinite(d.getTime()))return "—";

    return d.toLocaleString(undefined,{
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    });
  }

  function status(root,label,state){
    const el=q(root,"[data-td-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/tip-drift";

    for(const [globalName,relative] of [
      ["ZZXTipDriftSources","js/sources.js"],
      ["ZZXTipDriftFetch","js/fetch.js"],
      ["ZZXTipDriftModel","js/model.js"],
      ["ZZXTipDriftProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;

      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });

      if(!W[globalName]){
        throw new Error(
          `${relative} did not register ${globalName}`
        );
      }
    }
  }

  function applyDriftState(root,selector,seconds){
    const el=q(root,selector);
    if(!el)return;

    const state=W.ZZXTipDriftModel.driftState(seconds);
    el.setAttribute("data-drift-state",state);
  }

  function render(root,state){
    const r=state.result;
    const m=r.model;

    set(root,"[data-td-height]",int(m.height));
    set(
      root,
      "[data-td-sub]",
      `UTC + ${tzLabel()} · ${r.source}`
    );

    set(root,"[data-td-age]",minutes(m.ageSec,1));
    set(root,"[data-td-avg]",minutes(m.avgSec,2));
    set(
      root,
      "[data-td-avg-drift]",
      signedMinutes(m.avgDriftSec,2)
    );
    set(
      root,
      "[data-td-last-drift]",
      signedMinutes(m.lastDriftSec,2)
    );

    set(
      root,
      "[data-td-tip-utc]",
      fmtUTC(m.tipTimestamp)
    );

    set(
      root,
      "[data-td-tip-local]",
      `${tzLabel()} · ${fmtLocal(m.tipTimestamp)}`
    );

    set(
      root,
      "[data-td-last]",
      `${minutes(m.lastSec,2)} · Δ10 ${signedMinutes(m.lastDriftSec,2)}`
    );

    set(
      root,
      "[data-td-sample]",
      `${m.sampleBlocks} blocks · ${m.sampleIntervals} completed intervals`
    );

    set(
      root,
      "[data-td-source]",
      `${r.source} · ${r.transport}`
    );

    set(
      root,
      "[data-td-meta]",
      "tip age + recent completed-block cadence vs 10-minute target · 15s refresh"
    );

    applyDriftState(
      root,
      "[data-td-avg-drift]",
      m.avgDriftSec
    );

    applyDriftState(
      root,
      "[data-td-last-drift]",
      m.lastDriftSec
    );

    W.ZZXTipDriftLatest={
      ...m,
      source:r.source,
      transport:r.transport,
      updated_at:Date.now()
    };

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-td-refresh]");
    if(button)button.disabled=true;

    try{
      state.result=await W.ZZXTipDriftProvider.load(
        state.core
      );

      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      set(
        root,
        "[data-td-meta]",
        `error: ${String(error?.message||error)}`
      );
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      busy:false,
      timer:null
    };

    root.__zzxTipDriftState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-td-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXTipDriftSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXTipDriftSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");

      set(
        root,
        "[data-td-meta]",
        String(error?.message||error)
      );
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(ID,boot);
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID,boot);
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID,boot);
  }
})();
