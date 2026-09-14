// __partials/widgets/mempool-mosaic/widget.js
// v3.0.0 — exact-cover square mosaic + persistent reader archive + live WS + REST fallback
(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.__ZZX_MEMPOOL_MOSAIC_WIDGET_V30__)return;
  W.__ZZX_MEMPOOL_MOSAIC_WIDGET_V30__=true;

  const MODULES=[
    ["ZZXMempoolMosaicSources","js/sources.js",3],
    ["ZZXMempoolMosaicFetch","js/fetch.js",3],
    ["ZZXMempoolMosaicProvider","js/provider.js",3],
    ["ZZXMempoolMosaicLive","js/live.js",3],
    ["ZZXMempoolMosaicAnalyzer","js/analyzer.js",3],
    ["ZZXMempoolMosaicModel","js/model.js",3],
    ["ZZXMempoolMosaicScaler","js/scaler.js",3],
    ["ZZXMempoolMosaicSorter","js/sorter.js",3],
    ["ZZXMempoolMosaicPacker","js/mosaic-packer.js",3],
    ["ZZXMempoolMosaicLayout","js/layout.js",6],
    ["ZZXMempoolMosaicThemes","js/themes.js",3],
    ["ZZXMempoolMosaicRenderer","js/renderer.js",6],
    ["ZZXMempoolMosaicTxFetcher","js/txfetcher.js",3],
    ["ZZXMempoolMosaicReaderStore","js/reader-store.js",3],
    ["ZZXMempoolMosaicInspector","js/inspector.js",3]
  ];

  function getPath(path){
    return path.split(".").reduce((obj,key)=>obj?.[key],W);
  }

  const ID="mempool-mosaic";

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

    return "/__partials/widgets/mempool-mosaic";
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
      `script[data-mm-module="${tagKey}"][data-mm-version="${minimumVersion}"]`;

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
      node.setAttribute("data-mm-module",tagKey);
      node.setAttribute("data-mm-version",String(minimumVersion));

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
    if(!root||root.__mempoolMosaicMounted)return;
    root.__mempoolMosaicMounted=true;

    const runtimeCore=mountedCore||core();
    const canvas=root.querySelector("[data-mm-canvas]");
    const stage=root.querySelector("[data-mm-stage]");
    const summary=root.querySelector("[data-mm-summary]");
    const sub=root.querySelector("[data-mm-sub]");
    const liveState=root.querySelector("[data-mm-live-state]");
    const headerStatus=root.querySelector("[data-mm-status]");
    const blockLabel=root.querySelector("[data-mm-block-label]");
    const tooltip=root.querySelector("[data-mm-tooltip]");
    const coverage=root.querySelector("[data-mm-coverage]");
    const transport=root.querySelector("[data-mm-transport]");
    const meta=root.querySelector("[data-mm-meta]");
    const gridStat=root.querySelector("[data-mm-grid]");
    const valueCoverageStat=root.querySelector("[data-mm-value-coverage]");
    const vizCount=root.querySelector("[data-mm-viz-count]");
    const tipStat=root.querySelector("[data-mm-tip]");
    const feeRangeStat=root.querySelector("[data-mm-fee-range]");
    const backlogStat=root.querySelector("[data-mm-backlog]");
    const sourceStat=root.querySelector("[data-mm-source]");
    const updatedStat=root.querySelector("[data-mm-updated]");
    const readerHistory=root.querySelector("[data-mm-reader-history]");
    const readerCount=root.querySelector("[data-mm-reader-count]");

    let model=null;
    let layout=null;
    let selectedTxid="";
    let hoverTxid="";
    let scaleMode=storageGet("zzx.mempoolMosaic.scale")||"value";
    let colorMode=storageGet("zzx.mempoolMosaic.color")||"fee-vb";
    let sortMode=storageGet("zzx.mempoolMosaic.sort")||"mosaic";
    let themeId=storageGet("zzx.mempoolMosaic.theme")||"zzx-default";
    let shuffleSeed=Number(storageGet("zzx.mempoolMosaic.shuffleSeed"))||Date.now();
    let aborter=null;
    let live=null;
    let liveSnapshot=null;
    let fallbackCursor=0;
    let hydrateTimer=0;
    let hydrateCount=0;
    let destroyed=false;
    let sharedUnsubscribe=null;
    let lastConnectionState="connecting";

    await W.ZZXMempoolMosaicThemes.load();
    W.ZZXMempoolMosaicThemes.set(themeId);

    const themeSelect=root.querySelector("[data-mm-theme]");
    if(themeSelect){
      themeSelect.replaceChildren();
      for(const theme of W.ZZXMempoolMosaicThemes.list()){
        const option=D.createElement("option");
        option.value=theme.id;
        option.textContent=theme.name;
        themeSelect.appendChild(option);
      }
      themeSelect.value=W.ZZXMempoolMosaicThemes.get().id;
      themeId=themeSelect.value;
    }

    function setActive(){
      root.querySelectorAll("[data-mm-scale]").forEach(button=>{
        button.classList.toggle("is-active",button.dataset.mmScale===scaleMode);
      });

      root.querySelectorAll("[data-mm-color]").forEach(button=>{
        button.classList.toggle("is-active",button.dataset.mmColor===colorMode);
      });

      const select=root.querySelector("[data-mm-sort]");
      if(select)select.value=sortMode;

      const theme=root.querySelector("[data-mm-theme]");
      if(theme)theme.value=themeId;
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

      const next=W.ZZXMempoolMosaicLayout.build(
        model,
        {
          scaleMode,
          sortMode,
          seed:shuffleSeed
        }
      );

      layout=next;

      // Exact-cover geometry is drawn atomically. Interpolating square geometry
      // would create transient holes/overlap and violate the Mosaic contract.
      W.ZZXMempoolMosaicRenderer.draw(
        canvas,
        layout,
        {
          selectedTxid,
          hoverTxid,
          colorMode
        }
      );

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
        `${fmtInt(txs)} TX · next-block square mosaic`;

      sub.textContent=
        `${sourceLabel} · area ${scaleMode==="vsize"?"vB":scaleMode==="value"?"BTC amount":"sat/vB"} · color ${colorMode==="fee-vb"?"fee × vB":colorMode==="fee"?"fee rate":"type"} · neighborhood ${sortMode}`;

      const stats={
        txs:`${fmtInt(txs)} TX`,
        vsize:`${(model.candidateVsize/1e6).toFixed(3)} vMB`,
        value:fmtBtc(model.candidateValue),
        fee:fmtRate(med),
        fill:`${Math.min(125,(model.candidateVsize/Math.max(1,model.targetVbytes)*100)).toFixed(1)}% block`
      };

      for(const [key,value] of Object.entries(stats)){
        const node=root.querySelector(`[data-mm-stat="${key}"]`);
        if(node)node.textContent=value;
      }

      blockLabel.textContent=
        Number.isFinite(model.tipHeight)
          ? `NEXT BLOCK · ${fmtInt(model.tipHeight+1)}`
          : "NEXT BLOCK";

      if(gridStat){
        const fragments=Number(layout.fragmentCount)||0;
        gridStat.textContent=fragments
          ? `${fmtInt(layout.leafCount)} square mosaic cells · ${fmtInt(fragments)} linked fragments · 100% packed`
          : `${fmtInt(layout.leafCount)} square mosaic cells · 100% packed`;
      }

      if(valueCoverageStat){
        valueCoverageStat.textContent=`${(Math.max(0,Math.min(1,model.candidateValueCoverage||0))*100).toFixed(1)}% values resolved`;
      }

      if(vizCount){
        const fragments=Number(layout.fragmentCount)||0;
        vizCount.textContent=`${fmtInt(txs)} real TX · ${fmtInt(layout.leafCount)} mosaic cells${fragments?` · ${fmtInt(fragments)} linked fragments`:""} · 100% cover`;
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
        const fragments=Number(layout.fragmentCount)||0;
        coverage.textContent=`${fmtInt(txs)} real candidate TX · ${fill.toFixed(1)}% projected block vsize · 100% square mosaic${fragments?` · ${fmtInt(fragments)} geometry fragments linked to real TXs`:""}`;
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
        meta.textContent=`real projected-next-block transactions · square-only exact cover · ${scaleMode} area · ${colorMode} color · ${sortMode} neighborhoods · ${W.ZZXMempoolMosaicThemes.get().name}`;
      }
    }

    function redraw(){
      if(!layout)return;
      W.ZZXMempoolMosaicRenderer.draw(
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
      return W.ZZXMempoolMosaicLayout.hit(layout,nx,ny);
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

    function renderReaderError(txid,error){
      W.ZZXMempoolMosaicInspector.loading(root,txid);
      const body=root.querySelector("[data-mm-kv-grid]");
      body.innerHTML="";
      const row=D.createElement("div");
      row.className="mm-kv";
      const dt=D.createElement("dt");
      dt.textContent="Status";
      const dd=D.createElement("dd");
      dd.textContent=String(error?.message||error||"Transaction read failed");
      row.append(dt,dd);
      body.appendChild(row);
    }

    async function renderReaderHistory(){
      if(!readerHistory)return;
      const allRows=await W.ZZXMempoolMosaicReaderStore.list(64);
      const rows=allRows.slice(0,16);
      if(destroyed)return;

      readerHistory.replaceChildren();
      if(readerCount)readerCount.textContent=`${fmtInt(allRows.length)} saved`;

      if(!rows.length){
        const empty=D.createElement("span");
        empty.className="mm-reader-history__empty";
        empty.textContent="No saved transaction readers yet.";
        readerHistory.appendChild(empty);
        return;
      }

      for(const record of rows){
        const button=D.createElement("button");
        button.type="button";
        button.className="mm-reader-chip";
        button.dataset.mmReaderTxid=record.txid;
        button.title=record.txid;

        const id=D.createElement("strong");
        id.textContent=`${record.txid.slice(0,12)}…${record.txid.slice(-8)}`;
        const detail=D.createElement("span");
        const tile=record.tile||{};
        const rate=Number(tile.packageFeeRate??tile.feeRate);
        const bits=[record.status||"saved"];
        if(Number.isFinite(rate))bits.push(`${rate.toFixed(rate<1?3:1)} sat/vB`);
        detail.textContent=bits.join(" · ");
        button.append(id,detail);
        button.addEventListener("click",()=>inspect(record.txid));
        readerHistory.appendChild(button);
      }
    }

    async function restoreLastReader(){
      const txid=W.ZZXMempoolMosaicReaderStore.last();
      if(!txid)return;
      const record=await W.ZZXMempoolMosaicReaderStore.get(txid);
      if(destroyed||!record)return;

      selectedTxid=txid;
      if(record.analysis){
        W.ZZXMempoolMosaicInspector.render(root,record.analysis);
      }else if(record.error){
        renderReaderError(txid,record.error);
      }else{
        W.ZZXMempoolMosaicInspector.loading(root,txid);
      }
      redraw();
    }

    async function exportReaderArchive(){
      const payload=await W.ZZXMempoolMosaicReaderStore.exportAll();
      if(destroyed)return;
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=D.createElement("a");
      a.href=url;
      a.download=`mempool-mosaic-readers-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
      a.hidden=true;
      D.body.appendChild(a);
      a.click();
      a.remove();
      W.setTimeout(()=>URL.revokeObjectURL(url),0);
    }

    async function inspect(txid){
      const id=String(txid||"");
      if(!W.ZZXMempoolMosaicReaderStore.valid(id))return;

      selectedTxid=id;
      redraw();

      const tile=layout?.byTxid?.get(id) || model?.candidate?.find(row=>row.txid===id) || null;
      const cached=await W.ZZXMempoolMosaicReaderStore.get(id);
      if(destroyed||selectedTxid!==id)return;

      if(cached?.analysis){
        W.ZZXMempoolMosaicInspector.render(root,cached.analysis);
      }else{
        W.ZZXMempoolMosaicInspector.loading(root,id);
      }

      await W.ZZXMempoolMosaicReaderStore.pin(id,tile,64);
      renderReaderHistory().catch(()=>{});

      try{
        const analysis=await W.ZZXMempoolMosaicTxFetcher.full(
          runtimeCore,
          id,
          {
            tipHeight:model?.tipHeight,
            priceUsd:model?.priceUsd
          }
        );

        await W.ZZXMempoolMosaicReaderStore.save(analysis,tile,64);
        renderReaderHistory().catch(()=>{});

        if(destroyed||selectedTxid!==id)return;

        W.ZZXMempoolMosaicInspector.render(root,analysis);

        if(model){
          model=W.ZZXMempoolMosaicModel.mergeDetails(
            model,
            [analysis.tx]
          );
          layoutNow(true);
        }
      }catch(error){
        await W.ZZXMempoolMosaicReaderStore.fail(id,error,64).catch(()=>{});
        renderReaderHistory().catch(()=>{});
        if(destroyed||selectedTxid!==id)return;
        renderReaderError(id,error);
      }
    }

    async function hydrate(){
      if(destroyed||!model)return;

      const cfg=
        model.cfg ||
        W.ZZXMempoolMosaicSources.get(runtimeCore);

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
          W.ZZXMempoolMosaicModel.pendingCandidateTxids(
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
          W.ZZXMempoolMosaicModel.pendingUniverseTxids(
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
            W.ZZXMempoolMosaicModel.pendingUniverseTxids(
              model,
              cfg.fallbackHydrateBatch,
              0
            );
        }
      }else{
        ids=
          W.ZZXMempoolMosaicModel.pendingCandidateTxids(
            model,
            cfg.hydrateBatch
          );
      }

      if(!ids.length)return;

      hydrateCount+=ids.length;

      const rows=
        await W.ZZXMempoolMosaicTxFetcher.batch(
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
        W.ZZXMempoolMosaicModel.mergeDetails(
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
          W.ZZXMempoolMosaicModel.mergeLive(
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

      const base=W.ZZXMempoolMosaicModel.build({
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

      return W.ZZXMempoolMosaicModel.mergeLive(
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
          __zzxMosaicLive:true
        }));

      if(!rows.length)return;
      if(model?.liveActive&&model.candidate.length>=rows.length)return;

      const cfg=W.ZZXMempoolMosaicSources.get(
        runtimeCore,
        snapshot?.source||""
      );

      const base=W.ZZXMempoolMosaicModel.build({
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

      model=W.ZZXMempoolMosaicModel.mergeLive(
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
      // Optional integration only. This widget never loads shared scripts on
      // its own, so one lazy widget cannot fan out into more network requests.
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

      live=new W.ZZXMempoolMosaicLive.LiveNextBlock({
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
            ? W.ZZXMempoolMosaicModel.mergeLive(model,snapshot)
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
        const payload=await W.ZZXMempoolMosaicProvider.load(
          runtimeCore,
          {
            signal:aborter.signal,
            force
          }
        );

        if(destroyed)return;

        const fresh=
          W.ZZXMempoolMosaicModel.build(payload);

        /*
         * v1 rebuilt from REST every ten seconds and accidentally discarded the
         * live transaction objects while keeping only their ids. The field would
         * collapse to a few recent transactions until the next websocket delta.
         */
        model=
          liveSnapshot?.transactions?.length
            ? W.ZZXMempoolMosaicModel.mergeLive(
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

    root.querySelectorAll("[data-mm-scale]").forEach(button=>{
      button.addEventListener("click",()=>{
        scaleMode=button.dataset.mmScale;
        storageSet("zzx.mempoolMosaic.scale",scaleMode);
        setActive();
        layoutNow(true);
      });
    });

    root.querySelectorAll("[data-mm-color]").forEach(button=>{
      button.addEventListener("click",()=>{
        colorMode=button.dataset.mmColor;
        storageSet("zzx.mempoolMosaic.color",colorMode);
        setActive();
        redraw();
        renderStats();
      });
    });

    root.querySelector("[data-mm-sort]")?.addEventListener("change",event=>{
      sortMode=event.target.value;

      if(sortMode==="shuffle"){
        shuffleSeed=Date.now();
        storageSet("zzx.mempoolMosaic.shuffleSeed",shuffleSeed);
      }

      storageSet("zzx.mempoolMosaic.sort",sortMode);
      layoutNow(true);
    });

    root.querySelector("[data-mm-theme]")?.addEventListener("change",event=>{
      themeId=String(event.target.value||"zzx-default");
      W.ZZXMempoolMosaicThemes.set(themeId);
      storageSet("zzx.mempoolMosaic.theme",themeId);
      redraw();
      renderStats();
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

      const navigable=[...layout.byTxid.values()];
      let index=navigable.findIndex(tile=>tile.txid===hoverTxid);
      if(index<0)index=0;

      if(event.key==="ArrowRight"||event.key==="ArrowDown"){
        index=(index+1)%navigable.length;
      }else{
        index=(index-1+navigable.length)%navigable.length;
      }

      hoverTxid=navigable[index].txid;
      redraw();
    });

    root.querySelector("[data-mm-refresh]")?.addEventListener("click",async()=>{
      live?.stop();
      live=null;
      liveSnapshot=null;
      fallbackCursor=0;
      hydrateCount=0;
      setConnectionState("connecting","manual reconnect");
      startLive(W.ZZXMempoolMosaicSources.get(runtimeCore));
      await refresh(true);
    });

    root.querySelector("[data-mm-inspector-close]")?.addEventListener("click",()=>{
      selectedTxid="";
      W.ZZXMempoolMosaicInspector.clear(root);
      redraw();
    });

    root.querySelector("[data-mm-reader-export]")?.addEventListener("click",()=>{
      exportReaderArchive().catch(error=>console.error("[mempool-mosaic reader export]",error));
    });

    root.querySelector("[data-mm-reader-clear]")?.addEventListener("click",async()=>{
      if(typeof W.confirm==="function"&&!W.confirm("Clear the local Mempool Mosaic transaction-reader archive?"))return;
      await W.ZZXMempoolMosaicReaderStore.clear();
      selectedTxid="";
      W.ZZXMempoolMosaicInspector.clear(root);
      redraw();
      await renderReaderHistory();
    });

    const resize=new ResizeObserver(()=>redraw());
    resize.observe(stage);

    setActive();
    setConnectionState("connecting","initializing next-block feed");
    await renderReaderHistory();
    await restoreLastReader();

    const initialCfg=W.ZZXMempoolMosaicSources.get(runtimeCore);
    startLive(initialCfg);
    ensureSharedFallback().catch(()=>{});

    await refresh(true);

    const interval=W.setInterval(
      ()=>refresh(false),
      10000
    );

    root.__mempoolMosaicDestroy=()=>{
      destroyed=true;
      W.clearInterval(interval);
      W.clearTimeout(hydrateTimer);
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
      console.error("[mempool-mosaic]",error);

      if(root){
        const summary=root.querySelector("[data-mm-summary]");
        const status=root.querySelector("[data-mm-status]");
        const live=root.querySelector("[data-mm-live-state]");

        if(summary){
          summary.textContent="Mempool Mosaic failed to initialize";
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
      D.querySelectorAll('[data-widget-root="mempool-mosaic"]')
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
