(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByCityModel?.__version>=3)return;

  function finite(value){const n=Number(value);return Number.isFinite(n)?n:NaN;}
  function clean(value){return String(value??"").trim();}
  function meta(code,name="",flag=""){
    if(W.ZZXBitnodes?.countryMeta)return W.ZZXBitnodes.countryMeta(code,name,flag);
    const iso=clean(code).toUpperCase();const valid=/^[A-Z]{2}$/.test(iso);
    let n=valid?iso:"Unlocated";try{if(valid&&typeof Intl?.DisplayNames==="function")n=new Intl.DisplayNames(["en"],{type:"region"}).of(iso)||iso;}catch(_){}
    return {code:valid?iso:"--",name:clean(name)||n,flag:valid?String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0))):"🏴",located:valid};
  }
  function makeLabel(city,region,countryName,country){return [clean(city),clean(region),clean(countryName),clean(country)].filter(Boolean).join(" · ")||"Unknown";}

  function fromNodes(snapshot){
    const map=new Map();
    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const city=clean(node?.city);const region=clean(node?.region);const country=meta(node?.country,node?.countryName,node?.countryFlag);
      if(!city||!country.located||node?.geoSynthetic===true)continue;
      const key=`${city.toLowerCase()}|${region.toLowerCase()}|${country.code}`;
      const row=map.get(key)||{city,region,country:country.code,countryName:country.name,flag:country.flag,nationLabel:country.label,label:makeLabel(city,region,country.name,country.code),nodes:0};
      row.nodes+=1;map.set(key,row);
    }
    return [...map.values()];
  }

  function fromMap(snapshot){
    const source=snapshot?.byCity;if(!source||typeof source!=="object"||Array.isArray(source))return [];
    return Object.entries(source).map(([label,count])=>{
      const nodes=finite(count);if(!(nodes>0))return null;
      const raw=clean(label);const match=raw.match(/^(.*),\s*([A-Z]{2})$/);if(!match)return null;
      const city=clean(match[1]);const country=meta(match[2]);if(!city||!country.located)return null;
      return {city,region:"",country:country.code,countryName:country.name,flag:country.flag,nationLabel:country.label,label:makeLabel(city,"",country.name,country.code),nodes};
    }).filter(Boolean);
  }

  function build(snapshot){
    let rows=fromNodes(snapshot);if(!rows.length)rows=fromMap(snapshot);
    const merged=new Map();
    for(const row of rows){
      const city=clean(row.city);const region=clean(row.region);const country=meta(row.country,row.countryName,row.flag);
      if(!city||!country.located||!(Number(row.nodes)>0))continue;
      const key=`${city.toLowerCase()}|${region.toLowerCase()}|${country.code}`;
      const current=merged.get(key)||{city,region,country:country.code,countryName:country.name,flag:country.flag,nationLabel:country.label,label:makeLabel(city,region,country.name,country.code),nodes:0};
      current.nodes+=Number(row.nodes);merged.set(key,current);
    }
    rows=[...merged.values()].sort((a,b)=>b.nodes-a.nodes||a.countryName.localeCompare(b.countryName)||a.region.localeCompare(b.region)||a.city.localeCompare(b.city));
    const geolocatedTotal=rows.reduce((sum,row)=>sum+row.nodes,0);const reachable=finite(snapshot?.reachableNodes??snapshot?.totalNodes);const decoded=finite(snapshot?.nodeCount);
    const denominator=Number.isFinite(reachable)&&reachable>0?reachable:Number.isFinite(decoded)&&decoded>0?decoded:geolocatedTotal;
    for(const row of rows){row.share=denominator>0?row.nodes/denominator:NaN;row.geoShare=geolocatedTotal>0?row.nodes/geolocatedTotal:NaN;}
    const coverage=denominator>0?Math.min(1,geolocatedTotal/denominator):NaN;const unidentified=denominator>0?Math.max(0,denominator-geolocatedTotal):NaN;
    return Object.freeze({schema:"zzx-nodes-by-city-model-v3",rows:Object.freeze(rows.map(Object.freeze)),cityCount:rows.length,geolocatedTotal,reachable:Number.isFinite(reachable)?reachable:null,decoded:Number.isFinite(decoded)?decoded:null,denominator:Number.isFinite(denominator)?denominator:null,coverage:Number.isFinite(coverage)?coverage:null,unidentified:Number.isFinite(unidentified)?unidentified:null,geographySource:snapshot?.geography?.source||null,top:rows[0]||null});
  }
  W.ZZXNodesByCityModel=Object.freeze({__version:3,build,makeLabel,countryMeta:meta});
})();
