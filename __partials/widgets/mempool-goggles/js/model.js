// __partials/widgets/mempool-goggles/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolGogglesModel?.__version>=1)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function histogram(rows){
    const out=[];

    for(const row of Array.isArray(rows)?rows:[]){
      if(!Array.isArray(row)||row.length<2)continue;
      const feeRate=finite(row[0]);
      const vbytes=finite(row[1]);

      if(
        Number.isFinite(feeRate)&&feeRate>=0 &&
        Number.isFinite(vbytes)&&vbytes>0
      ){
        out.push({feeRate,vbytes});
      }
    }

    return out.sort((a,b)=>b.feeRate-a.feeRate);
  }

  function consumeCandidate(hist,targetVbytes){
    let left=Math.max(1,finite(targetVbytes)||1_000_000);
    const bands=[];

    for(const row of hist){
      if(left<=0)break;
      const take=Math.min(left,row.vbytes);

      if(take>0){
        bands.push({
          feeRate:row.feeRate,
          vbytes:take
        });
        left-=take;
      }
    }

    return {
      bands,
      filledVbytes:Math.max(0,targetVbytes-left)
    };
  }

  function bandsFromFeeRange(range,targetVbytes){
    const fees=(Array.isArray(range)?range:[])
      .map(finite)
      .filter(Number.isFinite)
      .sort((a,b)=>b-a);

    if(!fees.length)return [];

    const each=targetVbytes/fees.length;
    return fees.map(feeRate=>({
      feeRate,
      vbytes:each
    }));
  }

  function splitBands(bands,candidateVbytes,candidateTx,maxTiles){
    const total=finite(candidateVbytes);
    if(!(total>0))return [];

    const tx=finite(candidateTx);
    const desired=Math.max(
      80,
      Math.min(
        Number(maxTiles)||1200,
        Number.isFinite(tx)&&tx>0
          ? Math.round(tx)
          : 700
      )
    );

    const baseChunk=total/desired;
    const tiles=[];
    let seq=0;

    for(const band of bands){
      let left=finite(band.vbytes);
      if(!(left>0))continue;

      const tileCount=Math.max(1,Math.round(left/baseChunk));
      const chunk=left/tileCount;

      for(let i=0;i<tileCount;i++){
        const actual=i===tileCount-1
          ? left-chunk*(tileCount-1)
          : chunk;

        const estTx=
          Number.isFinite(tx)&&tx>0
            ? tx*(actual/total)
            : NaN;

        tiles.push({
          id:`goggle-${seq++}`,
          feeRate:band.feeRate,
          vbytes:actual,
          weight:actual,
          estimatedTx:estTx
        });
      }
    }

    if(tiles.length>maxTiles){
      // Deterministic coalescing keeps the canvas bounded without randomness.
      const step=Math.ceil(tiles.length/maxTiles);
      const compact=[];

      for(let i=0;i<tiles.length;i+=step){
        const group=tiles.slice(i,i+step);
        const vbytes=group.reduce((s,row)=>s+row.vbytes,0);
        const weightedFee=group.reduce(
          (s,row)=>s+row.feeRate*row.vbytes,
          0
        )/Math.max(vbytes,1);

        compact.push({
          id:`goggle-c-${compact.length}`,
          feeRate:weightedFee,
          vbytes,
          weight:vbytes,
          estimatedTx:group.reduce(
            (s,row)=>s+(Number.isFinite(row.estimatedTx)?row.estimatedTx:0),
            0
          )
        });
      }

      return compact;
    }

    return tiles;
  }

  function build(payload){
    const block=Array.isArray(payload?.blocks)&&payload.blocks.length
      ? payload.blocks[0]
      : {};

    const mem=payload?.mempool||{};

    const candidateVbytes=finite(
      block.blockVSize ??
      block.vsize ??
      block.vbytes ??
      W.ZZXMempoolGogglesSources.candidateVbytes
    );

    const candidateTx=finite(
      block.nTx ??
      block.txCount ??
      block.count
    );

    const totalFeesSats=finite(
      block.totalFees ??
      block.total_fees ??
      block.fees
    );

    const medianFee=finite(
      block.medianFee ??
      block.medianFeeRate ??
      block.median_fee
    );

    const feeRange=(Array.isArray(block.feeRange)?block.feeRange:[])
      .map(finite)
      .filter(Number.isFinite);

    const hist=histogram(mem.fee_histogram);

    let bands=[];
    let bandMethod="";

    if(hist.length){
      const consumed=consumeCandidate(hist,candidateVbytes);
      bands=consumed.bands;
      bandMethod="mempool fee histogram";
    }

    if(!bands.length&&feeRange.length){
      bands=bandsFromFeeRange(feeRange,candidateVbytes);
      bandMethod="candidate feeRange approximation";
    }

    const tiles=splitBands(
      bands,
      candidateVbytes,
      candidateTx,
      W.ZZXMempoolGogglesSources.maxTiles
    );

    const backlogVbytes=finite(mem.vsize);
    const backlogVMB=Number.isFinite(backlogVbytes)
      ? backlogVbytes/1e6
      : NaN;

    const tipHeight=finite(payload?.tipHeight);
    const nextHeight=Number.isFinite(tipHeight)
      ? tipHeight+1
      : NaN;

    const totalFeesBTC=Number.isFinite(totalFeesSats)
      ? totalFeesSats/1e8
      : NaN;

    const totalFeesUSD=
      Number.isFinite(totalFeesBTC)&&Number.isFinite(finite(payload?.priceUsd))
        ? totalFeesBTC*finite(payload.priceUsd)
        : NaN;

    return {
      tipHeight,
      nextHeight,
      candidateVbytes,
      candidateTx,
      totalFeesSats,
      totalFeesBTC,
      totalFeesUSD,
      medianFee,
      feeMin:feeRange.length?Math.min(...feeRange):NaN,
      feeMax:feeRange.length?Math.max(...feeRange):NaN,
      backlogVMB,
      mempoolTx:finite(mem.count),
      tiles,
      bandMethod,
      source:String(payload?.source||""),
      priceSource:String(payload?.priceSource||""),
      fetchedAt:finite(payload?.fetchedAt)
    };
  }

  W.ZZXMempoolGogglesModel=Object.freeze({
    __version:1,
    histogram,
    consumeCandidate,
    bandsFromFeeRange,
    splitBands,
    build
  });
})();
