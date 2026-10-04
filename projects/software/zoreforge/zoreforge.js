(()=>{"use strict";const $=id=>document.getElementById(id);let library=[],tables=[],outline=null;
function mulberry32(a){return()=>{let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function seedInt(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(){return mulberry32(seedInt($("seed").value||"ZoreForge"))}
function roll(r,sides,count=1){let total=0,vals=[];for(let i=0;i<count;i++){const v=1+Math.floor(r()*sides);vals.push(v);total+=v}return{total,vals}}
const libs={
 "worlds":["Ashen Plateau","Mirror Coast","Lantern Basin","Orchid Expanse","Ivory Steppe","Storm Archive","Ember Delta","Silent Meridian"],
 "cultures":["Archivist Compact","Nomad Conclave","Canopy Guild","Salt Assembly","Pilgrim Cartographers","Iron Orchard","Tide Monastery","Glass Wardens"],
 "factions":["The Ninth Ledger","Cinder Couriers","Moss Parliament","Blue Standard","Crescent Survey","Black Orchard","Jade Tribunal","Sunless Choir"],
 "artifacts":["Compass of Returning","Sevenfold Seal","Ash Bell","Saffron Engine","Moon-Key","Ivory Relay","Mirror Ledger","Red Thread Archive"],
 "hazards":["magnetic storm","memory fog","seasonal flood","glass rain","ashfall","navigation blackout","crop blight","signal eclipse"]
};
function pick(r,a){return a[Math.floor(r()*a.length)]}
function generate(){
 const r=rng(),depth=Math.max(1,Math.min(7,+$("depth").value||4)),breadth=Math.max(1,Math.min(8,+$("breadth").value||3)),genre=$("genre").value,root=$("root").value.trim()||pick(r,libs.worlds);
 const nodes=[];let id=0;
 function rec(parent,d,label){
   const me={id:id++,parent,depth:d,label,type:d===0?"world":d===1?"region":d===2?"faction":d===3?"entity":"event",roll:roll(r,20).total};nodes.push(me);
   if(d>=depth)return;
   for(let i=0;i<breadth;i++){
     const next=d===0?`${pick(r,libs.worlds)} Sector`:d===1?pick(r,libs.cultures):d===2?pick(r,libs.factions):d===3?pick(r,libs.artifacts):`${pick(r,libs.hazards)} cycle`;
     rec(me.id,d+1,next)
   }
 }
 rec(null,0,root);
 outline={schema:"zzx.zoreforge.outline.v1",seed:$("seed").value,genre,depth,breadth,nodes,generated:new Date().toISOString()};
 renderTree();$("node-count").textContent=nodes.length;$("leaf-count").textContent=nodes.filter(n=>!nodes.some(x=>x.parent===n.id)).length
}
function renderTree(){const e=$("tree");e.replaceChildren();for(const n of outline?.nodes||[]){const d=document.createElement("div");d.className="zf-node";d.style.paddingLeft=(n.depth*16)+"px";d.innerHTML=`<span class="depth">${"·".repeat(n.depth)}</span> <strong>${n.label}</strong> <span class="zf-roll">d20:${n.roll}</span>`;e.append(d)}}
$("generate").onclick=generate;
$("roll").onclick=()=>{const r=rng(),s=Math.max(2,+$("sides").value||20),n=Math.max(1,Math.min(100,+$("dice").value||1)),out=roll(r,s,n);$("roll-out").textContent=`${n}d${s} = ${out.total} [${out.vals.join(", ")}]`};
$("add-table").onclick=()=>{const rows=$("table-rows").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!rows.length)return;tables.push({id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),name:$("table-name").value.trim()||`Table ${tables.length+1}`,rows});renderTables()};
function renderTables(){const e=$("tables");e.replaceChildren();tables.forEach(t=>{const d=document.createElement("div");d.className="zf-card";d.innerHTML=`<strong>${t.name}</strong> · d${t.rows.length}<div>${t.rows.slice(0,8).join(" | ")}</div>`;e.append(d)});$("table-count").textContent=tables.length}
$("table-roll").onclick=()=>{const t=tables.find(x=>x.name===$("table-select").value)||tables[0];if(!t){$("table-roll-out").textContent="Add a table first.";return}const r=rng(),i=Math.floor(r()*t.rows.length);$("table-roll-out").textContent=`${t.name} [${i+1}/${t.rows.length}] → ${t.rows[i]}`};
$("lib-add").onclick=()=>{const item={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),type:$("lib-type").value,name:$("lib-name").value.trim(),notes:$("lib-notes").value.trim(),created:new Date().toISOString()};if(!item.name)return;library.push(item);renderLib()};
function renderLib(){const e=$("library");e.replaceChildren();library.forEach(x=>{const d=document.createElement("div");d.className="zf-card";d.innerHTML=`<strong>${x.name}</strong> · ${x.type}<div class="fx-watermark">${x.notes}</div>`;e.append(d)});$("lib-count").textContent=library.length}
function dl(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export").onclick=()=>dl(JSON.stringify({schema:"zzx.zoreforge.workspace.v1",exported:new Date().toISOString(),outline,tables,library},null,2),"zoreforge-workspace.json");
$("table-name").value="Hazard Table";$("table-rows").value=libs.hazards.join("\n");$("add-table").click();generate();window.ZoreForge=Object.freeze({version:"0.1.0-alpha-web",components:["ZoreOutline","ZoreLibrary GUI","Dice Engine","Dice Table Scaffold"]});
})();
