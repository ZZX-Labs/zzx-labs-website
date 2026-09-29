(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="high-low-24h";
  const HISTORY_REFRESH_MS=30_000;
  const MAX_POINTS_AUTO=6000;
  const MAX_POINTS_DETAIL=12000;

  const STORE=Object.freeze({
    resolution:"zzx.widget.high-low-24h.resolution.v4",
    view:"zzx.widget.high-low-24h.view.v4",
    follow:"zzx.widget.high-low-24h.follow-live.v4"
  });

  const MODULES=Object.freeze([
    {global:"ZZXPrice",path:"/__partials/widgets/_shared/zzx-price.js",version:1},
    {global:"ZZXHistoryClient",path:"/__partials/widgets/_shared/zzx-history-client.js",version:6},
    {global:"ZZXHighLow24HModel",path:"js/model.js",version:4,local:true},
    {global:"ZZXHighLow24HChart",path:"js/dual-chart.js",version:4,local:true}
  ]);

  function q(root,selector){return root?.querySelector?.(selector)||null}
  function connected(root){return !!root?.isConnected}

  function renderable(root){
    if(!connected(root)||D.visibilityState==="hidden")return false;
    const slot=root.closest?.(".btc-slot,[data-widget-slot],[data-widget]");
    if(slot?.getAttribute?.("aria-hidden")==="true")return false;
    if(slot?.getAttribute?.("data-ticker-visible")==="false")return false;
    if(root.closest?.("[hidden]"))return false;
    return true;
  }

  function set(root,selector,value){
    const element=q(root,selector);
    if(element)element.textContent=value==null?"—":String(value);
  }

  function finite(value){
    const number=Number(value);
    return Number.isFinite(number)?number:NaN;
  }

  function safeGet(key){try{return W.localStorage.getItem(key)}catch(_){return null}}
  function safeSet(key,value){try{W.localStorage.setItem(key,String(value))}catch(_){}}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  function moduleVersion(globalName){return Number(W[globalName]?.__version||0)}

  function versionedURL(path,version,base){
    const raw=path.startsWith("/")?resolve(path):resolve(`${base}/${path}`);
    try{
      const url=new URL(raw,W.location.href);
      url.searchParams.set("hl24dep",String(version));
      return url.href;
    }catch(_){
      return `${raw}${raw.includes("?")?"&":"?"}hl24dep=${encodeURIComponent(version)}`;
    }
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/high-low-24h";

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
        script.dataset.hl24Dependency=spec.global;
        script.addEventListener("load",done,{once:true});
        script.addEventListener("error",()=>fail(new Error(`failed to load ${spec.path}`)),{once:true});
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
        return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs:5000,retries:1});
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
      ? number.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function pct(value,{signed=true}={}){
    const number=finite(value);
    if(!Number.isFinite(number))return "—";
    return `${signed&&number>=0?"+":""}${number.toFixed(2)}%`;
  }

  function duration(ms){
    const number=finite(ms);
    if(!Number.isFinite(number))return "—";
    if(number<1000)return `${Math.round(number)} ms`;
    if(number<60_000)return `${(number/1000).toFixed(number<10_000?1:0)} s`;
    if(number<3_600_000)return `${(number/60_000).toFixed(1)} min`;
    return `${(number/3_600_000).toFixed(1)} h`;
  }

  function canonicalQuote(latest=null){
    return W.ZZXPrice?.current?.(latest)||W.ZZXCanonicalBitcoinPrice||null;
  }

  function controlState(root){
    return {
      resolution:q(root,"[data-hl24-resolution]")?.value||"auto",
      view:q(root,"[data-hl24-view]")?.value||"range-price",
      follow:q(root,"[data-hl24-follow]")?.checked!==false
    };
  }

  function applyStoredControls(root){
    const resolution=q(root,"[data-hl24-resolution]");
    const view=q(root,"[data-hl24-view]");
    const follow=q(root,"[data-hl24-follow]");
    const savedResolution=safeGet(STORE.resolution);
    const savedView=safeGet(STORE.view);

    if(resolution&&savedResolution&&[...resolution.options].some(option=>option.value===savedResolution)){
      resolution.value=savedResolution;
    }
    if(view&&savedView&&[...view.options].some(option=>option.value===savedView)){
      view.value=savedView;
    }
    if(follow&&safeGet(STORE.follow)!=null)follow.checked=safeGet(STORE.follow)!=="false";
  }

  function saveControls(root){
    const controls=controlState(root);
    safeSet(STORE.resolution,controls.resolution);
    safeSet(STORE.view,controls.view);
    safeSet(STORE.follow,controls.follow?"true":"false");
    return controls;
  }

  async function historyFor(descriptor,controls){
    return await W.ZZXHistoryClient.series({
      source:descriptor.id,
      timeframe:"24h",
      resolution:controls.resolution,
      maxPoints:controls.resolution==="auto"?MAX_POINTS_AUTO:MAX_POINTS_DETAIL
    });
  }

  function renderStats(root,stats){
    set(root,"[data-hl24-current]",money(stats.current));
    set(root,"[data-hl24-high]",money(stats.high));
    set(root,"[data-hl24-low]",money(stats.low));
    set(
      root,
      "[data-hl24-range]",
      Number.isFinite(stats.range)?`${money(stats.range)} · ${Math.abs(stats.rangePct).toFixed(2)}%`:"—"
    );
    set(root,"[data-hl24-position]",Number.isFinite(stats.positionPct)?`${stats.positionPct.toFixed(1)}%`:"—");

    const change=q(root,"[data-hl24-change]");
    if(change){
      change.textContent=Number.isFinite(stats.change)
        ? `${stats.change>=0?"+":""}${money(stats.change)} · ${pct(stats.changePct)}`
        : "—";
      change.dataset.tone=stats.change>0?"up":stats.change<0?"down":"flat";
    }

    set(root,"[data-hl24-points]",`${stats.points.toLocaleString()} points`);
    set(root,"[data-hl24-coverage]",`${stats.coveragePct.toFixed(1)}% of 24h covered`);
    set(
      root,
      "[data-hl24-cadence]",
      Number.isFinite(stats.medianIntervalMs)
        ? `median ${duration(stats.medianIntervalMs)} · max gap ${duration(stats.largestGapMs)}`
        : "cadence —"
    );
    set(root,"[data-hl24-age]",Number.isFinite(stats.ageMs)?`edge ${duration(stats.ageMs)} ago`:"edge —");

    set(root,"[data-hl24-range-low]",money(stats.low));
    set(root,"[data-hl24-range-high]",money(stats.high));
    set(root,"[data-hl24-range-current]",`CURRENT ${money(stats.current)}`);

    const marker=q(root,"[data-hl24-range-marker]");
    if(marker){
      marker.style.left=Number.isFinite(stats.positionPct)?`${stats.positionPct}%`:"50%";
      marker.hidden=!Number.isFinite(stats.positionPct);
    }
  }

  function tooltipRows(point){
    const date=Number.isFinite(finite(point?.t))?new Date(point.t).toLocaleString():"time —";
    const open=finite(point?.open);
    const high=finite(point?.high);
    const low=finite(point?.low);
    const close=finite(point?.close??point?.price);
    return [
      date,
      `high ${money(high)}`,
      `price ${money(close)}`,
      `low ${money(low)}`,
      `bucket spread ${Number.isFinite(high)&&Number.isFinite(low)?money(high-low):"—"}`,
      point?.canonical?"canonical BitAvg live edge":null
    ];
  }

  function showEmpty(root,show,detail){
    const empty=q(root,"[data-hl24-empty]");
    if(!empty)return;
    empty.hidden=!show;
    if(detail)set(root,"[data-hl24-empty-detail]",detail);
  }

  function paint(root,state,{preserveView=true,resetView=false}={}){
    const controls=controlState(root);
    const stats=W.ZZXHighLow24HModel.stats(state.points,state.quote);
    const display=W.ZZXHighLow24HModel.displayPoints(state.points,{maxPoints:720});
    state.stats=stats;
    state.displayPoints=display;

    renderStats(root,stats);

    if(renderable(root)){
      state.chart.setData(display,{
        viewMode:controls.view,
        preserveView:preserveView&&!resetView,
        followRight:controls.follow
      });
      if(resetView)state.chart.resetZoom();
    }

    showEmpty(
      root,
      display.length<2,
      state.points.length===1
        ? `Live ${state.descriptor?.label||"BitAvg"} price is available; waiting for a second range-history point.`
        : `No ${state.descriptor?.label||"BitAvg"} 24h high/low history is available yet.`
    );

    return {stats,display};
  }

  async function refresh(root,state,{resetView=false}={}){
    if(!connected(root))return;
    if(state.busy){
      state.queued=true;
      state.resetQueued=state.resetQueued||resetView;
      return;
    }

    state.busy=true;
    try{
      const controls=controlState(root);
      const latest=await json("/bitcoin/bpi/api/latest.json",{optional:true});
      state.latest=latest||state.latest||{};
      const quote=canonicalQuote(state.latest);
      if(!quote)throw new Error("canonical BitAvg price unavailable");

      const descriptor=W.ZZXHighLow24HModel.sourceDescriptor(quote);
      const sourceChanged=descriptor.id!==state.sourceId;
      state.quote=quote;
      state.sourceId=descriptor.id;
      state.descriptor=descriptor;

      set(root,"[data-hl24-source]",descriptor.label);
      set(root,"[data-hl24-eyebrow]",`${descriptor.label} · canonical BitAvg 24h high / low envelope`);

      const data=await historyFor(descriptor,controls);
      state.transport=data.transport||"history";
      state.points=W.ZZXHighLow24HModel.mergeLive(data.points||[],quote).slice(-MAX_POINTS_DETAIL);

      const result=paint(root,state,{
        preserveView:!sourceChanged&&!resetView,
        resetView:sourceChanged||resetView
      });

      set(
        root,
        "[data-hl24-status]",
        state.points.length>=2
          ? `live · ${descriptor.label} · ${money(result.stats.current)}`
          : `waiting · ${descriptor.label}`
      );
      set(root,"[data-hl24-transport]",`${data.transport||"history"} · canonical BitAvg mode`);

      const canvas=q(root,"[data-hl24-canvas]");
      if(canvas){
        canvas.setAttribute(
          "aria-label",
          `${descriptor.label} Bitcoin 24 hour high low chart. Current ${money(result.stats.current)}, high ${money(result.stats.high)}, low ${money(result.stats.low)}, range position ${Number.isFinite(result.stats.positionPct)?result.stats.positionPct.toFixed(1)+" percent":"unknown"}.`
        );
      }
    }catch(error){
      set(root,"[data-hl24-status]",`history error: ${String(error?.message||error)}`);
      set(root,"[data-hl24-transport]","transport error");
      showEmpty(root,true,String(error?.message||error));
    }finally{
      state.busy=false;
      if(state.queued&&connected(root)){
        const reset=state.resetQueued;
        state.queued=false;
        state.resetQueued=false;
        W.setTimeout(()=>refresh(root,state,{resetView:reset}),0);
      }
    }
  }

  function applyCanonical(root,state,quote){
    if(!connected(root)||!quote)return false;
    const descriptor=W.ZZXHighLow24HModel.sourceDescriptor(quote);
    state.quote=quote;

    if(descriptor.id!==state.sourceId)return false;

    state.points=W.ZZXHighLow24HModel.mergeLive(state.points,quote).slice(-MAX_POINTS_DETAIL);
    const result=paint(root,state,{preserveView:true,resetView:false});
    set(root,"[data-hl24-source]",descriptor.label);
    set(root,"[data-hl24-eyebrow]",`${descriptor.label} · canonical BitAvg 24h high / low envelope`);
    set(root,"[data-hl24-status]",`live · ${descriptor.label} · ${money(result.stats.current)}`);
    return true;
  }

  function destroyPrevious(root){
    const previous=root.__zzx_high_low_24h;
    if(!previous)return;
    if(previous.timer)W.clearTimeout(previous.timer);
    if(previous.debounceTimer)W.clearTimeout(previous.debounceTimer);
    previous.abortController?.abort?.();
    previous.chart?.destroy?.();
  }

  async function boot(root,core){
    if(!root)return;
    destroyPrevious(root);

    const abortController=typeof AbortController==="function"?new AbortController():null;
    const options=abortController?{signal:abortController.signal}:undefined;

    try{
      await ensureModules(core||W.ZZXWidgetsCore||null);
      const canvas=q(root,"[data-hl24-canvas]");
      const tooltip=q(root,"[data-hl24-tooltip]");
      if(!canvas)throw new Error("high-low-24h canvas unavailable");

      applyStoredControls(root);

      const state={
        chart:new W.ZZXHighLow24HChart.Chart(canvas,tooltip,{tooltipFormatter:tooltipRows}),
        busy:false,
        queued:false,
        resetQueued:false,
        timer:null,
        debounceTimer:null,
        sourceId:null,
        descriptor:null,
        latest:null,
        quote:null,
        points:[],
        displayPoints:[],
        stats:null,
        transport:null,
        abortController
      };

      root.__zzx_high_low_24h=state;

      const scheduleRefresh=(delay=80,resetView=false)=>{
        if(state.debounceTimer)W.clearTimeout(state.debounceTimer);
        state.debounceTimer=W.setTimeout(()=>refresh(root,state,{resetView}),delay);
      };

      q(root,"[data-hl24-reset]")?.addEventListener("click",()=>state.chart.resetZoom(),options);
      q(root,"[data-hl24-refresh]")?.addEventListener("click",()=>refresh(root,state),options);
      q(root,"[data-hl24-export]")?.addEventListener("click",async()=>{
        try{
          await state.chart.exportPNG(`zzx-${state.sourceId||"bitavg"}-high-low-24h.png`);
        }catch(error){
          set(root,"[data-hl24-status]",`export error: ${String(error?.message||error)}`);
        }
      },options);

      q(root,"[data-hl24-resolution]")?.addEventListener("change",()=>{
        saveControls(root);
        scheduleRefresh(0,true);
      },options);

      q(root,"[data-hl24-view]")?.addEventListener("change",()=>{
        saveControls(root);
        paint(root,state,{preserveView:true});
      },options);

      q(root,"[data-hl24-follow]")?.addEventListener("change",()=>{
        saveControls(root);
        paint(root,state,{preserveView:true});
      },options);

      W.addEventListener("zzx:canonical-bitcoin-price",event=>{
        if(!applyCanonical(root,state,event.detail))scheduleRefresh(0,true);
      },options);

      W.addEventListener("zzx:bpi-weighting",()=>scheduleRefresh(0,true),options);

      W.addEventListener("zzx:ticker-widget-toggle",event=>{
        if(event.detail?.id!==ID||event.detail?.visible!==true)return;
        W.requestAnimationFrame(()=>{
          state.chart.resize?.();
          paint(root,state,{preserveView:true});
        });
      },options);

      D.addEventListener("visibilitychange",()=>{
        if(D.visibilityState==="visible"&&connected(root)){
          state.chart.resize?.();
          paint(root,state,{preserveView:true});
        }
      },options);

      await refresh(root,state,{resetView:true});

      async function loop(){
        if(!connected(root)||abortController?.signal?.aborted)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,HISTORY_REFRESH_MS);
      }
      state.timer=W.setTimeout(loop,HISTORY_REFRESH_MS);
    }catch(error){
      set(root,"[data-hl24-status]",`boot error: ${String(error?.message||error)}`);
      showEmpty(root,true,String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
