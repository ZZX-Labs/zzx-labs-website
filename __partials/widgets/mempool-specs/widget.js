// __partials/widgets/mempool-specs/widget.js
// v10.70 — projected-block transaction tiler
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-specs";
  const BLOCK_KEY="zzx.widget.mempool-specs.block.v5";

  const DEPS=[
    ["ZZXMempoolSpecsSources","js/sources.js",5],
    ["ZZXMempoolSpecsFetch","js/fetch.js",4],
    ["ZZXMempoolSpecsProvider","js/provider.js",5],
    ["ZZXMempoolSpecsModel","js/model.js",5],

    ["ZZXMempoolSpecs.Adapter","js/adapter.js",5],
    ["ZZXMempoolSpecs.Theme","js/themes.js",4],
    ["ZZXMempoolSpecs.Grid","js/grid.js",5],
    ["ZZXMempoolSpecs.Scaler","js/scaler.js",5],
    ["ZZXMempoolSpecs.Tiler","js/tiler.js",5],
    ["ZZXMempoolSpecs.TetriFill","js/tetrifill.js",5],
    ["ZZXMempoolSpecs.BinFill","js/binfill.js",5],
    ["ZZXMempoolSpecs.Sorter","js/sorter.js",5],
    ["ZZXMempoolSpecs.Plotter","js/plotter.js",5],

    ["ZZXMempoolSpecsBlockLayout","js/block-layout.js",1],
    ["ZZXMempoolSpecs.Renderer","js/renderer.js",5],
    ["ZZXMempoolSpecs.Anim","js/animation.js",5],
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

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function int(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? Math.round(n).toLocaleString()
      : "—";
  }

  function num(v,digits=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{maximumFractionDigits:digits})
      : "—";
  }

  function pct(v,digits=1){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${(n*100).toFixed(digits)}%`
      : "—";
  }

  function rate(v,digits=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${n.toFixed(digits)} sat/vB`
      : "—";
  }

  function btcFromSats(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${(n/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function usd(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:2
        })
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
    try{
      W.localStorage?.setItem(BLOCK_KEY,String(value));
    }catch(_error){}
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

    const selector=`script[data-ms-module="${CSS.escape(key)}"][data-ms-version="${minimumVersion}"]`;
    const existing=D.querySelector(selector);

    if(existing){
      await new Promise(resolve=>{
        if(version(key)>=minimumVersion)return resolve();

        existing.addEventListener(
          "load",
          resolve,
          {once:true}
        );

        existing.addEventListener(
          "error",
          resolve,
          {once:true}
        );

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
    }catch(_error){}
  }

  function candidateRange(block){
    const values=(Array.isArray(block?.candidate?.feeRange)
      ? block.candidate.feeRange
      : []
    ).filter(Number.isFinite);

    const min=values.length
      ? Math.min(...values)
      : block?.minRate;

    const max=values.length
      ? Math.max(...values)
      : block?.maxRate;

    if(
      !Number.isFinite(min) ||
      !Number.isFinite(max)
    ){
      return "range unavailable";
    }

    return `${min.toFixed(2)}–${max.toFixed(2)} sat/vB`;
  }

  function renderNav(root,state){
    const host=q(root,"[data-ms-block-nav]");
    if(!host||!state.model)return;

    host.replaceChildren();

    const count=Math.min(
      8,
      state.model.candidates.length
    );

    for(let i=0;i<count;i++){
      const button=D.createElement("button");
      button.type="button";
      button.className="mempool-specs__block-button";
      button.textContent=i===0?"+1":`+${i+1}`;
      button.setAttribute(
        "aria-label",
        `Projected block +${i+1}`
      );
      button.setAttribute(
        "aria-pressed",
        String(i===state.blockIndex)
      );

      button.addEventListener(
        "click",
        ()=>setBlock(root,state,i,true)
      );

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
    const candidate=block.candidate;

    if(!model||!block)return;

    const projectedLabel=`+${block.blockIndex+1}`;

    setText(
      root,
      "[data-ms-hero-label]",
      `projected block ${projectedLabel}${Number.isFinite(block.nextHeight)?` · height ${int(block.nextHeight)}`:""}`
    );

    setText(
      root,
      "[data-ms-summary]",
      `${int(candidate.nTx)} TX · ${num(block.targetVbytes/1e6,3)} vMB`
    );

    setText(
      root,
      "[data-ms-sub]",
      `${rate(block.medianRate,2)} median · ${candidateRange(block)}`
    );

    setText(
      root,
      "[data-ms-fill]",
      pct(block.fillRatio,1)
    );

    setText(
      root,
      "[data-ms-mode]",
      block.sourceMode
    );

    setText(
      root,
      "[data-ms-tx]",
      int(candidate.nTx)
    );

    setText(
      root,
      "[data-ms-tx-sub]",
      `${int(state.layout?.tiles?.length)} visual tiles`
    );

    setText(
      root,
      "[data-ms-vsize]",
      `${num(block.targetVbytes/1e6,3)} vMB`
    );

    setText(
      root,
      "[data-ms-util]",
      `${pct(block.fillRatio,1)} of 1.0-vMB reference`
    );

    setText(
      root,
      "[data-ms-median]",
      rate(block.medianRate,2)
    );

    setText(
      root,
      "[data-ms-range]",
      candidateRange(block)
    );

    setText(
      root,
      "[data-ms-fees]",
      btcFromSats(candidate.totalFees)
    );

    const feeUsd=
      Number.isFinite(candidate.totalFees) &&
      Number.isFinite(model.priceUsd)
        ? (candidate.totalFees/1e8)*model.priceUsd
        : NaN;

    setText(
      root,
      "[data-ms-fee-usd]",
      Number.isFinite(feeUsd)
        ? usd(feeUsd)
        : "USD unavailable"
    );

    setText(
      root,
      "[data-ms-plane-meta]",
      `${projectedLabel} · ${block.sourceMode}`
    );

    setText(
      root,
      "[data-ms-canvas-title]",
      `${projectedLabel} PROJECTED`
    );

    setText(
      root,
      "[data-ms-canvas-fill]",
      `${num(block.targetVbytes/1e6,3)} vMB`
    );

    const realTiles=state.layout.tiles.filter(tile=>tile.realTx).length;
    const reps=state.layout.tiles.length-realTiles;

    setText(
      root,
      "[data-ms-layout]",
      `${int(state.layout.tiles.length)} tiles · ${int(realTiles)} real TX · ${int(reps)} representative`
    );

    setText(
      root,
      "[data-ms-source-mode]",
      `${pct(block.realCoverage,1)} detailed candidate coverage`
    );

    setText(
      root,
      "[data-ms-tip]",
      int(model.tipHeight)
    );

    setText(
      root,
      "[data-ms-backlog]",
      `${num(model.backlogVMB,2)} vMB`
    );

    setText(
      root,
      "[data-ms-price]",
      usd(model.priceUsd)
    );

    setText(
      root,
      "[data-ms-source]",
      model.fullFeedSource
        ? `${model.source} + ${model.fullFeedSource}`
        : model.source
    );

    setText(
      root,
      "[data-ms-method]",
      block.sourceMode==="representative"
        ? "mempool.space candidate metadata + fee_histogram slice → deterministic representative transaction groups"
        : "detailed mempool feed → projected candidate TXs; histogram fills any unresolved candidate area"
    );

    setText(
      root,
      "[data-ms-meta]",
      `${model.priceSource||"price unavailable"} · candidate construction is an estimate, not a miner commitment · refreshed ${new Date(model.fetchedAt||Date.now()).toLocaleTimeString()}`
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
    if(!state.layout)return null;

    return W.ZZXMempoolSpecsBlockLayout.find(
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

    const rateText=rate(
      tile.packageFeeRate??tile.feeRate,
      2
    );

    box.textContent=tile.realTx
      ? `${String(tile.txid).slice(0,10)}… · ${num(tile.vbytes,0)} vB · ${rateText}`
      : `${int(tile.representedTx)} TX represented · ${num(tile.vbytes,0)} vB · ${rateText}`;

    const host=q(root,"[data-ms-block]");
    const rect=host?.getBoundingClientRect?.()||{width:320,height:320};

    box.style.left=`${Math.max(8,Math.min(rect.width-250,point.x+12))}px`;
    box.style.top=`${Math.max(8,Math.min(rect.height-48,point.y+12))}px`;
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
    try{
      state.anim?.stop?.();
    }catch(_error){}

    if(!previous){
      draw(root,state,1,null);
      return;
    }

    state.anim.play(progress=>{
      if(root.isConnected){
        draw(root,state,progress,previous);
      }
    });
  }

  function clearReadout(root){
    const host=q(root,"[data-ms-readout]");
    if(!host)return;
    host.replaceChildren();

    const empty=D.createElement("div");
    empty.className="ms-readout__empty";
    empty.textContent="Select a tile in the projected block.";
    host.appendChild(empty);

    setText(
      root,
      "[data-ms-selected]",
      "none selected"
    );
  }

  function readoutCell(key,value){
    const cell=D.createElement("div");
    cell.className="ms-readout__cell";

    const k=D.createElement("span");
    k.className="ms-readout__k";
    k.textContent=key;

    const v=D.createElement("strong");
    v.className="ms-readout__v";
    v.textContent=String(value??"—");

    cell.append(k,v);
    return cell;
  }

  function renderRepresentative(root,tile,state){
    const host=q(root,"[data-ms-readout]");
    if(!host)return;

    host.replaceChildren();

    const head=D.createElement("div");
    head.className="ms-readout__head";

    const title=D.createElement("div");
    title.className="ms-readout__title";

    const strong=D.createElement("strong");
    strong.textContent="Representative transaction group";

    const code=D.createElement("code");
    code.textContent=`${int(tile.representedTx)} candidate transactions represented`;

    title.append(strong,code);

    const badge=D.createElement("span");
    badge.className="ms-readout__badge";
    badge.textContent="aggregate";

    head.append(title,badge);
    host.appendChild(head);

    const grid=D.createElement("div");
    grid.className="ms-readout__grid";

    grid.append(
      readoutCell("represented TXs",int(tile.representedTx)),
      readoutCell("represented vsize",`${num(tile.vbytes,0)} vB`),
      readoutCell("fee band",rate(tile.packageFeeRate??tile.feeRate,3)),
      readoutCell("projected block",`+${state.blockIndex+1}`)
    );

    host.appendChild(grid);

    const note=D.createElement("div");
    note.className="ms-readout__deps";
    note.textContent=
      "This tile is an aggregate visualization of real mempool fee/vsize data. It is not assigned a fabricated transaction ID.";

    host.appendChild(note);

    setText(
      root,
      "[data-ms-selected]",
      `${int(tile.representedTx)} TX group · ${rate(tile.packageFeeRate??tile.feeRate,2)}`
    );
  }

  function renderReal(root,tile,state){
    const host=q(root,"[data-ms-readout]");
    if(!host)return;

    W.ZZXMempoolSpecs.TxCard.renderInline(
      host,
      {
        tx:tile.raw||undefined,
        entry:tile,
        rank:tile.index+1,
        projectedBlock:state.blockIndex+1,
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd
      }
    );

    setText(
      root,
      "[data-ms-selected]",
      `${String(tile.txid).slice(0,10)}… · +${state.blockIndex+1}`
    );
  }

  function selectTile(root,state,tile){
    if(!tile)return;

    state.selectedId=tile.id;

    if(tile.realTx){
      renderReal(root,tile,state);
    }else{
      renderRepresentative(root,tile,state);
    }

    draw(root,state,1,null);
  }

  function rebuildBlock(root,state,{animateChange=true}={}){
    if(!state.model?.candidates?.length)return;

    state.blockIndex=Math.max(
      0,
      Math.min(
        state.model.candidates.length-1,
        state.blockIndex
      )
    );

    safeSet(state.blockIndex);

    const previous=state.layout;

    state.blockView=W.ZZXMempoolSpecsModel.blockView(
      state.model,
      state.blockIndex
    );

    state.layout=W.ZZXMempoolSpecsBlockLayout.build(
      state.blockView
    );

    state.hoverId="";
    state.selectedId="";

    renderNav(root,state);
    renderSummary(root,state);
    clearReadout(root);

    if(animateChange){
      animate(root,state,previous);
    }else{
      draw(root,state,1,null);
    }
  }

  function setBlock(root,state,index,animateChange=true){
    const count=Math.min(
      8,
      state.model?.candidates?.length||0
    );

    if(!count)return;

    const next=Math.max(
      0,
      Math.min(count-1,Math.floor(index))
    );

    if(next===state.blockIndex&&state.layout){
      return;
    }

    state.blockIndex=next;
    rebuildBlock(root,state,{animateChange});
  }

  function wireCanvas(root,state){
    const canvas=q(root,"[data-ms-canvas]");
    if(!canvas)return;

    canvas.addEventListener(
      "pointermove",
      event=>{
        const point=canvasPoint(canvas,event);
        const tile=tileAt(state,point);
        const id=tile?.id||"";

        if(id!==state.hoverId){
          state.hoverId=id;
          draw(root,state,1,null);
        }

        tooltip(root,state,tile,point);
      }
    );

    canvas.addEventListener(
      "pointerleave",
      ()=>{
        state.hoverId="";
        tooltip(root,state,null,{x:0,y:0});
        draw(root,state,1,null);
      }
    );

    canvas.addEventListener(
      "click",
      event=>{
        const tile=tileAt(
          state,
          canvasPoint(canvas,event)
        );

        if(tile){
          selectTile(root,state,tile);
        }
      }
    );

    canvas.addEventListener(
      "keydown",
      event=>{
        if(!state.layout?.tiles?.length)return;

        if(event.key==="Enter"||event.key===" "){
          const tile=
            state.layout.byId.get(state.hoverId) ||
            state.layout.byId.get(state.selectedId) ||
            state.layout.tiles[0];

          if(tile){
            event.preventDefault();
            selectTile(root,state,tile);
          }
        }

        if(event.key==="ArrowLeft"){
          event.preventDefault();
          setBlock(root,state,state.blockIndex-1,true);
        }

        if(event.key==="ArrowRight"){
          event.preventDefault();
          setBlock(root,state,state.blockIndex+1,true);
        }
      }
    );
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      if(force){
        try{
          state.abort?.abort();
        }catch(_error){}
      }

      state.abort=new AbortController();

      const payload=await W.ZZXMempoolSpecsProvider.load(
        state.core,
        {
          signal:state.abort.signal,
          force
        }
      );

      const model=W.ZZXMempoolSpecsModel.build(
        payload
      );

      if(!model.candidates.length){
        throw new Error(
          "mempool.space returned no projected block candidates"
        );
      }

      state.model=model;

      if(state.blockIndex>=model.candidates.length){
        state.blockIndex=0;
      }

      rebuildBlock(
        root,
        state,
        {animateChange:state.hasGood}
      );

      state.hasGood=true;
      status(root,"live","ok");
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
              root.isConnected &&
              state.layout &&
              !state.busy
            ){
              draw(root,state,1,null);
            }
          }
        );
      }
    );

    const block=q(root,"[data-ms-block]");
    if(block)state.resize.observe(block);
  }

  function cleanup(state){
    try{
      state.abort?.abort();
    }catch(_error){}

    try{
      state.resize?.disconnect();
    }catch(_error){}

    try{
      state.anim?.stop?.();
    }catch(_error){}

    W.clearTimeout(state.timer);
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
      hasGood:false,
      timer:null,
      resize:null,
      abort:null,
      anim:null
    };

    root.__zzxMempoolSpecsState=state;

    try{
      status(root,"modules","warn");

      await ensureModules(state.core);

      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({
        ms:720
      });

      wireCanvas(root,state);
      wireResize(root,state);

      q(root,"[data-ms-prev]")?.addEventListener(
        "click",
        ()=>setBlock(root,state,state.blockIndex-1,true)
      );

      q(root,"[data-ms-next]")?.addEventListener(
        "click",
        ()=>setBlock(root,state,state.blockIndex+1,true)
      );

      q(root,"[data-ms-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true)
      );

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected){
          cleanup(state);
          return;
        }

        if(!D.hidden){
          await refresh(root,state,false);
        }

        const refreshMs=
          Number(state.model?.refreshMs) ||
          Number(state.core?.ctx?.refreshMs) ||
          15000;

        state.timer=W.setTimeout(
          loop,
          refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        15000
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
