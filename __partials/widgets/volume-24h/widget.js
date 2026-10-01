(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="volume-24h";
  const HISTORY_REFRESH_MS=30_000;
  const MAX_POINTS_AUTO=6000;
  const MAX_POINTS_DETAIL=12000;

  const STORE=Object.freeze({
    resolution:"zzx.widget.volume-24h.resolution.v4",
    mode:"zzx.widget.volume-24h.mode.v4",
    follow:"zzx.widget.volume-24h.follow-live.v4"
  });

  const MODULES=Object.freeze([
    {
      global:"ZZXPrice",
      path:"/__partials/widgets/_shared/zzx-price.js",
      version:1
    },
    {
      global:"ZZXHistoryClient",
      path:"/__partials/widgets/_shared/zzx-history-client.js",
      version:6
    },
    {
      global:"ZZXChartEngine",
      path:"/__partials/widgets/_shared/zzx-chart-engine.js",
      version:4
    },
    {
      global:"ZZXVolume24HModel",
      path:"js/model.js",
      version:4,
      local:true
    }
  ]);

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }

  function connected(root){
    return !!root?.isConnected;
  }

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
    const raw=path.startsWith("/")?resolve(path):resolve(`${base}/${path}`);

    try{
      const url=new URL(raw,W.location.href);
      url.searchParams.set("volume24dep",String(version));
      return url.href;
    }catch(_){
      return `${raw}${raw.includes("?")?"&":"?"}volume24dep=${encodeURIComponent(version)}`;
    }
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/volume-24h";

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
        script.dataset.volume24Dependency=spec.global;
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
          timeoutMs:5000,
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

  function btc(value){
    const number=finite(value);
    if(!Number.isFinite(number))return "—";
    return `${number.toLocaleString(undefined,{
      maximumFractionDigits:Math.abs(number)>=1000?2:4
    })} BTC`;
  }

  function signedBtc(value){
    const number=finite(value);
    if(!Number.isFinite(number))return "—";
    return `${number>=0?"+":""}${number.toLocaleString(undefined,{maximumFractionDigits:2})} BTC`;
  }

  function pct(value){
    const number=finite(value);
    return Number.isFinite(number)
      ? `${number>=0?"+":""}${number.toFixed(2)}%`
      : "—";
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

  function liveSnapshot(state){
    return state.liveSnapshot||W.ZZXLiveBPISnapshot||state.latest||{};
  }

  function controlState(root){
    return {
      resolution:q(root,"[data-volume24-resolution]")?.value||"auto",
      mode:q(root,"[data-volume24-mode]")?.value||"interval-bars",
      follow:q(root,"[data-volume24-follow]")?.checked!==false
    };
  }

  function applyStoredControls(root){
    const resolution=q(root,"[data-volume24-resolution]");
    const mode=q(root,"[data-volume24-mode]");
    const follow=q(root,"[data-volume24-follow]");
    const savedResolution=safeGet(STORE.resolution);
    const savedMode=safeGet(STORE.mode);

    if(
      resolution&&savedResolution&&
      [...resolution.options].some(option=>option.value===savedResolution)
    )resolution.value=savedResolution;

    if(
      mode&&savedMode&&
      [...mode.options].some(option=>option.value===savedMode)
    )mode.value=savedMode;

    if(follow&&safeGet(STORE.follow)!=null){
      follow.checked=safeGet(STORE.follow)!=="false";
    }
  }

  function saveControls(root){
    const controls=controlState(root);
    safeSet(STORE.resolution,controls.resolution);
    safeSet(STORE.mode,controls.mode);
    safeSet(STORE.follow,controls.follow?"true":"false");
    return controls;
  }

  function renderStats(root,rolling,interval){
    set(root,"[data-volume24-current]",btc(rolling.current));
    set(root,"[data-volume24-open]",btc(rolling.open));
    set(root,"[data-volume24-high]",btc(rolling.high));
    set(root,"[data-volume24-low]",btc(rolling.low));
    set(root,"[data-volume24-average]",btc(rolling.average));

    const change=q(root,"[data-volume24-change]");
    if(change){
      change.textContent=Number.isFinite(rolling.change)
        ? `${signedBtc(rolling.change)} · ${pct(rolling.changePct)}`
        : "—";
      change.dataset.tone=rolling.change>0?"up":rolling.change<0?"down":"flat";
    }

    set(root,"[data-volume24-points]",`${rolling.points.toLocaleString()} rolling points`);
    set(root,"[data-volume24-coverage]",`${rolling.coveragePct.toFixed(1)}% of 24h covered`);
    set(
      root,
      "[data-volume24-cadence]",
      Number.isFinite(rolling.medianIntervalMs)
        ? `median ${duration(rolling.medianIntervalMs)} · max gap ${duration(rolling.largestGapMs)}`
        : "cadence —"
    );
    set(
      root,
      "[data-volume24-age]",
      Number.isFinite(rolling.ageMs)?`edge ${duration(rolling.ageMs)} ago`:"edge —"
    );
    set(
      root,
      "[data-volume24-interval]",
      interval.count
        ? `${interval.count.toLocaleString()} interval buckets · ${btc(interval.total)} total`
        : "interval buckets unavailable"
    );
  }

  function effectiveMode(requested,interval){
    if(requested==="interval-bars"&&!(interval?.count>0))return "rolling-bars";
    return requested;
  }

  function renderLegend(root,mode){
    set(
      root,
      "[data-volume24-legend-label]",
      mode==="interval-bars"
        ? "actual interval BTC volume"
        : mode==="rolling-line"
          ? "rolling 24h BTC volume"
          : "rolling 24h BTC volume bars"
    );

    root.dataset.volumePlot=mode;
  }

  async function historyFor(descriptor,controls){
    const resolution=
      controls.mode!=="rolling-line"&&controls.resolution==="auto"
        ? "5m"
        : controls.resolution;

    return await W.ZZXHistoryClient.series({
      source:descriptor.id,
      timeframe:"24h",
      resolution,
      maxPoints:resolution==="auto"?MAX_POINTS_AUTO:MAX_POINTS_DETAIL
    });
  }

  function tooltipRows(point){
    const date=Number.isFinite(finite(point?.t))
      ? new Date(point.t).toLocaleString()
      : "time —";
    const rolling=finite(point?.volume_24h_btc);
    const interval=finite(point?.interval_volume_btc);
    const price=finite(point?.source_price_usd);
    const grouped=finite(point?.display_bucket_count);

    const rows=[
      date,
      `rolling 24h ${btc(rolling)}`,
      Number.isFinite(interval)
        ? `actual interval ${btc(interval)}${Number.isFinite(grouped)&&grouped>1?` · ${grouped} source buckets`:""}`
        : "actual interval —",
      `BTC / USD ${money(price)}`
    ];

    if(point?.canonical)rows.push("canonical BitAvg live edge");
    return rows;
  }

  function showEmpty(root,show,detail){
    const empty=q(root,"[data-volume24-empty]");
    if(!empty)return;
    empty.hidden=!show;
    if(detail)set(root,"[data-volume24-empty-detail]",detail);
  }

  function paint(root,state,{preserveView=true,resetView=false}={}){
    const controls=controlState(root);
    const rolling=W.ZZXVolume24HModel.rollingStats(state.points);
    const interval=W.ZZXVolume24HModel.intervalStats(state.points);
    const mode=effectiveMode(controls.mode,interval);
    const recipe=W.ZZXVolume24HModel.recipe({mode,rolling,interval});
    const display=W.ZZXVolume24HModel.displayPoints(state.points,mode);

    state.rolling=rolling;
    state.interval=interval;
    state.recipe=recipe;
    state.effectiveMode=mode;
    state.displayPoints=display;

    renderStats(root,rolling,interval);
    renderLegend(root,mode);

    if(renderable(root)){
      state.chart.setData(display,recipe,{
        preserveView:preserveView&&!resetView,
        followRight:controls.follow
      });
      if(resetView)state.chart.resetZoom();
    }

    const enough=display.length>=2;
    showEmpty(
      root,
      !enough,
      state.points.length===1
        ? `Live ${state.descriptor?.label||"BitAvg"} rolling volume is available; waiting for a second history point.`
        : `No ${state.descriptor?.label||"BitAvg"} 24h volume history is available yet.`
    );

    return {rolling,interval,mode,display};
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
      const descriptor=W.ZZXVolume24HModel.sourceDescriptor(quote);
      const sourceChanged=descriptor.id!==state.sourceId;

      state.quote=quote||state.quote||null;
      state.sourceId=descriptor.id;
      state.descriptor=descriptor;

      set(root,"[data-volume24-source]",descriptor.label);
      set(root,"[data-volume24-eyebrow]",`${descriptor.label} · canonical BitAvg market volume · rolling 24h`);

      const data=await historyFor(descriptor,controls);
      state.transport=data.transport||"history";
      state.points=W.ZZXVolume24HModel.mergeLive(
        data.points||[],
        state.quote,
        liveSnapshot(state)
      ).slice(-MAX_POINTS_DETAIL);

      const result=paint(root,state,{
        preserveView:!sourceChanged&&!resetView,
        resetView:sourceChanged||resetView
      });

      const fallback=controls.mode==="interval-bars"&&result.mode!=="interval-bars";
      set(
        root,
        "[data-mini-status]",
        state.points.length>=2
          ? `live · ${descriptor.label} · ${fallback?"rolling bars fallback · ":""}${result.rolling.points.toLocaleString()} points`
          : `waiting · ${descriptor.label}`
      );
      set(
        root,
        "[data-volume24-transport]",
        `${data.transport||"history"} · BitAvg canonical mode${fallback?" · interval_volume_btc unavailable":""}`
      );

      const canvas=q(root,"[data-mini-canvas]");
      if(canvas){
        canvas.setAttribute(
          "aria-label",
          `${descriptor.label} 24 hour Bitcoin volume chart. Current rolling volume ${btc(result.rolling.current)}, high ${btc(result.rolling.high)}, low ${btc(result.rolling.low)}, change ${pct(result.rolling.changePct)}.`
        );
      }
    }catch(error){
      set(root,"[data-mini-status]",`history error: ${String(error?.message||error)}`);
      set(root,"[data-volume24-transport]","transport error");
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

  function applyLive(root,state,snapshot){
    if(!connected(root)||!snapshot)return false;

    state.liveSnapshot=snapshot;
    const quote=canonicalQuote(state.latest);
    const descriptor=W.ZZXVolume24HModel.sourceDescriptor(quote);
    state.quote=quote||state.quote||null;

    if(descriptor.id!==state.sourceId)return false;

    state.points=W.ZZXVolume24HModel.mergeLive(
      state.points,
      state.quote,
      snapshot
    ).slice(-MAX_POINTS_DETAIL);

    const result=paint(root,state,{preserveView:true,resetView:false});
    set(root,"[data-volume24-source]",descriptor.label);
    set(root,"[data-volume24-eyebrow]",`${descriptor.label} · canonical BitAvg market volume · rolling 24h`);
    set(root,"[data-mini-status]",`live · ${descriptor.label} · ${btc(result.rolling.current)}`);
    return true;
  }

  function applyCanonical(root,state,quote){
    if(!connected(root)||!quote)return false;

    const descriptor=W.ZZXVolume24HModel.sourceDescriptor(quote);
    state.quote=quote;

    if(descriptor.id!==state.sourceId)return false;

    state.points=W.ZZXVolume24HModel.mergeLive(
      state.points,
      quote,
      liveSnapshot(state)
    ).slice(-MAX_POINTS_DETAIL);
    paint(root,state,{preserveView:true,resetView:false});
    set(root,"[data-volume24-source]",descriptor.label);
    set(root,"[data-volume24-eyebrow]",`${descriptor.label} · canonical BitAvg market volume · rolling 24h`);
    return true;
  }

  function destroyPrevious(root){
    const previous=root.__zzx_volume_24h;
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
      if(!canvas)throw new Error("volume-24h canvas unavailable");

      applyStoredControls(root);

      const state={
        chart:new W.ZZXChartEngine.Chart(canvas,tooltip,{tooltipFormatter:tooltipRows}),
        busy:false,
        queued:false,
        resetQueued:false,
        timer:null,
        debounceTimer:null,
        sourceId:null,
        descriptor:null,
        latest:null,
        liveSnapshot:W.ZZXLiveBPISnapshot||null,
        quote:null,
        points:[],
        displayPoints:[],
        rolling:null,
        interval:null,
        recipe:null,
        effectiveMode:null,
        transport:null,
        abortController
      };

      root.__zzx_volume_24h=state;

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
            await state.chart.exportPNG(`zzx-${state.sourceId||"bitavg"}-volume-24h.png`);
          }catch(error){
            set(root,"[data-mini-status]",`export error: ${String(error?.message||error)}`);
          }
        },
        options
      );

      for(const selector of [
        "[data-volume24-resolution]",
        "[data-volume24-mode]",
        "[data-volume24-follow]"
      ]){
        q(root,selector)?.addEventListener(
          "change",
          ()=>{
            saveControls(root);
            const needsHistory=selector.includes("resolution")||selector.includes("mode");
            if(needsHistory)scheduleRefresh(0,selector.includes("mode"));
            else paint(root,state,{preserveView:true});
          },
          options
        );
      }

      W.addEventListener(
        "zzx:live-bpi",
        event=>{
          if(!applyLive(root,state,event.detail))scheduleRefresh(0,true);
        },
        options
      );

      W.addEventListener(
        "zzx:canonical-bitcoin-price",
        event=>{
          if(!applyCanonical(root,state,event.detail))scheduleRefresh(0,true);
        },
        options
      );

      W.addEventListener(
        "zzx:bpi-weighting",
        ()=>scheduleRefresh(0,true),
        options
      );

      W.addEventListener(
        "zzx:ticker-widget-toggle",
        event=>{
          if(event.detail?.id!==ID||event.detail?.visible!==true)return;
          W.requestAnimationFrame(()=>{
            state.chart.resize?.();
            paint(root,state,{preserveView:true});
          });
        },
        options
      );

      D.addEventListener(
        "visibilitychange",
        ()=>{
          if(D.visibilityState==="visible"&&connected(root)){
            state.chart.resize?.();
            paint(root,state,{preserveView:true});
          }
        },
        options
      );

      await refresh(root,state,{resetView:true});

      async function loop(){
        if(!connected(root)||abortController?.signal?.aborted)return;
        // Keep the data model current even while visually collapsed. paint()
        // skips the canvas work until the slot is visible again.
        await refresh(root,state);
        state.timer=W.setTimeout(loop,HISTORY_REFRESH_MS);
      }

      state.timer=W.setTimeout(loop,HISTORY_REFRESH_MS);
    }catch(error){
      set(root,"[data-mini-status]",`boot error: ${String(error?.message||error)}`);
      showEmpty(root,true,String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
