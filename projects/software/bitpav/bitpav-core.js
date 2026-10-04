(() => {
"use strict";
function metrics(entries,spot){
  const sorted=[...entries].sort((a,b)=>new Date(a.at)-new Date(b.at));let btc=0,cost=0,realized=0,fees=0;
  const rows=[];
  for(const e of sorted){const q=+e.btc,p=+e.price,fee=+e.fee||0;fees+=fee;
    if(e.type==="buy"){btc+=q;cost+=q*p+fee;}
    else{const avg=btc>0?cost/btc:0,sold=Math.min(q,btc),basis=sold*avg;realized+=sold*p-fee-basis;btc-=sold;cost-=basis;}
    rows.push({...e,btcAfter:btc,costAfter:cost,avgCostAfter:btc>0?cost/btc:0});
  }
  const value=btc*spot,unrealized=value-cost,total=realized+unrealized;
  return{btcHeld:btc,costBasisUsd:cost,averageCostUsd:btc>0?cost/btc:0,marketValueUsd:value,realizedPnlUsd:realized,unrealizedPnlUsd:unrealized,totalPnlUsd:total,totalFeesUsd:fees,returnPct:cost>0?unrealized/cost*100:0,rows};
}
window.BitPavCore=Object.freeze({metrics});
})();
