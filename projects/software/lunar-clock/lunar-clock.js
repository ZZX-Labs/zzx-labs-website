(()=>{"use strict";
const $=id=>document.getElementById(id),LC=LunarClockCore;
let timer=null,last=null;
function fmt(n,d=3){return Number(n).toFixed(d)}
function render(){
 const d=$("clock-time").value?new Date($("clock-time").value):new Date();
 if(Number.isNaN(d.getTime()))return;
 last=LC.calc(d);
 $("phase-name").textContent=last.phaseName;
 $("age").textContent=fmt(last.ageDays,5)+" d";
 $("illum").textContent=fmt(last.illumination*100,2)+"%";
 $("julian").textContent=fmt(last.julianDate,5);
 $("lunation").textContent=last.lunation;
 $("next-new").textContent=LC.nextByDays(d,last.daysToNextNew).toISOString();
 $("next-quarter").textContent=`${last.nextQuarterName} · ${LC.nextByDays(d,last.daysToNextQuarter).toISOString()}`;
 $("nodal").textContent=`${fmt(last.nodalAngleDeg,2)}° · ${last.standstillModel}`;
 $("eclipse").textContent=`${fmt(last.eclipseSeasonDistanceDays,2)} d from modeled season center${last.eclipseSeasonNear?" · NEAR SEASON":""}`;
 const f=last.phaseFraction;
 const sh=$("lunar-shadow");
 const waxing=f<.5;
 const p=waxing?f*2:(f-.5)*2;
 const x=(waxing?1:-1)*(1-p)*100;
 sh.style.transform=`translateX(${x}%)`;
 $("details-output").textContent=JSON.stringify(last,null,2);
 draw();
}
function draw(){
 const c=$("cycle-canvas"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);
 x.strokeStyle="#343434";x.beginPath();x.moveTo(40,h/2);x.lineTo(w-40,h/2);x.stroke();
 const labels=["New","1Q","Full","3Q","New"];
 for(let i=0;i<5;i++){const px=40+i*(w-80)/4;x.fillStyle="#e6a42b";x.beginPath();x.arc(px,h/2,7,0,Math.PI*2);x.fill();x.fillStyle="#e8e8e8";x.font="12px monospace";x.textAlign="center";x.fillText(labels[i],px,h/2+28)}
 if(last){const px=40+last.phaseFraction*(w-80);x.fillStyle="#c0d674";x.beginPath();x.arc(px,h/2,12,0,Math.PI*2);x.fill()}
}
$("set-now").onclick=()=>{$("clock-time").value=new Date().toISOString().slice(0,16);render()};
$("clock-time").onchange=render;
$("live-toggle").onclick=()=>{
 if(timer){clearInterval(timer);timer=null;$("live-toggle").textContent="START LIVE CLOCK"}
 else{timer=setInterval(()=>{$("clock-time").value=new Date().toISOString().slice(0,16);render()},1000);$("live-toggle").textContent="STOP LIVE CLOCK"}
};
$("export-lunar").onclick=()=>{const t=JSON.stringify({schema:"zzx.lunar-clock.snapshot.v1",model:"browser-approximation",data:last},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="lunar-clock-snapshot.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("set-now").click();
window.LunarClock=Object.freeze({version:"0.1.0-web",model:"approximate browser ephemeris"});
})();
