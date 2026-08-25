(()=>{"use strict";
const $=id=>document.getElementById(id);
let running=false,timer=null,count=0,ctx=null,noise=null,master=null,session=null;
function intervalMs(){return 60000/Math.max(1,+$("tempo").value||60)*Math.max(1,+$("beats").value||4)}
function speak(){
 const text=$("mantra-text").value.trim();if(!text)return;
 count++;$("count").textContent=count;$("mantra-display").textContent=text;
 $("mantra-display").classList.remove("mantra-pulse");void $("mantra-display").offsetWidth;$("mantra-display").classList.add("mantra-pulse");
 if("speechSynthesis"in window&&$("tts-enable").checked){
   speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=Math.max(.1,Math.min(2,+$("speech-rate").value||1));u.pitch=Math.max(0,Math.min(2,+$("speech-pitch").value||1));speechSynthesis.speak(u);
 }
}
function schedule(){
 clearTimeout(timer);if(!running)return;speak();timer=setTimeout(schedule,intervalMs());
}
function start(){
 running=true;count=0;session={schema:"zzx.mantrabox.session.v1",started:new Date().toISOString(),mantra:$("mantra-text").value,tempo:+$("tempo").value,beats:+$("beats").value,tts:$("tts-enable").checked,soundscape:$("soundscape").value};schedule();$("run-state").textContent="RUNNING";
}
function stop(){running=false;clearTimeout(timer);timer=null;if("speechSynthesis"in window)speechSynthesis.cancel();$("run-state").textContent="STOPPED";if(session)session.ended=new Date().toISOString()}
function audio(){
 if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.07;master.connect(ctx.destination);
}
function setSound(){
 audio();if(noise){try{noise.stop()}catch{} noise.disconnect();noise=null}
 const mode=$("soundscape").value;if(mode==="none")return;
 if(mode==="drone"){const o=ctx.createOscillator();o.type="sine";o.frequency.value=136.1;o.connect(master);o.start();noise=o}
 else{const len=ctx.sampleRate*2,b=ctx.createBuffer(1,len,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*.22;const s=ctx.createBufferSource();s.buffer=b;s.loop=true;const f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=mode==="rain"?1200:600;s.connect(f);f.connect(master);s.start();noise=s}
}
$("start").onclick=start;$("stop").onclick=stop;$("speak-once").onclick=speak;$("soundscape").onchange=setSound;
$("export-session").onclick=()=>{const doc={...(session||{}),exported:new Date().toISOString(),count,settings:{mantra:$("mantra-text").value,tempo:+$("tempo").value,beats:+$("beats").value,speechRate:+$("speech-rate").value,speechPitch:+$("speech-pitch").value,soundscape:$("soundscape").value}},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mantrabox-session.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);$("session-output").textContent=t};
$("mantra-display").textContent=$("mantra-text").value;
window.MantraBox=Object.freeze({version:"0.1.0-alpha-web"});
})();
