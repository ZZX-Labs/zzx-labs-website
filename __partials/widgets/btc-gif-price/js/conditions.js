(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCGifPriceConditions?.__version>=2)return;

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function cryptoUnit(){
    if(W.crypto?.getRandomValues){
      const a=new Uint32Array(1);
      W.crypto.getRandomValues(a);
      return a[0]/0x100000000;
    }
    return 0;
  }

  function categories(t,policy){
    const th=policy?.thresholds||{};
    const pc=finite(t?.priceChange24hPct);
    let price="unknown";
    if(Number.isFinite(pc)){
      if(pc>=finite(th.price_change_pct?.strong_up))price="strong-up";
      else if(pc>=finite(th.price_change_pct?.up))price="up";
      else if(pc<=finite(th.price_change_pct?.strong_down))price="strong-down";
      else if(pc<=finite(th.price_change_pct?.down))price="down";
      else price="flat";
    }

    const vr=finite(t?.priceRangePct);
    let volatility="unknown";
    if(Number.isFinite(vr)){
      if(vr>=finite(th.volatility_range_pct?.extreme))volatility="extreme";
      else if(vr>=finite(th.volatility_range_pct?.high))volatility="high";
      else volatility="normal";
    }

    const ratio=finite(t?.volumeRatio);
    let volume="unknown";
    if(Number.isFinite(ratio)){
      if(ratio>=finite(th.volume_ratio_to_24h_median?.spike))volume="spike";
      else if(ratio>=finite(th.volume_ratio_to_24h_median?.high))volume="high";
      else if(ratio<=finite(th.volume_ratio_to_24h_median?.low))volume="low";
      else volume="normal";
    }

    const blocks=finite(t?.mempoolBlocks);
    let mempool="unknown";
    if(Number.isFinite(blocks)){
      if(blocks>=finite(th.mempool_block_equivalents?.severe))mempool="severe";
      else if(blocks>=finite(th.mempool_block_equivalents?.congested))mempool="congested";
      else if(blocks>=finite(th.mempool_block_equivalents?.busy))mempool="busy";
      else if(blocks<0.5)mempool="clear";
      else mempool="normal";
    }

    const fee=finite(t?.fastFeeSatVb);
    let fees="unknown";
    if(Number.isFinite(fee)){
      if(fee>=finite(th.fees_fast_sat_vb?.extreme))fees="extreme";
      else if(fee>=finite(th.fees_fast_sat_vb?.high))fees="high";
      else if(fee<=finite(th.fees_fast_sat_vb?.low))fees="low";
      else fees="normal";
    }

    const hc=finite(t?.hashrateChangePct);
    let hashrate="unknown";
    if(Number.isFinite(hc)){
      if(hc>=finite(th.hashrate_change_pct?.surge))hashrate="surge";
      else if(hc>=finite(th.hashrate_change_pct?.rising))hashrate="rising";
      else if(hc<=finite(th.hashrate_change_pct?.drop))hashrate="drop";
      else if(hc<=finite(th.hashrate_change_pct?.falling))hashrate="falling";
      else hashrate="stable";
    }

    const lc=finite(t?.lightningChannelChangePct);
    let lightning="unknown";
    if(Number.isFinite(lc)){
      if(lc>=finite(th.lightning_channel_change_pct?.growing))lightning="growing";
      else if(lc<=finite(th.lightning_channel_change_pct?.shrinking))lightning="shrinking";
      else lightning="stable";
    }

    return Object.freeze({price,volatility,volume,mempool,fees,hashrate,lightning});
  }

  function matches(rule,cats){
    const req=rule?.requires||{};
    for(const [key,allowed] of Object.entries(req)){
      if(!Array.isArray(allowed)||!allowed.includes(cats[key]))return false;
    }
    return true;
  }

  function evaluate(t,policy){
    const cats=categories(t,policy);
    const rules=[...(policy?.conditions||[])].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
    const active=rules.filter(rule=>matches(rule,cats));
    const winner=active[0]||rules.find(rule=>rule.id===(policy?.fallback||"neutral"))||{id:"neutral",label:"Neutral",priority:0};
    return Object.freeze({categories:cats,active,winner});
  }

  function pool(library,conditionId){
    const enabled=(library?.items||[]).filter(item=>item?.enabled!==false&&item?.src);
    const matched=enabled.filter(item=>Array.isArray(item.conditions)&&item.conditions.includes(conditionId));
    if(matched.length)return matched;
    const neutral=enabled.filter(item=>Array.isArray(item.conditions)&&item.conditions.includes("neutral"));
    return neutral.length?neutral:enabled;
  }

  function pick(library,conditionId,previousId=null){
    let rows=pool(library,conditionId);
    if(rows.length>1&&previousId){
      const without=rows.filter(row=>row.id!==previousId);
      if(without.length)rows=without;
    }
    if(!rows.length)return null;
    const total=rows.reduce((sum,row)=>sum+Math.max(0,finite(row.weight)||1),0);
    let target=cryptoUnit()*Math.max(total,1);
    for(const row of rows){
      target-=Math.max(0,finite(row.weight)||1);
      if(target<=0)return row;
    }
    return rows.at(-1);
  }

  W.ZZXBTCGifPriceConditions=Object.freeze({
    __version:2,
    categories,
    evaluate,
    pool,
    pick
  });
})();
