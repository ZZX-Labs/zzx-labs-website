(()=>{"use strict";const $=id=>document.getElementById(id);let timer=null,started=0,phase=0,session=null,audio=null,osc=null,gain=null;
const patterns={balanced:[4,4,6,2],calm:[4,2,6,2],box:[4,4,4,4],natural:[5,0,5,0]};
function tone(freq,dur=.12){if(!$("tone").checked)return;audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g).connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.stop(audio.currentTime+dur)}
function start(){
 const mins=Math.max(.1,+$("minutes").value||10),pat=patterns[$("breath").value],labels=["INHALE","HOLD","EXHALE","REST"];
 started=performance.now();phase=0;$("state").textContent="RUNNING";clearInterval(timer);
 let phaseStart=performance.now(),phaseDur=pat[phase]*1000;
 function step(){
   const elapsed=(performance.now()-started)/1000,remain=Math.max(0,mins*60-elapsed);$("time").textContent=`${String(Math.floor(remain/60)).padStart(2,"0")}:${String(Math.floor(remain%60)).padStart(2,"0")}`;
   if(remain<=0){stop("COMPLETE");return}
   const now=performance.now();if(pat[phase]===0||now-phaseStart>=phaseDur){do{phase=(phase+1)%4}while(pat[phase]===0);phaseStart=now;phaseDur=pat[phase]*1000;tone(phase===0?440:phase===2?330:220)}
   $("cue").textContent=labels[phase];$("phase-sec").textContent=Math.max(0,Math.ceil((phaseDur-(now-phaseStart))/1000))+"s";
 }
 step();timer=setInterval(step,100)
}
function stop(state="STOPPED"){clearInterval(timer);timer=null;$("state").textContent=state;$("cue").textContent="—"}
$("start").onclick=start;$("stop").onclick=()=>stop();
$("lap").onclick=()=>{const log=$("log"),d=document.createElement("div");d.className="hw-row";d.textContent=`${new Date().toLocaleTimeString()} · ${$("cue").textContent} · note: ${$("note").value.trim()}`;log.prepend(d)};
$("export").onclick=()=>{session={schema:"zzx.vmc.session.v1",created:new Date().toISOString(),durationMinutes:+$("minutes").value,breathPattern:$("breath").value,practice:$("practice").value,sensory:{tone:$("tone").checked,haptic:$("haptic").checked,led:$("led").checked},hardwareProfile:$("hardware").value,medicalClaim:false};const t=JSON.stringify(session,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="vmc-session.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("protocol").onclick=()=>{const p={schema:"zzx.vmc.serial.v1",baud:115200,messages:[{"cmd":"SESSION","minutes":20,"practice":"vipassana","breath":"natural"},{"cmd":"CUE","phase":"inhale","seconds":4},{"cmd":"OUTPUT","tone":true,"haptic":false,"led":"green"},{"event":"BUTTON","id":"A","action":"lap"},{"event":"SESSION_END","elapsed":1200}]};$("proto").textContent=JSON.stringify(p,null,2)};
window.VMC=Object.freeze({version:"0.1.0-alpha-web",medicalClaim:false});
})();
