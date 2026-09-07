(function(){
  "use strict";
  const W=window;
  if(W.ZZXIChingModel?.__version>=3)return;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function portfolio(lots,currentPrice){
    const rows=Array.isArray(lots)?lots:[],current=finite(currentPrice);
    let btc=0,cost=0;
    for(const lot of rows){
      const b=finite(lot?.btc),u=finite(lot?.usd);
      if(b>0)btc+=b;if(u>0)cost+=u;
    }
    const value=Number.isFinite(current)&&btc>0?btc*current:btc===0?0:NaN;
    const average=btc>0?cost/btc:NaN;
    const gain=Number.isFinite(value)?value-cost:NaN;
    const returnPct=cost>0&&Number.isFinite(gain)?gain/cost*100:NaN;
    return {btc,sats:btc*1e8,cost,value,average,gain,returnPct,lotCount:rows.length};
  }

  function lotMetrics(lot,currentPrice){
    const price=finite(currentPrice),btc=finite(lot?.btc),cost=finite(lot?.usd);
    const value=Number.isFinite(price)&&btc>0?btc*price:NaN;
    const gain=Number.isFinite(value)&&cost>0?value-cost:NaN;
    const returnPct=cost>0&&Number.isFinite(gain)?gain/cost*100:NaN;
    return {value,gain,returnPct};
  }

  W.ZZXIChingModel=Object.freeze({__version:3,portfolio,lotMetrics});
})();
