(function(){
  "use strict";
  const W=window;
  if(W.ZZXChain?.__version>=5)return;

  const SATS=100000000n;
  const INTERVAL=210000n;
  const INITIAL=5000000000n;
  const url=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;

  async function text(path){
    try{
      if(W.ZZXAPI?.textStrict)return await W.ZZXAPI.textStrict(url(path),{cacheBust:true,timeoutMs:7000,retries:1});
      const r=await fetch(url(path),{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.text();
    }catch(error){
      const r=await fetch("https://mempool.space/api/blocks/tip/height",{cache:"no-store",credentials:"omit"});
      if(!r.ok)throw error;
      return await r.text();
    }
  }

  async function json(path,fallbackUrl){
    try{
      if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(url(path),{cacheBust:true,timeoutMs:7000,retries:1});
      const r=await fetch(url(path),{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(error){
      if(!fallbackUrl)throw error;
      const r=await fetch(fallbackUrl,{cache:"no-store",credentials:"omit"});
      if(!r.ok)throw error;
      return await r.json();
    }
  }

  async function tipHeight(){
    const raw=await text("/bitcoin/mempool.space/api/blocks/tip/height");
    const height=Number(String(raw).trim());
    if(!Number.isFinite(height)||height<0)throw new Error("invalid chain tip");
    return {height:Math.trunc(height),source:"ZZX local mempool mirror"};
  }

  async function recentBlocks(){
    return await json("/bitcoin/mempool.space/api/blocks","https://mempool.space/api/blocks");
  }

  function issuedSatsAtHeight(height){
    const h=Math.floor(Number(height));
    if(!Number.isFinite(h)||h<0)return 0n;
    let blocks=BigInt(h+1),era=0n,total=0n;
    while(blocks>0n){
      const subsidy=INITIAL>>era;
      if(subsidy<=0n)break;
      const take=blocks>INTERVAL?INTERVAL:blocks;
      total+=take*subsidy;
      blocks-=take;
      era+=1n;
    }
    return total;
  }

  function issuedBtcAtHeight(height){
    return Number(issuedSatsAtHeight(height))/Number(SATS);
  }

  async function historicalPriceUsd(date){
    const target=String(date||"");
    const history=await json("/bitcoin/bpi/api/history.json",null);
    const rows=Array.isArray(history)?history:(history?.rows||history?.history||[]);
    const hit=rows.find(r=>String(r.date||r.day||"").slice(0,10)===target);
    const price=Number(hit?.price_usd??hit?.price??hit?.bpi_usd);
    if(!(price>0))throw new Error(`historical BTC/USD unavailable for ${target}`);
    return {price,source:"ZZX local BPI history"};
  }

  W.ZZXChain=Object.freeze({
    __version:5,
    tipHeight,
    recentBlocks,
    historicalPriceUsd,
    issuedSatsAtHeight,
    issuedBtcAtHeight
  });
})();
