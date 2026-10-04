(()=>{"use strict";
const $=id=>document.getElementById(id);let shifts=[],active=null;
function now(){return new Date()}
function stamp(d){return d.toISOString()}
function render(){const e=$("history");e.replaceChildren();shifts.slice().reverse().forEach(s=>{const d=document.createElement("div");d.className="shift-chip";const mins=s.end?Math.max(0,(new Date(s.end)-new Date(s.start))/60000):Math.max(0,(Date.now()-new Date(s.start))/60000);d.innerHTML=`<strong>${s.project||"Shift"}</strong><div class="fx-watermark">${new Date(s.start).toLocaleString()} · ${s.end?new Date(s.end).toLocaleString():"RUNNING"} · ${(mins/60).toFixed(2)} h</div>`;e.append(d)});$("count").textContent=shifts.length;$("state").textContent=active?"CLOCKED IN":"CLOCKED OUT"}
$("clock-in").onclick=()=>{if(active)return;active={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),project:$("project").value.trim(),notes:$("notes").value.trim(),start:stamp(now()),end:null};shifts.push(active);render()};
$("clock-out").onclick=()=>{if(!active)return;active.end=stamp(now());active=null;render()};
$("manual").onclick=()=>{const s={id:Math.random().toString(36).slice(2),project:$("manual-project").value.trim(),notes:"manual mobile entry",start:new Date($("manual-start").value).toISOString(),end:new Date($("manual-end").value).toISOString()};if(!Number.isFinite(new Date(s.start).getTime())||!Number.isFinite(new Date(s.end).getTime()))return;shifts.push(s);render()};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.pytimecard.mobile.v1",exported:new Date().toISOString(),shifts,apkIncluded:false},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="pytimecard-mobile-export.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();window.PyTimecardAPK=Object.freeze({version:"0.9.0-beta-web",apkIncluded:false});
})();
