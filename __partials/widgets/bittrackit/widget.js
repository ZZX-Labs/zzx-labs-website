(function(){
  "use strict";
  const W=window,D=document,ID="bittrackit",q=(r,s)=>r?r.querySelector(s):null;
  const sats=v=>`${Number(v||0).toLocaleString()} sat`;
  function status(r,l,s){const e=q(r,"[data-bittrackit-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function ensure(core){
    if(W.ZZXBitTrackItValidator?.classify)return;
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/bittrackit";
    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/validator.js`):`${base}/js/validator.js`;
    await new Promise((res,rej)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=res;s.onerror=rej;(D.head||D.documentElement).appendChild(s)});
  }
  async function run(root,state){
    if(state.busy)return;
    const input=q(root,"[data-bittrackit-address]"),a=String(input?.value||"").trim(),kind=W.ZZXBitTrackItValidator.classify(a);
    if(!kind){q(root,"[data-bittrackit-sub]").textContent="Enter a recognizable Bitcoin mainnet address.";return}
    state.busy=true;status(root,"querying","warn");q(root,"[data-bittrackit-sub]").textContent="Querying public address state…";
    try{
      const r=await W.ZZXChain.addressStats(a,true),d=r.data||{},c=d.chain_stats||{},m=d.mempool_stats||{};
      const confirmed=Number(c.funded_txo_sum||0)-Number(c.spent_txo_sum||0),pending=Number(m.funded_txo_sum||0)-Number(m.spent_txo_sum||0),bal=confirmed+pending;
      q(root,"[data-bittrackit-balance]").textContent=sats(bal);
      q(root,"[data-bittrackit-tx]").textContent=Number(c.tx_count||0).toLocaleString();
      q(root,"[data-bittrackit-mtx]").textContent=Number(m.tx_count||0).toLocaleString();
      q(root,"[data-bittrackit-pending]").textContent=sats(pending);
      q(root,"[data-bittrackit-funded]").textContent=sats(c.funded_txo_sum||0);
      q(root,"[data-bittrackit-sub]").textContent=`confirmed ${sats(confirmed)} · ${kind} · public lookup`;
      q(root,"[data-bittrackit-meta]").textContent=`${r.source} · address not stored by widget`;
      q(root,"[data-bittrackit-external]").href=`https://mempool.space/address/${encodeURIComponent(a)}`;
      status(root,"live","ok");
    }catch(e){status(root,"error","error");q(root,"[data-bittrackit-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root,core){
    const state={busy:false};root.__zzxBitTrackItState=state;
    try{
      await ensure(core||W.ZZXWidgetsCore||null);
      q(root,"[data-bittrackit-form]")?.addEventListener("submit",e=>{e.preventDefault();run(root,state)});
      status(root,"ready","ok");
    }catch(e){status(root,"offline","error");q(root,"[data-bittrackit-meta]").textContent=String(e?.message||e)}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
