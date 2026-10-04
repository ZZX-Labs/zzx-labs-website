(()=>{"use strict";
const $=id=>document.getElementById(id);
let last=null;
function calc(){
 const btc=Math.max(0,+$("btc").value||0),pop=Math.max(1,+$("population").value||1),lost=Math.max(0,Math.min(100,+$("lost").value||0))/100,
 effective=btc*(1-lost),sats=effective*100000000,per=sats/pop,bp=1/pop*100;
 last={schema:"zzx.spp.snapshot.v1",computed:new Date().toISOString(),bitcoinSupplyBTC:btc,population:pop,assumedLostPercent:lost*100,effectiveBTC:effective,satoshisPerPerson:per,btcPerPerson:effective/pop,shareOfPopulationPercent:bp,liveData:false,source:"operator-entered values"};
 $("sats").textContent=per.toLocaleString(undefined,{maximumFractionDigits:2});$("btc-person").textContent=(effective/pop).toFixed(8);$("effective").textContent=effective.toLocaleString(undefined,{maximumFractionDigits:4});$("pop").textContent=pop.toLocaleString();
 $("output").textContent=JSON.stringify(last,null,2);draw()
}
function draw(){
 const c=$("chart"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle="#050505";x.fillRect(0,0,w,h);
 const start=Math.max(2009,+$("start-year").value||2009),end=Math.max(start,+$("end-year").value||2040),n=end-start+1,baseSupply=Math.max(0,+$("btc").value||0),basePop=Math.max(1,+$("population").value||1),growth=(+$("pop-growth").value||0)/100,lost=Math.max(0,Math.min(100,+$("lost").value||0))/100;
 let vals=[];for(let y=start;y<=end;y++){const dy=y-new Date().getFullYear(),p=basePop*Math.pow(1+growth,dy),halvings=Math.max(0,Math.floor((y-2009)/4)),issuance=Math.min(21000000,21000000*(1-Math.pow(.5,halvings+1))),supply=y<=new Date().getFullYear()?baseSupply:Math.max(baseSupply,issuance),v=supply*(1-lost)*1e8/p;vals.push({y,v})}
 const max=Math.max(...vals.map(v=>v.v),1),min=Math.min(...vals.map(v=>v.v),0);x.strokeStyle="#343434";for(let i=0;i<=6;i++){const yy=30+i*(h-60)/6;x.beginPath();x.moveTo(45,yy);x.lineTo(w-20,yy);x.stroke()}
 x.strokeStyle="#c0d674";x.lineWidth=2;x.beginPath();vals.forEach((p,i)=>{const px=45+i*(w-70)/Math.max(1,n-1),py=h-30-(p.v-min)/(max-min||1)*(h-60);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
 x.fillStyle="#e8e8e8";x.font="12px monospace";x.fillText(`${start}`,45,h-10);x.fillText(`${end}`,w-60,h-10);x.fillText(`${Math.round(max).toLocaleString()} sats/person`,50,20)
}
$("calc").onclick=calc;["btc","population","lost","start-year","end-year","pop-growth"].forEach(id=>$(id).oninput=calc);
$("export").onclick=()=>{if(!last)calc();const t=JSON.stringify(last,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="satperperson-snapshot.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("btc").value="19800000";$("population").value="8300000000";$("start-year").value="2026";$("end-year").value="2040";$("pop-growth").value=".8";calc();window.satperPerson=Object.freeze({version:"0.2.0-alpha-web",liveData:false});
})();
