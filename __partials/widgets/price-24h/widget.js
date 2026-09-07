(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="price-24h";
  const REFRESH_MS=2500;
  const MAX_POINTS=12000;

  const STORE=Object.freeze({
    resolution:"zzx.widget.price-24h.resolution.v2",
    renderer:"zzx.widget.price-24h.renderer.v2",
    sma:"zzx.widget.price-24h.sma20.v2",
    ema:"zzx.widget.price-24h.ema50.v2",
    follow:"zzx.widget.price-24h.follow-live.v2"
  });

  const MODULES=Object.freeze([
    {
      global:"ZZXHistoryClient",
      path:"/__partials/widgets/_shared/zzx-history-client.js",
      version:2
    },
    {
      global:"ZZXChartEngine",
      path:"/__partials/widgets/_shared/zzx-chart-engine.js",
      version:2
    },
    {
      global:"ZZXPrice24HModel",
      path:"js/model.js",
      version:1,
      local:true
    }
  ]);

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }

  function set(root,selector,value){
    const element=q(root,selector);
    if(element)element.textContent=value==null?"—":String(value);
  }

  function finite(value){
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  }

  function safeGet(key){
    try{return W.localStorage.getItem(key)}catch(_){return null}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value))}catch(_){}
  }

  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function moduleVersion(globalName){
    return Number(W[globalName]?.__version||0);
  }

  function versionedURL(path,version,base){
    const raw=path.startsWith("/")
      ? resolve(path)
      : resolve(`${base}/${path}`);

    try{
      const url=new URL(raw,W.location.href);
      url.searchParams.set("price24dep",String(version));
      return url.href;
    }catch(_){
      return `${raw}${raw.includes("?")?"&":"?"}price24dep=${encodeURIComponent(version)}`;
    }
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/price-24h";

    for(const spec of MODULES){
      if(moduleVersion(spec.global)>=spec.version)continue;

      const src=versionedURL(spec.path,spec.version,base);
      const existing=[...D.scripts].find(script=>script.src===src);

      if(existing){
        const started=Date.now();
        while(moduleVersion(spec.global)<spec.version&&Date.now()-started<1800){
          await new Promise(done=>W.setTimeout(done,25));
        }
        if(moduleVersion(spec.global)>=spec.version)continue;
      }

      await new Promise((done,fail)=>{
        const script=D.createElement("script");
        script.src=src;
        script.defer=true;
        script.dataset.price24Dependency=spec.global;
        script.addEventListener("load",done,{once:true});
        script.addEventListener(
          "error",
          ()=>fail(new Error(`failed to load ${spec.path}`)),
          {once:true}
        );
        (D.head||D.documentElement).appendChild(script);
      });

      if(moduleVersion(spec.global)<spec.version){
        throw new Error(
          `${spec.path} did not register compatible ${spec.global} `+
          `(required >= ${spec.version}, got ${moduleVersion(spec.global)})`
        );
      }
    }
  }

  async function json(path,{optional=false}={}){
    const target=resolve(path);

    try{
      if(W.ZZXAPI?.jsonStrict){
        return await W.ZZXAPI.jsonStrict(target,{
          cacheBust:true,
          timeoutMs:6000,
          retries:1
        });
      }

      const response=await fetch(target,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }catch(error){
      if(optional)return null;
      throw error;
    }
  }

  function money(value){
    const number=finite(value);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:2
        })
      : "—";
  }

  function pct(value){
    const number=finite(value);
    return Number.isFinite(number)
      ? `${number>=0?"+":""}${number.toFixed(2)}%`
      : "—";
  }

  function duration(ms){
    const number=finite(ms);
    if(!Number.isFinite(number))return "—";
    if(number<1000)return `${Math.round(number)} ms`;
    if(number<60_000)return `${(number/1000).toFixed(number<10_000?1:0)} s`;
    if(number<3_600_000)return `${(number/60_000).toFixed(1)} min`;
    return `${(number/3_600_000).toFixed(1)} h`;
  }

  function currentSelection(){
    return W.ZZXBPISelection||W.ZZXSelectedBPI||null;
  }

  function controlState(root){
    return {
      resolution:q(root,"[data-price24-resolution]")?.value||"auto",
      renderer:q(root,"[data-price24-renderer]")?.value||"area",
      sma:q(root,"[data-price24-sma]")?.checked!==false,
      ema:q(root,"[data-price24-ema]")?.checked===true,
      follow:q(root,"[data-price24-follow]")?.checked!==false
    };
  }

  function applyStoredControls(root){
    const resolution=q(root,"[data-price24-resolution]");
    const renderer=q(root,"[data-price24-renderer]");
    const sma=q(root,"[data-price24-sma]");
    const ema=q(root,"[data-price24-ema]");
    const follow=q(root,"[data-price24-follow]");

    const savedResolution=safeGet(STORE.resolution);
    const savedRenderer=safeGet(STORE.renderer);

    if(
      resolution&&
      savedResolution&&
      [...resolution.options].some(option=>option.value===savedResolution)
    ){
      resolution.value=savedResolution;
    }

    if(
      renderer&&
      savedRenderer&&
      [...renderer.options].some(option=>option.value===savedRenderer)
    ){
      renderer.value=savedRenderer;
    }

    if(sma&&safeGet(STORE.sma)!=null)sma.checked=safeGet(STORE.sma)!=="false";
    if(ema&&safeGet(STORE.ema)!=null)ema.checked=safeGet(STORE.ema)==="true";
    if(follow&&safeGet(STORE.follow)!=null)follow.checked=safeGet(STORE.follow)!=="false";
  }

  function saveControls(root){
    const controls=controlState(root);
    safeSet(STORE.resolution,controls.resolution);
    safeSet(STORE.renderer,controls.renderer);
    safeSet(STORE.sma,controls.sma?"true":"false");
    safeSet(STORE.ema,controls.ema?"true":"false");
    safeSet(STORE.follow,controls.follow?"true":"false");
    return controls;
  }

  function renderStats(root,stats){
    set(root,"[data-price24-current]",money(stats.current));
    set(root,"[data-price24-open]",money(stats.open));
    set(root,"[data-price24-high]",money(stats.high));
    set(root,"[data-price24-low]",money(stats.low));
    set(
      root,
      "[data-price24-range]",
      Number.isFinite(stats.range)
        ? `${money(stats.range)} · ${Math.abs(stats.rangePct).toFixed(2)}%`
        : "—"
    );

    const change=q(root,"[data-price24-change]");
    if(change){
      change.textContent=Number.isFinite(stats.change)
        ? `${stats.change>=0?"+":""}${money(stats.change)} · ${pct(stats.changePct)}`
        : "—";
      change.dataset.tone=stats.change>0?"up":stats.change<0?"down":"flat";
    }

    set(root,"[data-price24-points]",`${stats.points.toLocaleString()} points`);
    set(root,"[data-price24-coverage]",`${stats.coveragePct.toFixed(1)}% of 24h covered`);
    set(
      root,
      "[data-price24-cadence]",
      `median cadence ${duration(stats.medianIntervalMs)} · max gap ${duration(stats.largestGapMs)}`
    );
    set(root,"[data-price24-age]",`last point ${duration(stats.ageMs)} ago`);
  }

  function renderLegend(root,controls){
    const sma=q(root,"[data-price24-sma-legend]");
    const ema=q(root,"[data-price24-ema-legend]");
    if(sma)sma.hidden=controls.renderer==="candles"||!controls.sma;
    if(ema)ema.hidden=controls.renderer==="candles"||!controls.ema;
  }

  async function historyFor(descriptor,controls){
    const query=async source=>
      await W.ZZXHistoryClient.series({
        source,
        timeframe:"24h",
        resolution:controls.resolution,
        maxPoints:MAX_POINTS
      });

    let primary=await query(descriptor.id);

    if(
      (primary.points?.length||0)<2&&
      descriptor.compatibility&&
      descriptor.compatibility!==descriptor.id
    ){
      const fallback=await query(descriptor.compatibility);
      if((fallback.points?.length||0)>(primary.points?.length||0)){
        primary={...fallback,compatibilitySource:descriptor.compatibility};
      }
    }

    return primary;
  }

  function tooltipRows(point){
    const date=Number.isFinite(finite(point?.t))
      ? new Date(point.t).toLocaleString()
      : "time —";
    const open=finite(point?.open);
    const high=finite(point?.high);
    const low=finite(point?.low);
    const close=finite(point?.close??point?.price);
    const change=finite(point?.change);
    const changePct=finite(point?.change_pct);
    const volume=finite(point?.volume_24h_btc);

    return [
      date,
      `close ${money(close)}`,
      `O ${money(open)} · H ${money(high)} · L ${money(low)} · C ${money(close)}`,
      `tick Δ ${Number.isFinite(change)?`${change>=0?"+":""}${money(change)}`:"—"} · ${pct(changePct)}`,
      `24h market volume ${Number.isFinite(volume)?`${volume.toLocaleString(undefined,{maximumFractionDigits:2})} BTC`:"—"}`
    ];
  }

  function showEmpty(root,show,detail){
    const empty=q(root,"[data-price24-empty]");
    if(!empty)return;
    empty.hidden=!show;
    if(detail)set(root,"[data-price24-empty-detail]",detail);
  }

  async function refresh(root,state,{resetView=false}={}){
    if(!root.isConnected)return;

    if(state.busy){
      state.queued=true;
      state.resetQueued=state.resetQueued||resetView;
      return;
    }

    state.busy=true;

    try{
      const controls=controlState(root);
      const latest=await json("/bitcoin/bpi/api/latest.json",{optional:true});
      const selection=currentSelection();
      const descriptor=W.ZZXPrice24HModel.sourceDescriptor(selection,latest||{});
      const sourceChanged=descriptor.id!==state.sourceId;
      state.sourceId=descriptor.id;
      state.descriptor=descriptor;

      set(root,"[data-price24-source]",descriptor.label);
      set(
        root,
        "[data-price24-eyebrow]",
        `${descriptor.label} · 24h · ${selection?.weightsEnabled===false?"unweighted":"weighted/default"}`
      );

      const data=await historyFor(descriptor,controls);
      const points=W.ZZXPrice24HModel.mergeLive(data.points||[],selection);
      const stats=W.ZZXPrice24HModel.stats(points);
      const recipe=W.ZZXPrice24HModel.recipe({
        renderer:controls.renderer,
        sma20:controls.sma,
        ema50:controls.ema,
        stats
      });

      state.points=points;
      state.stats=stats;
      state.recipe=recipe;
      state.transport=data.transport||"history";

      renderStats(root,stats);
      renderLegend(root,controls);

      const mustReset=resetView||sourceChanged;
      state.chart.setData(points,recipe,{
        preserveView:!mustReset,
        followRight:controls.follow
      });

      if(mustReset)state.chart.resetZoom();

      const enough=points.length>=2;
      showEmpty(
        root,
        !enough,
        points.length===1
          ? `Live ${descriptor.label} is available, but the 24h collector has not accumulated a second point yet.`
          : `No ${descriptor.label} 24h history is available yet. The chart will populate as the local collector/browser-live history accumulates.`
      );

      const compatibility=data.compatibilitySource
        ? ` · compatibility ${data.compatibilitySource}`
        : "";

      set(
        root,
        "[data-mini-status]",
        enough
          ? `live · ${stats.points.toLocaleString()} points · ${data.resolution||controls.resolution}`
          : `waiting for ${descriptor.label} history`
      );
      set(
        root,
        "[data-price24-transport]",
        `${data.transport||"history"}${compatibility}`
      );

      const canvas=q(root,"[data-mini-canvas]");
      if(canvas){
        canvas.setAttribute(
          "aria-label",
          `${descriptor.label} 24 hour price chart. Current ${money(stats.current)}, high ${money(stats.high)}, low ${money(stats.low)}, change ${pct(stats.changePct)}.`
        );
      }
    }catch(error){
      set(root,"[data-mini-status]",`history error: ${String(error?.message||error)}`);
      set(root,"[data-price24-transport]","transport error");
      showEmpty(root,true,String(error?.message||error));
    }finally{
      state.busy=false;

      if(state.queued&&root.isConnected){
        const reset=state.resetQueued;
        state.queued=false;
        state.resetQueued=false;
        W.setTimeout(()=>refresh(root,state,{resetView:reset}),0);
      }
    }
  }

  function destroyPrevious(root){
    const previous=root.__zzx_price_24h;
    if(!previous)return;

    if(previous.timer)W.clearTimeout(previous.timer);
    if(previous.debounceTimer)W.clearTimeout(previous.debounceTimer);
    previous.abortController?.abort?.();
    previous.chart?.destroy?.();
  }

  async function boot(root,core){
    if(!root)return;

    destroyPrevious(root);

    const abortController=typeof AbortController==="function"
      ? new AbortController()
      : null;

    const options=abortController?{signal:abortController.signal}:undefined;

    try{
      await ensureModules(core||W.ZZXWidgetsCore||null);

      const canvas=q(root,"[data-mini-canvas]");
      const tooltip=q(root,"[data-mini-tooltip]");
      if(!canvas)throw new Error("price-24h canvas unavailable");

      applyStoredControls(root);

      const state={
        chart:new W.ZZXChartEngine.Chart(canvas,tooltip,{
          tooltipFormatter:tooltipRows
        }),
        busy:false,
        queued:false,
        resetQueued:false,
        timer:null,
        debounceTimer:null,
        sourceId:null,
        descriptor:null,
        points:[],
        stats:null,
        recipe:null,
        transport:null,
        abortController
      };

      root.__zzx_price_24h=state;

      const scheduleRefresh=(delay=80,resetView=false)=>{
        if(state.debounceTimer)W.clearTimeout(state.debounceTimer);
        state.debounceTimer=W.setTimeout(
          ()=>refresh(root,state,{resetView}),
          delay
        );
      };

      q(root,"[data-mini-reset]")?.addEventListener(
        "click",
        ()=>state.chart.resetZoom(),
        options
      );

      q(root,"[data-mini-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state),
        options
      );

      q(root,"[data-mini-export]")?.addEventListener(
        "click",
        async()=>{
          try{
            await state.chart.exportPNG(
              `zzx-${state.sourceId||"bpi"}-price-24h.png`
            );
          }catch(error){
            set(root,"[data-mini-status]",`export error: ${String(error?.message||error)}`);
          }
        },
        options
      );

      for(const selector of [
        "[data-price24-resolution]",
        "[data-price24-renderer]",
        "[data-price24-sma]",
        "[data-price24-ema]",
        "[data-price24-follow]"
      ]){
        q(root,selector)?.addEventListener(
          "change",
          ()=>{
            saveControls(root);
            const rendererChanged=selector.includes("renderer");
            scheduleRefresh(0,rendererChanged);
          },
          options
        );
      }

      const sourceEvents=[
        "zzx:bpi-selection",
        "zzx:bpi-country",
        "zzx:bpi-weighting"
      ];

      for(const eventName of sourceEvents){
        W.addEventListener(
          eventName,
          ()=>scheduleRefresh(40,true),
          options
        );
      }

      for(const eventName of ["zzx:live-bpi","zzx:bpi:update"]){
        W.addEventListener(
          eventName,
          ()=>scheduleRefresh(80,false),
          options
        );
      }

      await refresh(root,state,{resetView:true});

      async function loop(){
        if(!root.isConnected||abortController?.signal?.aborted)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,REFRESH_MS);
      }

      state.timer=W.setTimeout(loop,REFRESH_MS);
    }catch(error){
      set(root,"[data-mini-status]",`boot error: ${String(error?.message||error)}`);
      showEmpty(root,true,String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
