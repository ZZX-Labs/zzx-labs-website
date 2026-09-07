(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="volume-24h";
  const REFRESH_MS=2500;
  const MAX_POINTS=12000;

  const STORE=Object.freeze({
    resolution:
      "zzx.widget.volume-24h.resolution.v2",
    mode:
      "zzx.widget.volume-24h.mode.v2",
    follow:
      "zzx.widget.volume-24h.follow-live.v2"
  });

  const MODULES=Object.freeze([
    {
      global:"ZZXHistoryClient",
      path:
        "/__partials/widgets/_shared/zzx-history-client.js",
      version:3
    },
    {
      global:"ZZXChartEngine",
      path:
        "/__partials/widgets/_shared/zzx-chart-engine.js",
      version:2
    },
    {
      global:"ZZXVolume24HModel",
      path:"js/model.js",
      version:1,
      local:true
    }
  ]);

  function q(root,selector){
    return (
      root?.querySelector?.(
        selector
      )||
      null
    );
  }

  function set(
    root,
    selector,
    value
  ){
    const element=
      q(root,selector);

    if(element){
      element.textContent=
        value==null
          ? "—"
          : String(value);
    }
  }

  function finite(value){
    const number=
      Number(value);

    return Number.isFinite(number)
      ? number
      : NaN;
  }

  function safeGet(key){
    try{
      return W.localStorage.getItem(
        key
      );
    }catch(_){
      return null;
    }
  }

  function safeSet(
    key,
    value
  ){
    try{
      W.localStorage.setItem(
        key,
        String(value)
      );
    }catch(_){}
  }

  function resolve(path){
    return W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;
  }

  function moduleVersion(
    globalName
  ){
    return Number(
      W[globalName]?.__version||
      0
    );
  }

  function versionedURL(
    path,
    version,
    base
  ){
    const raw=
      path.startsWith("/")
        ? resolve(path)
        : resolve(
            `${base}/${path}`
          );

    try{
      const url=
        new URL(
          raw,
          W.location.href
        );

      url.searchParams.set(
        "volume24dep",
        String(version)
      );

      return url.href;
    }catch(_){
      return (
        `${raw}`+
        `${raw.includes("?")?"&":"?"}`+
        `volume24dep=${encodeURIComponent(version)}`
      );
    }
  }

  async function ensureModules(
    core
  ){
    const base=
      core?.widgetBase
        ? String(
            core.widgetBase(ID)
          ).replace(
            /\/+$/g,
            ""
          )
        : "/__partials/widgets/volume-24h";

    for(const spec of MODULES){
      if(
        moduleVersion(
          spec.global
        )>=spec.version
      ){
        continue;
      }

      const src=
        versionedURL(
          spec.path,
          spec.version,
          base
        );

      const existing=[
        ...D.scripts
      ].find(
        script=>
          script.src===src
      );

      if(existing){
        const started=
          Date.now();

        while(
          moduleVersion(
            spec.global
          )<spec.version &&
          Date.now()-started<1800
        ){
          await new Promise(
            done=>
              W.setTimeout(
                done,
                25
              )
          );
        }

        if(
          moduleVersion(
            spec.global
          )>=spec.version
        ){
          continue;
        }
      }

      await new Promise(
        (done,fail)=>{
          const script=
            D.createElement(
              "script"
            );

          script.src=src;
          script.defer=true;

          script.dataset.volume24Dependency=
            spec.global;

          script.addEventListener(
            "load",
            done,
            {once:true}
          );

          script.addEventListener(
            "error",
            ()=>fail(
              new Error(
                `failed to load ${spec.path}`
              )
            ),
            {once:true}
          );

          (
            D.head||
            D.documentElement
          ).appendChild(
            script
          );
        }
      );

      if(
        moduleVersion(
          spec.global
        )<spec.version
      ){
        throw new Error(
          `${spec.path} did not register compatible ${spec.global} `+
          `(required >= ${spec.version}, got ${moduleVersion(spec.global)})`
        );
      }
    }
  }

  async function json(
    path,
    {optional=false}={}
  ){
    const target=
      resolve(path);

    try{
      if(W.ZZXAPI?.jsonStrict){
        return await W.ZZXAPI.jsonStrict(
          target,
          {
            cacheBust:true,
            timeoutMs:6000,
            retries:1
          }
        );
      }

      const response=
        await fetch(
          target,
          {cache:"no-store"}
        );

      if(!response.ok){
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return await response.json();
    }catch(error){
      if(optional)return null;
      throw error;
    }
  }

  function btc(value){
    const number=
      finite(value);

    if(
      !Number.isFinite(number)
    ){
      return "—";
    }

    return (
      number.toLocaleString(
        undefined,
        {
          maximumFractionDigits:
            Math.abs(number)>=1000
              ? 2
              : 4
        }
      )+
      " BTC"
    );
  }

  function signedBtc(value){
    const number=
      finite(value);

    if(!Number.isFinite(number)){
      return "—";
    }

    return (
      `${number>=0?"+":""}`+
      `${number.toLocaleString(
        undefined,
        {
          maximumFractionDigits:2
        }
      )} BTC`
    );
  }

  function pct(value){
    const number=
      finite(value);

    return Number.isFinite(number)
      ? (
          `${number>=0?"+":""}`+
          `${number.toFixed(2)}%`
        )
      : "—";
  }

  function money(value){
    const number=
      finite(value);

    return Number.isFinite(number)
      ? number.toLocaleString(
          undefined,
          {
            style:"currency",
            currency:"USD",
            maximumFractionDigits:2
          }
        )
      : "—";
  }

  function duration(ms){
    const number=
      finite(ms);

    if(
      !Number.isFinite(number)
    ){
      return "—";
    }

    if(number<1000){
      return `${Math.round(number)} ms`;
    }

    if(number<60_000){
      return (
        `${(
          number/1000
        ).toFixed(
          number<10_000
            ? 1
            : 0
        )} s`
      );
    }

    if(number<3_600_000){
      return (
        `${(
          number/60_000
        ).toFixed(1)} min`
      );
    }

    return (
      `${(
        number/3_600_000
      ).toFixed(1)} h`
    );
  }

  function currentSelection(){
    return (
      W.ZZXBPISelection||
      W.ZZXSelectedBPI||
      null
    );
  }

  function controlState(root){
    return {
      resolution:
        q(
          root,
          "[data-volume24-resolution]"
        )?.value||
        "auto",
      mode:
        q(
          root,
          "[data-volume24-mode]"
        )?.value||
        "candles-line",
      follow:
        q(
          root,
          "[data-volume24-follow]"
        )?.checked!==false
    };
  }

  function applyStoredControls(
    root
  ){
    const resolution=
      q(
        root,
        "[data-volume24-resolution]"
      );

    const mode=
      q(
        root,
        "[data-volume24-mode]"
      );

    const follow=
      q(
        root,
        "[data-volume24-follow]"
      );

    const savedResolution=
      safeGet(
        STORE.resolution
      );

    const savedMode=
      safeGet(
        STORE.mode
      );

    if(
      resolution &&
      savedResolution &&
      [...resolution.options].some(
        option=>
          option.value===
          savedResolution
      )
    ){
      resolution.value=
        savedResolution;
    }

    if(
      mode &&
      savedMode &&
      [...mode.options].some(
        option=>
          option.value===
          savedMode
      )
    ){
      mode.value=
        savedMode;
    }

    if(
      follow &&
      safeGet(
        STORE.follow
      )!=null
    ){
      follow.checked=
        safeGet(
          STORE.follow
        )!=="false";
    }
  }

  function saveControls(root){
    const controls=
      controlState(root);

    safeSet(
      STORE.resolution,
      controls.resolution
    );

    safeSet(
      STORE.mode,
      controls.mode
    );

    safeSet(
      STORE.follow,
      controls.follow
        ? "true"
        : "false"
    );

    return controls;
  }

  function renderStats(
    root,
    stats
  ){
    set(
      root,
      "[data-volume24-current]",
      btc(stats.current)
    );

    set(
      root,
      "[data-volume24-open]",
      btc(stats.open)
    );

    set(
      root,
      "[data-volume24-high]",
      btc(stats.high)
    );

    set(
      root,
      "[data-volume24-low]",
      btc(stats.low)
    );

    set(
      root,
      "[data-volume24-range]",
      Number.isFinite(
        stats.range
      )
        ? (
            `${btc(stats.range)} · `+
            `${Math.abs(
              stats.rangePct
            ).toFixed(2)}%`
          )
        : "—"
    );

    set(
      root,
      "[data-volume24-average]",
      btc(stats.average)
    );

    set(
      root,
      "[data-volume24-median]",
      btc(stats.median)
    );

    const change=
      q(
        root,
        "[data-volume24-change]"
      );

    if(change){
      change.textContent=
        Number.isFinite(
          stats.change
        )
          ? (
              `${signedBtc(stats.change)} · `+
              `${pct(stats.changePct)}`
            )
          : "—";

      change.dataset.tone=
        stats.change>0
          ? "up"
          : stats.change<0
            ? "down"
            : "flat";
    }

    set(
      root,
      "[data-volume24-points]",
      `${stats.points.toLocaleString()} points`
    );

    set(
      root,
      "[data-volume24-coverage]",
      `${stats.coveragePct.toFixed(1)}% of 24h covered`
    );

    set(
      root,
      "[data-volume24-cadence]",
      `median cadence ${duration(stats.medianIntervalMs)} · `+
      `max gap ${duration(stats.largestGapMs)}`
    );

    set(
      root,
      "[data-volume24-age]",
      `last point ${duration(stats.ageMs)} ago`
    );
  }

  function renderLegend(
    root,
    controls
  ){
    const line=
      q(
        root,
        "[data-volume24-line-legend]"
      );

    if(line){
      line.hidden=
        controls.mode!==
        "candles-line";
    }
  }

  async function historyFor(
    descriptor,
    controls
  ){
    const query=
      async source=>
        await W.ZZXHistoryClient.series({
          source,
          timeframe:"24h",
          resolution:
            controls.resolution,
          maxPoints:
            MAX_POINTS
        });

    let primary=
      await query(
        descriptor.id
      );

    if(
      (
        primary.points?.length||
        0
      )<2 &&
      descriptor.compatibility &&
      descriptor.compatibility!==
        descriptor.id
    ){
      const fallback=
        await query(
          descriptor.compatibility
        );

      if(
        (
          fallback.points?.length||
          0
        )>
        (
          primary.points?.length||
          0
        )
      ){
        primary={
          ...fallback,
          compatibilitySource:
            descriptor.compatibility
        };
      }
    }

    return primary;
  }

  function tooltipRows(point){
    const date=
      Number.isFinite(
        finite(point?.t)
      )
        ? new Date(
            point.t
          ).toLocaleString()
        : "time —";

    const open=
      finite(point?.open);

    const high=
      finite(point?.high);

    const low=
      finite(point?.low);

    const close=
      finite(
        point?.close ??
        point?.volume_24h_btc
      );

    const delta=
      Number.isFinite(open) &&
      Number.isFinite(close)
        ? close-open
        : NaN;

    const deltaPct=
      Number.isFinite(delta) &&
      open>0
        ? delta/open*100
        : NaN;

    const price=
      finite(
        point?.source_price_usd
      );

    return [
      date,
      `24h volume close ${btc(close)}`,
      `O ${btc(open)} · H ${btc(high)} · L ${btc(low)} · C ${btc(close)}`,
      `bucket Δ ${signedBtc(delta)} · ${pct(deltaPct)}`,
      `contemporaneous BTC price ${money(price)}`
    ];
  }

  function showEmpty(
    root,
    show,
    detail
  ){
    const empty=
      q(
        root,
        "[data-volume24-empty]"
      );

    if(!empty)return;

    empty.hidden=
      !show;

    if(detail){
      set(
        root,
        "[data-volume24-empty-detail]",
        detail
      );
    }
  }

  async function refresh(
    root,
    state,
    {resetView=false}={}
  ){
    if(!root.isConnected){
      return;
    }

    if(state.busy){
      state.queued=true;
      state.resetQueued=
        state.resetQueued||
        resetView;
      return;
    }

    state.busy=true;

    try{
      const controls=
        controlState(root);

      const latest=
        await json(
          "/bitcoin/bpi/api/latest.json",
          {optional:true}
        );

      const selection=
        currentSelection();

      const descriptor=
        W.ZZXVolume24HModel
          .sourceDescriptor(
            selection,
            latest||{}
          );

      const sourceChanged=
        descriptor.id!==
        state.sourceId;

      state.sourceId=
        descriptor.id;

      state.descriptor=
        descriptor;

      set(
        root,
        "[data-volume24-source]",
        descriptor.label
      );

      set(
        root,
        "[data-volume24-eyebrow]",
        `${descriptor.label} · rolling 24h BTC volume · `+
        `${controls.mode==="candles-line"?"candles + close line":controls.mode}`
      );

      const data=
        await historyFor(
          descriptor,
          controls
        );

      const merged=
        W.ZZXVolume24HModel
          .mergeLive(
            data.points||[],
            selection
          );

      const points=
        W.ZZXVolume24HModel
          .normalize(
            merged
          );

      const stats=
        W.ZZXVolume24HModel
          .stats(
            points
          );

      const recipe=
        W.ZZXVolume24HModel
          .recipe({
            mode:
              controls.mode,
            stats
          });

      state.points=
        points;

      state.stats=
        stats;

      state.recipe=
        recipe;

      state.transport=
        data.transport||
        "history";

      renderStats(
        root,
        stats
      );

      renderLegend(
        root,
        controls
      );

      const mustReset=
        resetView||
        sourceChanged;

      state.chart.setData(
        points,
        recipe,
        {
          preserveView:
            !mustReset,
          followRight:
            controls.follow
        }
      );

      if(mustReset){
        state.chart.resetZoom();
      }

      const enough=
        points.length>=2;

      showEmpty(
        root,
        !enough,
        points.length===1
          ? (
              `Live ${descriptor.label} volume is available, but the 24h collector has not accumulated a second volume point yet.`
            )
          : (
              `No ${descriptor.label} rolling-volume history is available yet. The chart will populate as collector/browser-live history accumulates.`
            )
      );

      const compatibility=
        data.compatibilitySource
          ? (
              ` · compatibility `+
              `${data.compatibilitySource}`
            )
          : "";

      set(
        root,
        "[data-mini-status]",
        enough
          ? (
              `live · ${stats.points.toLocaleString()} points · `+
              `${data.resolution||controls.resolution}`
            )
          : (
              `waiting for ${descriptor.label} volume history`
            )
      );

      set(
        root,
        "[data-volume24-transport]",
        `${data.transport||"history"}${compatibility}`
      );

      const canvas=
        q(
          root,
          "[data-mini-canvas]"
        );

      if(canvas){
        canvas.setAttribute(
          "aria-label",
          `${descriptor.label} rolling 24 hour BTC-volume chart. `+
          `Current ${btc(stats.current)}, `+
          `high ${btc(stats.high)}, `+
          `low ${btc(stats.low)}, `+
          `change ${pct(stats.changePct)}.`
        );
      }
    }catch(error){
      set(
        root,
        "[data-mini-status]",
        `history error: ${String(error?.message||error)}`
      );

      set(
        root,
        "[data-volume24-transport]",
        "transport error"
      );

      showEmpty(
        root,
        true,
        String(
          error?.message||
          error
        )
      );
    }finally{
      state.busy=false;

      if(
        state.queued &&
        root.isConnected
      ){
        const reset=
          state.resetQueued;

        state.queued=false;
        state.resetQueued=false;

        W.setTimeout(
          ()=>refresh(
            root,
            state,
            {
              resetView:reset
            }
          ),
          0
        );
      }
    }
  }

  function destroyPrevious(root){
    const previous=
      root.__zzx_volume_24h;

    if(!previous)return;

    if(previous.timer){
      W.clearTimeout(
        previous.timer
      );
    }

    if(
      previous.debounceTimer
    ){
      W.clearTimeout(
        previous.debounceTimer
      );
    }

    previous.abortController
      ?.abort?.();

    previous.chart
      ?.destroy?.();
  }

  async function boot(
    root,
    core
  ){
    if(!root)return;

    destroyPrevious(root);

    const abortController=
      typeof AbortController===
      "function"
        ? new AbortController()
        : null;

    const options=
      abortController
        ? {
            signal:
              abortController.signal
          }
        : undefined;

    try{
      await ensureModules(
        core||
        W.ZZXWidgetsCore||
        null
      );

      const canvas=
        q(
          root,
          "[data-mini-canvas]"
        );

      const tooltip=
        q(
          root,
          "[data-mini-tooltip]"
        );

      if(!canvas){
        throw new Error(
          "volume-24h canvas unavailable"
        );
      }

      applyStoredControls(
        root
      );

      const state={
        chart:
          new W.ZZXChartEngine.Chart(
            canvas,
            tooltip,
            {
              tooltipFormatter:
                tooltipRows
            }
          ),
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

      root.__zzx_volume_24h=
        state;

      const scheduleRefresh=(
        delay=80,
        resetView=false
      )=>{
        if(state.debounceTimer){
          W.clearTimeout(
            state.debounceTimer
          );
        }

        state.debounceTimer=
          W.setTimeout(
            ()=>refresh(
              root,
              state,
              {resetView}
            ),
            delay
          );
      };

      q(
        root,
        "[data-mini-reset]"
      )?.addEventListener(
        "click",
        ()=>state.chart.resetZoom(),
        options
      );

      q(
        root,
        "[data-mini-refresh]"
      )?.addEventListener(
        "click",
        ()=>refresh(
          root,
          state
        ),
        options
      );

      q(
        root,
        "[data-mini-export]"
      )?.addEventListener(
        "click",
        async()=>{
          try{
            await state.chart.exportPNG(
              `zzx-${state.sourceId||"bpi"}-volume-24h.png`
            );
          }catch(error){
            set(
              root,
              "[data-mini-status]",
              `export error: ${String(error?.message||error)}`
            );
          }
        },
        options
      );

      for(
        const selector
        of [
          "[data-volume24-resolution]",
          "[data-volume24-mode]",
          "[data-volume24-follow]"
        ]
      ){
        q(
          root,
          selector
        )?.addEventListener(
          "change",
          ()=>{
            saveControls(root);

            const modeChanged=
              selector.includes(
                "mode"
              );

            scheduleRefresh(
              0,
              modeChanged
            );
          },
          options
        );
      }

      const sourceEvents=[
        "zzx:bpi-selection",
        "zzx:bpi-country",
        "zzx:bpi-weighting"
      ];

      for(
        const eventName
        of sourceEvents
      ){
        W.addEventListener(
          eventName,
          ()=>scheduleRefresh(
            40,
            true
          ),
          options
        );
      }

      for(
        const eventName
        of [
          "zzx:live-bpi",
          "zzx:bpi:update"
        ]
      ){
        W.addEventListener(
          eventName,
          ()=>scheduleRefresh(
            80,
            false
          ),
          options
        );
      }

      await refresh(
        root,
        state,
        {
          resetView:true
        }
      );

      async function loop(){
        if(
          !root.isConnected ||
          abortController
            ?.signal
            ?.aborted
        ){
          return;
        }

        await refresh(
          root,
          state
        );

        state.timer=
          W.setTimeout(
            loop,
            REFRESH_MS
          );
      }

      state.timer=
        W.setTimeout(
          loop,
          REFRESH_MS
        );
    }catch(error){
      set(
        root,
        "[data-mini-status]",
        `boot error: ${String(error?.message||error)}`
      );

      showEmpty(
        root,
        true,
        String(
          error?.message||
          error
        )
      );
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(
      ID,
      boot
    );
  }else if(
    W.ZZXWidgetsCore?.onMount
  ){
    W.ZZXWidgetsCore.onMount(
      ID,
      boot
    );
  }else if(
    W.ZZXWidgets?.register
  ){
    W.ZZXWidgets.register(
      ID,
      boot
    );
  }
})();
