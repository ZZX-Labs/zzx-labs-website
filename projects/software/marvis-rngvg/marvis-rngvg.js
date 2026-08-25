(()=>{"use strict";
const $=id=>document.getElementById(id);
let seed=42,state=0,anim=null,recording=null,chunks=[],frames=[],frameNo=0,startTime=0;
function srand(s){state=(s>>>0)||1}
function rand(){let x=state;x^=x<<13;x^=x>>>17;x^=x<<5;state=x>>>0;return state/4294967296}
function config(){return{seed:+$("seed").value||42,width:+$("width").value,height:+$("height").value,fps:+$("fps").value,duration:+$("duration").value,turbidity:+$("turbidity").value,noise:+$("noise").value,fish:+$("fish-count").value,jelly:+$("jelly-count").value,light:+$("light").value,current:+$("current").value}}
function scene(t){
 const cfg=config(),c=$("scene"),x=c.getContext("2d");c.width=cfg.width;c.height=cfg.height;srand(cfg.seed);
 const grad=x.createLinearGradient(0,0,0,c.height);grad.addColorStop(0,`rgb(${8+cfg.light},${40+cfg.light},${65+cfg.light})`);grad.addColorStop(1,"rgb(2,15,26)");x.fillStyle=grad;x.fillRect(0,0,c.width,c.height);
 // caustics
 for(let i=0;i<18;i++){const px=(rand()*c.width+t*cfg.current*(5+rand()*8))%c.width,py=rand()*c.height*.6;x.strokeStyle=`rgba(120,220,220,${.02+rand()*.05})`;x.beginPath();x.arc(px,py,20+rand()*80,0,Math.PI*2);x.stroke()}
 // fish silhouettes and annotation records
 frames=[];for(let i=0;i<cfg.fish;i++){const baseX=rand()*c.width,baseY=c.height*.15+rand()*c.height*.7,s=8+rand()*22,dir=rand()>.5?1:-1,px=(baseX+dir*t*(18+rand()*35)+c.width)%c.width,py=baseY+Math.sin(t*.9+i)*12;x.save();x.translate(px,py);x.scale(dir,1);x.fillStyle="rgba(10,18,20,.75)";x.beginPath();x.ellipse(0,0,s*1.8,s*.7,0,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(-s*1.5,0);x.lineTo(-s*2.6,-s);x.lineTo(-s*2.6,s);x.closePath();x.fill();x.restore();frames.push({class:"fish",x:px/c.width,y:py/c.height,w:(s*3.6)/c.width,h:(s*1.4)/c.height})}
 for(let i=0;i<cfg.jelly;i++){const px=(rand()*c.width+Math.sin(t*.25+i)*40+c.width)%c.width,py=(rand()*c.height+t*(5+rand()*10))%c.height,s=10+rand()*18;x.fillStyle="rgba(170,220,210,.18)";x.beginPath();x.arc(px,py,s,Math.PI,Math.PI*2);x.fill();x.strokeStyle="rgba(180,230,220,.18)";for(let k=-2;k<=2;k++){x.beginPath();x.moveTo(px+k*s*.25,py);x.lineTo(px+k*s*.3,py+s*2);x.stroke()}frames.push({class:"jellyfish",x:px/c.width,y:py/c.height,w:(s*2)/c.width,h:(s*3)/c.height})}
 // particulate turbidity
 const particles=Math.round(cfg.turbidity*2.5);for(let i=0;i<particles;i++){x.fillStyle=`rgba(220,235,220,${.01+rand()*.05})`;x.beginPath();x.arc(rand()*c.width,rand()*c.height,rand()*3.2,0,Math.PI*2);x.fill()}
 // sensor noise
 const img=x.getImageData(0,0,c.width,c.height),d=img.data,n=cfg.noise/100;for(let i=0;i<d.length;i+=4){const z=(rand()-.5)*55*n;d[i]=Math.max(0,Math.min(255,d[i]+z));d[i+1]=Math.max(0,Math.min(255,d[i+1]+z));d[i+2]=Math.max(0,Math.min(255,d[i+2]+z))}x.putImageData(img,0,0);
 $("frame-no").textContent=frameNo;$("object-count").textContent=frames.length;
}
function start(){stop();frameNo=0;startTime=performance.now();const cfg=config(),frameMs=1000/cfg.fps;function tick(now){const t=(now-startTime)/1000;if(t>cfg.duration){stop();return}scene(t);frameNo++;anim=setTimeout(()=>requestAnimationFrame(tick),frameMs)}requestAnimationFrame(tick)}
function stop(){if(anim){clearTimeout(anim);anim=null}}
$("generate").onclick=start;$("stop").onclick=stop;$("single").onclick=()=>{frameNo++;scene(frameNo/(+$("fps").value||24))};
$("export-frame").onclick=()=>{$("scene").toBlob(b=>{const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`marvis-rngvg-frame-${String(frameNo).padStart(5,"0")}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)},"image/png")};
$("record").onclick=()=>{
 const c=$("scene");if(!c.captureStream||!window.MediaRecorder){$("record-output").textContent="Canvas recording is not supported in this browser.";return}
 chunks=[];const stream=c.captureStream(+$("fps").value||24),opts={mimeType:MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm"};recording=new MediaRecorder(stream,opts);recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recording.onstop=()=>{const b=new Blob(chunks,{type:recording.mimeType}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="marvis-rngvg-synthetic.webm";a.click();setTimeout(()=>URL.revokeObjectURL(u),900);$("record-output").textContent=`Recorded ${b.size} bytes`};recording.start();start();setTimeout(()=>{stop();if(recording?.state==="recording")recording.stop()},(+$("duration").value||5)*1000+250)
};
$("export-recipe").onclick=()=>{
 const doc={schema:"zzx.marvis-rngvg.recipe.v1",generated:new Date().toISOString(),config:config(),latestAnnotations:frames,generator:"procedural browser reference",usesRealTrainingData:false};
 const t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="marvis-rngvg-recipe.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);$("recipe-output").textContent=t
};
$("single").click();window.MarVISRNGvG=Object.freeze({version:"0.2.0-alpha-web",synthetic:true});
})();
