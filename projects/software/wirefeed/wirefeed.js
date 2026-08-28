(()=>{"use strict";const $=id=>document.getElementById(id);let items=[],feeds=[];
const txt=n=>n?.textContent?.trim()||"";const one=(el,sel)=>el.querySelector(sel);const all=(el,sel)=>[...el.querySelectorAll(sel)];
function parseXML(xml,source="local"){
 const doc=new DOMParser().parseFromString(xml,"application/xml");if(doc.querySelector("parsererror"))throw new Error("Invalid XML");
 const isAtom=!!doc.querySelector("feed");const nodes=isAtom?all(doc,"feed > entry"):all(doc,"channel > item");
 const name=isAtom?txt(one(doc,"feed > title")):txt(one(doc,"channel > title"));const feedId=Math.random().toString(36).slice(2);feeds.push({id:feedId,name:name||source,source});
 for(const n of nodes){const title=txt(one(n,"title")),link=isAtom?(one(n,"link")?.getAttribute("href")||txt(one(n,"link"))):txt(one(n,"link")),guid=txt(one(n,"guid"))||txt(one(n,"id"))||link||title,published=txt(one(n,"pubDate"))||txt(one(n,"published"))||txt(one(n,"updated")),desc=txt(one(n,"description"))||txt(one(n,"summary"))||txt(one(n,"content"));items.push({feedId,feed:name||source,title,link,guid,published,description:desc,source})}
 dedupe();render()
}
function dedupe(){const seen=new Set();items=items.filter(x=>{const k=x.guid||x.link||x.title;if(seen.has(k))return false;seen.add(k);return true})}
$("file").onchange=async()=>{const f=$("file").files[0];if(!f)return;try{parseXML(await f.text(),f.name);$("status").textContent=`Parsed ${f.name}`}catch(e){$("status").textContent="IMPORT ERROR: "+e.message}$("file").value=""};
$("paste-run").onclick=()=>{try{parseXML($("paste").value,"pasted-feed");$("status").textContent="Parsed pasted feed"}catch(e){$("status").textContent="PARSE ERROR: "+e.message}};
$("fetch").onclick=async()=>{const u=$("url").value.trim();if(!/^https?:\/\//i.test(u))return;try{$("status").textContent="Fetching…";const r=await fetch(u,{mode:"cors"});if(!r.ok)throw new Error(`HTTP ${r.status}`);parseXML(await r.text(),u);$("status").textContent="Fetched successfully"}catch(e){$("status").textContent="FETCH FAILED (often CORS): "+e.message}};
function visible(){
 const q=$("keyword").value.trim().toLowerCase(),ex=$("exclude").value.trim().toLowerCase(),feed=$("feed-filter").value;
 return items.filter(x=>(!q||(x.title+" "+x.description+" "+x.feed).toLowerCase().includes(q))&&(!ex||!(x.title+" "+x.description).toLowerCase().includes(ex))&&(!feed||x.feedId===feed)).sort((a,b)=>Date.parse(b.published||0)-Date.parse(a.published||0))
}
function render(){
 const sel=$("feed-filter"),cur=sel.value;sel.innerHTML='<option value="">all feeds</option>';feeds.forEach(f=>{const o=document.createElement("option");o.value=f.id;o.textContent=f.name;sel.append(o)});sel.value=cur;
 const list=visible(),e=$("rows");e.replaceChildren();list.slice(0,500).forEach(x=>{const d=document.createElement("div");d.className="feed-row";d.innerHTML=`<a href="${x.link||"#"}" target="_blank" rel="noopener noreferrer"><strong>${x.title||"(untitled)"}</strong></a><div>${x.feed}${x.published?` · ${new Date(x.published).toLocaleString()}`:""}</div><div class="fx-watermark">${String(x.description||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,260)}</div>`;e.append(d)});
 const ov=$("overlay");ov.replaceChildren();list.slice(0,10).forEach(x=>{const d=document.createElement("div");d.className="overlay-line";d.textContent=`${x.feed}: ${x.title}`;ov.append(d)});
 $("item-count").textContent=items.length;$("visible-count").textContent=list.length;$("feed-count").textContent=feeds.length;$("dedupe-count").textContent=new Set(items.map(x=>x.guid||x.link||x.title)).size
}
["keyword","exclude","feed-filter"].forEach(id=>$(id).oninput=render);
$("clear").onclick=()=>{items=[];feeds=[];render()};
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("json").onclick=()=>dl(JSON.stringify({schema:"zzx.wirefeed.export.v1",exported:new Date().toISOString(),feeds,items:visible()},null,2),"wirefeed.json","application/json");
$("csv").onclick=()=>{const esc=s=>`"${String(s??"").replace(/"/g,'""')}"`,rows=[["feed","title","link","published","guid"],...visible().map(x=>[x.feed,x.title,x.link,x.published,x.guid])];dl(rows.map(r=>r.map(esc).join(",")).join("\n"),"wirefeed.csv","text/csv")};
render();window.WireFeed=Object.freeze({version:"0.3.0-alpha-web"});
})();
