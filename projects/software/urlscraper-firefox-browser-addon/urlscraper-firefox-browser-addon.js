(()=>{"use strict";const $=id=>document.getElementById(id);let rows=[];
function norm(u,title="",tags=[]){try{const x=new URL(u);if($("strip-fragment").checked)x.hash="";if($("strip-query").checked)x.search="";return{id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),url:x.href,title:title||"",domain:x.hostname.toLowerCase(),tags:Array.isArray(tags)?tags:[],created:new Date().toISOString()}}catch{return null}}
function parse(){
 const txt=$("paste").value.trim(),lines=txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),tag=$("tag").value.trim();
 let out=[];for(const line of lines){const n=norm(line,"",tag?[tag]:[]);if(n)out.push(n)}
 rows.push(...out);apply()
}
function apply(){
 const q=$("filter").value.trim().toLowerCase(),domain=$("domain").value.trim().toLowerCase();let list=[...rows];
 if($("dedupe").checked){const seen=new Set();list=list.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true})}
 list=list.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!domain||x.domain.includes(domain)));
 const e=$("rows");e.replaceChildren();list.forEach(x=>{const d=document.createElement("div");d.className="url-row";d.innerHTML=`<strong>${x.title||"(untitled)"}</strong><br><code>${x.url}</code><div class="fx-watermark">${x.domain}${x.tags.length?` · ${x.tags.join(", ")}`:""}</div>`;e.append(d)});
 $("all-count").textContent=rows.length;$("visible-count").textContent=list.length;$("domain-count").textContent=new Set(list.map(x=>x.domain)).size;$("dup-count").textContent=rows.length-new Set(rows.map(x=>x.url)).size;window.__URLSCRAPER_VISIBLE=list
}
$("parse").onclick=parse;["filter","domain","dedupe","strip-fragment","strip-query"].forEach(id=>$(id).oninput=apply);
$("import").onchange=async()=>{const f=$("import").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.tabs||j.rows||j.urls||[]);for(const x of arr){if(typeof x==="string"){const n=norm(x);if(n)rows.push(n)}else{const n=norm(x.url,x.title,x.tags);if(n)rows.push(n)}}apply()}catch(e){$("status").textContent="IMPORT ERROR: "+e.message}$("import").value=""};
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
function vis(){return window.__URLSCRAPER_VISIBLE||[]}
$("txt").onclick=()=>dl(vis().map(x=>x.url).join("\n")+"\n","urlscraper.txt","text/plain");
$("json").onclick=()=>dl(JSON.stringify({schema:"zzx.urlscraper.session.v1",exported:new Date().toISOString(),tabs:vis()},null,2),"urlscraper.json","application/json");
$("csv").onclick=()=>{const esc=s=>`"${String(s??"").replace(/"/g,'""')}"`,rr=[["title","url","domain","tags"],...vis().map(x=>[x.title,x.url,x.domain,x.tags.join("|")])];dl(rr.map(r=>r.map(esc).join(",")).join("\n"),"urlscraper.csv","text/csv")};
$("sql").onclick=()=>{const q=s=>"'"+String(s??"").replace(/'/g,"''")+"'";const lines=["CREATE TABLE IF NOT EXISTS tabs (title TEXT, url TEXT UNIQUE, domain TEXT, tags TEXT);",...vis().map(x=>`INSERT OR IGNORE INTO tabs(title,url,domain,tags) VALUES(${q(x.title)},${q(x.url)},${q(x.domain)},${q(x.tags.join("|"))});`)];dl(lines.join("\n")+"\n","urlscraper.sql","text/sql")};
$("clear").onclick=()=>{rows=[];apply()};apply();window.URLScraperPage=Object.freeze({version:"0.3.0-alpha-web"});
})();
