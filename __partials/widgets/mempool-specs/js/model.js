// __partials/widgets/mempool-specs/js/model.js
(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolSpecsModel?.__version>=4)return;

  const SATS=100_000_000;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const isHex64=s=>/^[0-9a-f]{64}$/i.test(String(s||""));

  function timestampMs(v){
    const n=finite(v);
    if(!Number.isFinite(n)||n<=0)return NaN;
    if(n<1e11)return n*1000;
    if(n<1e14)return n;
    if(n<1e17)return n/1000;
    return n/1e6;
  }

  function median(values){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return NaN;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function feeBtcToSats(v){
    const n=finite(v);
    return Number.isFinite(n)?n*SATS:NaN;
  }

  function detectFullFeed(payload){
    if(!payload||typeof payload!=="object")return {kind:"none",rows:[]};

    if(Array.isArray(payload))return {kind:"array",rows:payload};
    for(const key of ["transactions","txs","entries","items"]){
      if(Array.isArray(payload[key]))return {kind:"array",rows:payload[key]};
    }

    const candidate=payload.mempool&&typeof payload.mempool==="object"&&!Array.isArray(payload.mempool)
      ? payload.mempool
      : payload;

    const entries=Object.entries(candidate).filter(([k,v])=>isHex64(k)&&v&&typeof v==="object");
    if(entries.length){
      return {kind:"core-map",rows:entries.map(([txid,entry])=>({txid,...entry,__zzxCoreEntry:true}))};
    }

    return {kind:"unknown",rows:[]};
  }

  function sumOutputs(tx){
    if(!Array.isArray(tx?.vout))return NaN;
    let total=0,ok=false;
    for(const out of tx.vout){
      const v=finite(out?.value);
      if(Number.isFinite(v)){total+=v;ok=true}
    }
    return ok?total:NaN;
  }

  function normalizeTx(raw,{kind="api",fallbackTxid=""}={}){
    if(!raw||typeof raw!=="object")return null;
    const txid=String(raw.txid||raw.hash||raw.id||fallbackTxid||"").trim();
    if(!txid)return null;

    const core=kind==="core"||raw.__zzxCoreEntry===true;
    const weight=finite(raw.weight);
    const vbytes=finite(raw.vsize??raw.vbytes??(Number.isFinite(weight)?weight/4:raw.size));

    let feeSats=NaN;
    if(core){
      feeSats=feeBtcToSats(raw?.fees?.base??raw?.fees?.modified??raw?.modifiedfee??raw?.fee);
      const explicit=finite(raw.fee_sats??raw.feeSats);
      if(Number.isFinite(explicit))feeSats=explicit;
    }else{
      feeSats=finite(raw.fee??raw.fee_sats??raw.feeSats);
    }

    const explicitRate=finite(raw.feeRate??raw.fee_rate??raw.feerate??raw.sat_vb??raw.satPerVbyte);
    const feeRate=Number.isFinite(explicitRate)
      ? explicitRate
      : Number.isFinite(feeSats)&&Number.isFinite(vbytes)&&vbytes>0
        ? feeSats/vbytes
        : NaN;

    const ancestorSize=finite(raw.ancestorsize??raw.ancestorSize);
    let packageFeeRate=finite(raw.packageFeeRate??raw.ancestorFeeRate??raw.effectiveFeeRate);

    if(!Number.isFinite(packageFeeRate)&&core&&Number.isFinite(ancestorSize)&&ancestorSize>0){
      const ancestorBtc=finite(raw?.fees?.ancestor);
      if(Number.isFinite(ancestorBtc))packageFeeRate=(ancestorBtc*SATS)/ancestorSize;
      else{
        const ancestorFees=finite(raw.ancestorfees??raw.ancestorFees);
        if(Number.isFinite(ancestorFees)){
          const sats=ancestorFees<10000?ancestorFees*SATS:ancestorFees;
          packageFeeRate=sats/ancestorSize;
        }
      }
    }

    if(!Number.isFinite(packageFeeRate))packageFeeRate=feeRate;

    const projectedIndex=finite(
      raw.projectedBlockIndex??raw.projected_block_index??raw.blockIndex??raw.block_index??raw.projectedBlock
    );

    const timeMs=timestampMs(raw.time??raw.firstSeen??raw.first_seen??raw.seen_at);
    const valueOut=finite(raw.value??raw.value_sats??raw.valueSats);
    const outputs=Number.isFinite(valueOut)?valueOut:sumOutputs(raw);

    return {
      txid,
      detailed:Number.isFinite(vbytes)||Number.isFinite(feeRate)||Number.isFinite(packageFeeRate),
      sourceKind:core?"core":"api",
      vbytes,
      weight,
      feeSats,
      feeRate,
      packageFeeRate,
      projectedIndex,
      timeMs,
      valueOutSats:outputs,
      ancestorCount:finite(raw.ancestorcount??raw.ancestorCount),
      ancestorSize,
      descendantCount:finite(raw.descendantcount??raw.descendantCount),
      depends:Array.isArray(raw.depends)?raw.depends.slice():[],
      spentBy:Array.isArray(raw.spentby)?raw.spentby.slice():[],
      raw
    };
  }

  function mergeEntry(oldRow,newRow){
    if(!oldRow)return newRow;
    if(!newRow)return oldRow;
    const prefer=(a,b)=>Number.isFinite(b)?b:a;
    return {
      ...oldRow,
      ...newRow,
      detailed:oldRow.detailed||newRow.detailed,
      vbytes:prefer(oldRow.vbytes,newRow.vbytes),
      weight:prefer(oldRow.weight,newRow.weight),
      feeSats:prefer(oldRow.feeSats,newRow.feeSats),
      feeRate:prefer(oldRow.feeRate,newRow.feeRate),
      packageFeeRate:prefer(oldRow.packageFeeRate,newRow.packageFeeRate),
      projectedIndex:prefer(oldRow.projectedIndex,newRow.projectedIndex),
      timeMs:prefer(oldRow.timeMs,newRow.timeMs),
      valueOutSats:prefer(oldRow.valueOutSats,newRow.valueOutSats),
      ancestorCount:prefer(oldRow.ancestorCount,newRow.ancestorCount),
      ancestorSize:prefer(oldRow.ancestorSize,newRow.ancestorSize),
      descendantCount:prefer(oldRow.descendantCount,newRow.descendantCount),
      depends:newRow.depends?.length?newRow.depends:oldRow.depends,
      spentBy:newRow.spentBy?.length?newRow.spentBy:oldRow.spentBy,
      raw:newRow.raw||oldRow.raw
    };
  }

  function normalizeCandidates(blocks){
    return (Array.isArray(blocks)?blocks:[]).map((b,index)=>({
      index,
      nTx:finite(b?.nTx??b?.tx_count),
      blockVSize:finite(b?.blockVSize??b?.block_vsize),
      totalFees:finite(b?.totalFees??b?.total_fees),
      medianFee:finite(b?.medianFee??b?.median_fee),
      feeRange:(Array.isArray(b?.feeRange)?b.feeRange:[]).map(finite).filter(Number.isFinite)
    }));
  }

  function comparator(a,b){
    const ap=finite(a.projectedIndex),bp=finite(b.projectedIndex);
    const ah=Number.isFinite(ap),bh=Number.isFinite(bp);
    if(ah&&bh&&ap!==bp)return ap-bp;
    if(ah!==bh)return ah?-1:1;

    const ar=finite(a.packageFeeRate),br=finite(b.packageFeeRate);
    const ak=Number.isFinite(ar),bk=Number.isFinite(br);
    if(ak&&bk&&ar!==br)return br-ar;
    if(ak!==bk)return ak?-1:1;

    const af=finite(a.feeRate),bf=finite(b.feeRate);
    if(Number.isFinite(af)&&Number.isFinite(bf)&&af!==bf)return bf-af;

    const at=finite(a.timeMs),bt=finite(b.timeMs);
    if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return at-bt;
    return String(a.txid).localeCompare(String(b.txid));
  }

  function build(payload){
    const map=new Map();
    const full=detectFullFeed(payload?.fullFeed);

    for(const raw of full.rows){
      const row=normalizeTx(raw,{kind:full.kind==="core-map"?"core":"api"});
      if(row)map.set(row.txid,mergeEntry(map.get(row.txid),row));
    }

    for(const raw of Array.isArray(payload?.recent)?payload.recent:[]){
      const row=normalizeTx(raw,{kind:"api"});
      if(row)map.set(row.txid,mergeEntry(map.get(row.txid),row));
    }

    for(const txid of Array.isArray(payload?.txids)?payload.txids:[]){
      const id=String(txid||"");
      if(!id)continue;
      if(!map.has(id))map.set(id,{
        txid:id,detailed:false,sourceKind:"txid",vbytes:NaN,weight:NaN,feeSats:NaN,
        feeRate:NaN,packageFeeRate:NaN,projectedIndex:NaN,timeMs:NaN,valueOutSats:NaN,
        ancestorCount:NaN,ancestorSize:NaN,descendantCount:NaN,depends:[],spentBy:[],raw:null
      });
    }

    const summary=payload?.mempool||{};
    const summaryCount=finite(summary.count);
    const summaryVsize=finite(summary.vsize??summary.vbytes);

    // If /mempool/txids is unavailable but a full feed exists, the feed itself is the universe.
    const count=Math.max(map.size,Number.isFinite(summaryCount)?summaryCount:0);
    const averageVbytes=Number.isFinite(summaryVsize)&&count>0?summaryVsize/count:NaN;

    const transactions=[...map.values()];
    for(const row of transactions){
      if(!Number.isFinite(row.vbytes)&&Number.isFinite(averageVbytes)){
        row.vbytes=averageVbytes;
        row.estimatedVbytes=true;
      }else row.estimatedVbytes=false;
    }
    transactions.sort(comparator);

    const detailedCount=transactions.filter(x=>x.detailed).length;
    const priorityCount=transactions.filter(x=>Number.isFinite(x.packageFeeRate)||Number.isFinite(x.projectedIndex)).length;
    const feeRates=transactions.map(x=>x.feeRate).filter(Number.isFinite);
    const packageRates=transactions.map(x=>x.packageFeeRate).filter(Number.isFinite);

    const candidates=normalizeCandidates(payload?.blocks);
    const backlogVMB=Number.isFinite(summaryVsize)?summaryVsize/1e6:transactions.reduce((s,x)=>s+(Number.isFinite(x.vbytes)?x.vbytes:0),0)/1e6;

    const fastFee=finite(payload?.feeRecommendations?.fastestFee??payload?.feeRecommendations?.halfHourFee);
    const medianFee=median(packageRates.length?packageRates:feeRates);

    const fullDetailed=transactions.length>0&&detailedCount===transactions.length;
    const fullPriority=transactions.length>0&&priorityCount===transactions.length;

    return {
      schema:"zzx-mempool-specs-v4",
      transactions,
      count:transactions.length||count,
      summaryCount,
      summaryVsize,
      backlogVMB,
      averageVbytes,
      detailedCount,
      priorityCount,
      detailedCoverage:transactions.length?detailedCount/transactions.length:0,
      priorityCoverage:transactions.length?priorityCount/transactions.length:0,
      fullDetailed,
      fullPriority,
      medianFee,
      fastFee,
      candidates,
      tipHeight:finite(payload?.tipHeight),
      priceUsd:finite(payload?.priceUsd),
      priceSource:String(payload?.priceSource||""),
      source:String(payload?.source||""),
      fullFeedSource:String(payload?.fullFeedSource||""),
      fullFeedKind:full.kind,
      fetchedAt:finite(payload?.fetchedAt)
    };
  }

  function enrich(model,rawTx){
    if(!model||!rawTx)return model;
    const incoming=normalizeTx(rawTx,{kind:"api"});
    if(!incoming)return model;
    const rows=model.transactions.map(row=>row.txid===incoming.txid?mergeEntry(row,incoming):row);
    if(!rows.some(row=>row.txid===incoming.txid))rows.push(incoming);
    const clone={...model,transactions:rows.sort(comparator)};
    clone.detailedCount=clone.transactions.filter(x=>x.detailed).length;
    clone.priorityCount=clone.transactions.filter(x=>Number.isFinite(x.packageFeeRate)||Number.isFinite(x.projectedIndex)).length;
    clone.detailedCoverage=clone.transactions.length?clone.detailedCount/clone.transactions.length:0;
    clone.priorityCoverage=clone.transactions.length?clone.priorityCount/clone.transactions.length:0;
    clone.fullDetailed=clone.detailedCount===clone.transactions.length&&clone.transactions.length>0;
    clone.fullPriority=clone.priorityCount===clone.transactions.length&&clone.transactions.length>0;
    return clone;
  }

  W.ZZXMempoolSpecsModel=Object.freeze({
    __version:4,
    timestampMs,
    normalizeTx,
    detectFullFeed,
    comparator,
    build,
    enrich
  });
})();
