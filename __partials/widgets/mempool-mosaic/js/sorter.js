(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicSorter?.__version>=2)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  function hash(text,seed=0){let h=(2166136261^(seed>>>0))>>>0;for(const c of String(text||"")){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h>>>0}
  function value(row){return finite(row?.valueSats)}
  function rate(row){return finite(row?.packageFeeRate??row?.feeRate)}
  function vsize(row){return finite(row?.vsize??row?.vbytes)}
  function age(row){return finite(row?.timeMs)}
  function metricWeight(row){
    const sats=value(row);if(Number.isFinite(sats)&&sats>=0)return Math.max(1,Math.sqrt(sats+1));
    const vb=vsize(row);return Math.max(1,Math.sqrt((Number.isFinite(vb)?vb:1)*1000));
  }
  function compareNumber(a,b,dir=-1){const aa=Number.isFinite(a)?a:(dir<0?-Infinity:Infinity),bb=Number.isFinite(b)?b:(dir<0?-Infinity:Infinity);return dir*(aa-bb)}
  function sort(rows,mode="mosaic",seed=0){
    const list=(rows||[]).slice();
    const byHash=(a,b)=>hash(a.txid,seed)-hash(b.txid,seed)||String(a.txid).localeCompare(String(b.txid));
    if(mode==="fee")list.sort((a,b)=>compareNumber(rate(a),rate(b),-1)||compareNumber(value(a),value(b),-1)||byHash(a,b));
    else if(mode==="value")list.sort((a,b)=>compareNumber(value(a),value(b),-1)||compareNumber(rate(a),rate(b),-1)||byHash(a,b));
    else if(mode==="vsize")list.sort((a,b)=>compareNumber(vsize(a),vsize(b),-1)||compareNumber(rate(a),rate(b),-1)||byHash(a,b));
    else if(mode==="age")list.sort((a,b)=>compareNumber(age(a),age(b),1)||compareNumber(rate(a),rate(b),-1)||byHash(a,b));
    else if(mode==="shuffle")list.sort(byHash);
    else{
      const finiteRates=list.map(rate).filter(Number.isFinite).sort((a,b)=>a-b);const q=i=>finiteRates.length?finiteRates[Math.min(finiteRates.length-1,Math.floor((finiteRates.length-1)*i))]:0;const cuts=[q(.2),q(.4),q(.6),q(.8)];
      const band=r=>{const x=rate(r);if(!Number.isFinite(x))return 0;let b=0;while(b<cuts.length&&x>cuts[b])b++;return b};
      list.sort((a,b)=>band(b)-band(a)||((hash(a.txid,seed)%7)-(hash(b.txid,seed)%7))||compareNumber(value(a),value(b),-1)||byHash(a,b));
    }
    return list;
  }
  W.ZZXMempoolMosaicSorter=Object.freeze({__version:2,hash,metricWeight,sort,modes:Object.freeze(["mosaic","fee","value","vsize","age","shuffle"])});
})();
