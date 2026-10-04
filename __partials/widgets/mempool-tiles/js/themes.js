// __partials/widgets/mempool-tiles/js/themes.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesThemes?.__version>=1)return;

  const fallback={
    id:"zzx-default",
    colors:{
      background:"#020302",
      grid:"rgba(255,255,255,.025)",
      border:"#e6a42b",
      selected:"#ffffff",
      pending:"#263137",
      feeLow:"#265f26",
      feeMid:"#3f9f3f",
      feeHigh:"#5aff4e",
      rbf:"#d65a5a",
      nonRbf:"#4e83d6",
      ordinal:"#7657a8",
      data:"#6e7480",
      boosted:"#e6a42b",
      unknown:"#56605d"
    }
  };

  let current=fallback;

  async function load(url){
    try{
      const data=await fetch(url,{cache:"no-store"}).then(r=>{
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        return r.json();
      });

      if(data&&typeof data==="object"){
        current={
          ...fallback,
          ...data,
          colors:{...fallback.colors,...(data.colors||{})}
        };
      }
    }catch(_){}

    return current;
  }

  function get(){
    return current;
  }

  W.ZZXMempoolTilesThemes=Object.freeze({
    __version:1,
    load,
    get
  });
})();
