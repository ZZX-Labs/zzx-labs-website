(()=>{"use strict";
class PeerDEXResearchEngine{
  constructor(seed=1){this.seed=seed>>>0||1;this.engineVersion="0.3.0"}
  rand(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296}
  normal(){let u=0,v=0;while(!u)u=this.rand();while(!v)v=this.rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
  offers(mid=84000,count=16,spreadBps=25,depth=.12){
    const out=[];
    for(let i=0;i<count;i++){
      const side=i%2?"buy":"sell";
      const distance=(spreadBps/10000)*(1+Math.floor(i/2)*.42);
      const jitter=(this.rand()-.5)*distance*.22;
      const price=mid*(1+(side==="sell"?1:-1)*(distance+jitter));
      const qty=depth*(.35+this.rand()*1.35)*(1+i*.035);
      out.push({
        id:`offer-${i+1}`,maker:`peer-${1+i%9}`,side,
        price:+price.toFixed(2),btc:+qty.toFixed(8),
        rail:i%3===0?"lightning":"onchain-psbt",
        relay:`relay-${1+i%3}`,latencyMs:20+Math.floor(this.rand()*210),
        reliability:+(.78+this.rand()*.215).toFixed(4)
      });
    }
    return out;
  }
  route(offers,side,btc,maxPeers=4){
    const opp=side==="buy"?"sell":"buy";
    const c=offers.filter(o=>o.side===opp).sort((a,b)=>side==="buy"?a.price-b.price:b.price-a.price);
    let rem=btc,notional=0;const legs=[];
    for(const o of c){
      if(rem<=1e-12||legs.length>=maxPeers)break;
      const q=Math.min(rem,o.btc);
      legs.push({...o,fillBtc:+q.toFixed(8),notional:q*o.price});
      rem-=q;notional+=q*o.price;
    }
    const filled=btc-rem,avg=filled?notional/filled:0;
    const best=c[0]?.price||0;
    const slip=best&&avg?Math.abs(avg-best)/best*10000:0;
    return {side,requestedBtc:btc,filledBtc:filled,unfilledBtc:Math.max(0,rem),averagePrice:avg,bestPrice:best,slippageBps:slip,legs};
  }
  monteCarlo({mid=84000,iterations=1000,btc=.1,spreadBps=25,peerFailure=.08,maxPeers=4}={}){
    const fills=[],slips=[],peerCounts=[];
    for(let k=0;k<iterations;k++){
      let os=this.offers(mid,20,spreadBps,.10).filter(()=>this.rand()>peerFailure);
      const r=this.route(os,"buy",btc,maxPeers);
      fills.push(r.filledBtc/btc);slips.push(r.slippageBps);peerCounts.push(r.legs.length);
    }
    const mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1),sorted=[...slips].sort((a,b)=>a-b);
    return {
      iterations,requestedBtc:btc,peerFailure,
      fillRateMean:mean(fills),
      slippageBpsMean:mean(slips),
      slippageBpsP95:sorted[Math.floor(sorted.length*.95)]||0,
      meanPeers:mean(peerCounts)
    };
  }
  concentration(offers){
    const totals={};for(const o of offers)totals[o.maker]=(totals[o.maker]||0)+o.btc;
    const sum=Object.values(totals).reduce((s,x)=>s+x,0)||1;
    const shares=Object.entries(totals).map(([maker,btc])=>({maker,btc,share:btc/sum})).sort((a,b)=>b.share-a.share);
    const hhi=shares.reduce((s,x)=>s+x.share*x.share,0)*10000;
    return {hhi,makers:shares.length,topMakerShare:shares[0]?.share||0,shares};
  }
}
window.PeerDEXResearchEngine=PeerDEXResearchEngine;
})();
