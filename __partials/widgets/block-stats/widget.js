// __partials/widgets/block-stats/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="block-stats";
  const q=(r,s)=>r?r.querySelector(s):null;
  const qa=(r,s)=>r?[...r.querySelectorAll(s)]:[];

  function num(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function setText(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=value;
  }

  function status(root,label,state){
    const el=q(root,"[data-block-stats-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function fmtInt(v){
    const n=num(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function fmtPct(v,digits=1){
    const n=num(v);
    return Number.isFinite(n)?`${n.toFixed(digits)}%`:"—";
  }

  function fmtSignedPct(v,digits=1){
    const n=num(v);
    return Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(digits)}%`:"—";
  }

  function fmtBtc(sats,digits=8){
    const n=num(sats);
    if(!Number.isFinite(n))return "—";
    return `${(n/1e8).toLocaleString(undefined,{
      minimumFractionDigits:Math.min(4,digits),
      maximumFractionDigits:digits
    })} BTC`;
  }

  function fmtSat(sats){
    const n=num(sats);
    return Number.isFinite(n)?`${Math.round(n).toLocaleString()} sat`:"—";
  }

  function fmtRate(v,digits=2){
    const n=num(v);
    return Number.isFinite(n)?`${n.toFixed(digits)} sat/vB`:"—";
  }

  function fmtBytes(v){
    const n=num(v);
    if(!Number.isFinite(n))return "—";
    if(n>=1e6)return `${(n/1e6).toFixed(2)} MB`;
    if(n>=1e3)return `${(n/1e3).toFixed(1)} kB`;
    return `${Math.round(n)} B`;
  }

  function fmtWeight(v){
    const n=num(v);
    if(!Number.isFinite(n))return "—";
    return n>=1e6?`${(n/1e6).toFixed(3)} MWU`:`${Math.round(n).toLocaleString()} WU`;
  }

  function fmtSeconds(seconds){
    const n=num(seconds);
    if(!Number.isFinite(n)||n<0)return "—";
    if(n<120)return `${Math.round(n)} sec`;
    if(n<7200)return `${(n/60).toFixed(2)} min`;
    return `${(n/3600).toFixed(2)} hr`;
  }

  function fmtAge(ms){
    const n=num(ms);
    if(!Number.isFinite(n)||n<0)return "—";
    const s=Math.floor(n/1000);
    if(s<60)return `${s}s`;
    const m=Math.floor(s/60);
    if(m<60)return `${m}m ${s%60}s`;
    const h=Math.floor(m/60);
    return `${h}h ${m%60}m`;
  }

  function fmtDate(ms){
    const n=num(ms);
    if(!Number.isFinite(n))return "—";
    const d=new Date(n);
    return Number.isFinite(d.getTime())?d.toLocaleString():"—";
  }

  function fmtDifficulty(v){
    const n=num(v);
    if(!Number.isFinite(n))return "—";
    if(n>=1e12)return `${(n/1e12).toFixed(3)} T`;
    if(n>=1e9)return `${(n/1e9).toFixed(3)} G`;
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }

  function fmtHex(v,prefix=true){
    const n=num(v);
    if(!Number.isFinite(n))return "—";
    const text=(Math.trunc(n)>>>0).toString(16).padStart(8,"0");
    return prefix?`0x${text}`:text;
  }

  function toneForCadence(deltaPct){
    const n=num(deltaPct);
    if(!Number.isFinite(n))return "warn";
    if(Math.abs(n)<=10)return "up";
    if(Math.abs(n)<=25)return "warn";
    return "down";
  }

  function setTone(root,selector,tone){
    const el=q(root,selector);
    if(el)el.setAttribute("data-tone",tone);
  }

  async function loadScript(core,path,version){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/block-stats";

    const raw=`${base}/${path}`;
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

  async function ensure(core){
    if(Number(W.ZZXBlockStatsModel?.__version||0)<2){
      await loadScript(core,"js/model.js",2);
    }

    if(Number(W.ZZXBlockStatsProvider?.__version||0)<1){
      await loadScript(core,"js/provider.js",1);
    }

    if(
      Number(W.ZZXBlockStatsModel?.__version||0)<2 ||
      Number(W.ZZXBlockStatsProvider?.__version||0)<1
    ){
      throw new Error("Recent Block Stats dependencies failed to load");
    }
  }

  function feeRange(block){
    const range=Array.isArray(block?.feeRange)
      ? block.feeRange.filter(Number.isFinite)
      : [];

    if(range.length){
      return `${Math.min(...range).toFixed(1)}–${Math.max(...range).toFixed(1)} sat/vB`;
    }

    if(Number.isFinite(block?.medianFeeRate)){
      return `median ${block.medianFeeRate.toFixed(2)} sat/vB`;
    }

    return "range unavailable";
  }

  function renderSummary(root,model){
    const t=model.tip;
    const c=model.cadence;
    const ts=model.tipStats;
    const w=model.window12;

    setText(root,"[data-block-stats-height]",fmtInt(t.height));
    setText(root,"[data-block-stats-time]",fmtDate(t.timestampMs));
    setText(root,"[data-block-stats-age]",fmtAge(Math.max(0,Date.now()-t.timestampMs)));
    setText(root,"[data-block-stats-pool]",`pool ${t.pool}`);

    setText(root,"[data-block-stats-tx]",fmtInt(t.txCount));
    setText(
      root,
      "[data-block-stats-tx-density]",
      Number.isFinite(ts.txPerVmb)
        ? `${ts.txPerVmb.toFixed(0)} tx / vMB`
        : "density unavailable"
    );

    setText(
      root,
      "[data-block-stats-weight]",
      Number.isFinite(t.weight)
        ? `${fmtWeight(t.weight)} · ${fmtPct(ts.utilization,1)}`
        : "—"
    );
    setText(
      root,
      "[data-block-stats-size]",
      Number.isFinite(t.size)&&Number.isFinite(t.vsize)
        ? `${fmtBytes(t.size)} raw · ${(t.vsize/1e6).toFixed(3)} vMB`
        : "—"
    );

    setText(root,"[data-block-stats-fees]",fmtBtc(t.totalFees,8));
    setText(
      root,
      "[data-block-stats-fee-share]",
      Number.isFinite(ts.feeShare)
        ? `${fmtPct(ts.feeShare,2)} of coinbase reward`
        : "fee share unavailable"
    );

    const preferredRate=Number.isFinite(t.avgFeeRate)
      ? t.avgFeeRate
      : ts.realizedFeeDensity;

    setText(root,"[data-block-stats-fee-rate]",fmtRate(preferredRate,2));
    setText(root,"[data-block-stats-fee-range]",feeRange(t));

    setText(root,"[data-block-stats-mean6]",fmtSeconds(c.mean6));
    setText(root,"[data-block-stats-mean6-delta]",`${fmtSignedPct(c.delta6Pct,1)} vs 10m target`);
    setTone(root,"[data-block-stats-mean6]",toneForCadence(c.delta6Pct));

    setText(root,"[data-block-stats-mean12]",fmtSeconds(c.mean12));
    setText(root,"[data-block-stats-mean12-delta]",`${fmtSignedPct(c.delta12Pct,1)} vs 10m target`);
    setTone(root,"[data-block-stats-mean12]",toneForCadence(c.delta12Pct));

    setText(root,"[data-block-stats-median12]",fmtSeconds(c.median12));
    setText(
      root,
      "[data-block-stats-dispersion]",
      Number.isFinite(c.stddev12)?`σ ${fmtSeconds(c.stddev12)}`:"dispersion unavailable"
    );

    setText(
      root,
      "[data-block-stats-pace]",
      Number.isFinite(c.blocksPerHour)?`${c.blocksPerHour.toFixed(2)} blocks/hr`:"—"
    );
    setText(
      root,
      "[data-block-stats-range]",
      Number.isFinite(c.fastest12)&&Number.isFinite(c.slowest12)
        ? `fast ${fmtSeconds(c.fastest12)} · slow ${fmtSeconds(c.slowest12)}`
        : "range unavailable"
    );

    setText(
      root,
      "[data-block-stats-window]",
      Number.isFinite(c.mean24)
        ? `24-block mean ${fmtSeconds(c.mean24)}`
        : `sample ${model.blocks.length} blocks`
    );

    setText(root,"[data-block-stats-window-tx]",fmtInt(w.totalTx));
    setText(
      root,
      "[data-block-stats-window-tx-avg]",
      Number.isFinite(w.avgTx)?`${fmtInt(w.avgTx)} avg / block`:"—"
    );

    setText(root,"[data-block-stats-window-fees]",fmtBtc(w.totalFees,8));
    setText(
      root,
      "[data-block-stats-window-fee-avg]",
      Number.isFinite(w.avgFees)?`${fmtBtc(w.avgFees,8)} avg / block`:"—"
    );

    setText(root,"[data-block-stats-window-util]",fmtPct(w.meanUtilization,1));
    setText(root,"[data-block-stats-window-weight]",fmtWeight(w.totalWeight));

    setText(root,"[data-block-stats-window-density]",fmtRate(w.realizedFeeDensity,2));
    setText(root,"[data-block-stats-window-reward]",`${fmtBtc(w.totalReward,8)} total reward`);

    setText(root,"[data-block-stats-summary-label]",`last ${w.count} completed blocks`);
    setText(root,"[data-block-stats-sample]",`${model.blocks.length} blocks loaded`);
  }

  function rowInterval(model,index){
    if(index>=model.blocks.length-1)return NaN;
    const a=model.blocks[index]?.timestampMs;
    const b=model.blocks[index+1]?.timestampMs;
    const d=(a-b)/1000;
    return Number.isFinite(d)&&d>=0?d:NaN;
  }

  function renderRows(root,state){
    const body=q(root,"[data-block-stats-rows]");
    if(!body)return;

    body.textContent="";
    const model=state.model;
    const limit=Math.min(24,model.blocks.length);

    for(let i=0;i<limit;i++){
      const block=model.blocks[i];
      const tr=D.createElement("tr");
      tr.dataset.height=String(block.height);
      tr.dataset.selected=String(Number(state.selectedHeight)===Number(block.height));

      const interval=rowInterval(model,i);
      const rate=Number.isFinite(block.avgFeeRate)
        ? block.avgFeeRate
        : (
          Number.isFinite(block.totalFees)&&Number.isFinite(block.vsize)&&block.vsize>0
            ? block.totalFees/block.vsize
            : NaN
        );

      const utilization=Number.isFinite(block.weight)
        ? 100*block.weight/4_000_000
        : NaN;

      const heightCell=D.createElement("td");
      const button=D.createElement("button");
      button.type="button";
      button.textContent=fmtInt(block.height);
      button.setAttribute("aria-label",`Inspect block ${fmtInt(block.height)}`);
      button.addEventListener("click",()=>selectBlock(root,state,block.height));
      heightCell.appendChild(button);

      const values=[
        heightCell,
        fmtSeconds(interval),
        fmtInt(block.txCount),
        fmtPct(utilization,1),
        fmtBtc(block.totalFees,6),
        fmtRate(rate,1),
        block.pool
      ];

      values.forEach((value,column)=>{
        if(column===0){
          tr.appendChild(value);
          return;
        }

        const td=D.createElement("td");
        if(column===6){
          const span=D.createElement("span");
          span.className="block-stats__pool";
          span.textContent=value;
          span.title=value;
          td.appendChild(span);
        }else{
          td.textContent=value;
        }

        if(column===1&&Number.isFinite(interval)){
          const delta=((interval-600)/600)*100;
          td.setAttribute("data-tone",toneForCadence(delta));
        }

        tr.appendChild(td);
      });

      tr.addEventListener("dblclick",()=>selectBlock(root,state,block.height));
      body.appendChild(tr);
    }
  }

  function selectBlock(root,state,height){
    const block=state.model?.blocks?.find(b=>Number(b.height)===Number(height));
    if(!block)return;

    state.selectedHeight=block.height;
    renderRows(root,state);
    renderInspector(root,state,block);
  }

  function renderInspector(root,state,block){
    const panel=q(root,"[data-block-stats-inspector]");
    if(!panel)return;
    panel.hidden=false;

    const model=state.model;
    const index=model.blocks.findIndex(b=>Number(b.height)===Number(block.height));
    const interval=index>=0?rowInterval(model,index):NaN;
    const confirmations=Math.max(1,Math.round(model.tip.height-block.height+1));
    const utilization=Number.isFinite(block.weight)?100*block.weight/4_000_000:NaN;
    const realized=Number.isFinite(block.totalFees)&&Number.isFinite(block.vsize)&&block.vsize>0
      ? block.totalFees/block.vsize
      : NaN;
    const avgFee=Number.isFinite(block.totalFees)&&Number.isFinite(block.txCount)&&block.txCount>0
      ? block.totalFees/block.txCount
      : NaN;
    const feeShare=Number.isFinite(block.totalFees)&&Number.isFinite(block.reward)&&block.reward>0
      ? 100*block.totalFees/block.reward
      : NaN;

    setText(root,"[data-block-inspect-height]",fmtInt(block.height));
    setText(root,"[data-block-inspect-confirmations]",`${fmtInt(confirmations)} confirmation${confirmations===1?"":"s"}`);
    setText(root,"[data-block-inspect-time]",fmtDate(block.timestampMs));
    setText(root,"[data-block-inspect-interval]",fmtSeconds(interval));
    setText(root,"[data-block-inspect-tx]",fmtInt(block.txCount));
    setText(root,"[data-block-inspect-size]",fmtBytes(block.size));
    setText(root,"[data-block-inspect-weight]",`${fmtWeight(block.weight)} · ${fmtPct(utilization,1)}`);
    setText(root,"[data-block-inspect-vsize]",Number.isFinite(block.vsize)?`${fmtInt(block.vsize)} vB`:"—");
    setText(root,"[data-block-inspect-fees]",`${fmtBtc(block.totalFees,8)} · ${fmtSat(block.totalFees)}`);
    setText(root,"[data-block-inspect-reward]",fmtBtc(block.reward,8));
    setText(root,"[data-block-inspect-subsidy]",fmtBtc(block.subsidy,8));
    setText(root,"[data-block-inspect-fee-share]",fmtPct(feeShare,3));
    setText(
      root,
      "[data-block-inspect-rate]",
      fmtRate(Number.isFinite(block.avgFeeRate)?block.avgFeeRate:realized,2)
    );
    setText(root,"[data-block-inspect-avg-fee]",fmtSat(avgFee));
    setText(root,"[data-block-inspect-difficulty]",fmtDifficulty(block.difficulty));
    setText(root,"[data-block-inspect-pool]",block.pool);
    setText(root,"[data-block-inspect-version]",fmtHex(block.version,true));
    setText(
      root,
      "[data-block-inspect-bits]",
      Number.isFinite(block.bits)||Number.isFinite(block.nonce)
        ? `${fmtHex(block.bits,true)} · ${fmtInt(block.nonce)}`
        : "—"
    );

    setText(root,"[data-block-inspect-hash]",block.id||"—");
    setText(root,"[data-block-inspect-prev]",block.previousblockhash||"—");
    setText(root,"[data-block-inspect-merkle]",block.merkleRoot||"—");
  }

  function render(root,state,result){
    const model=W.ZZXBlockStatsModel.build(result.blocks);
    state.model=model;

    if(
      !Number.isFinite(state.selectedHeight) ||
      !model.blocks.some(b=>Number(b.height)===Number(state.selectedHeight))
    ){
      state.selectedHeight=model.tip.height;
    }

    renderSummary(root,model);
    renderRows(root,state);
    selectBlock(root,state,state.selectedHeight);

    const source=String(result.base||result.source||"mempool.space")
      .replace(/^https?:\/\//,"");

    setText(
      root,
      "[data-block-stats-meta]",
      `${source} · ${result.source||"mempool.space"} · refreshed ${new Date(result.fetchedAt||Date.now()).toLocaleTimeString()}`
    );
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const result=await W.ZZXBlockStatsProvider.load(state.core,force);
      render(root,state,result);
      status(root,"live","ok");
      state.hasGood=true;
    }catch(error){
      status(root,state.hasGood?"stale":"offline",state.hasGood?"warn":"error");
      setText(root,"[data-block-stats-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    const state={
      core:core||W.ZZXWidgetsCore||null,
      busy:false,
      timer:null,
      model:null,
      selectedHeight:NaN,
      hasGood:false
    };

    root.__zzxBlockStatsState=state;

    try{
      await ensure(state.core);

      q(root,"[data-block-stats-refresh]")?.addEventListener("click",()=>refresh(root,state,true));

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state,false);
        if(root.isConnected)state.timer=W.setTimeout(loop,30000);
      }

      state.timer=W.setTimeout(loop,30000);
    }catch(error){
      status(root,"offline","error");
      setText(root,"[data-block-stats-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
