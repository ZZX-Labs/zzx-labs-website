(()=>{"use strict";const $=id=>document.getElementById(id);let ledger=[];
function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}
function add(){
 const x={id:uid(),date:$("date").value,kind:$("kind").value,project:$("project").value.trim(),party:$("party").value.trim(),description:$("desc").value.trim(),amount:+$("amount").value||0,currency:$("currency").value.trim().toUpperCase()||"USD",btcReference:+$("btc-ref").value||null,status:$("status").value,notes:$("notes").value.trim(),created:new Date().toISOString()};
 if(!x.description||!x.amount)return;ledger.push(x);save();render()
}
$("add").onclick=add;function save(){localStorage.setItem("zzx.bcs.v1",JSON.stringify(ledger))}
function load(){try{ledger=JSON.parse(localStorage.getItem("zzx.bcs.v1")||"[]");if(!Array.isArray(ledger))ledger=[]}catch{ledger=[]}render()}
function visible(){const q=$("filter").value.trim().toLowerCase(),k=$("filter-kind").value;return ledger.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!k||x.kind===k))}
function render(){
 const rows=visible(),e=$("rows");e.replaceChildren();rows.slice().reverse().forEach(x=>{const d=document.createElement("div");d.className="bcs-row";const btc=x.btcReference&&x.currency==="USD"?x.amount/x.btcReference:null;d.innerHTML=`<strong>${x.kind.toUpperCase()} · ${x.amount.toFixed(2)} ${x.currency}</strong> · ${x.status}<div>${x.date} · ${x.project||"no project"} · ${x.party||"no party"}</div><div>${x.description}</div>${btc!=null?`<div class="fx-watermark">manual BTC reference: ${btc.toFixed(8)} BTC @ ${x.btcReference} USD/BTC</div>`:""}<button class="btn ghost" data-id="${x.id}">DELETE</button>`;e.append(d)});e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{ledger=ledger.filter(x=>x.id!==b.dataset.id);save();render()});
 $("entries").textContent=ledger.length;const open=ledger.filter(x=>x.status!=="paid"&&x.status!=="settled"),usd=ledger.filter(x=>x.currency==="USD").reduce((s,x)=>s+x.amount*(x.kind==="expense"?-1:1),0),btc=ledger.filter(x=>x.currency==="BTC").reduce((s,x)=>s+x.amount*(x.kind==="expense"?-1:1),0);$("open").textContent=open.length;$("usd").textContent=usd.toFixed(2);$("btc").textContent=btc.toFixed(8)
}
["filter","filter-kind"].forEach(id=>$(id).oninput=render);
$("summary").onclick=()=>{const byProject={};for(const x of ledger){const p=x.project||"(unassigned)",c=x.currency;byProject[p]??={};byProject[p][c]=(byProject[p][c]||0)+(x.kind==="expense"?-x.amount:x.amount)}$("summary-out").textContent=JSON.stringify({schema:"zzx.bcs.summary.v1",projects:byProject,generated:new Date().toISOString(),taxCalculation:false},null,2)};
function dl(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("json").onclick=()=>dl(JSON.stringify({schema:"zzx.bcs.ledger.v1",exported:new Date().toISOString(),ledger,liveRates:false,taxCalculation:false},null,2),"zzxbcs-ledger.json");
$("csv").onclick=()=>{const esc=s=>`"${String(s??"").replace(/"/g,'""')}"`,rows=[["date","kind","project","party","description","amount","currency","btc_reference","status","notes"],...ledger.map(x=>[x.date,x.kind,x.project,x.party,x.description,x.amount,x.currency,x.btcReference,x.status,x.notes])];dl(rows.map(r=>r.map(esc).join(",")).join("\n"),"zzxbcs-ledger.csv","text/csv")};
$("date").value=new Date().toISOString().slice(0,10);load();window.ZZXBCS=Object.freeze({version:"0.1.0-alpha-web",taxCalculation:false,liveRates:false});
})();
