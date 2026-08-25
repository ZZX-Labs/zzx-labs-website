(()=>{"use strict";
class DEXResearchEngine{
 constructor(reserveBTC=100,reserveQuote=6000000,feeBps=30){this.x=reserveBTC;this.y=reserveQuote;this.feeBps=feeBps}
 mid(){return this.y/this.x}
 quoteBTCIn(btc){
   const fee=btc*this.feeBps/10000,dx=btc-fee,k=this.x*this.y,newX=this.x+dx,newY=k/newX,out=this.y-newY;
   return{side:"sell-btc",inputBTC:btc,feeBTC:fee,outputQuote:out,avgPrice:out/btc,priceBefore:this.mid(),priceAfter:newY/newX}
 }
 quoteQuoteIn(q){
   const fee=q*this.feeBps/10000,dy=q-fee,k=this.x*this.y,newY=this.y+dy,newX=k/newY,out=this.x-newX;
   return{side:"buy-btc",inputQuote:q,feeQuote:fee,outputBTC:out,avgPrice:q/out,priceBefore:this.mid(),priceAfter:newY/newX}
 }
 route(amountBTC,pools){
   const results=pools.map(p=>{const e=new DEXResearchEngine(p.btc,p.quote,p.feeBps);const q=e.quoteBTCIn(amountBTC);return{...p,outputQuote:q.outputQuote,avgPrice:q.avgPrice,slippagePct:(1-q.avgPrice/q.priceBefore)*100}});
   results.sort((a,b)=>b.outputQuote-a.outputQuote);return results;
 }
 liquidityShares(addBTC,addQuote){
   const ratio=this.y/this.x,requiredQuote=addBTC*ratio,usedQuote=Math.min(addQuote,requiredQuote),usedBTC=usedQuote/ratio;
   return{usedBTC,usedQuote,unusedBTC:addBTC-usedBTC,unusedQuote:addQuote-usedQuote,poolPrice:ratio}
 }
}
window.DEXResearchEngine=DEXResearchEngine;
})();
