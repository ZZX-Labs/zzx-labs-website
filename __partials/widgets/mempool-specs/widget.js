// __partials/widgets/mempool-specs/widget.js
(function(){
  "use strict";
  const W=window,D=document,ID="mempool-specs";

  const DEPS=[
    ["ZZXMempoolSpecsSources","sources.js",4],
    ["ZZXMempoolSpecsFetch","fetch.js",4],
    ["ZZXMempoolSpecsProvider","provider.js",4],
    ["ZZXMempoolSpecsModel","model.js",4],
    ["ZZXMempoolSpecs.Theme","themes.js",4],
    ["ZZXMempoolSpecsPriorityLayout","priority-layout.js",1],
    ["ZZXMempoolSpecs.Renderer","renderer.js",4],
    ["ZZXMempoolSpecs.Anim","animation.js",4],
    ["ZZXMempoolSpecs.TxFetcher","txfetcher.js",4],
    ["ZZXMempoolSpecs.TxCard","tx-card.js",4]
  ];

  const q=(r,s)=>r?r.querySelector(s):null;
  function path(name){return String(name||"").split(".").filter(Boolean).reduce((cur,k)=>cur?.[k],W)}
  function version(name){return Number(path(name)?.__version||0)}
  function status(root,label,state){const e=q(root,"[data-ms-status]");if(e){e.textContent=label;e.setAttribute("data-status",state)}}
  function set(root,sel,value){const e=q(root,sel);if(e)e.textContent=String(value??"—")}
  function int(v){const n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():"—"}
  function num(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):"—"}
  function money(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}):"—"}
  function rate(v){const n=Number(v);return Number.isFinite(n)?`${n.toFixed(3)} sat/vB`:"—"}
  function pct(v){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(1)}%`:"—"}
  function short(id){const s=String(id||"");return s.length>20?`${s.slice(0,8)}…${s.slice(-8)}`:s}

  async function script(core,file,ver,key){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/mempool-specs";
    const raw=`${base}/js/${file}`;const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    const src=`${resolved}${resolved.includes("?")?"&":"?"}zzxmod=${ver}`;
    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");s.src=src;s.defer=true;s.dataset.msModule=`${key}-v${ver}`;
      s.addEventListener("load",resolve,{once:true});s.addEventListener("error",reject,{once:true});(D.head||D.documentElement).appendChild(s);
    });
  }

  async function ensure(core){
    for(const [key,file,ver] of DEPS){
      if(version(key)>=ver)continue;
      await script(core,file,ver,key);
      if(version(key)<ver)throw new Error(`${file} did not register ${key} v${ver}`);
    }
    W.ZZXMempoolSpecs.Theme.warm?.();
  }

  function renderMetrics(root,state){
    const m=state.model,l=state.layout;
    set(root,"[data-ms-count]",int(m.count));
    set(root,"[data-ms-count-sub]",m.count?`${int(m.count)} transaction IDs represented`:"transaction universe unavailable");
    set(root,"[data-ms-scored]",`${int(m.priorityCount)} / ${int(m.count)}`);
    set(root,"[data-ms-scored-sub]",`${pct(m.priorityCoverage)} priority coverage · ${int(m.detailedCount)} detailed`);
    set(root,"[data-ms-backlog]",Number.isFinite(m.backlogVMB)?`${num(m.backlogVMB,2)} vMB`:"—");
    set(root,"[data-ms-blocks]",Number.isFinite(m.backlogVMB)?`${num(m.backlogVMB,2)} max-vsize block equivalents`:"—");
    set(root,"[data-ms-fee]",rate(m.medianFee));
    set(root,"[data-ms-fast]",`fast recommendation ${rate(m.fastFee)}`);
    set(root,"[data-ms-tip]",int(m.tipHeight));
    set(root,"[data-ms-price]",money(m.priceUsd));
    set(root,"[data-ms-source]",m.fullFeedSource?`${m.fullFeedSource} + ${m.source}`:m.source||"configured mempool API");

    const method=m.fullPriority
      ? "full detailed mempool · package-aware priority · cumulative 1.0-vMB projected-block bands"
      : "all txids rendered · scored transactions first · unresolved txids remain priority-pending until detailed";
    set(root,"[data-ms-method]",method);
    set(root,"[data-ms-rank-span]",m.count?`#1 → #${int(m.count)}`:"—");
    set(root,"[data-ms-layout]",l?`${int(l.tiles.length)} transaction tiles · ${int(l.gridN)}×${int(l.gridN)} logical field`:"—");
    set(root,"[data-ms-coverage]",`priority ${pct(m.priorityCoverage)} · detail ${pct(m.detailedCoverage)}`);
    set(root,"[data-ms-summary]",`${int(m.count)} transactions · ${num(m.backlogVMB,2)} vMB`);
    set(root,"[data-ms-sub]",m.fullPriority
      ? "every transaction is priority-scored; higher projected inclusion likelihood is physically higher in the field"
      : `${int(m.priorityCount)} scored · ${int(Math.max(0,m.count-m.priorityCount))} priority-pending transaction IDs retained at the tail`);
    set(root,"[data-ms-meta]",`${m.priceSource||"price unavailable"} · refreshed ${new Date(m.fetchedAt||Date.now()).toLocaleTimeString()} · square visualizer represents transaction IDs, never synthetic txids`);
  }

  function canvasPoint(canvas,event){
    const r=canvas.getBoundingClientRect();
    return {nx:(event.clientX-r.left)/r.width,ny:(event.clientY-r.top)/r.height,x:event.clientX-r.left,y:event.clientY-r.top};
  }

  function tooltip(root,state,tile,point){
    const box=q(root,"[data-ms-hover]");if(!box)return;
    if(!tile){box.hidden=true;return}
    const fr=Number.isFinite(Number(tile.packageFeeRate))?`${Number(tile.packageFeeRate).toFixed(3)} sat/vB`:"priority pending";
    box.textContent=`#${tile.rank.toLocaleString()} · +${tile.projectedBlock} · ${short(tile.txid)} · ${fr}`;
    const host=q(root,"[data-ms-block]");const rect=host.getBoundingClientRect();
    const left=Math.max(8,Math.min(rect.width-220,point.x+12));
    const top=Math.max(8,Math.min(rect.height-44,point.y+12));
    box.style.left=`${left}px`;box.style.top=`${top}px`;box.hidden=false;
  }

  function draw(root,state,progress=1,fromLayout=null){
    W.ZZXMempoolSpecs.Renderer.draw(q(root,"[data-ms-canvas]"),state.layout,{
      fromLayout,
      progress,
      hoverTxid:state.hoverTxid,
      selectedTxid:state.selectedTxid
    });
  }

  async function select(root,state,tile){
    if(!tile)return;
    state.selectedTxid=tile.txid;
    set(root,"[data-ms-selected]",`#${int(tile.rank)} · ${short(tile.txid)}`);
    draw(root,state,1,null);

    const host=q(root,"[data-ms-readout]");
    W.ZZXMempoolSpecs.TxCard.renderInline(host,{
      entry:tile,rank:tile.rank,projectedBlock:tile.projectedBlock,tipHeight:state.model.tipHeight,btcUsd:state.model.priceUsd
    });

    try{
      const tx=await state.txFetcher.tx(tile.txid,{
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd
      });
      if(!tx||!root.isConnected)return;
      state.model=W.ZZXMempoolSpecsModel.enrich(state.model,tx);
      const previous=state.layout;
      state.layout=W.ZZXMempoolSpecsPriorityLayout.build(state.model);
      const updated=state.layout.byTxid.get(tile.txid)||tile;
      renderMetrics(root,state);
      W.ZZXMempoolSpecs.TxCard.renderInline(host,{
        tx,entry:updated,rank:updated.rank,projectedBlock:updated.projectedBlock,tipHeight:state.model.tipHeight,btcUsd:state.model.priceUsd
      });
      state.anim.play(t=>draw(root,state,t,previous));
    }catch(error){
      const e=D.createElement("div");e.className="ms-readout__empty";e.textContent=`Transaction detail fetch: ${String(error?.message||error)}`;host.appendChild(e);
    }
  }

  function wireCanvas(root,state){
    const canvas=q(root,"[data-ms-canvas]");if(!canvas)return;
    canvas.addEventListener("pointermove",event=>{
      if(!state.layout)return;
      const p=canvasPoint(canvas,event);
      const tile=W.ZZXMempoolSpecsPriorityLayout.find(state.layout,p.nx,p.ny);
      const next=tile?.txid||"";
      if(next!==state.hoverTxid){state.hoverTxid=next;draw(root,state,1,null)}
      tooltip(root,state,tile,p);
    });
    canvas.addEventListener("pointerleave",()=>{state.hoverTxid="";tooltip(root,state,null,{x:0,y:0});draw(root,state,1,null)});
    canvas.addEventListener("click",event=>{
      if(!state.layout)return;
      const p=canvasPoint(canvas,event);const tile=W.ZZXMempoolSpecsPriorityLayout.find(state.layout,p.nx,p.ny);if(tile)select(root,state,tile);
    });
    canvas.addEventListener("keydown",event=>{
      if(event.key!=="Enter"&&event.key!==" ")return;
      const tile=state.hoverTxid?state.layout?.byTxid.get(state.hoverTxid):(state.selectedTxid?state.layout?.byTxid.get(state.selectedTxid):state.layout?.tiles?.[0]);
      if(tile){event.preventDefault();select(root,state,tile)}
    });
  }

  async function hydrateSome(root,state){
    if(state.hydrating||!state.model||state.model.fullPriority||!root.isConnected)return;
    const pending=state.model.transactions.filter(x=>!x.detailed).slice(state.hydrateCursor,state.hydrateCursor+state.cfg.progressiveHydrate);
    if(!pending.length){state.hydrateCursor=0;return}
    state.hydrating=true;
    try{
      const map=await state.txFetcher.txBatch(pending.map(x=>x.txid),{
        limit:state.cfg.progressiveHydrate,
        concurrency:state.cfg.txConcurrency,
        tipHeight:state.model.tipHeight,
        btcUsd:state.model.priceUsd
      });
      if(!map.size)return;
      const previous=state.layout;
      for(const tx of map.values())state.model=W.ZZXMempoolSpecsModel.enrich(state.model,tx);
      state.layout=W.ZZXMempoolSpecsPriorityLayout.build(state.model);
      state.hydrateCursor+=pending.length;
      renderMetrics(root,state);
      state.anim.play(t=>draw(root,state,t,previous));
    }catch(_){/* progressive detail is best-effort */}
    finally{state.hydrating=false}
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;
    state.busy=true;status(root,"refreshing","warn");
    try{
      if(force){try{state.abort?.abort()}catch(_){}}
      state.abort=new AbortController();
      const payload=await W.ZZXMempoolSpecsProvider.load(state.core,{signal:state.abort.signal,force});
      const model=W.ZZXMempoolSpecsModel.build(payload);
      if(!model.transactions.length)throw new Error("no transaction IDs returned by configured mempool sources");
      const previous=state.layout;
      state.model=model;state.layout=W.ZZXMempoolSpecsPriorityLayout.build(model);state.cfg=payload.cfg;
      if(!state.txFetcher){
        state.txFetcher=new W.ZZXMempoolSpecs.TxFetcher({
          base:payload.cfg.apiBase,
          fetchJSON:W.ZZXMempoolSpecsFetch.fetchJSON,
          txTtlMs:180000,
          concurrency:payload.cfg.txConcurrency
        });
      }
      renderMetrics(root,state);
      if(previous)state.anim.play(t=>draw(root,state,t,previous));else draw(root,state,1,null);
      status(root,model.fullPriority?"live":"partial",model.fullPriority?"ok":"warn");
      state.hasGood=true;
      W.setTimeout(()=>hydrateSome(root,state),900);
    }catch(error){
      if(error?.name!=="AbortError"){
        status(root,state.hasGood?"stale":"offline",state.hasGood?"warn":"error");
        set(root,"[data-ms-meta]",String(error?.message||error));
      }
    }finally{state.busy=false}
  }

  async function boot(root,core){
    const state={core:core||W.ZZXWidgetsCore||null,model:null,layout:null,cfg:null,txFetcher:null,anim:null,busy:false,hydrating:false,hydrateCursor:0,hasGood:false,hoverTxid:"",selectedTxid:"",timer:null,resize:null,abort:null};
    root.__zzxMempoolSpecsState=state;
    try{
      await ensure(state.core);
      state.anim=new W.ZZXMempoolSpecs.Anim.Anim({ms:820});
      wireCanvas(root,state);
      q(root,"[data-ms-refresh]")?.addEventListener("click",()=>refresh(root,state,true));
      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>{if(state.layout)draw(root,state,1,null)}));
        state.resize.observe(q(root,"[data-ms-block]")||root);
      }
      await refresh(root,state,false);
      async function loop(){if(!root.isConnected)return;await refresh(root,state,false);state.timer=W.setTimeout(loop,state.cfg?.refreshMs||15000)}
      state.timer=W.setTimeout(loop,state.cfg?.refreshMs||15000);
    }catch(error){status(root,"offline","error");set(root,"[data-ms-meta]",String(error?.message||error))}
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
