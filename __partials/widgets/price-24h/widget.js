(function(){
  "use strict";
  const W=window,D=document;
  const ID="price-24h";
  const DEFAULT_RECIPE="price__raw__area";
  const REFRESH_MS=2500;

  function q(root,s){return root?root.querySelector(s):null}

  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}

  async function loadScript(path,test){
    if(test())return;
    const src=resolve(path);
    const target=new URL(src,location.href).href;
    const existing=[...D.scripts].find(s=>s.src===target);
    if(existing){
      for(let i=0;i<300;i++){
        if(test())return;
        await new Promise(r=>setTimeout(r,25));
      }
      throw new Error(`${path} global unavailable`);
    }
    await new Promise((done,fail)=>{
      const s=D.createElement("script");
      s.src=src;s.defer=true;
      s.addEventListener("load",done,{once:true});
      s.addEventListener("error",fail,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
    if(!test())throw new Error(`${path} loaded without expected global`);
  }

  async function json(path){
    const target=resolve(path);
    if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs:8000,retries:1});
    const r=await fetch(target,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function source(){
    const sel=W.ZZXBPISelection;
    if(sel?.sourceType==="global-bpi")return "global-bpi";
    if(sel?.sourceType==="exchange"&&sel.exchangeId)return sel.exchangeId;
    return "bpi";
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;

    try{
      const data=await W.ZZXHistoryClient.series({
        source:source(),
        timeframe:"24h",
        resolution:"auto",
        maxPoints:4000
      });
      state.chart.setData(data.points||[],state.recipe);
      q(root,"[data-mini-status]").textContent=
        `${data.points?.length||0} points · ${data.resolution||"auto"} · ${source()}`;
    }catch(error){
      q(root,"[data-mini-status]").textContent=`history error: ${String(error?.message||error)}`;
      state.chart.setData([],state.recipe);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root){
    if(!root)return;

    await loadScript("/__partials/widgets/_shared/zzx-history-client.js",()=>!!W.ZZXHistoryClient);
    await loadScript("/__partials/widgets/_shared/zzx-chart-engine.js",()=>!!W.ZZXChartEngine);

    const presets=await json("/__partials/widgets/bitcoin-ticker/chart-presets.json");
    const recipe=(presets.recipes||[]).find(r=>r.id===DEFAULT_RECIPE)||presets.recipes?.[0];
    if(!recipe)throw new Error("chart recipe unavailable");

    const canvas=q(root,"[data-mini-canvas]");
    const tooltip=q(root,"[data-mini-tooltip]");
    const state={
      recipe,
      chart:new W.ZZXChartEngine.Chart(canvas,tooltip),
      busy:false,
      timer:null
    };
    root[`__zzx_${ID.replaceAll("-","_")}`]=state;

    q(root,"[data-mini-reset]")?.addEventListener("click",()=>state.chart.resetZoom());
    q(root,"[data-mini-refresh]")?.addEventListener("click",()=>refresh(root,state));
    W.addEventListener("zzx:bpi-selection",()=>refresh(root,state));

    await refresh(root,state);

    async function loop(){
      if(!root.isConnected)return;
      await refresh(root,state);
      state.timer=setTimeout(loop,REFRESH_MS);
    }
    state.timer=setTimeout(loop,REFRESH_MS);
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
