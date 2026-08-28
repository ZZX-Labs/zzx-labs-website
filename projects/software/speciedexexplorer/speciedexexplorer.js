(()=>{"use strict";
const $=id=>document.getElementById(id),S=SpeciedexShared;let records=[];
function sample(){records=[
 S.normalize({scientificName:"Balaenoptera musculus",commonName:"Blue whale",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Artiodactyla",family:"Balaenopteridae",genus:"Balaenoptera",status:"Endangered",habitat:"Marine",region:"Global oceans",source:"synthetic-demo"}),
 S.normalize({scientificName:"Panthera tigris",commonName:"Tiger",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Carnivora",family:"Felidae",genus:"Panthera",status:"Endangered",habitat:"Forest",region:"Asia",source:"synthetic-demo"}),
 S.normalize({scientificName:"Raphus cucullatus",commonName:"Dodo",kingdom:"Animalia",phylum:"Chordata",class:"Aves",order:"Columbiformes",family:"Columbidae",genus:"Raphus",status:"Extinct",habitat:"Island forest",region:"Mauritius",source:"synthetic-demo"}),
 S.normalize({scientificName:"Quercus alba",commonName:"White oak",kingdom:"Plantae",phylum:"Tracheophyta",class:"Magnoliopsida",order:"Fagales",family:"Fagaceae",genus:"Quercus",status:"Least Concern",habitat:"Temperate forest",region:"Eastern North America",source:"synthetic-demo"})
 ];renderSearch()}
$("sample").onclick=sample;
$("dataset").onchange=async()=>{const f=$("dataset").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.records||[]);records=arr.map(S.normalize).filter(r=>!S.rejectHuman(r));renderSearch()}catch(e){$("result").textContent="IMPORT ERROR: "+e.message}$("dataset").value=""};
function renderSearch(){const q=$("search").value.trim().toLowerCase(),hits=records.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));const e=$("results");e.replaceChildren();hits.forEach((r,i)=>{const b=document.createElement("button");b.className="btn ghost";b.textContent=`${r.scientificName} — ${r.commonName}`;b.onclick=()=>select(records.indexOf(r));e.append(b)});$("hits").textContent=hits.length;$("extinct").textContent=records.filter(r=>/extinct/i.test(r.status)).length;$("records-count").textContent=records.length}
$("search").oninput=renderSearch;
function select(i){const r=records[i];$("result").textContent=JSON.stringify(r,null,2);const t=$("tree");t.replaceChildren();S.rankOrder.forEach(rank=>{const d=document.createElement("div");d.className="tree-node";d.innerHTML=`<strong>${rank.toUpperCase()}</strong><div>${r[rank]||"—"}</div>`;t.append(d)});renderHabitat(r);$("share-text").value=`Speciedex: ${r.scientificName} (${r.commonName}) — ${r.status} — ${r.region}`}
function renderHabitat(r){const e=$("map");e.replaceChildren();const d=document.createElement("div");d.className="fx-note";d.style.position="absolute";d.style.left="1rem";d.style.top="1rem";d.textContent=`Habitat: ${r.habitat||"unknown"} · Region: ${r.region||"unknown"}`;e.append(d);for(let i=0;i<5;i++){const p=document.createElement("span");p.className="ex-pin";p.style.left=(15+i*17)+"%";p.style.top=(30+((i*37)%45))+"%";p.title="illustrative habitat point; not occurrence data";e.append(p)}}
$("copy-share").onclick=async()=>{await navigator.clipboard.writeText($("share-text").value);$("share-status").textContent="Copied summary."};
$("export").onclick=()=>S.download(JSON.stringify({schema:"zzx.speciedexexplorer.snapshot.v1",exported:new Date().toISOString(),records},null,2),"speciedexexplorer-snapshot.json");
sample();select(0);window.SpeciedexExplorer=Object.freeze({version:"0.3.0-alpha-web",liveApi:false});
})();
