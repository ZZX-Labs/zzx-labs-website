(()=>{"use strict";
const $=id=>document.getElementById(id);
let image=null,variants=[],schedule=[],telemetry=[],campaign=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("template-image").onchange=()=>{const f=$("template-image").files[0];if(!f)return;const u=URL.createObjectURL(f),img=new Image();img.onload=()=>{image=img;draw($("headline-a").value,$("footer-a").value)};img.src=u};
function wrap(ctx,text,maxWidth){const words=text.split(/\s+/),lines=[];let line="";for(const w of words){const t=line?line+" "+w:w;if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=w}else line=t}if(line)lines.push(line);return lines}
function draw(head,foot){
 const c=$("meme-canvas"),x=c.getContext("2d");c.width=1080;c.height=1080;
 if(image){const s=Math.max(c.width/image.width,c.height/image.height),w=image.width*s,h=image.height*s;x.drawImage(image,(c.width-w)/2,(c.height-h)/2,w,h)}
 else{const g=x.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,"#121212");g.addColorStop(1,"#3a1018");x.fillStyle=g;x.fillRect(0,0,c.width,c.height);x.fillStyle="#c0d674";x.font="700 100px monospace";x.textAlign="center";x.fillText("memeantix",c.width/2,c.height/2)}
 x.fillStyle="rgba(0,0,0,.62)";x.fillRect(0,0,c.width,190);x.fillRect(0,c.height-155,c.width,155);
 x.fillStyle="#fff";x.textAlign="center";x.font="700 64px Arial";let y=78;for(const line of wrap(x,head,c.width-90).slice(0,2)){x.fillText(line,c.width/2,y);y+=70}
 x.font="700 42px Arial";y=c.height-92;for(const line of wrap(x,foot,c.width-90).slice(0,2)){x.fillText(line,c.width/2,y);y+=48}
}
$("render-a").onclick=()=>draw($("headline-a").value,$("footer-a").value);
$("make-variants").onclick=()=>{
 const baseH=$("headline-a").value.trim(),baseF=$("footer-a").value.trim(),alts=$("variant-lines").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 variants=[{id:"A",headline:baseH,footer:baseF},...alts.map((t,i)=>({id:String.fromCharCode(66+i),headline:t,footer:baseF}))];
 renderVariants();draw(variants[0].headline,variants[0].footer)
};
function renderVariants(){const tb=$("variant-body");tb.replaceChildren();variants.forEach(v=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${v.id}</td><td>${esc(v.headline)}</td><td>${esc(v.footer)}</td><td><button class="btn ghost" data-v="${v.id}">PREVIEW</button></td>`;tb.append(tr)});tb.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{const v=variants.find(x=>x.id===b.dataset.v);draw(v.headline,v.footer)})}
$("add-slot").onclick=()=>{const s={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),variant:$("slot-variant").value,channel:$("channel").value,scheduledFor:$("when").value||null,status:"planned"};schedule.push(s);renderSchedule()};
function renderSchedule(){const tb=$("schedule-body");tb.replaceChildren();schedule.forEach(s=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${s.variant}</td><td>${s.channel}</td><td>${s.scheduledFor||"unscheduled"}</td><td>${s.status}</td>`;tb.append(tr)})}
$("import-metrics").onclick=()=>{try{const arr=JSON.parse($("metrics").value);telemetry=Array.isArray(arr)?arr:arr.records||[];score()}catch(e){$("metric-output").textContent="ERROR: "+e.message}};
function score(){
 const map={};for(const r of telemetry){const id=String(r.variant||"A"),im=+r.impressions||0,en=+r.engagements||0,cl=+r.clicks||0;map[id]??={variant:id,impressions:0,engagements:0,clicks:0};map[id].impressions+=im;map[id].engagements+=en;map[id].clicks+=cl}
 const out=Object.values(map).map(x=>({...x,engagementRate:x.impressions?x.engagements/x.impressions:0,clickRate:x.impressions?x.clicks/x.impressions:0})).sort((a,b)=>b.engagementRate-a.engagementRate);
 $("metric-output").textContent=JSON.stringify(out,null,2)
}
$("export-png").onclick=()=>{$("meme-canvas").toBlob(b=>{const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-preview.png";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)},"image/png")};
$("export-campaign").onclick=()=>{
 campaign={schema:"zzx.memeantix.campaign.v1",exported:new Date().toISOString(),name:$("campaign-name").value.trim(),purpose:$("purpose").value.trim(),variants,schedule,aggregateTelemetry:telemetry,distributionAutomation:false,platformCredentials:false,note:"Schedule/export package only; static page does not auto-post or hold platform credentials."};
 const t=JSON.stringify(campaign,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-campaign.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);$("export-output").textContent=t
};
$("make-variants").click();window.memeantix=Object.freeze({version:"0.3.0-alpha-web",autoPosting:false});
})();
