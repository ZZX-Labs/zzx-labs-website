// __partials/widgets/_shared/zzx-population.js
// ZZX-Labs shared world-population model for SPP and related widgets.
// Local mirror first -> World Bank -> AllOrigins -> bundled fallback model.
(function(){
  "use strict";
  const W=window;
  if(W.ZZXPopulation&&Number(W.ZZXPopulation.__version||0)>=2)return;
  const VERSION=2;
  const CACHE_TTL_MS=6*60*60*1000;
  const YEAR_MS=365.2425*24*60*60*1000;
  const ENDPOINTS=Object.freeze({
    local:"/bitcoin/bpi/api/population.json",
    worldBank:"https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=8",
    allOrigins:"https://api.allorigins.win/raw?url="
  });
  const FALLBACK=Object.freeze({
    anchorYear:2022,
    anchorAt:Date.UTC(2022,10,15,12,0,0),
    anchorPopulation:8000000000,
    annualGrowth:0.008,
    source:"Bundled population fallback model",
    liveAnchor:false,
    observations:[]
  });
  const cache={model:null,at:0,inflight:null};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return Number.isFinite(n)&&n>0?n:NaN};
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  async function fetchJSON(path,options){
    const opts=Object.assign({timeoutMs:9000,retries:1,retryDelayMs:350,cacheBust:true},options||{});
    if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(path,opts);
    const target=/^https?:\/\//i.test(path)?path:resolve(path);
    const controller=typeof AbortController==="function"?new AbortController():null;
    const timer=controller?W.setTimeout(()=>controller.abort(),Math.max(0,Number(opts.timeoutMs)||9000)):null;
    try{
      const response=await fetch(target,{cache:"no-store",credentials:/^https?:\/\//i.test(target)?"omit":"same-origin",signal:controller?.signal});
      if(!response.ok){const e=new Error(`HTTP ${response.status} ${target}`);e.status=response.status;throw e}
      return await response.json();
    }finally{if(timer!==null)W.clearTimeout(timer)}
  }
  function normalizeGrowth(value){
    const n=finite(value); if(!Number.isFinite(n))return NaN;
    const decimal=Math.abs(n)>0.2?n/100:n;
    return decimal>-0.05&&decimal<0.10?decimal:NaN;
  }
  function normalizeLocal(data){
    if(!data||typeof data!=="object")return null;
    const population=positive(data.anchor_population??data.anchorPopulation??data.population??data.value);
    if(!Number.isFinite(population))return null;
    const year=Math.trunc(finite(data.anchor_year??data.anchorYear??data.year??new Date().getUTCFullYear()));
    const rawAt=data.anchor_at??data.anchorAt??data.updated_at??data.updatedAt??null;
    const parsedAt=rawAt?new Date(rawAt).getTime():NaN;
    const anchorAt=Number.isFinite(parsedAt)?parsedAt:Date.UTC(year,6,1,12,0,0);
    let growth=normalizeGrowth(data.annual_growth??data.annualGrowth??data.growth_rate??data.growthRate);
    const observations=Array.isArray(data.observations)?data.observations.map(row=>({year:Math.trunc(finite(row?.year)),population:positive(row?.population??row?.value)})).filter(row=>Number.isFinite(row.year)&&Number.isFinite(row.population)).sort((a,b)=>b.year-a.year):[];
    if(!Number.isFinite(growth)&&observations.length>=2){
      const a=observations[0],b=observations.find(row=>row.year<a.year&&row.population>0);
      if(b){const years=a.year-b.year;if(years>0)growth=Math.pow(a.population/b.population,1/years)-1}
    }
    if(!Number.isFinite(growth))growth=FALLBACK.annualGrowth;
    return {anchorYear:year,anchorAt,anchorPopulation:population,annualGrowth:growth,source:String(data.source||data.provider||"ZZX local population mirror"),liveAnchor:data.live_anchor!==false&&data.liveAnchor!==false,observations,fetchedAt:Date.now()};
  }
  function normalizeWorldBank(payload){
    if(!Array.isArray(payload)||payload.length<2||!Array.isArray(payload[1]))return null;
    const observations=payload[1].map(row=>({year:Math.trunc(finite(row?.date)),population:positive(row?.value)})).filter(row=>Number.isFinite(row.year)&&Number.isFinite(row.population)).sort((a,b)=>b.year-a.year);
    if(!observations.length)return null;
    const latest=observations[0],previous=observations.find(row=>row.year<latest.year&&row.population>0);
    let growth=FALLBACK.annualGrowth;
    if(previous){const years=latest.year-previous.year;if(years>0){const d=Math.pow(latest.population/previous.population,1/years)-1;if(Number.isFinite(d)&&d>-0.05&&d<0.10)growth=d}}
    return {anchorYear:latest.year,anchorAt:Date.UTC(latest.year,6,1,12,0,0),anchorPopulation:latest.population,annualGrowth:growth,source:"World Bank · WLD/SP.POP.TOTL",liveAnchor:true,observations,fetchedAt:Date.now()};
  }
  function cloneFallback(){return {anchorYear:FALLBACK.anchorYear,anchorAt:FALLBACK.anchorAt,anchorPopulation:FALLBACK.anchorPopulation,annualGrowth:FALLBACK.annualGrowth,source:FALLBACK.source,liveAnchor:false,observations:[],fetchedAt:Date.now()}}
  function estimateFromModel(model,at){
    if(!model)throw new Error("population model unavailable");
    const anchorPopulation=positive(model.anchorPopulation),growth=normalizeGrowth(model.annualGrowth),anchorAt=finite(model.anchorAt),when=at==null?Date.now():finite(at);
    if(!Number.isFinite(anchorPopulation))throw new Error("invalid population anchor");
    if(!Number.isFinite(growth))throw new Error("invalid population growth");
    if(!Number.isFinite(anchorAt))throw new Error("invalid population anchor time");
    if(!Number.isFinite(when))throw new Error("invalid estimate time");
    const years=(when-anchorAt)/YEAR_MS;
    const population=anchorPopulation*Math.pow(1+growth,years);
    if(!(Number.isFinite(population)&&population>0))throw new Error("invalid population estimate");
    return {population,at:when,yearsFromAnchor:years,annualGrowth:growth,anchorYear:Number(model.anchorYear),anchorAt,anchorPopulation,source:String(model.source||"ZZXPopulation"),liveAnchor:!!model.liveAnchor};
  }
  async function load(force=false){
    const now=Date.now();
    if(!force&&cache.model&&now-cache.at<CACHE_TTL_MS)return cache.model;
    if(cache.inflight)return cache.inflight;
    cache.inflight=(async()=>{
      let model=null;
      try{model=normalizeLocal(await fetchJSON(ENDPOINTS.local))}catch(_){}
      if(!model){try{model=normalizeWorldBank(await fetchJSON(ENDPOINTS.worldBank))}catch(_){}}
      if(!model){try{model=normalizeWorldBank(await fetchJSON(ENDPOINTS.allOrigins+encodeURIComponent(ENDPOINTS.worldBank)));if(model)model.source="World Bank · WLD/SP.POP.TOTL · AllOrigins"}catch(_){}}
      if(!model)model=cloneFallback();
      cache.model=Object.freeze(model);cache.at=Date.now();return cache.model;
    })().finally(()=>{cache.inflight=null});
    return cache.inflight;
  }
  async function estimate(at,force=false){return estimateFromModel(await load(force),at)}
  function clear(){cache.model=null;cache.at=0;cache.inflight=null}
  W.ZZXPopulation=Object.freeze({__version:VERSION,endpoints:ENDPOINTS,load,estimate,estimateFromModel,normalizeLocal,normalizeWorldBank,clear});
})();
