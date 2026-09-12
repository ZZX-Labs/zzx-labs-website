// __partials/widgets/mempool-specs/widget.js
// v10.71 — Mempool Specs / Spectacles real-transaction block viewer
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-specs";
  const BLOCK_KEY="zzx.widget.mempool-specs.block.v6";

  const DEPS=[
    ["ZZXMempoolSpecsSources","js/sources.js",6],
    ["ZZXMempoolSpecsFetch","js/fetch.js",4],
    ["ZZXMempoolSpecsProvider","js/provider.js",6],
    ["ZZXMempoolSpecsModel","js/model.js",6],
    ["ZZXMempoolSpecs.Adapter","js/adapter.js",5],
    ["ZZXMempoolSpecs.Theme","js/themes.js",4],
    ["ZZXMempoolSpecs.Grid","js/grid.js",5],
    ["ZZXMempoolSpecs.Scaler","js/scaler.js",5],
    ["ZZXMempoolSpecs.Tiler","js/tiler.js",5],
    ["ZZXMempoolSpecs.TetriFill","js/tetrifill.js",5],
    ["ZZXMempoolSpecs.BinFill","js/binfill.js",5],
    ["ZZXMempoolSpecs.Sorter","js/sorter.js",5],
    ["ZZXMempoolSpecs.Plotter","js/plotter.js",5],
    ["ZZXMempoolSpecsBlockLayout","js/block-layout.js",2],
    ["ZZXMempoolSpecs.Renderer","js/renderer.js",6],
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

  function safeGet(){
    try{
      const n=Number(W.localStorage?.getItem(BLOCK_KEY));
      return Number.isFinite(n)?n:0;
    }catch(_error){
      return 0;
    }
  }

  function safeSet(value){
    try{W.localStorage?.setItem(BLOCK_KEY,String(value))}catch(_error){}
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

  function renderNav(root,state){
    const host=q(root,"[data-ms-block-nav]");
    if(!host||!state.model)return;
    host.replaceChildren();

    const count=Math.min(
      Number(state.model.cfg?.maxCandidateBlocks)||8,
      state.model.candidates.length
    );

    for(let i=0;i<count;i++){
      const button=D.createElement("button");
      button.type="button";
      button.className="mempool-specs__block-button";
      button.textContent=`+${i+1}`;
      button.setAttribute("aria-label",`Projected block +${i+1}`);
      button.setAttribute("aria-pressed",String(i===state.blockIndex));
      button.addEventListener("click",()=>setBlock(root,state,i,true));
      host.appendChild(button);
    }

    const prev=q(root,"[data-ms-prev]");
    const next=q(root,"[data-ms-next]");
    if(prev)prev.disabled=state.blockIndex<=0;
    if(next)next.disabled=state.blockIndex>=count-1;
  }

  function renderSummary(root,state){
    const model=state.model;
    const block=state.blockView;
    const layout=state.layout;
    if(!model||!block||!layout)return;

    const candidate=block.candidate;
    const label=`+${block.blockIndex+1}`;
    const coverage=Math.min(1,Math.max(0,block.coverage));
    const feeUsd=Number.isFinite(candidate.totalFees)&&Number.isFinite(model.priceUsd)
      ? (candidate.totalFees/1e8)*model.priceUsd
      : NaN;

    setText(root,"[data-ms-hero-label]",`projected block ${label}${Number.isFinite(block.nextHeight)?` · height ${int(block.nextHeight)}`:""}`);
    setText(root,"[data-ms-summary]",`${int(layout.tiles.length)} real TX tiles · ${num(block.actualVbytes/1e6,3)} vMB represented`);
    setText(root,"[data-ms-sub]",`${int(candidate.nTx)} candidate TX estimate · ${rate(block.medianRate,2)} median`);
    setText(root,"[data-ms-coverage]",pct(coverage,1));
    setText(root,"[data-ms-mode]",block.sourceMode);

    setText(root,"[data-ms-tx]",int(candidate.nTx));
    setText(root,"[data-ms-tx-sub]",`${int(layout.tiles.length)} transaction records currently scaled`);
    setText(root,"[data-ms-vsize]",`${num(block.targetVbytes/1e6,3)} vMB`);
    setText(root,"[data-ms-util]",`${pct(block.fillRatio,1)} candidate fill · ${pct(coverage,1)} hydrated`);
    setText(root,"[data-ms-median]",rate(block.medianRate,2));
    setText(root,"[data-ms-range]",candidateRange(block));
    setText(root,"[data-ms-fees]",btcFromSats(candidate.totalFees));
    setText(root,"[data-ms-fee-usd]",Number.isFinite(feeUsd)?usd(feeUsd):"USD unavailable");

    setText(root,"[data-ms-plane-meta]",`${label} · ${layout.tiles.length} real transactions`);
    setText(root,"[data-ms-canvas-title]",`${label} PROJECTED`);
    setText(root,"[data-ms-canvas-fill]",`${num(layout.representedVbytes/1e6,3)} / ${num(layout.denominatorVbytes/1e6,3)} vMB`);
    setText(root,"[data-ms-layout]",`${int(layout.tiles.length)} real transaction tiles · ${pct(layout.areaCoverage,1)} plane coverage`);
    setText(root,"[data-ms-source-mode]",model.completeLayout?"full scalable mempool feed":"progressive real-TX hydration");

    setText(root,"[data-ms-tip]",int(model.tipHeight));
    setText(root,"[data-ms-backlog]",`${num(model.backlogVMB,2)} vMB`);
    setText(root,"[data-ms-price]",usd(model.priceUsd));
    setText(root,"[data-ms-detail-coverage]",`${pct(model.detailCoverage,1)} full JSON · ${pct(model.layoutCoverage,1)} scalable`);
    setText(root,"[data-ms-source]",model.fullFeedSource?`${model.source} + ${model.fullFeedSource}`:model.source);
    setText(root,"[data-ms-method]",model.completeLayout
      ? "real transaction rows sized by exact vbytes; package fee order; click lazily fetches complete mempool.space TX JSON + raw hex"
      : "public mempool TXIDs progressively hydrate to real vsize/fee rows; no aggregate or fabricated transaction tiles");
    setText(root,"[data-ms-meta]",`${model.priceSource||"price unavailable"} · ${int(model.scalableCount)} scalable / ${int(model.universeCount)} known TX · refreshed ${new Date(model.fetchedAt||Date.now()).toLocaleTimeString()}`);
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

    box.textContent=`${String(tile.txid).slice(0,10)}… · ${num(tile.vbytes,0)} vB · ${rate(tile.packageFeeRate??tile.feeRate,2)} · click to inspect`;
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
      empty.textContent="Select a transaction tile in the projected block.";
      host.appendChild(empty);
    }
    setText(root,"[data-ms-selected]","none selected");
  }

  async function selectTile(root,state,tile){
    if(!tile?.txid)return;
    state.selectedId=tile.id;
    setText(root,"[data-ms-selected]",`${String(tile.txid).slice(0,12)}… · +${state.blockIndex+1}`);
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
        projectedBlock:state.blockIndex+1,
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
    state.blockIndex=Math.max(0,Math.min(state.model.candidates.length-1,state.blockIndex));
    safeSet(state.blockIndex);

    const previous=state.layout;
    const priorSelected=preserveSelection?state.selectedId:"";

    state.blockView=W.ZZXMempoolSpecsModel.blockView(state.model,state.blockIndex);
    state.layout=W.ZZXMempoolSpecsBlockLayout.build(state.blockView);
    state.hoverId="";
    state.selectedId=priorSelected&&state.layout.byId.has(priorSelected)?priorSelected:"";

    renderNav(root,state);
    renderSummary(root,state);
    if(!preserveSelection)clearReadout(root);

    if(animateChange)animate(root,state,previous);
    else draw(root,state,1,null);
  }

  function setBlock(root,state,index,animateChange=true){
    const count=Math.min(Number(state.model?.cfg?.maxCandidateBlocks)||8,state.model?.candidates?.length||0);
    if(!count)return;
    const next=Math.max(0,Math.min(count-1,Math.floor(index)));
    if(next===state.blockIndex&&state.layout)return;
    state.blockIndex=next;
    rebuildBlock(root,state,{animateChange});
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
      if(event.key==="ArrowLeft"){
        event.preventDefault();
        setBlock(root,state,state.blockIndex-1,true);
      }else if(event.key==="ArrowRight"){
        event.preventDefault();
        setBlock(root,state,state.blockIndex+1,true);
      }else if(event.key==="Enter"||event.key===" "){
        const tile=state.layout?.byId.get(state.hoverId)||state.layout?.byId.get(state.selectedId)||state.layout?.tiles?.[0];
        if(tile){event.preventDefault();selectTile(root,state,tile)}
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

    const pending=W.ZZXMempoolSpecsModel.pendingTxids(state.model,{limit:batchSize,offset:state.hydrateCursor});
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
        status(root,state.model.completeLayout?"live":"partial",state.model.completeLayout?"ok":"warn");
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
      if(root.isConnected&&!state.model?.completeLayout&&state.hydratedThisSession<(Number(state.model?.cfg?.maxHydratePerSession)||1600)){
        scheduleHydration(root,state,Number(state.model?.cfg?.hydrateDelayMs)||2200);
      }
    },Math.max(250,delay||0));
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

      // Preserve already-hydrated real transaction details across the 15-second
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

      if(!model.candidates.length)throw new Error("mempool.space returned no projected block candidates");
      if(!model.knownTxids.length&&!model.transactions.length){
        throw new Error("no real mempool transaction IDs were available");
      }

      state.model=model;
      state.hydrateCursor=0;
      if(force)state.hydratedThisSession=0;
      if(state.blockIndex>=model.candidates.length)state.blockIndex=0;

      rebuildBlock(root,state,{animateChange:state.hasGood});
      state.hasGood=true;
      status(root,model.completeLayout?"live":"partial",model.completeLayout?"ok":"warn");
      if(!model.completeLayout)scheduleHydration(root,state,650);
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
    W.clearTimeout(state.timer);
    W.clearTimeout(state.hydrateTimer);
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      blockView:null,
      layout:null,
      blockIndex:safeGet(),
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
      inspectToken:0
    };

    root.__zzxMempoolSpecsState=state;

    try{
      status(root,"modules","warn");
      await ensureModules(state.core);
      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({ms:720});
      wireCanvas(root,state);
      wireResize(root,state);

      q(root,"[data-ms-prev]")?.addEventListener("click",()=>setBlock(root,state,state.blockIndex-1,true));
      q(root,"[data-ms-next]")?.addEventListener("click",()=>setBlock(root,state,state.blockIndex+1,true));
      q(root,"[data-ms-refresh]")?.addEventListener("click",()=>refresh(root,state,true));

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected){cleanup(state);return}
        if(!D.hidden)await refresh(root,state,false);
        state.timer=W.setTimeout(loop,Number(state.model?.cfg?.refreshMs)||15000);
      }

      state.timer=W.setTimeout(loop,Number(state.model?.cfg?.refreshMs)||15000);
    }catch(error){
      status(root,"offline","error");
      setText(root,"[data-ms-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
