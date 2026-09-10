// __partials/widgets/hashrate-by-nation/js/provider.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXHashrateNationProvider?.__version||0)>=5)return;

  const CACHE_KEY="zzx.hashrate-by-nation.inputs.v10.42";
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
    }catch(_){
      return null;
    }
  }

  function safeWrite(value){
    try{W.localStorage.setItem(CACHE_KEY,JSON.stringify(value))}catch(_){}
  }

  async function ensureScript(path,test){
    if(test())return;

    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<3000){
        await new Promise(resolve=>setTimeout(resolve,25));
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
      ()=>Number(W.ZZXHashrateNationSources?.__version||0)>=4
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
      ()=>Number(W.ZZXGlobalPowerGridModel?.__version||0)>=2
    );
    await ensureScript(
      S.provider,
      ()=>Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=2
    );
  }

  async function loadHashrate(signal){
    if(typeof W.ZZXHashrateNationSource?.hashrate==="function"){
      const payload=await W.ZZXHashrateNationSource.hashrate({signal});
      return {
        model:W.ZZXHashrateModel.build(payload),
        source:"ZZXHashrateNationSource.hashrate"
      };
    }

    await ensureHashrate();

    const result=await W.ZZXHashrateProvider.load(
      "1m",
      {force:false,signal}
    );

    return {
      model:W.ZZXHashrateModel.build(result.payload),
      source:result.source
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
        schema:"zzx-global-power-grid-hbn-bridge-v1",
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
          editionYear:row.editionYear??null,
          observationYear:row.observationYear??null,
          source:row.source||"unavailable",
          sourceUrl:row.sourceUrl||""
        })),
        registryCount:model?.registryCount||0,
        coverage:model?.coverage||0,
        historySummary:model?.historySummary||null
      },
      source
    };
  }

  async function loadPowerGrid(signal){
    if(typeof W.ZZXHashrateNationSource?.powerGrid==="function"){
      return {
        data:await W.ZZXHashrateNationSource.powerGrid({signal}),
        source:"ZZXHashrateNationSource.powerGrid"
      };
    }

    // Fastest path when Global Power Grid has already mounted.
    if(Array.isArray(W.ZZXGlobalPowerGridLatest?.nations)){
      return {
        data:W.ZZXGlobalPowerGridLatest,
        source:"ZZXGlobalPowerGridLatest"
      };
    }

    // Important v10.42 behavior:
    // HBN mounts before Global Power Grid in the HUD. Load the GPG provider/model
    // directly instead of depending on widget mount order.
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

      // Last-resort static projection. This still uses the same canonical
      // GPG files rather than inventing a second electricity data contract.
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

  async function loadNodes(signal){
    if(typeof W.ZZXHashrateNationSource?.nodes==="function"){
      return {
        data:await W.ZZXHashrateNationSource.nodes({signal}),
        source:"ZZXHashrateNationSource.nodes"
      };
    }

    if(typeof W.ZZXBitnodes?.load==="function"){
      const detail=await W.ZZXBitnodes.load(false);
      return {
        data:detail?.snapshot||detail,
        source:"ZZXBitnodes"
      };
    }

    const S=W.ZZXHashrateNationSources.nodes;

    const local=await W.ZZXHashrateNationFetch.firstJson(
      S.countryAggregates,
      {signal}
    );

    if(local.data){
      const rows=
        local.data?.countries ??
        local.data?.rows ??
        local.data;

      return {
        data:Array.isArray(rows)?rows:[],
        source:local.source
      };
    }

    return {
      data:[],
      source:null,
      error:local.error
    };
  }

  async function load({force=false,signal=null}={}){
    await ensureTransport();

    const cached=safeRead();
    const now=Date.now();

    if(
      !force &&
      cached?.inputs &&
      Number.isFinite(Number(cached.cachedAt)) &&
      now-Number(cached.cachedAt)<TTL_MS
    ){
      return {
        ...cached,
        transport:"cache",
        stale:false
      };
    }

    try{
      const [hashrate,pools,poolEvidence,miningGrid,powerGrid,nodes]=
        await Promise.all([
          loadHashrate(signal),
          loadPools(signal),
          loadPoolEvidence(signal),
          loadMiningGrid(signal),
          loadPowerGrid(signal),
          loadNodes(signal)
        ]);

      if(!hashrate?.model){
        throw new Error("global hashrate unavailable");
      }

      const errors=[
        pools?.error,
        poolEvidence?.error,
        miningGrid?.error,
        powerGrid?.error,
        nodes?.error
      ].filter(Boolean);

      const result={
        inputs:{
          hashrate:hashrate.model,
          pools:pools?.data||{},
          poolEvidence:poolEvidence?.data||{},
          grid:miningGrid?.data||{},
          powerGrid:powerGrid?.data||{},
          nodes:nodes?.data||[]
        },

        sources:{
          hashrate:hashrate.source||"—",
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

      return {
        ...result,
        transport:"live",
        stale:false
      };
    }catch(error){
      if(error?.name==="AbortError")throw error;

      if(cached?.inputs){
        return {
          ...cached,
          transport:"cache",
          stale:true,
          errors:[
            ...(cached.errors||[]),
            String(error?.message||error)
          ]
        };
      }

      throw error;
    }
  }

  W.ZZXHashrateNationProvider=Object.freeze({
    __version:5,
    load
  });
})();
