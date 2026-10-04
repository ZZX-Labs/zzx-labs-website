(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolGogglesProvider?.__version>=2)return;

  async function load(core,force=false){
    if(!W.ZZXMempoolLive?.load)throw new Error("ZZXMempoolLive v2 unavailable");
    const view=await W.ZZXMempoolLive.load(core,force);
    if(!view?.snapshot)throw new Error("mempool live snapshot unavailable");
    return Object.freeze({...view.snapshot,transport:view.transport,liveConnected:view.connected,wsUrl:view.wsUrl});
  }

  function subscribe(core,fn,{immediate=true}={}){
    if(!W.ZZXMempoolLive?.subscribe)throw new Error("ZZXMempoolLive v2 unavailable");
    return W.ZZXMempoolLive.subscribe(core,view=>{
      if(!view?.snapshot)return;
      fn(Object.freeze({...view.snapshot,transport:view.transport,liveConnected:view.connected,wsUrl:view.wsUrl}));
    },{immediate});
  }

  function reconnect(core){W.ZZXMempoolLive?.reconnect?.(core);}

  W.ZZXMempoolGogglesProvider=Object.freeze({__version:2,load,subscribe,reconnect});
})();
