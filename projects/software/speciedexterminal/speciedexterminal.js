(()=>{"use strict";const $=id=>document.getElementById(id),S=SpeciedexShared;let records=[],history=[];
function println(s=""){history.push(String(s));$("term").textContent=history.slice(-500).join("\n");$("term").scrollTop=$("term").scrollHeight}
function sample(){records=[S.normalize({scientificName:"Balaenoptera musculus",commonName:"Blue whale",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Artiodactyla",family:"Balaenopteridae",genus:"Balaenoptera",status:"Endangered",region:"Global oceans"}),S.normalize({scientificName:"Panthera tigris",commonName:"Tiger",kingdom:"Animalia",phylum:"Chordata",class:"Mammalia",order:"Carnivora",family:"Felidae",genus:"Panthera",status:"Endangered",region:"Asia"})];println(`loaded ${records.length} sample records`)}
$("dataset").onchange=async()=>{const f=$("dataset").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.records||[]);records=arr.map(S.normalize).filter(r=>!S.rejectHuman(r));println(`loaded ${records.length} records from ${f.name}`)}catch(e){println("error: "+e.message)}$("dataset").value=""};
function cmd(line){println(`speciedex> ${line}`);const [c,...args]=line.trim().split(/\s+/);const rest=args.join(" ");switch((c||"").toLowerCase()){
case "help":println("help | stats | find <text> | show <scientific name> | lineage <scientific name> | kingdoms | export | clear");break;
case "stats":println(JSON.stringify({records:records.length,kingdoms:new Set(records.map(r=>r.kingdom)).size,genera:new Set(records.map(r=>r.genus)).size},null,2));break;
case "find":{const q=rest.toLowerCase(),hits=records.filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,50);println(hits.map(r=>`${r.scientificName}\t${r.commonName}\t${r.status}`).join("\n")||"no matches");break}
case "show":{const r=records.find(r=>r.scientificName.toLowerCase()===rest.toLowerCase());println(r?JSON.stringify(r,null,2):"not found");break}
case "lineage":{const r=records.find(r=>r.scientificName.toLowerCase()===rest.toLowerCase());println(r?S.rankOrder.map(k=>`${k}: ${r[k]||"—"}`).join("\n"):"not found");break}
case "kingdoms":println([...new Set(records.map(r=>r.kingdom).filter(Boolean))].sort().join("\n"));break;
case "export":S.download(JSON.stringify({schema:"zzx.speciedexterminal.export.v1",records},null,2),"speciedexterminal-export.json");println("exported JSON");break;
case "clear":history=[];$("term").textContent="";break;
default:println(c?`unknown command: ${c}`:"");}}
$("run").onclick=()=>{const v=$("command").value;cmd(v);$("command").value=""};$("command").addEventListener("keydown",e=>{if(e.key==="Enter")$("run").click()});$("sample").onclick=sample;
println("SpeciedexTerminal browser shell");println("local index/shard simulator only — no host shell execution");println("type help");sample();window.SpeciedexTerminal=Object.freeze({version:"0.1.0-alpha-web",shellExecution:false,providerAdapters:false});
})();
