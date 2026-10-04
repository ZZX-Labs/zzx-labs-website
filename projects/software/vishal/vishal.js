(()=>{"use strict";
const $=id=>document.getElementById(id),c=$("canvas"),x=c.getContext("2d");
let phases=[],session=null,phaseIndex=0,phaseStarted=0,remaining=0,timer=null,raf=null,audio=null,noise=null,osc=null,gain=null,noiseGain=null;
function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}
function ensureAudio(){
 if(audio)return;audio=new (window.AudioContext||window.webkitAudioContext)();
 osc=audio.createOscillator();osc.type="sine";osc.frequency.value=110;gain=audio.createGain();gain.gain.value=0;osc.connect(gain).connect(audio.destination);osc.start();
 const len=audio.sampleRate*2,buf=audio.createBuffer(1,len,audio.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
 noise=audio.createBufferSource();noise.buffer=buf;noise.loop=true;const filter=audio.createBiquadFilter();filter.type="lowpass";filter.frequency.value=1200;noiseGain=audio.createGain();noiseGain.gain.value=0;noise.connect(filter).connect(noiseGain).connect(audio.destination);noise.start()
}
function addPhase(name,duration,visual,sound,intensity=.5){phases.push({id:uid(),name,durationMinutes:duration,visual,sound,intensity});renderPhases()}
$("add").onclick=()=>addPhase($("phase-name").value.trim()||`Phase ${phases.length+1}`,Math.max(.1,+$("duration").value||5),$("visual").value,$("sound").value,+$("intensity").value);
$("preset").onclick=()=>{phases=[];addPhase("Settle",3,"breath","drone",.25);addPhase("Open",7,"aurora","rain",.35);addPhase("Quiet",10,"mandala","drone",.18);addPhase("Return",3,"breath","silence",.15)};
function renderPhases(){const e=$("phases");e.replaceChildren();phases.forEach((p,i)=>{const d=document.createElement("div");d.className="vi-phase";d.innerHTML=`<strong>${i+1}. ${p.name}</strong> · ${p.durationMinutes} min<div class="fx-watermark">${p.visual} · ${p.sound} · intensity ${p.intensity.toFixed(2)}</div><button class="btn ghost" data-id="${p.id}">REMOVE</button>`;e.append(d)});e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{phases=phases.filter(p=>p.id!==b.dataset.id);renderPhases()});$("phase-count").textContent=phases.length;$("minutes").textContent=phases.reduce((s,p)=>s+p.durationMinutes,0).toFixed(1)}
function soundFor(p){ensureAudio();const i=Math.max(0,Math.min(1,p?.intensity||0));gain.gain.setTargetAtTime(p?.sound==="drone"?i*.09:0,audio.currentTime,.25);noiseGain.gain.setTargetAtTime(p?.sound==="rain"?i*.11:0,audio.currentTime,.25);osc.frequency.setTargetAtTime(92+i*92,audio.currentTime,.2)}
function start(){if(!phases.length)$("preset").click();ensureAudio();audio.resume();phaseIndex=0;startPhase();clearInterval(timer);timer=setInterval(tick,250);cancelAnimationFrame(raf);draw()}
function startPhase(){if(phaseIndex>=phases.length){finish();return}const p=phases[phaseIndex];phaseStarted=performance.now();remaining=p.durationMinutes*60;soundFor(p);$("current").textContent=p.name;$("state").textContent="RUNNING";tick()}
function tick(){if(phaseIndex>=phases.length)return;const p=phases[phaseIndex],elapsed=(performance.now()-phaseStarted)/1000;remaining=Math.max(0,p.durationMinutes*60-elapsed);$("timer").textContent=`${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(Math.floor(remaining%60)).padStart(2,"0")}`;if(remaining<=0){phaseIndex++;startPhase()}}
function finish(){clearInterval(timer);timer=null;$("state").textContent="COMPLETE";$("current").textContent="—";$("timer").textContent="00:00";if(audio){gain.gain.setTargetAtTime(0,audio.currentTime,.3);noiseGain.gain.setTargetAtTime(0,audio.currentTime,.3)}}
$("start").onclick=start;$("stop").onclick=finish;
function draw(){
 const t=performance.now()/1000,p=phases[phaseIndex]||{visual:$("visual").value,intensity:+$("intensity").value},mode=p.visual,intensity=p.intensity||.5,w=c.width,h=c.height;x.fillStyle="#05070a";x.fillRect(0,0,w,h);
 if(mode==="breath"){const r=70+Math.sin(t*.45)*45;x.strokeStyle="#c0d674";x.lineWidth=3;x.beginPath();x.arc(w/2,h/2,r,0,Math.PI*2);x.stroke();x.globalAlpha=.12;x.fillStyle="#c0d674";x.beginPath();x.arc(w/2,h/2,r,0,Math.PI*2);x.fill();x.globalAlpha=1}
 else if(mode==="mandala"){x.save();x.translate(w/2,h/2);for(let ring=1;ring<=7;ring++){const n=6+ring*2,r=ring*38;for(let i=0;i<n;i++){const a=i/n*Math.PI*2+t*.03*(ring%2?1:-1);x.strokeStyle=ring%2?"#c0d674":"#e6a42b";x.globalAlpha=.2+intensity*.55;x.beginPath();x.arc(Math.cos(a)*r,Math.sin(a)*r,8+6*Math.sin(t+a),0,Math.PI*2);x.stroke()}}x.restore();x.globalAlpha=1}
 else if(mode==="aurora"){for(let j=0;j<7;j++){x.strokeStyle=j%2?"#c0d674":"#8fb9b2";x.globalAlpha=.12+intensity*.22;x.lineWidth=18;x.beginPath();for(let i=0;i<=80;i++){const px=i/80*w,py=h*(.25+j*.08)+Math.sin(i*.18+t*.3+j)*35+Math.sin(i*.07-t*.2)*25;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}x.globalAlpha=1}
 else{for(let i=0;i<120;i++){const px=(i*97+t*35)%w,py=(i*53+t*(15+i%5))%h;x.fillStyle="#8fb9b2";x.globalAlpha=.18+intensity*.35;x.fillRect(px,py,1,7+i%9)}x.globalAlpha=1}
 raf=requestAnimationFrame(draw)
}
$("snapshot").onclick=()=>{const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="vishal-visual.png";a.click()};
$("export").onclick=()=>{session={schema:"zzx.vishal.session.v1",name:$("session-name").value.trim(),created:new Date().toISOString(),phases,generatedAudio:"Web Audio oscillator/noise",medicalClaim:false};const t=JSON.stringify(session,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="vishal-session.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("preset").click();draw();window.Vishal=Object.freeze({version:"0.2.0-alpha-web",medicalClaim:false});
})();
