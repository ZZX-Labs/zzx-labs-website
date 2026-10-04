// __partials/widgets/mempool-specs/widget.js
// v10.74 — Mempool Specs / Spectacles square-only live next-block tiler
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-specs";
  const DEPS=[
    ["ZZXMempoolSpecsSources","js/sources.js",8],
    ["ZZXMempoolSpecsFetch","js/fetch.js",4],
    ["ZZXMempoolSpecsProvider","js/provider.js",6],
    ["ZZXMempoolSpecsLive","js/live.js",1],
    ["ZZXMempoolSpecsModel","js/model.js",8],
    ["ZZXMempoolSpecs.Adapter","js/adapter.js",5],
    ["ZZXMempoolSpecs.Theme","js/themes.js",4],
    ["ZZXMempoolSpecs.Grid","js/grid.js",5],
    ["ZZXMempoolSpecs.Scaler","js/scaler.js",6],
    ["ZZXMempoolSpecs.Tiler","js/tiler.js",5],
    ["ZZXMempoolSpecs.TetriFill","js/tetrifill.js",6],
    ["ZZXMempoolSpecs.BinFill","js/binfill.js",5],
    ["ZZXMempoolSpecs.Sorter","js/sorter.js",5],
    ["ZZXMempoolSpecs.Plotter","js/plotter.js",5],
    ["ZZXMempoolSpecsBlockLayout","js/block-layout.js",5],
    ["ZZXMempoolSpecs.Renderer","js/renderer.js",9],
    ["ZZXMempoolSpecs.Anim","js/animation.js",5],
    ["ZZXMempoolSpecs.TxAnalyzer","js/tx-analyzer.js",1],
    ["ZZXMempoolSpecs.TxFetcher","js/txfetcher.js",6],
    ["ZZXMempoolSpecs.TxCard","js/tx-card.js",6]
  ];

  const q=(root,selector)=>root?root.querySelector(selector):null;
  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};

  function globalPath(path){
    return String(path||"").split(".").filter(Boolean).reduce((cur,key)=>cur?.[key],W);
  }

  function version(path){
    const value=globalPath(path);
    return Number(value?.__version||value?.prototype?.__version||0);
  }

  function setText(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=String(value??"—");
  }

  function status(root,label,state){
    const el=q(root,"[data-ms-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function int(value){
    const n=finite(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function num(value,digits=2){
    const n=finite(value);
    return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):"—";
  }

  function pct(value,digits=1){
    const n=finite(value);
    return Number.isFinite(n)?`${(n*100).toFixed(digits)}%`:"—";
  }

  function rate(value,digits=2){
    const n=finite(value);
    return Number.isFinite(n)?`${n.toFixed(digits)} sat/vB`:"—";
  }

  function btcFromSats(value){
    const n=finite(value);
    return Number.isFinite(n)?`${(n/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"—";
  }

  function usd(value){
    const n=finite(value);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function ageLabel(timestamp){
    const n=finite(timestamp);
    if(!Number.isFinite(n))return "—";
    const seconds=Math.max(0,Math.floor((Date.now()-n)/1000));
    if(seconds<60)return `${seconds}s ago`;
    const minutes=Math.floor(seconds/60);
    if(minutes<60)return `${minutes}m ago`;
    return `${Math.floor(minutes/60)}h ${minutes%60}m ago`;
  }

  function setLiveState(root,state,label,detail=""){
    state.liveState=String(label||"offline");
    root.setAttribute("data-ms-live-state",state.liveState);

    const display={
      live:"LIVE · reshuffling",
      connecting:"connecting",
      reconnecting:"reconnecting",
      error:"socket fallback",
      stopped:"stopped",
      unsupported:"polling"
    }[state.liveState]||state.liveState;

    setText(root,"[data-ms-live]",display);
    const sub=
      state.liveState==="live"
        ? "mempool.space next-block transaction stream"
        : (detail||"REST/full-feed projection remains active");

    setText(root,"[data-ms-live-sub]",sub);
  }

  function widgetBase(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool-specs";
  }

  function moduleUrl(core,relative,minimumVersion){
    const raw=`${widgetBase(core)}/${String(relative).replace(/^\/+/,"")}`;
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    return `${resolved}${resolved.includes("?")?"&":"?"}zzxmod=${minimumVersion}`;
  }

  async function loadScript(src,key,minimumVersion){
    if(version(key)>=minimumVersion)return true;
    const esc=W.CSS?.escape?W.CSS.escape(key):key.replace(/[^a-z0-9_-]/gi,"_");
    const selector=`script[data-ms-module="${esc}"][data-ms-version="${minimumVersion}"]`;
    const existing=D.querySelector(selector);

    if(existing){
      await new Promise(resolve=>{
        if(version(key)>=minimumVersion)return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",resolve,{once:true});
        W.setTimeout(resolve,6000);
      });
      return version(key)>=minimumVersion;
    }

    return await new Promise(resolve=>{
      const script=D.createElement("script");
      script.src=src;
      script.defer=true;
      script.setAttribute("data-ms-module",esc);
      script.setAttribute("data-ms-version",String(minimumVersion));
      script.addEventListener("load",()=>resolve(version(key)>=minimumVersion),{once:true});
      script.addEventListener("error",()=>resolve(false),{once:true});
      (D.head||D.documentElement).appendChild(script);
    });
  }

  async function ensureModules(core){
    for(const [key,relative,minimumVersion] of DEPS){
      if(version(key)>=minimumVersion)continue;
      const ok=await loadScript(moduleUrl(core,relative,minimumVersion),key,minimumVersion);
      if(!ok)throw new Error(`${relative} loaded without registering ${key} v${minimumVersion}`);
    }

    try{await W.ZZXMempoolSpecs.Theme?.warm?.()}catch(_error){}
  }

  function candidateRange(block){
    const values=(Array.isArray(block?.candidate?.feeRange)?block.candidate.feeRange:[]).filter(Number.isFinite);
    const min=values.length?Math.min(...values):block?.minRate;
    const max=values.length?Math.max(...values):block?.maxRate;
    if(!Number.isFinite(min)||!Number.isFinite(max))return "range unavailable";
    return `${min.toFixed(2)}–${max.toFixed(2)} sat/vB`;
  }

  function renderSummary(root,state){
    const model=state.model;
    const block=state.blockView;
    const layout=state.layout;
    if(!model||!block||!layout)return;

    const candidate=block.candidate||{};
    const coverage=Math.min(1,Math.max(0,block.coverage));
    const visibleTx=layout.tiles.length;
    const txEstimate=Number.isFinite(Number(candidate.nTx))
      ? Number(candidate.nTx)
      : visibleTx;

    setText(
      root,
      "[data-ms-summary]",
      `${int(visibleTx)} TX · ${btcFromSats(block.totalValueSats)} · ${num(block.actualVbytes/1e6,3)} vMB`
    );

    setText(
      root,
      "[data-ms-sub]",
      block.live
        ? "live mempool.space projected next-block membership · tiles reshuffle as candidate inclusion changes"
        : "projected next-block membership from package fee priority · waiting for live transaction stream"
    );

    setText(root,"[data-ms-tx]",int(txEstimate));
    setText(
      root,
      "[data-ms-tx-sub]",
      `${int(visibleTx)} / ${int(block.candidateTxCount)} candidate TXs tiled · square-only`
    );

    setText(root,"[data-ms-value]",btcFromSats(block.totalValueSats));
    setText(
      root,
      "[data-ms-value-sub]",
      `${int(block.valueKnownCount)} / ${int(block.items.length)} TX values known`
    );

    setText(root,"[data-ms-vsize]",`${num(block.actualVbytes/1e6,3)} vMB`);
    setText(
      root,
      "[data-ms-util]",
      `${pct(coverage,1)} of ${num(block.targetVbytes/1e6,3)} vMB candidate`
    );

    setText(root,"[data-ms-median]",rate(block.medianRate,2));
    setText(root,"[data-ms-range]",candidateRange(block));

    setText(
      root,
      "[data-ms-plane-meta]",
      `${int(visibleTx)} real TX squares · BTC-value scale`
    );

    setText(
      root,
      "[data-ms-canvas-title]",
      Number.isFinite(block.nextHeight)
        ? `NEXT · ${int(block.nextHeight)}`
        : "NEXT BLOCK"
    );

    setText(
      root,
      "[data-ms-canvas-fill]",
      `${num(block.actualVbytes/1e6,3)} / ${num(block.targetVbytes/1e6,3)} vMB`
    );

    setText(
      root,
      "[data-ms-canvas-value]",
      btcFromSats(block.totalValueSats)
    );

    setText(
      root,
      "[data-ms-layout]",
      `${int(visibleTx)} / ${int(block.items.length)} candidate TX squares · ${pct(layout.visualCoverage,1)} logical-grid fill · ${pct(layout.valueCoverage,1)} values resolved · every TX retained`
    );

    setText(root,"[data-ms-source-mode]",block.sourceMode);
    setText(root,"[data-ms-tip]",int(model.tipHeight));
    setText(root,"[data-ms-backlog]",`${num(model.backlogVMB,2)} vMB`);
    setText(root,"[data-ms-fees]",btcFromSats(candidate.totalFees));
    setText(root,"[data-ms-price]",usd(model.priceUsd));
    setText(root,"[data-ms-value-coverage]",pct(block.valueCoverage,1));

    const source=model.fullFeedSource
      ? `${model.source} + ${model.fullFeedSource}`
      : model.source;

    setText(root,"[data-ms-source]",source||"configured mempool API");

    setText(
      root,
      "[data-ms-method]",
      block.live
        ? "live projected-next-block membership; one real TX = one square; BTC output value selects square size; sat/vB selects color; no rectangle tiles; txids animate in/out/repack as the candidate block changes"
        : "fallback next-block estimate from detailed mempool rows ranked by projected index/package fee; one real TX = one square; unresolved values remain as minimum 1x1 squares until hydration resolves them"
    );

    setText(
      root,
      "[data-ms-live-at]",
      Number.isFinite(block.liveUpdatedAt)
        ? `${new Date(block.liveUpdatedAt).toLocaleTimeString()} · ${ageLabel(block.liveUpdatedAt)}`
        : "waiting"
    );

    setText(
      root,
      "[data-ms-meta]",
      `${model.priceSource||"price unavailable"} · ${int(model.scalableCount)} scalable / ${int(model.universeCount)} known TX · refreshed ${new Date(model.fetchedAt||Date.now()).toLocaleTimeString()}`
    );
  }

  function canvasPoint(canvas,event){
    const rect=canvas.getBoundingClientRect();
    return {
      nx:(event.clientX-rect.left)/Math.max(1,rect.width),
      ny:(event.clientY-rect.top)/Math.max(1,rect.height),
      x:event.clientX-rect.left,
      y:event.clientY-rect.top
    };
  }

  function tileAt(state,point){
    return state.layout?W.ZZXMempoolSpecsBlockLayout.find(state.layout,point.nx,point.ny):null;
  }

  function tooltip(root,state,tile,point){
    const box=q(root,"[data-ms-hover]");
    if(!box)return;
    if(!tile){box.hidden=true;return}

    box.textContent=`${String(tile.txid).slice(0,10)}… · ${btcFromSats(tile.valueSats)} · ${num(tile.vbytes,0)} vB · ${rate(tile.packageFeeRate??tile.feeRate,3)} · click for full TX`;
    const host=q(root,"[data-ms-block]");
    const rect=host?.getBoundingClientRect?.()||{width:320,height:320};
    box.style.left=`${Math.max(8,Math.min(Math.max(8,rect.width-260),point.x+12))}px`;
    box.style.top=`${Math.max(8,Math.min(Math.max(8,rect.height-56),point.y+12))}px`;
    box.hidden=false;
  }

  function draw(root,state,progress=1,fromLayout=null){
    if(!state.layout||!state.blockView)return;
    W.ZZXMempoolSpecs.Renderer.draw(
      q(root,"[data-ms-canvas]"),
      state.layout,
      state.blockView,
      {
        progress,
        fromLayout,
        hoverId:state.hoverId,
        selectedId:state.selectedId
      }
    );
  }

  function animate(root,state,previous){
    try{state.anim?.stop?.()}catch(_error){}
    if(!previous){draw(root,state,1,null);return}
    state.anim.play(progress=>{if(root.isConnected)draw(root,state,progress,previous)});
  }

  function clearReadout(root){
    const host=q(root,"[data-ms-readout]");
    if(host){
      host.replaceChildren();
      const empty=D.createElement("div");
      empty.className="ms-readout__empty";
      empty.textContent="Select any real transaction tile in the projected next block.";
      host.appendChild(empty);
    }
    setText(root,"[data-ms-selected]","none selected");
  }

  async function selectTile(root,state,tile){
    if(!tile?.txid)return;
    state.selectedId=tile.id;
    setText(root,"[data-ms-selected]",`${String(tile.txid).slice(0,12)}… · ${btcFromSats(tile.valueSats)} · ${rate(tile.packageFeeRate??tile.feeRate,3)}`);
    draw(root,state,1,null);

    const host=q(root,"[data-ms-readout]");
    W.ZZXMempoolSpecs.TxCard.renderLoading(host,tile.txid);

    const token=++state.inspectToken;

    try{
      const bundle=await state.txFetcher.inspect(tile.txid,{
        signal:state.abort?.signal,
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd,
        entry:tile
      });

      if(token!==state.inspectToken||!root.isConnected)return;

      state.model=W.ZZXMempoolSpecsModel.mergeTransactions(state.model,[bundle.tx]);
      rebuildBlock(root,state,{animateChange:true,preserveSelection:true});

      const updated=state.layout.byTxid.get(tile.txid)||tile;
      state.selectedId=updated.id;

      W.ZZXMempoolSpecs.TxCard.renderInline(host,{
        bundle,
        entry:updated,
        projectedBlock:1,
        btcUsd:state.model.priceUsd
      });

      draw(root,state,1,null);
    }catch(error){
      if(token!==state.inspectToken)return;
      host.replaceChildren();
      const note=D.createElement("div");
      note.className="ms-readout__empty";
      note.textContent=`Transaction inspection failed: ${String(error?.message||error)}`;
      host.appendChild(note);
    }
  }

  function rebuildBlock(root,state,{animateChange=true,preserveSelection=false}={}){
    if(!state.model?.candidates?.length)return;

    state.blockIndex=0;
    const previous=state.layout;
    const priorSelected=preserveSelection?state.selectedId:"";

    state.blockView=W.ZZXMempoolSpecsModel.blockView(state.model,0);
    state.layout=W.ZZXMempoolSpecsBlockLayout.build(state.blockView);
    state.hoverId="";
    state.selectedId=priorSelected&&state.layout.byId.has(priorSelected)?priorSelected:"";

    renderSummary(root,state);

    if(!preserveSelection)clearReadout(root);

    if(animateChange)animate(root,state,previous);
    else draw(root,state,1,null);
  }

  function wireCanvas(root,state){
    const canvas=q(root,"[data-ms-canvas]");
    if(!canvas)return;

    canvas.addEventListener("pointermove",event=>{
      const point=canvasPoint(canvas,event);
      const tile=tileAt(state,point);
      const id=tile?.id||"";
      if(id!==state.hoverId){state.hoverId=id;draw(root,state,1,null)}
      tooltip(root,state,tile,point);
    });

    canvas.addEventListener("pointerleave",()=>{
      state.hoverId="";
      tooltip(root,state,null,{x:0,y:0});
      draw(root,state,1,null);
    });

    canvas.addEventListener("click",event=>{
      const tile=tileAt(state,canvasPoint(canvas,event));
      if(tile)selectTile(root,state,tile);
    });

    canvas.addEventListener("keydown",event=>{
      if(event.key==="Enter"||event.key===" "){
        const tile=
          state.layout?.byId.get(state.hoverId) ||
          state.layout?.byId.get(state.selectedId) ||
          state.layout?.tiles?.[0];

        if(tile){
          event.preventDefault();
          selectTile(root,state,tile);
        }
      }
    });
  }

  function makeFetcher(state,payload){
    if(state.txFetcher&&state.txFetcher.base===payload.cfg.apiBase)return state.txFetcher;
    state.txFetcher=new W.ZZXMempoolSpecs.TxFetcher({
      base:payload.cfg.apiBase,
      fetchJSON:W.ZZXMempoolSpecsFetch.fetchJSON,
      fetchText:W.ZZXMempoolSpecsFetch.fetchText,
      txTtlMs:180000,
      hexTtlMs:600000,
      blockTtlMs:600000,
      concurrency:payload.cfg.txConcurrency
    });
    return state.txFetcher;
  }

  async function hydrateBatch(root,state){
    if(
      state.hydrating ||
      state.busy ||
      !state.model ||
      state.model.completeLayout ||
      !root.isConnected ||
      D.hidden
    )return;

    const cfg=state.model.cfg||{};
    const sessionMax=Number(cfg.maxHydratePerSession)||1600;
    if(state.hydratedThisSession>=sessionMax)return;

    const batchSize=Math.min(
      Number(cfg.progressiveHydrate)||16,
      sessionMax-state.hydratedThisSession
    );

    let pending=W.ZZXMempoolSpecsModel.pendingNextBlockTxids(
      state.model,
      {limit:batchSize}
    );

    if(!pending.length){
      pending=W.ZZXMempoolSpecsModel.pendingTxids(
        state.model,
        {limit:batchSize,offset:state.hydrateCursor}
      );
    }

    if(!pending.length){
      state.hydrateCursor=0;
      return;
    }

    state.hydrating=true;

    try{
      const map=await state.txFetcher.txBatch(pending,{
        limit:batchSize,
        concurrency:Number(cfg.txConcurrency)||4,
        signal:state.abort?.signal
      });

      const rows=[...map.values()];
      state.hydratedThisSession+=rows.length;
      state.hydrateCursor+=pending.length;

      if(rows.length){
        state.model=W.ZZXMempoolSpecsModel.mergeTransactions(state.model,rows);
        rebuildBlock(root,state,{animateChange:true,preserveSelection:true});
        const view=W.ZZXMempoolSpecsModel.blockView(state.model,0);
        status(root,view.complete?"live":"partial",view.complete?"ok":"warn");
      }
    }catch(error){
      if(error?.name!=="AbortError")state.hydrateCursor+=pending.length;
    }finally{
      state.hydrating=false;
    }
  }

  function scheduleHydration(root,state,delay){
    W.clearTimeout(state.hydrateTimer);
    state.hydrateTimer=W.setTimeout(async()=>{
      await hydrateBatch(root,state);
      const view=state.model?.candidates?.length
        ? W.ZZXMempoolSpecsModel.blockView(state.model,0)
        : null;

      if(root.isConnected&&view&&view.valueCoverage<.995&&state.hydratedThisSession<(Number(state.model?.cfg?.maxHydratePerSession)||1600)){
        scheduleHydration(root,state,Number(state.model?.cfg?.hydrateDelayMs)||2200);
      }
    },Math.max(250,delay||0));
  }


  function liveState(root,state,event){
    const label=String(event?.state||"offline");
    const detail=String(event?.detail||"");
    setLiveState(root,state,label,detail);
  }

  function applyLiveSnapshot(root,state,snapshot){
    if(!snapshot||!state.model||!root.isConnected)return;
    state.liveSnapshot=snapshot;

    W.clearTimeout(state.liveDebounce);
    state.liveDebounce=W.setTimeout(()=>{
      if(!state.model||!root.isConnected)return;

      const priorSelected=state.selectedId;
      state.model=W.ZZXMempoolSpecsModel.mergeLiveBlock(
        state.model,
        snapshot.transactions,
        {
          candidates:snapshot.candidates,
          updatedAt:snapshot.updatedAt
        }
      );

      rebuildBlock(
        root,
        state,
        {
          animateChange:true,
          preserveSelection:true
        }
      );

      if(priorSelected&&!state.layout.byId.has(priorSelected)){
        state.selectedId="";
      }

      status(root,"live","ok");
      setLiveState(root,state,"live","mempool.space next-block transaction stream");
    },Number(state.model?.cfg?.liveDebounceMs)||320);
  }

  function startLive(root,state,payload){
    const url=String(payload?.cfg?.websocket||"");
    if(!url)return;

    if(state.live&&state.live.url===url)return;

    try{state.live?.stop?.()}catch(_error){}

    state.live=new W.ZZXMempoolSpecsLive.LiveNextBlock({
      url,
      reconnectMaxMs:Number(payload?.cfg?.liveReconnectMaxMs)||30000,
      onState:event=>liveState(root,state,event),
      onUpdate:snapshot=>applyLiveSnapshot(root,state,snapshot)
    });

    const started=state.live.start();
    if(!started)setLiveState(root,state,"unsupported","WebSocket unavailable; using REST/full-feed fallback");
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      if(force){try{state.abort?.abort()}catch(_error){}}
      state.abort=new AbortController();

      const payload=await W.ZZXMempoolSpecsProvider.load(state.core,{
        signal:state.abort.signal,
        force
      });

      makeFetcher(state,payload);
      let model=W.ZZXMempoolSpecsModel.build(payload);

      // Preserve already-hydrated real transaction details across the periodic
      // aggregate refresh. TxFetcher keeps the HTTP cache; carrying the rows
      // forward keeps the visual plane from regressing to empty/partial.
      if(state.model?.transactions?.length){
        const priorRaw=state.model.transactions
          .map(row=>row?.raw)
          .filter(row=>row&&typeof row==="object");
        if(priorRaw.length){
          model=W.ZZXMempoolSpecsModel.mergeTransactions(model,priorRaw);
        }
      }

      if(state.liveSnapshot?.transactions?.length){
        model=W.ZZXMempoolSpecsModel.mergeLiveBlock(
          model,
          state.liveSnapshot.transactions,
          {
            candidates:state.liveSnapshot.candidates,
            updatedAt:state.liveSnapshot.updatedAt
          }
        );
      }

      if(!model.candidates.length)throw new Error("mempool.space returned no projected block candidates");
      if(!model.knownTxids.length&&!model.transactions.length){
        throw new Error("no real mempool transaction IDs were available");
      }

      state.model=model;
      state.hydrateCursor=0;
      if(force)state.hydratedThisSession=0;
      state.blockIndex=0;
      startLive(root,state,payload);

      rebuildBlock(root,state,{animateChange:state.hasGood});
      state.hasGood=true;

      const nextView=W.ZZXMempoolSpecsModel.blockView(model,0);
      status(root,nextView.complete?"live":"partial",nextView.complete?"ok":"warn");

      if(nextView.valueCoverage<.995){
        scheduleHydration(root,state,500);
      }
    }catch(error){
      if(error?.name!=="AbortError"){
        status(root,state.hasGood?"stale":"offline",state.hasGood?"warn":"error");
        setText(root,"[data-ms-meta]",String(error?.message||error));
      }
    }finally{
      state.busy=false;
    }
  }

  function wireResize(root,state){
    if(!("ResizeObserver" in W))return;
    state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>{
      if(root.isConnected&&state.layout&&!state.busy)draw(root,state,1,null);
    }));
    const block=q(root,"[data-ms-block]");
    if(block)state.resize.observe(block);
  }

  function cleanup(state){
    try{state.abort?.abort()}catch(_error){}
    try{state.resize?.disconnect()}catch(_error){}
    try{state.anim?.stop?.()}catch(_error){}
    try{state.live?.stop?.()}catch(_error){}
    W.clearTimeout(state.timer);
    W.clearTimeout(state.hydrateTimer);
    W.clearTimeout(state.liveDebounce);
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      blockView:null,
      layout:null,
      blockIndex:0,
      selectedId:"",
      hoverId:"",
      busy:false,
      hydrating:false,
      hasGood:false,
      hydrateCursor:0,
      hydratedThisSession:0,
      hydrateTimer:null,
      timer:null,
      resize:null,
      abort:null,
      anim:null,
      txFetcher:null,
      inspectToken:0,
      live:null,
      liveState:"offline",
      liveSnapshot:null,
      liveDebounce:null
    };

    root.__zzxMempoolSpecsState=state;

    try{
      status(root,"modules","warn");
      await ensureModules(state.core);
      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({ms:720});
      wireCanvas(root,state);
      wireResize(root,state);

      q(root,"[data-ms-refresh]")?.addEventListener("click",()=>refresh(root,state,true));

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected){cleanup(state);return}
        if(!D.hidden)await refresh(root,state,false);
        state.timer=W.setTimeout(loop,Number(state.model?.cfg?.refreshMs)||10000);
      }

      state.timer=W.setTimeout(loop,Number(state.model?.cfg?.refreshMs)||10000);
    }catch(error){
      status(root,"offline","error");
      setText(root,"[data-ms-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
