(function(){
  "use strict";

  const W=window;
  if(W.ZZXBPIWeightingController?.__version>=1)return;

  const STORAGE_KEY="zzx.bpi.weighting.mode.v2";
  const LEGACY_KEY="zzx.bpi.weights.enabled.v1";
  const EVENT="zzx:bpi-weighting";
  const MODES=Object.freeze(["off","bpi","global-bpi"]);

  function valid(mode){
    return MODES.includes(String(mode||""));
  }

  function migrate(){
    let stored=null;

    try{
      stored=W.localStorage.getItem(STORAGE_KEY);
    }catch(_){}

    if(valid(stored))return stored;

    let legacy=null;

    try{
      legacy=W.localStorage.getItem(LEGACY_KEY);
    }catch(_){}

    // Legacy boolean did not encode which index was intended.  Do not
    // silently apply global weighting when scope is unknown.
    return "off";
  }

  let mode=migrate();

  function detail(source){
    return Object.freeze({
      mode,
      enabled:mode!=="off",
      target:mode==="off"?null:mode,
      source:String(source||"controller"),
      updated_at:new Date().toISOString()
    });
  }

  function publish(source,dispatch=true){
    const value=detail(source);
    W.ZZXBPIWeighting=value;

    try{
      W.localStorage.setItem(STORAGE_KEY,mode);
      W.localStorage.setItem(LEGACY_KEY,mode==="off"?"false":"true");
    }catch(_){}

    if(dispatch){
      try{
        W.dispatchEvent(new CustomEvent(EVENT,{detail:value}));
      }catch(_){}
    }

    return value;
  }

  function getMode(){
    return mode;
  }

  function setMode(next,source){
    const normalized=String(next||"");
    if(!valid(normalized))return publish(source||"invalid",false);

    const changed=normalized!==mode;
    mode=normalized;
    return publish(source||"setMode",changed);
  }

  function nextMode(source){
    const index=MODES.indexOf(mode);
    return setMode(
      MODES[(index+1)%MODES.length],
      source||"nextMode"
    );
  }

  function previousMode(source){
    const index=MODES.indexOf(mode);
    return setMode(
      MODES[(index+MODES.length-1)%MODES.length],
      source||"previousMode"
    );
  }

  function isWeighted(target){
    return mode===String(target||"");
  }

  W.ZZXBPIWeightingController=Object.freeze({
    __version:1,
    storageKey:STORAGE_KEY,
    legacyStorageKey:LEGACY_KEY,
    event:EVENT,
    modes:MODES,
    getMode,
    setMode,
    nextMode,
    previousMode,
    isWeighted,
    snapshot:()=>detail("snapshot")
  });

  publish("bootstrap",false);
})();
