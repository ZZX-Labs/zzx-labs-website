(() => {
"use strict";
function effective(v,side,slipBpsPerBtc=5,qty=0){const px=side==="buy"?v.ask:v.bid,fee=v.feeBps/10000,slip=(slipBpsPerBtc/10000)*(qty/Math.max(v.depthBtc,.00000001));return side==="buy"?px*(1+fee+slip):px*(1-fee-slip);}
function route(venues,side,qty,slip=5){let remain=qty;const sorted=[...venues].sort((a,b)=>effective(a,side,slip,Math.min(qty,a.depthBtc))-effective(b,side,slip,Math.min(qty,b.depthBtc)))*(side==="buy"?1:-1),fills=[];for(const v of sorted){if(remain<=0)break;const q=Math.min(remain,Math.max(0,v.depthBtc)),px=effective(v,side,slip,q);if(q>0){fills.push({venue:v.name,qtyBtc:q,effectivePrice: px,notionalUsd:q*px});remain-=q;}}const filled=fills.reduce((s,x)=>s+x.qtyBtc,0),notional=fills.reduce((s,x)=>s+x.notionalUsd,0);return{side,requestedBtc:qty,filledBtc:filled,unfilledBtc:Math.max(0,remain),averageEffectivePrice:filled?notional/filled:null,notionalUsd:notional,fills};}
function rebalance(btc,cash,price,targetPct){const total=btc*price+cash,targetBtcValue=total*targetPct/100,current=btc*price,diff=targetBtcValue-current;return{portfolioUsd:total,currentBtcPct:total?current/total*100:0,targetBtcPct:targetPct,action:diff>0?"buy":diff<0?"sell":"none",usdDelta:Math.abs(diff),btcDelta:price?Math.abs(diff)/price:0};}
window.BitBrokerCore=Object.freeze({effective,route,rebalance});
})();
