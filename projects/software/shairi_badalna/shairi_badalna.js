(()=>{"use strict";
const $=id=>document.getElementById(id);let items=[];
function applyRules(name){
 const dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",base=dot>=0?name.slice(0,dot):name;
 let s=base;
 if($("dots").checked)s=s.replace(/[._]+/g," ");
 if($("brackets").checked)s=s.replace(/[\[\(\{][^\]\)\}]*[\]\)\}]/g," ");
 for(const token of $("remove").value.split(",").map(x=>x.trim()).filter(Boolean)){s=s.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"ig")," ")}
 s=s.replace(/\s+/g," ").trim();
 const ep=s.match(/(?:s(\d{1,2})\s*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i);let season=null,episode=null;
 if(ep){season=+(ep[1]||ep[3]);episode=+(ep[2]||ep[4]);s=s.replace(ep[0]," ").replace(/\s+/g," ").trim()}
 if($("titlecase").checked)s=s.split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(" ");
 const folder=season!=null?`${s}/Season ${String(season).padStart(2,"0")}`:($("folder").value.trim()||"Unsorted");
 const normalized=(season!=null?`${s} - S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`:s)+ext;
 return{original:name,normalized,folder,season,episode,changed:normalized!==name}
}
function rebuild(){const names=$("names").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);items=names.map(applyRules);render()}
function render(){const e=$("preview");e.replaceChildren();items.forEach((x,i)=>{const d=document.createElement("div");d.className="sb-row";d.innerHTML=`<div class="sb-old">${i+1}. ${x.original}</div><div class="sb-new">→ ${x.folder}/${x.normalized}</div>`;e.append(d)});$("count").textContent=items.length;$("changed").textContent=items.filter(x=>x.changed).length;$("folders").textContent=new Set(items.map(x=>x.folder)).size}
$("build").onclick=rebuild;["dots","brackets","titlecase","remove","folder"].forEach(id=>$(id).oninput=rebuild);
$("file-list").onchange=()=>{$("names").value=[...$("file-list").files].map(f=>f.name).join("\n");rebuild();$("file-list").value=""};
function dl(t,n,type){const b=new Blob([t],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-json").onclick=()=>dl(JSON.stringify({schema:"zzx.shairi-badalna.plan.v1",generated:new Date().toISOString(),items},null,2),"shairi-badalna-plan.json","application/json");
$("export-csv").onclick=()=>{const rows=[["original","folder","normalized"],...items.map(x=>[x.original,x.folder,x.normalized])],csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");dl(csv,"shairi-badalna-plan.csv","text/csv")};
rebuild();window.ShairiBadalna=Object.freeze({version:"0.2.0-alpha-web",renamesFiles:false});
})();
