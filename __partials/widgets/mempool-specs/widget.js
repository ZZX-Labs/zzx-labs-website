// __partials/widgets/mempool-specs/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-specs";
  const VIEW_KEY="zzx.widget.mempool-specs.view.v3";

  const DEPS=[
    ["ZZXMempoolSpecsSources","sources.js"],
    ["ZZXMempoolSpecsFetch","fetch.js"],
    ["ZZXMempoolSpecsProvider","provider.js"],
    ["ZZXMempoolSpecsModel","model.js"],
    ["ZZXMempoolSpecs.Adapter","adapter.js"],
    ["ZZXMempoolSpecs.Theme","themes.js"],
    ["ZZXMempoolSpecs.Grid","grid.js"],
    ["ZZXMempoolSpecs.Scaler","scaler.js"],
    ["ZZXMempoolSpecs.Tiler","tiler.js"],
    ["ZZXMempoolSpecs.TetriFill","tetrifill.js"],
    ["ZZXMempoolSpecs.BinFill","binfill.js"],
    ["ZZXMempoolSpecs.Sorter","sorter.js"],
    ["ZZXMempoolSpecs.Plotter","plotter.js"],
    ["ZZXMempoolSpecs.Renderer","renderer.js"],
    ["ZZXMempoolSpecs.Anim","animation.js"],
    ["ZZXMempoolSpecs.TxFetcher","txfetcher.js"],
    ["ZZXMempoolSpecs.TxCard","tx-card.js"]
  ];

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function status(root,label,state){
    const el=q(root,"[data-ms-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function num(v,d=2){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{maximumFractionDigits:d})
      : "—";
  }

  function money(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:0
        })
      : "—";
  }

  function safeGet(){
    try{return localStorage.getItem(VIEW_KEY)}catch(_){return null}
  }

  function safeSet(value){
    try{localStorage.setItem(VIEW_KEY,value)}catch(_){}
  }

  function globalPath(path){
    return String(path||"")
      .split(".")
      .filter(Boolean)
      .reduce((cur,key)=>cur?.[key],W);
  }

  async function loadScript(src,key){
    if(globalPath(key))return true;

    const existing=D.querySelector(`script[data-ms-module="${key}"]`);

    if(existing){
      await new Promise(resolve=>{
        if(globalPath(key))return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",resolve,{once:true});
        W.setTimeout(resolve,5000);
      });
      return !!globalPath(key);
    }

    return await new Promise(resolve=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.setAttribute("data-ms-module",key);
      s.addEventListener("load",()=>resolve(!!globalPath(key)),{once:true});
      s.addEventListener("error",()=>resolve(false),{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool-specs";

    for(const [key,file] of DEPS){
      if(globalPath(key))continue;

      const raw=`${base}/js/${file}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
      const ok=await loadScript(src,key);

      if(!ok){
        throw new Error(`${file} loaded without registering ${key}`);
      }
    }
  }

  function makeGrid(root,state){
    const canvas=q(root,"[data-ms-canvas]");

    return W.ZZXMempoolSpecs.Grid.makeGrid(canvas,{
      minCssH:220,
      cellCss:6.2,
      gapCss:1,
      padCss:10
    });
  }

  function layoutCandidate(state,grid){
    const seed=
      (Number(state.model.tipHeight)||0) ^
      (grid.cols<<10) ^
      (grid.rows<<20);

    const tiles=W.ZZXMempoolSpecs.Tiler.fromFeeBands(
      state.model.bands,
      state.scaler,
      {
        maxTiles:620,
        targetChunkVb:9000,
        minChunkVb:700,
        maxChunksPerBand:36,
        minSide:1,
        maxSide:22,
        seed
      }
    );

    const layout=W.ZZXMempoolSpecs.TetriFill.pack(
      tiles,
      grid,
      {
        seed,
        bubblePasses:1,
        scan:"row"
      }
    );

    for(const tile of layout.placed){
      tile.realTx=false;
    }

    return {
      layout,
      label:"candidate block",
      method:`aggregate fee-band candidate · ${state.model.bandSource}`,
      clickable:false
    };
  }

  async function enrichRecent(state){
    const rows=state.model.recent||[];

    if(!rows.length)return [];

    const usable=rows.filter(row=>
      Number.isFinite(Number(row.vbytes)) &&
      Number.isFinite(Number(row.feeRate))
    );

    if(usable.length===rows.length)return usable;

    if(!state.txFetcher)return usable;

    const ids=rows.map(row=>row.txid).filter(Boolean).slice(0,16);

    if(!ids.length)return usable;

    const map=await state.txFetcher.txBatch(ids,{
      limit:16,
      concurrency:4,
      tipHeight:state.model.tipHeight,
      btcUsd:state.model.priceUsd
    });

    const out=[];

    for(const id of ids){
      const tx=map.get(id);
      if(!tx)continue;

      const z=tx.__zzx||{};
      const vbytes=Number(z.vbytes);
      const feeRate=Number(z.feeRate);

      if(!Number.isFinite(vbytes)||!Number.isFinite(feeRate))continue;

      out.push({
        ...tx,
        txid:id,
        vbytes,
        feeRate,
        realTx:true,
        rawTx:tx
      });
    }

    return out;
  }

  async function layoutRecent(state,grid){
    const recent=await enrichRecent(state);

    const seed=
      (Number(state.model.tipHeight)||0) ^
      0x51A7C0DE ^
      (grid.cols<<8) ^
      (grid.rows<<16);

    const tiles=W.ZZXMempoolSpecs.Tiler.fromTxs(
      recent,
      state.scaler,
      {
        maxTiles:32,
        minSide:2,
        maxSide:24,
        sideGamma:.92,
        sideK:1.0,
        btcUsd:state.model.priceUsd
      }
    );

    for(const tile of tiles){
      tile.realTx=true;
    }

    const layout=W.ZZXMempoolSpecs.TetriFill.pack(
      tiles,
      grid,
      {
        seed,
        bubblePasses:1,
        scan:"row"
      }
    );

    return {
      layout,
      label:"recent real TX sample",
      method:"real recent mempool transactions · click a tile for transaction details",
      clickable:true
    };
  }

  function tileRectCss(grid,tile){
    const dpr=grid.dpr||1;
    const side=Number(tile.side||tile.w||1);
    const h=Number(tile.side||tile.h||1);

    return {
      left:(grid.x0+Number(tile.x||0)*grid.step)/dpr,
      top:(grid.y0+Number(tile.y||0)*grid.step)/dpr,
      width:grid.spanPx(side)/dpr,
      height:grid.spanPx(h)/dpr
    };
  }

  function renderHits(root,state,grid,layout){
    const host=q(root,"[data-ms-hitlayer]");
    host.replaceChildren();

    if(state.view!=="recent")return;

    for(const tile of layout.placed||[]){
      if(!tile.realTx||!tile.txid)continue;

      const rect=tileRectCss(grid,tile);
      const hit=D.createElement("button");
      hit.type="button";
      hit.className="ms-hit";
      hit.style.left=`${rect.left}px`;
      hit.style.top=`${rect.top}px`;
      hit.style.width=`${rect.width}px`;
      hit.style.height=`${rect.height}px`;
      hit.setAttribute(
        "aria-label",
        `Open transaction ${tile.txid}`
      );
      hit.title=`${tile.txid} · ${Number(tile.feeRate).toFixed(1)} sat/vB`;

      hit.addEventListener("click",async event=>{
        event.preventDefault();

        try{
          let tx=tile.rawTx;

          if(!tx?.vout && state.txFetcher){
            tx=await state.txFetcher.tx(tile.txid,{
              tipHeight:state.model.tipHeight,
              btcUsd:state.model.priceUsd
            });
          }

          if(!tx)throw new Error("transaction detail unavailable");

          W.ZZXMempoolSpecs.TxCard.open({
            tx,
            tipHeight:state.model.tipHeight,
            btcUsd:state.model.priceUsd,
            anchor:{
              x:event.clientX,
              y:event.clientY
            },
            title:"Mempool transaction"
          });
        }catch(error){
          q(root,"[data-ms-meta]").textContent=
            String(error?.message||error);
        }
      });

      host.appendChild(hit);
    }
  }

  function drawLayout(root,state,grid,result){
    const canvas=q(root,"[data-ms-canvas]");
    const ctx=canvas.getContext("2d");
    if(!ctx)return;

    const meta=
      `${result.label} · ${result.layout.placed.length.toLocaleString()} tiles`;

    const previous=state.lastLayout;
    const gridSig=W.ZZXMempoolSpecs.Grid.signature(grid);
    const changed=gridSig!==state.gridSig;
    state.gridSig=gridSig;

    if(
      state.view==="candidate" &&
      previous &&
      !changed &&
      W.ZZXMempoolSpecs.Anim?.Anim
    ){
      state.anim=state.anim||new W.ZZXMempoolSpecs.Anim.Anim({ms:650});
      state.anim.play(previous,result.layout,frame=>{
        W.ZZXMempoolSpecs.Plotter.draw(
          ctx,
          canvas,
          grid,
          frame,
          meta
        );
      });
    }else{
      W.ZZXMempoolSpecs.Plotter.draw(
        ctx,
        canvas,
        grid,
        result.layout,
        meta
      );
    }

    state.lastLayout=result.layout;
    state.lastResult=result;
    renderHits(root,state,grid,result.layout);

    q(root,"[data-ms-layout]").textContent=
      `${result.layout.placed.length.toLocaleString()} placed · ${(result.layout.rejected||[]).length.toLocaleString()} rejected`;

    q(root,"[data-ms-method]").textContent=result.method;
  }

  async function paint(root,state){
    if(!state.model||!root.isConnected)return;

    const grid=makeGrid(root,state);
    const result=
      state.view==="recent"
        ? await layoutRecent(state,grid)
        : layoutCandidate(state,grid);

    drawLayout(root,state,grid,result);
  }

  function renderMetrics(root,state){
    const m=state.model;

    q(root,"[data-ms-count]").textContent=int(m.count);
    q(root,"[data-ms-backlog]").textContent=
      Number.isFinite(m.backlogVMB)
        ? `${num(m.backlogVMB,2)} vMB`
        : "—";

    q(root,"[data-ms-candidate]").textContent=
      Number.isFinite(m.candidateVbytes)
        ? `${num(m.candidateVbytes/1e6,3)} vMB`
        : "—";

    q(root,"[data-ms-candidate-tx]").textContent=int(m.candidateTx);
    q(root,"[data-ms-tip]").textContent=int(m.tipHeight);
    q(root,"[data-ms-price]").textContent=money(m.priceUsd);
    q(root,"[data-ms-source]").textContent=m.source||"configured mempool API";

    const feeParts=[];
    if(Number.isFinite(m.candidateMin)){
      feeParts.push(`min ${num(m.candidateMin,1)} sat/vB`);
    }
    if(Number.isFinite(m.candidateMedian)){
      feeParts.push(`median ${num(m.candidateMedian,1)} sat/vB`);
    }
    q(root,"[data-ms-fees]").textContent=feeParts.join(" · ")||"fee range derived from histogram";

    q(root,"[data-ms-meta]").textContent=
      `${m.priceSource||"ZZX BPI"} · candidate view approximates fee-band packing and is not a miner commitment`;
  }

  function renderViewText(root,state){
    if(state.view==="recent"){
      q(root,"[data-ms-hero-label]").textContent="recent real transaction sample";
      q(root,"[data-ms-summary]").textContent=
        `${state.model.recent.length.toLocaleString()} sampled recent TXs`;
      q(root,"[data-ms-sub]").textContent=
        "real txids · click tiles for fee, size, output and confirmation details";
    }else{
      q(root,"[data-ms-hero-label]").textContent="candidate block visualization";
      q(root,"[data-ms-summary]").textContent=
        `${num(state.model.candidateVbytes/1e6,3)} vMB candidate`;
      q(root,"[data-ms-sub]").textContent=
        `${int(state.model.candidateTx)} estimated candidate transactions · aggregate fee-band construction`;
    }
  }

  async function render(root,state){
    renderMetrics(root,state);
    renderViewText(root,state);
    await paint(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    if(force){
      try{state.abort?.abort()}catch(_){}
      state.abort=new AbortController();
    }else if(!state.abort){
      state.abort=new AbortController();
    }

    try{
      const payload=await W.ZZXMempoolSpecsProvider.load(
        state.core,
        {signal:state.abort.signal}
      );

      state.model=W.ZZXMempoolSpecsModel.build(payload);

      const cfg=W.ZZXMempoolSpecsSources.get(state.core);

      if(!state.txFetcher){
        state.txFetcher=new W.ZZXMempoolSpecs.TxFetcher({
          base:cfg.apiBase,
          ctx:{
            fetchText:W.ZZXMempoolSpecsFetch.fetchText,
            fetchJSON:W.ZZXMempoolSpecsFetch.fetchJSON
          },
          minIntervalMs:15000,
          txTtlMs:180000,
          txConcurrency:4,
          maxTxids:32
        });
      }

      await render(root,state);
    }catch(error){
      if(error?.name!=="AbortError"){
        status(
          root,
          state.model?"stale":"offline",
          state.model?"warn":"error"
        );
        q(root,"[data-ms-meta]").textContent=
          String(error?.message||error);
      }
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      view:"candidate",
      scaler:null,
      txFetcher:null,
      lastLayout:null,
      lastResult:null,
      gridSig:"",
      anim:null,
      busy:false,
      abort:null,
      timer:null,
      resize:null
    };

    root.__zzxMempoolSpecsState=state;

    try{
      status(root,"modules","warn");
      await ensureModules(state.core);

      state.scaler=new W.ZZXMempoolSpecs.Scaler();

      const select=q(root,"[data-ms-view]");
      const saved=safeGet();

      if(saved && [...select.options].some(option=>option.value===saved)){
        state.view=saved;
        select.value=saved;
      }

      select.addEventListener("change",async()=>{
        state.view=select.value;
        safeSet(state.view);
        state.lastLayout=null;

        if(state.model){
          status(root,"rendering","warn");
          await render(root,state);
        }
      });

      q(root,"[data-ms-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true)
      );

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>{
          W.requestAnimationFrame(()=>{
            if(state.model && !state.busy){
              paint(root,state).catch(()=>{});
            }
          });
        });

        state.resize.observe(q(root,"[data-ms-block]"));
      }

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state,false);

        const cfg=W.ZZXMempoolSpecsSources.get(state.core);
        state.timer=W.setTimeout(loop,cfg.refreshMs);
      }

      const cfg=W.ZZXMempoolSpecsSources.get(state.core);
      state.timer=W.setTimeout(loop,cfg.refreshMs);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-ms-meta]").textContent=
        String(error?.message||error);
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
