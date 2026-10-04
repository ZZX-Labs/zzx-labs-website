(function(){
  "use strict";
  const W=window,D=document,ID="btc-to-mine",REFRESH_MS=15000;
  const q=(r,s)=>r?r.querySelector(s):null;
  const set=(r,s,v)=>{const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)};
  function status(r,l,s){const e=q(r,"[data-tomine-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  function resolve(p){return W.ZZXAPI?.url?W.ZZXAPI.url(p):p}
  async function ensure(core){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/btc-to-mine";
    for(const [name,rel] of [["ZZXBitcoinSupplyModel","js/model.js"],["ZZXBitcoinSupplyFetch","js/fetch.js"]]){
      if(W[name])continue;
      await new Promise((ok,bad)=>{const s=D.createElement("script");s.src=resolve(`${base}/${rel}`);s.defer=true;s.addEventListener("load",ok,{once:true});s.addEventListener("error",()=>bad(new Error(`failed to load ${rel}`)),{once:true});(D.head||D.documentElement).appendChild(s)});
      if(!W[name])throw new Error(`${rel} did not initialize ${name}`);
    }
  }
  const intText=v=>Number(v).toLocaleString();
  const btcText=sats=>`${W.ZZXBitcoinSupplyModel.btcFromSats(sats)} BTC`;
  function render(root,height,source){
    const M=W.ZZXBitcoinSupplyModel;
    const remaining=M.remainingSatsAtHeight(height),subsidy=M.subsidySatsAtHeight(height);
    set(root,"[data-tomine-btc]",btcText(remaining));
    set(root,"[data-tomine-percent]",`${M.pct(remaining,M.TERMINAL_SATS).toFixed(8)}% of terminal scheduled issuance remains`);
    set(root,"[data-tomine-sats]",remaining.toLocaleString());
    set(root,"[data-tomine-height]",intText(height));
    set(root,"[data-tomine-subsidy]",btcText(subsidy));
    set(root,"[data-tomine-next]",intText(M.nextHalvingHeight(height)));
    set(root,"[data-tomine-next-blocks]",intText(M.blocksToNextHalving(height)));
    set(root,"[data-tomine-final-height]",intText(M.FINAL_POSITIVE_SUBSIDY_HEIGHT));
    set(root,"[data-tomine-blocks-left]",intText(M.positiveSubsidyBlocksRemaining(height)));
    set(root,"[data-tomine-terminal]",`${M.TERMINAL_BTC.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`);
    set(root,"[data-tomine-meta]",`${source} · exact integer subsidy schedule · no wall-clock extrapolation`);
  }
  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const tip=await W.ZZXBitcoinSupplyFetch.tipHeight(force);state.height=tip.height;render(root,tip.height,tip.source);status(root,"live","ok")}
    catch(e){status(root,state.height!=null?"stale":"offline",state.height!=null?"warn":"error");set(root,"[data-tomine-meta]",String(e?.message||e))}
    finally{state.busy=false}
  }
  async function boot(root,core){
    if(!root)return;const state={busy:false,height:null,timer:null};root.__zzxBtcToMineState=state;
    try{
      await ensure(core||W.ZZXWidgetsCore||null);
      q(root,"[data-tomine-refresh]")?.addEventListener("click",()=>refresh(root,state,true));
      await refresh(root,state,false);
      async function loop(){if(!root.isConnected)return;await refresh(root,state,false);state.timer=W.setTimeout(loop,REFRESH_MS)}
      state.timer=W.setTimeout(loop,REFRESH_MS);
    }catch(e){status(root,"offline","error");set(root,"[data-tomine-meta]",String(e?.message||e))}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
