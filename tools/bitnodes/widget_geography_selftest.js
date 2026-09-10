#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");

const repo=path.resolve(__dirname,"../..");
const memory=new Map();
const context={
  console,
  Intl,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
  document:{scripts:[],head:{appendChild(){}},documentElement:{appendChild(){}}},
  fetch:async()=>{throw new Error("network disabled in self-test");}
};
context.window={
  location:{href:"https://zzx-labs.io/"},
  localStorage:{getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value))},
  setTimeout,
  clearTimeout,
  dispatchEvent(){},
  addEventListener(){},
  removeEventListener(){}
};
context.window.window=context.window;
context.window.document=context.document;
context.globalThis=context;
vm.createContext(context);

function load(rel){
  const filename=path.join(repo,rel);
  vm.runInContext(fs.readFileSync(filename,"utf8"),context,{filename});
}
function assert(condition,message){if(!condition)throw new Error(`ASSERT: ${message}`);}

load("__partials/widgets/_shared/zzx-bitnodes.js");
load("__partials/widgets/nodes-by-nation/js/model.js");
load("__partials/widgets/nodes-by-city/js/model.js");
load("__partials/widgets/nodes-by-county/js/model.js");
load("__partials/widgets/nodes-by-version/js/model.js");
load("__partials/widgets/knots-vs-core/js/model.js");

const B=context.window.ZZXBitnodes;
assert(B.__version===7,"ZZXBitnodes v7 registered");

const canonical={
  schema:"fixture",
  reachable_nodes:4,
  total_nodes:4,
  updated_at:"2026-09-09T23:00:00Z",
  nodes:[
    {address:"203.0.113.10:8333",user_agent:"/Satoshi:31.1.0/",network:"ipv4"},
    {address:"198.51.100.11:8333",user_agent:"/Bitcoin Knots:29.1.knots20260805/",network:"ipv4"},
    {address:"192.0.2.12:8333",user_agent:"/Satoshi:30.2.0/",network:"ipv4"},
    {address:"abcdefghijklmnop.onion:8333",user_agent:"/Bitcoin Knots:29.0.knots20260401/",network:"tor"}
  ]
};

const geo={
  type:"FeatureCollection",
  schema:"zzx-bitnodes-map-nodes-v2",
  features:[
    {type:"Feature",id:"203.0.113.10:8333",properties:{address:"203.0.113.10:8333",country_code:"US",country_name:"United States",city:"New York",region:"New York",county:"New York County",admin2_code:"NY.061",coordinate_source:"db-ip"}},
    {type:"Feature",id:"198.51.100.11:8333",properties:{address:"198.51.100.11:8333",country_code:"DE",country_name:"Germany",city:"Frankfurt am Main",region:"Hesse",county:"Frankfurt am Main",admin2_code:"HE.06412",coordinate_source:"db-ip"}},
    {type:"Feature",id:"192.0.2.12:8333",properties:{address:"192.0.2.12:8333",country_code:"CA",country_name:"Canada",city:"Toronto",region:"Ontario",county:"Toronto",admin2_code:"ON.TOR",coordinate_source:"db-ip"}},
    {type:"Feature",id:"abcdefghijklmnop.onion:8333",properties:{address:"abcdefghijklmnop.onion:8333",country_code:"FR",country_name:"France",city:"Paris",county:"Paris",synthetic:true,coordinate_source:"deterministic-fallback"}}
  ]
};

const normalized=B.normalize(canonical,"fixture-canonical");
assert(normalized.nodes.length===4,"canonical fixture normalized");
assert(Object.keys(normalized.byNation).length===0,"ungeolocated canonical starts without nation aggregate");

const hydrated=B.hydrateGeography(normalized,geo,"fixture-nodes.geojson");
assert(hydrated.schema==="zzx-bitnodes-normalized-v7","hydrated schema v7");
assert(hydrated.geography.joined===3,"three exact-address real-geography joins");
assert(hydrated.geography.located===3,"three located nodes");
assert(hydrated.nodes[3].country===null,"synthetic Tor geography rejected");
assert(hydrated.nodes.find(n=>n.address==="203.0.113.10:8333").countryName==="United States","US nation name retained");

const nation=context.window.ZZXNodesByNationModel.build(hydrated);
assert(nation.rows.length===3,"nation model emits three verified nations");
for(const row of nation.rows){assert(/^[A-Z]{2}$/.test(row.code),"nation ISO present");assert(row.flag&&row.flag!=="🏴","nation flag present");assert(row.name&&row.name!==row.code,"nation full name present");}

const city=context.window.ZZXNodesByCityModel.build(hydrated);
assert(city.rows.length===3,"city model emits three city/nation rows");
for(const row of city.rows){assert(row.flag&&row.countryName&&row.country,"city row carries flag + nation + ISO");}

const county=context.window.ZZXNodesByCountyModel.build(hydrated);
assert(county.rows.length===3,"county model emits three county/nation rows");
for(const row of county.rows){assert(row.flag&&row.countryName&&row.country,"county row carries flag + nation + ISO");}

const versions=context.window.ZZXNodesByVersionModel.build(hydrated);
assert(versions.totalObserved===4,"version global total preserved");
assert(versions.rows.reduce((n,row)=>n+row.count,0)===4,"version x nation rows do not duplicate node count");
assert(versions.rows.length===4,"four version x nation rows");
assert(versions.rows.every(row=>row.flag&&row.countryName&&row.country),"every version row has explicit nation presentation");
assert(versions.rows.some(row=>row.country==="--"&&row.countryName==="Unlocated"&&row.flag==="🏴"),"unlocated node explicitly represented without fabricated nation");
assert(versions.core===2&&versions.knots===2,"Core/Knots global totals preserved");

const kvc=context.window.ZZXKnotsCoreModel.build(versions,hydrated,canonical);
assert(kvc.core===2&&kvc.knots===2,"KVC global totals preserved");
assert(kvc.exactRows.reduce((n,row)=>n+row.count,0)===4,"KVC exact nation rows preserve count");
assert(kvc.exactRows.every(row=>row.flag&&row.countryName&&row.country),"every KVC exact row has flag + nation");
assert(kvc.exactRows.some(row=>row.country==="--"),"KVC preserves unlocated as explicit unlocated row");
assert(kvc.nationRows.length===4,"KVC emits per-nation client table including unlocated");
assert(kvc.nationRows.every(row=>row.flag&&row.countryName&&row.country),"every KVC nation row has flag + nation + ISO");
assert(kvc.nationRows.reduce((n,row)=>n+row.total,0)===4,"KVC nation totals preserve network count");

console.log("widget_geography_selftest: PASS");
