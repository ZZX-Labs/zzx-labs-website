// __partials/widgets/mempool-specs/widget.js
// v10.69 — full priority-field controller
//
// Mempool Specs is intentionally its own ZZX visualization, not a clone of
// Mempool Goggles. The field represents the entire known mempool transaction
// universe from rank #1 through the final transaction. Higher projected
// inclusion priority lives physically higher in the field. Refreshes and
// progressive detail hydration preserve txid identity so the field reshuffles
// smoothly rather than blinking into a new unrelated layout.
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-specs";
  const SELECTED_KEY="zzx.widget.mempool-specs.selected.v4";

  /*
   * Keep the complete Mempool Specs module surface.
   *
   * All implementation modules live under mempool-specs/js/. This includes the
   * original adapter/grid/scaler/tiler/binfill/sorter/tetrifill/plotter modules
   * as well as sources/fetch/provider/model/renderer/animation/TxFetcher/TxCard.
   * The controller loads the complete graph from that canonical directory.
   */
  const DEPS=[
    ["ZZXMempoolSpecsSources","js/sources.js",4],
    ["ZZXMempoolSpecsFetch","js/fetch.js",4],
    ["ZZXMempoolSpecsProvider","js/provider.js",4],
    ["ZZXMempoolSpecsModel","js/model.js",4],

    ["ZZXMempoolSpecs.Adapter","js/adapter.js",5],
    ["ZZXMempoolSpecs.Theme","js/themes.js",4],
    ["ZZXMempoolSpecs.Grid","js/grid.js",5],
    ["ZZXMempoolSpecs.Scaler","js/scaler.js",5],
    ["ZZXMempoolSpecs.Tiler","js/tiler.js",5],
    ["ZZXMempoolSpecs.TetriFill","js/tetrifill.js",5],
    ["ZZXMempoolSpecs.BinFill","js/binfill.js",5],
    ["ZZXMempoolSpecs.Sorter","js/sorter.js",5],
    ["ZZXMempoolSpecs.Plotter","js/plotter.js",5],

    ["ZZXMempoolSpecsPriorityLayout","js/priority-layout.js",2],
    ["ZZXMempoolSpecs.Renderer","js/renderer.js",4],
    ["ZZXMempoolSpecs.Anim","js/animation.js",4],
    ["ZZXMempoolSpecs.TxFetcher","js/txfetcher.js",4],
    ["ZZXMempoolSpecs.TxCard","js/tx-card.js",4]
  ];

  const q=(root,selector)=>root?root.querySelector(selector):null;

  function globalPath(path){
    return String(path||"")
      .split(".")
      .filter(Boolean)
      .reduce((cur,key)=>cur?.[key],W);
  }

  function version(path){
    const value=globalPath(path);
    if(typeof value==="function"){
      return Number(value.__version||0);
    }
    return Number(value?.__version||0);
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

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function int(v){
    const n=finite(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function num(v,digits=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{maximumFractionDigits:digits})
      : "—";
  }

  function money(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:0
        })
      : "—";
  }

  function rate(v,digits=3){
    const n=finite(v);
    return Number.isFinite(n)?`${n.toFixed(digits)} sat/vB`:"—";
  }

  function pct(v,digits=1){
    const n=finite(v);
    return Number.isFinite(n)?`${(n*100).toFixed(digits)}%`:"—";
  }

  function shortHash(value,a=8,b=8){
    const s=String(value||"");
    return s.length>a+b+1?`${s.slice(0,a)}…${s.slice(-b)}`:s;
  }

  function safeGet(key){
    try{return W.localStorage?.getItem(key)||null}
    catch(_){return null}
  }

  function safeSet(key,value){
    try{W.localStorage?.setItem(key,String(value))}
    catch(_){}
  }

  function widgetBase(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool-specs";
  }

  function moduleUrl(core,relative,versionNumber){
    const raw=`${widgetBase(core)}/${String(relative).replace(/^\/+/,"")}`;
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    return `${resolved}${resolved.includes("?")?"&":"?"}zzxmod=${versionNumber}`;
  }

  async function loadScript(src,key,minimumVersion){
    if(version(key)>=minimumVersion)return true;

    const selector=`script[data-ms-module="${CSS.escape(key)}"][data-ms-version="${minimumVersion}"]`;
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
      script.dataset.msModule=key;
      script.dataset.msVersion=String(minimumVersion);

      script.addEventListener(
        "load",
        ()=>resolve(version(key)>=minimumVersion),
        {once:true}
      );

      script.addEventListener(
        "error",
        ()=>resolve(false),
        {once:true}
      );

      (D.head||D.documentElement).appendChild(script);
    });
  }

  async function ensureModules(core){
    status(core?.root||null,"modules","warn");

    for(const [key,relative,minimumVersion] of DEPS){
      if(version(key)>=minimumVersion)continue;

      const ok=await loadScript(
        moduleUrl(core,relative,minimumVersion),
        key,
        minimumVersion
      );

      if(!ok){
        throw new Error(
          `${relative} loaded without registering ${key} v${minimumVersion}`
        );
      }
    }

    try{
      await W.ZZXMempoolSpecs.Theme?.warm?.();
    }catch(_){}
  }

  function adapterSnapshot(payload){
    const Adapter=W.ZZXMempoolSpecs?.Adapter;
    if(!Adapter?.parse)return null;

    try{
      return Adapter.parse({
        tipHeight:payload?.tipHeight,
        mempool:payload?.mempool,
        blocks:payload?.blocks,
        txids:payload?.txids,
        recent:payload?.recent,
        source:payload?.source
      });
    }catch(_){
      return null;
    }
  }

  function makeScaler(){
    const Scaler=W.ZZXMempoolSpecs?.Scaler;
    if(typeof Scaler!=="function")return null;

    return new Scaler({
      areaCellsPerVByte:1/850,
      minSideCells:1,
      maxSideCells:6,
      minAreaCells:1,
      maxAreaCells:36,
      curveGamma:.92,
      valueK:.03,
      feeRateK:.015
    });
  }

  function buildLayout(state,model){
    return W.ZZXMempoolSpecsPriorityLayout.build(model,{
      maxGrid:1800,
      fill:.89,
      scaler:state.scaler
    });
  }

  function layoutCoverage(model){
    const count=Math.max(0,Number(model?.count)||0);
    const priority=Math.max(0,Number(model?.priorityCount)||0);
    const detail=Math.max(0,Number(model?.detailedCount)||0);

    return {
      count,
      priority,
      detail,
      pendingPriority:Math.max(0,count-priority),
      pendingDetail:Math.max(0,count-detail)
    };
  }

  function renderMetrics(root,state){
    const model=state.model;
    const layout=state.layout;

    if(!model)return;

    const coverage=layoutCoverage(model);

    setText(root,"[data-ms-count]",int(model.count));
    setText(
      root,
      "[data-ms-count-sub]",
      model.count
        ? `${int(model.count)} transaction IDs represented`
        : "transaction universe unavailable"
    );

    setText(
      root,
      "[data-ms-scored]",
      `${int(model.priorityCount)} / ${int(model.count)}`
    );

    setText(
      root,
      "[data-ms-scored-sub]",
      `${pct(model.priorityCoverage)} priority coverage · ${int(model.detailedCount)} detailed`
    );

    setText(
      root,
      "[data-ms-backlog]",
      Number.isFinite(model.backlogVMB)
        ? `${num(model.backlogVMB,2)} vMB`
        : "—"
    );

    setText(
      root,
      "[data-ms-blocks]",
      Number.isFinite(model.backlogVMB)
        ? `${num(model.backlogVMB,2)} max-vsize block equivalents`
        : "—"
    );

    setText(root,"[data-ms-fee]",rate(model.medianFee));
    setText(root,"[data-ms-fast]",`fast recommendation ${rate(model.fastFee)}`);
    setText(root,"[data-ms-tip]",int(model.tipHeight));
    setText(root,"[data-ms-price]",money(model.priceUsd));

    const source=model.fullFeedSource
      ? `${model.fullFeedSource} + ${model.source}`
      : model.source||state.adapter?.source||"configured mempool API";

    setText(root,"[data-ms-source]",source);

    const method=model.fullPriority
      ? "full detailed mempool · package-aware priority · cumulative 1.0-vMB projected-block bands"
      : "all known txids retained · scored transactions first · unresolved txids remain priority-pending until detailed";

    setText(root,"[data-ms-method]",method);

    setText(
      root,
      "[data-ms-rank-span]",
      model.count?`#1 → #${int(model.count)}`:"—"
    );

    setText(
      root,
      "[data-ms-layout]",
      layout
        ? `${int(layout.tiles.length)} transaction tiles · ${int(layout.gridN)}×${int(layout.gridN)} logical field · ${int(layout.markers.length)} block boundaries`
        : "—"
    );

    setText(
      root,
      "[data-ms-coverage]",
      `priority ${pct(model.priorityCoverage)} · detail ${pct(model.detailedCoverage)} · pending ${int(coverage.pendingPriority)}`
    );

    setText(
      root,
      "[data-ms-summary]",
      `${int(model.count)} transactions · ${num(model.backlogVMB,2)} vMB`
    );

    setText(
      root,
      "[data-ms-sub]",
      model.fullPriority
        ? "every transaction is priority-scored; higher projected inclusion likelihood is physically higher in the field"
        : `${int(model.priorityCount)} scored · ${int(coverage.pendingPriority)} priority-pending transaction IDs retained at the tail`
    );

    const adapterCount=Number(state.adapter?.count);
    const parity=Number.isFinite(adapterCount)&&Number.isFinite(Number(model.count))
      ? ` · adapter/model Δ ${int(Number(model.count)-adapterCount)}`
      : "";

    setText(
      root,
      "[data-ms-meta]",
      `${model.priceSource||"price unavailable"} · refreshed ${new Date(model.fetchedAt||Date.now()).toLocaleTimeString()}${parity} · every square is a transaction ID, never a synthetic txid`
    );
  }

  function canvasPoint(canvas,event){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,rect.width);
    const height=Math.max(1,rect.height);

    return {
      nx:(event.clientX-rect.left)/width,
      ny:(event.clientY-rect.top)/height,
      x:event.clientX-rect.left,
      y:event.clientY-rect.top
    };
  }

  function tileAtPoint(state,point){
    if(!state.layout)return null;
    return W.ZZXMempoolSpecsPriorityLayout.find(
      state.layout,
      point.nx,
      point.ny
    );
  }

  function tooltip(root,state,tile,point){
    const box=q(root,"[data-ms-hover]");
    if(!box)return;

    if(!tile){
      box.hidden=true;
      return;
    }

    const feeRate=Number.isFinite(Number(tile.packageFeeRate))
      ? `${Number(tile.packageFeeRate).toFixed(3)} sat/vB`
      : "priority pending";

    box.textContent=
      `#${tile.rank.toLocaleString()} · +${tile.projectedBlock} · ${shortHash(tile.txid)} · ${feeRate}`;

    const host=q(root,"[data-ms-block]");
    const rect=host?.getBoundingClientRect?.()||{width:320,height:320};

    const left=Math.max(
      8,
      Math.min(
        Math.max(8,rect.width-230),
        point.x+12
      )
    );

    const top=Math.max(
      8,
      Math.min(
        Math.max(8,rect.height-48),
        point.y+12
      )
    );

    box.style.left=`${left}px`;
    box.style.top=`${top}px`;
    box.hidden=false;
  }

  function draw(root,state,progress=1,fromLayout=null){
    if(!state.layout)return;

    const canvas=q(root,"[data-ms-canvas]");
    if(!canvas)return;

    W.ZZXMempoolSpecs.Renderer.draw(
      canvas,
      state.layout,
      {
        fromLayout,
        progress,
        hoverTxid:state.hoverTxid,
        selectedTxid:state.selectedTxid
      }
    );
  }

  function stopAnimation(state){
    try{state.anim?.stop?.()}catch(_){}
  }

  function animateTo(root,state,previous,duration=820){
    if(!previous){
      draw(root,state,1,null);
      return;
    }

    stopAnimation(state);

    if(!state.anim){
      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({ms:duration});
    }else{
      state.anim.ms=duration;
    }

    state.anim.play(progress=>{
      if(!root.isConnected)return;
      draw(root,state,progress,previous);
    });
  }

  function selectedTile(state){
    if(!state.layout)return null;

    if(state.selectedTxid){
      const found=state.layout.byTxid.get(state.selectedTxid);
      if(found)return found;
    }

    const saved=safeGet(SELECTED_KEY);
    if(saved){
      const found=state.layout.byTxid.get(saved);
      if(found)return found;
    }

    return null;
  }

  function renderSelectionHeader(root,state,tile){
    if(!tile){
      setText(root,"[data-ms-selected]","none selected");
      return;
    }

    setText(
      root,
      "[data-ms-selected]",
      `#${int(tile.rank)} · +${int(tile.projectedBlock)} · ${shortHash(tile.txid)}`
    );
  }

  function dispatchSelection(root,tile){
    try{
      root.dispatchEvent(
        new CustomEvent(
          "zzx:mempool-specs:select",
          {
            bubbles:true,
            detail:{
              txid:tile.txid,
              rank:tile.rank,
              projectedBlock:tile.projectedBlock,
              vbytes:tile.vbytes,
              feeRate:tile.feeRate,
              packageFeeRate:tile.packageFeeRate
            }
          }
        )
      );
    }catch(_){}
  }

  async function fetchSelectedTransaction(root,state,tile){
    if(!tile?.txid||!state.txFetcher)return null;

    return await state.txFetcher.tx(
      tile.txid,
      {
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd
      }
    );
  }

  function renderInline(root,state,tile,tx=null){
    const host=q(root,"[data-ms-readout]");
    if(!host||!tile)return;

    W.ZZXMempoolSpecs.TxCard.renderInline(
      host,
      {
        tx:tx||undefined,
        entry:tile,
        rank:tile.rank,
        projectedBlock:tile.projectedBlock,
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd
      }
    );
  }

  async function select(root,state,tile,{fetchDetail=true}={}){
    if(!tile)return;

    state.selectedTxid=tile.txid;
    safeSet(SELECTED_KEY,tile.txid);
    renderSelectionHeader(root,state,tile);
    renderInline(root,state,tile,null);
    draw(root,state,1,null);
    dispatchSelection(root,tile);

    if(!fetchDetail)return;

    try{
      const tx=await fetchSelectedTransaction(root,state,tile);
      if(!tx||!root.isConnected)return;

      const previous=state.layout;

      state.model=W.ZZXMempoolSpecsModel.enrich(
        state.model,
        tx
      );

      state.layout=buildLayout(
        state,
        state.model
      );

      const updated=
        state.layout.byTxid.get(tile.txid) ||
        tile;

      renderMetrics(root,state);
      renderSelectionHeader(root,state,updated);
      renderInline(root,state,updated,tx);
      animateTo(root,state,previous,720);
    }catch(error){
      const host=q(root,"[data-ms-readout]");

      if(host){
        const note=D.createElement("div");
        note.className="ms-readout__empty";
        note.textContent=
          `Transaction detail fetch: ${String(error?.message||error)}`;
        host.appendChild(note);
      }
    }
  }

  function nearestByRank(state,rank){
    if(!state.layout?.tiles?.length)return null;

    const n=Math.max(
      1,
      Math.min(
        state.layout.tiles.length,
        Math.round(rank)
      )
    );

    return state.layout.tiles[n-1]||null;
  }

  function keyboardTarget(state,direction){
    const current=selectedTile(state)||state.layout?.tiles?.[0];
    if(!current)return null;

    const grid=Math.max(1,state.layout.gridN);
    const rowWidth=Math.max(1,Math.floor(grid/Math.max(1,current.side||1)));

    let delta=0;
    if(direction==="left")delta=-1;
    if(direction==="right")delta=1;
    if(direction==="up")delta=-rowWidth;
    if(direction==="down")delta=rowWidth;
    if(direction==="pageup")delta=-Math.max(1,Math.floor(state.layout.tiles.length*.05));
    if(direction==="pagedown")delta=Math.max(1,Math.floor(state.layout.tiles.length*.05));
    if(direction==="home")return state.layout.tiles[0]||null;
    if(direction==="end")return state.layout.tiles.at(-1)||null;

    return nearestByRank(
      state,
      current.rank+delta
    );
  }

  function wireCanvas(root,state){
    const canvas=q(root,"[data-ms-canvas]");
    if(!canvas)return;

    canvas.addEventListener(
      "pointermove",
      event=>{
        if(!state.layout)return;

        const point=canvasPoint(canvas,event);
        const tile=tileAtPoint(state,point);
        const next=tile?.txid||"";

        if(next!==state.hoverTxid){
          state.hoverTxid=next;
          draw(root,state,1,null);
        }

        tooltip(root,state,tile,point);
      }
    );

    canvas.addEventListener(
      "pointerleave",
      ()=>{
        state.hoverTxid="";
        tooltip(root,state,null,{x:0,y:0});
        draw(root,state,1,null);
      }
    );

    canvas.addEventListener(
      "click",
      event=>{
        if(!state.layout)return;
        const point=canvasPoint(canvas,event);
        const tile=tileAtPoint(state,point);
        if(tile)select(root,state,tile);
      }
    );

    canvas.addEventListener(
      "keydown",
      event=>{
        if(!state.layout)return;

        const key=event.key.toLowerCase();
        const map={
          arrowleft:"left",
          arrowright:"right",
          arrowup:"up",
          arrowdown:"down",
          pageup:"pageup",
          pagedown:"pagedown",
          home:"home",
          end:"end"
        };

        if(key==="enter"||key===" "){
          const tile=
            (state.hoverTxid&&state.layout.byTxid.get(state.hoverTxid)) ||
            selectedTile(state) ||
            state.layout.tiles[0];

          if(tile){
            event.preventDefault();
            select(root,state,tile);
          }
          return;
        }

        const direction=map[key];
        if(!direction)return;

        const target=keyboardTarget(state,direction);
        if(!target)return;

        event.preventDefault();
        state.selectedTxid=target.txid;
        safeSet(SELECTED_KEY,target.txid);
        renderSelectionHeader(root,state,target);
        renderInline(root,state,target,null);
        draw(root,state,1,null);
      }
    );
  }

  async function hydrateBatch(root,state){
    if(
      state.hydrating ||
      state.busy ||
      !state.model ||
      state.model.fullPriority ||
      !root.isConnected ||
      D.hidden
    ){
      return;
    }

    const cfg=state.cfg||{};
    const size=Math.max(
      1,
      Number(cfg.progressiveHydrate)||24
    );

    const pending=state.model.transactions
      .filter(row=>!row.detailed)
      .slice(
        state.hydrateCursor,
        state.hydrateCursor+size
      );

    if(!pending.length){
      state.hydrateCursor=0;
      return;
    }

    state.hydrating=true;

    try{
      const map=await state.txFetcher.txBatch(
        pending.map(row=>row.txid),
        {
          limit:size,
          concurrency:Math.max(1,Number(cfg.txConcurrency)||4),
          tipHeight:state.model.tipHeight,
          btcUsd:state.model.priceUsd
        }
      );

      if(!map?.size){
        state.hydrateCursor+=pending.length;
        return;
      }

      const previous=state.layout;

      for(const tx of map.values()){
        state.model=W.ZZXMempoolSpecsModel.enrich(
          state.model,
          tx
        );
      }

      state.layout=buildLayout(
        state,
        state.model
      );

      state.hydrateCursor+=pending.length;

      renderMetrics(root,state);

      const selected=selectedTile(state);
      if(selected)renderSelectionHeader(root,state,selected);

      animateTo(root,state,previous,760);
    }catch(_error){
      state.hydrateCursor+=pending.length;
    }finally{
      state.hydrating=false;
    }
  }

  function scheduleHydration(root,state,delay=900){
    W.clearTimeout(state.hydrateTimer);

    state.hydrateTimer=W.setTimeout(
      async()=>{
        await hydrateBatch(root,state);

        if(
          root.isConnected &&
          state.model &&
          !state.model.fullPriority
        ){
          scheduleHydration(root,state,1600);
        }
      },
      delay
    );
  }

  function createFetcher(state,payload){
    if(state.txFetcher)return state.txFetcher;

    state.txFetcher=new W.ZZXMempoolSpecs.TxFetcher({
      base:payload.cfg.apiBase,
      fetchJSON:W.ZZXMempoolSpecsFetch.fetchJSON,
      txTtlMs:180000,
      concurrency:payload.cfg.txConcurrency
    });

    return state.txFetcher;
  }

  function restoreSelection(root,state){
    const selected=selectedTile(state);

    if(selected){
      state.selectedTxid=selected.txid;
      renderSelectionHeader(root,state,selected);
      renderInline(root,state,selected,null);
    }else{
      state.selectedTxid="";
      renderSelectionHeader(root,state,null);
    }
  }

  function setHealthStatus(root,model){
    if(model.fullPriority){
      status(root,"live","ok");
      return;
    }

    if(model.transactions.length){
      status(root,"partial","warn");
      return;
    }

    status(root,"offline","error");
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      if(force){
        try{state.abort?.abort()}catch(_){}
      }

      state.abort=new AbortController();

      const payload=await W.ZZXMempoolSpecsProvider.load(
        state.core,
        {
          signal:state.abort.signal,
          force
        }
      );

      state.adapter=adapterSnapshot(payload);

      const model=W.ZZXMempoolSpecsModel.build(
        payload
      );

      if(!model.transactions.length){
        throw new Error(
          "no transaction IDs returned by configured mempool sources"
        );
      }

      createFetcher(
        state,
        payload
      );

      const previous=state.layout;

      state.model=model;
      state.cfg=payload.cfg;
      state.layout=buildLayout(
        state,
        model
      );

      renderMetrics(root,state);
      restoreSelection(root,state);
      animateTo(root,state,previous,820);
      setHealthStatus(root,model);

      state.hasGood=true;
      state.lastRefresh=Date.now();

      scheduleHydration(
        root,
        state,
        850
      );
    }catch(error){
      if(error?.name!=="AbortError"){
        status(
          root,
          state.hasGood?"stale":"offline",
          state.hasGood?"warn":"error"
        );

        setText(
          root,
          "[data-ms-meta]",
          String(error?.message||error)
        );
      }
    }finally{
      state.busy=false;
    }
  }

  function wireResize(root,state){
    if(!("ResizeObserver" in W))return;

    state.resize=new ResizeObserver(
      ()=>{
        W.requestAnimationFrame(
          ()=>{
            if(
              state.layout &&
              root.isConnected &&
              !state.busy
            ){
              draw(root,state,1,null);
            }
          }
        );
      }
    );

    state.resize.observe(
      q(root,"[data-ms-block]")||root
    );
  }

  function wireVisibility(root,state){
    state.visibilityHandler=()=>{
      if(!root.isConnected)return;

      if(D.hidden){
        stopAnimation(state);
        W.clearTimeout(state.hydrateTimer);
        return;
      }

      draw(root,state,1,null);

      if(
        state.model &&
        !state.model.fullPriority
      ){
        scheduleHydration(
          root,
          state,
          350
        );
      }
    };

    D.addEventListener(
      "visibilitychange",
      state.visibilityHandler
    );
  }

  function cleanup(state){
    try{state.abort?.abort()}catch(_){}
    try{state.resize?.disconnect()}catch(_){}
    try{state.anim?.stop?.()}catch(_){}

    W.clearTimeout(state.timer);
    W.clearTimeout(state.hydrateTimer);

    if(state.visibilityHandler){
      D.removeEventListener(
        "visibilitychange",
        state.visibilityHandler
      );
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      layout:null,
      adapter:null,
      cfg:null,
      scaler:null,
      txFetcher:null,
      anim:null,
      busy:false,
      hydrating:false,
      hydrateCursor:0,
      hydrateTimer:null,
      hasGood:false,
      hoverTxid:"",
      selectedTxid:"",
      lastRefresh:0,
      timer:null,
      resize:null,
      abort:null,
      visibilityHandler:null
    };

    root.__zzxMempoolSpecsState=state;

    try{
      status(root,"modules","warn");

      await ensureModules({
        ...state.core,
        root
      });

      state.scaler=makeScaler();
      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({
        ms:820
      });

      wireCanvas(
        root,
        state
      );

      wireResize(
        root,
        state
      );

      wireVisibility(
        root,
        state
      );

      q(root,"[data-ms-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true)
      );

      await refresh(
        root,
        state,
        false
      );

      async function loop(){
        if(!root.isConnected){
          cleanup(state);
          return;
        }

        if(!D.hidden){
          await refresh(
            root,
            state,
            false
          );
        }

        const refreshMs=
          Number(state.cfg?.refreshMs)||
          15000;

        state.timer=W.setTimeout(
          loop,
          refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        Number(state.cfg?.refreshMs)||15000
      );
    }catch(error){
      status(root,"offline","error");

      setText(
        root,
        "[data-ms-meta]",
        String(error?.message||error)
      );
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(ID,boot);
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID,boot);
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID,boot);
  }
})();
