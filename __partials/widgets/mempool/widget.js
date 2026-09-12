// __partials/widgets/mempool/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="mempool";

  function q(root,sel){return root?root.querySelector(sel):null}

  function setText(root,sel,value){
    const el=q(root,sel);
    if(el)el.textContent=value;
  }

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function int(v){
    const n=finite(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function num(v,d=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          minimumFractionDigits:0,
          maximumFractionDigits:d
        })
      : "—";
  }

  function btc(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function sats(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${Math.round(n).toLocaleString()} sat`
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

  function rate(v,d=2){
    const n=finite(v);
    return Number.isFinite(n)?`${num(n,d)} sat/vB`:"—";
  }

  function duration(minutes){
    const n=finite(minutes);
    if(!Number.isFinite(n))return "—";

    const total=Math.max(0,n);
    const days=Math.floor(total/1440);
    const hours=Math.floor((total%1440)/60);
    const mins=Math.round(total%60);

    if(days>0)return `${days}d ${hours}h`;
    if(hours>0)return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function status(root,label,state){
    const el=q(root,"[data-mp-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function tone(root,sel,value){
    const el=q(root,sel);
    if(el)el.setAttribute("data-tone",value||"medium");
  }

  async function loadModule(core,relative,version){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool";

    const raw=`${base}/${relative}`;
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    const src=`${resolved}${resolved.includes("?")?"&":"?"}zzxmod=${version}`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.addEventListener("load",resolve,{once:true});
      s.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
  }

  async function ensureModules(core){
    const modules=[
      ["ZZXMempoolProvider","js/provider.js",4],
      ["ZZXMempoolModel","js/model.js",4],
      ["ZZXMempoolChart","js/chart.js",4]
    ];

    for(const [globalName,relative,version] of modules){
      if(Number(W[globalName]?.__version||0)>=version)continue;
      await loadModule(core,relative,version);
    }

    for(const [globalName,_relative,version] of modules){
      if(Number(W[globalName]?.__version||0)<version){
        throw new Error(`${globalName} v${version} failed to load`);
      }
    }
  }

  function draw(root,state){
    if(!state.model)return;

    W.ZZXMempoolChart.draw(
      q(root,"[data-mp-canvas]"),
      state.model.histogram
    );
  }

  function rangeText(candidate){
    const range=Array.isArray(candidate?.feeRange)
      ? candidate.feeRange.filter(Number.isFinite)
      : [];

    if(!range.length)return "range unavailable";

    return `${Math.min(...range).toFixed(1)}–${Math.max(...range).toFixed(1)} sat/vB range`;
  }

  function render(root,state){
    const m=state.model;
    const next=m.nextCandidate;

    setText(root,"[data-mp-vmb]",num(m.vMB,2));
    setText(root,"[data-mp-tx]",int(m.count));
    setText(root,"[data-mp-avg-tx]",
      Number.isFinite(m.avgTxVbytes)
        ? `${int(m.avgTxVbytes)} vB avg`
        : "average size unavailable"
    );

    setText(root,"[data-mp-blocks]",num(m.blockEquivalents,2));
    setText(root,"[data-mp-fees-btc]",btc(m.totalFeeBTC));
    setText(root,"[data-mp-fees-sat]",sats(m.totalFeeSats));
    setText(root,"[data-mp-fees-usd]",usd(m.totalFeeUSD));

    setText(root,"[data-mp-price-basis]",
      Number.isFinite(m.priceUsd)
        ? `${usd(m.priceUsd)} · ${m.priceSource||"shared price"}`
        : "BTC/USD unavailable"
    );

    setText(root,"[data-mp-mean-rate]",rate(m.meanFeeRate,2));
    setText(root,"[data-mp-median-rate]",rate(m.medianFeeRate,2));

    setText(root,"[data-mp-ge10]",
      Number.isFinite(m.ge10Share)
        ? `${num(m.ge10Vbytes/1e6,2)} vMB · ${(m.ge10Share*100).toFixed(2)}%`
        : "—"
    );
    setText(root,"[data-mp-ge10-sub]",
      Number.isFinite(m.vsize)&&m.vsize>0
        ? `${num(m.ge5Vbytes/1e6,2)} vMB ≥5 · ${num(m.ge2Vbytes/1e6,2)} vMB ≥2`
        : "fee-band coverage unavailable"
    );

    setText(root,"[data-mp-fast-fee]",rate(m.fastFee,2));

    setText(root,"[data-mp-condition]",m.condition);
    setText(root,"[data-mp-condition-sub]",
      `depth ${m.depth.label} · pressure ${m.pressure.label}`
    );

    setText(root,"[data-mp-sub]",
      `${int(m.count)} transactions · ${num(m.blockEquivalents,2)} maximum-vsize block equivalents`
    );

    setText(root,"[data-mp-hist-total]",
      Number.isFinite(m.vMB)?`${num(m.vMB,2)} vMB total`:"—"
    );

    setText(root,"[data-mp-next-tx]",
      next&&Number.isFinite(next.nTx)?`${int(next.nTx)} tx`:"—"
    );
    setText(root,"[data-mp-next-vsize]",
      next&&Number.isFinite(next.blockVSize)
        ? `${num(next.blockVSize/1e6,3)} vMB`
        : "candidate unavailable"
    );
    setText(root,"[data-mp-next-median]",
      next?rate(next.medianFee,2):"—"
    );
    setText(root,"[data-mp-next-range]",next?rangeText(next):"candidate unavailable");

    setText(root,"[data-mp-projected-count]",
      m.candidateCount?`${int(m.candidateCount)} blocks`:"—"
    );
    setText(root,"[data-mp-projected-vsize]",
      m.candidateCount?`${num(m.candidateVsize/1e6,2)} vMB represented`:"candidate set unavailable"
    );
    setText(root,"[data-mp-projected-fees]",
      m.candidateCount?btc(m.candidateFees/1e8):"—"
    );
    setText(root,"[data-mp-projected-tx]",
      m.candidateCount?`${int(m.candidateTx)} projected tx`:"candidate set unavailable"
    );

    setText(root,"[data-mp-depth]",
      `${m.depth.label} · ${num(m.blockEquivalents,2)} block-equivalent backlog`
    );
    tone(root,"[data-mp-depth]",m.depth.level);

    setText(root,"[data-mp-pressure]",
      `${m.pressure.label} · score ${m.pressure.score}/12 · median ${rate(m.medianFeeRate,2)}`
    );
    tone(root,"[data-mp-pressure]",m.pressure.level);

    setText(root,"[data-mp-clear]",
      Number.isFinite(m.clearMinutes)
        ? `${duration(m.clearMinutes)} theoretical minimum at 10 min/block, full 1.0-vMB blocks, zero new arrivals`
        : "—"
    );

    setText(root,"[data-mp-source]",m.source||"configured mempool API");

    setText(root,"[data-mp-meta]",
      `${m.priceSource||"price unavailable"}${m.priceMode?` · ${m.priceMode}`:""} · vsize only · refreshed ${new Date(m.fetchedAt||Date.now()).toLocaleTimeString()}`
    );

    draw(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const payload=await W.ZZXMempoolProvider.load(state.core);
      state.model=W.ZZXMempoolModel.build(payload);

      if(
        !Number.isFinite(state.model.vsize) &&
        !Number.isFinite(state.model.count)
      ){
        throw new Error("mempool payload contained no usable summary values");
      }

      render(root,state);
      state.hasGood=true;
    }catch(error){
      status(
        root,
        state.hasGood?"stale":"offline",
        state.hasGood?"warn":"error"
      );

      setText(root,"[data-mp-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      hasGood:false,
      busy:false,
      timer:null,
      resize:null
    };

    root.__zzxMempoolState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-mp-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(
          ()=>W.requestAnimationFrame(()=>draw(root,state))
        );

        const canvas=q(root,"[data-mp-canvas]");
        if(canvas)state.resize.observe(canvas);
      }

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        if(root.isConnected)state.timer=W.setTimeout(loop,30000);
      }

      state.timer=W.setTimeout(loop,30000);
    }catch(error){
      status(root,"offline","error");
      setText(root,"[data-mp-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
