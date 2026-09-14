// Mempool Tiles v2.0.0 — exact square atlas + persistent transaction readers.
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="mempool-tiles";

  if(W.__ZZX_MEMPOOL_TILES_WIDGET_V20__)return;
  W.__ZZX_MEMPOOL_TILES_WIDGET_V20__=true;

  const MODULES=[
    ["ZZXMempoolTilesSources","js/sources.js",3],
    ["ZZXMempoolTilesFetch","js/fetch.js",1],
    ["ZZXMempoolTilesProvider","js/provider.js",1],
    ["ZZXMempoolTilesLive","js/live.js",2],
    ["ZZXMempoolTilesAnalyzer","js/analyzer.js",3],
    ["ZZXMempoolTilesModel","js/model.js",3],
    ["ZZXMempoolTilesScaler","js/scaler.js",4],
    ["ZZXMempoolTilesSorter","js/sorter.js",1],
    ["ZZXMempoolTilesPacker","js/packer.js",5],
    ["ZZXMempoolTilesLayout","js/layout.js",5],
    ["ZZXMempoolTilesThemes","js/themes.js",3],
    ["ZZXMempoolTilesRenderer","js/renderer.js",5],
    ["ZZXMempoolTilesAnimation","js/animation.js",1],
    ["ZZXMempoolTilesReaderStore","js/reader-store.js",1],
    ["ZZXMempoolTilesTxFetcher","js/txfetcher.js",2],
    ["ZZXMempoolTilesInspector","js/inspector.js",3]
  ];

  const SCALE_MODES=new Set(["value","vsize","fee","feerate"]);
  const COLOR_MODES=new Set(["fee-vbytes","fee","absolute-fee","vsize","type","age"]);
  const SORT_MODES=new Set(["priority","fee","size","value","age","rbf","type","shuffle"]);

  function getPath(path){
    return path.split(".").reduce((object,key)=>object?.[key],W);
  }

  function core(){
    return W.ZZXWidgetsCore||W.ZZXWidgetCore||W.ZZXWidgets||W.ZZXAPI||W.ZZX||{};
  }

  function widgetBase(runtimeCore=core()){
    if(typeof runtimeCore?.widgetBase==="function"){
      try{
        const value=String(runtimeCore.widgetBase(ID)||"").replace(/\/+$/g,"");
        if(value)return value;
      }catch(_){}
    }
    return "/__partials/widgets/mempool-tiles";
  }

  function moduleUrl(relative,minimumVersion){
    const raw=`${widgetBase()}/${String(relative).replace(/^\/+/,"")}`;
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    return `${resolved}${resolved.includes("?")?"&":"?"}zzxmod=${minimumVersion}`;
  }

  function loadScript(src,key,minimumVersion){
    if(getPath(key)?.__version>=minimumVersion)return Promise.resolve(true);
    const tagKey=String(key).replace(/[^a-z0-9_-]/gi,"_");
    const selector=`script[data-mt-module="${tagKey}"][data-mt-version="${minimumVersion}"]`;
    const existing=D.querySelector(selector);

    if(existing){
      return new Promise(resolve=>{
        if(getPath(key)?.__version>=minimumVersion){resolve(true);return}
        const done=()=>resolve(getPath(key)?.__version>=minimumVersion);
        existing.addEventListener("load",done,{once:true});
        existing.addEventListener("error",done,{once:true});
        W.setTimeout(done,6000);
      });
    }

    return new Promise(resolve=>{
      const node=D.createElement("script");
      node.src=src;
      node.defer=true;
      node.setAttribute("data-mt-module",tagKey);
      node.setAttribute("data-mt-version",String(minimumVersion));
      node.addEventListener("load",()=>resolve(getPath(key)?.__version>=minimumVersion),{once:true});
      node.addEventListener("error",()=>resolve(false),{once:true});
      (D.head||D.documentElement).appendChild(node);
    });
  }

  async function dependencies(){
    const results=await Promise.all(MODULES.map(async([path,relative,minimumVersion])=>{
      if(getPath(path)?.__version>=minimumVersion)return {path,relative,minimumVersion,loaded:true};
      const loaded=await loadScript(moduleUrl(relative,minimumVersion),path,minimumVersion);
      return {path,relative,minimumVersion,loaded};
    }));

    const failed=results.find(result=>
      !result.loaded||getPath(result.path)?.__version<result.minimumVersion
    );

    if(failed){
      throw new Error(`${failed.relative} did not register ${failed.path} v${failed.minimumVersion}`);
    }
  }

  function storageGet(key,fallback=""){
    try{
      const value=W.localStorage?.getItem(key);
      return value==null?fallback:value;
    }catch(_){return fallback}
  }

  function storageSet(key,value){
    try{W.localStorage?.setItem(key,String(value))}catch(_){}
  }

  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};
  const fmtInt=value=>Number.isFinite(finite(value))?Math.round(finite(value)).toLocaleString():"—";
  const fmtBtcSats=(value,digits=8)=>Number.isFinite(finite(value))
    ? `${(finite(value)/1e8).toLocaleString(undefined,{maximumFractionDigits:digits})} BTC`:"— BTC";
  const fmtRate=value=>Number.isFinite(finite(value))
    ? `${finite(value).toFixed(finite(value)<1?3:1)} sat/vB`:"— sat/vB";

  function median(values){
    const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    const middle=Math.floor(rows.length/2);
    return rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;
  }

  function downloadJSON(filename,data){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=D.createElement("a");
    link.href=url;
    link.download=filename;
    link.hidden=true;
    D.body.append(link);
    link.click();
    link.remove();
    W.setTimeout(()=>URL.revokeObjectURL(url),1000);
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
    const updated=root.querySelector("[data-mt-updated]");

    if(!canvas||!stage||!summary||!sub)throw new Error("Mempool Tiles markup is incomplete");

    const listenerAbort=typeof AbortController==="function"?new AbortController():null;
    const listenerOptions=listenerAbort?{signal:listenerAbort.signal}:undefined;
    let model=null;
    let layout=null;
    let priorLayout=null;
    let selectedTxid="";
    let hoverTxid="";
    let scaleMode=storageGet("zzx.mempoolTiles.scale","value");
    let colorMode=storageGet("zzx.mempoolTiles.color","fee-vbytes");
    let sortMode=storageGet("zzx.mempoolTiles.sort","priority");
    let themeId=storageGet("zzx.mempoolTiles.theme","zzx-default");
    let shuffleSeed=Number(storageGet("zzx.mempoolTiles.shuffleSeed",Date.now()))||Date.now();
    let aborter=null;
    let live=null;
    let liveSnapshot=null;
    let pendingLiveSnapshot=null;
    let fallbackCursor=0;
    let animationCancel=null;
    let hydrateTimer=0;
    let hydrateCount=0;
    let pointerFrame=0;
    let paused=false;
    let destroyed=false;
    let readGeneration=0;

    if(!SCALE_MODES.has(scaleMode))scaleMode="value";
    if(!COLOR_MODES.has(colorMode))colorMode="fee-vbytes";
    if(!SORT_MODES.has(sortMode))sortMode="priority";

    await W.ZZXMempoolTilesThemes.load();
    if(!W.ZZXMempoolTilesThemes.list().some(theme=>theme.id===themeId))themeId="zzx-default";

    const sourceConfig=()=>model?.cfg||W.ZZXMempoolTilesSources.get(runtimeCore);
    const readerLimit=()=>Math.max(1,Number(sourceConfig().readerLimit)||64);

    function populateThemes(){
      const select=root.querySelector("[data-mt-theme-select]");
      if(!select)return;
      const groups=new Map();
      for(const theme of W.ZZXMempoolTilesThemes.list()){
        const group=theme.group||"Other";
        if(!groups.has(group))groups.set(group,[]);
        groups.get(group).push(theme);
      }
      select.replaceChildren();
      for(const [name,themes] of groups){
        const optionGroup=D.createElement("optgroup");
        optionGroup.label=name;
        for(const theme of themes){
          const option=D.createElement("option");
          option.value=theme.id;
          option.textContent=theme.name;
          optionGroup.append(option);
        }
        select.append(optionGroup);
      }
      select.value=themeId;
    }

    function renderLegend(){
      const host=root.querySelector("[data-mt-legend]");
      if(!host)return;
      const theme=W.ZZXMempoolTilesThemes.get(themeId);
      const colors=theme.colors.feeScale||[];
      const labels=["0","0.5","1","2","5","10","25","50","100+"];
      host.replaceChildren();
      labels.forEach((label,index)=>{
        const step=D.createElement("span");
        step.className="mt-legend-step";
        const swatch=D.createElement("i");
        swatch.style.background=colors[index]||theme.colors.pending;
        const caption=D.createElement("span");
        caption.textContent=`${label} sat/vB`;
        step.append(swatch,caption);
        host.append(step);
      });
    }

    function applyTheme(){
      W.ZZXMempoolTilesThemes.apply(root,themeId);
      const select=root.querySelector("[data-mt-theme-select]");
      if(select)select.value=themeId;
      renderLegend();
    }

    function setActive(){
      root.querySelectorAll("[data-mt-scale]").forEach(button=>{
        button.classList.toggle("is-active",button.dataset.mtScale===scaleMode);
      });
      const color=root.querySelector("[data-mt-color]");
      const sort=root.querySelector("[data-mt-sort]");
      if(color)color.value=colorMode;
      if(sort)sort.value=sortMode;
    }

    function setConnectionState(state,detail=""){
      const normalized=String(state||"offline").toLowerCase();
      const isLive=normalized==="live";
      const label=isLive?"live ws":normalized==="rest"?"REST":normalized;
      if(liveState){liveState.textContent=label;liveState.title=detail}
      if(headerStatus){
        headerStatus.textContent=paused?"paused":label;
        headerStatus.title=detail;
        headerStatus.setAttribute("data-status",paused?"warn":isLive?"ok":normalized==="offline"||normalized==="error"?"error":"warn");
      }
    }

    function redraw(){
      if(!layout)return;
      W.ZZXMempoolTilesRenderer.draw(canvas,layout,{
        fromLayout:null,
        progress:1,
        selectedTxid,
        hoverTxid,
        colorMode,
        themeId
      });
    }

    function renderStats(){
      if(!model||!layout)return;
      const txs=model.candidate.length;
      const rates=model.candidate.map(tx=>Number(tx.packageFeeRate??tx.feeRate)).filter(Number.isFinite);
      const med=median(rates);
      const sourceLabel=model.candidateSource==="live"?"LIVE PROJECTED BLOCK":
        model.candidateSource==="full-feed"?"FULL MEMPOOL FEED":"REST CANDIDATE BUILD";
      const scaleLabel={value:"BTC output",vsize:"virtual bytes",fee:"absolute fee",feerate:"fee rate"}[scaleMode];
      const colorLabel={
        "fee-vbytes":"fee rate × vBytes",fee:"fee rate","absolute-fee":"absolute fee",
        vsize:"vBytes",type:"transaction type",age:"mempool age"
      }[colorMode];

      summary.textContent=`${fmtInt(txs)} transactions · candidate #${Number.isFinite(model.tipHeight)?fmtInt(model.tipHeight+1):"next"}`;
      sub.textContent=`${sourceLabel} · square area ${scaleLabel} · color ${colorLabel} · ${sortMode} topology`;

      const stats={
        txs:fmtInt(txs),
        vsize:`${(model.candidateVsize/1e6).toFixed(3)} vMB`,
        value:fmtBtcSats(model.candidateValue,8),
        fees:fmtBtcSats(model.candidateFees,8),
        fee:`${fmtRate(med)} median`,
        fill:`${Math.min(125,model.candidateVsize/Math.max(1,model.targetVbytes)*100).toFixed(1)}% block`
      };

      for(const [key,value] of Object.entries(stats)){
        const node=root.querySelector(`[data-mt-stat="${key}"]`);
        if(node)node.textContent=value;
      }

      const leafNode=root.querySelector("[data-mt-leaves]");
      const valueCoverage=root.querySelector("[data-mt-value-coverage]");
      const coverageValue=root.querySelector("[data-mt-coverage-value]");
      const depth=root.querySelector("[data-mt-depth]");
      if(leafNode)leafNode.textContent=`${fmtInt(layout.leafCount)} leaves${layout.fragmentCount?` · ${layout.fragmentCount} dust continuation`:""}`;
      if(valueCoverage)valueCoverage.textContent=`${(Math.max(0,Math.min(1,model.candidateValueCoverage||0))*100).toFixed(1)}% values resolved`;
      if(coverageValue)coverageValue.textContent=`${(layout.coverage*100).toFixed(3)}%`;
      if(depth)depth.textContent=fmtInt(layout.maxDepth);
      if(blockLabel)blockLabel.textContent=Number.isFinite(model.tipHeight)?`NEXT BLOCK · ${fmtInt(model.tipHeight+1)}`:"NEXT BLOCK";
      if(coverage)coverage.textContent=`${fmtInt(txs)} real candidate TX · ${fmtInt(layout.leafCount)} square leaves · ${(layout.coverage*100).toFixed(3)}% atlas coverage · no empty cells`;
      if(transport)transport.textContent=model.liveActive?"WebSocket projected block":model.fullFeedActive?"configured full feed":"REST progressive hydration";
      if(meta)meta.textContent=`square-only atlas · ${W.ZZXMempoolTilesThemes.get(themeId).name} · ${scaleLabel} area · ${colorLabel} color · persistent readers local to this browser`;
      if(updated)updated.textContent=`updated ${new Date(model.liveUpdatedAt||model.fetchedAt||Date.now()).toLocaleTimeString()}`;
    }

    function layoutNow(animate=true){
      if(!model||paused)return;
      const next=W.ZZXMempoolTilesLayout.build(model,{scaleMode,sortMode,seed:shuffleSeed});
      priorLayout=layout;
      layout=next;
      animationCancel?.();
      animationCancel=null;

      const reduced=typeof W.matchMedia==="function"&&W.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if(!animate||reduced||!priorLayout){
        redraw();
      }else{
        animationCancel=W.ZZXMempoolTilesAnimation.run(340,progress=>{
          W.ZZXMempoolTilesRenderer.draw(canvas,layout,{
            fromLayout:priorLayout,
            progress,
            selectedTxid,
            hoverTxid,
            colorMode,
            themeId
          });
        });
      }
      renderStats();
    }

    function pointerTile(event){
      if(!layout)return null;
      const rect=canvas.getBoundingClientRect();
      return W.ZZXMempoolTilesLayout.hit(
        layout,
        (event.clientX-rect.left)/Math.max(1,rect.width),
        (event.clientY-rect.top)/Math.max(1,rect.height)
      );
    }

    function showTooltip(event,tile){
      if(!tooltip||!tile){if(tooltip)tooltip.hidden=true;return}
      const rect=stage.getBoundingClientRect();
      tooltip.replaceChildren();
      const title=D.createElement("strong");
      title.textContent=`${String(tile.txid||"").slice(0,18)}…${String(tile.txid||"").slice(-8)}`;
      const line=D.createElement("span");
      const parts=[
        fmtBtcSats(tile.valueSats,8),
        Number.isFinite(finite(tile.vsize))?`${fmtInt(tile.vsize)} vB`:"vB pending",
        fmtRate(tile.packageFeeRate??tile.feeRate),
        Number.isFinite(finite(tile.feeSats))?`${fmtInt(tile.feeSats)} sat fee`:"fee pending"
      ];
      line.textContent=parts.join(" · ");
      tooltip.append(title,line);
      tooltip.hidden=false;
      const width=tooltip.offsetWidth||300;
      const height=tooltip.offsetHeight||58;
      tooltip.style.left=`${Math.max(6,Math.min(rect.width-width-6,event.clientX-rect.left+12))}px`;
      tooltip.style.top=`${Math.max(6,Math.min(rect.height-height-6,event.clientY-rect.top+12))}px`;
    }

    async function refreshReaders(){
      const records=await W.ZZXMempoolTilesReaderStore.list(readerLimit());
      if(!destroyed)W.ZZXMempoolTilesInspector.renderReaderList(root,records,selectedTxid);
      return records;
    }

    async function openStored(txid){
      const record=await W.ZZXMempoolTilesReaderStore.get(txid);
      if(!record)return false;
      selectedTxid=txid;
      await W.ZZXMempoolTilesReaderStore.put({...record,lastViewedAt:Date.now()},readerLimit());
      if(record.analysis)W.ZZXMempoolTilesInspector.render(root,record.analysis,{persisted:true});
      else W.ZZXMempoolTilesInspector.renderSummary(root,record);
      redraw();
      await refreshReaders();
      return true;
    }

    async function inspect(txid,{force=false}={}){
      const id=String(txid||"").trim().toLowerCase();
      if(!W.ZZXMempoolTilesReaderStore.valid(id))return false;
      const generation=++readGeneration;
      selectedTxid=id;
      redraw();

      const stored=await W.ZZXMempoolTilesReaderStore.get(id);
      if(!force&&stored?.analysis){
        await openStored(id);
        return true;
      }

      const tile=layout?.byTxid?.get(id)||model?.byTxid?.get(id)||stored?.tile||null;
      await W.ZZXMempoolTilesReaderStore.pin(id,tile,readerLimit());
      W.ZZXMempoolTilesInspector.loading(root,id);
      await refreshReaders();

      try{
        if(force)W.ZZXMempoolTilesTxFetcher.forget(id);
        const analysis=await W.ZZXMempoolTilesTxFetcher.full(runtimeCore,id,{
          force,
          tipHeight:model?.tipHeight,
          priceUsd:model?.priceUsd,
          tile
        });
        await W.ZZXMempoolTilesReaderStore.save(analysis,tile,readerLimit());

        if(model?.byTxid?.has(id)){
          model=W.ZZXMempoolTilesModel.mergeDetails(model,[analysis.tx]);
          if(liveSnapshot?.transactions?.length)model=W.ZZXMempoolTilesModel.mergeLive(model,liveSnapshot);
          layoutNow(true);
        }

        if(!destroyed&&generation===readGeneration&&selectedTxid===id){
          W.ZZXMempoolTilesInspector.render(root,analysis,{persisted:false});
          redraw();
        }
        await refreshReaders();
        return true;
      }catch(error){
        await W.ZZXMempoolTilesReaderStore.fail(id,error,readerLimit());
        if(!destroyed&&generation===readGeneration&&selectedTxid===id){
          W.ZZXMempoolTilesInspector.error(root,id,error?.message||error);
        }
        await refreshReaders();
        return false;
      }
    }

    async function hydrate(){
      if(destroyed||paused||!model)return;
      const cfg=sourceConfig();
      if(hydrateCount>=cfg.maxHydratePerSession)return;
      let ids=[];
      let concurrency=cfg.hydrateConcurrency;
      let delay=cfg.hydrateDelayMs;

      if(model.liveActive){
        ids=W.ZZXMempoolTilesModel.pendingCandidateTxids(model,cfg.hydrateBatch);
      }else if(!model.fullFeedActive){
        ids=W.ZZXMempoolTilesModel.pendingUniverseTxids(model,cfg.fallbackHydrateBatch,fallbackCursor);
        concurrency=cfg.fallbackHydrateConcurrency;
        delay=cfg.fallbackHydrateDelayMs;
        fallbackCursor+=cfg.fallbackHydrateBatch;
        if(!ids.length&&fallbackCursor>0){
          fallbackCursor=0;
          ids=W.ZZXMempoolTilesModel.pendingUniverseTxids(model,cfg.fallbackHydrateBatch,0);
        }
      }else{
        ids=W.ZZXMempoolTilesModel.pendingCandidateTxids(model,cfg.hydrateBatch);
      }

      if(!ids.length)return;
      hydrateCount+=ids.length;
      const rows=await W.ZZXMempoolTilesTxFetcher.batch(runtimeCore,ids,{concurrency});
      if(destroyed||paused||!rows.length)return;
      model=W.ZZXMempoolTilesModel.mergeDetails(model,rows);
      if(liveSnapshot?.transactions?.length)model=W.ZZXMempoolTilesModel.mergeLive(model,liveSnapshot);
      layoutNow(true);
      W.clearTimeout(hydrateTimer);
      hydrateTimer=W.setTimeout(hydrate,delay);
    }

    function consumeLive(snapshot){
      liveSnapshot=snapshot;
      if(paused){pendingLiveSnapshot=snapshot;return}
      model=W.ZZXMempoolTilesModel.mergeLive(model,snapshot);
      layoutNow(true);
      W.clearTimeout(hydrateTimer);
      hydrateTimer=W.setTimeout(hydrate,sourceConfig().liveDebounceMs);
    }

    async function refresh(force=false){
      if(paused&&!force)return;
      aborter?.abort();
      aborter=new AbortController();

      try{
        const payload=await W.ZZXMempoolTilesProvider.load(runtimeCore,{signal:aborter.signal,force});
        if(destroyed)return;
        const fresh=W.ZZXMempoolTilesModel.build(payload);
        model=liveSnapshot?.transactions?.length
          ? W.ZZXMempoolTilesModel.mergeLive(fresh,liveSnapshot)
          : fresh;
        layoutNow(Boolean(layout));

        if(!live){
          live=new W.ZZXMempoolTilesLive.LiveNextBlock({
            urls:payload.cfg.websocketUrls,
            reconnectMaxMs:payload.cfg.liveReconnectMaxMs,
            onState:state=>setConnectionState(state.state,state.url||state.detail||""),
            onUpdate:snapshot=>{if(!destroyed)consumeLive(snapshot)}
          });
          if(!live.start())setConnectionState("rest","WebSocket unavailable; using REST hydration");
        }

        W.clearTimeout(hydrateTimer);
        hydrateTimer=W.setTimeout(hydrate,180);
      }catch(error){
        if(error?.name==="AbortError")return;
        setConnectionState("offline",String(error?.message||error));
        summary.textContent=layout?summary.textContent:"Mempool Tiles unavailable";
        sub.textContent=layout?`${sub.textContent} · stale data retained`:String(error?.message||error);
      }
    }

    root.querySelectorAll("[data-mt-scale]").forEach(button=>{
      button.addEventListener("click",()=>{
        scaleMode=button.dataset.mtScale;
        storageSet("zzx.mempoolTiles.scale",scaleMode);
        setActive();
        layoutNow(true);
      },listenerOptions);
    });

    root.querySelector("[data-mt-color]")?.addEventListener("change",event=>{
      colorMode=COLOR_MODES.has(event.target.value)?event.target.value:"fee-vbytes";
      storageSet("zzx.mempoolTiles.color",colorMode);
      redraw();
      renderStats();
    },listenerOptions);

    root.querySelector("[data-mt-sort]")?.addEventListener("change",event=>{
      sortMode=SORT_MODES.has(event.target.value)?event.target.value:"priority";
      if(sortMode==="shuffle"){
        shuffleSeed=Date.now();
        storageSet("zzx.mempoolTiles.shuffleSeed",shuffleSeed);
      }
      storageSet("zzx.mempoolTiles.sort",sortMode);
      layoutNow(true);
    },listenerOptions);

    root.querySelector("[data-mt-theme-select]")?.addEventListener("change",event=>{
      themeId=event.target.value;
      storageSet("zzx.mempoolTiles.theme",themeId);
      applyTheme();
      redraw();
      renderStats();
    },listenerOptions);

    canvas.addEventListener("pointermove",event=>{
      if(pointerFrame)W.cancelAnimationFrame(pointerFrame);
      pointerFrame=W.requestAnimationFrame(()=>{
        pointerFrame=0;
        const tile=pointerTile(event);
        const next=tile?.txid||"";
        showTooltip(event,tile);
        if(next!==hoverTxid){
          hoverTxid=next;
          canvas.style.cursor=next?"pointer":"default";
          redraw();
        }
      });
    },listenerOptions);

    canvas.addEventListener("pointerleave",()=>{
      if(tooltip)tooltip.hidden=true;
      hoverTxid="";
      canvas.style.cursor="default";
      redraw();
    },listenerOptions);

    canvas.addEventListener("click",event=>{
      const tile=pointerTile(event);
      if(tile?.txid)inspect(tile.txid);
    },listenerOptions);

    stage.addEventListener("keydown",event=>{
      const tiles=(layout?.tiles||[]).filter(tile=>!tile.__fragment).sort((a,b)=>a.__sortIndex-b.__sortIndex);
      if(!tiles.length)return;
      if(event.key==="Enter"&&hoverTxid){event.preventDefault();inspect(hoverTxid);return}
      if(!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp"].includes(event.key))return;
      event.preventDefault();
      let index=tiles.findIndex(tile=>tile.txid===hoverTxid);
      if(index<0)index=0;
      index=(event.key==="ArrowRight"||event.key==="ArrowDown")
        ?(index+1)%tiles.length:(index-1+tiles.length)%tiles.length;
      hoverTxid=tiles[index].txid;
      redraw();
    },listenerOptions);

    root.querySelector("[data-mt-pause]")?.addEventListener("click",event=>{
      paused=!paused;
      event.currentTarget.textContent=paused?"Resume":"Pause";
      event.currentTarget.setAttribute("aria-pressed",String(paused));
      setConnectionState(paused?"paused":liveSnapshot?"live":"rest",paused?"visual updates paused by user":"visual updates resumed");
      if(!paused&&pendingLiveSnapshot){
        const snapshot=pendingLiveSnapshot;
        pendingLiveSnapshot=null;
        consumeLive(snapshot);
      }
    },listenerOptions);

    root.querySelector("[data-mt-refresh]")?.addEventListener("click",async()=>{
      paused=false;
      const pause=root.querySelector("[data-mt-pause]");
      if(pause){pause.textContent="Pause";pause.setAttribute("aria-pressed","false")}
      live?.stop();
      live=null;
      liveSnapshot=null;
      pendingLiveSnapshot=null;
      fallbackCursor=0;
      hydrateCount=0;
      setConnectionState("connecting","manual reconnect");
      await refresh(true);
    },listenerOptions);

    root.querySelector("[data-mt-fullscreen]")?.addEventListener("click",async()=>{
      try{
        if(D.fullscreenElement)await D.exitFullscreen();
        else await stage.requestFullscreen();
      }catch(_){}
    },listenerOptions);

    root.querySelector("[data-mt-open-form]")?.addEventListener("submit",event=>{
      event.preventDefault();
      const input=root.querySelector("[data-mt-open-txid]");
      const error=root.querySelector("[data-mt-open-error]");
      const txid=String(input?.value||"").trim().toLowerCase();
      if(!W.ZZXMempoolTilesReaderStore.valid(txid)){
        if(error)error.textContent="Enter one 64-character hexadecimal Bitcoin transaction ID.";
        return;
      }
      if(error)error.textContent="";
      if(input)input.value="";
      inspect(txid);
    },listenerOptions);

    root.querySelector("[data-mt-reader-list]")?.addEventListener("click",async event=>{
      const remove=event.target.closest("[data-mt-reader-remove]");
      if(remove){
        event.stopPropagation();
        const txid=remove.dataset.mtReaderRemove;
        await W.ZZXMempoolTilesReaderStore.remove(txid);
        if(selectedTxid===txid){selectedTxid="";W.ZZXMempoolTilesInspector.clear(root);redraw()}
        await refreshReaders();
        return;
      }
      const chip=event.target.closest("[data-mt-reader-open]");
      if(chip)await openStored(chip.dataset.mtReaderOpen);
    },listenerOptions);

    root.querySelector("[data-mt-reader-list]")?.addEventListener("keydown",event=>{
      if((event.key==="Enter"||event.key===" ")&&event.target.matches("[data-mt-reader-open]")){
        event.preventDefault();
        openStored(event.target.dataset.mtReaderOpen);
      }
    },listenerOptions);

    root.querySelector("[data-mt-inspector-close]")?.addEventListener("click",()=>{
      readGeneration++;
      selectedTxid="";
      W.ZZXMempoolTilesInspector.clear(root);
      redraw();
      refreshReaders();
    },listenerOptions);

    root.querySelector("[data-mt-refresh-reader]")?.addEventListener("click",()=>{
      if(selectedTxid)inspect(selectedTxid,{force:true});
    },listenerOptions);

    root.querySelector("[data-mt-unpin-reader]")?.addEventListener("click",async()=>{
      if(!selectedTxid)return;
      await W.ZZXMempoolTilesReaderStore.remove(selectedTxid);
      selectedTxid="";
      W.ZZXMempoolTilesInspector.clear(root);
      redraw();
      await refreshReaders();
    },listenerOptions);

    root.querySelector("[data-mt-copy-txid]")?.addEventListener("click",async event=>{
      if(!selectedTxid)return;
      try{
        await navigator.clipboard.writeText(selectedTxid);
        event.currentTarget.textContent="Copied";
        W.setTimeout(()=>{if(event.currentTarget)event.currentTarget.textContent="Copy TXID"},1200);
      }catch(_){}
    },listenerOptions);

    root.querySelector("[data-mt-export-readers]")?.addEventListener("click",async()=>{
      const data=await W.ZZXMempoolTilesReaderStore.exportAll();
      downloadJSON(`mempool-tiles-readers-${new Date().toISOString().replace(/[:.]/g,"-")}.json`,data);
    },listenerOptions);

    root.querySelector("[data-mt-clear-readers]")?.addEventListener("click",async()=>{
      if(typeof W.confirm==="function"&&!W.confirm("Clear every locally persisted Mempool Tiles transaction reader?"))return;
      await W.ZZXMempoolTilesReaderStore.clear();
      selectedTxid="";
      W.ZZXMempoolTilesInspector.clear(root);
      redraw();
      await refreshReaders();
    },listenerOptions);

    let resize=null;
    if("ResizeObserver" in W){
      resize=new ResizeObserver(()=>redraw());
      resize.observe(stage);
    }else{
      W.addEventListener("resize",redraw,listenerOptions);
    }

    populateThemes();
    applyTheme();
    setActive();
    setConnectionState("connecting","initializing projected next-block feed");

    const records=await refreshReaders();
    const lastId=W.ZZXMempoolTilesReaderStore.last();
    if(lastId&&records.some(record=>record.txid===lastId))await openStored(lastId);

    await refresh(true);
    const interval=W.setInterval(()=>refresh(false),10000);

    root.__mempoolTilesDestroy=()=>{
      destroyed=true;
      readGeneration++;
      W.clearInterval(interval);
      W.clearTimeout(hydrateTimer);
      if(pointerFrame)W.cancelAnimationFrame(pointerFrame);
      animationCancel?.();
      aborter?.abort();
      live?.stop();
      resize?.disconnect?.();
      listenerAbort?.abort();
      root.__mempoolTilesMounted=false;
    };
  }

  async function bootRoot(root,mountedCore){
    try{
      await dependencies();
      await mount(root,mountedCore);
    }catch(error){
      console.error("[mempool-tiles]",error);
      const summary=root?.querySelector?.("[data-mt-summary]");
      const status=root?.querySelector?.("[data-mt-status]");
      if(summary)summary.textContent="Mempool Tiles failed to initialize";
      if(status){
        status.textContent="error";
        status.setAttribute("data-status","error");
        status.title=String(error?.message||error);
      }
      throw error;
    }
  }

  function fallbackBoot(){
    const run=()=>D.querySelectorAll('[data-widget-root="mempool-tiles"]').forEach(root=>bootRoot(root,core()));
    if(D.readyState==="loading")D.addEventListener("DOMContentLoaded",run,{once:true});
    else run();
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,bootRoot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,bootRoot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,bootRoot);
  else fallbackBoot();
})();
