(()=>{"use strict";
const $=id=>document.getElementById(id);
let current=null,annotations=[],frameInfo=null,audioCtx=null;
const species=["unknown","shark","ray","turtle","dolphin","whale","seal","octopus","jellyfish","schooling-fish","crustacean"];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function sha256(file){const d=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function drawImage(img){
 const c=$("frame"),x=c.getContext("2d"),maxW=1100,maxH=620,scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight,1);
 c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
 x.filter=`brightness(${$("brightness").value}%) contrast(${$("contrast").value}%)`;
 x.drawImage(img,0,0,c.width,c.height);x.filter="none";drawOverlays();
 frameInfo={width:c.width,height:c.height,sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight};
}
function drawVideo(){
 const v=$("video"),c=$("frame"),x=c.getContext("2d");
 if(!v.videoWidth)return;
 const scale=Math.min(1100/v.videoWidth,620/v.videoHeight,1);c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
 x.filter=`brightness(${$("brightness").value}%) contrast(${$("contrast").value}%)`;
 x.drawImage(v,0,0,c.width,c.height);x.filter="none";
 const turb=+$("turbidity").value/100;
 if(turb>0){x.fillStyle=`rgba(40,90,95,${turb*.45})`;x.fillRect(0,0,c.width,c.height);for(let i=0;i<60*turb;i++){x.fillStyle=`rgba(220,240,220,${.02+Math.random()*.05})`;x.beginPath();x.arc(Math.random()*c.width,Math.random()*c.height,1+Math.random()*5,0,Math.PI*2);x.fill()}}
 drawOverlays();frameInfo={width:c.width,height:c.height,sourceWidth:v.videoWidth,sourceHeight:v.videoHeight,time:v.currentTime};
 $("progress").style.width=`${v.duration?100*v.currentTime/v.duration:0}%`;
}
function drawOverlays(){
 const c=$("frame"),x=c.getContext("2d");
 x.lineWidth=2;x.font="13px monospace";
 annotations.forEach(a=>{x.strokeStyle="#c0d674";x.strokeRect(a.x*c.width,a.y*c.height,a.w*c.width,a.h*c.height);x.fillStyle="rgba(0,0,0,.65)";x.fillRect(a.x*c.width,a.y*c.height-19,Math.max(80,a.label.length*8),19);x.fillStyle="#c0d674";x.fillText(a.label,a.x*c.width+4,a.y*c.height-5)})
}
$("media").onchange=async()=>{
 const f=$("media").files[0];if(!f)return;
 current={name:f.name,type:f.type,size:f.size,sha256:await sha256(f)};
 $("file-meta").textContent=JSON.stringify(current,null,2);
 const u=URL.createObjectURL(f);
 if(f.type.startsWith("image/")){const img=new Image();img.onload=()=>drawImage(img);img.src=u;$("video").hidden=true}
 else if(f.type.startsWith("video/")){const v=$("video");v.hidden=false;v.src=u;v.onloadedmetadata=()=>{v.currentTime=0;drawVideo()};v.ontimeupdate=drawVideo}
 else alert("Select an image or video.");
};
for(const id of["brightness","contrast","turbidity"])$(id).oninput=()=>{$("video").hidden?$("media").dispatchEvent(new Event("noop")):drawVideo()};
$("capture-frame").onclick=drawVideo;
$("add-annotation").onclick=()=>{
 const a={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),label:$("species").value,confidence:+$("confidence").value,x:+$("x").value,y:+$("y").value,w:+$("w").value,h:+$("h").value,notes:$("notes").value.trim(),frameTime:$("video").hidden?null:$("video").currentTime};
 annotations.push(a);renderAnnotations();drawOverlays();
};
function renderAnnotations(){
 const tb=$("annotation-body");tb.replaceChildren();
 annotations.forEach((a,i)=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${i+1}</td><td>${esc(a.label)}</td><td>${(a.confidence*100).toFixed(1)}%</td><td>${a.frameTime==null?"image":a.frameTime.toFixed(2)+" s"}</td><td>${[a.x,a.y,a.w,a.h].map(v=>v.toFixed(3)).join(", ")}</td>`;tb.append(tr)});
 $("anno-count").textContent=annotations.length;
}
$("mock-model").onclick=()=>{
 const labels=["schooling-fish","shark","ray","turtle"];const a={id:Math.random().toString(36).slice(2),label:labels[Math.floor(Math.random()*labels.length)],confidence:+(.65+Math.random()*.31).toFixed(3),x:+(.12+Math.random()*.38).toFixed(3),y:+(.12+Math.random()*.38).toFixed(3),w:+(.18+Math.random()*.2).toFixed(3),h:+(.15+Math.random()*.22).toFixed(3),notes:"synthetic model-adapter demo output",frameTime:$("video").hidden?null:$("video").currentTime};annotations.push(a);renderAnnotations();drawOverlays()
};
$("analyze-audio").onclick=async()=>{
 const f=$("media").files[0];if(!f||!f.type.startsWith("video/")){$("audio-output").textContent="Load a video with audio first.";return}
 try{
  audioCtx??=new AudioContext();
  const buf=await f.arrayBuffer(),audio=await audioCtx.decodeAudioData(buf.slice(0));
  const ch=audio.getChannelData(0),step=Math.max(1,Math.floor(ch.length/10000));let sum=0,peak=0,z=0,prev=0,n=0;
  for(let i=0;i<ch.length;i+=step){const v=ch[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));if((v>=0)!=(prev>=0))z++;prev=v;n++}
  $("audio-output").textContent=JSON.stringify({duration:audio.duration,sampleRate:audio.sampleRate,channels:audio.numberOfChannels,rms:Math.sqrt(sum/n),peak,zeroCrossingRate:z/n,note:"simple browser audio features; native MarVIS uses TensorFlow/audio models"},null,2);
 }catch(e){$("audio-output").textContent="Audio decode unavailable: "+e.message}
};
$("export-dataset").onclick=()=>{
 const doc={schema:"zzx.marvis.dataset-record.v1",generated:new Date().toISOString(),source:current,frame:frameInfo,environment:{brightness:+$("brightness").value,contrast:+$("contrast").value,turbidity:+$("turbidity").value},annotations,modelAdapter:"browser demo/manual annotations"};
 const t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="marvis-dataset-record.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);$("export-output").textContent=t;
};
renderAnnotations();window.MarVIS=Object.freeze({version:"0.3.0-alpha-web",annotations:()=>annotations.slice()});
})();
