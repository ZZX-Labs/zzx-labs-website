(()=>{"use strict";
const $=id=>document.getElementById(id);
let bank=0,banks=[Array.from({length:12},(_,i)=>({id:`0-${i}`,label:`Pad ${i+1}`,file:null,url:null,volume:1,loop:false,hotkey:String((i+1)%10),playing:false}))];
let master=.85,active=new Set();

function ensureBank(i){while(banks.length<=i)banks.push(Array.from({length:12},(_,j)=>({id:`${banks.length}-${j}`,label:`Pad ${j+1}`,file:null,url:null,volume:1,loop:false,hotkey:"",playing:false})))}
function stopPad(p){
 if(p.audio){p.audio.pause();p.audio.currentTime=0}
 p.playing=false;active.delete(p.id);renderPads();updateStats()
}
function playPad(p){
 if(!p.file){$("status").textContent=`${p.label}: no clip assigned`;return}
 if(p.audio&&p.playing){stopPad(p);return}
 if(!p.audio){
   p.audio=new Audio(p.url);
   p.audio.onended=()=>{p.playing=false;active.delete(p.id);renderPads();updateStats()}
 }
 p.audio.loop=p.loop;p.audio.volume=Math.max(0,Math.min(1,p.volume*master));p.audio.currentTime=0;
 p.audio.play().then(()=>{p.playing=true;active.add(p.id);renderPads();updateStats()}).catch(e=>$("status").textContent="PLAY ERROR: "+e.message)
}
function renderBanks(){
 const e=$("banks");e.replaceChildren();
 banks.forEach((_,i)=>{const b=document.createElement("button");b.className="bank"+(i===bank?" active":"");b.textContent=`BANK ${i+1}`;b.onclick=()=>{bank=i;renderBanks();renderPads()};e.append(b)})
}
function renderPads(){
 const e=$("pads");e.replaceChildren();
 banks[bank].forEach((p,i)=>{
   const b=document.createElement("button");b.className="pad"+(p.playing?" playing":"");
   b.innerHTML=`<strong>${p.label}</strong><small>${p.file?p.file.name:"EMPTY"}</small><small>VOL ${Math.round(p.volume*100)}% · ${p.loop?"LOOP":"ONE-SHOT"}${p.hotkey?` · KEY ${p.hotkey}`:""}</small>`;
   b.onclick=()=>{selectPad(i);playPad(p)};e.append(b)
 });
 updateStats()
}
function selectPad(i){
 const p=banks[bank][i];$("pad-index").value=i;$("label").value=p.label;$("volume").value=p.volume;$("loop").checked=p.loop;$("hotkey").value=p.hotkey||"";$("selected").textContent=`Bank ${bank+1} / Pad ${i+1}`
}
$("assign").onchange=e=>{
 const f=e.target.files[0];if(!f)return;const i=+$("pad-index").value,p=banks[bank][i];
 if(p.url)URL.revokeObjectURL(p.url);p.file=f;p.url=URL.createObjectURL(f);p.audio=null;
 if(p.label.startsWith("Pad "))p.label=f.name.replace(/\.[^.]+$/,"");
 e.target.value="";renderPads();selectPad(i)
};
$("save-pad").onclick=()=>{const i=+$("pad-index").value,p=banks[bank][i];p.label=$("label").value.trim()||p.label;p.volume=+$("volume").value;p.loop=$("loop").checked;p.hotkey=$("hotkey").value.trim().slice(0,1);renderPads()};
$("add-bank").onclick=()=>{ensureBank(banks.length);bank=banks.length-1;renderBanks();renderPads()};
$("master").oninput=()=>{master=+$("master").value;for(const p of banks.flat())if(p.audio)p.audio.volume=Math.max(0,Math.min(1,p.volume*master));$("master-out").textContent=Math.round(master*100)+"%"};
$("stop-all").onclick=()=>banks.flat().forEach(stopPad);
$("status").textContent="READY";
function updateStats(){$("bank-count").textContent=banks.length;$("clip-count").textContent=banks.flat().filter(p=>p.file).length;$("active-count").textContent=active.size}
document.addEventListener("keydown",e=>{
 if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
 const p=banks[bank].find(x=>x.hotkey&&x.hotkey.toLowerCase()===e.key.toLowerCase());if(p){e.preventDefault();playPad(p)}
});
$("export").onclick=()=>{
 const clean=banks.map((arr,bi)=>arr.map((p,pi)=>({bank:bi,pad:pi,label:p.label,filename:p.file?.name||null,volume:p.volume,loop:p.loop,hotkey:p.hotkey||null})));
 const t=JSON.stringify({schema:"zzx.asb.board.v1",exported:new Date().toISOString(),masterVolume:master,banks:clean,filesEmbedded:false},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zzxasb-board.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)
};
$("routing").onclick=()=>{$("routing-out").textContent=JSON.stringify({schema:"zzx.asb.routing.v1",inputs:["local-clips","zzxtts-render","zzxvcs-output"],outputs:["default-audio-device","virtual-audio-cable","obs","discord"],sttIntegration:"optional monitor/transcription feed",automaticNetworkPosting:false,credentialCollection:false},null,2)};
renderBanks();renderPads();selectPad(0);window.ZZXASB=Object.freeze({version:"0.1.0-alpha-web",localOnly:true});
})();
