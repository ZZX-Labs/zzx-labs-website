// __partials/widgets/mempool-specs/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsModel?.__version>=5)return;

  const SATS=100_000_000;
  const BLOCK_VBYTES=1_000_000;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function clamp(n,a,b){
    return Math.max(a,Math.min(b,n));
  }

  function timestampMs(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<=0)return NaN;
    const a=Math.abs(n);
    if(a<1e11)return n*1000;
    if(a<1e14)return n;
    if(a<1e17)return n/1000;
    return n/1e6;
  }

  function median(values){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return NaN;
    const mid=Math.floor(a.length/2);
    return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
  }

  function normalizeHistogram(hist){
    const out=[];

    for(const row of Array.isArray(hist)?hist:[]){
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

  function normalizeCandidates(blocks,summary){
    const out=(Array.isArray(blocks)?blocks:[])
      .map((row,index)=>{
        const feeRange=(Array.isArray(row?.feeRange)?row.feeRange:[])
          .map(finite)
          .filter(Number.isFinite)
          .sort((a,b)=>a-b);

        return {
          index,
          nTx:finite(row?.nTx??row?.n_tx??row?.tx_count),
          blockVSize:finite(
            row?.blockVSize ??
            row?.block_vsize ??
            row?.vsize ??
            row?.vbytes
          ),
          blockSize:finite(row?.blockSize??row?.block_size??row?.size),
          totalFees:finite(row?.totalFees??row?.total_fees),
          medianFee:finite(row?.medianFee??row?.median_fee),
          feeRange
        };
      })
      .filter(row=>Number.isFinite(row.blockVSize)&&row.blockVSize>0);

    if(out.length)return out;

    const vsize=finite(summary?.vsize??summary?.vbytes);
    const count=finite(summary?.count);
    const totalFee=finite(summary?.total_fee);

    if(Number.isFinite(vsize)&&vsize>0){
      const blockVSize=Math.min(BLOCK_VBYTES,vsize);
      const ratio=blockVSize/vsize;

      return [{
        index:0,
        nTx:Number.isFinite(count)?Math.max(1,Math.round(count*ratio)):NaN,
        blockVSize,
        blockSize:NaN,
        totalFees:Number.isFinite(totalFee)?totalFee*ratio:NaN,
        medianFee:NaN,
        feeRange:[]
      }];
    }

    return [];
  }

  function detectFullFeed(feed){
    if(!feed)return {kind:"none",rows:[]};

    let candidate=feed;

    for(const key of ["transactions","txs","mempool","entries","result"]){
      if(candidate&&typeof candidate==="object"&&candidate[key]!=null){
        candidate=candidate[key];
        break;
      }
    }

    if(Array.isArray(candidate)){
      return {kind:"array",rows:candidate};
    }

    if(!candidate||typeof candidate!=="object"){
      return {kind:"none",rows:[]};
    }

    const rows=[];

    for(const [txid,entry] of Object.entries(candidate)){
      if(!/^[0-9a-f]{64}$/i.test(txid))continue;
      if(!entry||typeof entry!=="object")continue;
      rows.push({txid,...entry,__zzxCoreEntry:true});
    }

    return rows.length
      ? {kind:"core-map",rows}
      : {kind:"none",rows:[]};
  }

  function feeBtcToSats(value){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    return Math.abs(n)<10000?n*SATS:n;
  }

  function projectedIndex(raw){
    for(const value of [
      raw?.projectedBlockIndex,
      raw?.projected_block_index,
      raw?.blockIndex,
      raw?.block_index
    ]){
      const n=finite(value);
      if(Number.isFinite(n))return Math.max(0,Math.floor(n));
    }

    const oneBased=finite(raw?.projectedBlock);
    if(Number.isFinite(oneBased)){
      return Math.max(0,Math.floor(oneBased)-1);
    }

    return NaN;
  }

  function normalizeTx(raw,{kind="api",fallbackTxid=""}={}){
    if(!raw||typeof raw!=="object")return null;

    const txid=String(
      raw.txid ||
      raw.hash ||
      raw.id ||
      fallbackTxid ||
      ""
    ).trim();

    if(!txid)return null;

    const core=kind==="core"||raw.__zzxCoreEntry===true;
    const weight=finite(raw.weight);
    const vbytes=finite(
      raw.vsize ??
      raw.vbytes ??
      (Number.isFinite(weight)?weight/4:raw.size)
    );

    let feeSats=NaN;

    if(core){
      feeSats=feeBtcToSats(
        raw?.fees?.base ??
        raw?.fees?.modified ??
        raw?.modifiedfee ??
        raw?.fee
      );

      const explicit=finite(raw.fee_sats??raw.feeSats);
      if(Number.isFinite(explicit))feeSats=explicit;
    }else{
      feeSats=finite(raw.fee??raw.fee_sats??raw.feeSats);
    }

    const explicitRate=finite(
      raw.feeRate ??
      raw.fee_rate ??
      raw.feerate ??
      raw.sat_vb ??
      raw.satPerVbyte
    );

    const feeRate=Number.isFinite(explicitRate)
      ? explicitRate
      : Number.isFinite(feeSats)&&Number.isFinite(vbytes)&&vbytes>0
        ? feeSats/vbytes
        : NaN;

    let packageFeeRate=finite(
      raw.packageFeeRate ??
      raw.ancestorFeeRate ??
      raw.effectiveFeeRate
    );

    const ancestorSize=finite(raw.ancestorsize??raw.ancestorSize);

    if(
      !Number.isFinite(packageFeeRate) &&
      core &&
      Number.isFinite(ancestorSize) &&
      ancestorSize>0
    ){
      const ancestorBtc=finite(raw?.fees?.ancestor);

      if(Number.isFinite(ancestorBtc)){
        packageFeeRate=(ancestorBtc*SATS)/ancestorSize;
      }else{
        const ancestorFees=finite(raw.ancestorfees??raw.ancestorFees);

        if(Number.isFinite(ancestorFees)){
          const sats=Math.abs(ancestorFees)<10000
            ? ancestorFees*SATS
            : ancestorFees;
          packageFeeRate=sats/ancestorSize;
        }
      }
    }

    if(!Number.isFinite(packageFeeRate))packageFeeRate=feeRate;

    return {
      id:`tx:${txid}`,
      txid,
      kind:"tx",
      realTx:true,
      representative:false,
      vbytes,
      weight,
      feeSats,
      feeRate,
      packageFeeRate,
      projectedIndex:projectedIndex(raw),
      timeMs:timestampMs(
        raw.time ??
        raw.firstSeen ??
        raw.first_seen ??
        raw.seen_at
      ),
      ancestorCount:finite(raw.ancestorcount??raw.ancestorCount),
      ancestorSize,
      descendantCount:finite(raw.descendantcount??raw.descendantCount),
      depends:Array.isArray(raw.depends)?raw.depends.slice():[],
      spentBy:Array.isArray(raw.spentby)?raw.spentby.slice():[],
      raw
    };
  }

  function txComparator(a,b){
    const ap=finite(a.projectedIndex);
    const bp=finite(b.projectedIndex);

    if(Number.isFinite(ap)&&Number.isFinite(bp)&&ap!==bp){
      return ap-bp;
    }

    const ar=finite(a.packageFeeRate);
    const br=finite(b.packageFeeRate);

    if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br){
      return br-ar;
    }

    const av=finite(a.vbytes);
    const bv=finite(b.vbytes);

    if(Number.isFinite(av)&&Number.isFinite(bv)&&av!==bv){
      return bv-av;
    }

    return String(a.txid).localeCompare(String(b.txid));
  }

  function histogramSlice(hist,startVbytes,targetVbytes){
    const start=Math.max(0,finite(startVbytes)||0);
    const target=Math.max(0,finite(targetVbytes)||0);
    const end=start+target;
    const out=[];
    let cursor=0;

    for(const row of hist){
      const rowStart=cursor;
      const rowEnd=cursor+row.vbytes;
      cursor=rowEnd;

      const overlap=Math.max(
        0,
        Math.min(rowEnd,end)-Math.max(rowStart,start)
      );

      if(overlap>0){
        out.push({
          rate:row.rate,
          vbytes:overlap
        });
      }

      if(cursor>=end)break;
    }

    return out;
  }

  function candidateOffset(candidates,index){
    let total=0;

    for(let i=0;i<index;i++){
      total+=Math.max(0,finite(candidates[i]?.blockVSize)||0);
    }

    return total;
  }

  function txsForCandidate(transactions,candidates,index){
    const explicit=transactions.filter(
      tx=>Number.isFinite(tx.projectedIndex)&&tx.projectedIndex===index
    );

    if(explicit.length){
      return explicit.slice().sort(txComparator);
    }

    const start=candidateOffset(candidates,index);
    const target=Math.max(
      1,
      finite(candidates[index]?.blockVSize)||BLOCK_VBYTES
    );
    const end=start+target;

    const sorted=transactions
      .filter(
        tx=>
          Number.isFinite(tx.vbytes)&&
          tx.vbytes>0&&
          Number.isFinite(tx.packageFeeRate)
      )
      .slice()
      .sort(txComparator);

    const selected=[];
    let cursor=0;

    for(const tx of sorted){
      const next=cursor+tx.vbytes;
      const midpoint=cursor+tx.vbytes/2;

      if(midpoint>=start&&midpoint<end){
        selected.push(tx);
      }

      cursor=next;
      if(cursor>=end)break;
    }

    return selected;
  }

  function representativeItems({
    bands,
    blockIndex,
    targetVbytes,
    targetTx,
    maxTiles
  }){
    const usable=bands.filter(
      row=>Number.isFinite(row.rate)&&Number.isFinite(row.vbytes)&&row.vbytes>0
    );

    const total=usable.reduce((sum,row)=>sum+row.vbytes,0);

    if(!(total>0))return [];

    const txEstimate=Math.max(
      1,
      Number.isFinite(targetTx)
        ? Math.round(targetTx)
        : Math.round(targetVbytes/500)
    );

    const visualTarget=clamp(
      Math.round(Math.sqrt(txEstimate)*12),
      180,
      Math.max(180,maxTiles||1200)
    );

    const items=[];
    let representedTx=0;

    usable.forEach((band,bandIndex)=>{
      const share=band.vbytes/total;
      const chunks=Math.max(
        1,
        Math.round(visualTarget*share)
      );

      const txForBand=Math.max(
        1,
        Math.round(txEstimate*share)
      );

      for(let i=0;i<chunks;i++){
        const vbytes=i===chunks-1
          ? Math.max(
              1,
              band.vbytes-(band.vbytes/chunks)*(chunks-1)
            )
          : band.vbytes/chunks;

        const txCount=i===chunks-1
          ? Math.max(
              1,
              txForBand-Math.floor(txForBand/chunks)*(chunks-1)
            )
          : Math.max(
              1,
              Math.floor(txForBand/chunks)
            );

        representedTx+=txCount;

        items.push({
          id:`rep:b${blockIndex}:f${band.rate.toFixed(6)}:c${i}`,
          kind:"representative",
          realTx:false,
          representative:true,
          txid:"",
          vbytes,
          feeRate:band.rate,
          packageFeeRate:band.rate,
          representedTx:txCount,
          bandIndex,
          chunkIndex:i
        });
      }
    });

    if(items.length&&Number.isFinite(targetTx)){
      const diff=Math.round(targetTx)-representedTx;
      items[items.length-1].representedTx=Math.max(
        1,
        items[items.length-1].representedTx+diff
      );
    }

    return items;
  }

  function build(payload){
    const summary=payload?.mempool||{};
    const histogram=normalizeHistogram(summary.fee_histogram);
    const candidates=normalizeCandidates(payload?.blocks,summary);
    const full=detectFullFeed(payload?.fullFeed);

    const transactions=[];

    for(const raw of full.rows){
      const tx=normalizeTx(
        raw,
        {
          kind:full.kind==="core-map"?"core":"api"
        }
      );

      if(
        tx &&
        Number.isFinite(tx.vbytes) &&
        tx.vbytes>0 &&
        Number.isFinite(tx.packageFeeRate)
      ){
        transactions.push(tx);
      }
    }

    transactions.sort(txComparator);

    const summaryVsize=finite(summary.vsize??summary.vbytes);
    const summaryCount=finite(summary.count);
    const totalFee=finite(summary.total_fee);

    const backlogVMB=Number.isFinite(summaryVsize)
      ? summaryVsize/1e6
      : histogram.reduce((sum,row)=>sum+row.vbytes,0)/1e6;

    const fastFee=finite(
      payload?.feeRecommendations?.fastestFee ??
      payload?.feeRecommendations?.halfHourFee
    );

    return {
      schema:"zzx-mempool-specs-v5",
      summary,
      histogram,
      candidates,
      transactions,
      summaryVsize,
      summaryCount,
      totalFee,
      backlogVMB,
      fastFee,
      tipHeight:finite(payload?.tipHeight),
      priceUsd:finite(payload?.priceUsd),
      priceSource:String(payload?.priceSource||""),
      source:String(payload?.source||""),
      fullFeedSource:String(payload?.fullFeedSource||""),
      fullFeedKind:full.kind,
      fetchedAt:finite(payload?.fetchedAt),
      maxVisualTiles:Number(payload?.cfg?.maxVisualTiles)||1400
    };
  }

  function blockView(model,index=0){
    if(!model?.candidates?.length){
      throw new Error("no projected mempool blocks available");
    }

    const blockIndex=clamp(
      Math.floor(Number(index)||0),
      0,
      model.candidates.length-1
    );

    const candidate=model.candidates[blockIndex];
    const start=candidateOffset(model.candidates,blockIndex);
    const targetVbytes=Math.max(
      1,
      finite(candidate.blockVSize)||BLOCK_VBYTES
    );

    const bands=histogramSlice(
      model.histogram,
      start,
      targetVbytes
    );

    const fullTxs=txsForCandidate(
      model.transactions,
      model.candidates,
      blockIndex
    );

    const fullVbytes=fullTxs.reduce(
      (sum,tx)=>sum+(Number.isFinite(tx.vbytes)?tx.vbytes:0),
      0
    );

    const realCoverage=targetVbytes>0
      ? fullVbytes/targetVbytes
      : 0;

    let items=[];
    let sourceMode="representative";

    if(fullTxs.length&&realCoverage>=0.72){
      items=fullTxs.slice();
      sourceMode=realCoverage>=0.98
        ? "real transactions"
        : "hybrid real + representative";

      const missing=Math.max(
        0,
        targetVbytes-fullVbytes
      );

      if(missing>targetVbytes*.005){
        const missingBands=histogramSlice(
          model.histogram,
          start+Math.min(fullVbytes,targetVbytes),
          missing
        );

        items.push(
          ...representativeItems({
            bands:missingBands,
            blockIndex,
            targetVbytes:missing,
            targetTx:Number.isFinite(candidate.nTx)
              ? Math.max(1,candidate.nTx-fullTxs.length)
              : NaN,
            maxTiles:Math.max(
              180,
              model.maxVisualTiles-fullTxs.length
            )
          })
        );
      }
    }else{
      items=representativeItems({
        bands,
        blockIndex,
        targetVbytes,
        targetTx:candidate.nTx,
        maxTiles:model.maxVisualTiles
      });
    }

    if(!items.length){
      items=[{
        id:`rep:b${blockIndex}:fallback`,
        kind:"representative",
        realTx:false,
        representative:true,
        vbytes:targetVbytes,
        feeRate:Number.isFinite(candidate.medianFee)
          ? candidate.medianFee
          : 0,
        packageFeeRate:Number.isFinite(candidate.medianFee)
          ? candidate.medianFee
          : 0,
        representedTx:Number.isFinite(candidate.nTx)
          ? candidate.nTx
          : 1
      }];
    }

    const rates=items
      .map(item=>finite(item.packageFeeRate??item.feeRate))
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);

    const minRate=rates.length?rates[0]:NaN;
    const maxRate=rates.length?rates[rates.length-1]:NaN;
    const medianRate=Number.isFinite(candidate.medianFee)
      ? candidate.medianFee
      : median(rates);

    const totalItemVbytes=items.reduce(
      (sum,item)=>sum+(Number.isFinite(item.vbytes)?item.vbytes:0),
      0
    );

    const fillRatio=targetVbytes/BLOCK_VBYTES;
    const nextHeight=Number.isFinite(model.tipHeight)
      ? model.tipHeight+blockIndex+1
      : NaN;

    return {
      schema:"zzx-mempool-specs-block-view-v5",
      blockIndex,
      candidate,
      items,
      bands,
      sourceMode,
      realCoverage,
      targetVbytes,
      totalItemVbytes,
      fillRatio,
      minRate,
      medianRate,
      maxRate,
      nextHeight,
      model
    };
  }

  W.ZZXMempoolSpecsModel=Object.freeze({
    __version:5,
    BLOCK_VBYTES,
    timestampMs,
    normalizeHistogram,
    normalizeCandidates,
    normalizeTx,
    detectFullFeed,
    histogramSlice,
    candidateOffset,
    txsForCandidate,
    representativeItems,
    build,
    blockView
  });
})();
