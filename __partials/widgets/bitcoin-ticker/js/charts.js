(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerCharts?.__version>=1)return;

  const SHARED=[
    ["ZZXHistoryClient","/__partials/widgets/_shared/zzx-history-client.js"],
    ["ZZXChartEngine","/__partials/widgets/_shared/zzx-chart-engine.js"]
  ];

  function resolved(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}

  function loadScript(path,test){
    if(test())return Promise.resolve();

    return new Promise((done,fail)=>{
      const src=resolved(path);
      const target=new URL(src,location.href).href;
      const existing=[...D.scripts].find(s=>s.src===target);

      if(existing){
        let n=0;
        const poll=()=>{
          if(test())return done();
          if(++n>300)return fail(new Error(`${path} global unavailable`));
          setTimeout(poll,25);
        };
        poll();
        return;
      }

      const s=D.createElement("script");
      s.src=src;s.defer=true;
      s.addEventListener("load",()=>test()?done():fail(new Error(`${path} loaded without global`)),{once:true});
      s.addEventListener("error",()=>fail(new Error(`failed to load ${path}`)),{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
  }

  async function ensureShared(){
    for(const [name,path] of SHARED){
      await loadScript(path,()=>!!W[name]);
    }
  }

  async function json(path){
    const target=resolved(path);
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs:8000,retries:1});
    }
    const r=await fetch(target,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function populateRecipes(root,recipes){
    const select=root.querySelector("[data-chart-recipe]");
    if(!select)return;
    select.replaceChildren();

    for(const recipe of recipes){
      const o=D.createElement("option");
      o.value=recipe.id;
      o.textContent=recipe.label;
      select.appendChild(o);
    }

    const preferred=recipes.find(r=>r.id==="price__raw__line")||recipes[0];
    if(preferred)select.value=preferred.id;
  }

  async function populateSources(root){
    const select=root.querySelector("[data-chart-source]");
    if(!select)return;

    const current=select.value;
    const values=new Map([
      ["bpi","BPI"],
      ["global-bpi","Global BPI"]
    ]);

    try{
      const result=await W.ZZXHistoryClient.sources();
      for(const row of result.sources||[]){
        const id=String(row.source||"");
        if(id&&!values.has(id))values.set(id,id);
      }
    }catch(_){}

    const tickerSource=root.querySelector("[data-source-select]");
    if(tickerSource){
      for(const o of tickerSource.options){
        const id=String(o.value||"");
        if(id.startsWith("exchange:")){
          const source=id.slice("exchange:".length);
          values.set(source,o.textContent.replace(/^Exchange · /,""));
        }
      }
    }

    select.replaceChildren();
    for(const [id,label] of values){
      const o=D.createElement("option");
      o.value=id;o.textContent=label;
      select.appendChild(o);
    }

    if(current&&[...select.options].some(o=>o.value===current))select.value=current;
    else if(W.ZZXBPISelection?.sourceType==="global-bpi")select.value="global-bpi";
    else if(W.ZZXBPISelection?.sourceType==="exchange")select.value=W.ZZXBPISelection.exchangeId||"bpi";
    else select.value="bpi";
  }

  function recipeFor(state,id){
    return state.recipes.find(r=>r.id===id)||state.recipes[0];
  }

  async function refresh(root,state){
    if(state.busy)return;
    state.busy=true;

    const status=root.querySelector("[data-chart-status]");
    const button=root.querySelector("[data-chart-refresh]");
    if(button)button.disabled=true;
    if(status)status.textContent="loading history";

    try{
      const source=root.querySelector("[data-chart-source]")?.value||"global-bpi";
      const timeframe=root.querySelector("[data-chart-timeframe]")?.value||"24h";
      const resolution=root.querySelector("[data-chart-resolution]")?.value||"auto";
      const recipe=recipeFor(state,root.querySelector("[data-chart-recipe]")?.value);

      const data=await W.ZZXHistoryClient.series({
        source,timeframe,resolution,maxPoints:6000
      });

      state.chart.setData(data.points||[],recipe);

      if(status){
        status.textContent=`${data.points?.length||0} points · ${data.resolution||resolution} · ${recipe.label}`;
      }

      const range=root.querySelector("[data-chart-range]");
      if(range&&data.points?.length){
        range.textContent=`${new Date(data.points[0].t).toLocaleString()} → ${new Date(data.points[data.points.length-1].t).toLocaleString()}`;
      }else if(range){
        range.textContent="—";
      }
    }catch(error){
      if(status)status.textContent=`history error: ${String(error?.message||error)}`;
      state.chart.setData([],state.recipes[0]);
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
    }
  }

  async function mount(root){
    await ensureShared();

    const presetData=await json("/__partials/widgets/bitcoin-ticker/chart-presets.json");
    const recipes=Array.isArray(presetData?.recipes)?presetData.recipes:[];
    if(!recipes.length)throw new Error("chart preset registry unavailable");

    populateRecipes(root,recipes);
    await populateSources(root);

    const canvas=root.querySelector("[data-chart-canvas]");
    const tooltip=root.querySelector("[data-chart-tooltip]");
    if(!canvas)throw new Error("chart canvas missing");

    const state={
      recipes,
      chart:new W.ZZXChartEngine.Chart(canvas,tooltip),
      busy:false,
      refreshTimer:null
    };
    root.__zzxTickerChartState=state;

    for(const sel of [
      "[data-chart-source]",
      "[data-chart-timeframe]",
      "[data-chart-resolution]",
      "[data-chart-recipe]"
    ]){
      root.querySelector(sel)?.addEventListener("change",()=>refresh(root,state));
    }

    root.querySelector("[data-chart-refresh]")?.addEventListener("click",()=>refresh(root,state));
    root.querySelector("[data-chart-reset]")?.addEventListener("click",()=>state.chart.resetZoom());

    W.addEventListener("zzx:bpi-selection",async()=>{
      await populateSources(root);
    });

    // Near-real-time update while Chart Lab is open.
    async function loop(){
      if(!root.isConnected)return;
      const panel=root.querySelector('[data-panel="charts"]');
      if(panel&&!panel.hidden)await refresh(root,state);
      state.refreshTimer=setTimeout(loop,2500);
    }
    state.refreshTimer=setTimeout(loop,2500);

    return state;
  }

  W.ZZXBitcoinTickerCharts=Object.freeze({
    __version:1,
    mount,
    refresh
  });
})();
