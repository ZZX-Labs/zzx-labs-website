(()=>{"use strict";
const $=id=>document.getElementById(id);
let txs=[],selected=null;
function seeded(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function generate(){
 const r=seeded(+$("seed").value||42),n=Math.max(20,Math.min(2500,+$("count").value||420)),base=Math.max(1,+$("base-fee").value||8);
 txs=[];
 for(let i=0;i<n;i++){
  const vbytes=Math.round(110+Math.pow(r(),2)*2200),age=Math.round(r()*7200),tier=r();
  const rate=+(base+(tier<.55?r()*12:tier<.85?12+r()*30:42+r()*180)).toFixed(1);
  const fee=Math.round(rate*vbytes);
  txs.push({txid:Array.from({length:64},()=>Math.floor(r()*16).toString(16)).join(""),vbytes,ageSeconds:age,feeRate:rate,feeSats:fee,ancestorCount:Math.floor(r()*5),descendantCount:Math.floor(r()*4),propagation:+(.35+r()*.65).toFixed(3)});
 }
 txs.sort((a,b)=>b.feeRate-a.feeRate||a.ageSeconds-b.ageSeconds);render();drawHeat()
}
function color(rate){
 if(rate>=100)return"#e06c75";
 if(rate>=50)return"#e6a42b";
 if(rate>=25)return"#d6c674";
 if(rate>=12)return"#c0d674";
 return"#7f9560";
}
function render(){
 const maxV=1_000_000;let sum=0,next=[];
 for(const t of txs){if(sum+t.vbytes>maxV)continue;sum+=t.vbytes;next.push(t)}
 $("grid").replaceChildren();
 next.forEach(t=>{const d=document.createElement("div");d.className="spec-tx";d.style.background=color(t.feeRate);d.style.gridRow=`span ${Math.max(1,Math.min(4,Math.ceil(t.vbytes/600)))}`;d.innerHTML=`<strong>${t.feeRate} sat/vB</strong><span>${t.vbytes} vB</span><span>${Math.floor(t.ageSeconds/60)}m</span>`;d.onmouseenter=e=>tip(e,t);d.onmousemove=e=>moveTip(e);d.onmouseleave=hideTip;d.onclick=()=>select(t);$("grid").append(d)});
 const rates=txs.map(t=>t.feeRate).sort((a,b)=>a-b);
 const pct=q=>rates[Math.min(rates.length-1,Math.floor((rates.length-1)*q))]||0;
 $("total").textContent=txs.length;$("next-count").textContent=next.length;$("next-vb").textContent=sum.toLocaleString();$("median").textContent=pct(.5).toFixed(1)+" sat/vB";
 $("fee-output").textContent=JSON.stringify({low:pct(.25),medium:pct(.5),high:pct(.75),urgent:pct(.9),max:pct(1)},null,2)
}
function tip(e,t){$("tip").style.display="block";$("tip").innerHTML=`<strong>${t.txid.slice(0,20)}…</strong><br>${t.feeRate} sat/vB · ${t.vbytes} vB<br>fee ${t.feeSats} sat<br>age ${t.ageSeconds}s<br>propagation ${(t.propagation*100).toFixed(1)}%`;moveTip(e)}
function moveTip(e){$("tip").style.left=(e.clientX+14)+"px";$("tip").style.top=(e.clientY+14)+"px"}function hideTip(){$("tip").style.display="none"}
function select(t){selected=t;$("tx-output").textContent=JSON.stringify(t,null,2)}
function drawHeat(){
 const e=$("heat");e.replaceChildren();const r=seeded((+$("seed").value||42)^0xdeadbeef);
 for(let i=0;i<24*10;i++){const v=r(),d=document.createElement("div");d.className="heat-cell";const alpha=.12+v*.85;d.style.background=`rgba(${v>.75?224:192},${v>.75?108:214},${v>.75?117:116},${alpha})`;d.title=`peer bucket ${i} · propagation ${(v*100).toFixed(1)}%`;e.append(d)}
}
$("generate").onclick=generate;
$("import-json").onchange=async()=>{const f=$("import-json").files[0];if(!f)return;try{const j=JSON.parse(await f.text()),arr=Array.isArray(j)?j:(j.transactions||j.mempool||[]);txs=arr.map((t,i)=>({txid:String(t.txid||t.id||`tx-${i}`),vbytes:+(t.vsize||t.vbytes||t.size||250),ageSeconds:+(t.ageSeconds||t.age||0),feeRate:+(t.feeRate||t.fee_rate||t.effectiveFeePerVsize||1),feeSats:+(t.feeSats||t.fee||0),ancestorCount:+(t.ancestorCount||0),descendantCount:+(t.descendantCount||0),propagation:+(t.propagation||0)})).filter(t=>Number.isFinite(t.feeRate)&&Number.isFinite(t.vbytes));txs.sort((a,b)=>b.feeRate-a.feeRate);render();drawHeat()}catch(e){$("tx-output").textContent="IMPORT ERROR: "+e.message}};
$("export-json").onclick=()=>{const doc={schema:"zzx.mempoolspecs.snapshot.v1",generated:new Date().toISOString(),transactions:txs,source:"synthetic-or-user-import",liveNetwork:false},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mempoolspecs-snapshot.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
generate();window.MempoolSpecs=Object.freeze({version:"0.3.0-alpha-web",liveNetwork:false});
})();
