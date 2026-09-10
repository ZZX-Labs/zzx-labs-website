// __partials/widgets/nodes-by-nation/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByNationModel?.__version||0)>=7)return;

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

  function clean(value){return String(value??"").trim();}
  function finite(value){const n=Number(value);return Number.isFinite(n)?n:NaN;}

  function regionNames(){
    if(displayNames!==null)return displayNames;
    try{
      displayNames=typeof Intl?.DisplayNames==="function"
        ? new Intl.DisplayNames(["en"],{type:"region"})
        : false;
    }catch(_){displayNames=false;}
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
      }catch(_){return "";}
    }
    return iso;
  }

  function displayName(code){
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

    for(const [name,code] of Object.entries(NAME_ALIASES))reverseNames.set(name,code);

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
    for(const key of ["geo","geolocation","location","ipdb","dbip","geoip","country_data","countryData","metadata","meta"]){
      const value=node[key];
      if(value&&typeof value==="object"&&!Array.isArray(value))out.push(value);
    }
    return out;
  }

  function countryFromObject(node){
    let rememberedName="";

    for(const object of candidateObjects(node)){
      const rawCode=firstValue(object,[
        "country_code","countryCode","country_code2","countryCode2",
        "iso2","iso_2","cc","country_iso","countryIso"
      ]);
      const code=normalizeIso(rawCode);
      const rawName=firstValue(object,[
        "country_name","countryName","nation","nation_name","nationName"
      ]);
      if(rawName)rememberedName=clean(rawName);

      if(code)return {code,name:rememberedName||displayName(code)};

      const country=firstValue(object,["country"]);
      const countryCode=normalizeIso(country);
      if(countryCode)return {code:countryCode,name:rememberedName||displayName(countryCode)};

      if(country&&!rememberedName)rememberedName=clean(country);
      const derived=isoFromName(rememberedName);
      if(derived)return {code:derived,name:displayName(derived)};
    }

    return null;
  }

  function countryFromArray(row){
    if(!Array.isArray(row))return null;

    for(const item of row){
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        const hit=countryFromObject(item);
        if(hit)return hit;
      }
    }

    for(const item of row){
      if(typeof item!=="string")continue;
      const code=normalizeIso(item);
      if(code)return {code,name:displayName(code)};
    }

    for(const item of row){
      if(typeof item!=="string")continue;
      const code=isoFromName(item);
      if(code)return {code,name:displayName(code)};
    }

    return null;
  }

  function countryFromNode(node){
    if(Array.isArray(node))return countryFromArray(node);
    if(node&&typeof node==="object")return countryFromObject(node);
    return null;
  }

  function nodeValues(snapshot){
    const nodes=snapshot?.nodes;
    if(Array.isArray(nodes))return nodes;
    if(nodes&&typeof nodes==="object")return Object.values(nodes);

    for(const candidate of [snapshot?.results,snapshot?.data?.nodes,snapshot?.snapshot?.nodes]){
      if(Array.isArray(candidate))return candidate;
      if(candidate&&typeof candidate==="object")return Object.values(candidate);
    }
    return [];
  }

  function mapCandidates(snapshot){
    return [
      snapshot?.byNation,
      snapshot?.by_nation,
      snapshot?.byCountry,
      snapshot?.by_country,
      snapshot?.countries,
      snapshot?.geography?.countries,
      snapshot?.aggregate?.countries,
      snapshot?.top?.countries
    ];
  }

  function rowFromAggregate(codeHint,value){
    let code=normalizeIso(codeHint);
    let name="";
    let nodes=NaN;

    if(typeof value==="number"){
      nodes=finite(value);
    }else if(Array.isArray(value)){
      for(const item of value){
        if(!code&&typeof item==="string")code=normalizeIso(item);
        if(!name&&typeof item==="string"&&!normalizeIso(item))name=clean(item);
        if(!Number.isFinite(nodes)){
          const n=finite(item);
          if(Number.isFinite(n)&&n>=0)nodes=n;
        }
      }
    }else if(value&&typeof value==="object"){
      code=normalizeIso(firstValue(value,["code","country_code","countryCode","iso2","cc"])||code);
      name=clean(firstValue(value,["name","country_name","countryName","country","nation"]));
      nodes=finite(firstValue(value,["nodes","count","total","value"]));
    }

    if(!code)code=isoFromName(name||codeHint);
    if(!code||!(nodes>0))return null;

    return {code,name:displayName(code),flag:flag(code),nodes};
  }

  function fromAggregate(snapshot){
    for(const candidate of mapCandidates(snapshot)){
      if(!candidate)continue;
      const rows=[];

      if(Array.isArray(candidate)){
        for(const value of candidate){
          let row=null;
          if(Array.isArray(value)){
            const code=value.find(item=>typeof item==="string"&&normalizeIso(item));
            row=rowFromAggregate(code||"",value);
          }else if(value&&typeof value==="object"){
            row=rowFromAggregate(
              firstValue(value,["code","country_code","countryCode","iso2","cc","country","name"]),
              value
            );
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

  function fromNodes(snapshot){
    const counts=new Map();

    for(const node of nodeValues(snapshot)){
      const country=countryFromNode(node);
      if(!country)continue;

      const code=country.code;
      const current=counts.get(code)||{
        code,
        name:displayName(code),
        flag:flag(code),
        nodes:0
      };
      current.nodes+=1;
      counts.set(code,current);
    }

    return [...counts.values()];
  }

  function decodedFromSnapshot(snapshot){
    for(const value of [snapshot?.nodeCount,snapshot?.node_count,snapshot?.decodedNodes,snapshot?.decoded_nodes]){
      const n=finite(value);
      if(n>=0)return n;
    }
    return nodeValues(snapshot).length;
  }

  function totalFromSnapshot(snapshot,decodedFallback){
    for(const value of [
      snapshot?.reachableNodes,snapshot?.reachable_nodes,
      snapshot?.totalNodes,snapshot?.total_nodes,
      snapshot?.counts?.reachable,snapshot?.counts?.total,
      snapshot?.total,snapshot?.nodes_total,
      snapshot?.nodeCount,snapshot?.node_count
    ]){
      const n=finite(value);
      if(n>0)return n;
    }
    return decodedFallback>0?decodedFallback:NaN;
  }

  function updatedMs(snapshot){
    const raw=snapshot?.updatedMs??snapshot?.generatedAtMs??snapshot?.generated_at??snapshot?.updated_at??snapshot?.timestamp??snapshot?.ts;
    if(raw==null)return NaN;
    const n=finite(raw);
    if(Number.isFinite(n))return n>0&&n<2e12?n*1000:n;
    const parsed=Date.parse(String(raw));
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object")throw new Error("Nodes by Nation received no shared Bitnodes snapshot");

    let rows=fromNodes(snapshot);
    let mode="per-node";
    if(!rows.length){
      rows=fromAggregate(snapshot);
      mode="aggregate";
    }

    const merged=new Map();
    for(const row of rows){
      const code=normalizeIso(row.code);
      if(!code||!(Number(row.nodes)>0))continue;
      const current=merged.get(code)||{code,name:displayName(code),flag:flag(code),nodes:0};
      current.nodes+=Number(row.nodes);
      merged.set(code,current);
    }

    rows=[...merged.values()].sort((a,b)=>b.nodes-a.nodes||a.name.localeCompare(b.name));

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
      schema:"zzx-nodes-by-nation-model-v7",
      mode,
      rows:Object.freeze(rows.map(row=>Object.freeze(row))),
      nationCount:rows.length,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      updatedMs:updatedMs(snapshot),
      top:rows[0]||null
    });
  }

  W.ZZXNodesByNationModel=Object.freeze({
    __version:7,
    normalizeIso,
    displayName,
    isoFromName,
    flag,
    countryFromNode,
    fromNodes,
    fromAggregate,
    build
  });
})();
