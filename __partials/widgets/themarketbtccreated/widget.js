// __partials/widgets/themarketbtccreated/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="themarketbtccreated";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function set(root,sel,value){
    const el=q(root,sel);
    if(el)el.textContent=String(value??"—");
  }

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function int(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? Math.trunc(n).toLocaleString()
      : "—";
  }

  function usd(v,digits=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          minimumFractionDigits:digits,
          maximumFractionDigits:digits
        })
      : "—";
  }

  function usd0(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:0
        })
      : "—";
  }

  function fixed(v,digits=8){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          minimumFractionDigits:digits,
          maximumFractionDigits:digits
        })
      : "—";
  }

  function pct(v,digits=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${n.toFixed(digits)}%`
      : "—";
  }

  function date(value){
    const d=new Date(String(value||""));
    if(!Number.isFinite(d.getTime()))return "—";

    return d.toLocaleString(undefined,{
      year:"numeric",
      month:"short",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function countdown(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";

    const total=Math.max(0,Math.trunc(n));
    const days=Math.floor(total/86400);
    const hours=Math.floor((total%86400)/3600);
    const minutes=Math.floor((total%3600)/60);
    const seconds=total%60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  function status(root,label,state){
    const el=q(root,"[data-tmbtc-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/themarketbtccreated";

    for(const [globalName,relative] of [
      ["ZZXTheMarketBTCCreatedSources","js/sources.js"],
      ["ZZXTheMarketBTCCreatedFetch","js/fetch.js"],
      ["ZZXTheMarketBTCCreatedModel","js/model.js"],
      ["ZZXTheMarketBTCCreatedProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;

      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });

      if(!W[globalName]){
        throw new Error(`${relative} did not register ${globalName}`);
      }
    }
  }

  function render(root,state){
    const r=state.result;
    const m=r.model;
    const n=m.network;

    set(
      root,
      "[data-tmbtc-headline]",
      `${usd(m.adjusted)} appraised vs ${usd(m.spot)} spot`
    );

    set(
      root,
      "[data-tmbtc-sub]",
      `baseline ${usd(m.theoretical)} · DeadOPop +${usd0(m.deadLoss)}`
    );

    set(root,"[data-tmbtc-total]",usd(m.adjusted));
    set(root,"[data-tmbtc-actual]",usd(m.spot));
    set(
      root,
      "[data-tmbtc-totaldelta]",
      `${usd(m.totalDeltaUSD)} · ${pct(m.totalDeltaPct)}`
    );
    set(
      root,
      "[data-tmbtc-capture]",
      `${pct(m.capturePct)}`
    );

    set(root,"[data-tmbtc-time]",date(m.updatedAt));
    set(root,"[data-tmbtc-height]",int(n.height));
    set(root,"[data-tmbtc-global]",usd0(m.globalCap));
    set(root,"[data-tmbtc-btccap]",usd0(m.btcCap));
    set(root,"[data-tmbtc-alts]",usd0(m.shitcoinCap));
    set(root,"[data-tmbtc-deado]",usd0(m.deadLoss));

    set(
      root,
      "[data-tmbtc-deadocoverage]",
      `${int(m.deadValued)} valued / ${int(m.deadTotal)} dead · ${pct(m.deadCoverage)} coverage · ${int(m.deadUnvalued)} pending`
    );

    set(root,"[data-tmbtc-price]",usd(m.theoretical));
    set(root,"[data-tmbtc-actual-detail]",usd(m.spot));
    set(
      root,
      "[data-tmbtc-delta]",
      `${usd(m.deltaUSD)} · ${pct(m.deltaPct)}`
    );
    set(root,"[data-tmbtc-invdelta]",pct(m.invDeltaPct));

    set(root,"[data-tmbtc-total-detail]",usd(m.adjusted));
    set(
      root,
      "[data-tmbtc-totaldelta-detail]",
      `${usd(m.totalDeltaUSD)} · ${pct(m.totalDeltaPct)}`
    );
    set(
      root,
      "[data-tmbtc-invtotaldelta]",
      pct(m.invTotalDeltaPct)
    );
    set(
      root,
      "[data-tmbtc-capture-detail]",
      `${pct(m.capturePct)} / ${pct(m.inverseCapturePct)}`
    );
    set(
      root,
      "[data-tmbtc-multiple]",
      `${finite(m.multiple).toFixed(4)}× spot`
    );

    set(root,"[data-tmbtc-supply]",`${fixed(m.supply)} BTC`);
    set(
      root,
      "[data-tmbtc-remaining]",
      `${fixed(n.remaining)} BTC · ${pct(n.remainingPct,6)}`
    );
    set(
      root,
      "[data-tmbtc-yearmine]",
      `${fixed(n.minedYear)} BTC`
    );
    set(
      root,
      "[data-tmbtc-reward]",
      `${fixed(n.reward)} BTC`
    );
    set(
      root,
      "[data-tmbtc-nextreward]",
      `${fixed(n.nextReward)} BTC`
    );
    set(
      root,
      "[data-tmbtc-halving]",
      `#${int(n.nextHalving)} · ${int(n.blocksRemaining)} blocks · ${date(n.halvingAt)}`
    );
    set(
      root,
      "[data-tmbtc-countdown]",
      countdown(n.countdown)
    );

    set(
      root,
      "[data-tmbtc-source]",
      `${r.transport} · schema ${m.schemaVersion} · market ${m.marketSource} · block ${m.blockSource}`
    );

    set(
      root,
      "[data-tmbtc-meta]",
      m.warning
    );

    W.ZZXTheMarketBTCCreatedLatest={
      ...m,
      transport:r.transport,
      stale:!!r.stale,
      source:r.source
    };

    status(
      root,
      r.stale?"cached":"live",
      r.stale?"warn":"ok"
    );
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-tmbtc-refresh]");
    if(button)button.disabled=true;

    try{
      state.result=await W.ZZXTheMarketBTCCreatedProvider.load();
      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      set(
        root,
        "[data-tmbtc-meta]",
        `error: ${String(error?.message||error)}`
      );
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      busy:false,
      timer:null
    };

    root.__zzxTheMarketBTCCreatedState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-tmbtc-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXTheMarketBTCCreatedSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXTheMarketBTCCreatedSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");
      set(
        root,
        "[data-tmbtc-meta]",
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
