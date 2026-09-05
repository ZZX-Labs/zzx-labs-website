// __partials/widgets/deadopop/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXDeadOPopModel?.__version>=2)return;

  const ALLOWED=new Set([
    "bankrupt","insolvent","scam","rug_pull","fraud","collapsed",
    "abandoned","shutdown","dead","delisted_dead","protocol_failure",
    "exchange_failure","zeroed_out"
  ]);

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeItem(item,index){
    if(!item || typeof item!=="object")return null;

    const id=String(item.id||"").trim();
    const name=String(item.name||"").trim();
    const symbol=String(item.symbol||"").trim();
    const status=String(item.status||"").trim().toLowerCase();

    if(!id || !name || !ALLOWED.has(status))return null;
    if(id.toLowerCase()==="bitcoin" || symbol.toLowerCase()==="btc")return null;

    const peak=finite(item.peak_market_cap_usd);
    const terminal=Math.max(0,finite(item.terminal_market_cap_usd)||0);
    let lost=finite(item.estimated_value_lost_usd);

    if((!Number.isFinite(lost) || lost<=0) && Number.isFinite(peak) && peak>0){
      lost=Math.max(0,peak-terminal);
    }

    return {
      rank:Math.trunc(finite(item.rank)||index+1),
      id,
      symbol,
      name,
      status,
      failureDate:String(item.failure_date||""),
      failureReason:String(item.failure_reason||""),
      lost:Number.isFinite(lost)&&lost>0?lost:NaN,
      peak:Number.isFinite(peak)&&peak>0?peak:NaN,
      terminal:Number.isFinite(terminal)?terminal:NaN,
      method:String(item.loss_method||"pending_quantification"),
      confidence:finite(item.confidence),
      sources:Array.isArray(item.sources)?item.sources:[],
      notes:String(item.notes||"")
    };
  }

  function normalizeAPI(data){
    if(!data || typeof data!=="object" || Array.isArray(data))throw new Error("DeadOPop API root must be an object");
    if(data.source!=="zzx_deadcoins_archival_registry")throw new Error("refusing non-archival DeadOPop source");
    if(data.available===false)throw new Error(data.registry_reason||"DeadOPop unavailable");
    if(data.bitcoin_excluded!==true)throw new Error("DeadOPop must explicitly exclude Bitcoin");

    const rows=(Array.isArray(data.top_dead_coins)?data.top_dead_coins:[])
      .map(normalizeItem)
      .filter(Boolean)
      .sort((a,b)=>(Number.isFinite(b.lost)?b.lost:-1)-(Number.isFinite(a.lost)?a.lost:-1));

    return {
      source:"api",
      updated:String(data.updated_at||""),
      total:Math.trunc(finite(data.total_dead_coins)||rows.length),
      valued:Math.trunc(finite(data.valued_dead_coins)||rows.filter(x=>Number.isFinite(x.lost)).length),
      unvalued:Math.trunc(finite(data.unvalued_dead_coins)||rows.filter(x=>!Number.isFinite(x.lost)).length),
      coverage:finite(data.valuation_coverage_percent),
      combinedLost:finite(data.combined_estimated_value_lost_usd),
      combinedPeak:finite(data.combined_peak_market_cap_usd),
      statusCounts:data.status_counts&&typeof data.status_counts==="object"?data.status_counts:{},
      rows
    };
  }

  function normalizeRegistry(data){
    if(!data || typeof data!=="object")throw new Error("DeadOPop registry root invalid");
    const raw=Array.isArray(data)?data:data.entries;
    if(!Array.isArray(raw))throw new Error("DeadOPop registry entries missing");

    const seen=new Set();
    const rows=raw.map(normalizeItem).filter(Boolean).filter(item=>{
      const key=item.id.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>(Number.isFinite(b.lost)?b.lost:-1)-(Number.isFinite(a.lost)?a.lost:-1));

    const valued=rows.filter(x=>Number.isFinite(x.lost));
    return {
      source:"registry",
      updated:String(data.generated_at||data.updated_at||""),
      total:rows.length,
      valued:valued.length,
      unvalued:rows.length-valued.length,
      coverage:rows.length?100*valued.length/rows.length:0,
      combinedLost:valued.reduce((s,x)=>s+x.lost,0),
      combinedPeak:rows.reduce((s,x)=>s+(Number.isFinite(x.peak)?x.peak:0),0),
      statusCounts:rows.reduce((acc,x)=>{acc[x.status]=(acc[x.status]||0)+1;return acc},{}),
      rows
    };
  }

  function filter(model,status,search){
    const needle=String(search||"").trim().toLowerCase();
    return (model?.rows||[]).filter(item=>{
      if(status && status!=="all" && item.status!==status)return false;
      if(!needle)return true;
      return [
        item.name,item.symbol,item.status,item.failureReason,item.method,item.notes
      ].join(" ").toLowerCase().includes(needle);
    });
  }

  W.ZZXDeadOPopModel=Object.freeze({
    __version:2,
    ALLOWED,
    normalizeAPI,
    normalizeRegistry,
    filter
  });
})();
