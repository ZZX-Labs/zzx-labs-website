// __partials/widgets/hashrate-by-nation/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationModel?.__version||0)>=3)return;

  const BASE_WEIGHTS=Object.freeze({
    pool:0.60,
    grid:0.30,
    nodes:0.10
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
    return String.fromCodePoint(
      ...[...cc].map(ch=>127397+ch.charCodeAt(0))
    );
  }

  function countryMeta(code,name=""){
    const cc=iso(code);
    if(!cc){
      return {
        code:"",
        name:"Unlocated",
        flag:"🏴",
        located:false
      };
    }

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

    return {
      code:cc,
      name:String(name||cc),
      flag:flag(cc),
      located:true
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
    const n=finite(
      row?.blockCount ??
      row?.block_count ??
      row?.blocks ??
      row?.count
    );
    return Number.isFinite(n)&&n>=0?n:0;
  }

  function parsePools(payload){
    const raw=
      payload?.pools ??
      payload?.data ??
      payload?.rows ??
      (Array.isArray(payload)?payload:[]);

    if(!Array.isArray(raw))return [];

    return raw
      .map(row=>({
        name:poolName(row),
        blocks:poolBlocks(row)
      }))
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
      return {
        scores,
        coverage:0,
        mappedPools:0,
        pools:pools.length,
        totalBlocks:0
      };
    }

    let coverage=0;
    let mappedPools=0;

    for(const pool of pools){
      const share=pool.blocks/totalBlocks;
      const ev=evidence.get(pool.name.toLowerCase());
      const allocations=Array.isArray(ev?.allocations)
        ? ev.allocations
        : [];

      let mappedFraction=0;
      let mappedThisPool=false;

      for(const allocation of allocations){
        const country=iso(
          allocation?.country ??
          allocation?.country_code ??
          allocation?.iso
        );

        const fraction=clamp(
          allocation?.fraction ??
          allocation?.share
        );

        const confidence=clamp(
          allocation?.confidence ?? 0.5
        );

        if(!country||fraction<=0||confidence<=0)continue;

        const contribution=share*fraction*confidence;
        scores.set(
          country,
          (scores.get(country)||0)+contribution
        );

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

  function gridRows(payload){
    const raw=
      payload?.countries ??
      payload?.rows ??
      payload?.data ??
      (Array.isArray(payload)?payload:[]);

    return Array.isArray(raw)?raw:[];
  }

  function gridComponent(payload,globalEH){
    const scores=new Map();
    const names=new Map();
    let totalMiningMW=0;
    let accepted=0;

    const defaultEfficiency=finite(payload?.efficiency_j_per_th);
    const fallbackEfficiency=
      Number.isFinite(defaultEfficiency)&&defaultEfficiency>0
        ? defaultEfficiency
        : 30;

    for(const row of gridRows(payload)){
      const country=iso(
        row?.country ??
        row?.country_code ??
        row?.iso
      );
      if(!country)continue;

      // Only mining-specific power fields are accepted as estimator evidence.
      // Generic grid generation/load alone does not become Bitcoin hashrate.
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

      const efficiency=finite(
        row?.efficiencyJTH ??
        row?.efficiency_j_per_th
      );

      const jth=
        Number.isFinite(efficiency)&&efficiency>0
          ? efficiency
          : fallbackEfficiency;

      const quality=clamp(row?.confidence ?? row?.quality ?? 0.65);
      const equivalentEH=(miningMW/jth)*quality;

      if(!(equivalentEH>0))continue;

      scores.set(
        country,
        (scores.get(country)||0)+equivalentEH
      );

      names.set(
        country,
        String(row?.countryName ?? row?.country_name ?? "")
      );

      totalMiningMW+=miningMW;
      accepted++;
    }

    const equivalentTotal=[...scores.values()]
      .reduce((sum,value)=>sum+value,0);

    const coverage=
      globalEH>0
        ? clamp(equivalentTotal/globalEH)
        : 0;

    return {
      scores,
      names,
      coverage,
      accepted,
      totalMiningMW,
      equivalentTotalEH:equivalentTotal
    };
  }

  function nodeComponent(input){
    const scores=new Map();
    const names=new Map();

    if(Array.isArray(input)){
      let located=0;
      let total=0;

      for(const row of input){
        const count=finite(
          row?.count ??
          row?.nodes ??
          row?.value
        );

        if(!(count>0))continue;
        total+=count;

        const country=iso(
          row?.country ??
          row?.country_code ??
          row?.iso
        );

        if(!country)continue;

        located+=count;
        scores.set(country,(scores.get(country)||0)+count);
        names.set(
          country,
          String(row?.countryName ?? row?.country_name ?? row?.name ?? "")
        );
      }

      return {
        scores,
        names,
        coverage:total>0?clamp(located/total):0,
        located,
        total
      };
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
      const country=iso(
        row?.country ??
        row?.countryCode ??
        row?.country_code
      );
      if(!country)continue;

      located++;
      scores.set(country,(scores.get(country)||0)+1);
      names.set(
        country,
        String(row?.countryName ?? row?.country_name ?? "")
      );
    }

    const total=
      Number.isFinite(denominator)&&denominator>0
        ? denominator
        : nodes.length;

    return {
      scores,
      names,
      coverage:total>0?clamp(located/total):0,
      located,
      total
    };
  }

  function normalizeScores(map){
    const total=[...map.values()]
      .reduce((sum,value)=>sum+(value>0?value:0),0);

    const normalized=new Map();

    if(total<=0)return normalized;

    for(const [country,value] of map.entries()){
      if(value>0)normalized.set(country,value/total);
    }

    return normalized;
  }

  function global24h(hashrateModel){
    const history=Array.isArray(hashrateModel?.history)
      ? hashrateModel.history
      : [];

    if(!history.length){
      const current=finite(
        hashrateModel?.currentEH ??
        hashrateModel?.current
      );

      return {
        averageEH:Number.isFinite(current)&&current>0?current:NaN,
        history:[]
      };
    }

    const end=history.at(-1).t;
    const cutoff=end-24*60*60*1000;
    const windowed=history.filter(row=>row.t>=cutoff&&row.eh>=0);
    const used=windowed.length?windowed:history.slice(-24);

    const average=used.reduce((sum,row)=>sum+row.eh,0)/used.length;

    return {
      averageEH:average,
      history:used
    };
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
    const work=rows.map(r=>({...r}));
    let constrained=false;
    let remaining=globalEH;
    let active=new Set(work.map((_,i)=>i));

    for(let pass=0;pass<work.length+2;pass++){
      const weightTotal=[...active].reduce((s,i)=>s+work[i].share,0);
      if(!(weightTotal>0))break;
      let changed=false;
      for(const i of [...active]){
        const r=work[i], ceiling=ceilings.get(r.country);
        const proposed=remaining*(r.share/weightTotal);
        if(Number.isFinite(ceiling)&&proposed>ceiling){
          r.estimateEH=ceiling;
          r.physicalCeilingEH=ceiling;
          remaining-=ceiling;
          active.delete(i);
          constrained=changed=true;
        }
      }
      if(!changed){
        for(const i of active){
          const r=work[i];
          r.estimateEH=remaining*(r.share/weightTotal);
          r.physicalCeilingEH=ceilings.get(r.country)??null;
        }
        remaining=0;
        break;
      }
    }

    for(const r of work){
      r.share=globalEH>0?r.estimateEH/globalEH:0;
      const width=Math.max(0,r.highEH-r.lowEH);
      r.lowEH=Math.min(r.estimateEH,Math.max(0,r.estimateEH-width/2));
      r.highEH=Math.max(r.estimateEH,r.estimateEH+width/2);
    }

    return {rows:work,constrained,unallocatedEH:Math.max(0,remaining)};
  }

  function build(inputs){
    const global=global24h(inputs?.hashrate);
    const globalEH=global.averageEH;

    if(!(globalEH>0)){
      throw new Error("24h global hashrate unavailable");
    }

    const pool=poolComponent(
      inputs?.pools,
      inputs?.poolEvidence
    );

    const grid=gridComponent(
      inputs?.grid,
      globalEH
    );

    const nodes=nodeComponent(
      inputs?.nodes
    );

    const poolNorm=normalizeScores(pool.scores);
    const gridNorm=normalizeScores(grid.scores);
    const nodeNorm=normalizeScores(nodes.scores);

    const effective=Object.freeze({
      pool:BASE_WEIGHTS.pool*pool.coverage,
      grid:BASE_WEIGHTS.grid*grid.coverage,
      nodes:BASE_WEIGHTS.nodes*nodes.coverage
    });

    const effectiveTotal=
      effective.pool+
      effective.grid+
      effective.nodes;

    if(!(effectiveTotal>0)){
      return Object.freeze({
        schema:"zzx-hashrate-by-nation-model-v3",
        globalEH,
        history:Object.freeze(global.history.map(Object.freeze)),
        rows:Object.freeze([]),
        pool,
        grid,
        nodes,
        effective,
        confidence:0,
        mode:"no geographic evidence"
      });
    }

    const countries=new Set([
      ...poolNorm.keys(),
      ...gridNorm.keys(),
      ...nodeNorm.keys()
    ]);

    const names=new Map([
      ...grid.names.entries(),
      ...nodes.names.entries()
    ]);

    const preliminary=[];

    for(const country of countries){
      const p=poolNorm.get(country)||0;
      const g=gridNorm.get(country)||0;
      const n=nodeNorm.get(country)||0;

      const score=
        effective.pool*p+
        effective.grid*g+
        effective.nodes*n;

      if(!(score>0))continue;

      preliminary.push({
        country,
        poolShare:p,
        gridShare:g,
        nodeShare:n,
        score
      });
    }

    const scoreTotal=preliminary.reduce(
      (sum,row)=>sum+row.score,
      0
    );

    const globalConfidence=clamp(effectiveTotal);

    const rows=preliminary.map(row=>{
      const share=row.score/scoreTotal;
      const estimateEH=globalEH*share;

      const localEvidenceMass=
        (row.poolShare>0?BASE_WEIGHTS.pool*pool.coverage:0)+
        (row.gridShare>0?BASE_WEIGHTS.grid*grid.coverage:0)+
        (row.nodeShare>0?BASE_WEIGHTS.nodes*nodes.coverage:0);

      const diversity=
        (row.poolShare>0?1:0)+
        (row.gridShare>0?1:0)+
        (row.nodeShare>0?1:0);

      const localBoost=
        0.72+
        0.08*Math.max(0,diversity-1);

      const confidence=clamp(
        Math.min(globalConfidence,localEvidenceMass)*localBoost
      );

      // Heuristic model range. This is deliberately not called a statistical CI.
      const halfWidth=clamp(
        0.12+0.78*(1-confidence),
        0.12,
        0.90
      );

      const lowEH=Math.max(0,estimateEH*(1-halfWidth));
      const highEH=estimateEH*(1+halfWidth);

      const meta=countryMeta(
        row.country,
        names.get(row.country)||""
      );

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
    }).sort(
      (a,b)=>
        b.estimateEH-a.estimateEH ||
        a.countryName.localeCompare(b.countryName)
    );


    const physical=applyPhysicalCeilings(
      rows,
      globalEH,
      gridCeilingMap(inputs)
    );

    rows=physical.rows.sort(
      (a,b)=>
        b.estimateEH-a.estimateEH ||
        a.countryName.localeCompare(b.countryName)
    );

    const timeline=global.history.map(point=>{
      const nations={};
      for(const row of rows.slice(0,5)){
        nations[row.country]=point.eh*row.share;
      }
      return {
        t:point.t,
        globalEH:point.eh,
        nations
      };
    });

    const mode=[
      pool.coverage>0?"pool geo":"",
      grid.coverage>0?"mining power":"",
      nodes.coverage>0?"node prior":""
    ].filter(Boolean).join(" + ")||"none";

    return Object.freeze({
      schema:"zzx-hashrate-by-nation-model-v3",
      globalEH,
      history:Object.freeze(global.history.map(Object.freeze)),
      timeline:Object.freeze(timeline.map(Object.freeze)),
      rows:Object.freeze(rows.map(Object.freeze)),
      pool:Object.freeze(pool),
      grid:Object.freeze(grid),
      nodes:Object.freeze(nodes),
      effective,
      confidence:globalConfidence,
      physicalCeilingsApplied:physical?.constrained||false,
      physicallyUnallocatedEH:physical?.unallocatedEH||0,
      mode
    });
  }

  W.ZZXHashrateNationModel=Object.freeze({
    __version:3,
    BASE_WEIGHTS,
    parsePools,
    poolComponent,
    gridComponent,
    nodeComponent,
    global24h,
    build
  });
})();
