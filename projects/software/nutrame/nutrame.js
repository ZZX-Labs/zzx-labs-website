(()=>{"use strict";
const $=id=>document.getElementById(id);
let ledger=[],supplements=[],photoURL=null;
function today(){return new Date().toISOString().slice(0,10)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function num(id){return Math.max(0,+$(id).value||0)}
function addMeal(){
 const r={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),date:$("date").value||today(),time:$("time").value||"",meal:$("meal").value,name:$("food").value.trim(),servings:Math.max(.01,+$("servings").value||1),calories:num("calories"),protein:num("protein"),carbs:num("carbs"),fat:num("fat"),sugar:num("sugar"),fiber:num("fiber"),sodium:num("sodium"),notes:$("notes").value.trim(),labelPhoto:$("photo").files[0]?.name||null};
 if(!r.name){$("entry-output").textContent="Enter a food/item name.";return}
 ledger.push(r);render();$("entry-output").textContent=JSON.stringify(r,null,2)
}
function totalFor(date){
 const rows=ledger.filter(x=>x.date===date);const sums={calories:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0,sodium:0};
 for(const r of rows)for(const k of Object.keys(sums))sums[k]+=r[k]*r.servings;
 return{rows,sums}
}
function render(){
 const tb=$("ledger-body");tb.replaceChildren();
 ledger.slice().reverse().forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${r.date}</td><td>${esc(r.meal)}</td><td>${esc(r.name)}</td><td>${(r.calories*r.servings).toFixed(0)}</td><td>${(r.protein*r.servings).toFixed(1)}</td><td>${(r.carbs*r.servings).toFixed(1)}</td><td>${(r.fat*r.servings).toFixed(1)}</td><td>${(r.sugar*r.servings).toFixed(1)}</td>`;tb.append(tr)});
 const d=$("summary-date").value||today(),{rows,sums}=totalFor(d);
 $("entries").textContent=ledger.length;$("days").textContent=new Set(ledger.map(x=>x.date)).size;$("today-cal").textContent=sums.calories.toFixed(0);$("supp-count").textContent=supplements.length;
 $("summary-output").textContent=JSON.stringify({date:d,entries:rows.length,totals:sums},null,2);drawBars(sums)
}
function drawBars(s){
 const target={calories:2000,protein:100,carbs:250,fat:70};
 const e=$("bars");e.replaceChildren();for(const k of ["calories","protein","carbs","fat"]){const pct=Math.min(1.5,s[k]/target[k]),d=document.createElement("div");d.className="nutra-bar";d.innerHTML=`<span>${k}</span><span><i style="width:${Math.min(100,pct*100)}%"></i></span><strong>${s[k].toFixed(1)}</strong>`;e.append(d)}
}
$("add-meal").onclick=addMeal;
$("summary-date").onchange=render;
$("photo").onchange=()=>{if(photoURL)URL.revokeObjectURL(photoURL);const f=$("photo").files[0];if(!f){$("photo-preview").hidden=true;return}photoURL=URL.createObjectURL(f);$("photo-preview").src=photoURL;$("photo-preview").hidden=false;$("photo-note").textContent="Photo remains local. Enter nutrition values manually in this browser build; native vision/OCR can be added separately."};
$("add-supp").onclick=()=>{const x={id:Math.random().toString(36).slice(2),date:$("supp-date").value||today(),name:$("supp-name").value.trim(),amount:$("supp-amount").value.trim(),notes:$("supp-notes").value.trim()};if(!x.name)return;supplements.push(x);$("supp-output").textContent=JSON.stringify(supplements,null,2);render()};
function download(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-json").onclick=()=>download(JSON.stringify({schema:"zzx.nutrame.ledger.v1",exported:new Date().toISOString(),ledger,supplements},null,2),"nutrame-ledger.json");
$("export-csv").onclick=()=>{const head=["date","time","meal","name","servings","calories","protein","carbs","fat","sugar","fiber","sodium","notes"],rows=[head,...ledger.map(r=>head.map(k=>r[k]??""))],csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");download(csv,"nutrame-ledger.csv","text/csv")};
$("date").value=today();$("summary-date").value=today();$("supp-date").value=today();render();
window.NutraMe=Object.freeze({version:"0.1.0-alpha-web",localOnly:true});
})();
