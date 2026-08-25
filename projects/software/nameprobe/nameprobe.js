(()=>{"use strict";
const $=id=>document.getElementById(id);
let rows=[],result=null;
function parseCSV(text){
 const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];
 const head=lines[0].split(",").map(x=>x.trim().toLowerCase());
 return lines.slice(1).map(line=>{const vals=line.split(",").map(x=>x.trim());const o={};head.forEach((h,i)=>o[h]=vals[i]??"");return o}).filter(x=>x.name)
}
function normalize(r){
 return{name:String(r.name||"").trim(),count:+(r.count||r.frequency||1)||1,country:String(r.country||"").trim(),region:String(r.region||"").trim(),year:r.year?+r.year:null,group:String(r.group||r.demographic||"").trim(),source:String(r.source||"").trim()}
}
$("csv").onchange=async()=>{const f=$("csv").files[0];if(!f)return;rows=parseCSV(await f.text()).map(normalize);renderData();$("csv").value=""};
$("load-sample").onclick=()=>{rows=[
 {name:"Alex",count:1200,country:"US",region:"Northeast",year:2000,group:"aggregate-A",source:"demo"},
 {name:"Alex",count:1550,country:"US",region:"West",year:2010,group:"aggregate-A",source:"demo"},
 {name:"Alex",count:980,country:"CA",region:"Ontario",year:2010,group:"aggregate-B",source:"demo"},
 {name:"Sam",count:1100,country:"US",region:"South",year:2010,group:"aggregate-A",source:"demo"},
 {name:"Jordan",count:860,country:"CA",region:"British Columbia",year:2020,group:"aggregate-B",source:"demo"},
 {name:"Alex",count:1750,country:"CA",region:"Quebec",year:2020,group:"aggregate-B",source:"demo"}
 ];renderData()};
function renderData(){$("row-count").textContent=rows.length;$("name-count").textContent=new Set(rows.map(r=>r.name.toLowerCase())).size;$("geo-count").textContent=new Set(rows.map(r=>`${r.country}|${r.region}`)).size;$("year-count").textContent=new Set(rows.map(r=>r.year).filter(Boolean)).size;$("data-output").textContent=JSON.stringify(rows.slice(0,80),null,2)}
function probe(){
 const q=$("query").value.trim().toLowerCase();if(!q)return;
 const matches=rows.filter(r=>r.name.toLowerCase()===q),total=rows.reduce((s,r)=>s+r.count,0),matchTotal=matches.reduce((s,r)=>s+r.count,0);
 const by=(key)=>{const m={};for(const r of matches){const k=r[key]||"unknown";m[k]=(m[k]||0)+r.count}return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count,share:matchTotal?count/matchTotal:0}))};
 result={query:$("query").value.trim(),records:matches.length,observedCount:matchTotal,datasetCount:total,datasetProbability:total?matchTotal/total:0,byCountry:by("country"),byRegion:by("region"),byYear:by("year"),byGroup:by("group"),interpretation:"aggregate supplied-dataset frequency only; not an inference about a specific person's identity or protected traits"};
 $("probability").textContent=(result.datasetProbability*100).toFixed(4)+"%";$("observed").textContent=matchTotal.toLocaleString();$("records").textContent=matches.length;$("probe-output").textContent=JSON.stringify(result,null,2);renderBars(result.byCountry)
}
function renderBars(items){const e=$("bars");e.replaceChildren();const max=Math.max(1,...items.map(x=>x.count));for(const x of items){const d=document.createElement("div");d.className="name-bar";d.innerHTML=`<span>${x.label}</span><span><i style="width:${100*x.count/max}%"></i></span><strong>${(x.share*100).toFixed(2)}%</strong>`;e.append(d)}}
$("probe").onclick=probe;
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.nameprobe.result.v1",generated:new Date().toISOString(),result},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="nameprobe-result.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("load-sample").click();window.NameProbe=Object.freeze({version:"0.1.0-alpha-web"});
})();
