// __partials/widgets/mempool-specs/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolSpecsModel?.__version>=7)return;

  const SATS=100_000_000;
  const BLOCK_VBYTES=1_000_000;

  function finite(value){
    const n=Number(value);
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
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function normalizeHistogram(hist){
    const out=[];

    for(const row of Array.isArray(hist)?hist:[]){
      if(!Array.isArray(row)||row.length<2)continue;
      const rate=finite(row[0]);
      const vbytes=finite(row[1]);
      if(Number.isFinite(rate)&&rate>=0&&Number.isFinite(vbytes)&&vbytes>0){
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
      const countBlocks=Math.max(1,Math.ceil(vsize/BLOCK_VBYTES));
      const blocksToCreate=Math.min(8,countBlocks);
      const fallback=[];

      for(let index=0;index<blocksToCreate;index++){
        const left=Math.max(0,vsize-index*BLOCK_VBYTES);
        if(left<=0)break;
        const blockVSize=Math.min(BLOCK_VBYTES,left);
        const ratio=blockVSize/vsize;
        fallback.push({
          index,
          nTx:Number.isFinite(count)?Math.max(1,Math.round(count*ratio)):NaN,
          blockVSize,
          blockSize:NaN,
          totalFees:Number.isFinite(totalFee)?totalFee*ratio:NaN,
          medianFee:NaN,
          feeRange:[]
        });
      }

      return fallback;
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

  function hasFullTxShape(raw){
    return Array.isArray(raw?.vin)&&Array.isArray(raw?.vout);
  }

  function sumSats(rows,selector){
    let total=0;
    let seen=false;

    for(const row of Array.isArray(rows)?rows:[]){
      const n=finite(selector(row));
      if(!Number.isFinite(n))continue;
      total+=n;
      seen=true;
    }

    return seen?total:NaN;
  }

  function transactionValueSats(raw){
    const outputSum=sumSats(raw?.vout,row=>row?.value);
    if(Number.isFinite(outputSum))return outputSum;

    for(const value of [
      raw?.valueSats,
      raw?.outputValueSats,
      raw?.output_value_sats,
      raw?.value,
      raw?.outputValue,
      raw?.output_value
    ]){
      const n=finite(value);
      if(Number.isFinite(n)&&n>=0)return n;
    }

    const btc=finite(raw?.valueBtc??raw?.valueBTC??raw?.outputValueBtc);
    return Number.isFinite(btc)&&btc>=0?btc*SATS:NaN;
  }

  function inputValueSats(raw){
    return sumSats(raw?.vin,row=>row?.prevout?.value);
  }

  function projectedRank(raw){
    for(const value of [
      raw?.projectedRank,
      raw?.projected_rank,
      raw?.blockRank,
      raw?.block_rank,
      raw?.rank
    ]){
      const n=finite(value);
      if(Number.isFinite(n))return Math.max(0,Math.floor(n));
    }
    return NaN;
  }

  function normalizeTx(raw,{kind="api",fallbackTxid=""}={}){
    if(!raw||typeof raw!=="object")return null;

    const txid=String(
      raw.txid ||
      raw.id ||
      fallbackTxid ||
      raw.hash ||
      ""
    ).trim();

    if(!/^[0-9a-f]{64}$/i.test(txid))return null;

    const core=kind==="core"||raw.__zzxCoreEntry===true;
    const weight=finite(raw.weight);
    const size=finite(raw.size);
    const vbytes=finite(
      raw.vsize ??
      raw.vbytes ??
      (Number.isFinite(weight)?weight/4:size)
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

    const rawHash=String(raw.hash||raw.wtxid||"").trim();

    return {
      id:`tx:${txid}`,
      txid,
      hash:rawHash||txid,
      kind:"tx",
      realTx:true,
      representative:false,
      detailed:hasFullTxShape(raw),
      vbytes,
      size,
      weight,
      feeSats,
      feeRate,
      packageFeeRate,
      valueSats:transactionValueSats(raw),
      inputValueSats:inputValueSats(raw),
      projectedIndex:projectedIndex(raw),
      projectedRank:projectedRank(raw),
      liveProjected:raw.__zzxLive===true,
      timeMs:timestampMs(
        raw.time ??
        raw.firstSeen ??
        raw.first_seen ??
        raw.seen_at
      ),
      ancestorCount:finite(raw.ancestorcount??raw.ancestorCount),
      ancestorSize,
      descendantCount:finite(raw.descendantcount??raw.descendantCount),
      descendantSize:finite(raw.descendantsize??raw.descendantSize),
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

    if(Number.isFinite(ap)!==Number.isFinite(bp)){
      return Number.isFinite(ap)?-1:1;
    }

    const aRank=finite(a.projectedRank);
    const bRank=finite(b.projectedRank);

    if(Number.isFinite(aRank)&&Number.isFinite(bRank)&&aRank!==bRank){
      return aRank-bRank;
    }

    if(Number.isFinite(aRank)!==Number.isFinite(bRank)){
      return Number.isFinite(aRank)?-1:1;
    }

    const ar=finite(a.packageFeeRate);
    const br=finite(b.packageFeeRate);

    if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br){
      return br-ar;
    }

    if(Number.isFinite(ar)!==Number.isFinite(br)){
      return Number.isFinite(ar)?-1:1;
    }

    const av=finite(a.vbytes);
    const bv=finite(b.vbytes);

    if(Number.isFinite(av)&&Number.isFinite(bv)&&av!==bv){
      return bv-av;
    }

    const at=finite(a.timeMs);
    const bt=finite(b.timeMs);
    if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;

    return String(a.txid).localeCompare(String(b.txid));
  }

  function dedupeTransactions(rows){
    const map=new Map();

    for(const tx of rows){
      if(!tx?.txid)continue;
      const prior=map.get(tx.txid);

      if(!prior){
        map.set(tx.txid,tx);
        continue;
      }

      const priorScore=(prior.detailed?8:0)+(Number.isFinite(prior.valueSats)?4:0)+(Number.isFinite(prior.vbytes)?2:0)+(Number.isFinite(prior.packageFeeRate)?1:0);
      const nextScore=(tx.detailed?8:0)+(Number.isFinite(tx.valueSats)?4:0)+(Number.isFinite(tx.vbytes)?2:0)+(Number.isFinite(tx.packageFeeRate)?1:0);

      if(nextScore>=priorScore){
        map.set(tx.txid,{
          ...prior,
          ...tx,
          raw:tx.raw||prior.raw
        });
      }
    }

    return [...map.values()];
  }

  function assignProjected(transactions,candidates){
    const sorted=transactions
      .filter(tx=>Number.isFinite(tx.vbytes)&&tx.vbytes>0&&Number.isFinite(tx.packageFeeRate))
      .slice()
      .sort(txComparator);

    if(!candidates.length){
      return sorted.map(tx=>({...tx,assignedIndex:0}));
    }

    const explicit=sorted.filter(tx=>Number.isFinite(tx.projectedIndex));
    const implicit=sorted.filter(tx=>!Number.isFinite(tx.projectedIndex));
    const assigned=[];

    for(const tx of explicit){
      assigned.push({
        ...tx,
        assignedIndex:clamp(Math.floor(tx.projectedIndex),0,candidates.length-1)
      });
    }

    let blockIndex=0;
    let used=0;

    for(const tx of implicit){
      const target=Math.max(1,finite(candidates[blockIndex]?.blockVSize)||BLOCK_VBYTES);

      if(
        blockIndex<candidates.length-1 &&
        used>0 &&
        used+tx.vbytes>target*1.005
      ){
        blockIndex++;
        used=0;
      }

      assigned.push({...tx,assignedIndex:blockIndex});
      used+=tx.vbytes;
    }

    return assigned.sort((a,b)=>{
      if(a.assignedIndex!==b.assignedIndex)return a.assignedIndex-b.assignedIndex;
      return txComparator(a,b);
    });
  }

  function summaryCounts(model){
    const knownIds=model.knownTxids.length;
    const txRows=model.transactions.length;
    const summaryCount=finite(model.summaryCount);
    const universe=Number.isFinite(summaryCount)
      ? Math.max(summaryCount,knownIds,txRows)
      : Math.max(knownIds,txRows);

    const detailed=model.transactions.filter(tx=>tx.detailed).length;
    const scalable=model.transactions.filter(tx=>Number.isFinite(tx.vbytes)&&tx.vbytes>0&&Number.isFinite(tx.packageFeeRate)).length;

    return {universe,detailed,scalable};
  }

  function rebuild(model){
    const transactions=dedupeTransactions(model.transactions).sort(txComparator);
    const assigned=assignProjected(transactions,model.candidates);
    const byTxid=new Map(assigned.map(tx=>[tx.txid,tx]));
    const knownTxids=[...new Set([
      ...(model.knownTxids||[]),
      ...assigned.map(tx=>tx.txid)
    ])];

    const next={...model,transactions:assigned,byTxid,knownTxids};
    const counts=summaryCounts(next);

    next.universeCount=counts.universe;
    next.detailedCount=counts.detailed;
    next.scalableCount=counts.scalable;
    next.layoutCoverage=counts.universe>0?counts.scalable/counts.universe:0;
    next.detailCoverage=counts.universe>0?counts.detailed/counts.universe:0;
    next.completeLayout=
      counts.universe>0 &&
      counts.scalable>=counts.universe*.985 &&
      (
        !Number.isFinite(next.summaryVsize) ||
        next.summaryVsize<=0 ||
        assigned.reduce((sum,tx)=>sum+(Number.isFinite(tx.vbytes)?tx.vbytes:0),0)>=next.summaryVsize*.97
      );

    return next;
  }

  function build(payload){
    const summary=payload?.mempool||{};
    const histogram=normalizeHistogram(summary.fee_histogram);
    const candidates=normalizeCandidates(payload?.blocks,summary);
    const full=detectFullFeed(payload?.fullFeed);
    const rows=[];

    for(const raw of full.rows){
      const tx=normalizeTx(raw,{kind:full.kind==="core-map"?"core":"api"});
      if(tx)rows.push(tx);
    }

    for(const raw of Array.isArray(payload?.recent)?payload.recent:[]){
      const tx=normalizeTx(raw,{kind:"api"});
      if(tx)rows.push(tx);
    }

    const summaryVsize=finite(summary.vsize??summary.vbytes);
    const summaryCount=finite(summary.count);
    const totalFee=finite(summary.total_fee);
    const knownTxids=(Array.isArray(payload?.txids)?payload.txids:[])
      .map(String)
      .filter(id=>/^[0-9a-f]{64}$/i.test(id));

    const backlogVMB=Number.isFinite(summaryVsize)
      ? summaryVsize/1e6
      : histogram.reduce((sum,row)=>sum+row.vbytes,0)/1e6;

    const fastFee=finite(
      payload?.feeRecommendations?.fastestFee ??
      payload?.feeRecommendations?.halfHourFee
    );

    return rebuild({
      schema:"zzx-mempool-specs-v7",
      summary,
      histogram,
      candidates,
      transactions:rows,
      knownTxids,
      byTxid:new Map(),
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
      cfg:payload?.cfg||{},
      liveBlock0Active:false,
      liveUpdatedAt:NaN
    });
  }

  function mergeTransactions(model,rawRows){
    const rows=model.transactions.slice();

    for(const raw of Array.isArray(rawRows)?rawRows:[]){
      const txid=String(raw?.txid??raw?.id??raw?.hash??"").trim();
      const prior=/^[0-9a-f]{64}$/i.test(txid)
        ? model.byTxid?.get(txid)
        : null;

      const mergedRaw=prior?.liveProjected
        ? {
            ...(prior.raw&&typeof prior.raw==="object"?prior.raw:{}),
            ...raw,
            txid,
            __zzxLive:true,
            projectedBlockIndex:0,
            projectedRank:prior.projectedRank
          }
        : raw;

      const tx=normalizeTx(
        mergedRaw,
        {kind:mergedRaw?.__zzxCoreEntry?"core":"api"}
      );

      if(tx)rows.push(tx);
    }

    return rebuild({...model,transactions:rows});
  }

  function pendingTxids(model,{limit=Infinity,offset=0}={}){
    const out=[];
    const start=Math.max(0,Math.floor(offset)||0);
    const max=Math.max(0,Number.isFinite(limit)?Math.floor(limit):Infinity);

    for(let i=start;i<model.knownTxids.length&&out.length<max;i++){
      const id=model.knownTxids[i];
      const current=model.byTxid.get(id);
      if(!current||!Number.isFinite(current.vbytes)||!Number.isFinite(current.packageFeeRate)){
        out.push(id);
      }
    }

    return out;
  }


  function mergeLiveBlock(model,rawRows,{candidates=[],updatedAt=Date.now()}={}){
    const rows=Array.isArray(rawRows)?rawRows:[];
    const liveIds=new Set();
    const liveRows=[];

    rows.forEach((raw,index)=>{
      const txid=String(raw?.txid??raw?.id??raw?.hash??"").trim();
      if(!/^[0-9a-f]{64}$/i.test(txid))return;

      liveIds.add(txid);
      const prior=model.byTxid?.get(txid);
      const mergedRaw={
        ...(prior?.raw&&typeof prior.raw==="object"?prior.raw:{}),
        ...raw,
        txid,
        projectedBlockIndex:0,
        projectedRank:index,
        __zzxLive:true
      };

      const tx=normalizeTx(mergedRaw,{kind:raw?.__zzxCoreEntry?"core":"api"});
      if(tx)liveRows.push(tx);
    });

    const base=model.transactions.filter(tx=>!tx.liveProjected);

    let next=rebuild({
      ...model,
      candidates:Array.isArray(candidates)&&candidates.length
        ? normalizeCandidates(candidates,model.summary)
        : model.candidates,
      transactions:base.concat(liveRows),
      liveBlock0Active:liveRows.length>0,
      liveUpdatedAt:finite(updatedAt)
    });

    next.liveBlock0Count=liveRows.length;
    return next;
  }

  function pendingNextBlockTxids(model,{limit=Infinity}={}){
    const max=Math.max(0,Number.isFinite(limit)?Math.floor(limit):Infinity);
    const rows=model?.liveBlock0Active
      ? model.transactions.filter(tx=>tx.liveProjected).sort(txComparator)
      : model.transactions.filter(tx=>tx.assignedIndex===0).sort(txComparator);

    const out=[];
    for(const tx of rows){
      if(out.length>=max)break;
      if(!tx?.txid)continue;
      if(!tx.detailed||!Number.isFinite(tx.valueSats)){
        out.push(tx.txid);
      }
    }
    return out;
  }

  function selectForTarget(items,targetVbytes){
    const target=Math.max(1,finite(targetVbytes)||BLOCK_VBYTES);
    const ordered=(Array.isArray(items)?items:[]).slice().sort(txComparator);
    const out=[];
    let used=0;

    for(const tx of ordered){
      const vb=finite(tx.vbytes);
      if(!(vb>0))continue;
      if(out.length&&used+vb>target*1.005)continue;

      out.push(tx);
      used+=vb;

      if(used>=target)break;
    }

    return out;
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
    const targetVbytes=Math.max(1,finite(candidate.blockVSize)||BLOCK_VBYTES);

    const sourceItems=
      blockIndex===0&&model.liveBlock0Active
        ? model.transactions.filter(tx=>tx.liveProjected)
        : model.transactions.filter(tx=>tx.assignedIndex===blockIndex);

    const items=selectForTarget(
      sourceItems.filter(tx=>Number.isFinite(tx.vbytes)&&tx.vbytes>0),
      targetVbytes
    );

    const actualVbytes=items.reduce(
      (sum,tx)=>sum+(Number.isFinite(tx.vbytes)?tx.vbytes:0),
      0
    );

    const coverage=targetVbytes>0?actualVbytes/targetVbytes:0;
    const rates=items
      .map(item=>finite(item.packageFeeRate??item.feeRate))
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);

    const minRate=rates.length?rates[0]:NaN;
    const maxRate=rates.length?rates[rates.length-1]:NaN;
    const medianRate=Number.isFinite(candidate.medianFee)
      ? candidate.medianFee
      : median(rates);

    const valuedItems=items.filter(item=>Number.isFinite(item.valueSats)&&item.valueSats>=0);
    const totalValueSats=valuedItems.reduce((sum,item)=>sum+item.valueSats,0);
    const valueCoverage=items.length?valuedItems.length/items.length:0;

    return {
      schema:"zzx-mempool-specs-block-view-v6",
      blockIndex,
      candidate,
      items,
      targetVbytes,
      actualVbytes,
      coverage,
      fillRatio:targetVbytes/BLOCK_VBYTES,
      minRate,
      medianRate,
      maxRate,
      nextHeight:Number.isFinite(model.tipHeight)
        ? model.tipHeight+blockIndex+1
        : NaN,
      totalValueSats,
      valueKnownCount:valuedItems.length,
      valueCoverage,
      live:model.liveBlock0Active&&blockIndex===0,
      liveUpdatedAt:model.liveUpdatedAt,
      complete:(model.liveBlock0Active&&blockIndex===0)
        ? coverage>=.965&&valueCoverage>=.98
        : model.completeLayout&&coverage>=.965,
      sourceMode:(model.liveBlock0Active&&blockIndex===0)
        ? "mempool.space live projected-block transaction feed"
        : model.completeLayout
          ? "real TX / full mempool feed"
          : "real TX / progressive detail coverage",
      model
    };
  }

  W.ZZXMempoolSpecsModel=Object.freeze({
    __version:7,
    BLOCK_VBYTES,
    timestampMs,
    normalizeHistogram,
    normalizeCandidates,
    normalizeTx,
    detectFullFeed,
    txComparator,
    assignProjected,
    build,
    rebuild,
    mergeTransactions,
    mergeLiveBlock,
    pendingTxids,
    pendingNextBlockTxids,
    selectForTarget,
    transactionValueSats,
    blockView
  });
})();
