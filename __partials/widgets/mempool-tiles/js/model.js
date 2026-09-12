// __partials/widgets/mempool-tiles/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesModel?.__version>=1)return;

  const SATS=100_000_000;
  const BLOCK_VBYTES=1_000_000;
  const A=()=>W.ZZXMempoolTilesAnalyzer;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function timestampMs(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<=0)return NaN;
    if(n<1e11)return n*1000;
    if(n<1e14)return n;
    if(n<1e17)return n/1000;
    return n/1e6;
  }

  function valueSats(raw){
    const vout=Array.isArray(raw?.vout)?raw.vout:null;

    if(vout){
      let sum=0;
      let seen=false;
      for(const row of vout){
        const n=finite(row?.value);
        if(!Number.isFinite(n))continue;
        sum+=n;
        seen=true;
      }
      if(seen)return sum;
    }

    for(const v of [
      raw?.valueSats,
      raw?.value,
      raw?.outputValueSats,
      raw?.output_value_sats
    ]){
      const n=finite(v);
      if(Number.isFinite(n)&&n>=0)return n;
    }

    const btc=finite(raw?.valueBtc??raw?.valueBTC);
    return Number.isFinite(btc)&&btc>=0?btc*SATS:NaN;
  }

  function normalizeTx(raw,{core=false,rank=NaN}={}){
    if(!raw||typeof raw!=="object")return null;

    const txid=String(
      raw.txid ||
      raw.id ||
      raw.hash ||
      ""
    ).trim();

    if(!/^[0-9a-f]{64}$/i.test(txid))return null;

    const weight=finite(raw.weight);
    const size=finite(raw.size);
    const vsize=finite(
      raw.vsize ??
      raw.vbytes ??
      (Number.isFinite(weight)?weight/4:size)
    );

    let feeSats=finite(raw.fee??raw.fee_sats??raw.feeSats);

    if(core){
      const btc=finite(
        raw?.fees?.base ??
        raw?.fees?.modified ??
        raw?.modifiedfee
      );
      if(Number.isFinite(btc))feeSats=btc*SATS;
    }

    const feeRate=finite(
      raw.feeRate ??
      raw.fee_rate ??
      raw.feerate ??
      (Number.isFinite(feeSats)&&vsize>0?feeSats/vsize:NaN)
    );

    let packageFeeRate=finite(
      raw.packageFeeRate ??
      raw.effectiveFeeRate ??
      raw.ancestorFeeRate
    );

    if(!Number.isFinite(packageFeeRate)&&core){
      const ancestorSize=finite(raw.ancestorsize);
      const ancestorFee=finite(raw?.fees?.ancestor);
      if(ancestorSize>0&&Number.isFinite(ancestorFee)){
        packageFeeRate=ancestorFee*SATS/ancestorSize;
      }
    }

    if(!Number.isFinite(packageFeeRate))packageFeeRate=feeRate;

    const firstSeen=timestampMs(
      raw.firstSeen ??
      raw.first_seen ??
      raw.time
    );

    const analysis=Array.isArray(raw.vin)&&Array.isArray(raw.vout)
      ? A().classify(raw)
      : null;

    return {
      id:txid,
      txid,
      hash:String(raw.hash||txid),
      vsize,
      size,
      weight,
      feeSats,
      feeRate,
      packageFeeRate,
      valueSats:valueSats(raw),
      firstSeen,
      rank:Number.isFinite(finite(raw.projectedRank))
        ? finite(raw.projectedRank)
        : finite(rank),
      rbf:analysis?.rbf ?? Boolean(raw.rbf),
      type:analysis?.kind || String(raw.type||"unknown"),
      ordinal:Boolean(raw.ordinal||raw.inscription),
      boosted:Boolean(raw.boosted||raw.cpfp),
      detailed:Array.isArray(raw.vin)&&Array.isArray(raw.vout),
      live:raw.__zzxTilesLive===true,
      raw
    };
  }

  function fullFeedRows(feed){
    if(!feed)return {rows:[],core:false};
    let source=feed;

    for(const key of ["transactions","txs","mempool","entries","result"]){
      if(source&&typeof source==="object"&&source[key]!=null){
        source=source[key];
        break;
      }
    }

    if(Array.isArray(source)){
      return {rows:source,core:false};
    }

    if(source&&typeof source==="object"){
      const rows=[];
      for(const [txid,entry] of Object.entries(source)){
        if(!/^[0-9a-f]{64}$/i.test(txid))continue;
        if(!entry||typeof entry!=="object")continue;
        rows.push({txid,...entry});
      }
      return {rows,core:true};
    }

    return {rows:[],core:false};
  }

  function dedupe(rows){
    const map=new Map();

    for(const tx of rows){
      if(!tx?.txid)continue;
      const prior=map.get(tx.txid);

      if(!prior){
        map.set(tx.txid,tx);
        continue;
      }

      const score=row=>
        (row.detailed?8:0)+
        (Number.isFinite(row.valueSats)?4:0)+
        (Number.isFinite(row.vsize)?2:0)+
        (Number.isFinite(row.packageFeeRate)?1:0);

      map.set(
        tx.txid,
        score(tx)>=score(prior)
          ? {...prior,...tx,raw:tx.raw||prior.raw}
          : prior
      );
    }

    return [...map.values()];
  }

  function candidateFit(rows,target=BLOCK_VBYTES){
    const ordered=rows
      .filter(tx=>Number.isFinite(tx.vsize)&&tx.vsize>0&&Number.isFinite(tx.packageFeeRate))
      .slice()
      .sort((a,b)=>{
        const af=Number(a.packageFeeRate);
        const bf=Number(b.packageFeeRate);
        if(bf!==af)return bf-af;

        const ar=Number(a.rank);
        const br=Number(b.rank);
        if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;

        return String(a.txid).localeCompare(String(b.txid));
      });

    const out=[];
    let used=0;

    for(const tx of ordered){
      if(out.length&&used+tx.vsize>target*1.005)continue;
      out.push({...tx,rank:out.length});
      used+=tx.vsize;
      if(used>=target)break;
    }

    return out;
  }

  function rebuild(model){
    const transactions=dedupe(model.transactions);
    const byTxid=new Map(transactions.map(tx=>[tx.txid,tx]));
    const knownTxids=[...new Set([
      ...(model.knownTxids||[]),
      ...transactions.map(tx=>tx.txid)
    ])];

    let candidate=[];

    if(model.liveActive){
      candidate=model.liveTxids
        .map(id=>byTxid.get(id))
        .filter(Boolean)
        .map((tx,index)=>({...tx,rank:index,live:true}));
    }else{
      candidate=candidateFit(transactions,model.targetVbytes);
    }

    const candidateIds=new Set(candidate.map(tx=>tx.txid));
    const candidateVsize=candidate.reduce(
      (sum,tx)=>sum+(Number.isFinite(tx.vsize)?tx.vsize:0),
      0
    );
    const candidateValue=candidate.reduce(
      (sum,tx)=>sum+(Number.isFinite(tx.valueSats)?tx.valueSats:0),
      0
    );
    const knownValues=candidate.filter(tx=>Number.isFinite(tx.valueSats)).length;

    return {
      ...model,
      transactions,
      byTxid,
      knownTxids,
      candidate,
      candidateIds,
      candidateVsize,
      candidateValue,
      candidateValueCoverage:candidate.length?knownValues/candidate.length:0
    };
  }

  function build(payload){
    const full=fullFeedRows(payload.fullFeed);
    const txs=[];

    full.rows.forEach((raw,index)=>{
      const tx=normalizeTx(raw,{core:full.core,rank:index});
      if(tx)txs.push(tx);
    });

    (payload.recent||[]).forEach((raw,index)=>{
      const tx=normalizeTx(raw,{rank:index});
      if(tx)txs.push(tx);
    });

    const firstBlock=Array.isArray(payload.blocks)&&payload.blocks.length
      ? payload.blocks[0]
      : null;

    const targetVbytes=Math.max(
      1,
      finite(firstBlock?.blockVSize??firstBlock?.vsize) || BLOCK_VBYTES
    );

    return rebuild({
      schema:"zzx-mempool-tiles-v1",
      transactions:txs,
      byTxid:new Map(),
      knownTxids:payload.txids||[],
      liveActive:false,
      liveTxids:[],
      liveUpdatedAt:NaN,
      targetVbytes,
      blocks:payload.blocks||[],
      mempool:payload.mempool||{},
      feeRecommendations:payload.feeRecommendations||{},
      tipHeight:finite(payload.tipHeight),
      priceUsd:finite(payload.priceUsd),
      priceSource:String(payload.priceSource||""),
      source:String(payload.source||""),
      fullFeedSource:String(payload.fullFeedSource||""),
      cfg:payload.cfg||{},
      fetchedAt:finite(payload.fetchedAt)
    });
  }

  function mergeDetails(model,rows){
    const merged=model.transactions.slice();

    for(const raw of Array.isArray(rows)?rows:[]){
      const txid=String(raw?.txid??raw?.id??raw?.hash??"").trim();
      const prior=model.byTxid.get(txid);

      const next=normalizeTx(
        prior
          ? {...(prior.raw||{}),...raw,txid,__zzxTilesLive:prior.live}
          : raw,
        {rank:prior?.rank}
      );

      if(next)merged.push(next);
    }

    return rebuild({...model,transactions:merged});
  }

  function mergeLive(model,snapshot){
    const liveRows=Array.isArray(snapshot?.transactions)
      ? snapshot.transactions
      : [];

    const liveIds=[];
    const rows=model.transactions.slice();

    liveRows.forEach((raw,index)=>{
      const txid=String(raw?.txid??raw?.id??raw?.hash??"").trim();
      if(!/^[0-9a-f]{64}$/i.test(txid))return;

      const prior=model.byTxid.get(txid);
      const mergedRaw={
        ...(prior?.raw||{}),
        ...raw,
        txid,
        projectedRank:index,
        __zzxTilesLive:true
      };

      const tx=normalizeTx(mergedRaw,{rank:index});
      if(tx){
        rows.push(tx);
        liveIds.push(txid);
      }
    });

    let targetVbytes=model.targetVbytes;
    const block0=Array.isArray(snapshot?.blocks)&&snapshot.blocks.length
      ? snapshot.blocks[0]
      : null;

    const blockVsize=finite(block0?.blockVSize??block0?.vsize);
    if(blockVsize>0)targetVbytes=blockVsize;

    return rebuild({
      ...model,
      transactions:rows,
      liveActive:liveIds.length>0,
      liveTxids:liveIds,
      liveUpdatedAt:finite(snapshot?.updatedAt),
      targetVbytes,
      blocks:Array.isArray(snapshot?.blocks)&&snapshot.blocks.length
        ? snapshot.blocks
        : model.blocks
    });
  }

  function pendingCandidateTxids(model,limit=64){
    const out=[];
    for(const tx of model.candidate){
      if(out.length>=limit)break;
      if(!tx.detailed||!Number.isFinite(tx.valueSats)){
        out.push(tx.txid);
      }
    }
    return out;
  }

  W.ZZXMempoolTilesModel=Object.freeze({
    __version:1,
    SATS,
    BLOCK_VBYTES,
    normalizeTx,
    valueSats,
    fullFeedRows,
    candidateFit,
    build,
    rebuild,
    mergeDetails,
    mergeLive,
    pendingCandidateTxids
  });
})();
