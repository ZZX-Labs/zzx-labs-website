// __partials/widgets/mempool-specs/js/themes.js
(function(){
  "use strict";
  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Theme?.__version>=4)return;

  const FALLBACK={
    id:"zzx-default",
    label:"ZZX Default",
    fonts:{mono:'"IBM Plex Mono", ui-monospace, monospace'},
    colors:{
      canvasBg:"#000000",
      border:"#e6a42b",
      text:"#c0d674",
      muted:"rgba(192,214,116,.70)",
      gridLine:"rgba(255,255,255,.045)",
      tileOutline:"rgba(255,255,255,.09)",
      pending:"#171b1d",
      marker:"rgba(230,164,43,.82)",
      selected:"#ffffff"
    },
    tiers:[
      {min:0,color:"#1e2b32"},
      {min:.125,color:"#24353d"},
      {min:.25,color:"#2c4850"},
      {min:.5,color:"#35645b"},
      {min:1,color:"#4b8562"},
      {min:2,color:"#72a966"},
      {min:5,color:"#c0d674"},
      {min:10,color:"#e6a42b"},
      {min:25,color:"#d67474"}
    ],
    style:{frameWidthCss:3,metaOpacity:.9}
  };

  const mem=new Map();
  const LS="zzx:mempool-specs:theme:selected";
  const CACHE="zzx:mempool-specs:theme:cache:";
  const localIds=["zzx-default"];

  function parse(s){try{return JSON.parse(String(s))}catch(_){return null}}
  function getLS(k){try{return localStorage.getItem(k)}catch(_){return null}}
  function setLS(k,v){try{localStorage.setItem(k,v)}catch(_){}}
  function normalize(raw){
    const t=raw&&typeof raw==="object"?raw:{};
    const out={
      ...FALLBACK,...t,
      fonts:{...FALLBACK.fonts,...(t.fonts||{})},
      colors:{...FALLBACK.colors,...(t.colors||{})},
      style:{...FALLBACK.style,...(t.style||{})},
      tiers:Array.isArray(t.tiers)?t.tiers:FALLBACK.tiers
    };
    out.tiers=out.tiers.map(x=>({min:Number(x?.min)||0,color:String(x?.color||"#888")})).sort((a,b)=>a.min-b.min);
    return out;
  }
  function base(){
    return W.ZZXWidgetsCore?.widgetBase
      ? String(W.ZZXWidgetsCore.widgetBase("mempool-specs")).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool-specs";
  }
  function selected(){return getLS(LS)||"zzx-default"}

  async function load(id=selected()){
    if(mem.has(id))return mem.get(id);
    const cached=parse(getLS(CACHE+id));
    if(cached){const n=normalize(cached);mem.set(id,n);return n}
    const url=`${base()}/themes/${id}.json`;
    try{
      const result=W.ZZXMempoolSpecsFetch?.fetchJSON
        ? await W.ZZXMempoolSpecsFetch.fetchJSON(url,{ttlMs:60000})
        : {json:await (await fetch(url,{cache:"no-store"})).json()};
      const n=normalize(result.json);mem.set(id,n);setLS(CACHE+id,JSON.stringify(result.json));return n;
    }catch(_){const n=normalize(FALLBACK);mem.set(id,n);return n}
  }

  function get(){
    const global=W.ZZXTheme?.widgets?.mempoolSpecs;
    if(global?.theme)return normalize(global.theme);
    const id=global?.themeId||selected();
    if(mem.has(id))return mem.get(id);
    const cached=parse(getLS(CACHE+id));
    return normalize(cached||FALLBACK);
  }

  function colorForFeeRate(rate,theme=get()){
    const fee=Number(rate);
    if(!Number.isFinite(fee)||fee<0)return theme.colors.pending;
    let color=theme.tiers[0].color;
    for(const tier of theme.tiers){if(fee>=tier.min)color=tier.color;else break}
    return color;
  }

  NS.Theme=Object.freeze({
    __version:4,
    get,load,
    warm:()=>load().catch(()=>{}),
    listLocalThemes:()=>localIds.slice(),
    getSelectedThemeId:selected,
    setThemeId:id=>{setLS(LS,String(id||"zzx-default"));return true},
    colorForFeeRate
  });
})();
