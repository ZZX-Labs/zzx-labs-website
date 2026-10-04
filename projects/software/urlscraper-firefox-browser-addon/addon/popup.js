"use strict";
const $=id=>document.getElementById(id);
const escCSV=s=>`"${String(s??"").replace(/"/g,'""')}"`;
const qSQL=s=>"'"+String(s??"").replace(/'/g,"''")+"'";
async function collect(){
 let tabs=await browser.tabs.query({});
 const f=$("filter").value.trim().toLowerCase(),tag=$("tag").value.trim(),internal=$("internal").checked;
 let rows=tabs.map(t=>({title:t.title||"",url:t.url||"",windowId:t.windowId,index:t.index,pinned:!!t.pinned,active:!!t.active,tags:tag?[tag]:[]})).filter(x=>x.url);
 if(!internal)rows=rows.filter(x=>/^https?:|^file:|^ftp:/i.test(x.url));
 if(f)rows=rows.filter(x=>(x.url+" "+x.title).toLowerCase().includes(f));
 if($("dedupe").checked){const seen=new Set();rows=rows.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true})}
 return rows
}
function format(rows,fmt){
 if(fmt==="txt")return{body:rows.map(x=>x.url).join("\n")+"\n",type:"text/plain",ext:"txt"};
 if(fmt==="json")return{body:JSON.stringify({schema:"zzx.urlscraper.firefox.v1",exported:new Date().toISOString(),tabs:rows},null,2),type:"application/json",ext:"json"};
 if(fmt==="csv"){const rr=[["title","url","window_id","index","pinned","active","tags"],...rows.map(x=>[x.title,x.url,x.windowId,x.index,x.pinned,x.active,x.tags.join("|")])];return{body:rr.map(r=>r.map(escCSV).join(",")).join("\n"),type:"text/csv",ext:"csv"}}
 const lines=["CREATE TABLE IF NOT EXISTS tabs (title TEXT, url TEXT UNIQUE, window_id INTEGER, tab_index INTEGER, pinned INTEGER, active INTEGER, tags TEXT);",...rows.map(x=>`INSERT OR IGNORE INTO tabs(title,url,window_id,tab_index,pinned,active,tags) VALUES(${qSQL(x.title)},${qSQL(x.url)},${x.windowId},${x.index},${x.pinned?1:0},${x.active?1:0},${qSQL(x.tags.join("|"))});`)];
 return{body:lines.join("\n")+"\n",type:"text/sql",ext:"sql"}
}
async function run(fmt){try{const rows=await collect(),o=format(rows,fmt),blob=new Blob([o.body],{type:o.type}),url=URL.createObjectURL(blob);await browser.downloads.download({url,filename:`urlscraper-${new Date().toISOString().replace(/[:.]/g,"-")}.${o.ext}`,saveAs:true});$("status").textContent=`${rows.length} tab(s) exported` ;setTimeout(()=>URL.revokeObjectURL(url),5000)}catch(e){$("status").textContent="ERROR: "+e.message}}
document.querySelectorAll("[data-fmt]").forEach(b=>b.onclick=()=>run(b.dataset.fmt));
