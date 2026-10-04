(()=>{"use strict";const $=id=>document.getElementById(id);
let ctx=null,stream=null,src=null,pre=null,f1=null,f2=null,f3=null,lp=null,comp=null,drive=null,master=null,analyser=null,meterData=null,rec=null,chunks=[];
const presets={
 "wendel-like":{f1:520,f2:1450,f3:2450,q:5.0,lp:5400,drive:12,comp:4,wet:.78},
 "nasal-cartoon":{f1:720,f2:1850,f3:2800,q:7.0,lp:6200,drive:8,comp:3,wet:.9},
 "dry-radio":{f1:400,f2:1200,f3:2300,q:3.5,lp:3900,drive:18,comp:6,wet:.68},
 "wide-clean":{f1:350,f2:1600,f3:3200,q:2.5,lp:9000,drive:3,comp:2,wet:.5}
};
function curve(amount){const n=65536,c=new Float32Array(n),k=Math.max(0,+amount||0);for(let i=0;i<n;i++){const x=i*2/n-1;c[i]=(1+k)*x/(1+k*Math.abs(x))}return c}
async function start(){
 if(stream)return;stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
 ctx=new (window.AudioContext||window.webkitAudioContext)();src=ctx.createMediaStreamSource(stream);pre=ctx.createGain();f1=ctx.createBiquadFilter();f2=ctx.createBiquadFilter();f3=ctx.createBiquadFilter();lp=ctx.createBiquadFilter();comp=ctx.createDynamicsCompressor();drive=ctx.createWaveShaper();master=ctx.createGain();analyser=ctx.createAnalyser();meterData=new Uint8Array(analyser.fftSize);
 [f1,f2,f3].forEach(f=>f.type="peaking");lp.type="lowpass";
 src.connect(pre).connect(f1).connect(f2).connect(f3).connect(lp).connect(comp).connect(drive).connect(master).connect(analyser).connect(ctx.destination);
 apply();meter();$("state").textContent="LIVE"
}
function apply(){
 const p=presets[$("preset").value]||presets["wendel-like"];
 if(!ctx)return;pre.gain.value=+$("input").value;[[f1,p.f1],[f2,p.f2],[f3,p.f3]].forEach(([f,base],i)=>{f.frequency.value=base*(+$("formant").value);f.Q.value=+$("q").value;f.gain.value=[+$("g1").value,+$("g2").value,+$("g3").value][i]});lp.frequency.value=+$("lp").value;comp.ratio.value=+$("comp").value;drive.curve=curve(+$("drive").value/8);drive.oversample="4x";master.gain.value=+$("output").value
}
function loadPreset(){
 const p=presets[$("preset").value];$("formant").value=1;$("q").value=p.q;$("lp").value=p.lp;$("drive").value=p.drive;$("comp").value=p.comp;$("g1").value=7;$("g2").value=11;$("g3").value=5;apply();renderChain()
}
function renderChain(){$("chain").innerHTML=`<span>preamp ${$("input").value}</span><span>F1 ${Math.round((presets[$("preset").value]?.f1||520)*+$("formant").value)}Hz</span><span>F2 ${Math.round((presets[$("preset").value]?.f2||1450)*+$("formant").value)}Hz</span><span>F3 ${Math.round((presets[$("preset").value]?.f3||2450)*+$("formant").value)}Hz</span><span>LP ${$("lp").value}Hz</span><span>drive ${$("drive").value}</span><span>compress ${$("comp").value}:1</span>`}
["input","formant","q","g1","g2","g3","lp","drive","comp","output"].forEach(id=>$(id).oninput=()=>{apply();renderChain()});$("preset").onchange=loadPreset;
function meter(){if(!analyser)return;analyser.getByteTimeDomainData(meterData);let p=0;for(const b of meterData)p=Math.max(p,Math.abs(b-128)/128);$("meter").style.width=Math.min(100,p*100)+"%";$("peak").textContent=p.toFixed(3);requestAnimationFrame(meter)}
$("start").onclick=()=>start().catch(e=>$("state").textContent="MIC ERROR: "+e.message);
$("stop").onclick=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;ctx?.close();ctx=null;$("state").textContent="STOPPED"};
$("record").onclick=async()=>{if(!stream)await start();chunks=[];rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=()=>{const b=new Blob(chunks,{type:rec.mimeType||"audio/webm"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="wendelizer-mic-input.webm";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};rec.start();$("rec-state").textContent="RECORDING"};
$("record-stop").onclick=()=>{if(rec&&rec.state!=="inactive")rec.stop();$("rec-state").textContent="IDLE"};
$("export").onclick=()=>{const p=presets[$("preset").value],job={schema:"zzx.wendelizer.fx.v1",created:new Date().toISOString(),stylePreset:$("preset").value,specificIdentityClone:false,parameters:{inputGain:+$("input").value,formantScale:+$("formant").value,Q:+$("q").value,formantHz:[p.f1,p.f2,p.f3],formantGains:[+$("g1").value,+$("g2").value,+$("g3").value],lowpassHz:+$("lp").value,drive:+$("drive").value,compressorRatio:+$("comp").value,outputGain:+$("output").value}};const t=JSON.stringify(job,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="wendelizer-fx.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
loadPreset();window.Wendelizer=Object.freeze({version:"0.3.0-alpha-web",identityClone:false});
})();
