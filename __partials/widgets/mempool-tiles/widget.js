// __partials/widgets/mempool-tiles/widget.js
// v1.1.0 — fixed loader, persistent live snapshot, dense next-block square visualizer
(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.__ZZX_MEMPOOL_TILES_WIDGET_V11__)return;
  W.__ZZX_MEMPOOL_TILES_WIDGET_V11__=true;

  const MODULES=[
    ["ZZXMempoolTilesSources","js/sources.js",2],
    ["ZZXMempoolTilesFetch","js/fetch.js",1],
    ["ZZXMempoolTilesProvider","js/provider.js",1],
    ["ZZXMempoolTilesLive","js/live.js",2],
    ["ZZXMempoolTilesAnalyzer","js/analyzer.js",1],
    ["ZZXMempoolTilesModel","js/model.js",2],
    ["ZZXMempoolTilesScaler","js/scaler.js",1],
    ["ZZXMempoolTilesSorter","js/sorter.js",1],
    ["ZZXMempoolTilesPacker","js/packer.js",2],
    ["ZZXMempoolTilesLayout","js/layout.js",1],
    ["ZZXMempoolTilesThemes","js/themes.js",1],
    ["ZZXMempoolTilesRenderer","js/renderer.js",1],
    ["ZZXMempoolTilesAnimation","js/animation.js",1],
    ["ZZXMempoolTilesTxFetcher","js/txfetcher.js",1],
    ["ZZXMempoolTilesInspector","js/inspector.js",1]
  ];

  function getPath(path){
    return path.split(".").reduce((obj,key)=>obj?.[key],W);
  }

  const ID="mempool-tiles";

  function core(){
    return W.ZZXWidgetCore || W.ZZXWidgets || W.ZZX || {};
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

  async function mount(root){
    if(root.__mempoolTilesMounted)return;
    root.__mempoolTilesMounted=true;

    const canvas=root.querySelector("[data-mt-canvas]");
    const stage=root.querySelector("[data-mt-stage]");
    const summary=root.querySelector("[data-mt-summary]");
    const sub=root.querySelector("[data-mt-sub]");
    const liveState=root.querySelector("[data-mt-live-state]");
    const blockLabel=root.querySelector("[data-mt-block-label]");

    let model=null;
    let layout=null;
    let priorLayout=null;
    let selectedTxid="";
    let hoverTxid="";
    let scaleMode=localStorage.getItem("zzx.mempoolTiles.scale")||"vsize";
    let colorMode=localStorage.getItem("zzx.mempoolTiles.color")||"fee";
    let sortMode=localStorage.getItem("zzx.mempoolTiles.sort")||"priority";
    let shuffleSeed=Number(localStorage.getItem("zzx.mempoolTiles.shuffleSeed"))||Date.now();
    let aborter=null;
    let live=null;
    let liveSnapshot=null;
    let fallbackCursor=0;
    let animationCancel=null;
    let hydrateTimer=0;
    let hydrateCount=0;
    let destroyed=false;

    await W.ZZXMempoolTilesThemes.load(BASE+"themes/zzx-default.json");

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
          ? "LIVE next-block membership"
          : model.candidateSource==="full-feed"
            ? "full-feed projection"
            : "building projection";

      summary.textContent=
        `${fmtInt(txs)} ${sourceLabel} transactions`;

      sub.textContent=
        `${scaleMode==="vsize"?"tile size = vB":scaleMode==="value"?"tile size = BTC value":"tile size = fee rate"} · ${colorMode==="fee"?"color = sat/vB":"color = transaction type"} · ${sortMode}`;

      const stats={
        txs:`${fmtInt(txs)} TX`,
        vsize:`${(model.candidateVsize/1e6).toFixed(3)} vMB`,
        value:fmtBtc(model.candidateValue),
        fee:fmtRate(med),
        fill:`${(layout.fillRatio*100).toFixed(1)}% packed`
      };

      for(const [key,value] of Object.entries(stats)){
        const node=root.querySelector(`[data-mt-stat="${key}"]`);
        if(node)node.textContent=value;
      }

      blockLabel.textContent=
        Number.isFinite(model.tipHeight)
          ? `NEXT BLOCK · ${fmtInt(model.tipHeight+1)}`
          : "NEXT BLOCK";
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

    async function inspect(txid){
      selectedTxid=txid;
      redraw();

      W.ZZXMempoolTilesInspector.loading(root,txid);

      try{
        const analysis=await W.ZZXMempoolTilesTxFetcher.full(
          core(),
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
        W.ZZXMempoolTilesSources.get(core());

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
          core(),
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

    async function refresh(force=false){
      aborter?.abort();
      aborter=new AbortController();

      try{
        const payload=await W.ZZXMempoolTilesProvider.load(
          core(),
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

        if(!live){
          live=
            new W.ZZXMempoolTilesLive.LiveNextBlock({
              urls:payload.cfg.websocketUrls,
              reconnectMaxMs:payload.cfg.liveReconnectMaxMs,

              onState:state=>{
                liveState.textContent=state.state;
                liveState.title=state.url||state.detail||"";
              },

              onUpdate:snapshot=>{
                if(destroyed)return;

                liveSnapshot=snapshot;

                model=
                  W.ZZXMempoolTilesModel.mergeLive(
                    model,
                    snapshot
                  );

                layoutNow(true);

                W.clearTimeout(hydrateTimer);
                hydrateTimer=W.setTimeout(
                  hydrate,
                  payload.cfg.liveDebounceMs
                );
              }
            });

          if(!live.start()){
            liveState.textContent="REST";
          }
        }

        W.clearTimeout(hydrateTimer);
        hydrateTimer=W.setTimeout(hydrate,180);
      }catch(error){
        if(error?.name==="AbortError")return;
        liveState.textContent="offline";
        summary.textContent="Mempool Tiles unavailable";
        sub.textContent=String(error?.message||error);
      }
    }

    root.querySelectorAll("[data-mt-scale]").forEach(button=>{
      button.addEventListener("click",()=>{
        scaleMode=button.dataset.mtScale;
        localStorage.setItem("zzx.mempoolTiles.scale",scaleMode);
        setActive();
        layoutNow(true);
      });
    });

    root.querySelectorAll("[data-mt-color]").forEach(button=>{
      button.addEventListener("click",()=>{
        colorMode=button.dataset.mtColor;
        localStorage.setItem("zzx.mempoolTiles.color",colorMode);
        setActive();
        redraw();
        renderStats();
      });
    });

    root.querySelector("[data-mt-sort]")?.addEventListener("change",event=>{
      sortMode=event.target.value;

      if(sortMode==="shuffle"){
        shuffleSeed=Date.now();
        localStorage.setItem("zzx.mempoolTiles.shuffleSeed",String(shuffleSeed));
      }

      localStorage.setItem("zzx.mempoolTiles.sort",sortMode);
      layoutNow(true);
    });

    canvas.addEventListener("pointermove",event=>{
      const tile=pointerTile(event);
      const next=tile?.txid||"";

      if(next!==hoverTxid){
        hoverTxid=next;
        canvas.style.cursor=next?"pointer":"default";
        redraw();
      }
    });

    canvas.addEventListener("pointerleave",()=>{
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

    root.querySelector("[data-mt-inspector-close]")?.addEventListener("click",()=>{
      selectedTxid="";
      W.ZZXMempoolTilesInspector.clear(root);
      redraw();
    });

    const resize=new ResizeObserver(()=>redraw());
    resize.observe(stage);

    setActive();
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
      resize.disconnect();
    };
  }

  async function boot(){
    try{
      await dependencies();

      const roots=[
        ...D.querySelectorAll('[data-widget-root="mempool-tiles"]')
      ];

      for(const root of roots){
        await mount(root);
      }
    }catch(error){
      console.error("[mempool-tiles]",error);

      D.querySelectorAll('[data-widget-root="mempool-tiles"] [data-mt-summary]')
        .forEach(node=>{
          node.textContent="Mempool Tiles failed to initialize";
        });
    }
  }

  boot();
})();
