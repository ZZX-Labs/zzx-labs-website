// __partials/widgets/mempool/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolModel?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function histogram(rows){
    const out=[];

    for(const row of Array.isArray(rows)?rows:[]){
      if(!Array.isArray(row)||row.length<2)continue;

      const rate=finite(row[0]);
      const vbytes=finite(row[1]);

      if(
        Number.isFinite(rate)&&rate>=0 &&
        Number.isFinite(vbytes)&&vbytes>0
      ){
        out.push({rate,vbytes});
      }
    }

    return out.sort((a,b)=>b.rate-a.rate);
  }

  function weightedMedianRate(rows){
    if(!rows.length)return NaN;

    const total=rows.reduce((s,row)=>s+row.vbytes,0);
    if(!(total>0))return NaN;

    let running=0;

    for(const row of rows){
      running+=row.vbytes;
      if(running>=total/2)return row.rate;
    }

    return rows[rows.length-1].rate;
  }

  function condition(blocks){
    if(!Number.isFinite(blocks))return "unknown";
    if(blocks<1)return "light";
    if(blocks<4)return "moderate";
    if(blocks<10)return "heavy";
    return "severe";
  }

  function build(payload){
    const s=payload?.summary||{};

    const count=finite(s.count);
    const vsize=finite(s.vsize);
    const totalFeeSats=finite(s.total_fee);
    const hist=histogram(s.fee_histogram);

    const vMB=Number.isFinite(vsize)?vsize/1_000_000:NaN;
    const blockEquivalents=vMB;

    const totalFeeBTC=
      Number.isFinite(totalFeeSats)
        ? totalFeeSats/1e8
        : NaN;

    const totalFeeUSD=
      Number.isFinite(totalFeeBTC)&&Number.isFinite(finite(payload?.priceUsd))
        ? totalFeeBTC*finite(payload.priceUsd)
        : NaN;

    const meanFeeRate=
      Number.isFinite(totalFeeSats)&&Number.isFinite(vsize)&&vsize>0
        ? totalFeeSats/vsize
        : NaN;

    const medianFeeRate=weightedMedianRate(hist);

    const avgTxVbytes=
      Number.isFinite(vsize)&&Number.isFinite(count)&&count>0
        ? vsize/count
        : NaN;

    const ge10Vbytes=hist
      .filter(row=>row.rate>=10)
      .reduce((s,row)=>s+row.vbytes,0);

    const ge10Share=
      Number.isFinite(vsize)&&vsize>0
        ? ge10Vbytes/vsize
        : NaN;

    const clearMinutes=
      Number.isFinite(blockEquivalents)
        ? blockEquivalents*10
        : NaN;

    const fastFee=finite(
      payload?.feeRecommendations?.fastestFee ??
      payload?.feeRecommendations?.halfHourFee
    );

    return {
      count,
      vsize,
      vMB,
      blockEquivalents,
      totalFeeSats,
      totalFeeBTC,
      totalFeeUSD,
      meanFeeRate,
      medianFeeRate,
      avgTxVbytes,
      ge10Vbytes,
      ge10Share,
      clearMinutes,
      condition:condition(blockEquivalents),
      fastFee,
      histogram:hist,
      priceUsd:finite(payload?.priceUsd),
      priceSource:String(payload?.priceSource||""),
      source:String(payload?.source||""),
      fetchedAt:finite(payload?.fetchedAt)
    };
  }

  W.ZZXMempoolModel=Object.freeze({
    __version:3,
    histogram,
    weightedMedianRate,
    build
  });
})();
