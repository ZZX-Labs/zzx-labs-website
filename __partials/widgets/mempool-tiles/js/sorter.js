// __partials/widgets/mempool-tiles/js/sorter.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesSorter?.__version>=1)return;

  function finite(value,fallback=-Infinity){
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }

  function hash32(text,seed=0){
    let h=(seed>>>0)^0x9e3779b9;
    const s=String(text||"");

    for(let i=0;i<s.length;i++){
      h=Math.imul(h^s.charCodeAt(i),0x01000193);
      h^=h>>>13;
    }

    return h>>>0;
  }

  function sort(items,mode="priority",seed=0){
    const rows=(Array.isArray(items)?items:[]).slice();

    const comparator=(a,b)=>{
      if(mode==="fee"){
        return finite(b.packageFeeRate??b.feeRate)-finite(a.packageFeeRate??a.feeRate);
      }

      if(mode==="size"){
        return finite(b.vsize)-finite(a.vsize);
      }

      if(mode==="value"){
        return finite(b.valueSats)-finite(a.valueSats);
      }

      if(mode==="age"){
        return finite(a.firstSeen,Infinity)-finite(b.firstSeen,Infinity);
      }

      if(mode==="rbf"){
        const ar=a.rbf?1:0;
        const br=b.rbf?1:0;
        if(br!==ar)return br-ar;
      }

      if(mode==="type"){
        const at=String(a.type||"");
        const bt=String(b.type||"");
        const c=at.localeCompare(bt);
        if(c)return c;
      }

      if(mode==="shuffle"){
        return hash32(a.txid,seed)-hash32(b.txid,seed);
      }

      const ar=finite(a.rank,Number.MAX_SAFE_INTEGER);
      const br=finite(b.rank,Number.MAX_SAFE_INTEGER);
      if(ar!==br)return ar-br;

      const af=finite(a.packageFeeRate??a.feeRate);
      const bf=finite(b.packageFeeRate??b.feeRate);
      if(bf!==af)return bf-af;

      return String(a.txid).localeCompare(String(b.txid));
    };

    return rows.sort(comparator);
  }

  W.ZZXMempoolTilesSorter=Object.freeze({
    __version:1,
    hash32,
    sort
  });
})();
