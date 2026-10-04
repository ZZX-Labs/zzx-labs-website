(()=>{"use strict";
const $=id=>document.getElementById(id),S=SpeciedexShared;
let records=[],verificationLog=[],classified=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function sample(){
 records=[
  S.normalize({scientificName:"Balaenoptera musculus",commonName:"Blue whale",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Artiodactyla",family:"Balaenopteridae",genus:"Balaenoptera",species:"Balaenoptera musculus",status:"Endangered",habitat:"Marine",region:"Global oceans",source:"synthetic-demo",confidence:.99,verifiedBy:["peer-a","peer-b"]}),
  S.normalize({scientificName:"Panthera tigris",commonName:"Tiger",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Carnivora",family:"Felidae",genus:"Panthera",species:"Panthera tigris",status:"Endangered",habitat:"Forest / grassland",region:"Asia",source:"synthetic-demo",confidence:.98,verifiedBy:["peer-c"]}),
  S.normalize({scientificName:"Quercus alba",commonName:"White oak",kingdom:"Plantae",phylum:"Tracheophyta",class:"Magnoliopsida",order:"Fagales",family:"Fagaceae",genus:"Quercus",species:"Quercus alba",status:"Least Concern",habitat:"Temperate forest",region:"Eastern North America",source:"synthetic-demo",confidence:.97,verifiedBy:["peer-d"]}),
  S.normalize({scientificName:"Danaus plexippus",commonName:"Monarch butterfly",kingdom:"Animalia",phylum:"Arthropoda",class:"Insecta",order:"Lepidoptera",family:"Nymphalidae",genus:"Danaus",species:"Danaus plexippus",status:"Migratory",habitat:"Meadow / migration corridor",region:"Americas",source:"synthetic-demo",confidence:.96,verifiedBy:["peer-e"]})
 ];render()
}
function render(){
 const q=$("search").value.trim().toLowerCase(),list=records.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));
 const e=$("records");e.replaceChildren();list.forEach(r=>{const d=document.createElement("div");d.className="sp-record";d.innerHTML=`<strong>${esc(r.scientificName)}</strong> <span class="sp-status">${esc(r.status)}</span><div>${esc(r.commonName)}</div><div class="sp-rank">${S.rankOrder.map(k=>`${k}:${esc(r[k])}`).join(" · ")}</div><div class="fx-watermark">${esc(r.habitat)} · ${esc(r.region)} · ${r.verifiedBy.length} peer verification(s)</div>`;e.append(d)});
 $("record-count").textContent=records.length;$("visible").textContent=list.length;$("verified").textContent=records.filter(r=>r.verifiedBy.length>=2).length;$("species-count").textContent=new Set(records.map(r=>r.scientificName.toLowerCase())).size
}
$("search").oninput=render;$("sample").onclick=sample;
$("import").onchange=async()=>{const f=$("import").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.records||[]),norm=arr.map(S.normalize),blocked=norm.filter(S.rejectHuman);records.push(...norm.filter(r=>!S.rejectHuman(r)));$("import-output").textContent=JSON.stringify({imported:norm.length-blocked.length,rejectedHomoSapiens:blocked.length},null,2);render()}catch(e){$("import-output").textContent="IMPORT ERROR: "+e.message}$("import").value=""};
$("classify").onclick=()=>{
 const text=$("observation").value.toLowerCase(),scores=records.map(r=>{const toks=[r.commonName,r.scientificName,r.habitat,r.region,r.family,r.genus].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2),obs=text.split(/[^a-z0-9]+/).filter(x=>x.length>2),hit=obs.filter(t=>toks.some(x=>x.includes(t)||t.includes(x))).length;return{record:r,score:obs.length?hit/obs.length:0}}).sort((a,b)=>b.score-a.score);
 classified=scores.slice(0,5).map(x=>({scientificName:x.record.scientificName,commonName:x.record.commonName,score:+x.score.toFixed(4),method:"local token similarity demo"}));$("classification-output").textContent=JSON.stringify({candidates:classified,aiInference:false,note:"browser classifier is a deterministic local demonstrator; TensorFlow model belongs in native/server stack"},null,2)
};
$("add-verification").onclick=async()=>{const name=$("verify-species").value.trim(),peer=$("peer").value.trim();const r=records.find(x=>x.scientificName.toLowerCase()===name.toLowerCase());if(!r||!peer){$("verify-output").textContent="Exact species name and peer label required.";return}if(!r.verifiedBy.includes(peer))r.verifiedBy.push(peer);const event={id:S.uid(),species:r.scientificName,peer,decision:$("decision").value,at:new Date().toISOString()};event.hash=await S.sha256(JSON.stringify(event));verificationLog.push(event);$("verify-output").textContent=JSON.stringify(event,null,2);render()};
$("export").onclick=()=>S.download(JSON.stringify({schema:"zzx.speciedex.dataset.v1",exported:new Date().toISOString(),records,verificationLog,excludedTaxon:"Homo sapiens",liveBitcoinPayments:false},null,2),"speciedex-dataset.json");
sample();window.Speciedex=Object.freeze({version:"0.4.0-alpha-web",excludesHomoSapiens:true});
})();
