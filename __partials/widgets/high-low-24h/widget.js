(function(){
  "use strict";
  const W=window,D=document,ID="high-low-24h";
  const REFRESH_MS=15000;
  const LIVE_PATCH_MS=2500;
  const MAX_POINTS_AUTO=4096;
  const MAX_POINTS_DETAIL=12000;
  const STORE=Object.freeze({
    resolution:"zzx.widget.high-low-24h.resolution.v3",
    priceMode:"zzx.widget.high-low-24h.price-mode.v3",
    volumeMode:"zzx.widget.high-low-24h.volume-mode.v3",
    follow:"zzx.widget.high-low-24h.follow-live.v3"
  });
  const MODULES=Object.freeze([
    ["ZZXHistoryClient","/__partials/widgets/_shared/zzx-history-client.js",6],
    ["ZZXHighLow24HModel","js/model.js",3],
    ["ZZXHighLow24HChart","js/dual-chart.js",3]
  ]);
  const q=(r,s)=>r?.querySelector?.(s)||null;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const safeGet=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
  const safeSet=(k,v)=>{try{localStorage.setItem(k,String(v))}catch(_){}};
  const active=root=>!!(root?.isConnected&&D.visibilityState!=="hidden"&&!root.closest?.("[hidden]")&&W.ZZXHUD?.read?.().mode!=="hidden");
  const set=(root,sel,v)=>{const e=q(root,sel);if(e)e.textContent=v==null?"—":String(v)};
  const money=v=>Number.isFinite(finite(v))?finite(v).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";
  const btc=v=>Number.isFinite(finite(v))?`${finite(v).toLocaleString(undefined,{maximumFractionDigits:2})} BTC`:"—";
  const pct=v=>Number.isFinite(finite(v))?`${finite(v)>=0?"+":""}${finite(v).toFixed(2)}%`:"—";
  const age=ms=>!Number.isFinite(finite(ms))?"—":finite(ms)<1000?"now":finite(ms)<60000?`${Math.floor(finite(ms)/1000)}s`:finite(ms)<3600000?`${Math.floor(finite(ms)/60000)}m`:`${(finite(ms)/3600000).toFixed(1)}h`;
  const cadence=ms=>!Number.isFinite(finite(ms))?"—":finite(ms)<1000?`${Math.round(finite(ms))} ms`:`${(finite(ms)/1000).toFixed(2)} s`;

  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  async function loadScript(globalName,path,version,base){
    if(Number(W[globalName]?.__version||0)>=version)return;
    const raw=path.startsWith("/")?resolve(path):resolve(`${base}/${path}`);
    const src=`${raw}${raw.includes("?")?"&":"?"}hl24dep=${version}`;
    await new Promise((ok,bad)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=ok;s.onerror=()=>bad(new Error(`failed to load ${path}`));(D.head||D.documentElement).appendChild(s)});
    if(Number(W[globalName]?.__version||0)<version)throw new Error(`${globalName} >= ${version} required`);
  }
  async function ensureModules(core){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/high-low-24h";
    for(const [g,p,v] of MODULES)await loadScript(g,p,v,base);
  }
  async function json(path,{optional=false}={}){
    try{if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(resolve(path),{cacheBust:true,timeoutMs:6000,retries:1});const r=await fetch(resolve(path),{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}catch(e){if(optional)return null;throw e}
  }
  function selection(){return W.ZZXBPISelection||W.ZZXBitcoinTickerSelection?.current?.()||null}
  function controls(root){return {resolution:q(root,"[data-hl24-resolution]")?.value||"auto",priceMode:q(root,"[data-hl24-price-mode]")?.value||"area",volumeMode:q(root,"[data-hl24-volume-mode]")?.value||"interval-bars",follow:!!q(root,"[data-hl24-follow]")?.checked}}
  function restore(root){
    const fields=[["[data-hl24-resolution]",STORE.resolution],["[data-hl24-price-mode]",STORE.priceMode],["[data-hl24-volume-mode]",STORE.volumeMode]];
    for(const [sel,key] of fields){const el=q(root,sel),v=safeGet(key);if(el&&v&&[...el.options].some(o=>o.value===v))el.value=v}
    const follow=safeGet(STORE.follow);if(follow!=null&&q(root,"[data-hl24-follow]"))q(root,"[data-hl24-follow]").checked=follow!=="false";
  }
  function persist(root){const c=controls(root);safeSet(STORE.resolution,c.resolution);safeSet(STORE.priceMode,c.priceMode);safeSet(STORE.volumeMode,c.volumeMode);safeSet(STORE.follow,c.follow)}
  async function historyFor(desc,c){
    const query=source=>W.ZZXHistoryClient.series({source,timeframe:"24h",resolution:c.resolution,maxPoints:c.resolution==="auto"?MAX_POINTS_AUTO:MAX_POINTS_DETAIL});
    let out=await query(desc.id);
    if((out.points?.length||0)<2&&desc.compatibility&&desc.compatibility!==desc.id){const f=await query(desc.compatibility);if((f.points?.length||0)>(out.points?.length||0))out={...f,compatibilitySource:desc.compatibility}}
    return out;
  }
  function stats(root,s){
    set(root,"[data-hl24-price-current]",money(s.priceCurrent));set(root,"[data-hl24-price-high]",money(s.priceHigh24));set(root,"[data-hl24-price-low]",money(s.priceLow24));
    set(root,"[data-hl24-price-range]",`${money(s.priceRange)} · ${Number.isFinite(s.priceRangePct)?s.priceRangePct.toFixed(2)+"%":"—"}`);
    set(root,"[data-hl24-price-position]",Number.isFinite(s.pricePositionPct)?`${s.pricePositionPct.toFixed(1)}% of range`:"—");
    set(root,"[data-hl24-price-change]",`${money(s.priceChange)} · ${pct(s.priceChangePct)}`);
    set(root,"[data-hl24-volume-current]",btc(s.volumeCurrent));set(root,"[data-hl24-volume-high]",btc(s.volumeHigh));set(root,"[data-hl24-volume-low]",btc(s.volumeLow));
    set(root,"[data-hl24-volume-range]",`${btc(s.volumeRange)} · ${Number.isFinite(s.volumeRangePct)?s.volumeRangePct.toFixed(2)+"%":"—"}`);
    set(root,"[data-hl24-volume-change]",`${btc(s.volumeChange)} · ${pct(s.volumeChangePct)}`);set(root,"[data-hl24-volume-average]",`${btc(s.volumeAverage)} / ${btc(s.volumeMedian)}`);
    for(const [sel,val] of [["[data-hl24-price-change]",s.priceChangePct],["[data-hl24-volume-change]",s.volumeChangePct]]){const e=q(root,sel);if(e)e.dataset.tone=Number.isFinite(val)?(val>0?"up":val<0?"down":"flat"):"flat"}
    set(root,"[data-hl24-points]",`${s.points||0} points`);set(root,"[data-hl24-coverage]",`${Number(s.coveragePct||0).toFixed(1)}% coverage`);set(root,"[data-hl24-cadence]",`cadence ${cadence(s.medianIntervalMs)}`);set(root,"[data-hl24-age]",`age ${age(s.ageMs)}`);
    set(root,"[data-hl24-range-coverage]",`price H/L ${Number.isFinite(s.priceHigh24)&&Number.isFinite(s.priceLow24)?"available":"derived/unavailable"}`);set(root,"[data-hl24-price-range-state]",`24h range ${money(s.priceLow24)} – ${money(s.priceHigh24)}`);set(root,"[data-hl24-volume-range-state]",`24h observed range ${btc(s.volumeLow)} – ${btc(s.volumeHigh)}`);
  }
  function empty(root,show,detail){const e=q(root,"[data-hl24-empty]");if(e)e.hidden=!show;if(detail)set(root,"[data-hl24-empty-detail]",detail)}
  function currentLive(state){const s=selection();return W.ZZXHighLow24HModel.mergeLive(state.points||[],s)}
  function patchLive(root,state){
    if(!active(root)||!state.chart||!state.points?.length)return;
    const c=controls(root),points=currentLive(state),s=W.ZZXHighLow24HModel.stats(points),recipe=W.ZZXHighLow24HModel.recipe(c);
    state.points=points;stats(root,s);state.chart.setData(points,recipe,{preserveView:true,followRight:c.follow});
  }
  async function refresh(root,state,{resetView=false}={}){
    if(!active(root))return;
    if(state.busy){state.queued=true;state.resetQueued|=resetView;return}state.busy=true;
    try{
      const c=controls(root),latest=await json("/bitcoin/bpi/api/latest.json",{optional:true}),sel=selection(),desc=W.ZZXHighLow24HModel.sourceDescriptor(sel,latest||{}),changed=desc.id!==state.sourceId;
      state.sourceId=desc.id;set(root,"[data-hl24-source]",desc.label);set(root,"[data-hl24-eyebrow]",`${desc.label} · independent USD price range + BTC volume axes`);
      const data=await historyFor(desc,c),points=W.ZZXHighLow24HModel.mergeLive(data.points||[],sel),s=W.ZZXHighLow24HModel.stats(points),recipe=W.ZZXHighLow24HModel.recipe(c);
      state.points=points;stats(root,s);state.chart.setData(points,recipe,{preserveView:!(resetView||changed),followRight:c.follow});if(resetView||changed)state.chart.resetZoom();
      const enough=points.length>=2;empty(root,!enough,enough?null:`No ${desc.label} high/low history yet; waiting for collector/browser-live points.`);set(root,"[data-mini-status]",enough?`live · ${points.length.toLocaleString()} points · dual-axis`:`waiting for ${desc.label} history`);set(root,"[data-hl24-transport]",`${data.transport||"history"}${data.compatibilitySource?` · compatibility ${data.compatibilitySource}`:""}`);
    }catch(e){set(root,"[data-mini-status]",`history error: ${String(e?.message||e)}`);set(root,"[data-hl24-transport]","transport error");empty(root,true,String(e?.message||e))}finally{state.busy=false;if(state.queued&&root.isConnected){const r=state.resetQueued;state.queued=false;state.resetQueued=false;setTimeout(()=>refresh(root,state,{resetView:r}),0)}}
  }
  async function boot(root,core){
    if(!root)return;root.__zzxHighLow24State?.chart?.destroy?.();await ensureModules(core||W.ZZXWidgetsCore||null);restore(root);
    const canvas=q(root,"[data-mini-canvas]"),tooltip=q(root,"[data-mini-tooltip]");const state={busy:false,queued:false,resetQueued:false,points:[],sourceId:null,chart:new W.ZZXHighLow24HChart.Chart(canvas,tooltip,{})};root.__zzxHighLow24State=state;
    q(root,"[data-mini-refresh]")?.addEventListener("click",()=>refresh(root,state));q(root,"[data-mini-reset]")?.addEventListener("click",()=>state.chart.resetZoom());q(root,"[data-mini-export]")?.addEventListener("click",()=>state.chart.exportPNG?.("zzx-high-low-24h.png"));
    for(const sel of ["[data-hl24-resolution]","[data-hl24-price-mode]","[data-hl24-volume-mode]","[data-hl24-follow]"])q(root,sel)?.addEventListener("change",()=>{persist(root);refresh(root,state,{resetView:sel.includes("resolution")})});
    const schedule=()=>{if(root.isConnected)patchLive(root,state)};W.addEventListener("zzx:bpi-selection",schedule);W.addEventListener("zzx:live-bpi",schedule);W.addEventListener("zzx:bpi-weighting",()=>refresh(root,state,{resetView:true}));
    await refresh(root,state,{resetView:true});
    const loop=async()=>{if(!root.isConnected)return;if(active(root))await refresh(root,state);state.timer=W.setTimeout(loop,REFRESH_MS)};state.timer=W.setTimeout(loop,REFRESH_MS);
    const live=()=>{if(!root.isConnected)return;if(active(root))patchLive(root,state);state.liveTimer=W.setTimeout(live,LIVE_PATCH_MS)};state.liveTimer=W.setTimeout(live,LIVE_PATCH_MS);
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
