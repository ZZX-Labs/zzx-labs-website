// __partials/widgets/mempool-specs/js/adapter.js
// v5 — complete normalizer / compatibility adapter
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Adapter?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const string=v=>v==null||String(v)===""?null:String(v);

  function normalizeHistogram(hist){
    const out=[];
    for(const row of Array.isArray(hist)?hist:[]){
      let fee,vbytes;
      if(Array.isArray(row)){
        fee=Number(row[0]);
        vbytes=Number(row[1]);
      }else if(row&&typeof row==="object"){
        fee=Number(row.feeRate??row.fee??row.rate??row[0]);
        vbytes=Number(row.vbytes??row.vb??row.vsize??row.size??row[1]);
      }
      if(Number.isFinite(fee)&&fee>=0&&Number.isFinite(vbytes)&&vbytes>0){
        out.push([fee,vbytes]);
      }
    }
    return out.sort((a,b)=>b[0]-a[0]);
  }

  function normalizeCandidateBlocks(blocks){
    return (Array.isArray(blocks)?blocks:[]).map((b,index)=>{
      const feeRange=(Array.isArray(b?.feeRange)?b.feeRange:[])
        .map(Number)
        .filter(Number.isFinite);

      return {
        index,
        nTx:finite(b?.nTx??b?.n_tx??b?.tx_count),
        blockVSize:finite(b?.blockVSize??b?.block_vsize??b?.vsize??b?.vbytes),
        blockSize:finite(b?.blockSize??b?.block_size??b?.size),
        totalFees:finite(b?.totalFees??b?.total_fees),
        medianFee:finite(b?.medianFee??b?.median_fee),
        feeRange
      };
    });
  }

  function histogramFromMempoolBlocks(blocks){
    const out=[];
    for(const b of normalizeCandidateBlocks(blocks)){
      if(!(b.blockVSize>0)||!b.feeRange.length)continue;
      const sorted=b.feeRange.slice().sort((a,z)=>a-z);
      const fee=sorted[Math.floor(sorted.length/2)];
      if(Number.isFinite(fee))out.push([fee,b.blockVSize]);
    }
    return out.sort((a,b)=>b[0]-a[0]);
  }

  function parse(payload){
    const out={
      tipHeight:null,
      tipHash:null,
      count:null,
      vbytes:null,
      totalFee:null,
      feeHistogram:[],
      candidateBlocks:[],
      txids:[],
      recent:[],
      source:null
    };

    if(!payload)return out;

    if(Array.isArray(payload)){
      out.candidateBlocks=normalizeCandidateBlocks(payload);
      out.feeHistogram=histogramFromMempoolBlocks(payload);
      return out;
    }

    if(typeof payload!=="object")return out;

    out.tipHeight=finite(payload.tipHeight??payload.height);
    out.tipHash=string(payload.tipHash??payload.hash);
    out.source=string(payload.source);

    const mem=payload.mempool&&typeof payload.mempool==="object"&&!Array.isArray(payload.mempool)
      ? payload.mempool
      : payload;

    out.count=finite(mem?.count??payload.count);
    out.vbytes=finite(mem?.vsize??mem?.vbytes??payload.vsize??payload.vbytes);
    out.totalFee=finite(mem?.total_fee??mem?.totalFee??payload.total_fee??payload.totalFee);

    out.feeHistogram=normalizeHistogram(
      payload.feeHistogram ??
      payload.fee_histogram ??
      mem?.fee_histogram ??
      mem?.feeHistogram
    );

    out.candidateBlocks=normalizeCandidateBlocks(
      payload.blocks ??
      payload.candidateBlocks ??
      payload.mempoolBlocks
    );

    if(!out.feeHistogram.length&&out.candidateBlocks.length){
      out.feeHistogram=histogramFromMempoolBlocks(out.candidateBlocks);
    }

    out.txids=(Array.isArray(payload.txids)?payload.txids:[])
      .map(String)
      .filter(Boolean);

    out.recent=Array.isArray(payload.recent)?payload.recent.slice():[];
    return out;
  }

  NS.Adapter=Object.freeze({
    __version:5,
    parse,
    normalizeHistogram,
    normalizeCandidateBlocks,
    histogramFromMempoolBlocks
  });
})();
