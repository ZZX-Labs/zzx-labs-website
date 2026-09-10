// __partials/widgets/hashrate-by-nation/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationModel?.__version||0)>=6)return;

  // Effective weights are multiplied by each source's measured coverage.
  // Direct/local nation-share estimates and mining-specific evidence dominate.
  // Generic grid and node geography remain deliberately weak priors.
  const BASE_WEIGHTS=Object.freeze({
    direct:0.70,
    pool:0.55,
    grid:0.25,
    capacity:0.05,
    nodes:0.05
  });

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clamp(value,min=0,max=1){
    const n=finite(value);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
  }

  function iso(value){
    const text=String(value||"").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text)?text:"";
  }

  function flag(code){
    const cc=iso(code);
    if(!cc)return "🏴";
    return String.fromCodePoint(...[...cc].map(ch=>127397+ch.charCodeAt(0)));
  }

  function countryMeta(code,name=""){
    const cc=iso(code);
    if(!cc)return {code:"",name:"Unlocated",flag:"🏴",located:false};

    if(typeof W.ZZXBitnodes?.countryMeta==="function"){
      const meta=W.ZZXBitnodes.countryMeta(cc,name);
      if(meta?.located){
        return {
          code:cc,
          name:meta.name||name||cc,
          flag:meta.flag||flag(cc),
          located:true
        };
      }
    }

    return {code:cc,name:String(name||cc),flag:flag(cc),located:true};
  }

  function directRows(payload){
    const raw=payload?.shares??payload?.countries??payload?.rows??payload?.data??[];

    if(Array.isArray(raw))return raw;

    if(raw&&typeof raw==="object"){
      return Object.entries(raw).map(([country,value])=>{
        if(value&&typeof value==="object")return {country,...value};
        return {country,share:value};
      });
    }

    return [];
  }

  function directComponent(payload){
    const scores=new Map(),names=new Map();
    let accepted=0,declaredShare=0,confidenceMass=0;

    for(const row of directRows(payload)){
      const country=iso(row?.country??row?.country_code??row?.iso);
      if(!country)continue;

      let share=finite(row?.share??row?.fraction??row?.weight??row?.percent);
      if(!Number.isFinite(share)||share<=0)continue;
      if(share>1&&share<=100)share/=100;
      if(!(share>0&&share<=1))continue;

      const confidence=clamp(row?.confidence??row?.quality??payload?.confidence??0.75);
      if(!(confidence>0))continue;

      scores.set(country,(scores.get(country)||0)+share*confidence);
      names.set(country,String(row?.countryName??row?.country_name??row?.name??""));
      accepted++;
      declaredShare+=share;
      confidenceMass+=share*confidence;
    }

    return {
      scores,
      names,
      coverage:clamp(declaredShare),
      accepted,
      declaredShare,
      confidenceMass
    };
  }

  function poolName(row){
    return String(
      row?.name ??
      row?.pool?.name ??
      row?.poolName ??
      row?.slug ??
      row?.id ??
      ""
    ).trim();
  }

  function poolBlocks(row){
    const n=finite(row?.blockCount??row?.block_count??row?.blocks??row?.count);
    return Number.isFinite(n)&&n>=0?n:0;
  }

  function parsePools(payload){
    const raw=payload?.pools??payload?.data??payload?.rows??(Array.isArray(payload)?payload:[]);
    if(!Array.isArray(raw))return [];

    return raw
      .map(row=>({name:poolName(row),blocks:poolBlocks(row)}))
      .filter(row=>row.name&&row.blocks>0);
  }

  function evidenceMap(payload){
    const raw=payload?.pools;
    if(!raw)return new Map();

    const map=new Map();
    if(Array.isArray(raw)){
      for(const row of raw){
        const name=poolName(row);
        if(name)map.set(name.toLowerCase(),row);
      }
    }else if(typeof raw==="object"){
      for(const [name,row] of Object.entries(raw)){
        map.set(String(name).toLowerCase(),{
          ...(row&&typeof row==="object"?row:{}),
          name
        });
      }
    }
    return map;
  }

  function poolComponent(poolsPayload,evidencePayload){
    const pools=parsePools(poolsPayload);
    const totalBlocks=pools.reduce((sum,row)=>sum+row.blocks,0);
    const evidence=evidenceMap(evidencePayload);
    const scores=new Map();

    if(totalBlocks<=0){
      return {scores,coverage:0,mappedPools:0,pools:pools.length,totalBlocks:0};
    }

    let coverage=0,mappedPools=0;

    for(const pool of pools){
      const share=pool.blocks/totalBlocks;
      const ev=evidence.get(pool.name.toLowerCase());
      const allocations=Array.isArray(ev?.allocations)?ev.allocations:[];

      let mappedFraction=0,mappedThisPool=false;
      for(const allocation of allocations){
        const country=iso(allocation?.country??allocation?.country_code??allocation?.iso);
        const fraction=clamp(allocation?.fraction??allocation?.share);
        const confidence=clamp(allocation?.confidence??0.5);
        if(!country||fraction<=0||confidence<=0)continue;

        const contribution=share*fraction*confidence;
        scores.set(country,(scores.get(country)||0)+contribution);
        mappedFraction+=fraction*confidence;
        mappedThisPool=true;
      }

      coverage+=share*clamp(mappedFraction);
      if(mappedThisPool)mappedPools++;
    }

    return {
      scores,
      coverage:clamp(coverage),
      mappedPools,
      pools:pools.length,
      totalBlocks
    };
  }

  function rawRows(payload){
    const raw=payload?.countries??payload?.nations??payload?.rows??payload?.data??(Array.isArray(payload)?payload:[]);
    return Array.isArray(raw)?raw:[];
  }

  function gridComponent(payload,globalEH){
    const scores=new Map(),names=new Map();
    let totalMiningMW=0,accepted=0;

    const defaultEfficiency=finite(payload?.efficiency_j_per_th);
    const fallbackEfficiency=Number.isFinite(defaultEfficiency)&&defaultEfficiency>0?defaultEfficiency:30;

    for(const row of rawRows(payload)){
      const country=iso(row?.country??row?.country_code??row?.iso);
      if(!country)continue;

      const miningMW=finite(
        row?.bitcoinMiningPowerMW ??
        row?.bitcoin_mining_power_mw ??
        row?.miningPowerMW ??
        row?.mining_power_mw ??
        row?.knownMiningPowerMW ??
        row?.known_mining_power_mw ??
        row?.estimatedBitcoinLoadMW ??
        row?.estimated_bitcoin_load_mw
      );
      if(!(miningMW>0))continue;

      const efficiency=finite(row?.efficiencyJTH??row?.efficiency_j_per_th);
      const jth=Number.isFinite(efficiency)&&efficiency>0?efficiency:fallbackEfficiency;
      const quality=clamp(row?.confidence??row?.quality??0.65);
      const equivalentEH=(miningMW/jth)*quality;
      if(!(equivalentEH>0))continue;

      scores.set(country,(scores.get(country)||0)+equivalentEH);
      names.set(country,String(row?.countryName??row?.country_name??""));
      totalMiningMW+=miningMW;
      accepted++;
    }

    const equivalentTotal=[...scores.values()].reduce((sum,value)=>sum+value,0);
    const coverage=globalEH>0?clamp(equivalentTotal/globalEH):0;

    return {scores,names,coverage,accepted,totalMiningMW,equivalentTotalEH:equivalentTotal};
  }

  function capacityComponent(payload){
    const rows=rawRows(payload);
    const scores=new Map(),names=new Map();
    let accepted=0,totalGenerationMW=0;

    for(const row of rows){
      const country=iso(row?.country??row?.country_code??row?.iso);
      if(!country)continue;

      const generation=finite(row?.generationMW??row?.generation_mw);
      const capacity=finite(row?.capacityMW??row?.capacity_mw);
      const ceiling=finite(row?.absoluteMiningCeilingEH);
      let basis=Number.isFinite(generation)&&generation>0?generation:capacity;

      if(!(basis>0)&&ceiling>0)basis=ceiling*30;
      if(!(basis>0))continue;

      scores.set(country,basis);
      names.set(country,String(row?.countryName??row?.country_name??""));
      totalGenerationMW+=basis;
      accepted++;
    }

    const registryCount=finite(payload?.registryCount??payload?.registry_count);
    const denominator=Number.isFinite(registryCount)&&registryCount>0
      ? registryCount
      : Math.max(rows.length,accepted);
    const coverage=denominator>0?clamp(accepted/denominator):0;

    return {
      scores,
      names,
      coverage,
      accepted,
      totalGenerationMW,
      registryCount:denominator
    };
  }

  function nodeComponent(input){
    const scores=new Map(),names=new Map();

    if(Array.isArray(input)){
      let located=0,total=0;

      for(const row of input){
        const count=finite(row?.count??row?.nodes??row?.value);
        if(!(count>0))continue;
        total+=count;

        const country=iso(row?.country??row?.country_code??row?.iso);
        if(!country)continue;

        located+=count;
        scores.set(country,(scores.get(country)||0)+count);
        names.set(country,String(row?.countryName??row?.country_name??row?.name??""));
      }

      return {scores,names,coverage:total>0?clamp(located/total):0,located,total};
    }

    const snapshot=input?.snapshot||input||{};
    const nodes=Array.isArray(snapshot.nodes)?snapshot.nodes:[];
    const denominator=finite(
      snapshot.reachableNodes ??
      snapshot.reachable_nodes ??
      snapshot.totalNodes ??
      snapshot.total_nodes ??
      nodes.length
    );

    let located=0;
    for(const row of nodes){
      const country=iso(row?.country??row?.countryCode??row?.country_code);
      if(!country)continue;
      located++;
      scores.set(country,(scores.get(country)||0)+1);
      names.set(country,String(row?.countryName??row?.country_name??""));
    }

    const total=Number.isFinite(denominator)&&denominator>0?denominator:nodes.length;
    return {scores,names,coverage:total>0?clamp(located/total):0,located,total};
  }

  function normalizeScores(map){
    const total=[...map.values()].reduce((sum,value)=>sum+(value>0?value:0),0);
    const normalized=new Map();
    if(total<=0)return normalized;
    for(const [country,value] of map.entries()){
      if(value>0)normalized.set(country,value/total);
    }
    return normalized;
  }

  function global24h(hashrateModel){
    const history=Array.isArray(hashrateModel?.history)?hashrateModel.history:[];

    if(!history.length){
      const current=finite(hashrateModel?.currentEH??hashrateModel?.current);
      return {
        averageEH:Number.isFinite(current)&&current>0?current:NaN,
        history:[]
      };
    }

    const ordered=history
      .map(row=>({t:finite(row?.t??row?.timestamp),eh:finite(row?.eh??row?.hashrateEH)}))
      .filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.eh)&&row.eh>=0)
      .sort((a,b)=>a.t-b.t);

    if(!ordered.length){
      const current=finite(hashrateModel?.currentEH??hashrateModel?.current);
      return {averageEH:Number.isFinite(current)&&current>0?current:NaN,history:[]};
    }

    const end=ordered.at(-1).t;
    const cutoff=end-24*60*60*1000;
    const windowed=ordered.filter(row=>row.t>=cutoff);
    const used=windowed.length?windowed:ordered.slice(-24);
    const average=used.reduce((sum,row)=>sum+row.eh,0)/used.length;

    return {averageEH:average,history:used};
  }

  function gridCeilingMap(inputs){
    const map=new Map();
    const explicit=inputs?.powerGrid?.nations;
    const runtime=W.ZZXGlobalPowerGridLatest?.nations;
    const rows=Array.isArray(explicit)?explicit:(Array.isArray(runtime)?runtime:[]);

    for(const row of rows){
      const country=iso(row?.country);
      const ceiling=finite(row?.absoluteMiningCeilingEH);
      if(country&&Number.isFinite(ceiling)&&ceiling>=0)map.set(country,ceiling);
    }
    return map;
  }

  function applyPhysicalCeilings(rows,globalEH,ceilings){
    if(!ceilings?.size)return {rows,constrained:false,unallocatedEH:0};

    const work=rows.map(row=>({...row}));
    let constrained=false;
    let remaining=globalEH;
    const active=new Set(work.map((_,index)=>index));

    for(let pass=0;pass<work.length+2;pass++){
      const weightTotal=[...active].reduce((sum,index)=>sum+work[index].share,0);
      if(!(weightTotal>0))break;

      let changed=false;
      for(const index of [...active]){
        const row=work[index];
        const ceiling=ceilings.get(row.country);
        const proposed=remaining*(row.share/weightTotal);

        if(Number.isFinite(ceiling)&&proposed>ceiling){
          row.estimateEH=ceiling;
          row.physicalCeilingEH=ceiling;
          remaining=Math.max(0,remaining-ceiling);
          active.delete(index);
          changed=true;
          constrained=true;
        }
      }

      if(!changed){
        for(const index of active){
          const row=work[index];
          row.estimateEH=remaining*(row.share/weightTotal);
          row.physicalCeilingEH=ceilings.get(row.country)??null;
        }
        remaining=0;
        break;
      }
    }

    for(const row of work){
      row.share=globalEH>0?row.estimateEH/globalEH:0;
      const width=Math.max(0,row.highEH-row.lowEH);
      row.lowEH=Math.min(row.estimateEH,Math.max(0,row.estimateEH-width/2));
      row.highEH=Math.max(row.estimateEH,row.estimateEH+width/2);
    }

    return {rows:work,constrained,unallocatedEH:Math.max(0,remaining)};
  }

  function build(inputs){
    const global=global24h(inputs?.hashrate);
    const globalEH=global.averageEH;

    if(!(globalEH>0))throw new Error("24h global hashrate unavailable");

    const direct=directComponent(inputs?.estimates);
    const pool=poolComponent(inputs?.pools,inputs?.poolEvidence);
    const grid=gridComponent(inputs?.grid,globalEH);
    const capacity=capacityComponent(inputs?.powerGrid);
    const nodes=nodeComponent(inputs?.nodes);

    const directNorm=normalizeScores(direct.scores);
    const poolNorm=normalizeScores(pool.scores);
    const gridNorm=normalizeScores(grid.scores);
    const capacityNorm=normalizeScores(capacity.scores);
    const nodeNorm=normalizeScores(nodes.scores);

    const effective=Object.freeze({
      direct:BASE_WEIGHTS.direct*direct.coverage,
      pool:BASE_WEIGHTS.pool*pool.coverage,
      grid:BASE_WEIGHTS.grid*grid.coverage,
      capacity:BASE_WEIGHTS.capacity*capacity.coverage,
      nodes:BASE_WEIGHTS.nodes*nodes.coverage
    });

    const effectiveTotal=
      effective.direct+
      effective.pool+
      effective.grid+
      effective.capacity+
      effective.nodes;

    if(!(effectiveTotal>0)){
      return Object.freeze({
        schema:"zzx-hashrate-by-nation-model-v6",
        globalEH,
        history:Object.freeze(global.history.map(Object.freeze)),
        timeline:Object.freeze([]),
        rows:Object.freeze([]),
        direct:Object.freeze(direct),
        pool:Object.freeze(pool),
        grid:Object.freeze(grid),
        capacity:Object.freeze(capacity),
        nodes:Object.freeze(nodes),
        effective,
        confidence:0,
        physicalCeilingsApplied:false,
        physicallyUnallocatedEH:0,
        mode:"no geographic evidence"
      });
    }

    const countries=new Set([
      ...directNorm.keys(),
      ...poolNorm.keys(),
      ...gridNorm.keys(),
      ...capacityNorm.keys(),
      ...nodeNorm.keys()
    ]);

    const names=new Map([
      ...capacity.names.entries(),
      ...nodes.names.entries(),
      ...grid.names.entries(),
      ...direct.names.entries()
    ]);

    const preliminary=[];

    for(const country of countries){
      const d=directNorm.get(country)||0;
      const p=poolNorm.get(country)||0;
      const g=gridNorm.get(country)||0;
      const c=capacityNorm.get(country)||0;
      const n=nodeNorm.get(country)||0;

      const score=
        effective.direct*d+
        effective.pool*p+
        effective.grid*g+
        effective.capacity*c+
        effective.nodes*n;

      if(!(score>0))continue;

      preliminary.push({
        country,
        directShare:d,
        poolShare:p,
        gridShare:g,
        capacityShare:c,
        nodeShare:n,
        score
      });
    }

    const scoreTotal=preliminary.reduce((sum,row)=>sum+row.score,0);
    const globalConfidence=clamp(effectiveTotal);

    let rows=preliminary.map(row=>{
      const share=row.score/scoreTotal;
      const estimateEH=globalEH*share;

      const localEvidenceMass=
        (row.directShare>0?BASE_WEIGHTS.direct*direct.coverage:0)+
        (row.poolShare>0?BASE_WEIGHTS.pool*pool.coverage:0)+
        (row.gridShare>0?BASE_WEIGHTS.grid*grid.coverage:0)+
        (row.capacityShare>0?BASE_WEIGHTS.capacity*capacity.coverage:0)+
        (row.nodeShare>0?BASE_WEIGHTS.nodes*nodes.coverage:0);

      const diversity=
        (row.directShare>0?1:0)+
        (row.poolShare>0?1:0)+
        (row.gridShare>0?1:0)+
        (row.capacityShare>0?1:0)+
        (row.nodeShare>0?1:0);

      const localBoost=0.70+0.07*Math.max(0,diversity-1);
      const confidence=clamp(Math.min(globalConfidence,localEvidenceMass)*localBoost);

      const halfWidth=clamp(0.15+0.82*(1-confidence),0.15,0.95);
      const lowEH=Math.max(0,estimateEH*(1-halfWidth));
      const highEH=estimateEH*(1+halfWidth);

      const meta=countryMeta(row.country,names.get(row.country)||"");

      return {
        ...row,
        countryName:meta.name,
        flag:meta.flag,
        share,
        estimateEH,
        lowEH,
        highEH,
        confidence,
        diversity
      };
    }).sort((a,b)=>b.estimateEH-a.estimateEH||a.countryName.localeCompare(b.countryName));

    const physical=applyPhysicalCeilings(rows,globalEH,gridCeilingMap(inputs));
    rows=physical.rows.sort((a,b)=>b.estimateEH-a.estimateEH||a.countryName.localeCompare(b.countryName));

    const timeline=global.history.map(point=>{
      const nations={};
      for(const row of rows.slice(0,5)){
        nations[row.country]=point.eh*row.share;
      }
      return {t:point.t,globalEH:point.eh,nations};
    });

    const mode=[
      direct.coverage>0?"direct nation model":"",
      pool.coverage>0?"pool geography":"",
      grid.coverage>0?"mining power":"",
      capacity.coverage>0?"grid capacity prior":"",
      nodes.coverage>0?"node prior":""
    ].filter(Boolean).join(" + ")||"none";

    return Object.freeze({
      schema:"zzx-hashrate-by-nation-model-v6",
      globalEH,
      history:Object.freeze(global.history.map(Object.freeze)),
      timeline:Object.freeze(timeline.map(Object.freeze)),
      rows:Object.freeze(rows.map(Object.freeze)),
      direct:Object.freeze(direct),
      pool:Object.freeze(pool),
      grid:Object.freeze(grid),
      capacity:Object.freeze(capacity),
      nodes:Object.freeze(nodes),
      effective,
      confidence:globalConfidence,
      physicalCeilingsApplied:physical.constrained,
      physicallyUnallocatedEH:physical.unallocatedEH,
      mode
    });
  }

  W.ZZXHashrateNationModel=Object.freeze({
    __version:6,
    BASE_WEIGHTS,
    directComponent,
    parsePools,
    poolComponent,
    gridComponent,
    capacityComponent,
    nodeComponent,
    global24h,
    applyPhysicalCeilings,
    build
  });
})();
