// __partials/widgets/mempool-specs/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsModel?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeHistogram(hist){
    const rows=[];

    for(const row of Array.isArray(hist)?hist:[]){
      if(!Array.isArray(row)||row.length<2)continue;
      const feeRate=finite(row[0]);
      const vbytes=finite(row[1]);

      if(Number.isFinite(feeRate)&&feeRate>=0&&Number.isFinite(vbytes)&&vbytes>0){
        rows.push({feeRate,vbytes});
      }
    }

    return rows.sort((a,b)=>b.feeRate-a.feeRate);
  }

  function candidateBands(hist,targetVbytes){
    const rows=normalizeHistogram(hist);
    let left=Math.max(1,finite(targetVbytes)||1_000_000);
    const out=[];

    for(const row of rows){
      if(left<=0)break;
      const take=Math.min(left,row.vbytes);
      if(take>0){
        out.push({feeRate:row.feeRate,vbytes:take});
        left-=take;
      }
    }

    return out;
  }

  function bandsFromFirstBlock(block,targetVbytes){
    if(!block||typeof block!=="object")return [];

    const range=(Array.isArray(block.feeRange)?block.feeRange:[])
      .map(finite)
      .filter(Number.isFinite)
      .sort((a,b)=>b-a);

    if(!range.length)return [];

    const vb=finite(
      block.blockVSize ??
      block.vsize ??
      block.vbytes ??
      targetVbytes
    );

    const total=Number.isFinite(vb)&&vb>0?vb:targetVbytes;
    const each=total/range.length;

    return range.map(rate=>({
      feeRate:rate,
      vbytes:each
    }));
  }

  function recentTx(row,index){
    if(typeof row==="string"){
      return {
        txid:row,
        vbytes:NaN,
        feeRate:NaN,
        realTx:true,
        rawTx:null
      };
    }

    if(!row||typeof row!=="object")return null;

    const txid=String(row.txid||row.hash||row.id||"");
    if(!txid)return null;

    const weight=finite(row.weight);
    const vbytes=finite(
      row.vsize ??
      row.vbytes ??
      (Number.isFinite(weight)?weight/4:row.size)
    );

    const fee=finite(row.fee);
    const explicitRate=finite(
      row.feeRate ??
      row.fee_rate ??
      row.feerate ??
      row.feePerVb
    );

    const feeRate=Number.isFinite(explicitRate)
      ? explicitRate
      : Number.isFinite(fee)&&Number.isFinite(vbytes)&&vbytes>0
        ? fee/vbytes
        : NaN;

    return {
      ...row,
      txid,
      vbytes,
      feeRate,
      realTx:true,
      rawTx:row
    };
  }

  function build(payload){
    const mem=payload?.mempool||{};
    const blocks=Array.isArray(payload?.blocks)?payload.blocks:[];
    const first=blocks[0]||null;

    const count=finite(mem.count);
    const vbytes=finite(mem.vsize ?? mem.vbytes);
    const backlogVMB=Number.isFinite(vbytes)?vbytes/1e6:NaN;

    const candidateVbytes=finite(
      first?.blockVSize ??
      first?.vsize ??
      first?.vbytes ??
      payload?.cfg?.candidateVbytes ??
      1_000_000
    );

    let bands=candidateBands(
      mem.fee_histogram,
      Number.isFinite(candidateVbytes)?candidateVbytes:1_000_000
    );

    let bandSource="fee_histogram";

    if(!bands.length){
      bands=bandsFromFirstBlock(
        first,
        Number.isFinite(candidateVbytes)?candidateVbytes:1_000_000
      );
      bandSource="mempool-blocks feeRange";
    }

    const candidateTx=finite(
      first?.nTx ??
      first?.txCount ??
      first?.count
    );

    const candidateMedian=finite(
      first?.medianFee ??
      first?.medianFeeRate ??
      first?.median_fee
    );

    const candidateMin=finite(
      first?.feeRange?.[0] ??
      first?.minFee ??
      first?.minimumFee
    );

    const recent=(Array.isArray(payload?.recent)?payload.recent:[])
      .map(recentTx)
      .filter(Boolean)
      .slice(0,payload?.cfg?.recentLimit||20);

    return {
      count,
      vbytes,
      backlogVMB,
      candidateVbytes:Number.isFinite(candidateVbytes)?candidateVbytes:NaN,
      candidateTx,
      candidateMedian,
      candidateMin,
      bands,
      bandSource,
      recent,
      tipHeight:finite(payload?.tipHeight),
      priceUsd:finite(payload?.priceUsd),
      priceSource:String(payload?.priceSource||""),
      source:String(payload?.cfg?.apiBase||""),
      fetchedAt:finite(payload?.fetchedAt)
    };
  }

  W.ZZXMempoolSpecsModel=Object.freeze({
    __version:3,
    normalizeHistogram,
    candidateBands,
    bandsFromFirstBlock,
    recentTx,
    build
  });
})();
