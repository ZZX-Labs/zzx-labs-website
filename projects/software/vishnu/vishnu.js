(()=>{"use strict";
const $=id=>document.getElementById(id),audioEl=$("audio"),c=$("canvas"),x=c.getContext("2d");
let ctx=null,source=null,analyser=null,dataFreq=null,dataTime=null,url=null,raf=null,vlcMeta={};
function setup(){
 if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();source=ctx.createMediaElementSource(audioEl);analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.72;source.connect(analyser).connect(ctx.destination);dataFreq=new Uint8Array(analyser.frequencyBinCount);dataTime=new Uint8Array(analyser.fftSize)
}
$("file").onchange=()=>{const f=$("file").files[0];if(!f)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);audioEl.src=url;$("track").value=f.name;$("source-name").textContent=f.name;$("file").value=""};
$("play").onclick=async()=>{setup();await ctx.resume();await audioEl.play();draw()};
$("pause").onclick=()=>audioEl.pause();
function stats(){
 analyser.getByteFrequencyData(dataFreq);analyser.getByteTimeDomainData(dataTime);
 let rms=0,peak=0,centNum=0,centDen=0;for(let i=0;i<dataTime.length;i++){const v=(dataTime[i]-128)/128;rms+=v*v;peak=Math.max(peak,Math.abs(v))}
 for(let i=0;i<dataFreq.length;i++){centNum+=i*dataFreq[i];centDen+=dataFreq[i]}rms=Math.sqrt(rms/dataTime.length);const centroid=centDen?centNum/centDen*(ctx.sampleRate/2/dataFreq.length):0;
 $("rms").textContent=rms.toFixed(3);$("peak").textContent=peak.toFixed(3);$("centroid").textContent=Math.round(centroid)+" Hz";return{rms,peak,centroid}
}
function draw(){
 if(!analyser)return;cancelAnimationFrame(raf);const loop=()=>{const mode=$("mode").value,w=c.width,h=c.height;x.fillStyle="#030305";x.fillRect(0,0,w,h);analyser.getByteFrequencyData(dataFreq);analyser.getByteTimeDomainData(dataTime);
 if(mode==="bars"){const n=96,bw=w/n;x.fillStyle="#c0d674";for(let i=0;i<n;i++){const v=dataFreq[Math.floor(i*dataFreq.length/n)]/255,bh=v*(h-30);x.fillRect(i*bw,h-bh,bw*.76,bh)}}
 else if(mode==="wave"){x.strokeStyle="#c0d674";x.lineWidth=2;x.beginPath();for(let i=0;i<dataTime.length;i++){const px=i/(dataTime.length-1)*w,py=(dataTime[i]/255)*h;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}
 else if(mode==="radial"){x.save();x.translate(w/2,h/2);const n=180;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,v=dataFreq[Math.floor(i*dataFreq.length/n)]/255,r=80+v*230;x.strokeStyle=i%2?"#c0d674":"#e6a42b";x.globalAlpha=.25+v*.65;x.beginPath();x.moveTo(Math.cos(a)*70,Math.sin(a)*70);x.lineTo(Math.cos(a)*r,Math.sin(a)*r);x.stroke()}x.restore();x.globalAlpha=1}
 else{x.strokeStyle="#8fb9b2";x.lineWidth=1.5;x.beginPath();const N=Math.min(1024,dataTime.length);for(let i=0;i<N;i++){const a=i/N*Math.PI*2,v=(dataTime[i]-128)/128,r=150+v*120,px=w/2+Math.cos(a*3)*r,py=h/2+Math.sin(a*2)*r;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}
 stats();$("position").textContent=(audioEl.currentTime||0).toFixed(1)+" s";raf=requestAnimationFrame(loop)};loop()
}
$("snapshot").onclick=()=>{const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="vishnu-visualizer.png";a.click()};
$("vlc-status").onchange=async()=>{const f=$("vlc-status").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),info=j.information||j,cat=info.category||{},meta=cat.meta||j.meta||{};vlcMeta={title:meta.title||meta.filename||j.title||"",artist:meta.artist||"",album:meta.album||"",state:j.state||"",position:j.time??j.position??null,length:j.length??null};$("track").value=vlcMeta.title||$("track").value;$("artist").value=vlcMeta.artist;$("album").value=vlcMeta.album;$("vlc-output").textContent=JSON.stringify(vlcMeta,null,2)}catch(e){$("vlc-output").textContent="IMPORT ERROR: "+e.message}$("vlc-status").value=""};
$("adapter").onclick=()=>{const cfg={schema:"zzx.vishnu.vlc-adapter.v1",vlcHttp:"http://127.0.0.1:8080/requests/status.json",credentials:"supply externally in native deployment",pollMs:500,visualizerPreset:$("mode").value,metadata:{title:$("track").value,artist:$("artist").value,album:$("album").value}};const t=JSON.stringify(cfg,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="vishnu-vlc-adapter.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
window.Vishnu=Object.freeze({version:"0.2.0-alpha-web",liveVLC:false});
})();
