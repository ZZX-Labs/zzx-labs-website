// __partials/widgets/block-stats/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXBlockStatsProvider?.__version>=1)return;

  function bases(core){
    const normalize=v=>String(v||"").trim().replace(/\/+$/g,"");
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalize).filter(Boolean))];
  }

  async function getJSON(url){
    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{cache:"no-store",credentials:"omit"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function mergeByHeight(target,rows){
    const map=new Map(
      (Array.isArray(target)?target:[])
        .filter(Boolean)
        .map(row=>[Number(row?.height),row])
        .filter(([height])=>Number.isFinite(height))
    );

    for(const row of (Array.isArray(rows)?rows:[])){
      const height=Number(row?.height);
      if(!Number.isFinite(height))continue;

      const prior=map.get(height)||{};
      map.set(height,{
        ...prior,
        ...row,
        extras:{
          ...(prior?.extras||{}),
          ...(row?.extras||{})
        }
      });
    }

    return [...map.values()]
      .sort((a,b)=>Number(b?.height||0)-Number(a?.height||0));
  }

  async function directBlocks(base){
    let blocks=await getJSON(`${base}/blocks`);
    if(!Array.isArray(blocks)||!blocks.length){
      throw new Error("mempool blocks endpoint returned no blocks");
    }

    blocks=mergeByHeight([],blocks);

    // mempool.space exposes historical 15-block pages from /v1/blocks/:height.
    // Failure here is non-fatal; the latest page alone still drives the widget.
    const oldest=blocks[blocks.length-1];
    const nextHeight=Number(oldest?.height)-1;

    if(Number.isFinite(nextHeight)&&nextHeight>0){
      try{
        const older=await getJSON(`${base}/v1/blocks/${Math.floor(nextHeight)}`);
        blocks=mergeByHeight(blocks,older);
      }catch(_error){}
    }

    const tip=blocks[0];
    const tipHash=String(tip?.id||"");

    if(tipHash){
      try{
        const detail=await getJSON(`${base}/block/${encodeURIComponent(tipHash)}`);
        blocks=mergeByHeight(blocks,[{
          ...detail,
          id:detail?.id||tipHash,
          height:detail?.height??tip?.height,
          extras:tip?.extras||{}
        }]);
      }catch(_error){}
    }

    return blocks;
  }

  async function sharedBlocks(){
    if(!W.ZZXChain?.recentBlocks)return null;

    try{
      const result=await W.ZZXChain.recentBlocks(false);
      const blocks=Array.isArray(result?.blocks)?result.blocks:null;
      return blocks?.length?blocks:null;
    }catch(_error){
      return null;
    }
  }

  async function load(core){
    let lastError=null;
    const shared=await sharedBlocks();

    for(const base of bases(core)){
      try{
        const direct=await directBlocks(base);
        const blocks=mergeByHeight(shared||[],direct);

        if(!blocks.length)throw new Error("no recent blocks available");

        return {
          blocks,
          base,
          source:shared?.length
            ? "shared chain cache + mempool.space"
            : "mempool.space",
          fetchedAt:Date.now()
        };
      }catch(error){
        lastError=error;
      }
    }

    if(shared?.length){
      return {
        blocks:shared,
        base:"ZZXChain",
        source:"shared chain cache",
        fetchedAt:Date.now()
      };
    }

    throw lastError||new Error("recent block data unavailable");
  }

  W.ZZXBlockStatsProvider=Object.freeze({
    __version:1,
    bases,
    mergeByHeight,
    load
  });
})();
