// __partials/worldfactbook/archive.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXWorldFactbookArchive?.__version||0)>=2)return;

  const DB_NAME="zzx-worldfactbook-archive-v2";
  const STORE="kv";
  const LEDGER_KEY="electricity-ledger-v2";
  const EDITIONS_KEY="electricity-editions-v2";
  const START_YEAR=1962;
  const END_YEAR=2025;

  const IA_SEARCH="https://archive.org/advancedsearch.php";
  const IA_METADATA="https://archive.org/metadata/";
  const IA_DOWNLOAD="https://archive.org/download/";

  const REGISTRY_URLS=[
    "/bitcoin/power-grid/api/countries.json",
    "/__partials/widgets/global-power-grid/data/countries.json"
  ];

  const ALIASES={
    US:["United States","United States of America"],
    RU:["Russia","Russian Federation"],
    KR:["South Korea","Korea South","Republic of Korea"],
    KP:["North Korea","Korea North","Democratic People's Republic of Korea"],
    CZ:["Czech Republic","Czechia"],
    MM:["Burma","Myanmar"],
    SZ:["Swaziland","Eswatini"],
    MK:["Macedonia","North Macedonia"],
    CV:["Cape Verde","Cabo Verde"],
    TL:["East Timor","Timor-Leste"],
    TR:["Turkey","Turkiye","Türkiye"],
    CI:["Cote d'Ivoire","Côte d'Ivoire","Ivory Coast"]
  };

  const STRUCTURE=[
    "background","geography","people","government","economy",
    "communications","transportation","military","electricity"
  ];

  function finite(value){
    if(value===null||value===undefined)return NaN;
    const n=Number(String(value).replace(/,/g,"").trim());
    return Number.isFinite(n)?n:NaN;
  }

  function normalize(value){
    return String(value||"")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^A-Za-z0-9]+/g," ")
      .trim()
      .toLowerCase();
  }

  function scale(word){
    return ({trillion:1e12,billion:1e9,million:1e6,thousand:1e3})[
      String(word||"").toLowerCase()
    ]||1;
  }

  function energyKWh(number,magnitude,unit){
    let n=finite(number)*scale(magnitude);
    if(!Number.isFinite(n))return NaN;
    const u=String(unit||"kwh").toLowerCase();
    if(u==="twh")n*=1e9;
    else if(u==="gwh")n*=1e6;
    else if(u==="mwh")n*=1e3;
    else if(u==="wh")n/=1e3;
    return n;
  }

  function powerKW(number,magnitude,unit){
    let n=finite(number)*scale(magnitude);
    if(!Number.isFinite(n))return NaN;
    const u=String(unit||"kw").toLowerCase();
    if(u==="tw")n*=1e9;
    else if(u==="gw")n*=1e6;
    else if(u==="mw")n*=1e3;
    else if(u==="w")n/=1e3;
    return n;
  }

  function yearFrom(raw){
    const years=[...String(raw||"").matchAll(/\b((?:19|20)\d{2})\b/g)]
      .map(match=>Number(match[1]));
    return years.length?years.at(-1):null;
  }

  function findEnergy(text,label){
    const re=new RegExp(
      `(?:electricity\\s*[-–—:]?\\s*)?${label}\\s*:?\\s*`+
      `([0-9][0-9,.]*)\\s*(trillion|billion|million|thousand)?\\s*`+
      `(TWh|GWh|MWh|kWh|Wh)\\b[^\\n]{0,120}`,
      "i"
    );
    const match=re.exec(text);
    if(!match)return null;
    const value=energyKWh(match[1],match[2],match[3]);
    return Number.isFinite(value)
      ? {value,raw:match[0].trim(),observationYear:yearFrom(match[0])}
      : null;
  }

  function findCapacity(text){
    const re=/(?:electricity\s*[-–—:]?\s*)?(?:installed\s+(?:generating\s+)?capacity|installed\s+generating\s+capacity)\s*:?\s*([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TW|GW|MW|kW|W)\b[^\n]{0,120}/i;
    const match=re.exec(text);
    if(!match)return null;
    const value=powerKW(match[1],match[2],match[3]);
    return Number.isFinite(value)
      ? {value,raw:match[0].trim(),observationYear:yearFrom(match[0])}
      : null;
  }

  const MIX_TERMS=[
    ["coal","coal"],
    ["naturalGas","natural\\s+gas"],
    ["oil","(?:petroleum(?:\\s+and\\s+other\\s+liquids)?|oil)"],
    ["nuclear","nuclear"],
    ["hydro","hydro(?:electric(?:ity)?)?"],
    ["solar","solar"],
    ["wind","wind"],
    ["geothermal","geothermal"],
    ["biomass","biomass"],
    ["waste","waste"],
    ["tidal","tidal"],
    ["fossilFuels","fossil\\s+fuels"],
    ["renewablesOther","other\\s+renewable(?:s|\\s+sources)?"]
  ];

  function findMix(text){
    const out={};
    const lower=text.toLowerCase();
    const index=lower.search(/electricity\s*(?:-|—|–|:)?\s*(?:from|generation sources|source)/i);
    const scope=index>=0?text.slice(index,index+9000):text.slice(0,9000);

    for(const [key,term] of MIX_TERMS){
      const match=new RegExp(`${term}\\s*:?\\s*([0-9]{1,3}(?:\\.[0-9]+)?)\\s*%`,"i").exec(scope);
      if(!match)continue;
      const n=finite(match[1]);
      if(Number.isFinite(n)&&n>=0&&n<=100)out[key]=n;
    }
    return out;
  }

  function openDb(){
    return new Promise(resolve=>{
      if(!("indexedDB" in W)){resolve(null);return;}
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>resolve(null);
    });
  }

  async function idbGet(key){
    const db=await openDb();
    if(!db)return null;
    return new Promise(resolve=>{
      const tx=db.transaction(STORE,"readonly");
      const request=tx.objectStore(STORE).get(key);
      request.onsuccess=()=>resolve(request.result??null);
      request.onerror=()=>resolve(null);
    });
  }

  async function idbSet(key,value){
    const db=await openDb();
    if(!db)return;
    await new Promise(resolve=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=resolve;
      tx.onerror=resolve;
    });
  }

  async function fetchJson(url,signal){
    const response=await fetch(url,{
      cache:"no-store",
      credentials:/^https?:/i.test(url)?"omit":"same-origin",
      signal,
      headers:{Accept:"application/json"}
    });
    if(!response.ok)throw new Error(`HTTP ${response.status} ${url}`);
    return response.json();
  }

  async function fetchText(url,signal){
    const response=await fetch(url,{
      cache:"no-store",
      credentials:/^https?:/i.test(url)?"omit":"same-origin",
      signal,
      headers:{Accept:"text/plain,*/*"}
    });
    if(!response.ok)throw new Error(`HTTP ${response.status} ${url}`);
    return response.text();
  }

  async function registry(signal){
    const errors=[];
    for(const url of REGISTRY_URLS){
      try{
        const payload=await fetchJson(url,signal);
        if(Array.isArray(payload?.countries)&&payload.countries.length)return payload.countries;
      }catch(error){errors.push(String(error?.message||error));}
    }
    throw new Error(errors.join(" | ")||"country registry unavailable");
  }

  function aliases(row){
    const values=new Set([
      row.countryName,
      row.officialName,
      ...(ALIASES[String(row.country||"").toUpperCase()]||[])
    ].filter(Boolean));
    return [...values].map(normalize).filter(Boolean);
  }

  function structureScore(lines,index){
    const scope=lines.slice(index,Math.min(lines.length,index+2200))
      .join("\n")
      .toLowerCase();
    if(!scope.includes("electricity"))return 0;
    let score=0;
    for(const marker of STRUCTURE){
      if(scope.includes(marker))score++;
    }
    return score;
  }

  function sections(text,registryRows){
    const lines=String(text||"")
      .replace(/\r/g,"")
      .split("\n")
      .map(line=>line.replace(/\s+/g," ").trim());

    const aliasMap=new Map();
    for(const row of registryRows){
      for(const alias of aliases(row)){
        if(alias.length>=3)aliasMap.set(alias,row);
      }
    }

    const best=new Map();
    for(let index=0;index<lines.length;index++){
      const row=aliasMap.get(normalize(lines[index]));
      if(!row)continue;
      const score=structureScore(lines,index);
      if(score<4)continue;
      const current=best.get(row.country);
      if(!current||score>current.score)best.set(row.country,{index,row,score});
    }

    const anchors=[...best.values()].sort((a,b)=>a.index-b.index);
    const result=[];

    for(let i=0;i<anchors.length;i++){
      const start=anchors[i].index;
      const end=i+1<anchors.length?anchors[i+1].index:lines.length;
      const body=lines.slice(start,end).join("\n");
      if(/electricity/i.test(body))result.push({row:anchors[i].row,body});
    }

    return result;
  }

  function parseSection(section,editionYear,source){
    const generation=findEnergy(section.body,"(?:production|generation)(?!\\s+sources)");
    const consumption=findEnergy(section.body,"consumption");
    const capacity=findCapacity(section.body);
    const mix=findMix(section.body);

    if(!generation&&!consumption&&!capacity&&!Object.keys(mix).length)return null;

    const observations=[
      generation?.observationYear,
      consumption?.observationYear,
      capacity?.observationYear
    ].filter(Number.isFinite);

    return {
      country:section.row.country,
      country_name:section.row.countryName,
      edition_year:editionYear,
      year:editionYear,
      observation_year:observations.length?Math.max(...observations):editionYear,
      field_observation_years:{
        electricity_generation_kwh:generation?.observationYear??null,
        electricity_consumption_kwh:consumption?.observationYear??null,
        installed_capacity_kw:capacity?.observationYear??null
      },
      electricity_generation_kwh:generation?.value??null,
      electricity_consumption_kwh:consumption?.value??null,
      installed_capacity_kw:capacity?.value??null,
      generation_by_source_pct:mix,
      source:"CIA World Factbook public archive",
      source_provider:"internet-archive",
      source_url:source.url,
      source_identifier:source.identifier,
      source_file:source.file,
      field_provenance:{
        electricity_generation_kwh:generation?.raw??null,
        electricity_consumption_kwh:consumption?.raw??null,
        installed_capacity_kw:capacity?.raw??null
      },
      quality:{
        status:"verified",
        parser_version:2,
        country_basis:"book-section-heading",
        field_basis:"explicit-electricity-label"
      }
    };
  }

  function parseEditionText(text,registryRows,editionYear,source){
    return sections(text,registryRows)
      .map(section=>parseSection(section,editionYear,source))
      .filter(Boolean);
  }

  function queryUrl(year){
    const params=new URLSearchParams();
    params.set("q",`(title:\"World Factbook\" OR title:\"The World Factbook\" OR title:\"CIA World Factbook\") AND year:${year}`);
    for(const field of ["identifier","title","date","year","downloads"]){
      params.append("fl[]",field);
    }
    params.set("rows","20");
    params.set("page","1");
    params.set("output","json");
    return `${IA_SEARCH}?${params}`;
  }

  async function discoverInternetArchive(year,signal){
    const payload=await fetchJson(queryUrl(year),signal);
    return (payload?.response?.docs||[])
      .filter(row=>row?.identifier)
      .sort((a,b)=>Number(b.downloads||0)-Number(a.downloads||0));
  }

  function fileScore(file,year){
    const name=String(file?.name||"");
    const lower=name.toLowerCase();
    const size=finite(file?.size);
    if(Number.isFinite(size)&&size>40*1024*1024)return -Infinity;

    let score=-Infinity;
    if(lower.endsWith("_djvu.txt"))score=500;
    else if(lower.endsWith(".txt"))score=300;
    if(!Number.isFinite(score))return score;

    if(lower.includes("factbook"))score+=80;
    if(lower.includes(String(year)))score+=30;
    if(lower.includes("meta")||lower.includes("files"))score-=200;
    return score;
  }

  async function editionFromItem(item,year,registryRows,signal){
    const identifier=String(item.identifier);
    const metadata=await fetchJson(`${IA_METADATA}${encodeURIComponent(identifier)}`,signal);
    const files=(metadata?.files||[])
      .map(file=>({...file,_score:fileScore(file,year)}))
      .filter(file=>Number.isFinite(file._score)&&file._score>0)
      .sort((a,b)=>b._score-a._score);

    for(const file of files.slice(0,3)){
      const encoded=String(file.name).split("/").map(encodeURIComponent).join("/");
      const url=`${IA_DOWNLOAD}${encodeURIComponent(identifier)}/${encoded}`;
      const text=await fetchText(url,signal);
      const records=parseEditionText(text,registryRows,year,{
        identifier,
        file:file.name,
        url
      });

      if(records.length){
        return {
          records,
          reference:{
            edition_year:year,
            provider:"internet-archive",
            identifier,
            item_url:`https://archive.org/details/${identifier}`,
            artifact_url:url,
            file:file.name,
            extracted_records:records.length
          }
        };
      }
    }

    return null;
  }

  async function browserEdition(year,registryRows,signal){
    const items=await discoverInternetArchive(year,signal);
    let best=null;

    for(const item of items.slice(0,5)){
      try{
        const result=await editionFromItem(item,year,registryRows,signal);
        if(result&&(!best||result.records.length>best.records.length))best=result;
        if(best?.records?.length>=25)break;
      }catch(error){
        if(error?.name==="AbortError")throw error;
      }
    }

    return best;
  }

  function mergeRecords(a,b){
    const map=new Map();

    for(const row of [...(a||[]),...(b||[])]){
      const key=`${row.country}|${row.edition_year??row.year}`;
      const completeness=[
        row.electricity_generation_kwh,
        row.electricity_consumption_kwh,
        row.installed_capacity_kw
      ].filter(value=>value!==null&&value!==undefined).length+
        Object.keys(row.generation_by_source_pct||{}).length/10;
      const prev=map.get(key);
      if(!prev||completeness>prev._completeness){
        map.set(key,{...row,_completeness:completeness});
      }
    }

    return [...map.values()]
      .map(({_completeness,...row})=>row)
      .sort((a,b)=>(a.edition_year??a.year)-(b.edition_year??b.year)||a.country.localeCompare(b.country));
  }

  async function expandHistory({signal=null,onProgress=null,maxYears=6}={}){
    const registryRows=await registry(signal);
    let records=(await idbGet(LEDGER_KEY))||[];
    let editions=(await idbGet(EDITIONS_KEY))||[];
    const done=new Set(editions.map(row=>row.edition_year));
    let scanned=0;

    for(let year=END_YEAR;year>=START_YEAR&&scanned<maxYears;year--){
      if(done.has(year))continue;
      if(signal?.aborted)throw new DOMException("Aborted","AbortError");
      scanned++;

      let result=null;
      try{result=await browserEdition(year,registryRows,signal);}
      catch(error){if(error?.name==="AbortError")throw error;}

      if(result){
        records=mergeRecords(records,result.records);
        editions=[...editions,result.reference];
        await idbSet(LEDGER_KEY,records);
        await idbSet(EDITIONS_KEY,editions);
      }

      onProgress?.({
        year,
        found:Boolean(result),
        records:records.length,
        editions:editions.length
      });

      await new Promise(resolve=>W.setTimeout(resolve,175));
    }

    return {
      schema:"zzx-global-power-grid-factbook-history-v2",
      source:"CIA World Factbook public copies · browser Internet Archive fallback",
      transport:"archive-browser",
      records,
      editions
    };
  }

  async function loadElectricityHistory({force=false,signal=null,expand=true}={}){
    const cached=(await idbGet(LEDGER_KEY))||[];

    if(cached.length&&!force){
      if(expand)W.setTimeout(()=>expandHistory({maxYears:2}).catch(()=>{}),0);
      return {
        schema:"zzx-global-power-grid-factbook-history-v2",
        source:"browser archive cache",
        transport:"indexeddb",
        records:cached
      };
    }

    const result=await expandHistory({signal,maxYears:force?6:3});
    if(expand)W.setTimeout(()=>expandHistory({maxYears:2}).catch(()=>{}),0);
    return result;
  }

  async function loadReferenceIndex(){
    return {
      schema:"zzx-worldfactbook-reference-index-v2",
      editions:(await idbGet(EDITIONS_KEY))||[]
    };
  }

  W.ZZXWorldFactbookArchive=Object.freeze({
    __version:2,
    START_YEAR,
    END_YEAR,
    parseEditionText,
    discoverInternetArchive,
    loadElectricityHistory,
    loadReferenceIndex,
    expandHistory
  });
})();
