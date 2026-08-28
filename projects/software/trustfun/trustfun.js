(()=>{"use strict";
const $=id=>document.getElementById(id),STORE="zzx.trustfun.v1";
let goals=[],contribs=[],settings={currency:"USD",btcUsd:null};
function save(){localStorage.setItem(STORE,JSON.stringify({goals,contribs,settings}))}
function load(){try{const j=JSON.parse(localStorage.getItem(STORE)||"{}");goals=Array.isArray(j.goals)?j.goals:[];contribs=Array.isArray(j.contribs)?j.contribs:[];settings=j.settings||settings}catch{};render()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}
function money(v,c){return `${Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2})} ${c||settings.currency}`}
$("save-settings").onclick=()=>{settings.currency=$("currency").value.trim().toUpperCase()||"USD";settings.btcUsd=+$("btc-usd").value||null;save();render()};
$("add-goal").onclick=()=>{
 const g={id:uid(),name:$("goal-name").value.trim(),target:Math.max(0,+$("target").value||0),current:Math.max(0,+$("current").value||0),currency:$("goal-currency").value.trim().toUpperCase()||settings.currency,due:$("due").value,priority:$("priority").value,allocationPct:Math.max(0,Math.min(100,+$("allocation").value||0)),bitcoinDenominated:$("btc-denom").checked,notes:$("goal-notes").value.trim(),created:new Date().toISOString()};
 if(!g.name||!g.target)return;goals.push(g);save();render()
};
$("add-contrib").onclick=()=>{
 const goal=goals.find(g=>g.id===$("contrib-goal").value);if(!goal)return;
 const amount=Math.max(0,+$("contrib-amount").value||0),c={id:uid(),goalId:goal.id,amount,currency:goal.currency,at:$("contrib-at").value||new Date().toISOString().slice(0,10),note:$("contrib-note").value.trim()};
 goal.current+=amount;contribs.push(c);save();render()
};
function render(){
 $("currency").value=settings.currency||"USD";$("btc-usd").value=settings.btcUsd||"";
 const sel=$("contrib-goal");sel.replaceChildren();goals.forEach(g=>{const o=document.createElement("option");o.value=g.id;o.textContent=g.name;sel.append(o)});
 const e=$("goals");e.replaceChildren();let totalTarget=0,totalCurrent=0;
 goals.forEach(g=>{totalTarget+=g.target;totalCurrent+=g.current;const pct=Math.min(100,g.target?g.current/g.target*100:0),btc=settings.btcUsd&&g.currency==="USD"?g.current/settings.btcUsd:null,d=document.createElement("div");d.className="tf-goal";d.innerHTML=`<strong>${g.name}</strong> · ${g.priority}<div>${money(g.current,g.currency)} / ${money(g.target,g.currency)} · ${pct.toFixed(1)}%</div>${btc!=null?`<div class="fx-watermark">reference BTC equivalent: ${btc.toFixed(8)} BTC at manually entered ${settings.btcUsd} USD/BTC</div>`:""}<div class="tf-progress"><i style="width:${pct}%"></i></div><div class="fx-watermark">${g.due?`due ${g.due} · `:""}allocation ${g.allocationPct}% · ${g.notes}</div><button class="btn ghost" data-id="${g.id}">DELETE</button>`;e.append(d)});
 e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{goals=goals.filter(g=>g.id!==b.dataset.id);contribs=contribs.filter(c=>c.goalId!==b.dataset.id);save();render()});
 $("goal-count").textContent=goals.length;$("contrib-count").textContent=contribs.length;$("total-target").textContent=money(totalTarget,settings.currency);$("total-current").textContent=money(totalCurrent,settings.currency);draw()
}
function draw(){const c=$("chart"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle="#050505";x.fillRect(0,0,w,h);const vals=goals.map(g=>({name:g.name,pct:Math.min(100,g.target?g.current/g.target*100:0)}));if(!vals.length)return;const bw=(w-80)/vals.length;x.font="11px monospace";vals.forEach((v,i)=>{const bh=v.pct/100*(h-70),px=45+i*bw+8;x.fillStyle="#c0d674";x.fillRect(px,h-35-bh,Math.max(8,bw-16),bh);x.fillStyle="#e8e8e8";x.save();x.translate(px+5,h-15);x.rotate(-.45);x.fillText(v.name.slice(0,18),0,0);x.restore();x.fillText(`${v.pct.toFixed(0)}%`,px,h-42-bh)})}
$("scenario").onclick=()=>{
 const g=goals.find(x=>x.id===$("scenario-goal").value)||goals[0];if(!g){$("scenario-output").textContent="Add a goal first.";return}
 const monthly=Math.max(0,+$("monthly").value||0),growth=(+$("growth").value||0)/100/12,months=Math.max(1,Math.min(600,+$("months").value||60));let v=g.current,rows=[];
 for(let i=1;i<=months;i++){v=v*(1+growth)+monthly;if(i%12===0||i===months)rows.push({month:i,value:+v.toFixed(2),percentOfGoal:+Math.min(100,v/g.target*100).toFixed(2)})}
 $("scenario-output").textContent=JSON.stringify({goal:g.name,start:g.current,monthlyContribution:monthly,illustrativeAnnualGrowthPct:(+$("growth").value||0),months,rows,note:"illustrative arithmetic scenario; not an investment forecast"},null,2)
};
function refreshScenarioGoals(){const s=$("scenario-goal");s.replaceChildren();goals.forEach(g=>{const o=document.createElement("option");o.value=g.id;o.textContent=g.name;s.append(o)})}
const oldRender=render;render=function(){oldRender();refreshScenarioGoals()};
function dl(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-json").onclick=()=>dl(JSON.stringify({schema:"zzx.trustfun.workspace.v1",exported:new Date().toISOString(),settings,goals,contributions:contribs,liveMarketData:false,trading:false},null,2),"trustfun-workspace.json");
$("export-csv").onclick=()=>{const esc=s=>`"${String(s??"").replace(/"/g,'""')}"`,rows=[["goal","target","current","currency","due","priority","allocation_pct","bitcoin_denom"],...goals.map(g=>[g.name,g.target,g.current,g.currency,g.due,g.priority,g.allocationPct,g.bitcoinDenominated])];dl(rows.map(r=>r.map(esc).join(",")).join("\n"),"trustfun-goals.csv","text/csv")};
$("contrib-at").value=new Date().toISOString().slice(0,10);load();window.TrustFun=Object.freeze({version:"0.1.0-alpha-web",liveMarketData:false,trading:false});
})();
