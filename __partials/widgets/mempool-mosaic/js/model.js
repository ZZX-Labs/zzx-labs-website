(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicModel?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const txidOf=(row,fallback="")=>{const id=String(row?.txid??row?.id??row?.hash??fallback??"").trim();return /^[0-9a-f]{64}$/i.test(id)?id:""};

  function outputValue(row){
    const direct=finite(row?.valueSats??row?.value??row?.outputValue??row?.output_value);if(Number.isFinite(direct))return direct;
    if(Array.isArray(row?.vout)){let total=0,known=0;for(const v of row.vout){const n=finite(v?.value);if(Number.isFinite(n)){total+=n;known++}}if(known)return total}
    return NaN;
  }

  function normalizeTx(row,index=0,fallback=""){
    if(!row||typeof row!=="object")return null;const txid=txidOf(row,fallback);if(!txid)return null;
    const weight=finite(row.weight);let vsize=finite(row.vsize??row.vbytes??row.virtualSize??row.virtual_size);if(!(vsize>0)&&weight>0)vsize=weight/4;if(!(vsize>0))vsize=finite(row.size);
    let fee=finite(row.fee??row.fees??row.totalFee??row.total_fee??row.feeSats);if(Number.isFinite(fee)&&Math.abs(fee)<1&&row?.fees?.base!=null)fee=finite(row.fees.base)*1e8;
    const feeRate=finite(row.feeRate??row.fee_rate??row.rate??row.effectiveFeePerVsize??(fee>0&&vsize>0?fee/vsize:NaN));
    const packageFeeRate=finite(row.packageFeeRate??row.effectiveFeeRate??row.ancestorFeeRate??feeRate);
    const valueSats=outputValue(row);
    const time=finite(row.time??row.firstSeen??row.first_seen??row.seen_at);const timeMs=Number.isFinite(time)?(time<1e12?time*1000:time):NaN;
    const projectedIndex=finite(row.projectedBlockIndex??row.projected_index??row.blockIndex??row.block_index);
    const projectedRank=finite(row.projectedRank??row.projected_rank??row.rank??index);
    return Object.freeze({...row,id:txid,txid,vsize,vbytes:vsize,weight,fee,feeSats:fee,feeRate,packageFeeRate,valueSats,timeMs,projectedIndex,projectedRank,kind:"transaction"});
  }

  function normalizeRows(rows){
    const map=new Map();
    if(Array.isArray(rows))for(const raw of rows){const tx=normalizeTx(raw,map.size);if(tx)map.set(tx.txid,tx)}
    else if(rows&&typeof rows==="object"){
      const list=Array.isArray(rows.transactions)?rows.transactions:Array.isArray(rows.txs)?rows.txs:null;
      if(list)return normalizeRows(list);
      for(const [key,raw] of Object.entries(rows)){const tx=normalizeTx(raw,map.size,key);if(tx)map.set(tx.txid,tx)}
    }
    return [...map.values()];
  }

  function mergeRows(primary,secondary){
    const map=new Map();
    for(const row of [...(secondary||[]),...(primary||[])]){
      if(!row?.txid)continue;const old=map.get(row.txid);
      map.set(row.txid,old?{...old,...row,valueSats:Number.isFinite(row.valueSats)?row.valueSats:old.valueSats,vsize:Number.isFinite(row.vsize)?row.vsize:old.vsize,fee:Number.isFinite(row.fee)?row.fee:old.fee,feeRate:Number.isFinite(row.feeRate)?row.feeRate:old.feeRate,packageFeeRate:Number.isFinite(row.packageFeeRate)?row.packageFeeRate:old.packageFeeRate}:row);
    }
    return [...map.values()];
  }

  function fallbackProject(rows,targetVbytes=1_000_000){
    const ordered=(rows||[]).slice().sort((a,b)=>{
      const ai=finite(a.projectedIndex),bi=finite(b.projectedIndex);if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return ai-bi;if(Number.isFinite(ai)!==Number.isFinite(bi))return Number.isFinite(ai)?-1:1;
      const ar=finite(a.packageFeeRate??a.feeRate),br=finite(b.packageFeeRate??b.feeRate);if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return br-ar;
      return String(a.txid).localeCompare(String(b.txid));
    });
    const out=[];let used=0;
    for(const row of ordered){const vb=finite(row.vsize);if(!(vb>0))continue;if(out.length&&used+vb>targetVbytes*1.04)continue;out.push({...row,projectedRank:out.length,projectedIndex:0});used+=vb;if(used>=targetVbytes)break}
    return out;
  }

  function median(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return NaN;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}

  function build({rest=null,live=null,enriched=null}={}){
    const liveRows=normalizeRows(live?.transactions||[]);
    const fullRows=normalizeRows(rest?.fullFeed||[]);
    const enrichedRows=enriched instanceof Map?normalizeRows([...enriched.values()]):normalizeRows(enriched||[]);
    let rows;
    let sourceMode;
    if(liveRows.length){rows=mergeRows(liveRows,enrichedRows);sourceMode="live projected block 0"}
    else if(fullRows.length){rows=fallbackProject(mergeRows(fullRows,enrichedRows),rest?.cfg?.targetVbytes||1_000_000);sourceMode="projected full-feed fallback"}
    else{rows=[];sourceMode="waiting for projected block 0"}

    const block=(Array.isArray(live?.candidates)&&live.candidates[0])||(Array.isArray(rest?.blocks)&&rest.blocks[0])||{};
    const rowVbytes=rows.reduce((s,r)=>s+(finite(r.vsize)>0?finite(r.vsize):0),0);
    const candidateVbytes=finite(block.blockVSize??block.vsize??block.vbytes);const actualVbytes=rowVbytes>0?rowVbytes:candidateVbytes;
    const fees=rows.map(r=>finite(r.feeRate)).filter(Number.isFinite);const feeMin=fees.length?Math.min(...fees):NaN,feeMax=fees.length?Math.max(...fees):NaN;
    const totalFees=rows.reduce((s,r)=>s+(finite(r.fee)>0?finite(r.fee):0),0);const blockFees=finite(block.totalFees??block.total_fees??block.fees);
    const tip=finite(rest?.tipHeight);const price=finite(rest?.priceUsd);
    const totalFeesSats=totalFees>0?totalFees:blockFees;const totalFeesBTC=Number.isFinite(totalFeesSats)?totalFeesSats/1e8:NaN;
    const backlog=finite(rest?.mempool?.vsize);
    return Object.freeze({
      schema:"zzx-mempool-mosaic-model-v5",items:Object.freeze(rows),tiles:Object.freeze(rows),mode:rows.length?"transactions":"waiting",sourceMode,
      tipHeight:tip,nextHeight:Number.isFinite(tip)?tip+1:NaN,candidateVbytes:Number.isFinite(actualVbytes)?actualVbytes:(rest?.cfg?.targetVbytes||1_000_000),candidateTx:rows.length,
      totalFeesSats,totalFeesBTC,totalFeesUSD:Number.isFinite(totalFeesBTC)&&Number.isFinite(price)?totalFeesBTC*price:NaN,medianFee:median(fees),feeMin,feeMax,
      backlogVMB:Number.isFinite(backlog)?backlog/1e6:NaN,mempoolTx:finite(rest?.mempool?.count),
      valueKnownCount:rows.filter(r=>Number.isFinite(r.valueSats)).length,valueSats:rows.reduce((s,r)=>s+(Number.isFinite(r.valueSats)?r.valueSats:0),0),
      liveConnected:Boolean(liveRows.length),transport:liveRows.length?"WebSocket block-0":"REST/full-feed",wsUrl:String(live?.url||rest?.cfg?.websocket||""),source:String(rest?.source||rest?.cfg?.apiBase||""),fullFeedSource:String(rest?.fullFeedSource||""),priceUsd:price,fetchedAt:Math.max(Number(rest?.fetchedAt)||0,Number(live?.updatedAt)||0,Date.now())
    });
  }

  W.ZZXMempoolMosaicModel=Object.freeze({__version:5,normalizeTx,normalizeRows,mergeRows,fallbackProject,build});
})();
