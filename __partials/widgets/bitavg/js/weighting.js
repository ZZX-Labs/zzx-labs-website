(function(){
  "use strict";
  const W=window;
  if(W.ZZXBPIWeightingController?.__version>=3)return;

  const STORAGE_KEY="zzx.bpi.weighting.mode.v3";
  const LEGACY_KEYS=["zzx.bpi.weighting.mode.v2","zzx.bpi.weights.enabled.v1"];
  const EVENT="zzx:bpi-weighting";
  const MODES=Object.freeze(["off","bpi","global-bpi"]);
  const CHANNEL_NAME="zzx-bpi-weighting-v3";
  let channel=null;

  function valid(v){return MODES.includes(String(v||""))}
  function read(){
    try{
      const current=W.localStorage.getItem(STORAGE_KEY);
      if(valid(current))return current;
      const v2=W.localStorage.getItem(LEGACY_KEYS[0]);
      if(valid(v2))return v2;
      const bool=W.localStorage.getItem(LEGACY_KEYS[1]);
      return bool==="false"?"off":"global-bpi";
    }catch(_){return "global-bpi"}
  }
  let mode=read();

  function detail(source){
    return Object.freeze({
      mode,
      source:String(source||"controller"),
      enabled:mode!=="off",
      bpi_weighted:mode==="bpi",
      global_bpi_weighted:mode==="global-bpi",
      updated_at:new Date().toISOString()
    });
  }
  function store(){
    try{
      W.localStorage.setItem(STORAGE_KEY,mode);
      W.localStorage.setItem(LEGACY_KEYS[0],mode);
      W.localStorage.setItem(LEGACY_KEYS[1],mode==="off"?"false":"true");
    }catch(_){}
  }
  function emit(source,broadcast=true){
    const d=detail(source);
    W.ZZXBPIWeighting=d;
    store();
    try{W.dispatchEvent(new CustomEvent(EVENT,{detail:d}))}catch(_){}
    if(broadcast&&channel){try{channel.postMessage({mode,source:d.source})}catch(_){}}
    return d;
  }
  function setMode(next,source="setMode",broadcast=true){
    const n=String(next||"");
    if(!valid(n))return detail("invalid");
    const changed=n!==mode;mode=n;
    return changed?emit(source,broadcast):detail(source);
  }
  function getMode(){return mode}
  function isWeighted(scope){
    const s=String(scope||"");
    return (s==="bpi"&&mode==="bpi")||(s==="global-bpi"&&mode==="global-bpi");
  }
  function select(scope,weighted,unweighted){
    const w=Number(weighted),u=Number(unweighted);
    if(isWeighted(scope)&&Number.isFinite(w)&&w>0)return w;
    if(Number.isFinite(u)&&u>0)return u;
    return Number.isFinite(w)&&w>0?w:NaN;
  }
  function nextMode(source="nextMode"){
    const i=MODES.indexOf(mode);
    return setMode(MODES[(i+1)%MODES.length],source);
  }
  function previousMode(source="previousMode"){
    const i=MODES.indexOf(mode);
    return setMode(MODES[(i+MODES.length-1)%MODES.length],source);
  }

  if("BroadcastChannel" in W){
    try{
      channel=new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message",e=>{
        const n=e?.data?.mode;
        if(valid(n)&&n!==mode)setMode(n,"broadcast",false);
      });
    }catch(_){channel=null}
  }
  W.addEventListener("storage",e=>{
    if(e.key===STORAGE_KEY&&valid(e.newValue)&&e.newValue!==mode)setMode(e.newValue,"storage",false);
  });

  W.ZZXBPIWeightingController=Object.freeze({
    __version:3,
    storageKey:STORAGE_KEY,
    event:EVENT,
    modes:MODES,
    getMode,setMode,nextMode,previousMode,isWeighted,select,
    snapshot:()=>detail("snapshot")
  });
  emit("bootstrap",false);
})();
