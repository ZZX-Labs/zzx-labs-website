// __partials/widgets/hashrate-by-nation/js/provider.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXHashrateNationProvider?.__version||0)>=6)return;

  const CACHE_KEY="zzx.hashrate-by-nation.inputs.v10.46";
  const TTL_MS=10*60*1000;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function safeRead(){
    try{
      const parsed=JSON.parse(W.localStorage.getItem(CACHE_KEY)||"null");
      return parsed&&typeof parsed==="object"?parsed:null;
    }catch(_){return null;}
  }

  function safeWrite(value){
    try{W.localStorage.setItem(CACHE_KEY,JSON.stringify(value));}catch(_){}
  }

  async function ensureScript(path,test){
    if(test())return;

    const src=new URL(path,W.location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<3000){
        await new Promise(resolve=>W.setTimeout(resolve,25));
      }
      if(test())return;
    }

    await new Promise((resolve,reject)=>{
      const script=D.createElement("script");
      script.src=path;
      script.defer=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error(`Failed to load ${path}`));
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test())throw new Error(`${path} did not register`);
  }

  async function ensureTransport(){
    await ensureScript(
      "/__partials/widgets/hashrate-by-nation/js/sources.js",
      ()=>Number(W.ZZXHashrateNationSources?.__version||0)>=5
    );

    await ensureScript(
      "/__partials/widgets/hashrate-by-nation/js/fetch.js",
      ()=>Number(W.ZZXHashrateNationFetch?.__version||0)>=4
    );
  }

  async function ensureHashrate(){
    const S=W.ZZXHashrateNationSources.hashrate;

    await ensureScript(
      S.model,
      ()=>Number(W.ZZXHashrateModel?.__version||0)>=2
    );

    await ensureScript(
      S.provider,
      ()=>Number(W.ZZXHashrateProvider?.__version||0)>=2
    );
  }

  async function ensurePowerGrid(){
    const S=W.ZZXHashrateNationSources.powerGrid;

    await ensureScript(
      S.model,
      ()=>Number(W.ZZXGlobalPowerGridModel?.__version||0)>=3
    );

    await ensureScript(
      S.provider,
      ()=>Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=3
    );
  }

  async function loadHashrate(signal){
    // Always make sure the shared Hashrate model exists before invoking an
    // optional HBN source hook. Older code could call build() on undefined.
    await ensureHashrate();

    if(typeof W.ZZXHashrateNationSource?.hashrate==="function"){
      const payload=await W.ZZXHashrateNationSource.hashrate({signal});
      return {
        model:W.ZZXHashrateModel.build(payload),
        source:"ZZXHashrateNationSource.hashrate"
      };
    }

    const result=await W.ZZXHashrateProvider.load(
      "1m",
      {force:false,signal}
    );

    return {
      model:W.ZZXHashrateModel.build(result.payload),
      source:result.source
    };
  }

  function shareCount(payload){
    const raw=payload?.shares??payload?.countries??payload?.rows??payload?.data;
    if(Array.isArray(raw))return raw.length;
    if(raw&&typeof raw==="object")return Object.keys(raw).length;
    return 0;
  }

  async function loadEstimates(signal){
    if(typeof W.ZZXHashrateNationSource?.estimates==="function"){
      return {
        data:await W.ZZXHashrateNationSource.estimates({signal}),
        source:"ZZXHashrateNationSource.estimates"
      };
    }

    const candidates=W.ZZXHashrateNationSources.estimates||[];
    const errors=[];
    let fallback=null;

    for(const url of candidates){
      const result=await W.ZZXHashrateNationFetch.firstJson([url],{signal});
      if(result.data&&!fallback)fallback=result;
      if(result.data&&shareCount(result.data)>0)return result;
      if(result.error)errors.push(result.error);
    }

    return fallback||{
      data:{shares:[]},
      source:null,
      transport:"unavailable",
      error:errors.join(" | ")
    };
  }

  async function loadPools(signal){
    if(typeof W.ZZXHashrateNationSource?.pools==="function"){
      return {
        data:await W.ZZXHashrateNationSource.pools({signal}),
        source:"ZZXHashrateNationSource.pools"
      };
    }

    const S=W.ZZXHashrateNationSources.pools;
    return W.ZZXHashrateNationFetch.firstJson(
      [S.localPrimary,S.localFallback,S.direct],
      {signal}
    );
  }

  async function loadPoolEvidence(signal){
    if(typeof W.ZZXHashrateNationSource?.poolEvidence==="function"){
      return {
        data:await W.ZZXHashrateNationSource.poolEvidence({signal}),
        source:"ZZXHashrateNationSource.poolEvidence"
      };
    }

    const S=W.ZZXHashrateNationSources.poolEvidence;
    return W.ZZXHashrateNationFetch.firstJson(
      [S.localPrimary,S.localFallback,S.bundled],
      {signal}
    );
  }

  async function loadMiningGrid(signal){
    if(typeof W.ZZXHashrateNationSource?.grid==="function"){
      return {
        data:await W.ZZXHashrateNationSource.grid({signal}),
        source:"ZZXHashrateNationSource.grid"
      };
    }

    const S=W.ZZXHashrateNationSources.miningGrid;
    return W.ZZXHashrateNationFetch.firstJson(
      [S.localPrimary,S.localFallback,S.bundled],
      {signal}
    );
  }

  function modelToPowerGrid(model,source){
    return {
      data:{
        schema:"zzx-global-power-grid-hbn-bridge-v2",
        nations:(model?.rows||[]).map(row=>({
          country:row.country,
          countryName:row.countryName,
          generationMW:Number.isFinite(row.generationMW)?row.generationMW:null,
          loadMW:Number.isFinite(row.loadMW)?row.loadMW:null,
          capacityMW:Number.isFinite(row.capacityMW)?row.capacityMW:null,
          headroomMW:Number.isFinite(row.headroomMW)?row.headroomMW:null,
          absoluteMiningCeilingEH:Number.isFinite(row.absoluteMiningCeilingEH)
            ? row.absoluteMiningCeilingEH
            : null,
          headroomMiningCeilingEH:Number.isFinite(row.headroomMiningCeilingEH)
            ? row.headroomMiningCeilingEH
            : null,
          ceilingBasis:row.ceilingBasis||"unavailable",
          editionYear:row.editionYear??null,
          observationYear:row.observationYear??null,
          source:row.source||"unavailable",
          sourceUrl:row.sourceUrl||""
        })),
        registryCount:model?.registryCount||0,
        coverage:model?.coverage||0,
        historySummary:model?.historySummary||null,
        qualitySummary:model?.qualitySummary||null
      },
      source
    };
  }

  function usefulPowerGrid(rows){
    return Array.isArray(rows)&&rows.some(row=>{
      const g=finite(row?.generationMW??row?.generation_mw);
      const c=finite(row?.capacityMW??row?.capacity_mw);
      const ceiling=finite(row?.absoluteMiningCeilingEH);
      return g>0||c>0||ceiling>0;
    });
  }

  async function loadPowerGrid(signal){
    if(typeof W.ZZXHashrateNationSource?.powerGrid==="function"){
      return {
        data:await W.ZZXHashrateNationSource.powerGrid({signal}),
        source:"ZZXHashrateNationSource.powerGrid"
      };
    }

    if(usefulPowerGrid(W.ZZXGlobalPowerGridLatest?.nations)){
      return {
        data:W.ZZXGlobalPowerGridLatest,
        source:"ZZXGlobalPowerGridLatest"
      };
    }

    try{
      await ensurePowerGrid();

      const detail=await W.ZZXGlobalPowerGridProvider.load({
        force:false,
        signal
      });

      const payload=detail?.payload||{};
      const model=W.ZZXGlobalPowerGridModel.build(
        payload.registry||{countries:[]},
        payload.factbook||{records:[]},
        payload.live||{countries:[]}
      );

      return modelToPowerGrid(
        model,
        `Global Power Grid provider · ${detail?.transport||"local"}`
      );
    }catch(error){
      if(error?.name==="AbortError")throw error;

      // Last-resort static projection through the same GPG model. The model's
      // integrity gate still rejects unverified legacy Factbook rows.
      const S=W.ZZXHashrateNationSources.powerGrid;
      const [registry,factbook,live]=await Promise.all([
        W.ZZXHashrateNationFetch.firstJson(S.registry,{signal}),
        W.ZZXHashrateNationFetch.firstJson(S.factbook,{signal}),
        W.ZZXHashrateNationFetch.firstJson(S.live,{signal})
      ]);

      if(!registry.data){
        return {
          data:{nations:[],registryCount:0},
          source:null,
          error:[
            String(error?.message||error),
            registry.error,
            factbook.error,
            live.error
          ].filter(Boolean).join(" | ")
        };
      }

      await ensurePowerGrid();

      const model=W.ZZXGlobalPowerGridModel.build(
        registry.data,
        factbook.data||{records:[]},
        live.data||{countries:[]}
      );

      const bridged=modelToPowerGrid(
        model,
        factbook.source||live.source||"Global Power Grid static projection"
      );

      bridged.error=[
        String(error?.message||error),
        factbook.error,
        live.error
      ].filter(Boolean).join(" | ");

      return bridged;
    }
  }

  function aggregateGeoJSON(payload){
    const features=Array.isArray(payload?.features)?payload.features:[];
    const counts=new Map();
    const names=new Map();
    let total=0,located=0;

    for(const feature of features){
      const p=feature?.properties||{};
      const syntheticRaw=p.geoSynthetic??p.geo_synthetic??p.synthetic??false;
      const synthetic=syntheticRaw===true||
        ["true","1","yes"].includes(String(syntheticRaw).toLowerCase());
      if(synthetic)continue;

      total++;
      const country=String(
        p.country_code??p.country??p.countryCode??""
      ).trim().toUpperCase();
      if(!/^[A-Z]{2}$/.test(country))continue;

      located++;
      counts.set(country,(counts.get(country)||0)+1);
      names.set(country,String(p.country_name??p.countryName??country));
    }

    const rows=[...counts.entries()].map(([country,count])=>({
      country,
      countryName:names.get(country)||country,
      count
    }));

    return {rows,total,located};
  }

  function normalizeSharedNodes(detail){
    const value=detail?.snapshot||detail;
    if(!value)return null;

    if(Array.isArray(value))return value.length?value:null;
    if(Array.isArray(value.nodes)&&value.nodes.length)return value;

    const byCountry=value.byCountry??value.by_country;
    if(byCountry&&typeof byCountry==="object"){
      const rows=Object.entries(byCountry).map(([country,v])=>({
        country,
        count:typeof v==="number"?v:(v?.count??v?.nodes??v?.value??0),
        countryName:typeof v==="object"?(v?.countryName??v?.name??country):country
      })).filter(row=>finite(row.count)>0);
      if(rows.length)return rows;
    }

    return null;
  }

  async function loadNodes(signal){
    if(typeof W.ZZXHashrateNationSource?.nodes==="function"){
      const data=await W.ZZXHashrateNationSource.nodes({signal});
      const normalized=normalizeSharedNodes(data);
      if(normalized){
        return {data:normalized,source:"ZZXHashrateNationSource.nodes"};
      }
    }

    if(typeof W.ZZXBitnodes?.load==="function"){
      try{
        const detail=await W.ZZXBitnodes.load(false);
        const normalized=normalizeSharedNodes(detail);
        if(normalized){
          return {data:normalized,source:"ZZXBitnodes"};
        }
      }catch(error){
        if(error?.name==="AbortError")throw error;
      }
    }

    const S=W.ZZXHashrateNationSources.nodes;

    const aggregate=await W.ZZXHashrateNationFetch.firstJson(
      S.countryAggregates,
      {signal}
    );

    if(aggregate.data){
      const rows=
        aggregate.data?.countries ??
        aggregate.data?.rows ??
        aggregate.data;

      if(Array.isArray(rows)&&rows.length){
        return {data:rows,source:aggregate.source};
      }
    }

    const geo=await W.ZZXHashrateNationFetch.firstJson(
      S.geojson,
      {signal}
    );

    if(geo.data){
      const aggregated=aggregateGeoJSON(geo.data);
      if(aggregated.rows.length){
        return {
          data:aggregated.rows,
          source:`${geo.source} · aggregated ${aggregated.located}/${aggregated.total} real-geography nodes`
        };
      }
    }

    return {
      data:[],
      source:null,
      error:[aggregate.error,geo.error].filter(Boolean).join(" | ")
    };
  }

  async function load({force=false,signal=null}={}){
    await ensureTransport();

    const cached=safeRead();
    const now=Date.now();

    if(
      !force&&
      cached?.inputs&&
      Number.isFinite(Number(cached.cachedAt))&&
      now-Number(cached.cachedAt)<TTL_MS
    ){
      return {...cached,transport:"cache",stale:false};
    }

    try{
      const [hashrate,estimates,pools,poolEvidence,miningGrid,powerGrid,nodes]=
        await Promise.all([
          loadHashrate(signal),
          loadEstimates(signal),
          loadPools(signal),
          loadPoolEvidence(signal),
          loadMiningGrid(signal),
          loadPowerGrid(signal),
          loadNodes(signal)
        ]);

      if(!hashrate?.model)throw new Error("global hashrate unavailable");

      const errors=[
        estimates?.error,
        pools?.error,
        poolEvidence?.error,
        miningGrid?.error,
        powerGrid?.error,
        nodes?.error
      ].filter(Boolean);

      const result={
        inputs:{
          hashrate:hashrate.model,
          estimates:estimates?.data||{shares:[]},
          pools:pools?.data||{},
          poolEvidence:poolEvidence?.data||{},
          grid:miningGrid?.data||{},
          powerGrid:powerGrid?.data||{},
          nodes:nodes?.data||[]
        },
        sources:{
          hashrate:hashrate.source||"—",
          estimates:estimates?.source||"unavailable",
          pools:pools?.source||"unavailable",
          poolEvidence:poolEvidence?.source||"unavailable",
          grid:miningGrid?.source||"unavailable",
          powerGrid:powerGrid?.source||"unavailable",
          nodes:nodes?.source||"unavailable"
        },
        cachedAt:now,
        errors
      };

      safeWrite(result);
      return {...result,transport:"live",stale:false};
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(cached?.inputs){
        return {
          ...cached,
          transport:"cache",
          stale:true,
          errors:[...(cached.errors||[]),String(error?.message||error)]
        };
      }

      throw error;
    }
  }

  W.ZZXHashrateNationProvider=Object.freeze({
    __version:6,
    load,
    aggregateGeoJSON
  });
})();
