// __partials/widgets/nodes-by-city/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCityModel?.__version||0)>=7)return;

  const ISO_ALIASES=Object.freeze({UK:"GB",EL:"GR"});
  const NAME_ALIASES=Object.freeze({
    "united states of america":"US",
    "united states":"US",
    "usa":"US",
    "u.s.":"US",
    "united kingdom":"GB",
    "great britain":"GB",
    "uk":"GB",
    "russian federation":"RU",
    "south korea":"KR",
    "republic of korea":"KR",
    "north korea":"KP",
    "democratic people's republic of korea":"KP",
    "czech republic":"CZ",
    "czechia":"CZ",
    "viet nam":"VN",
    "vietnam":"VN",
    "taiwan":"TW",
    "kosovo":"XK"
  });
  const DISPLAY_OVERRIDES=Object.freeze({XK:"Kosovo"});

  let displayNames=null;
  let reverseNames=null;

  function clean(value){
    return String(value??"").trim();
  }

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function regionNames(){
    if(displayNames!==null)return displayNames;
    try{
      displayNames=typeof Intl?.DisplayNames==="function"
        ? new Intl.DisplayNames(["en"],{type:"region"})
        : false;
    }catch(_){
      displayNames=false;
    }
    return displayNames;
  }

  function normalizeIso(value){
    let iso=clean(value).toUpperCase();
    iso=ISO_ALIASES[iso]||iso;
    if(iso==="XK")return iso;
    if(!/^[A-Z]{2}$/.test(iso))return "";

    const names=regionNames();
    if(names){
      try{
        const label=names.of(iso);
        if(!label||label===iso)return "";
      }catch(_){
        return "";
      }
    }
    return iso;
  }

  function displayCountry(code){
    const iso=normalizeIso(code);
    if(!iso)return clean(code)||"Unknown";
    if(DISPLAY_OVERRIDES[iso])return DISPLAY_OVERRIDES[iso];

    const names=regionNames();
    if(names){
      try{
        const label=names.of(iso);
        if(label&&label!==iso)return label;
      }catch(_){}
    }
    return iso;
  }

  function nameIndex(){
    if(reverseNames)return reverseNames;

    reverseNames=new Map();
    for(const [name,code] of Object.entries(NAME_ALIASES)){
      reverseNames.set(name,code);
    }

    const names=regionNames();
    if(names){
      for(let a=65;a<=90;a++){
        for(let b=65;b<=90;b++){
          const code=String.fromCharCode(a,b);
          try{
            const label=names.of(code);
            if(label&&label!==code)reverseNames.set(label.toLowerCase(),code);
          }catch(_){}
        }
      }
    }

    reverseNames.set("kosovo","XK");
    return reverseNames;
  }

  function isoFromName(value){
    const text=clean(value);
    if(!text)return "";
    const direct=normalizeIso(text);
    if(direct)return direct;
    return normalizeIso(nameIndex().get(text.toLowerCase())||"");
  }

  function flag(code){
    const iso=normalizeIso(code);
    if(!/^[A-Z]{2}$/.test(iso))return "—";
    if(iso==="XK")return "🇽🇰";
    return String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0)));
  }

  function firstValue(object,keys){
    if(!object||typeof object!=="object")return "";
    for(const key of keys){
      const value=object[key];
      if(value!==undefined&&value!==null&&clean(value)!=="")return value;
    }
    return "";
  }

  function candidateObjects(node){
    if(!node||typeof node!=="object"||Array.isArray(node))return [];

    const out=[node];
    for(const key of [
      "geo","geolocation","location","ipdb","dbip","geoip",
      "city_data","cityData","metadata","meta"
    ]){
      const value=node[key];
      if(value&&typeof value==="object"&&!Array.isArray(value))out.push(value);
    }
    return out;
  }

  function geographyFromObject(node){
    let city="";
    let region="";
    let country="";

    for(const object of candidateObjects(node)){
      if(!city){
        city=clean(firstValue(object,[
          "city","city_name","cityName","locality","locality_name","localityName"
        ]));
      }

      if(!region){
        region=clean(firstValue(object,[
          "region","region_name","regionName","subdivision","subdivision_name",
          "subdivisionName","state","state_name","stateName","province","province_name",
          "provinceName","admin1","admin1_name","admin1Name"
        ]));
      }

      if(!country){
        country=normalizeIso(firstValue(object,[
          "country_code","countryCode","country_code2","countryCode2",
          "iso2","iso_2","cc","country_iso","countryIso"
        ]));

        if(!country){
          const rawCountry=firstValue(object,[
            "country","country_name","countryName","nation","nation_name","nationName"
          ]);
          country=normalizeIso(rawCountry)||isoFromName(rawCountry);
        }
      }
    }

    if(!city)return null;

    return {
      city,
      region,
      country,
      countryName:country?displayCountry(country):"Unknown",
      flag:country?flag(country):"—"
    };
  }

  function geographyFromArray(row){
    if(!Array.isArray(row))return null;

    // Accept only embedded structured geography. Arbitrary scalar array values
    // are intentionally not guessed as city/country fields.
    for(const item of row){
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        const hit=geographyFromObject(item);
        if(hit)return hit;
      }
    }

    return null;
  }

  function geographyFromNode(node){
    if(Array.isArray(node))return geographyFromArray(node);
    if(node&&typeof node==="object")return geographyFromObject(node);
    return null;
  }

  function nodeValues(snapshot){
    const candidates=[
      snapshot?.nodes,
      snapshot?.results,
      snapshot?.data?.nodes,
      snapshot?.snapshot?.nodes
    ];

    for(const candidate of candidates){
      if(Array.isArray(candidate))return candidate;
      if(candidate&&typeof candidate==="object")return Object.values(candidate);
    }

    return [];
  }

  function normalizeCity(value){
    return clean(value).replace(/\s+/g," ");
  }

  function makeLabel(city,region,country){
    const parts=[normalizeCity(city)];
    if(clean(region))parts.push(clean(region));
    if(clean(country))parts.push(displayCountry(country));
    return parts.filter(Boolean).join(", ")||"Unknown";
  }

  function fromNodes(snapshot){
    const map=new Map();

    for(const node of nodeValues(snapshot)){
      const geo=geographyFromNode(node);
      if(!geo||!geo.city)continue;

      const city=normalizeCity(geo.city);
      const region=clean(geo.region);
      const country=normalizeIso(geo.country);
      const key=[
        city.toLowerCase(),
        region.toLowerCase(),
        country
      ].join("|");

      const row=map.get(key)||{
        city,
        region,
        country,
        countryName:country?displayCountry(country):"Unknown",
        flag:country?flag(country):"—",
        label:makeLabel(city,region,country),
        nodes:0
      };

      row.nodes+=1;
      map.set(key,row);
    }

    return [...map.values()];
  }

  function aggregateCandidates(snapshot){
    return [
      snapshot?.byCity,
      snapshot?.by_city,
      snapshot?.cities,
      snapshot?.geography?.cities,
      snapshot?.aggregate?.cities,
      snapshot?.top?.cities
    ];
  }

  function parseAggregateLabel(label){
    const raw=clean(label);
    if(!raw)return null;

    // Supports forms such as:
    //   "New York, US"
    //   "New York, New York, US"
    //   "Berlin|DE"
    //   "Paris · FR"
    const pipe=raw.split(/\s*[|·]\s*/).filter(Boolean);
    if(pipe.length>=2){
      const maybeCountry=normalizeIso(pipe[pipe.length-1])||isoFromName(pipe[pipe.length-1]);
      if(maybeCountry){
        return {
          city:normalizeCity(pipe[0]),
          region:pipe.length>2?clean(pipe.slice(1,-1).join(" · ")):"",
          country:maybeCountry
        };
      }
    }

    const comma=raw.split(/\s*,\s*/).filter(Boolean);
    if(comma.length>=2){
      const last=comma[comma.length-1];
      const country=normalizeIso(last)||isoFromName(last);
      if(country){
        return {
          city:normalizeCity(comma[0]),
          region:comma.length>2?clean(comma.slice(1,-1).join(", ")):"",
          country
        };
      }
    }

    return {
      city:normalizeCity(raw),
      region:"",
      country:""
    };
  }

  function rowFromAggregate(key,value){
    let city="";
    let region="";
    let country="";
    let nodes=NaN;

    if(typeof value==="number"){
      const parsed=parseAggregateLabel(key);
      if(!parsed)return null;
      ({city,region,country}=parsed);
      nodes=finite(value);
    }else if(Array.isArray(value)){
      // Prefer an object element if one exists.
      const object=value.find(item=>item&&typeof item==="object"&&!Array.isArray(item));
      if(object){
        return rowFromAggregate(key,object);
      }

      const parsed=parseAggregateLabel(key);
      if(parsed)({city,region,country}=parsed);

      for(const item of value){
        if(!(nodes>0)){
          const n=finite(item);
          if(n>0)nodes=n;
        }
      }
    }else if(value&&typeof value==="object"){
      city=normalizeCity(firstValue(value,[
        "city","city_name","cityName","name","locality"
      ]));
      region=clean(firstValue(value,[
        "region","region_name","regionName","state","province","subdivision"
      ]));
      country=normalizeIso(firstValue(value,[
        "country_code","countryCode","iso2","cc"
      ]));
      if(!country){
        const rawCountry=firstValue(value,["country","country_name","countryName","nation"]);
        country=normalizeIso(rawCountry)||isoFromName(rawCountry);
      }
      nodes=finite(firstValue(value,["nodes","count","total","value"]));

      if(!city){
        const parsed=parseAggregateLabel(key);
        if(parsed){
          city=parsed.city;
          if(!region)region=parsed.region;
          if(!country)country=parsed.country;
        }
      }
    }

    if(!city||!(nodes>0))return null;

    return {
      city,
      region,
      country,
      countryName:country?displayCountry(country):"Unknown",
      flag:country?flag(country):"—",
      label:makeLabel(city,region,country),
      nodes
    };
  }

  function fromAggregate(snapshot){
    for(const candidate of aggregateCandidates(snapshot)){
      if(!candidate)continue;
      const rows=[];

      if(Array.isArray(candidate)){
        for(const value of candidate){
          let row=null;

          if(value&&typeof value==="object"&&!Array.isArray(value)){
            const key=firstValue(value,["label","city","name"]);
            row=rowFromAggregate(key,value);
          }else if(Array.isArray(value)){
            row=rowFromAggregate("",value);
          }

          if(row)rows.push(row);
        }
      }else if(typeof candidate==="object"){
        for(const [key,value] of Object.entries(candidate)){
          const row=rowFromAggregate(key,value);
          if(row)rows.push(row);
        }
      }

      if(rows.length)return rows;
    }

    return [];
  }

  function decodedFromSnapshot(snapshot){
    for(const value of [
      snapshot?.nodeCount,
      snapshot?.node_count,
      snapshot?.decodedNodes,
      snapshot?.decoded_nodes
    ]){
      const n=finite(value);
      if(n>=0)return n;
    }
    return nodeValues(snapshot).length;
  }

  function totalFromSnapshot(snapshot,decodedFallback){
    for(const value of [
      snapshot?.reachableNodes,
      snapshot?.reachable_nodes,
      snapshot?.totalNodes,
      snapshot?.total_nodes,
      snapshot?.counts?.reachable,
      snapshot?.counts?.total,
      snapshot?.total,
      snapshot?.nodes_total,
      snapshot?.nodeCount,
      snapshot?.node_count
    ]){
      const n=finite(value);
      if(n>0)return n;
    }

    return decodedFallback>0?decodedFallback:NaN;
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Nodes by City received no shared Bitnodes snapshot");
    }

    let rows=fromNodes(snapshot);
    let mode="per-node";

    if(!rows.length){
      rows=fromAggregate(snapshot);
      mode="aggregate";
    }

    const merged=new Map();

    for(const row of rows){
      const city=normalizeCity(row.city);
      const region=clean(row.region);
      const country=normalizeIso(row.country);
      if(!city||!(Number(row.nodes)>0))continue;

      const key=[
        city.toLowerCase(),
        region.toLowerCase(),
        country
      ].join("|");

      const current=merged.get(key)||{
        city,
        region,
        country,
        countryName:country?displayCountry(country):"Unknown",
        flag:country?flag(country):"—",
        label:makeLabel(city,region,country),
        nodes:0
      };

      current.nodes+=Number(row.nodes);
      merged.set(key,current);
    }

    rows=[...merged.values()].sort((a,b)=>
      b.nodes-a.nodes ||
      a.country.localeCompare(b.country) ||
      a.region.localeCompare(b.region) ||
      a.city.localeCompare(b.city)
    );

    const geolocatedTotal=rows.reduce((sum,row)=>sum+row.nodes,0);
    const decoded=decodedFromSnapshot(snapshot);
    const reachable=totalFromSnapshot(snapshot,decoded);
    const denominator=reachable>0?reachable:(decoded>0?decoded:geolocatedTotal);

    for(const row of rows){
      row.share=denominator>0?row.nodes/denominator:NaN;
      row.geoShare=geolocatedTotal>0?row.nodes/geolocatedTotal:NaN;
    }

    const coverage=denominator>0?Math.min(1,geolocatedTotal/denominator):NaN;
    const unidentified=denominator>0?Math.max(0,denominator-geolocatedTotal):NaN;

    return Object.freeze({
      schema:"zzx-nodes-by-city-model-v7",
      mode,
      rows:Object.freeze(rows.map(row=>Object.freeze(row))),
      cityCount:rows.length,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      top:rows[0]||null
    });
  }

  W.ZZXNodesByCityModel=Object.freeze({
    __version:7,
    normalizeIso,
    displayCountry,
    isoFromName,
    flag,
    geographyFromNode,
    makeLabel,
    fromNodes,
    fromAggregate,
    build
  });
})();
