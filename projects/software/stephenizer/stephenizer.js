(()=>{"use strict";const $=id=>document.getElementById(id);let voices=[],job=null;
function load(){voices=speechSynthesis.getVoices();const s=$("voice");s.replaceChildren();voices.forEach((v,i)=>{const o=document.createElement("option");o.value=i;o.textContent=`${v.name} — ${v.lang}`;s.append(o)});$("voice-count").textContent=voices.length}
speechSynthesis.onvoiceschanged=load;load();
function params(){return{rate:+$("rate").value,pitch:+$("pitch").value,volume:+$("volume").value,tone:+$("tone").value,formant:+$("formant").value,robot:+$("robot").value}}
function update(){const p=params();$("rate-v").textContent=p.rate.toFixed(2);$("pitch-v").textContent=p.pitch.toFixed(2);$("tone-v").textContent=p.tone.toFixed(0);$("formant-v").textContent=p.formant.toFixed(0);$("robot-v").textContent=p.robot.toFixed(0);$("meter").style.width=(p.robot*100)+"%"}
["rate","pitch","volume","tone","formant","robot"].forEach(id=>$(id).oninput=update);update();
$("speak").onclick=()=>{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance($("text").value),v=voices[+$("voice").value],p=params();if(v)u.voice=v;u.rate=p.rate;u.pitch=p.pitch;u.volume=p.volume;u.onstart=()=>$("state").textContent="SPEAKING";u.onend=()=>$("state").textContent="IDLE";speechSynthesis.speak(u)};
$("stop").onclick=()=>{speechSynthesis.cancel();$("state").textContent="IDLE"};
$("build").onclick=()=>{job={schema:"zzx.stephenizer.fx-job.v1",created:new Date().toISOString(),text:$("text").value,voice:voices[+$("voice").value]?.name||null,params:params(),nativeChain:["pyttsx3 TTS","high-pass / band-pass shaping","formant shift","soft clipping","optional ring-mod/electrolarynx texture"],identityClone:false,impersonation:false};$("output").textContent=JSON.stringify(job,null,2)};
$("export").onclick=()=>{if(!job)$("build").click();const t=JSON.stringify(job,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="stephenizer-fx-job.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.Stephenizer=Object.freeze({version:"0.1.0-alpha-web",voiceCloning:false});
})();
