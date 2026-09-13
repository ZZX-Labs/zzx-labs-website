// __partials/widgets/mempool-tiles/widget.js
// v1.6.0 — self-contained shell + immediate WebSocket boot + multi-source REST fallback
(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.__ZZX_MEMPOOL_TILES_WIDGET_V16__)return;
  W.__ZZX_MEMPOOL_TILES_WIDGET_V16__=true;

  const MODULES=[
    ["ZZXMempoolTilesSources","js/sources.js",3],
    ["ZZXMempoolTilesFetch","js/fetch.js",1],
    ["ZZXMempoolTilesProvider","js/provider.js",2],
    ["ZZXMempoolTilesLive","js/live.js",3],
    ["ZZXMempoolTilesAnalyzer","js/analyzer.js",1],
    ["ZZXMempoolTilesModel","js/model.js",2],
    ["ZZXMempoolTilesScaler","js/scaler.js",2],
    ["ZZXMempoolTilesSorter","js/sorter.js",1],
        ["ZZXMempoolTilesLayout","js/layout.js",3],
    ["ZZXMempoolTilesThemes","js/themes.js",1],
    ["ZZXMempoolTilesRenderer","js/renderer.js",3],
    ["ZZXMempoolTilesAnimation","js/animation.js",1],
    ["ZZXMempoolTilesTxFetcher","js/txfetcher.js",2],
    ["ZZXMempoolTilesInspector","js/inspector.js",1]
  ];

  function getPath(path){
    return path.split(".").reduce((obj,key)=>obj?.[key],W);
  }

  const ID="mempool-tiles";

  function core(){
    return W.ZZXWidgetsCore || W.ZZXWidgetCore || W.ZZXWidgets || W.ZZX || {};
  }

  function widgetBase(){
    const c=core();

    if(typeof c?.widgetBase==="function"){
      try{
        const value=String(c.widgetBase(ID)||"").replace(/\/+$/g,"");
        if(value)return value;
      }catch(_){}
    }

    return "/__partials/widgets/mempool-tiles";
  }

  function moduleUrl(relative,minimumVersion){
    const raw=
      `${widgetBase()}/${String(relative).replace(/^\/+/,"")}`;

    const resolved=
      W.ZZXAPI?.url
        ? W.ZZXAPI.url(raw)
        : raw;

    return (
      resolved +
      (resolved.includes("?")?"&":"?") +
      `zzxmod=${minimumVersion}`
    );
  }

  function loadScript(src,key,minimumVersion){
    if(getPath(key)?.__version>=minimumVersion){
      return Promise.resolve(true);
    }

    const tagKey=String(key).replace(/[^a-z0-9_-]/gi,"_");

    const selector=
      `script[data-mt-module="${tagKey}"][data-mt-version="${minimumVersion}"]`;

    const existing=D.querySelector(selector);

    if(existing){
      return new Promise(resolve=>{
        if(getPath(key)?.__version>=minimumVersion){
          resolve(true);
          return;
        }

        const done=()=>resolve(
          getPath(key)?.__version>=minimumVersion
        );

        existing.addEventListener(
          "load",
          done,
          {once:true}
        );

        existing.addEventListener(
          "error",
          done,
          {once:true}
        );

        W.setTimeout(done,6000);
      });
    }

    return new Promise(resolve=>{
      const node=D.createElement("script");
      node.src=src;
      node.defer=true;
      node.setAttribute("data-mt-module",tagKey);
      node.setAttribute("data-mt-version",String(minimumVersion));

      node.addEventListener(
        "load",
        ()=>resolve(
          getPath(key)?.__version>=minimumVersion
        ),
        {once:true}
      );

      node.addEventListener(
        "error",
        ()=>resolve(false),
        {once:true}
      );

      (D.head||D.documentElement).appendChild(node);
    });
  }

  async function dependencies(){
    for(const [path,rel,minimumVersion] of MODULES){
      if(getPath(path)?.__version>=minimumVersion){
        continue;
      }

      const ok=await loadScript(
        moduleUrl(rel,minimumVersion),
        path,
        minimumVersion
      );

      if(!ok){
        throw new Error(
          `${rel} did not register ${path} v${minimumVersion}`
        );
      }
    }
  }


  function fmtInt(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function fmtBtc(sats){
    const n=Number(sats);
    return Number.isFinite(n)?`${(n/1e8).toFixed(4)} BTC`:"— BTC";
  }

  function fmtRate(value){
    const n=Number(value);
    return Number.isFinite(n)?`${n.toFixed(n<1?3:1)} sat/vB`:"— sat/vB";
  }

  function median(values){
    const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    const i=Math.floor(rows.length/2);
    return rows.length%2?rows[i]:(rows[i-1]+rows[i])/2;
  }

  function storageGet(key,fallback=""){
    try{
      const value=W.localStorage?.getItem(key);
      return value==null?fallback:value;
    }catch(_){
      return fallback;
    }
  }

  function storageSet(key,value){
    try{
      W.localStorage?.setItem(key,String(value));
    }catch(_){}
  }

  async function mount(root,mountedCore=null){
    if(!root||root.__mempoolTilesMounted)return;
    root.__mempoolTilesMounted=true;

    const runtimeCore=mountedCore||core();
    const canvas=root.querySelector("[data-mt-canvas]");
    const stage=root.querySelector("[data-mt-stage]");
    const summary=root.querySelector("[data-mt-summary]");
    const sub=root.querySelector("[data-mt-sub]");
    const liveState=root.querySelector("[data-mt-live-state]");
    const headerStatus=root.querySelector("[data-mt-status]");
    const blockLabel=root.querySelector("[data-mt-block-label]");
    const tooltip=root.querySelector("[data-mt-tooltip]");
    const coverage=root.querySelector("[data-mt-coverage]");
    const transport=root.querySelector("[data-mt-transport]");
    const meta=root.querySelector("[data-mt-meta]");
    const gridStat=root.querySelector("[data-mt-grid]");
    const valueCoverageStat=root.querySelector("[data-mt-value-coverage]");
    const vizCount=root.querySelector("[data-mt-viz-count]");
    const tipStat=root.querySelector("[data-mt-tip]");
    const feeRangeStat=root.querySelector("[data-mt-fee-range]");
    const backlogStat=root.querySelector("[data-mt-backlog]");
    const sourceStat=root.querySelector("[data-mt-source]");
    const updatedStat=root.querySelector("[data-mt-updated]");

    let model=null;
    let layout=null;
    let priorLayout=null;
    let selectedTxid="";
    let hoverTxid="";
    let scaleMode=storageGet("zzx.mempoolTiles.scale")||"vsize";
    let colorMode=storageGet("zzx.mempoolTiles.color")||"fee";
    let sortMode=storageGet("zzx.mempoolTiles.sort")||"priority";
    let shuffleSeed=Number(storageGet("zzx.mempoolTiles.shuffleSeed"))||Date.now();
    let aborter=null;
    let live=null;
    let liveSnapshot=null;
    let fallbackCursor=0;
    let animationCancel=null;
    let hydrateTimer=0;
    let hydrateCount=0;
    let destroyed=false;
    let sharedUnsubscribe=null;
    let lastConnectionState="connecting";

    const themeRaw=`${widgetBase()}/themes/zzx-default.json`;
    const themeUrl=W.ZZXAPI?.url
      ? W.ZZXAPI.url(themeRaw)
      : themeRaw;
    await W.ZZXMempoolTilesThemes.load(themeUrl);

    function setActive(){
      root.querySelectorAll("[data-mt-scale]").forEach(button=>{
        button.classList.toggle("is-active",button.dataset.mtScale===scaleMode);
      });

      root.querySelectorAll("[data-mt-color]").forEach(button=>{
        button.classList.toggle("is-active",button.dataset.mtColor===colorMode);
      });

      const select=root.querySelector("[data-mt-sort]");
      if(select)select.value=sortMode;
    }

    function setConnectionState(state,detail=""){
      const normalized=String(state||"offline").toLowerCase();
      lastConnectionState=normalized;
      const live=normalized==="live";
      const label=live
        ? "live ws"
        : normalized==="connecting"
          ? "connecting"
          : normalized==="reconnecting"
            ? "reconnecting"
            : normalized==="rest"
              ? "REST"
              : "offline";

      if(liveState){
        liveState.textContent=label;
        liveState.title=detail||"";
      }

      if(headerStatus){
        headerStatus.textContent=label;
        headerStatus.setAttribute(
          "data-status",
          live?"ok":normalized==="offline"||normalized==="error"?"error":"warn"
        );
        headerStatus.title=detail||"";
      }
    }

    function layoutNow(animate=true){
      if(!model)return;

      const next=W.ZZXMempoolTilesLayout.build(
        model,
        {
          scaleMode,
          sortMode,
          seed:shuffleSeed
        }
      );

      priorLayout=layout;
      layout=next;

      animationCancel?.();
      animationCancel=null;

      if(
        !animate ||
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !priorLayout
      ){
        W.ZZXMempoolTilesRenderer.draw(
          canvas,
          layout,
          {
            fromLayout:null,
            progress:1,
            selectedTxid,
            hoverTxid,
            colorMode
          }
        );
      }else{
        animationCancel=W.ZZXMempoolTilesAnimation.run(
          520,
          progress=>{
            W.ZZXMempoolTilesRenderer.draw(
              canvas,
              layout,
              {
                fromLayout:priorLayout,
                progress,
                selectedTxid,
                hoverTxid,
                colorMode
              }
            );
          }
        );
      }

      renderStats();
    }

    function renderStats(){
      if(!model||!layout)return;

      const txs=model.candidate.length;
      const rates=model.candidate
        .map(tx=>Number(tx.packageFeeRate??tx.feeRate))
        .filter(Number.isFinite);

      const med=median(rates);

      const sourceLabel=
        model.candidateSource==="live"
          ? "LIVE"
          : model.candidateSource==="full-feed"
            ? "FULL FEED"
            : "BUILDING";

      summary.textContent=
        `${fmtInt(txs)} TX · next-block tile grid`;

      sub.textContent=
        `${sourceLabel} · footprint ${scaleMode==="vsize"?"vB":scaleMode==="value"?"BTC value":"sat/vB"} · color ${colorMode==="fee"?"fee rate":"type"} · order ${sortMode}`;

      const stats={
        txs:`${fmtInt(txs)} TX`,
        vsize:`${(model.candidateVsize/1e6).toFixed(3)} vMB`,
        value:fmtBtc(model.candidateValue),
        fee:fmtRate(med),
        fill:`${Math.min(125,(model.candidateVsize/Math.max(1,model.targetVbytes)*100)).toFixed(1)}% block`
      };

      for(const [key,value] of Object.entries(stats)){
        const node=root.querySelector(`[data-mt-stat="${key}"]`);
        if(node)node.textContent=value;
      }

      blockLabel.textContent=
        Number.isFinite(model.tipHeight)
          ? `NEXT BLOCK · ${fmtInt(model.tipHeight+1)}`
          : "NEXT BLOCK";

      if(gridStat){
        gridStat.textContent=`${layout.gridN} × ${layout.gridN} stable slots`;
      }

      if(valueCoverageStat){
        valueCoverageStat.textContent=`${(Math.max(0,Math.min(1,model.candidateValueCoverage||0))*100).toFixed(1)}% values resolved`;
      }

      if(vizCount){
        vizCount.textContent=`${fmtInt(txs)} real TX · ${layout.gridN}×${layout.gridN} slots`;
      }

      if(tipStat){
        tipStat.textContent=Number.isFinite(model.tipHeight)
          ? `#${fmtInt(model.tipHeight)} → candidate #${fmtInt(model.tipHeight+1)}`
          : "—";
      }

      if(feeRangeStat){
        const sorted=rates.slice().sort((a,b)=>a-b);
        feeRangeStat.textContent=sorted.length
          ? `${fmtRate(sorted[0])} – ${fmtRate(sorted[sorted.length-1])}`
          : "—";
      }

      if(backlogStat){
        const backlog=Number(model.mempool?.vsize??model.mempool?.vbytes);
        const count=Number(model.mempool?.count);
        backlogStat.textContent=Number.isFinite(backlog)
          ? `${(backlog/1e6).toFixed(2)} vMB${Number.isFinite(count)?` · ${fmtInt(count)} TX`:""}`
          : "—";
      }

      if(sourceStat){
        sourceStat.textContent=model.source||model.fullFeedSource||"configured mempool API";
      }

      if(updatedStat){
        updatedStat.textContent=Number.isFinite(Number(model.fetchedAt))
          ? `updated ${new Date(Number(model.fetchedAt)).toLocaleTimeString()}`
          : "—";
      }

      if(coverage){
        const fill=Math.min(125,model.candidateVsize/Math.max(1,model.targetVbytes)*100);
        coverage.textContent=`${fmtInt(txs)} real candidate TX · ${fill.toFixed(1)}% projected block vsize · one stable slot per TX`;
      }

      if(transport){
        transport.textContent=model.liveActive
          ? "WebSocket live"
          : model.fullFeedActive
            ? "full feed"
            : lastConnectionState==="connecting"||lastConnectionState==="reconnecting"
              ? "WebSocket connecting · REST fallback"
              : "REST building";
      }

      if(meta){
        meta.textContent=`real projected-next-block transactions · txid-stable grid · ${scaleMode} footprint · ${colorMode} color · ${sortMode} order`;
      }
    }

    function redraw(){
      if(!layout)return;
      W.ZZXMempoolTilesRenderer.draw(
        canvas,
        layout,
        {
          fromLayout:null,
          progress:1,
          selectedTxid,
          hoverTxid,
          colorMode
        }
      );
    }

    function pointerTile(event){
      if(!layout)return null;
      const rect=canvas.getBoundingClientRect();
      const nx=(event.clientX-rect.left)/rect.width;
      const ny=(event.clientY-rect.top)/rect.height;
      return W.ZZXMempoolTilesLayout.hit(layout,nx,ny);
    }

    function showTooltip(event,tile){
      if(!tooltip||!tile){
        if(tooltip)tooltip.hidden=true;
        return;
      }

      const rect=stage.getBoundingClientRect();
      const rate=Number(tile.packageFeeRate??tile.feeRate);
      const value=Number(tile.valueSats);
      const vsize=Number(tile.vsize);

      tooltip.replaceChildren();

      const strong=D.createElement("strong");
      strong.textContent=`${String(tile.txid||"").slice(0,18)}…`;

      const line=D.createElement("span");
      const parts=[];
      if(Number.isFinite(rate))parts.push(`${rate.toFixed(rate<1?3:1)} sat/vB`);
      if(Number.isFinite(vsize))parts.push(`${Math.round(vsize).toLocaleString()} vB`);
      if(Number.isFinite(value))parts.push(`${(value/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`);
      line.textContent=parts.join(" · ")||"transaction details pending";

      tooltip.append(strong,line);
      tooltip.hidden=false;
      tooltip.style.left=`${Math.max(6,Math.min(rect.width-280,event.clientX-rect.left+12))}px`;
      tooltip.style.top=`${Math.max(6,Math.min(rect.height-58,event.clientY-rect.top+12))}px`;
    }

    async function inspect(txid){
      selectedTxid=txid;
      redraw();

      W.ZZXMempoolTilesInspector.loading(root,txid);

      try{
        const analysis=await W.ZZXMempoolTilesTxFetcher.full(
          runtimeCore,
          txid,
          {
            tipHeight:model?.tipHeight,
            priceUsd:model?.priceUsd
          }
        );

        if(destroyed||selectedTxid!==txid)return;

        W.ZZXMempoolTilesInspector.render(root,analysis);

        model=W.ZZXMempoolTilesModel.mergeDetails(
          model,
          [analysis.tx]
        );

        layoutNow(true);
      }catch(error){
        if(destroyed||selectedTxid!==txid)return;

        const body=root.querySelector("[data-mt-kv-grid]");
        body.innerHTML=`
          <div class="mt-kv">
            <dt>Status</dt>
            <dd>${String(error?.message||error)}</dd>
          </div>
        `;
      }
    }

    async function hydrate(){
      if(destroyed||!model)return;

      const cfg=
        model.cfg ||
        W.ZZXMempoolTilesSources.get(runtimeCore);

      if(
        hydrateCount>=cfg.maxHydratePerSession
      ){
        return;
      }

      let ids=[];
      let concurrency=cfg.hydrateConcurrency;
      let delay=cfg.hydrateDelayMs;

      if(model.liveActive){
        ids=
          W.ZZXMempoolTilesModel.pendingCandidateTxids(
            model,
            cfg.hydrateBatch
          );
      }else if(!model.fullFeedActive){
        /*
         * v1 dead-ended here: candidate was built from /mempool/recent and then
         * only that tiny candidate was hydrated, so the txid universe could
         * never grow into a real block-sized field.
         */
        ids=
          W.ZZXMempoolTilesModel.pendingUniverseTxids(
            model,
            cfg.fallbackHydrateBatch,
            fallbackCursor
          );

        concurrency=cfg.fallbackHydrateConcurrency;
        delay=cfg.fallbackHydrateDelayMs;

        fallbackCursor+=cfg.fallbackHydrateBatch;

        if(
          !ids.length &&
          fallbackCursor>0
        ){
          fallbackCursor=0;

          ids=
            W.ZZXMempoolTilesModel.pendingUniverseTxids(
              model,
              cfg.fallbackHydrateBatch,
              0
            );
        }
      }else{
        ids=
          W.ZZXMempoolTilesModel.pendingCandidateTxids(
            model,
            cfg.hydrateBatch
          );
      }

      if(!ids.length)return;

      hydrateCount+=ids.length;

      const rows=
        await W.ZZXMempoolTilesTxFetcher.batch(
          runtimeCore,
          ids,
          {concurrency}
        );

      if(
        destroyed ||
        !rows.length
      ){
        return;
      }

      model=
        W.ZZXMempoolTilesModel.mergeDetails(
          model,
          rows
        );

      /*
       * If the live membership snapshot exists, re-apply it after hydration so
       * full transaction details enrich those exact members without changing
       * candidate membership.
       */
      if(liveSnapshot?.transactions?.length){
        model=
          W.ZZXMempoolTilesModel.mergeLive(
            model,
            liveSnapshot
          );
      }

      layoutNow(true);

      W.clearTimeout(hydrateTimer);

      hydrateTimer=W.setTimeout(
        hydrate,
        delay
      );
    }

    function seedFromLive(snapshot,cfg){
      const rows=Array.isArray(snapshot?.transactions)
        ? snapshot.transactions
        : [];

      const totalVsize=rows.reduce(
        (sum,row)=>sum+(Number(row?.vsize??row?.vbytes)||0),
        0
      );

      const block0=Array.isArray(snapshot?.blocks)&&snapshot.blocks.length
        ? snapshot.blocks[0]
        : {
            nTx:rows.length,
            blockVSize:Math.max(1,totalVsize||1_000_000)
          };

      const base=W.ZZXMempoolTilesModel.build({
        cfg,
        mempool:{
          count:rows.length,
          vsize:totalVsize
        },
        blocks:[block0],
        feeRecommendations:null,
        tipHeight:NaN,
        txids:rows.map(row=>row?.txid).filter(Boolean),
        recent:rows,
        fullFeed:null,
        fullFeedSource:"",
        priceUsd:NaN,
        priceSource:"",
        source:snapshot?.url||cfg.apiBase||"WebSocket",
        fetchedAt:Number(snapshot?.updatedAt)||Date.now()
      });

      return W.ZZXMempoolTilesModel.mergeLive(
        base,
        snapshot
      );
    }

    function applySharedSnapshot(snapshot){
      const group=snapshot?.groups?.[0];
      const rows=(group?.items||[])
        .filter(item=>item?.kind==="tx"&&item?.txid)
        .map((item,index)=>({
          txid:item.txid,
          id:item.txid,
          vsize:item.vbytes,
          vbytes:item.vbytes,
          fee:item.fee,
          value:item.value,
          feeRate:item.feeRate,
          packageFeeRate:item.feeRate,
          firstSeen:item.firstSeenMs,
          projectedRank:index,
          __zzxTilesLive:true
        }));

      if(!rows.length)return;
      if(model?.liveActive&&model.candidate.length>=rows.length)return;

      const cfg=W.ZZXMempoolTilesSources.get(
        runtimeCore,
        snapshot?.source||""
      );

      const base=W.ZZXMempoolTilesModel.build({
        cfg,
        mempool:snapshot?.summary||{},
        blocks:Array.isArray(snapshot?.candidateBlocks)?snapshot.candidateBlocks:[],
        feeRecommendations:null,
        tipHeight:Number(snapshot?.tipHeight),
        txids:rows.map(row=>row.txid),
        recent:rows,
        fullFeed:null,
        fullFeedSource:"",
        priceUsd:Number(snapshot?.priceUsd),
        priceSource:String(snapshot?.priceSource||"shared mempool state"),
        source:String(snapshot?.source||"ZZXMempoolVisuals"),
        fetchedAt:Number(snapshot?.fetchedAt)||Date.now()
      });

      model=W.ZZXMempoolTilesModel.mergeLive(
        base,
        {
          transactions:rows,
          blocks:Array.isArray(snapshot?.candidateBlocks)?snapshot.candidateBlocks:[],
          updatedAt:Number(snapshot?.fetchedAt)||Date.now()
        }
      );

      setConnectionState(
        snapshot?.websocketConnected?"live":"rest",
        snapshot?.source||"shared mempool visual state"
      );

      layoutNow(Boolean(layout));
    }

    async function ensureSharedFallback(){
      if(Number(W.ZZXMempoolVisuals?.__version||0)<1){
        try{
          const raw="/__partials/widgets/_shared/zzx-mempool-visuals.js";
          const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
          await new Promise((resolve,reject)=>{
            const script=D.createElement("script");
            script.src=`${src}${src.includes("?")?"&":"?"}zzxmod=1`;
            script.defer=true;
            script.onload=resolve;
            script.onerror=reject;
            (D.head||D.documentElement).appendChild(script);
          });
        }catch(_){}
      }

      if(Number(W.ZZXMempoolVisuals?.__version||0)>=1){
        sharedUnsubscribe=W.ZZXMempoolVisuals.subscribe(
          runtimeCore,
          snapshot=>{
            if(!destroyed)applySharedSnapshot(snapshot);
          }
        );
      }
    }

    function startLive(cfg){
      if(live)return;

      live=new W.ZZXMempoolTilesLive.LiveNextBlock({
        urls:cfg.websocketUrls,
        reconnectMaxMs:cfg.liveReconnectMaxMs,

        onState:state=>{
          setConnectionState(
            state.state,
            state.url||state.detail||""
          );
        },

        onUpdate:snapshot=>{
          if(destroyed)return;

          liveSnapshot=snapshot;

          model=model
            ? W.ZZXMempoolTilesModel.mergeLive(model,snapshot)
            : seedFromLive(snapshot,cfg);

          layoutNow(Boolean(layout));

          W.clearTimeout(hydrateTimer);
          hydrateTimer=W.setTimeout(
            hydrate,
            cfg.liveDebounceMs
          );
        }
      });

      if(!live.start()){
        setConnectionState(
          "rest",
          "WebSocket unavailable; using REST"
        );
      }
    }

    async function refresh(force=false){
      aborter?.abort();
      aborter=new AbortController();

      try{
        const payload=await W.ZZXMempoolTilesProvider.load(
          runtimeCore,
          {
            signal:aborter.signal,
            force
          }
        );

        if(destroyed)return;

        const fresh=
          W.ZZXMempoolTilesModel.build(payload);

        /*
         * v1 rebuilt from REST every ten seconds and accidentally discarded the
         * live transaction objects while keeping only their ids. The field would
         * collapse to a few recent transactions until the next websocket delta.
         */
        model=
          liveSnapshot?.transactions?.length
            ? W.ZZXMempoolTilesModel.mergeLive(
                fresh,
                liveSnapshot
              )
            : fresh;

        layoutNow(Boolean(layout));

        startLive(payload.cfg);

        W.clearTimeout(hydrateTimer);
        hydrateTimer=W.setTimeout(hydrate,180);
      }catch(error){
        if(error?.name==="AbortError")return;

        const message=String(error?.message||error);

        if(model?.candidate?.length){
          if(lastConnectionState!=="live"){
            setConnectionState("reconnecting",message);
          }
          sub.textContent=`live/shared transaction field retained · REST refresh failed: ${message}`;
          renderStats();
        }else{
          setConnectionState("reconnecting",message);
          summary.textContent="Connecting to projected next-block feed…";
          sub.textContent="REST unavailable; WebSocket/shared fallback still active";
        }
      }
    }

    root.querySelectorAll("[data-mt-scale]").forEach(button=>{
      button.addEventListener("click",()=>{
        scaleMode=button.dataset.mtScale;
        storageSet("zzx.mempoolTiles.scale",scaleMode);
        setActive();
        layoutNow(true);
      });
    });

    root.querySelectorAll("[data-mt-color]").forEach(button=>{
      button.addEventListener("click",()=>{
        colorMode=button.dataset.mtColor;
        storageSet("zzx.mempoolTiles.color",colorMode);
        setActive();
        redraw();
        renderStats();
      });
    });

    root.querySelector("[data-mt-sort]")?.addEventListener("change",event=>{
      sortMode=event.target.value;

      if(sortMode==="shuffle"){
        shuffleSeed=Date.now();
        storageSet("zzx.mempoolTiles.shuffleSeed",shuffleSeed);
      }

      storageSet("zzx.mempoolTiles.sort",sortMode);
      layoutNow(true);
    });

    canvas.addEventListener("pointermove",event=>{
      const tile=pointerTile(event);
      const next=tile?.txid||"";

      showTooltip(event,tile);

      if(next!==hoverTxid){
        hoverTxid=next;
        canvas.style.cursor=next?"pointer":"default";
        redraw();
      }
    });

    canvas.addEventListener("pointerleave",()=>{
      if(tooltip)tooltip.hidden=true;
      if(!hoverTxid)return;
      hoverTxid="";
      canvas.style.cursor="default";
      redraw();
    });

    canvas.addEventListener("click",event=>{
      const tile=pointerTile(event);
      if(tile?.txid)inspect(tile.txid);
    });

    stage.addEventListener("keydown",event=>{
      if(!layout?.tiles?.length)return;

      if(event.key==="Enter"&&hoverTxid){
        event.preventDefault();
        inspect(hoverTxid);
        return;
      }

      if(!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp"].includes(event.key)){
        return;
      }

      event.preventDefault();

      let index=layout.tiles.findIndex(tile=>tile.txid===hoverTxid);
      if(index<0)index=0;

      if(event.key==="ArrowRight"||event.key==="ArrowDown"){
        index=(index+1)%layout.tiles.length;
      }else{
        index=(index-1+layout.tiles.length)%layout.tiles.length;
      }

      hoverTxid=layout.tiles[index].txid;
      redraw();
    });

    root.querySelector("[data-mt-refresh]")?.addEventListener("click",async()=>{
      live?.stop();
      live=null;
      liveSnapshot=null;
      fallbackCursor=0;
      hydrateCount=0;
      setConnectionState("connecting","manual reconnect");
      startLive(W.ZZXMempoolTilesSources.get(runtimeCore));
      await refresh(true);
    });

    root.querySelector("[data-mt-inspector-close]")?.addEventListener("click",()=>{
      selectedTxid="";
      W.ZZXMempoolTilesInspector.clear(root);
      redraw();
    });

    const resize=new ResizeObserver(()=>redraw());
    resize.observe(stage);

    setActive();
    setConnectionState("connecting","initializing next-block feed");

    const initialCfg=W.ZZXMempoolTilesSources.get(runtimeCore);
    startLive(initialCfg);
    ensureSharedFallback().catch(()=>{});

    await refresh(true);

    const interval=W.setInterval(
      ()=>refresh(false),
      10000
    );

    root.__mempoolTilesDestroy=()=>{
      destroyed=true;
      W.clearInterval(interval);
      W.clearTimeout(hydrateTimer);
      animationCancel?.();
      aborter?.abort();
      live?.stop();
      sharedUnsubscribe?.();
      resize.disconnect();
    };
  }

  async function bootRoot(root,mountedCore){
    try{
      await dependencies();
      await mount(root,mountedCore);
    }catch(error){
      console.error("[mempool-tiles]",error);

      if(root){
        const summary=root.querySelector("[data-mt-summary]");
        const status=root.querySelector("[data-mt-status]");
        const live=root.querySelector("[data-mt-live-state]");

        if(summary){
          summary.textContent="Mempool Tiles failed to initialize";
        }

        if(status){
          status.textContent="error";
          status.setAttribute("data-status","error");
          status.title=String(error?.message||error);
        }

        if(live){
          live.textContent="error";
          live.title=String(error?.message||error);
        }
      }
    }
  }

  function fallbackBoot(){
    const run=()=>{
      D.querySelectorAll('[data-widget-root="mempool-tiles"]')
        .forEach(root=>bootRoot(root,core()));
    };

    if(D.readyState==="loading"){
      D.addEventListener("DOMContentLoaded",run,{once:true});
    }else{
      run();
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(ID,bootRoot);
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID,bootRoot);
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID,bootRoot);
  }else{
    fallbackBoot();
  }
})();
