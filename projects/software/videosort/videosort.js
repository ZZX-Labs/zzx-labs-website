(()=>{"use strict";const $=id=>document.getElementById(id);let files=[],plan=[];
function cleanName(name){
 const dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",base=dot>=0?name.slice(0,dot):name;
 let s=base;
 if($("dots").checked)s=s.replace(/[._]+/g," ");
 if($("brackets").checked)s=s.replace(/[\[\(\{][^\]\)\}]*[\]\)\}]/g," ");
 const tokens=$("remove").value.split(",").map(x=>x.trim()).filter(Boolean);
 for(const token of tokens)s=s.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"ig")," ");
 s=s.replace(/\s+/g," ").trim();
 const series=s.match(/(?:s(\d{1,2})\s*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i);let season=null,episode=null;
 if(series){season=+(series[1]||series[3]);episode=+(series[2]||series[4]);s=s.replace(series[0]," ").replace(/\s+/g," ").trim()}
 const year=(s.match(/\b(19|20)\d{2}\b/)||[])[0]||null;
 if($("titlecase").checked)s=s.split(" ").filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
 let folder=$("fallback").value.trim()||"Unsorted";
 if(series&&$("series-folder").checked)folder=`${s}/Season ${String(season).padStart(2,"0")}`;
 else if(year&&$("year-folder").checked)folder=year;
 const renamed=(series?`${s} - S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`:s)+ext;
 return{original:name,renamed,folder,season,episode,year,changed:renamed!==name}
}
function rebuild(){plan=files.map(x=>({...x,...cleanName(x.name)}));render()}
$("files").onchange=()=>{files=[...$("files").files].map(f=>({name:f.name,bytes:f.size,type:f.type||""}));$("files").value="";rebuild()};
$("paste-run").onclick=()=>{files=$("paste").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(name=>({name,bytes:null,type:""}));rebuild()};
["dots","brackets","titlecase","series-folder","year-folder","remove","fallback"].forEach(id=>$(id).oninput=rebuild);
function render(){const e=$("preview");e.replaceChildren();plan.forEach((x,i)=>{const d=document.createElement("div");d.className="vs-row";d.innerHTML=`<div class="vs-before">${i+1}. ${x.original}</div><div class="vs-after">→ ${x.folder}/${x.renamed}</div><div class="fx-watermark">${x.series!=null?`S${x.season}E${x.episode}`:""}${x.year?` · ${x.year}`:""}${x.bytes!=null?` · ${x.bytes} bytes`:""}</div>`;e.append(d)});$("count").textContent=plan.length;$("changed").textContent=plan.filter(x=>x.changed).length;$("folders").textContent=new Set(plan.map(x=>x.folder)).size;$("series").textContent=plan.filter(x=>x.season!=null).length}
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("json").onclick=()=>dl(JSON.stringify({schema:"zzx.videosort.plan.v1",generated:new Date().toISOString(),items:plan},null,2),"videosort-plan.json","application/json");
$("csv").onclick=()=>{const esc=s=>`"${String(s??"").replace(/"/g,'""')}"`,rows=[["original","folder","renamed","season","episode","year"],...plan.map(x=>[x.original,x.folder,x.renamed,x.season,x.episode,x.year])];dl(rows.map(r=>r.map(esc).join(",")).join("\n"),"videosort-plan.csv","text/csv")};
$("bash").onclick=()=>{const q=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";const lines=["#!/usr/bin/env bash","set -euo pipefail","","# Review this dry-run-derived plan before execution.","# mkdir/mv lines are generated from filenames only; no browser paths are available.","",...plan.flatMap(x=>[`mkdir -p -- ${q(x.folder)}`,`mv -- ${q(x.original)} ${q(x.folder+"/"+x.renamed)}`])];dl(lines.join("\n")+"\n","videosort-plan.sh","text/x-shellscript")};
$("ps").onclick=()=>{const q=s=>"'"+String(s).replace(/'/g,"''")+"'";const lines=["# Review before running.","$ErrorActionPreference = 'Stop'","",...plan.flatMap(x=>[`New-Item -ItemType Directory -Force -Path ${q(x.folder)} | Out-Null`,`Move-Item -LiteralPath ${q(x.original)} -Destination ${q(x.folder+"/"+x.renamed)}`])];dl(lines.join("\r\n")+"\r\n","videosort-plan.ps1","text/plain")};
rebuild();window.VideoSort=Object.freeze({version:"0.4.0-alpha-web",directRename:false});
})();
