(()=>{"use strict";
const $=id=>document.getElementById(id);let items=[];
function clean(name){
 const dot=name.lastIndexOf("."),ext=dot>=0?name.slice(dot).toLowerCase():"",base=dot>=0?name.slice(0,dot):name;
 let s=base.replace(/[\[\(\{][^\]\)\}]*[\]\)\}]/g," ").replace(/[._]+/g," ").replace(/\s+/g," ").trim();
 const series=s.match(/(?:s(\d{1,2})\s*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i);
 let season=null,episode=null;if(series){season=+(series[1]||series[3]);episode=+(series[2]||series[4]);s=s.replace(series[0]," ").replace(/\s+/g," ").trim()}
 s=s.replace(/\b(1080p|720p|2160p|4k|x264|x265|hevc|webrip|web-dl|bluray|dvdrip|aac|dts)\b/ig," ").replace(/\s+/g," ").trim();
 s=s.replace(/[^a-z0-9 -]+/ig,"").replace(/\s+/g," ").trim();
 const pretty=s.split(" ").filter(Boolean).map(w=>w.length<=3&&w===w.toUpperCase()?w:w[0]?.toUpperCase()+w.slice(1)).join(" ");
 const normalized=(series?`${pretty} - S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`:pretty)+ext;
 return{original:name,normalized,season,episode,changed:normalized!==name}
}
$("files").onchange=()=>{items=[...$("files").files].map(f=>clean(f.name));render();$("files").value=""};
$("text-parse").onclick=()=>{items=$("names").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(clean);render()};
function render(){const e=$("preview");e.replaceChildren();items.forEach((x,i)=>{const d=document.createElement("div");d.className="sk-preview";d.innerHTML=`<div class="sk-old">${i+1}. ${x.original}</div><div class="sk-new">→ ${x.normalized}</div><div class="fx-watermark">${x.season!=null?`series S${x.season} E${x.episode}`:"single"} · ${x.changed?"changed":"unchanged"}</div>`;e.append(d)});$("count").textContent=items.length;$("changed").textContent=items.filter(x=>x.changed).length;$("series").textContent=items.filter(x=>x.season!=null).length}
$("export-json").onclick=()=>dl(JSON.stringify({schema:"zzx.safai-karta.plan.v1",generated:new Date().toISOString(),items},null,2),"safai-karta-plan.json","application/json");
$("export-sh").onclick=()=>{const q=s=>"'"+String(s).replaceAll("'","'\\''")+"'";const lines=["#!/usr/bin/env bash","set -euo pipefail","","# Review before running. Generated rename plan only.",...items.filter(x=>x.changed).map(x=>`mv -- ${q(x.original)} ${q(x.normalized)}`)];dl(lines.join("\n")+"\n","safai-karta-renames.sh","text/x-shellscript")};
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
render();window.SafaiKarta=Object.freeze({version:"0.3.0-alpha-web",renamesFiles:false});
})();
