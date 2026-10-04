// __partials/widgets/mempool-specs/js/tiler.js
// v5 — converts real TX rows or fee bands into square tile records
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Tiler?.__version>=5)return;

  const finite=(v,d=NaN)=>{const n=Number(v);return Number.isFinite(n)?n:d};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hash32(s){
    const str=String(s??"");
    let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
    return h>>>0;
  }

  function sideFromArea(area,cfg){
    const a=Math.max(1,Math.floor(area||1));
    const gamma=Number.isFinite(cfg.sideGamma)?cfg.sideGamma:.92;
    const k=Number.isFinite(cfg.sideK)?cfg.sideK:1;
    let side=Math.pow(Math.max(1e-9,Math.sqrt(a)*k),gamma);
    return clamp(
      Math.round(side),
      Number.isFinite(cfg.minSide)?cfg.minSide:1,
      Number.isFinite(cfg.maxSide)?cfg.maxSide:22
    );
  }

  function fromTxs(txs,scaler,opts={}){
    const src=Array.isArray(txs)?txs:[];
    const maxTiles=Number.isFinite(opts.maxTiles)?Math.max(0,opts.maxTiles):src.length;
    const out=[];

    for(let i=0;i<src.length&&out.length<maxTiles;i++){
      const t=src[i];
      if(!t)continue;

      const txid=String(t.txid??t.hash??t.id??`tx:${i}:${hash32(JSON.stringify(t))}`);
      const vbytes=finite(t.vbytes??t.vsize??(Number.isFinite(Number(t.weight))?Number(t.weight)/4:t.size),NaN);
      const feeRate=finite(t.packageFeeRate??t.feeRate??t.fee_rate??t.feerate??t.feePerVb,NaN);

      const areaCells=scaler?.areaCellsFromTx
        ? scaler.areaCellsFromTx({...t,vbytes,feeRate},{btcUsd:opts.btcUsd})
        : Math.max(1,Math.round((Number.isFinite(vbytes)?vbytes:500)/850));

      const side=scaler?.sideCellsFromTx
        ? scaler.sideCellsFromTx({...t,vbytes,feeRate},{btcUsd:opts.btcUsd})
        : sideFromArea(areaCells,opts);

      out.push({...t,txid,vbytes,feeRate,areaCells,side});
    }

    return out;
  }

  function fromFeeBands(bands,scaler,opts={}){
    const maxTiles=Number.isFinite(opts.maxTiles)?opts.maxTiles:520;
    const target=Number.isFinite(opts.targetChunkVb)?opts.targetChunkVb:12000;
    const minChunk=Number.isFinite(opts.minChunkVb)?opts.minChunkVb:900;
    const maxChunks=Number.isFinite(opts.maxChunksPerBand)?opts.maxChunksPerBand:28;
    const seed=Number.isFinite(opts.seed)?opts.seed:0;

    const rows=(Array.isArray(bands)?bands:[])
      .map(b=>({
        feeRate:finite(b?.feeRate??b?.fee??(Array.isArray(b)?b[0]:NaN),NaN),
        vbytes:finite(b?.vbytes??(Array.isArray(b)?b[1]:NaN),NaN)
      }))
      .filter(r=>Number.isFinite(r.feeRate)&&Number.isFinite(r.vbytes)&&r.vbytes>0)
      .sort((a,b)=>b.feeRate-a.feeRate);

    const out=[];
    let serial=0;

    for(const band of rows){
      if(out.length>=maxTiles)break;
      const vb=Math.max(1,Math.round(band.vbytes));
      let chunks=clamp(Math.round(vb/target),1,maxChunks);
      let chunkVb=Math.max(minChunk,Math.floor(vb/chunks));
      chunks=clamp(Math.round(vb/chunkVb),1,maxChunks);

      for(let i=0;i<chunks&&out.length<maxTiles;i++){
        const vbytes=Math.max(1,i===chunks-1?vb-chunkVb*(chunks-1):chunkVb);
        const areaCells=scaler?.areaCellsFromVBytes
          ? scaler.areaCellsFromVBytes(vbytes)
          : Math.max(1,Math.round(vbytes/850));

        const side=scaler?.sideCellsFromVBytes
          ? scaler.sideCellsFromVBytes(vbytes)
          : sideFromArea(areaCells,opts);

        out.push({
          txid:`band:${band.feeRate}:${seed}:${serial++}:${i}`,
          syntheticBand:true,
          feeRate:band.feeRate,
          vbytes,
          areaCells,
          side
        });
      }
    }

    return out;
  }

  NS.Tiler=Object.freeze({
    __version:5,
    fromTxs,
    fromFeeBands,
    sideFromArea
  });
})();
