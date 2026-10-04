(()=>{"use strict";
class CEXResearchEngine{
 constructor(seed=1){this.seed=seed>>>0||1}
 rand(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296}
 normal(){let u=0,v=0;while(!u)u=this.rand();while(!v)v=this.rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
 orderBook(mid=60000,levels=12,step=10,depth=1.5){
   const bids=[],asks=[];
   for(let i=1;i<=levels;i++){
      const px=step*i,shape=depth*(1+i*.18)*(0.65+this.rand()*.7);
      bids.push({price:mid-px,btc:+shape.toFixed(6)});
      asks.push({price:mid+px,btc:+(shape*(0.8+this.rand()*.4)).toFixed(6)});
   }
   return{mid,bids,asks}
 }
 execute(book,side,btc,feeBps=20){
   const levels=side==="buy"?book.asks:book.bids;let remaining=btc,notional=0,filled=0;
   const fills=[];
   for(const l of levels){if(remaining<=0)break;const q=Math.min(remaining,l.btc);remaining-=q;filled+=q;notional+=q*l.price;fills.push({price:l.price,btc:q})}
   const avg=filled?notional/filled:0,fee=notional*feeBps/10000;
   return{side,requestedBtc:btc,filledBtc:filled,unfilledBtc:remaining,avgPrice:avg,notional,fee,totalCash:side==="buy"?notional+fee:notional-fee,fills}
 }
 backtest({days=180,start=60000,vol=.035,drift=.0002,feeBps=20,strategy="dca",cash=10000}){
   let price=start,btc=0,c=cash,peak=cash,maxDD=0;const series=[];
   for(let d=0;d<days;d++){
      price*=Math.exp((drift-.5*vol*vol)+vol*this.normal());
      let spend=0;
      if(strategy==="dca")spend=Math.min(c,cash/days);
      if(strategy==="dip"&&series.length&&price<series.at(-1).price*.97)spend=Math.min(c,cash*.05);
      if(strategy==="momentum"&&series.length&&price>series.at(-1).price*1.015)spend=Math.min(c,cash*.035);
      if(spend>0){const fee=spend*feeBps/10000,net=spend-fee;btc+=net/price;c-=spend}
      const equity=c+btc*price;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,(peak-equity)/peak);
      series.push({day:d+1,price,equity,cash:c,btc});
   }
   const end=series.at(-1);return{series,summary:{startCash:cash,endEquity:end.equity,endPrice:end.price,btc:end.btc,returnPct:(end.equity/cash-1)*100,maxDrawdownPct:maxDD*100}}
 }
}
window.CEXResearchEngine=CEXResearchEngine;
})();
