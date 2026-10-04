(()=>{"use strict";const $=id=>document.getElementById(id),c=$("chart"),x=c.getContext("2d");let samples=[],sessionStart=Date.now();
function addSample(level,source="manual"){
 const s={at:new Date().toISOString(),level:Math.max(0,Math.min(100,+level||0)),source};samples.push(s);render()
}
function render(){
 const last=samples.at(-1)||{level:0},mins=(Date.now()-sessionStart)/60000;
 $("level").textContent=last.level.toFixed(0)+"%";$("battery").style.width=last.level+"%";$("samples").textContent=samples.length;$("session").textContent=mins.toFixed(1)+" min";
 let rem="—";if(samples.length>=2){const a=samples[0],b=samples.at(-1),hours=(new Date(b.at)-new Date(a.at))/3600000,drop=a.level-b.level;if(hours>0&&drop>0){const rate=drop/hours;rem=(b.level/rate).toFixed(1)+" h";$("rate").textContent=rate.toFixed(2)+" %/h"}else $("rate").textContent="—"}$("remaining").textContent=rem;draw()
}
function draw(){x.fillStyle="#050505";x.fillRect(0,0,c.width,c.height);if(samples.length<2)return;const vals=samples.slice(-120),t0=new Date(vals[0].at).getTime(),t1=new Date(vals.at(-1).at).getTime()||t0+1;x.strokeStyle="#c0d674";x.lineWidth=2;x.beginPath();vals.forEach((s,i)=>{const px=35+(new Date(s.at).getTime()-t0)/Math.max(1,t1-t0)*(c.width-55),py=20+(100-s.level)/100*(c.height-50);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}
$("manual").onclick=()=>addSample($("manual-level").value,"manual");
$("simulate").onclick=()=>{samples=[];for(let i=0;i<12;i++)samples.push({at:new Date(Date.now()-(11-i)*1800000).toISOString(),level:Math.max(0,96-i*4.2),source:"demo"});render()};
$("hid").onclick=async()=>{if(!navigator.hid){$("status").textContent="WebHID unavailable in this browser. Use native XConStats/hidapi.";return}try{const devices=await navigator.hid.requestDevice({filters:[{vendorId:0x045e}]});$("status").textContent=`Authorized ${devices.length} Microsoft HID device(s). Browser HID battery reports are device/firmware-specific and are not guessed.`}catch(e){$("status").textContent="HID: "+e.message}};
$("gamepad").onclick=()=>{const pads=[...navigator.getGamepads()].filter(Boolean);$("status").textContent=pads.length?pads.map(p=>`${p.index}: ${p.id}`).join("\n"):"No Gamepad API controller detected.";};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.xconstats.telemetry.v1",exported:new Date().toISOString(),sessionStarted:new Date(sessionStart).toISOString(),samples},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="xconstats-telemetry.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("simulate").click();window.XConStats=Object.freeze({version:"0.2.0-alpha-web",batteryReadClaim:false});
})();
