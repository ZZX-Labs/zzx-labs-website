// __partials/widgets/global-power-grid/js/model.js
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXGlobalPowerGridModel?.__version||0)>=1)return;

  const HOURS={hour:1,day:24,week:168,month:730.5,year:8766};
  const MIX_KEYS=[
    "coal","naturalGas","oil","nuclear","hydro","solar","wind",
    "geothermal","biomass","waste","tidal","fossilFuels","renewablesOther","other"
  ];

  function finite(v){
    if(v===null||v===undefined)return NaN;
    if(typeof v==="string"&&!v.trim())return NaN;
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }
  function clamp(v,min=0,max=1){
    const n=finite(v);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
  }
  function iso(v){
    const s=String(v||"").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(s)?s:"";
  }
  function flag(cc){
    return cc?String.fromCodePoint(...[...cc].map(ch=>127397+ch.charCodeAt(0))):"🏴";
  }

  function normalizeRegistry(payload){
    return (payload?.countries||[]).map(row=>({
      country:iso(row.country),
      countryName:String(row.countryName||row.name||row.country||""),
      officialName:String(row.officialName||row.countryName||""),
      timezones:Array.isArray(row.timezones)?row.timezones:[]
    })).filter(row=>row.country);
  }

  function normalizeFactbook(payload){
    const rows=Array.isArray(payload?.records)?payload.records:[];
    return rows.map(row=>{
      const generationKWh=finite(row.electricity_generation_kwh??row.generation_kwh);
      const consumptionKWh=finite(row.electricity_consumption_kwh??row.consumption_kwh);
      const capacityKW=finite(row.installed_capacity_kw??row.capacity_kw);
      const year=finite(row.year);
      const mix=row.generation_by_source_pct||row.mix||{};
      return {
        country:iso(row.country||row.iso),
        year:Number.isFinite(year)?Math.round(year):null,
        generationKWh:Number.isFinite(generationKWh)?generationKWh:null,
        consumptionKWh:Number.isFinite(consumptionKWh)?consumptionKWh:null,
        capacityMW:Number.isFinite(capacityKW)?capacityKW/1000:null,
        mix,
        source:String(row.source||"CIA World Factbook"),
        sourceUrl:String(row.source_url||row.sourceUrl||""),
        editionYear:Number.isFinite(finite(row.edition_year))?Math.round(finite(row.edition_year)):null,
        observationYear:Number.isFinite(finite(row.observation_year))?Math.round(finite(row.observation_year)):null
      };
    }).filter(row=>row.country);
  }

  function normalizeLive(payload){
    const rows=Array.isArray(payload?.countries)?payload.countries:[];
    return rows.map(row=>{
      const hourly=Array.isArray(row.hourly)?row.hourly.map(h=>({
        timestamp:Number(new Date(h.timestamp||h.time).getTime()),
        generationMW:finite(h.generationMW??h.generation_mw),
        loadMW:finite(h.loadMW??h.load_mw),
        mix:h.mix||{}
      })).filter(h=>Number.isFinite(h.timestamp)):[];
      return {
        country:iso(row.country||row.iso),
        countryName:String(row.countryName||row.name||""),
        timezone:String(row.timezone||""),
        capacityMW:finite(row.capacityMW??row.capacity_mw),
        generationMW:finite(row.generationMW??row.generation_mw),
        loadMW:finite(row.loadMW??row.load_mw),
        peakMW:finite(row.peakMW??row.peak_mw),
        mix:row.mix||{},
        hourly,
        source:String(row.source||payload.source||"live grid"),
        updatedAt:row.updated_at||payload.updated_at||null
      };
    }).filter(row=>row.country);
  }

  function latestHistorical(records){
    const map=new Map();
    for(const row of records){
      const prev=map.get(row.country);
      const y=row.year??-1;
      if(!prev||(prev.year??-1)<y)map.set(row.country,row);
    }
    return map;
  }

  function averageMWFromKWh(kwh){
    return Number.isFinite(kwh)&&kwh>=0?kwh/8760/1000:NaN;
  }

  function hourlyFromAnnual(avgMW){
    // No fake hourly shape: flat profile is explicitly marked "annual-average-derived".
    if(!Number.isFinite(avgMW))return [];
    return Array.from({length:24},(_,hour)=>({
      hour,
      generationMW:avgMW,
      loadMW:avgMW,
      derived:true
    }));
  }

  function combine(registry,factbook,live){
    const hist=latestHistorical(factbook);
    const liveMap=new Map(live.map(row=>[row.country,row]));
    const out=[];

    for(const meta of registry){
      const h=hist.get(meta.country);
      const l=liveMap.get(meta.country);

      const histGeneration=averageMWFromKWh(h?.generationKWh);
      const histLoad=averageMWFromKWh(h?.consumptionKWh);

      const generationMW=Number.isFinite(l?.generationMW)?l.generationMW:histGeneration;
      const loadMW=Number.isFinite(l?.loadMW)?l.loadMW:histLoad;
      const capacityMW=Number.isFinite(l?.capacityMW)?l.capacityMW:h?.capacityMW;
      const peakMW=Number.isFinite(l?.peakMW)?l.peakMW:loadMW;

      let hourly=l?.hourly?.length?l.hourly:[];
      let profileSource="live-hourly";
      if(!hourly.length){
        const derivedBase=Number.isFinite(loadMW)?loadMW:generationMW;
        hourly=hourlyFromAnnual(derivedBase);
        profileSource=hourly.length?"annual-average-flat":"unavailable";
      }

      const headroomMW=
        Number.isFinite(generationMW)&&Number.isFinite(loadMW)
          ? Math.max(0,generationMW-loadMW)
          : NaN;

      out.push({
        country:meta.country,
        countryName:meta.countryName,
        flag:flag(meta.country),
        timezones:meta.timezones,
        generationMW,
        loadMW,
        peakMW,
        capacityMW:Number.isFinite(capacityMW)?capacityMW:NaN,
        headroomMW,
        mix:l?.mix&&Object.keys(l.mix).length?l.mix:(h?.mix||{}),
        hourly,
        profileSource,
        source:l?.source||h?.source||"unavailable",
        sourceYear:l?.updatedAt||(h?.editionYear??h?.year??null),
        sourceUrl:l?.sourceUrl||h?.sourceUrl||"",
        observationYear:h?.observationYear??null,
        dataAvailable:[generationMW,loadMW,capacityMW].some(Number.isFinite)
      });
    }

    return out;
  }

  function periodEnergyMWh(powerMW,period){
    const hours=HOURS[period]||24;
    return Number.isFinite(powerMW)?powerMW*hours:NaN;
  }

  function miningCeilingEH(powerMW,jth=30){
    const mw=finite(powerMW),eff=finite(jth);
    return Number.isFinite(mw)&&mw>=0&&Number.isFinite(eff)&&eff>0?mw/eff:NaN;
  }

  function aggregateMix(rows){
    const totals=new Map();
    let denominator=0;
    for(const row of rows){
      if(!Number.isFinite(row.generationMW)||row.generationMW<=0)continue;
      const mix=row.mix||{};
      let accepted=0;
      for(const key of MIX_KEYS){
        const pct=finite(mix[key]??mix[`${key}_pct`]);
        if(Number.isFinite(pct)&&pct>0){
          const f=pct>1?pct/100:pct;
          const mw=row.generationMW*f;
          totals.set(key,(totals.get(key)||0)+mw);
          accepted+=mw;
        }
      }
      denominator+=accepted;
    }
    return [...totals.entries()]
      .map(([source,mw])=>({source,mw,share:denominator>0?mw/denominator:NaN}))
      .sort((a,b)=>b.mw-a.mw);
  }

  function globalProfile(rows){
    const liveRows=rows.filter(row=>row.profileSource==="live-hourly"&&row.hourly.length);
    if(!liveRows.length)return [];

    const buckets=new Map();
    for(const row of liveRows){
      for(const h of row.hourly){
        const hour=Math.floor(h.timestamp/3600000)*3600000;
        const b=buckets.get(hour)||{t:hour,generationMW:0,loadMW:0,generationN:0,loadN:0};
        if(Number.isFinite(h.generationMW)){b.generationMW+=h.generationMW;b.generationN++}
        if(Number.isFinite(h.loadMW)){b.loadMW+=h.loadMW;b.loadN++}
        buckets.set(hour,b);
      }
    }
    return [...buckets.values()].sort((a,b)=>a.t-b.t).slice(-24).map(b=>({
      t:b.t,
      generationMW:b.generationN?b.generationMW:NaN,
      loadMW:b.loadN?b.loadMW:NaN,
      spareMW:b.generationN&&b.loadN?Math.max(0,b.generationMW-b.loadMW):NaN
    }));
  }

  function timezoneRows(rows){
    const zones=new Map();
    for(const row of rows){
      if(!row.hourly.length||!row.timezones.length)continue;
      const tz=row.timezones[0];
      const entry=zones.get(tz)||{
        timezone:tz,
        countries:new Set(),
        hours:Array.from({length:24},()=>({sum:0,n:0}))
      };
      entry.countries.add(row.country);

      if(row.profileSource==="live-hourly"){
        for(const h of row.hourly){
          if(!Number.isFinite(h.loadMW))continue;
          let hour;
          try{
            const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"2-digit",hour12:false}).formatToParts(new Date(h.timestamp));
            hour=Number(parts.find(p=>p.type==="hour")?.value);
            if(hour===24)hour=0;
          }catch(_){continue}
          if(Number.isInteger(hour)&&hour>=0&&hour<24){
            entry.hours[hour].sum+=h.loadMW;
            entry.hours[hour].n++;
          }
        }
      }else{
        // annual-average-derived profile has no truthful peak/off-peak timing
        for(let hour=0;hour<24;hour++){
          const sample=row.hourly[hour];
          if(Number.isFinite(sample?.loadMW)){
            entry.hours[hour].sum+=sample.loadMW;
            entry.hours[hour].n++;
          }
        }
      }
      zones.set(tz,entry);
    }

    return [...zones.values()].map(z=>{
      const curve=z.hours.map(x=>x.n?x.sum/x.n:NaN);
      const finiteVals=curve.filter(Number.isFinite);
      const max=finiteVals.length?Math.max(...finiteVals):NaN;
      const min=finiteVals.length?Math.min(...finiteVals):NaN;
      const peakHours=[];
      const offPeakHours=[];
      if(Number.isFinite(max)&&Number.isFinite(min)&&max>min){
        curve.forEach((v,h)=>{
          if(!Number.isFinite(v))return;
          const f=(v-min)/(max-min);
          if(f>=0.8)peakHours.push(h);
          if(f<=0.2)offPeakHours.push(h);
        });
      }
      return {
        timezone:z.timezone,
        countryCount:z.countries.size,
        curve,
        peakHours,
        offPeakHours,
        measuredDynamic:Number.isFinite(max)&&Number.isFinite(min)&&max>min
      };
    }).sort((a,b)=>{
      const aa=a.curve.filter(Number.isFinite).reduce((s,v)=>s+v,0);
      const bb=b.curve.filter(Number.isFinite).reduce((s,v)=>s+v,0);
      return bb-aa;
    });
  }

  function build(registryPayload,factbookPayload,livePayload){
    const registry=normalizeRegistry(registryPayload);
    const factbook=normalizeFactbook(factbookPayload);
    const live=normalizeLive(livePayload);
    const rows=combine(registry,factbook,live);

    const available=rows.filter(r=>r.dataAvailable);
    const generationMW=available.reduce((s,r)=>s+(Number.isFinite(r.generationMW)?r.generationMW:0),0);
    const loadMW=available.reduce((s,r)=>s+(Number.isFinite(r.loadMW)?r.loadMW:0),0);
    const peakMW=available.reduce((s,r)=>s+(Number.isFinite(r.peakMW)?r.peakMW:0),0);

    const loads=available.map(r=>r.loadMW).filter(Number.isFinite);
    const lowMW=loads.length?Math.min(...loads):NaN;

    for(const row of rows){
      row.absoluteMiningCeilingEH=miningCeilingEH(
        Number.isFinite(row.generationMW)?row.generationMW:row.capacityMW
      );
      row.headroomMiningCeilingEH=miningCeilingEH(row.headroomMW);
      Object.freeze(row);
    }

    return Object.freeze({
      schema:"zzx-global-power-grid-model-v1",
      rows:Object.freeze(rows),
      availableCount:available.length,
      registryCount:registry.length,
      coverage:registry.length?available.length/registry.length:0,
      global:Object.freeze({generationMW,loadMW,peakMW,lowCountryLoadMW:lowMW}),
      mix:Object.freeze(aggregateMix(rows)),
      profile:Object.freeze(globalProfile(rows).map(Object.freeze)),
      timezones:Object.freeze(timezoneRows(rows).map(Object.freeze))
    });
  }

  W.ZZXGlobalPowerGridModel=Object.freeze({
    __version:1,
    HOURS,MIX_KEYS,
    normalizeRegistry,normalizeFactbook,normalizeLive,
    combine,periodEnergyMWh,miningCeilingEH,aggregateMix,globalProfile,timezoneRows,build
  });
})();
