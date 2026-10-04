// __partials/widgets/global-power-grid/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXGlobalPowerGridModel?.__version||0)>=3)return;

  const HOURS=Object.freeze({hour:1,day:24,week:168,month:730.5,year:8766});
  const MIX_KEYS=Object.freeze([
    "coal","naturalGas","oil","nuclear","hydro","solar","wind",
    "geothermal","biomass","waste","tidal","fossilFuels","renewablesOther","other"
  ]);

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function iso(value){
    const text=String(value||"").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text)?text:"";
  }

  function flag(cc){
    return cc
      ? String.fromCodePoint(...[...cc].map(ch=>127397+ch.charCodeAt(0)))
      : "🏴";
  }

  function normalizeRegistry(payload){
    return (payload?.countries||[]).map(row=>({
      country:iso(row.country),
      countryName:String(row.countryName||row.name||row.country||""),
      officialName:String(row.officialName||row.countryName||""),
      timezones:Array.isArray(row.timezones)?row.timezones.filter(Boolean):[]
    })).filter(row=>row.country);
  }

  function normalizeFactbook(payload){
    const rows=Array.isArray(payload?.records)?payload.records:[];

    return rows.map(row=>{
      const generationKWh=finite(row.electricity_generation_kwh??row.generation_kwh);
      const consumptionKWh=finite(row.electricity_consumption_kwh??row.consumption_kwh);
      const capacityKW=finite(row.installed_capacity_kw??row.capacity_kw);
      const edition=finite(row.edition_year??row.year);
      const observation=finite(row.observation_year);

      return {
        country:iso(row.country||row.iso),
        countryName:String(row.country_name||row.countryName||""),
        year:Number.isFinite(edition)?Math.round(edition):null,
        editionYear:Number.isFinite(edition)?Math.round(edition):null,
        observationYear:Number.isFinite(observation)?Math.round(observation):null,
        fieldObservationYears:row.field_observation_years||{},
        generationKWh:Number.isFinite(generationKWh)?generationKWh:null,
        consumptionKWh:Number.isFinite(consumptionKWh)?consumptionKWh:null,
        capacityMW:Number.isFinite(capacityKW)?capacityKW/1000:null,
        mix:row.generation_by_source_pct||row.mix||{},
        source:String(row.source||"CIA World Factbook"),
        sourceUrl:String(row.source_url||row.sourceUrl||""),
        sourceProvider:String(row.source_provider||row.sourceProvider||""),
        sourceIdentifier:String(row.source_identifier||row.sourceIdentifier||""),
        sourceFile:String(row.source_file||row.sourceFile||""),
        quality:row.quality||null
      };
    }).filter(row=>row.country&&Number.isFinite(row.year));
  }

  function normalizeLive(payload){
    const rows=Array.isArray(payload?.countries)?payload.countries:[];

    return rows.map(row=>{
      const hourly=Array.isArray(row.hourly)
        ? row.hourly.map(sample=>({
            timestamp:Number(new Date(sample.timestamp||sample.time).getTime()),
            generationMW:finite(sample.generationMW??sample.generation_mw),
            loadMW:finite(sample.loadMW??sample.load_mw),
            mix:sample.mix||{}
          })).filter(sample=>Number.isFinite(sample.timestamp))
          .sort((a,b)=>a.timestamp-b.timestamp)
        : [];

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
        sourceUrl:String(row.source_url||row.sourceUrl||""),
        updatedAt:row.updated_at||payload.updated_at||null
      };
    }).filter(row=>row.country);
  }

  function averageMWFromKWh(kwh){
    return Number.isFinite(kwh)&&kwh>=0?kwh/8760/1000:NaN;
  }

  function latestHistorical(records){
    const map=new Map();
    for(const row of records){
      const prev=map.get(row.country);
      if(!prev||(prev.editionYear??-1)<(row.editionYear??-1))map.set(row.country,row);
    }
    return map;
  }

  function buildHistories(records,registry){
    const names=new Map(registry.map(row=>[row.country,row.countryName]));
    const grouped=new Map();

    for(const row of records){
      const point={
        country:row.country,
        countryName:names.get(row.country)||row.countryName||row.country,
        editionYear:row.editionYear,
        observationYear:row.observationYear,
        fieldObservationYears:row.fieldObservationYears||{},
        generationMW:averageMWFromKWh(row.generationKWh),
        loadMW:averageMWFromKWh(row.consumptionKWh),
        capacityMW:Number.isFinite(row.capacityMW)?row.capacityMW:NaN,
        mix:row.mix||{},
        source:row.source,
        sourceUrl:row.sourceUrl,
        sourceProvider:row.sourceProvider,
        sourceIdentifier:row.sourceIdentifier,
        sourceFile:row.sourceFile,
        quality:row.quality||null
      };

      if(![point.generationMW,point.loadMW,point.capacityMW].some(Number.isFinite))continue;

      const list=grouped.get(row.country)||[];
      list.push(point);
      grouped.set(row.country,list);
    }

    const histories={};
    for(const [country,rows] of grouped.entries()){
      const byYear=new Map();

      for(const row of rows){
        const score=[row.generationMW,row.loadMW,row.capacityMW].filter(Number.isFinite).length;
        const prev=byYear.get(row.editionYear);
        const prevScore=prev
          ? [prev.generationMW,prev.loadMW,prev.capacityMW].filter(Number.isFinite).length
          : -1;

        if(!prev||score>prevScore)byYear.set(row.editionYear,row);
      }

      histories[country]=[...byYear.values()].sort((a,b)=>a.editionYear-b.editionYear);
    }

    return histories;
  }

  function miningCeilingEH(powerMW,jth=30){
    const mw=finite(powerMW),eff=finite(jth);
    return Number.isFinite(mw)&&mw>=0&&Number.isFinite(eff)&&eff>0
      ? mw/eff
      : NaN;
  }

  function combine(registry,factbook,live){
    const historical=latestHistorical(factbook);
    const liveMap=new Map(live.map(row=>[row.country,row]));
    const rows=[];

    for(const meta of registry){
      const h=historical.get(meta.country);
      const l=liveMap.get(meta.country);

      const historicalGeneration=averageMWFromKWh(h?.generationKWh);
      const historicalLoad=averageMWFromKWh(h?.consumptionKWh);

      const liveGeneration=finite(l?.generationMW);
      const liveLoad=finite(l?.loadMW);
      const liveCapacity=finite(l?.capacityMW);

      const generationMW=Number.isFinite(liveGeneration)?liveGeneration:historicalGeneration;
      const loadMW=Number.isFinite(liveLoad)?liveLoad:historicalLoad;
      const capacityMW=Number.isFinite(liveCapacity)?liveCapacity:h?.capacityMW;

      const hasLiveGeneration=Number.isFinite(liveGeneration);
      const hasLiveLoad=Number.isFinite(liveLoad);
      const hourly=Array.isArray(l?.hourly)&&l.hourly.length?l.hourly:[];
      const profileSource=hourly.length?"live-hourly":"unavailable";

      const annualHeadroom=
        Number.isFinite(generationMW)&&Number.isFinite(loadMW)
          ? Math.max(0,generationMW-loadMW)
          : NaN;

      const liveHeadroom=
        hasLiveGeneration&&hasLiveLoad
          ? Math.max(0,liveGeneration-liveLoad)
          : NaN;

      let ceilingBasis="unavailable";
      let ceilingPowerMW=NaN;

      if(hasLiveGeneration&&liveGeneration>=0){
        ceilingBasis="observed_generation";
        ceilingPowerMW=liveGeneration;
      }else if(Number.isFinite(historicalGeneration)&&historicalGeneration>=0){
        ceilingBasis="annual_avg_generation";
        ceilingPowerMW=historicalGeneration;
      }else if(Number.isFinite(capacityMW)&&capacityMW>=0){
        ceilingBasis="installed_capacity";
        ceilingPowerMW=capacityMW;
      }

      const liveSourcePresent=Boolean(
        l&&(
          Number.isFinite(liveGeneration)||
          Number.isFinite(liveLoad)||
          Number.isFinite(liveCapacity)||
          hourly.length
        )
      );

      const profileTimezones=l?.timezone
        ? [l.timezone]
        : meta.timezones.length===1
          ? [meta.timezones[0]]
          : [];

      rows.push({
        country:meta.country,
        countryName:meta.countryName,
        flag:flag(meta.country),
        timezones:meta.timezones,
        profileTimezones,
        liveTimezone:l?.timezone||"",
        generationMW,
        loadMW,
        peakMW:Number.isFinite(l?.peakMW)?l.peakMW:NaN,
        capacityMW:Number.isFinite(capacityMW)?capacityMW:NaN,
        headroomMW:annualHeadroom,
        headroomBasis:hasLiveGeneration&&hasLiveLoad?"observed":"annual-average",
        mix:l?.mix&&Object.keys(l.mix).length?l.mix:(h?.mix||{}),
        hourly,
        profileSource,
        source:liveSourcePresent?(l?.source||"live grid"):(h?.source||"unavailable"),
        sourceYear:liveSourcePresent?(l?.updatedAt||null):(h?.editionYear??null),
        sourceUrl:liveSourcePresent?(l?.sourceUrl||""):(h?.sourceUrl||""),
        editionYear:h?.editionYear??null,
        observationYear:h?.observationYear??null,
        ceilingBasis,
        absoluteMiningCeilingEH:miningCeilingEH(ceilingPowerMW),
        headroomMiningCeilingEH:miningCeilingEH(liveHeadroom),
        dataAvailable:[generationMW,loadMW,capacityMW].some(Number.isFinite)
      });
    }

    return rows;
  }

  function periodEnergyMWh(powerMW,period){
    const hours=HOURS[period]||24;
    return Number.isFinite(powerMW)?powerMW*hours:NaN;
  }

  function aggregateMix(rows){
    const totals=new Map();
    let mappedMW=0,totalGenerationMW=0;

    for(const row of rows){
      if(!Number.isFinite(row.generationMW)||row.generationMW<=0)continue;
      totalGenerationMW+=row.generationMW;

      const mix=row.mix||{};
      let rowMapped=0;

      for(const key of MIX_KEYS){
        const pct=finite(mix[key]??mix[`${key}_pct`]);
        if(!Number.isFinite(pct)||pct<=0)continue;

        const fraction=pct>1?pct/100:pct;
        if(!(fraction>0&&fraction<=1))continue;

        const mw=row.generationMW*fraction;
        totals.set(key,(totals.get(key)||0)+mw);
        rowMapped+=mw;
      }

      mappedMW+=Math.min(row.generationMW,rowMapped);
    }

    const rowsOut=[...totals.entries()]
      .map(([source,mw])=>({
        source,
        mw,
        share:mappedMW>0?mw/mappedMW:NaN
      }))
      .sort((a,b)=>b.mw-a.mw);

    return {
      rows:rowsOut,
      mappedMW,
      totalGenerationMW,
      coverage:totalGenerationMW>0?Math.min(1,mappedMW/totalGenerationMW):0
    };
  }

  function globalProfile(rows){
    const liveRows=rows.filter(row=>row.profileSource==="live-hourly"&&row.hourly.length);
    if(!liveRows.length)return [];

    const buckets=new Map();

    for(const row of liveRows){
      for(const sample of row.hourly){
        const hour=Math.floor(sample.timestamp/3600000)*3600000;
        const bucket=buckets.get(hour)||{
          t:hour,
          generationMW:0,
          loadMW:0,
          generationCountries:new Set(),
          loadCountries:new Set()
        };

        if(Number.isFinite(sample.generationMW)){
          bucket.generationMW+=sample.generationMW;
          bucket.generationCountries.add(row.country);
        }

        if(Number.isFinite(sample.loadMW)){
          bucket.loadMW+=sample.loadMW;
          bucket.loadCountries.add(row.country);
        }

        buckets.set(hour,bucket);
      }
    }

    return [...buckets.values()]
      .sort((a,b)=>a.t-b.t)
      .slice(-24)
      .map(bucket=>({
        t:bucket.t,
        generationMW:bucket.generationCountries.size?bucket.generationMW:NaN,
        loadMW:bucket.loadCountries.size?bucket.loadMW:NaN,
        spareMW:bucket.generationCountries.size&&bucket.loadCountries.size
          ? Math.max(0,bucket.generationMW-bucket.loadMW)
          : NaN,
        generationCountryCount:bucket.generationCountries.size,
        loadCountryCount:bucket.loadCountries.size
      }));
  }

  function timezoneRows(rows){
    const zones=new Map();

    for(const row of rows){
      if(row.profileSource!=="live-hourly"||!row.hourly.length)continue;
      if(!Array.isArray(row.profileTimezones)||row.profileTimezones.length!==1)continue;

      const timezone=row.profileTimezones[0];
      const entry=zones.get(timezone)||{
        timezone,
        countries:new Set(),
        hours:Array.from({length:24},()=>({sum:0,n:0}))
      };

      entry.countries.add(row.country);

      for(const sample of row.hourly){
        if(!Number.isFinite(sample.loadMW))continue;

        let hour;
        try{
          const parts=new Intl.DateTimeFormat("en-US",{
            timeZone:timezone,
            hour:"2-digit",
            hour12:false
          }).formatToParts(new Date(sample.timestamp));

          hour=Number(parts.find(part=>part.type==="hour")?.value);
          if(hour===24)hour=0;
        }catch(_){continue;}

        if(Number.isInteger(hour)&&hour>=0&&hour<24){
          entry.hours[hour].sum+=sample.loadMW;
          entry.hours[hour].n++;
        }
      }

      zones.set(timezone,entry);
    }

    return [...zones.values()].map(zone=>{
      const curve=zone.hours.map(hour=>hour.n?hour.sum/hour.n:NaN);
      const values=curve.filter(Number.isFinite);
      const max=values.length?Math.max(...values):NaN;
      const min=values.length?Math.min(...values):NaN;
      const peakHours=[];
      const offPeakHours=[];

      if(Number.isFinite(max)&&Number.isFinite(min)&&max>min){
        curve.forEach((value,hour)=>{
          if(!Number.isFinite(value))return;
          const fraction=(value-min)/(max-min);
          if(fraction>=0.8)peakHours.push(hour);
          if(fraction<=0.2)offPeakHours.push(hour);
        });
      }

      return {
        timezone:zone.timezone,
        countryCount:zone.countries.size,
        curve,
        peakHours,
        offPeakHours,
        measuredDynamic:Number.isFinite(max)&&Number.isFinite(min)&&max>min
      };
    }).sort((a,b)=>{
      const aa=a.curve.filter(Number.isFinite).reduce((sum,value)=>sum+value,0);
      const bb=b.curve.filter(Number.isFinite).reduce((sum,value)=>sum+value,0);
      return bb-aa;
    });
  }

  function historySummary(histories,qualitySummary){
    const all=Object.values(histories).flat();
    const years=all.map(row=>row.editionYear).filter(Number.isFinite);

    return {
      records:all.length,
      countries:Object.keys(histories).length,
      earliestEdition:years.length?Math.min(...years):null,
      latestEdition:years.length?Math.max(...years):null,
      rejectedRecords:Number(qualitySummary?.rejectedRecords||0)
    };
  }

  function qualityFilter(payload){
    if(typeof W.ZZXGlobalPowerGridQuality?.filterFactbook==="function"){
      return W.ZZXGlobalPowerGridQuality.filterFactbook(payload);
    }

    // Conservative fallback if the quality module is unavailable: only rows
    // explicitly marked verified are allowed through.
    const input=Array.isArray(payload?.records)?payload.records:[];
    const records=input.filter(row=>{
      const status=String(row?.quality?.status??row?.quality_status??"").toLowerCase();
      return row?.verified===true||status==="verified"||status==="accepted";
    });

    return {
      payload:{...(payload||{}),records},
      summary:{
        inputRecords:input.length,
        acceptedRecords:records.length,
        rejectedRecords:input.length-records.length,
        reasons:{"quality-module-unavailable":input.length-records.length},
        rejected:[]
      }
    };
  }

  function build(registryPayload,factbookPayload,livePayload){
    const registry=normalizeRegistry(registryPayload);
    const quality=qualityFilter(factbookPayload);
    const factbook=normalizeFactbook(quality.payload);
    const live=normalizeLive(livePayload);
    const histories=buildHistories(factbook,registry);
    const rows=combine(registry,factbook,live);
    const available=rows.filter(row=>row.dataAvailable);
    const profile=globalProfile(rows);
    const timezone=timezoneRows(rows);
    const mixResult=aggregateMix(rows);

    const generationMW=available.reduce(
      (sum,row)=>sum+(Number.isFinite(row.generationMW)?row.generationMW:0),
      0
    );
    const loadMW=available.reduce(
      (sum,row)=>sum+(Number.isFinite(row.loadMW)?row.loadMW:0),
      0
    );
    const nationalReportedPeakMW=available.reduce(
      (sum,row)=>sum+(Number.isFinite(row.peakMW)?row.peakMW:0),
      0
    );

    const profileLoads=profile.map(row=>row.loadMW).filter(Number.isFinite);
    const coincidentPeakMW=profileLoads.length?Math.max(...profileLoads):NaN;
    const coincidentLowMW=profileLoads.length?Math.min(...profileLoads):NaN;

    for(const row of rows)Object.freeze(row);

    const historyCountries=rows
      .filter(row=>histories[row.country]?.length)
      .sort((a,b)=>{
        const av=Number.isFinite(a.generationMW)?a.generationMW:-Infinity;
        const bv=Number.isFinite(b.generationMW)?b.generationMW:-Infinity;
        return bv-av||a.countryName.localeCompare(b.countryName);
      })
      .map(row=>({
        country:row.country,
        countryName:row.countryName,
        flag:row.flag,
        records:histories[row.country].length,
        firstEdition:histories[row.country][0]?.editionYear??null,
        lastEdition:histories[row.country].at(-1)?.editionYear??null
      }));

    const hs=historySummary(histories,quality.summary);

    return Object.freeze({
      schema:"zzx-global-power-grid-model-v3",
      rows:Object.freeze(rows),
      availableCount:available.length,
      registryCount:registry.length,
      coverage:registry.length?available.length/registry.length:0,
      global:Object.freeze({
        generationMW,
        loadMW,
        peakMW:coincidentPeakMW,
        lowMW:coincidentLowMW,
        lowCountryLoadMW:coincidentLowMW,
        sumNationalReportedPeakMW:nationalReportedPeakMW,
        aggregateBasis:"mixed-latest-national-observations"
      }),
      mix:Object.freeze(mixResult.rows.map(Object.freeze)),
      mixCoverage:mixResult.coverage,
      profile:Object.freeze(profile.map(Object.freeze)),
      timezones:Object.freeze(timezone.map(Object.freeze)),
      histories:Object.freeze(Object.fromEntries(
        Object.entries(histories).map(([cc,history])=>[
          cc,
          Object.freeze(history.map(Object.freeze))
        ])
      )),
      historyCountries:Object.freeze(historyCountries.map(Object.freeze)),
      historySummary:Object.freeze(hs),
      qualitySummary:Object.freeze({...quality.summary})
    });
  }

  W.ZZXGlobalPowerGridModel=Object.freeze({
    __version:3,
    HOURS,
    MIX_KEYS,
    normalizeRegistry,
    normalizeFactbook,
    normalizeLive,
    buildHistories,
    combine,
    periodEnergyMWh,
    miningCeilingEH,
    aggregateMix,
    globalProfile,
    timezoneRows,
    historySummary,
    build
  });
})();
