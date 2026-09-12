// __partials/widgets/mempool/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolModel?.__version>=4)return;

  const BLOCK_VBYTES=1_000_000;

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

    return out.sort((a,b)=>a.rate-b.rate);
  }

  function weightedMedianRate(rows){
    if(!rows.length)return NaN;

    const total=rows.reduce((s,row)=>s+row.vbytes,0);
    if(!(total>0))return NaN;

    let running=0;
    const ordered=rows.slice().sort((a,b)=>a.rate-b.rate);

    for(const row of ordered){
      running+=row.vbytes;
      if(running>=total/2)return row.rate;
    }

    return ordered[ordered.length-1].rate;
  }

  function vbytesAtOrAbove(rows,rate){
    return rows
      .filter(row=>row.rate>=rate)
      .reduce((sum,row)=>sum+row.vbytes,0);
  }

  function backlogDepth(blocks){
    if(!Number.isFinite(blocks))return {label:"unknown",level:"medium"};
    if(blocks<1)return {label:"light",level:"low"};
    if(blocks<4)return {label:"moderate",level:"low"};
    if(blocks<10)return {label:"heavy",level:"medium"};
    if(blocks<25)return {label:"very heavy",level:"medium"};
    return {label:"severe",level:"high"};
  }

  function feePressure(metrics){
    const median=finite(metrics?.medianFeeRate);
    const fast=finite(metrics?.fastFee);
    const ge10=finite(metrics?.ge10Share);

    let score=0;

    if(Number.isFinite(median)){
      if(median>=25)score+=4;
      else if(median>=10)score+=3;
      else if(median>=5)score+=2;
      else if(median>=2)score+=1;
    }

    if(Number.isFinite(fast)){
      if(fast>=50)score+=4;
      else if(fast>=20)score+=3;
      else if(fast>=10)score+=2;
      else if(fast>=3)score+=1;
    }

    if(Number.isFinite(ge10)){
      if(ge10>=0.50)score+=4;
      else if(ge10>=0.20)score+=3;
      else if(ge10>=0.05)score+=2;
      else if(ge10>=0.01)score+=1;
    }

    if(score>=9)return {label:"extreme",level:"high",score};
    if(score>=6)return {label:"high",level:"high",score};
    if(score>=3)return {label:"moderate",level:"medium",score};
    return {label:"low",level:"low",score};
  }

  function normalizeCandidate(row,index){
    const blockVSize=finite(row?.blockVSize ?? row?.block_vsize);
    const blockSize=finite(row?.blockSize ?? row?.block_size);
    const nTx=finite(row?.nTx ?? row?.n_tx ?? row?.tx_count);
    const totalFees=finite(row?.totalFees ?? row?.total_fees);
    const medianFee=finite(row?.medianFee ?? row?.median_fee);
    const feeRange=(Array.isArray(row?.feeRange)?row.feeRange:[])
      .map(finite)
      .filter(Number.isFinite);

    return {
      index,
      blockVSize,
      blockSize,
      nTx,
      totalFees,
      medianFee,
      feeRange
    };
  }

  function build(payload){
    const s=payload?.summary||{};

    const count=finite(s.count);
    const vsize=finite(s.vsize);
    const totalFeeSats=finite(s.total_fee);
    const hist=histogram(s.fee_histogram);

    const vMB=Number.isFinite(vsize)?vsize/1_000_000:NaN;
    const blockEquivalents=Number.isFinite(vsize)?vsize/BLOCK_VBYTES:NaN;

    const totalFeeBTC=
      Number.isFinite(totalFeeSats)
        ? totalFeeSats/1e8
        : NaN;

    const priceUsd=finite(payload?.priceUsd);

    const totalFeeUSD=
      Number.isFinite(totalFeeBTC)&&Number.isFinite(priceUsd)
        ? totalFeeBTC*priceUsd
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

    const ge10Vbytes=vbytesAtOrAbove(hist,10);
    const ge10Share=
      Number.isFinite(vsize)&&vsize>0
        ? ge10Vbytes/vsize
        : NaN;

    const ge1Vbytes=vbytesAtOrAbove(hist,1);
    const ge2Vbytes=vbytesAtOrAbove(hist,2);
    const ge5Vbytes=vbytesAtOrAbove(hist,5);

    const clearMinutes=
      Number.isFinite(blockEquivalents)
        ? blockEquivalents*10
        : NaN;

    const fastFee=finite(
      payload?.feeRecommendations?.fastestFee ??
      payload?.feeRecommendations?.halfHourFee
    );

    const depth=backlogDepth(blockEquivalents);
    const pressure=feePressure({
      medianFeeRate,
      fastFee,
      ge10Share
    });

    const candidates=(Array.isArray(payload?.candidateBlocks)?payload.candidateBlocks:[])
      .map(normalizeCandidate);

    const next=candidates[0]||null;

    const candidateVsize=candidates
      .map(row=>row.blockVSize)
      .filter(Number.isFinite)
      .reduce((sum,value)=>sum+value,0);

    const candidateTx=candidates
      .map(row=>row.nTx)
      .filter(Number.isFinite)
      .reduce((sum,value)=>sum+value,0);

    const candidateFees=candidates
      .map(row=>row.totalFees)
      .filter(Number.isFinite)
      .reduce((sum,value)=>sum+value,0);

    return {
      schema:"zzx-mempool-model-v4",
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
      ge1Vbytes,
      ge2Vbytes,
      ge5Vbytes,
      ge10Vbytes,
      ge10Share,
      clearMinutes,
      depth,
      pressure,
      condition:`${depth.label} backlog · ${pressure.label} fee pressure`,
      fastFee,
      histogram:hist,
      priceUsd,
      priceSource:String(payload?.priceSource||""),
      priceMode:String(payload?.priceMode||""),
      source:String(payload?.source||""),
      candidateSource:String(payload?.candidateSource||""),
      candidates,
      nextCandidate:next,
      candidateCount:candidates.length,
      candidateVsize,
      candidateTx,
      candidateFees,
      fetchedAt:finite(payload?.fetchedAt)
    };
  }

  W.ZZXMempoolModel=Object.freeze({
    __version:4,
    BLOCK_VBYTES,
    histogram,
    weightedMedianRate,
    vbytesAtOrAbove,
    backlogDepth,
    feePressure,
    normalizeCandidate,
    build
  });
})();
