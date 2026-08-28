(()=>{"use strict";
const $=id=>document.getElementById(id);let alarms=[],url=null,tick=null;
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
function save(){localStorage.setItem("zzx.vlc-alarmclock.v1",JSON.stringify(alarms))}
function load(){try{const x=JSON.parse(localStorage.getItem("zzx.vlc-alarmclock.v1")||"[]");alarms=Array.isArray(x)?x:[]}catch{alarms=[]}render()}
function nextFor(a,now=new Date()){
 if(!a.enabled)return null;
 if(a.type==="once"){const d=new Date(a.when);return d>now?d:null}
 const [hh,mm]=a.time.split(":").map(Number);let d=new Date(now);d.setHours(hh,mm,0,0);
 const day=now.getDay();
 if(a.type==="daily"){if(d<=now)d.setDate(d.getDate()+1);return d}
 const days=a.days||[];
 for(let i=0;i<8;i++){const c=new Date(d);c.setDate(d.getDate()+i);if(days.includes(c.getDay())&&c>now)return c}
 return null
}
function add(){
 const a={id:uid(),name:$("name").value.trim()||"VLC Alarm",type:$("type").value,when:$("when").value,time:$("time").value||"07:00",days:[...document.querySelectorAll("[data-day]:checked")].map(x=>+x.dataset.day),media:$("media-path").value.trim(),profile:$("profile").value,fadeSeconds:Math.max(0,+$("fade").value||0),repeatCount:Math.max(1,+$("repeat").value||1),volume:Math.max(0,Math.min(100,+$("volume").value||100)),enabled:true,created:new Date().toISOString()};
 alarms.push(a);save();render()
}
$("add").onclick=add;
function render(){
 const e=$("alarms");e.replaceChildren();let soon=null;
 alarms.forEach(a=>{const n=nextFor(a),d=document.createElement("div");d.className="alarm-row";d.innerHTML=`<strong>${a.enabled?"ON":"OFF"} · ${a.name}</strong><div>${n?`next ${n.toLocaleString()}`:"no pending trigger"}</div><div class="fx-watermark">${a.profile} · volume ${a.volume}% · fade ${a.fadeSeconds}s · repeat ${a.repeatCount} · ${a.media||"media selected in native app"}</div><button class="btn ghost" data-toggle="${a.id}">${a.enabled?"DISABLE":"ENABLE"}</button> <button class="btn ghost" data-del="${a.id}">DELETE</button>`;e.append(d);if(n&&(!soon||n<soon))soon=n});
 e.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const a=alarms.find(x=>x.id===b.dataset.toggle);a.enabled=!a.enabled;save();render()});
 e.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{alarms=alarms.filter(x=>x.id!==b.dataset.del);save();render()});
 $("count").textContent=alarms.length;$("enabled").textContent=alarms.filter(a=>a.enabled).length;$("next").textContent=soon?soon.toLocaleString():"—"
}
function clock(){
 const now=new Date();$("clock").textContent=now.toLocaleTimeString();
 const next=alarms.map(a=>nextFor(a,now)).filter(Boolean).sort((a,b)=>a-b)[0];
 if(next){const s=Math.max(0,Math.floor((next-now)/1000));$("countdown").textContent=`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m ${s%60}s`}else $("countdown").textContent="No pending alarm"
}
setInterval(clock,500);clock();
$("preview-file").onchange=()=>{const f=$("preview-file").files[0];if(!f)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);$("preview").src=url;$("media-path").value=f.name;$("preview-file").value=""};
$("test").onclick=async()=>{const v=$("preview");if(!v.src){$("status").textContent="Load a local media file for browser test playback.";return}v.volume=Math.max(0,Math.min(1,(+$("volume").value||100)/100));await v.play();$("status").textContent="Browser test playback started. Native VLC scheduling is handled by the included helper."};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.vlc-alarmclock.config.v1",exported:new Date().toISOString(),alarms},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="vlc-alarmclock.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("when").value=new Date(Date.now()+3600000).toISOString().slice(0,16);load();window.VLCAlarmClock=Object.freeze({version:"0.3.0-alpha-web"});
})();
