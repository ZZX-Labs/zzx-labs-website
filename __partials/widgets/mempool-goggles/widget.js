// __partials/widgets/mempool-goggles/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-goggles";

  function q(root,sel){return root?root.querySelector(sel):null;}
  function int(v){const n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():"—";}
  function num(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):"—";}
  function btc(v){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"—";}
  function usd(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";}
  function status(root,label,state){const el=q(root,"[data-mg-status]");if(!el)return;el.textContent=label;el.setAttribute("data-status",state||"offline");}

  async function ensureModules(core){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/mempool-goggles";
    for(const [globalName,relative] of [
      ["ZZXMempoolGogglesSources","js/sources.js"],
      ["ZZXMempoolGogglesFetch","js/fetch.js"],
      ["ZZXMempoolGogglesProvider","js/provider.js"],
      ["ZZXMempoolGogglesModel","js/model.js"],
      ["ZZXMempoolGogglesTreemap","js/treemap.js"],
      ["ZZXMempoolGogglesRenderer","js/renderer.js"]
    ]){
      if(W[globalName])continue;
      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });
      if(!W[globalName])throw new Error(`${relative} did not register ${globalName}`);
    }
  }

  function pageUrlFromPayload(payload){
    const raw=String(payload?.base||"https://mempool.space/api").replace(/\/+$/g,"");
    return raw.replace(/\/api$/i,"")+"/mempool-block/0";
  }

  function setMode(root,state,mode){
    state.mode=mode;
    const stage=q(root,"[data-mg-stage]");
    if(stage)stage.dataset.mode=mode;
    const live=q(root,"[data-mg-live]");
    const fallback=q(root,"[data-mg-fallback]");
    if(live)live.hidden=mode!=="live";
    if(fallback)fallback.hidden=mode!=="local";
    const liveBtn=q(root,"[data-mg-show-live]");
    const localBtn=q(root,"[data-mg-show-local]");
    if(liveBtn)liveBtn.setAttribute("aria-pressed",mode==="live"?"true":"false");
    if(localBtn)localBtn.setAttribute("aria-pressed",mode==="local"?"true":"false");
    if(mode==="local"&&state.model)draw(root,state);
  }

  function draw(root,state){
    if(!state.model)return;
    const canvas=q(root,"[data-mg-canvas]");
    if(!canvas)return;
    state.hits=W.ZZXMempoolGogglesRenderer.draw(canvas,state.model.tiles,state.model);
  }

  function tooltipText(root,item){
    const tip=q(root,"[data-mg-tooltip]");if(!tip)return;
    tip.replaceChildren();
    const title=D.createElement("strong");title.textContent=`${num(item.feeRate,1)} sat/vB`;
    const body=D.createElement("span");const txText=Number.isFinite(Number(item.estimatedTx))?` · ≈${Math.max(.1,Number(item.estimatedTx)).toFixed(1)} tx`:"";
    body.textContent=`${int(item.vbytes)} vB fee-band volume${txText}`;
    tip.append(title,body);
  }

  function placeTooltip(root,event,hit){
    const block=q(root,"[data-mg-fallback]");const tip=q(root,"[data-mg-tooltip]");if(!block||!tip)return;
    const rect=block.getBoundingClientRect();tooltipText(root,hit.item);tip.hidden=false;
    const left=Math.max(6,Math.min(rect.width-220,event.clientX-rect.left+12));
    const top=Math.max(6,Math.min(rect.height-68,event.clientY-rect.top+12));
    tip.style.left=`${left}px`;tip.style.top=`${top}px`;
  }
  function hideTooltip(root){const tip=q(root,"[data-mg-tooltip]");if(tip)tip.hidden=true;}

  function syncFrame(root,state,payload,forceReload=false){
    const iframe=q(root,"[data-mg-iframe]");const open=q(root,"[data-mg-open]");if(!iframe)return;
    const baseUrl=pageUrlFromPayload(payload);const src=forceReload?`${baseUrl}?ts=${Date.now()}`:baseUrl;
    if(forceReload||state.frameUrl!==baseUrl||!iframe.src){iframe.src=src;state.frameUrl=baseUrl;}
    if(open)open.href=baseUrl;
  }

  function render(root,state,payload){
    const m=state.model;
    q(root,"[data-mg-height]").textContent=Number.isFinite(m.nextHeight)?`#${int(m.nextHeight)}`:"next block";
    q(root,"[data-mg-sub]").textContent=`${int(m.candidateTx)} candidate TXs · ${num(m.candidateVbytes/1e6,3)} vMB · live page feed + API summary`;
    q(root,"[data-mg-vsize]").textContent=Number.isFinite(m.candidateVbytes)?`${num(m.candidateVbytes/1e6,3)} vMB`:"—";
    q(root,"[data-mg-tx]").textContent=int(m.candidateTx);
    q(root,"[data-mg-fees]").textContent=`${btc(m.totalFeesBTC)}${Number.isFinite(m.totalFeesUSD)?` · ${usd(m.totalFeesUSD)}`:""}`;
    q(root,"[data-mg-median]").textContent=Number.isFinite(m.medianFee)?`${num(m.medianFee,1)} sat/vB`:"—";
    q(root,"[data-mg-tip]").textContent=Number.isFinite(m.tipHeight)?`#${int(m.tipHeight)} → candidate #${int(m.nextHeight)}`:"—";
    q(root,"[data-mg-range]").textContent=Number.isFinite(m.feeMin)&&Number.isFinite(m.feeMax)?`${num(m.feeMin,1)}–${num(m.feeMax,1)} sat/vB`:"—";
    q(root,"[data-mg-backlog]").textContent=Number.isFinite(m.backlogVMB)?`${num(m.backlogVMB,2)} vMB · ${int(m.mempoolTx)} TXs`:"—";
    q(root,"[data-mg-source]").textContent=m.source||"configured mempool API";
    q(root,"[data-mg-updated]").textContent=`updated ${new Date(m.fetchedAt).toLocaleTimeString()}`;
    q(root,"[data-mg-block-label]").textContent=`literal remote page feed · local fallback has ${m.tiles.length.toLocaleString()} fee-band tiles`;
    q(root,"[data-mg-meta]").textContent=`Default mode is the literal mempool.space page viewport. If the remote site blocks embedding, switch to Local fallback for the clean-room renderer.`;
    syncFrame(root,state,payload,false);
    if(state.mode==="local")draw(root,state);
    status(root,state.mode==="live"?"live frame":"local fallback",state.mode==="live"?"ok":"warn");
  }

  async function refresh(root,state,forceFrameReload=false){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{
      const payload=await W.ZZXMempoolGogglesProvider.load(state.core);
      state.payload=payload;state.model=W.ZZXMempoolGogglesModel.build(payload);
      if(!state.model.tiles.length)throw new Error("candidate fee distribution produced no visual tiles");
      render(root,state,payload);if(forceFrameReload)syncFrame(root,state,payload,true);
    }catch(error){status(root,state.model?"stale":"offline",state.model?"warn":"error");q(root,"[data-mg-meta]").textContent=String(error?.message||error);}finally{state.busy=false;}
  }

  async function boot(root,core){
    if(!root)return;
    const old=root.__zzxStateMempoolGoggles;old?.timer&&W.clearTimeout(old.timer);old?.resize?.disconnect?.();
    const state={core:core||W.ZZXWidgetsCore||null,model:null,payload:null,hits:[],busy:false,timer:null,resize:null,mode:"live",frameUrl:""};
    root.__zzxStateMempoolGoggles=state;
    try{
      await ensureModules(state.core);
      const canvas=q(root,"[data-mg-canvas]");
      canvas?.addEventListener("pointermove",event=>{if(state.mode!=="local")return;const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left;const y=event.clientY-rect.top;const hit=W.ZZXMempoolGogglesRenderer.hitTest(state.hits,x,y);if(hit){canvas.style.cursor="crosshair";placeTooltip(root,event,hit);}else{canvas.style.cursor="default";hideTooltip(root);}});
      canvas?.addEventListener("pointerleave",()=>{if(canvas)canvas.style.cursor="default";hideTooltip(root);});
      q(root,"[data-mg-show-live]")?.addEventListener("click",()=>setMode(root,state,"live"));
      q(root,"[data-mg-show-local]")?.addEventListener("click",()=>setMode(root,state,"local"));
      q(root,"[data-mg-refresh]")?.addEventListener("click",()=>refresh(root,state,true));
      if("ResizeObserver" in W){state.resize=new ResizeObserver(()=>{W.requestAnimationFrame(()=>{if(state.model&&state.mode==="local"&&!state.busy)draw(root,state);});});state.resize.observe(q(root,"[data-mg-stage]"));}
      await refresh(root,state,true);
      async function loop(){if(!root.isConnected)return;await refresh(root,state,false);state.timer=W.setTimeout(loop,W.ZZXMempoolGogglesSources.refreshMs);}
      state.timer=W.setTimeout(loop,W.ZZXMempoolGogglesSources.refreshMs);
    }catch(error){status(root,"offline","error");q(root,"[data-mg-meta]").textContent=String(error?.message||error);}
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
