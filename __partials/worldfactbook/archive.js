// __partials/worldfactbook/archive.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXWorldFactbookArchive?.__version||0)>=1)return;

  const DB_NAME="zzx-worldfactbook-archive-v1";
  const DB_STORE="kv";
  const LEDGER_KEY="electricity-ledger-v1";
  const EDITION_KEY="electricity-editions-v1";
  const START_YEAR=1962;
  const END_YEAR=2025;

  const STATIC_LEDGER_URLS=[
    "/worldfactbook/api/electricity-history.json",
    "/bitcoin/power-grid/api/factbook-history.json",
    "/__partials/widgets/global-power-grid/data/factbook-history.json"
  ];

  const REGISTRY_URLS=[
    "/bitcoin/power-grid/api/countries.json",
    "/__partials/widgets/global-power-grid/data/countries.json"
  ];

  const IA_SEARCH="https://archive.org/advancedsearch.php";
  const IA_METADATA="https://archive.org/metadata/";
  const IA_DOWNLOAD="https://archive.org/download/";

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  async function fetchJson(url,signal){
    const r=await fetch(url,{cache:"no-store",credentials:"omit",signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function fetchText(url,signal){
    const r=await fetch(url,{cache:"no-store",credentials:"omit",signal,headers:{Accept:"text/plain,text/html,*/*"}});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return r.text();
  }

  async function firstJson(urls,signal){
    const errors=[];
    for(const url of urls){
      try{return {data:await fetchJson(url,signal),source:url}}
      catch(error){errors.push(`${url}: ${error?.message||error}`)}
    }
    return {data:null,source:null,error:errors.join(" | ")};
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in W)){resolve(null);return}
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function idbGet(key){
    const db=await openDb();
    if(!db)return null;
    return new Promise(resolve=>{
      const tx=db.transaction(DB_STORE,"readonly");
      const req=tx.objectStore(DB_STORE).get(key);
      req.onsuccess=()=>resolve(req.result??null);
      req.onerror=()=>resolve(null);
    });
  }

  async function idbSet(key,value){
    const db=await openDb();
    if(!db)return;
    await new Promise(resolve=>{
      const tx=db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).put(value,key);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
    });
  }

  function multiplier(word){
    return ({trillion:1e12,billion:1e9,million:1e6,thousand:1e3})[String(word||"").toLowerCase()]||1;
  }

  function energyToKWh(number,scale,unit){
    let n=finite(String(number||"").replace(/,/g,""))*multiplier(scale);
    if(!Number.isFinite(n))return NaN;
    const u=String(unit||"kwh").toLowerCase();
    if(u==="twh")n*=1e9;
    else if(u==="gwh")n*=1e6;
    else if(u==="mwh")n*=1e3;
    else if(u==="wh")n/=1e3;
    return n;
  }

  function powerToKW(number,scale,unit){
    let n=finite(String(number||"").replace(/,/g,""))*multiplier(scale);
    if(!Number.isFinite(n))return NaN;
    const u=String(unit||"kw").toLowerCase();
    if(u==="tw")n*=1e9;
    else if(u==="gw")n*=1e6;
    else if(u==="mw")n*=1e3;
    else if(u==="w")n/=1e3;
    return n;
  }

  function findEnergy(text,label){
    const re=new RegExp(
      `(?:electricity\\s*[-–—:]?\\s*)?${label}\\s*:?\\s*`+
      `([0-9][0-9,.]*)\\s*(trillion|billion|million|thousand)?\\s*`+
      `(TWh|GWh|MWh|kWh|Wh)\\b[^\\n]{0,100}`,
      "i"
    );
    const m=re.exec(text);
    if(!m)return null;
    const value=energyToKWh(m[1],m[2],m[3]);
    if(!Number.isFinite(value))return null;
    const ym=m[0].match(/\b(?:19|20)\d{2}\b/);
    return {value,raw:m[0].trim(),observationYear:ym?Number(ym[0]):null};
  }

  function findCapacity(text){
    const re=/(?:electricity\s*[-–—:]?\s*)?(?:installed\s+(?:generating\s+)?capacity|installed\s+generating\s+capacity)\s*:?\s*([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TW|GW|MW|kW|W)\b[^\n]{0,100}/i;
    const m=re.exec(text);
    if(!m)return null;
    const value=powerToKW(m[1],m[2],m[3]);
    if(!Number.isFinite(value))return null;
    const ym=m[0].match(/\b(?:19|20)\d{2}\b/);
    return {value,raw:m[0].trim(),observationYear:ym?Number(ym[0]):null};
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
    const i=text.toLowerCase().indexOf("electricity");
    const scope=i>=0?text.slice(i,i+18000):text.slice(0,18000);
    for(const [key,term] of MIX_TERMS){
      const m=new RegExp(`${term}\\s*:?\\s*([0-9]{1,3}(?:\\.[0-9]+)?)\\s*%`,"i").exec(scope);
      if(m){
        const n=finite(m[1]);
        if(Number.isFinite(n)&&n>=0&&n<=100)out[key]=n;
      }
    }
    return out;
  }

  function normalizeLine(value){
    return String(value||"")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^A-Za-z0-9]+/g," ")
      .trim()
      .toLowerCase();
  }

  function aliasesForCountry(row){
    const values=new Set([row.countryName,row.officialName].filter(Boolean));
    const extras={
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
      TR:["Turkey","Turkiye","Türkiye"]
    };
    for(const x of extras[row.country]||[])values.add(x);
    return [...values].map(normalizeLine).filter(Boolean);
  }

  function countrySections(text,registry){
    const lines=String(text||"").replace(/\r/g,"").split("\n");
    const anchors=[];
    for(const row of registry){
      const aliases=aliasesForCountry(row);
      let found=-1;
      for(let i=0;i<lines.length;i++){
        const normalized=normalizeLine(lines[i]);
        if(aliases.includes(normalized)){found=i;break}
      }
      if(found>=0)anchors.push({i:found,row});
    }
    anchors.sort((a,b)=>a.i-b.i);

    const sections=[];
    for(let i=0;i<anchors.length;i++){
      const start=anchors[i].i;
      const end=i+1<anchors.length?anchors[i+1].i:Math.min(lines.length,start+3000);
      const body=lines.slice(start,Math.min(end,start+3000)).join("\n");
      if(/electricity/i.test(body))sections.push({row:anchors[i].row,body});
    }
    return sections;
  }

  function parseEditionText(text,registry,editionYear,source){
    const records=[];
    for(const section of countrySections(text,registry)){
      const generation=findEnergy(section.body,"(?:production|generation)(?!\\s+sources)");
      const consumption=findEnergy(section.body,"consumption");
      const capacity=findCapacity(section.body);
      const mix=findMix(section.body);
      if(!generation&&!consumption&&!capacity&&!Object.keys(mix).length)continue;

      records.push({
        country:section.row.country,
        country_name:section.row.countryName,
        edition_year:editionYear,
        year:editionYear,
        observation_year:generation?.observationYear??consumption?.observationYear??capacity?.observationYear??editionYear,
        electricity_generation_kwh:generation?.value??null,
        electricity_consumption_kwh:consumption?.value??null,
        installed_capacity_kw:capacity?.value??null,
        generation_by_source_pct:mix,
        source:"CIA World Factbook public archive",
        source_provider:source.provider,
        source_url:source.url,
        source_identifier:source.identifier||null,
        source_file:source.file||null,
        field_provenance:{
          electricity_generation_kwh:generation?.raw||null,
          electricity_consumption_kwh:consumption?.raw||null,
          installed_capacity_kw:capacity?.raw||null
        }
      });
    }
    return records;
  }

  function iaQuery(year){
    const q=`(title:"World Factbook" OR title:"The World Factbook" OR title:"CIA World Factbook") AND year:${year}`;
    const params=new URLSearchParams();
    params.set("q",q);
    for(const field of ["identifier","title","date","year","mediatype","downloads"])params.append("fl[]",field);
    params.set("rows","20");
    params.set("page","1");
    params.set("output","json");
    return `${IA_SEARCH}?${params.toString()}`;
  }

  async function discoverInternetArchive(year,signal){
    const payload=await fetchJson(iaQuery(year),signal);
    return (payload?.response?.docs||[])
      .filter(doc=>doc?.identifier)
      .map(doc=>({
        identifier:String(doc.identifier),
        title:String(doc.title||doc.identifier),
        year,
        downloads:Number(doc.downloads||0)
      }))
      .sort((a,b)=>b.downloads-a.downloads);
  }

  function fileScore(file,year){
    const name=String(file?.name||"");
    const lower=name.toLowerCase();
    const size=finite(file?.size);
    if(Number.isFinite(size)&&size>32*1024*1024)return -Infinity;
    let score=0;
    if(lower.endsWith("_djvu.txt"))score+=500;
    else if(lower.endsWith(".txt"))score+=300;
    else return -Infinity;
    if(lower.includes("factbook"))score+=80;
    if(lower.includes(String(year)))score+=30;
    if(lower.includes("meta")||lower.includes("files"))score-=150;
    return score;
  }

  async function bestTextFile(identifier,year,signal){
    const metadata=await fetchJson(`${IA_METADATA}${encodeURIComponent(identifier)}`,signal);
    const files=(metadata?.files||[])
      .map(file=>({...file,_score:fileScore(file,year)}))
      .filter(file=>Number.isFinite(file._score)&&file._score>0)
      .sort((a,b)=>b._score-a._score);
    return files[0]||null;
  }

  async function browserEdition(year,registry,signal){
    const candidates=await discoverInternetArchive(year,signal);
    for(const item of candidates.slice(0,5)){
      try{
        const file=await bestTextFile(item.identifier,year,signal);
        if(!file)continue;
        const url=`${IA_DOWNLOAD}${encodeURIComponent(item.identifier)}/${String(file.name).split("/").map(encodeURIComponent).join("/")}`;
        const text=await fetchText(url,signal);
        const records=parseEditionText(text,registry,year,{
          provider:"internet-archive",
          identifier:item.identifier,
          file:file.name,
          url
        });
        if(records.length){
          return {
            editionYear:year,
            records,
            reference:{
              edition_year:year,
              provider:"internet-archive",
              identifier:item.identifier,
              item_url:`https://archive.org/details/${item.identifier}`,
              artifact_url:url,
              file:file.name,
              extracted_records:records.length
            }
          };
        }
      }catch(_){}
    }
    return null;
  }

  function mergeRecords(a,b){
    const map=new Map();
    for(const row of [...(a||[]),...(b||[])]){
      const key=`${row.country}|${row.edition_year??row.year}`;
      const completeness=[
        row.electricity_generation_kwh,
        row.electricity_consumption_kwh,
        row.installed_capacity_kw
      ].filter(v=>v!==null&&v!==undefined).length+Object.keys(row.generation_by_source_pct||{}).length/10;
      const prev=map.get(key);
      if(!prev||completeness>prev._completeness)map.set(key,{...row,_completeness:completeness});
    }
    return [...map.values()]
      .map(({_completeness,...row})=>row)
      .sort((x,y)=>(x.edition_year??x.year)-(y.edition_year??y.year)||x.country.localeCompare(y.country));
  }

  async function staticLedger(signal){
    const result=await firstJson(STATIC_LEDGER_URLS,signal);
    return {
      records:Array.isArray(result.data?.records)?result.data.records:[],
      source:result.source,
      error:result.error
    };
  }

  async function registry(signal){
    const result=await firstJson(REGISTRY_URLS,signal);
    const rows=result.data?.countries||[];
    if(!Array.isArray(rows)||!rows.length)throw new Error(result.error||"WorldFactbook country registry unavailable");
    return rows;
  }

  async function bootstrapNewest(signal){
    const reg=await registry(signal);
    let ledger=(await idbGet(LEDGER_KEY))||[];
    let editions=(await idbGet(EDITION_KEY))||[];

    for(let year=END_YEAR;year>=Math.max(START_YEAR,END_YEAR-5);year--){
      if(editions.some(e=>e.edition_year===year))continue;
      try{
        const result=await browserEdition(year,reg,signal);
        if(result){
          ledger=mergeRecords(ledger,result.records);
          editions=[...editions,result.reference];
          await idbSet(LEDGER_KEY,ledger);
          await idbSet(EDITION_KEY,editions);
          if(result.records.length>=25)break;
        }
      }catch(error){
        if(error?.name==="AbortError")throw error;
      }
    }
    return {records:ledger,editions};
  }

  async function expandHistory({signal=null,onProgress=null}={}){
    const reg=await registry(signal);
    let ledger=(await idbGet(LEDGER_KEY))||[];
    let editions=(await idbGet(EDITION_KEY))||[];
    const done=new Set(editions.map(e=>e.edition_year));

    for(let year=END_YEAR;year>=START_YEAR;year--){
      if(signal?.aborted)throw new DOMException("Aborted","AbortError");
      if(done.has(year))continue;

      let found=false;
      try{
        const result=await browserEdition(year,reg,signal);
        if(result){
          ledger=mergeRecords(ledger,result.records);
          editions=[...editions,result.reference];
          done.add(year);
          found=true;
          await idbSet(LEDGER_KEY,ledger);
          await idbSet(EDITION_KEY,editions);
        }
      }catch(error){
        if(error?.name==="AbortError")throw error;
      }

      onProgress?.({year,found,records:ledger.length,editions:editions.length});
      await new Promise(resolve=>setTimeout(resolve,150));
    }

    return {
      schema:"zzx-global-power-grid-factbook-history-v1",
      source:"Internet Archive browser bootstrap",
      records:ledger,
      editions
    };
  }

  async function loadElectricityHistory({force=false,signal=null,expand=true}={}){
    const staticResult=await staticLedger(signal);
    if(staticResult.records.length&&!force){
      return {
        schema:"zzx-global-power-grid-factbook-history-v1",
        records:staticResult.records,
        source:staticResult.source,
        transport:"static"
      };
    }

    const cached=(await idbGet(LEDGER_KEY))||[];
    if(cached.length&&!force){
      if(expand)setTimeout(()=>{expandHistory({}).catch(()=>{})},0);
      return {
        schema:"zzx-global-power-grid-factbook-history-v1",
        records:cached,
        source:"browser archive cache",
        transport:"indexeddb"
      };
    }

    const boot=await bootstrapNewest(signal);
    if(expand)setTimeout(()=>{expandHistory({}).catch(()=>{})},0);

    return {
      schema:"zzx-global-power-grid-factbook-history-v1",
      records:boot.records,
      source:boot.records.length?"Internet Archive bootstrap":"unavailable",
      transport:"archive-bootstrap"
    };
  }

  async function loadReferenceIndex({signal=null}={}){
    const result=await firstJson([
      "/worldfactbook/api/reference-index.json",
      "/__partials/worldfactbook/reference-index.json"
    ],signal);
    if(result.data)return result.data;
    return {
      schema:"zzx-worldfactbook-reference-index-v1",
      editions:(await idbGet(EDITION_KEY))||[],
      pages:[]
    };
  }

  W.ZZXWorldFactbookArchive=Object.freeze({
    __version:1,
    START_YEAR,
    END_YEAR,
    parseEditionText,
    discoverInternetArchive,
    loadElectricityHistory,
    loadReferenceIndex,
    expandHistory
  });
})();
