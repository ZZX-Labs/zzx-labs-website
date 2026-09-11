// __partials/widgets/fees/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="fees";
  const UNIT_KEY="zzx.widget.fees.unit.v3";

  function q(root,sel){return root?root.querySelector(sel):null}
  function qa(root,sel){return root?[...root.querySelectorAll(sel)]:[]}

  function status(root,label,state){
    const el=q(root,"[data-fees-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function safeGet(){
    try{return localStorage.getItem(UNIT_KEY)}catch(_){return null}
  }

  function safeSet(value){
    try{localStorage.setItem(UNIT_KEY,value)}catch(_){}
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/fees";

    for(const [globalName,minVersion,relative] of [
      ["ZZXFeesSources",2,"js/sources.js"],
      ["ZZXFeesFetch",2,"js/fetch.js"],
      ["ZZXFeesEstimator",3,"js/estimator.js"]
    ]){
      if(Number(W[globalName]?.__version||0)>=minVersion)continue;

      const src=W.ZZXAPI?.url
        ? W.ZZXAPI.url(`${base}/${relative}?v=${minVersion}`)
        : `${base}/${relative}?v=${minVersion}`;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.onload=resolve;
        s.onerror=reject;
        (D.head||D.documentElement).appendChild(s);
      });
    }
  }

  function unitSpec(state){
    return W.ZZXFeesSources.units.find(x=>x.id===state.unit)||W.ZZXFeesSources.units[0];
  }

  function fmtRate(value,unit){
    const v=W.ZZXFeesEstimator.convertSatVB(value,unit);
    if(!Number.isFinite(v))return "—";

    if(unit==="btc"){
      return v.toLocaleString(undefined,{
        minimumFractionDigits:8,
        maximumFractionDigits:10
      });
    }

    if(unit==="msat"||unit==="usat"){
      return Math.round(v).toLocaleString();
    }

    return Number(v).toLocaleString(undefined,{
      minimumFractionDigits:Number.isInteger(v)?0:2,
      maximumFractionDigits:2
    });
  }

  function rangeText(r,unit){
    if(!r)return "—";
    const lo=fmtRate(r.lo,unit);
    const hi=fmtRate(r.hi,unit);
    return lo===hi?lo:`${lo}–${hi}`;
  }

  function timeText(minutes){
    const n=Math.round(Number(minutes));
    if(!Number.isFinite(n))return "—";
    if(n<60)return `~${n} min`;
    if(n%1440===0)return `~${n/1440} d`;
    if(n%60===0)return `~${n/60} h`;
    return `~${Math.floor(n/60)}h ${n%60}m`;
  }

  function updateUnitLabels(root,state){
    const label=unitSpec(state).label;
    const button=q(root,"[data-fees-unit]");
    if(button)button.textContent=label;
    qa(root,"[data-fees-unit-text]").forEach(el=>el.textContent=label);
  }

  function renderEstimator(root,state){
    if(!state.model)return;

    const vbytes=Number(q(root,"[data-fees-vbytes]")?.value);
    const requestedMinutes=Number(q(root,"[data-fees-time]")?.value);
    const confirmations=Number(q(root,"[data-fees-confirmations]")?.value);
    const policy=q(root,"[data-fees-tier]")?.value||"auto";

    const plan=W.ZZXFeesEstimator.plan(
      state.model,
      requestedMinutes,
      confirmations,
      policy
    );

    const out=plan
      ? W.ZZXFeesEstimator.transaction(vbytes,plan.rateSatVB,state.priceUsd)
      : null;

    const main=q(root,"[data-fees-estimate]");
    const sub=q(root,"[data-fees-estimate-usd]");
    const planEl=q(root,"[data-fees-estimate-plan]");

    if(!out||!plan){
      if(main)main.textContent="—";
      if(sub)sub.textContent="invalid estimator input";
      if(planEl)planEl.textContent="—";
      return;
    }

    if(main){
      main.textContent=
        `${out.sats.toLocaleString()} sat · ${out.btc.toFixed(8)} BTC · `+
        `${fmtRate(plan.rateSatVB,"sat")} sat/vB`;
    }

    if(sub){
      sub.textContent=Number.isFinite(out.usd)
        ? out.usd.toLocaleString(undefined,{
            style:"currency",
            currency:"USD",
            maximumFractionDigits:2
          })
        : "USD unavailable";
    }

    if(planEl){
      if(policy==="auto"){
        const constraint=plan.constrained
          ? ` · requested ${timeText(plan.requestedTotalMinutes)} is below the ~${timeText(plan.minimumPracticalMinutes).replace(/^~/,"")} ${plan.confirmations}-confirmation block-time floor`
          : "";

        planEl.textContent=
          `auto · ${plan.confirmations} conf · first confirmation target ${timeText(plan.firstConfirmationTargetMinutes)} · `+
          `${plan.bandLabel}${constraint}`;
      }else{
        planEl.textContent=
          `manual ${plan.bandLabel} · ${plan.confirmations} conf requested · `+
          `network inclusion still depends on mempool and block production`;
      }
    }
  }

  function renderTable(root,state){
    const body=q(root,"[data-fees-body]");
    if(!body)return;
    body.replaceChildren();

    const labels=[
      ["instant","Instant"],
      ["fast","Fast"],
      ["high","High"],
      ["mid","Mid"],
      ["low","Low"],
      ["economy","Economy"],
      ["min","Minimum"]
    ];

    for(const [key,label] of labels){
      const rate=state.model.tiers[key];
      const tx=W.ZZXFeesEstimator.transaction(250,rate,NaN);

      const row=D.createElement("div");
      row.className="fees__row";
      row.setAttribute("role","row");

      const values=[
        label,
        `${fmtRate(rate,state.unit)} ${unitSpec(state).label}`,
        rangeText(state.model.ranges[key],state.unit),
        tx?`${tx.sats.toLocaleString()} sat`:"—"
      ];

      values.forEach((text,index)=>{
        const cell=D.createElement("div");
        cell.setAttribute("role","cell");
        if(index>0)cell.classList.add("fees__num");
        cell.textContent=text;
        row.appendChild(cell);
      });

      body.appendChild(row);
    }
  }

  function render(root,state){
    if(!state.model)return;

    updateUnitLabels(root,state);

    const hero=q(root,"[data-fees-fast]");
    if(hero)hero.textContent=fmtRate(state.model.mean,state.unit);

    const instant=q(root,"[data-fees-instant]");
    if(instant)instant.textContent=fmtRate(state.model.tiers.instant,state.unit);

    const fast=q(root,"[data-fees-30m]");
    if(fast)fast.textContent=fmtRate(state.model.tiers.fast,state.unit);

    const low=q(root,"[data-fees-1h]");
    if(low)low.textContent=fmtRate(state.model.tiers.low,state.unit);

    const min=q(root,"[data-fees-min]");
    if(min)min.textContent=fmtRate(state.model.tiers.min,state.unit);

    const price=q(root,"[data-fees-price]");
    if(price){
      price.textContent=Number.isFinite(state.priceUsd)
        ? `BTC/USD ${state.priceUsd.toLocaleString(undefined,{
            style:"currency",
            currency:"USD",
            maximumFractionDigits:0
          })}`
        : "BTC/USD —";
    }

    const sub=q(root,"[data-fees-sub]");
    if(sub){
      sub.textContent=
        "mean of five normalized mempool recommendations · strict monotonic ladder";
    }

    const meta=q(root,"[data-fees-meta]");
    if(meta){
      meta.textContent=
        `${state.feeSource||"configured mempool API"} · ${state.priceSource||"ZZX BPI"} · `+
        `0.01 sat/vB tie spacing · tx fees round up to whole sats`;
    }

    renderTable(root,state);
    renderEstimator(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const [fees,price]=await Promise.all([
        W.ZZXFeesFetch.recommended(state.core),
        W.ZZXFeesFetch.price()
      ]);

      state.model=W.ZZXFeesEstimator.build(fees.data);
      state.feeSource=fees.source;
      state.priceUsd=price.value;
      state.priceSource=price.source;

      if(!state.model.sourceValues.length){
        throw new Error("recommended fee payload contained no usable values");
      }

      render(root,state);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      const meta=q(root,"[data-fees-meta]");
      if(meta)meta.textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      unit:"sat",
      model:null,
      priceUsd:NaN,
      priceSource:"",
      feeSource:"",
      busy:false,
      timer:null
    };

    root.__zzxFeesState=state;

    try{
      await ensureModules(state.core);

      const saved=safeGet();
      if(W.ZZXFeesSources.units.some(x=>x.id===saved))state.unit=saved;

      q(root,"[data-fees-unit]")?.addEventListener("click",()=>{
        const units=W.ZZXFeesSources.units;
        const idx=Math.max(0,units.findIndex(x=>x.id===state.unit));
        state.unit=units[(idx+1)%units.length].id;
        safeSet(state.unit);
        if(state.model)render(root,state);
      });

      for(const selector of [
        "[data-fees-vbytes]",
        "[data-fees-time]",
        "[data-fees-confirmations]",
        "[data-fees-tier]"
      ]){
        const el=q(root,selector);
        if(!el)continue;
        el.addEventListener(
          el.tagName==="SELECT"?"change":"input",
          ()=>renderEstimator(root,state)
        );
      }

      q(root,"[data-fees-refresh]")?.addEventListener("click",()=>refresh(root,state));

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,W.ZZXFeesSources.refreshMs);
      }

      state.timer=W.setTimeout(loop,W.ZZXFeesSources.refreshMs);
    }catch(error){
      status(root,"offline","error");
      const meta=q(root,"[data-fees-meta]");
      if(meta)meta.textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
