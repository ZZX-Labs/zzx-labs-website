(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolGogglesModel?.__version>=2)return;

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN;}
  function text(v){return String(v??"").trim();}

  function normalizeTx(row,index){
    if(!row||typeof row!=="object")return null;
    const txid=text(row.txid??row.id??row.hash??row.tx_id);
    let vsize=finite(row.vsize??row.vSize??row.virtual_size??row.virtualSize);
    const weight=finite(row.weight);
    if(!(vsize>0)&&weight>0)vsize=weight/4;
    if(!(vsize>0))vsize=finite(row.size);
    const fee=finite(row.fee??row.fees??row.total_fee??row.totalFee);
    let feeRate=finite(
      row.effectiveFeePerVsize ??
      row.effective_fee_per_vsize ??
      row.feePerVsize ??
      row.fee_rate ??
      row.rate
    );
    if(!(feeRate>=0)&&fee>=0&&vsize>0)feeRate=fee/vsize;
    if(!(vsize>0))return null;
    const value=finite(row.value??row.outputValue??row.output_value);
    return Object.freeze({
      id:txid||`anonymous-${index}`,
      txid:txid||null,
      kind:"transaction",
      fee:Number.isFinite(fee)?fee:null,
      feeRate:Number.isFinite(feeRate)?feeRate:0,
      vbytes:vsize,
      weight:vsize,
      value:Number.isFinite(value)?value:null,
      firstSeen:finite(row.firstSeen??row.first_seen??row.time),
      raw:row
    });
  }

  function transactionTiles(rows,maxTiles){
    const out=[];
    for(let i=0;i<(Array.isArray(rows)?rows:[]).length;i++){
      const tx=normalizeTx(rows[i],i);
      if(tx)out.push(tx);
    }
    out.sort((a,b)=>b.feeRate-a.feeRate||b.vbytes-a.vbytes||a.id.localeCompare(b.id));
    const max=Math.max(100,Number(maxTiles)||6000);
    if(out.length<=max)return out;
    const keep=out.slice(0,max-1);
    const tail=out.slice(max-1);
    const vbytes=tail.reduce((s,row)=>s+row.vbytes,0);
    const fee=tail.reduce((s,row)=>s+(Number(row.fee)||0),0);
    const rate=vbytes>0?fee/vbytes:0;
    keep.push(Object.freeze({
      id:"overflow-aggregate",
      txid:null,
      kind:"aggregate-overflow",
      fee,
      feeRate:rate,
      vbytes,
      weight:vbytes,
      value:null,
      count:tail.length
    }));
    return keep;
  }

  function histogram(rows){
    const out=[];
    for(const row of Array.isArray(rows)?rows:[]){
      if(!Array.isArray(row)||row.length<2)continue;
      const feeRate=finite(row[0]);const vbytes=finite(row[1]);
      if(Number.isFinite(feeRate)&&feeRate>=0&&Number.isFinite(vbytes)&&vbytes>0)out.push({feeRate,vbytes});
    }
    return out.sort((a,b)=>b.feeRate-a.feeRate);
  }

  function consumeCandidate(hist,targetVbytes){
    let left=Math.max(1,finite(targetVbytes)||1_000_000);const bands=[];
    for(const row of hist){if(left<=0)break;const take=Math.min(left,row.vbytes);if(take>0){bands.push({feeRate:row.feeRate,vbytes:take});left-=take;}}
    return {bands,filledVbytes:Math.max(0,targetVbytes-left)};
  }

  function bandsFromFeeRange(range,targetVbytes){
    const fees=(Array.isArray(range)?range:[]).map(finite).filter(Number.isFinite).sort((a,b)=>b-a);
    if(!fees.length)return [];
    const each=targetVbytes/fees.length;
    return fees.map(feeRate=>({feeRate,vbytes:each}));
  }

  function aggregateTiles(bands,candidateVbytes,maxTiles){
    const total=finite(candidateVbytes);if(!(total>0))return [];
    const desired=Math.max(80,Math.min(Number(maxTiles)||6000,700));
    const baseChunk=total/desired;const tiles=[];let seq=0;
    for(const band of bands){
      const amount=finite(band.vbytes);if(!(amount>0))continue;
      const count=Math.max(1,Math.round(amount/baseChunk));const chunk=amount/count;
      for(let i=0;i<count;i++){
        const actual=i===count-1?amount-chunk*(count-1):chunk;
        tiles.push(Object.freeze({
          id:`aggregate-${Number(band.feeRate).toFixed(3)}-${seq++}`,
          txid:null,
          kind:"aggregate-band",
          fee:null,
          feeRate:band.feeRate,
          vbytes:actual,
          weight:actual,
          value:null
        }));
      }
    }
    return tiles;
  }

  function build(payload){
    const block=Array.isArray(payload?.blocks)&&payload.blocks.length?payload.blocks[0]:{};
    const mem=payload?.mempool||{};
    const txRows=Array.isArray(payload?.transactions)?payload.transactions:[];
    const maxTiles=W.ZZXMempoolGogglesSources?.maxTiles||6000;
    let tiles=transactionTiles(txRows,maxTiles);

    let candidateVbytes=finite(block.blockVSize??block.vsize??block.vbytes);
    let candidateTx=finite(block.nTx??block.txCount??block.count);
    if(tiles.length&&tiles.some(row=>row.kind==="transaction")){
      const txOnly=tiles.filter(row=>row.kind==="transaction");
      if(!(candidateVbytes>0))candidateVbytes=txOnly.reduce((s,row)=>s+row.vbytes,0);
      if(!(candidateTx>=0))candidateTx=txRows.length;
    }
    if(!(candidateVbytes>0))candidateVbytes=W.ZZXMempoolGogglesSources?.candidateVbytes||1_000_000;

    const feeRange=(Array.isArray(block.feeRange)?block.feeRange:[]).map(finite).filter(Number.isFinite);
    let mode="transactions";
    let bandMethod="live projected-block transactions";
    if(!tiles.length){
      const hist=histogram(mem.fee_histogram);
      let bands=[];
      if(hist.length){bands=consumeCandidate(hist,candidateVbytes).bands;bandMethod="aggregate mempool fee histogram fallback";}
      if(!bands.length&&feeRange.length){bands=bandsFromFeeRange(feeRange,candidateVbytes);bandMethod="candidate feeRange fallback";}
      tiles=aggregateTiles(bands,candidateVbytes,maxTiles);
      mode="aggregate-fallback";
    }

    const totalFeesSats=finite(block.totalFees??block.total_fees??block.fees);
    const medianFee=finite(block.medianFee??block.medianFeeRate??block.median_fee);
    const tipHeight=finite(payload?.tipHeight);
    const nextHeight=Number.isFinite(tipHeight)?tipHeight+1:NaN;
    const totalFeesBTC=Number.isFinite(totalFeesSats)?totalFeesSats/1e8:NaN;
    const totalFeesUSD=Number.isFinite(totalFeesBTC)&&Number.isFinite(finite(payload?.priceUsd))?totalFeesBTC*finite(payload.priceUsd):NaN;
    const backlogVbytes=finite(mem.vsize);
    const rates=tiles.map(row=>finite(row.feeRate)).filter(Number.isFinite);

    return Object.freeze({
      schema:"zzx-mempool-goggles-model-v2",
      mode,
      tipHeight,
      nextHeight,
      candidateVbytes,
      candidateTx:Number.isFinite(candidateTx)?candidateTx:(mode==="transactions"?txRows.length:NaN),
      totalFeesSats,totalFeesBTC,totalFeesUSD,medianFee,
      feeMin:feeRange.length?Math.min(...feeRange):(rates.length?Math.min(...rates):NaN),
      feeMax:feeRange.length?Math.max(...feeRange):(rates.length?Math.max(...rates):NaN),
      backlogVMB:Number.isFinite(backlogVbytes)?backlogVbytes/1e6:NaN,
      mempoolTx:finite(mem.count),
      tiles:Object.freeze(tiles),
      realTransactionTiles:tiles.filter(row=>row.kind==="transaction").length,
      bandMethod,
      source:text(payload?.source??payload?.base),
      transport:text(payload?.transport),
      liveConnected:payload?.liveConnected===true,
      wsUrl:text(payload?.wsUrl),
      priceSource:text(payload?.priceSource),
      fetchedAt:finite(payload?.fetchedAt)||Date.now()
    });
  }

  W.ZZXMempoolGogglesModel=Object.freeze({
    __version:2,
    normalizeTx,
    transactionTiles,
    histogram,
    consumeCandidate,
    bandsFromFeeRange,
    aggregateTiles,
    build
  });
})();
