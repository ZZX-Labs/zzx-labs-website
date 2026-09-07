(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="high-low-24h";
  const REFRESH_MS=2500;
  const MAX_POINTS=12000;

  const STORE=Object.freeze({
    resolution:
      "zzx.widget.high-low-24h.resolution.v2",
    priceMode:
      "zzx.widget.high-low-24h.price-mode.v2",
    volumeMode:
      "zzx.widget.high-low-24h.volume-mode.v2",
    follow:
      "zzx.widget.high-low-24h.follow-live.v2"
  });

  const MODULES=Object.freeze([
    {
      global:"ZZXHistoryClient",
      path:
        "/__partials/widgets/_shared/zzx-history-client.js",
      version:4
    },
    {
      global:"ZZXHighLow24HModel",
      path:"js/model.js",
      version:1
    },
    {
      global:"ZZXHighLow24HChart",
      path:"js/dual-chart.js",
      version:1
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
      return W.localStorage
        .getItem(key);
    }catch(_){
      return null;
    }
  }

  function safeSet(key,value){
    try{
      W.localStorage
        .setItem(
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

  function moduleVersion(name){
    return Number(
      W[name]?.__version||
      0
    );
  }

  function moduleURL(
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
        "hl24dep",
        String(version)
      );

      return url.href;
    }catch(_){
      return (
        `${raw}`+
        `${raw.includes("?")?"&":"?"}`+
        `hl24dep=${encodeURIComponent(version)}`
      );
    }
  }

  async function ensureModules(core){
    const base=
      core?.widgetBase
        ? String(
            core.widgetBase(ID)
          ).replace(
            /\/+$/g,
            ""
          )
        : "/__partials/widgets/high-low-24h";

    for(const spec of MODULES){
      if(
        moduleVersion(
          spec.global
        )>=spec.version
      ){
        continue;
      }

      const src=
        moduleURL(
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
          script.dataset.hl24Dependency=
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
        return await W.ZZXAPI
          .jsonStrict(
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
          {
            cache:"no-store"
          }
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

  function usd(value){
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

  function btc(value){
    const number=
      finite(value);

    return Number.isFinite(number)
      ? (
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
        )
      : "—";
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

  function signedUsd(value){
    const number=
      finite(value);

    return Number.isFinite(number)
      ? (
          `${number>=0?"+":""}`+
          `${usd(Math.abs(number))}`
            .replace(
              /^\$/,
              "$"
            )
        )
      : "—";
  }

  function signedBtc(value){
    const number=
      finite(value);

    return Number.isFinite(number)
      ? (
          `${number>=0?"+":""}`+
          `${number.toLocaleString(
            undefined,
            {
              maximumFractionDigits:2
            }
          )} BTC`
        )
      : "—";
  }

  function duration(ms){
    const number=
      finite(ms);

    if(!Number.isFinite(number)){
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

  function controls(root){
    return {
      resolution:
        q(
          root,
          "[data-hl24-resolution]"
        )?.value||
        "auto",
      priceMode:
        q(
          root,
          "[data-hl24-price-mode]"
        )?.value||
        "area",
      volumeMode:
        q(
          root,
          "[data-hl24-volume-mode]"
        )?.value||
        "candles-line",
      follow:
        q(
          root,
          "[data-hl24-follow]"
        )?.checked!==false
    };
  }

  function applyStored(root){
    const resolution=
      q(
        root,
        "[data-hl24-resolution]"
      );

    const priceMode=
      q(
        root,
        "[data-hl24-price-mode]"
      );

    const volumeMode=
      q(
        root,
        "[data-hl24-volume-mode]"
      );

    const follow=
      q(
        root,
        "[data-hl24-follow]"
      );

    for(
      const [
        element,
        value
      ]
      of [
        [
          resolution,
          safeGet(
            STORE.resolution
          )
        ],
        [
          priceMode,
          safeGet(
            STORE.priceMode
          )
        ],
        [
          volumeMode,
          safeGet(
            STORE.volumeMode
          )
        ]
      ]
    ){
      if(
        element &&
        value &&
        [...element.options].some(
          option=>
            option.value===value
        )
      ){
        element.value=value;
      }
    }

    const storedFollow=
      safeGet(
        STORE.follow
      );

    if(
      follow &&
      storedFollow!=null
    ){
      follow.checked=
        storedFollow!=="false";
    }
  }

  function saveControls(root){
    const value=
      controls(root);

    safeSet(
      STORE.resolution,
      value.resolution
    );

    safeSet(
      STORE.priceMode,
      value.priceMode
    );

    safeSet(
      STORE.volumeMode,
      value.volumeMode
    );

    safeSet(
      STORE.follow,
      value.follow
        ? "true"
        : "false"
    );

    return value;
  }

  async function historyFor(
    descriptor,
    control
  ){
    const query=
      async source=>
        await W.ZZXHistoryClient
          .series({
            source,
            timeframe:"24h",
            resolution:
              control.resolution,
            maxPoints:
              MAX_POINTS
          });

    let result=
      await query(
        descriptor.id
      );

    if(
      (
        result.points?.length||
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
          result.points?.length||
          0
        )
      ){
        result={
          ...fallback,
          compatibilitySource:
            descriptor.compatibility
        };
      }
    }

    return result;
  }

  function tone(element,value){
    if(!element)return;

    element.dataset.tone=
      value>0
        ? "up"
        : value<0
          ? "down"
          : "flat";
  }

  function renderStats(root,stats){
    set(
      root,
      "[data-hl24-price-current]",
      usd(
        stats.priceCurrent
      )
    );

    set(
      root,
      "[data-hl24-price-high]",
      usd(
        stats.priceHigh24
      )
    );

    set(
      root,
      "[data-hl24-price-low]",
      usd(
        stats.priceLow24
      )
    );

    set(
      root,
      "[data-hl24-price-range]",
      Number.isFinite(
        stats.priceRange
      )
        ? (
            `${usd(stats.priceRange)} · `+
            `${stats.priceRangePct.toFixed(2)}%`
          )
        : "—"
    );

    set(
      root,
      "[data-hl24-price-position]",
      Number.isFinite(
        stats.pricePositionPct
      )
        ? (
            `${stats.pricePositionPct.toFixed(1)}% from low`
          )
        : "—"
    );

    const priceChange=
      q(
        root,
        "[data-hl24-price-change]"
      );

    if(priceChange){
      priceChange.textContent=
        Number.isFinite(
          stats.priceChange
        )
          ? (
              `${stats.priceChange>=0?"+":""}`+
              `${usd(Math.abs(stats.priceChange))} · `+
              `${pct(stats.priceChangePct)}`
            )
          : "—";

      tone(
        priceChange,
        stats.priceChange
      );
    }

    set(
      root,
      "[data-hl24-price-range-state]",
      Number.isFinite(
        stats.priceHigh24
      ) &&
      Number.isFinite(
        stats.priceLow24
      )
        ? (
            `${usd(stats.priceLow24)} → `+
            `${usd(stats.priceHigh24)}`
          )
        : "24h range unavailable"
    );

    set(
      root,
      "[data-hl24-volume-current]",
      btc(
        stats.volumeCurrent
      )
    );

    set(
      root,
      "[data-hl24-volume-high]",
      btc(
        stats.volumeHigh
      )
    );

    set(
      root,
      "[data-hl24-volume-low]",
      btc(
        stats.volumeLow
      )
    );

    set(
      root,
      "[data-hl24-volume-range]",
      Number.isFinite(
        stats.volumeRange
      )
        ? (
            `${btc(stats.volumeRange)} · `+
            `${stats.volumeRangePct.toFixed(2)}%`
          )
        : "—"
    );

    const volumeChange=
      q(
        root,
        "[data-hl24-volume-change]"
      );

    if(volumeChange){
      volumeChange.textContent=
        Number.isFinite(
          stats.volumeChange
        )
          ? (
              `${signedBtc(stats.volumeChange)} · `+
              `${pct(stats.volumeChangePct)}`
            )
          : "—";

      tone(
        volumeChange,
        stats.volumeChange
      );
    }

    set(
      root,
      "[data-hl24-volume-average]",
      Number.isFinite(
        stats.volumeAverage
      )
        ? (
            `${btc(stats.volumeAverage)} / `+
            `${btc(stats.volumeMedian)}`
          )
        : "—"
    );

    set(
      root,
      "[data-hl24-volume-range-state]",
      Number.isFinite(
        stats.volumeHigh
      ) &&
      Number.isFinite(
        stats.volumeLow
      )
        ? (
            `${btc(stats.volumeLow)} → `+
            `${btc(stats.volumeHigh)}`
          )
        : "24h observed range unavailable"
    );

    set(
      root,
      "[data-hl24-points]",
      `${stats.points.toLocaleString()} points`
    );

    set(
      root,
      "[data-hl24-coverage]",
      `${stats.coveragePct.toFixed(1)}% of 24h covered`
    );

    set(
      root,
      "[data-hl24-cadence]",
      `median cadence ${duration(stats.medianIntervalMs)} · `+
      `max gap ${duration(stats.largestGapMs)}`
    );

    set(
      root,
      "[data-hl24-age]",
      `last point ${duration(stats.ageMs)} ago`
    );
  }

  function rangeCoverage(points){
    const rows=
      Array.isArray(points)
        ? points
        : [];

    if(!rows.length){
      return {
        count:0,
        total:0,
        pct:0
      };
    }

    const count=
      rows.filter(
        row=>
          Number.isFinite(
            finite(
              row.high_24h
            )
          ) &&
          Number.isFinite(
            finite(
              row.low_24h
            )
          )
      ).length;

    return {
      count,
      total:rows.length,
      pct:
        count/
        rows.length*
        100
    };
  }

  function renderLegend(
    root,
    control
  ){
    const candle=
      q(
        root,
        "[data-hl24-volume-candle-legend]"
      );

    const line=
      q(
        root,
        "[data-hl24-volume-line-legend]"
      );

    if(candle){
      candle.hidden=
        control.volumeMode===
        "line";
    }

    if(line){
      line.hidden=
        control.volumeMode===
        "candles";
    }
  }

  function tooltipRows(point){
    const time=
      Number.isFinite(
        finite(point?.t)
      )
        ? new Date(
            point.t
          ).toLocaleString()
        : "time —";

    const price=
      finite(
        point?.price
      );

    const high24=
      finite(
        point?.high_24h
      );

    const low24=
      finite(
        point?.low_24h
      );

    const volumeOpen=
      finite(
        point?.volume_open_24h_btc
      );

    const volumeHigh=
      finite(
        point?.volume_high_24h_btc
      );

    const volumeLow=
      finite(
        point?.volume_low_24h_btc
      );

    const volumeClose=
      finite(
        point?.volume_close_24h_btc
      );

    return [
      time,
      `price ${usd(price)}`,
      `price 24h H ${usd(high24)} · L ${usd(low24)}`,
      `rolling volume O ${btc(volumeOpen)} · H ${btc(volumeHigh)}`,
      `rolling volume L ${btc(volumeLow)} · C ${btc(volumeClose)}`
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
        "[data-hl24-empty]"
      );

    if(!empty)return;

    empty.hidden=
      !show;

    if(detail){
      set(
        root,
        "[data-hl24-empty-detail]",
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
      const control=
        controls(root);

      const latest=
        await json(
          "/bitcoin/bpi/api/latest.json",
          {optional:true}
        );

      const selection=
        currentSelection();

      const descriptor=
        W.ZZXHighLow24HModel
          .sourceDescriptor(
            selection,
            latest||{}
          );

      const sourceChanged=
        descriptor.id!==
        state.sourceId;

      state.sourceId=
        descriptor.id;

      set(
        root,
        "[data-hl24-source]",
        descriptor.label
      );

      set(
        root,
        "[data-hl24-eyebrow]",
        `${descriptor.label} · price H/L + rolling-volume H/L`
      );

      const data=
        await historyFor(
          descriptor,
          control
        );

      const points=
        W.ZZXHighLow24HModel
          .normalize(
            W.ZZXHighLow24HModel
              .mergeLive(
                data.points||[],
                selection
              )
          );

      const stats=
        W.ZZXHighLow24HModel
          .stats(points);

      const recipe=
        W.ZZXHighLow24HModel
          .recipe({
            priceMode:
              control.priceMode,
            volumeMode:
              control.volumeMode
          });

      state.points=points;
      state.stats=stats;
      state.recipe=recipe;

      renderStats(
        root,
        stats
      );

      renderLegend(
        root,
        control
      );

      const coverage=
        rangeCoverage(points);

      set(
        root,
        "[data-hl24-range-coverage]",
        `price H/L ${coverage.count}/${coverage.total} · `+
        `${coverage.pct.toFixed(1)}%`
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
            control.follow
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
              `Live ${descriptor.label} data is available, but the 24h history has not accumulated a second point yet.`
            )
          : (
              `No ${descriptor.label} high/low history is available yet.`
            )
      );

      const compatibility=
        data.compatibilitySource
          ? (
              ` · compatibility `+
              data.compatibilitySource
            )
          : "";

      set(
        root,
        "[data-mini-status]",
        enough
          ? (
              `live · ${points.length.toLocaleString()} points · `+
              `${data.resolution||control.resolution}`
            )
          : (
              `waiting for ${descriptor.label} history`
            )
      );

      set(
        root,
        "[data-hl24-transport]",
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
          `${descriptor.label} 24 hour dual axis chart. `+
          `Price ${usd(stats.priceCurrent)}, `+
          `price high ${usd(stats.priceHigh24)}, `+
          `price low ${usd(stats.priceLow24)}, `+
          `volume ${btc(stats.volumeCurrent)}, `+
          `volume high ${btc(stats.volumeHigh)}, `+
          `volume low ${btc(stats.volumeLow)}.`
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
        "[data-hl24-transport]",
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
      root.__zzx_high_low_24h;

    if(!previous)return;

    if(previous.timer){
      W.clearTimeout(
        previous.timer
      );
    }

    if(previous.debounceTimer){
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
          "high-low-24h canvas unavailable"
        );
      }

      applyStored(root);

      const state={
        chart:
          new W.ZZXHighLow24HChart.Chart(
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
        points:[],
        stats:null,
        recipe:null,
        abortController
      };

      root.__zzx_high_low_24h=
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
              {
                resetView
              }
            ),
            delay
          );
      };

      q(
        root,
        "[data-mini-reset]"
      )?.addEventListener(
        "click",
        ()=>state.chart
          .resetZoom(),
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
            await state.chart
              .exportPNG(
                `zzx-${state.sourceId||"bpi"}-high-low-24h.png`
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
          "[data-hl24-resolution]",
          "[data-hl24-price-mode]",
          "[data-hl24-volume-mode]",
          "[data-hl24-follow]"
        ]
      ){
        q(
          root,
          selector
        )?.addEventListener(
          "change",
          ()=>{
            saveControls(root);

            scheduleRefresh(
              0,
              selector!==
                "[data-hl24-follow]"
            );
          },
          options
        );
      }

      for(
        const eventName
        of [
          "zzx:bpi-selection",
          "zzx:bpi-country",
          "zzx:bpi-weighting"
        ]
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
    W.ZZXWidgetsCore
      .onMount(
        ID,
        boot
      );
  }else if(
    W.ZZXWidgets?.register
  ){
    W.ZZXWidgets
      .register(
        ID,
        boot
      );
  }
})();
