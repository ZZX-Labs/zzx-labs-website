(()=>{"use strict";
const $=id=>document.getElementById(id);
const pack={
 id:"cwg",title:"Chimps with Guns",version:"0.1.0",
 artDirections:[
  {id:"cwg-01",name:"Boardroom Bonobo",visual:"cartoon chimp in an oversized suit holding an obviously absurd prop blaster; chaotic presentation board",tone:"bureaucratic absurdity"},
  {id:"cwg-02",name:"Jungle Procurement",visual:"comic-book chimps arguing over wildly impractical equipment crates",tone:"procurement satire"},
  {id:"cwg-03",name:"Banana Command",visual:"manga-style command room where every screen inexplicably displays bananas",tone:"operations parody"},
  {id:"cwg-04",name:"Simian Standup",visual:"anime team stand-up with helmets, coffee, sticky notes, and absurdly serious expressions",tone:"project-management satire"},
  {id:"cwg-05",name:"Chimps With Clipboards",visual:"cartoon inspection team treating a ridiculous toy cannon as if it were a compliance audit",tone:"compliance parody"},
  {id:"cwg-06",name:"Mission Debrief",visual:"comic chimps reviewing a disastrous meme campaign on a giant projector",tone:"postmortem humor"}
 ],
 headlineSeeds:[
  "THE PLAN WAS FLAWLESS UNTIL A CHIMP READ THE RUNBOOK",
  "BANANA BUDGET: APPROVED",
  "TACTICAL MEETING COULD HAVE BEEN AN EMAIL",
  "WE HAVE ACHIEVED MAXIMUM COMPLIANCE",
  "NOBODY ASKED WHY THE PROCUREMENT FORM HAD TEETH"
 ],
 tags:["cwg","chimp","comic","absurd","campaign-module","memeantix"]
};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){
 const e=$("art-pack");e.replaceChildren();pack.artDirections.forEach(a=>{const d=document.createElement("article");d.className="cwg-card";d.innerHTML=`<strong>${esc(a.name)}</strong><p>${esc(a.visual)}</p><div class="fx-note">${esc(a.tone)}</div><button class="btn ghost" data-id="${a.id}">USE</button>`;e.append(d)});e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{const a=pack.artDirections.find(x=>x.id===b.dataset.id);$("direction").value=a.visual;$("tone").value=a.tone;update()})
 $("headlines").innerHTML=pack.headlineSeeds.map(x=>`<option>${esc(x)}</option>`).join("");$("headline").value=pack.headlineSeeds[0];update()
}
function update(){
 const v={schema:"zzx.memeantix.module.variant.v1",module:"memeantix-cwg",artDirection:$("direction").value.trim(),tone:$("tone").value.trim(),headline:$("headline").value.trim(),caption:$("caption").value.trim(),format:$("format").value,notes:$("notes").value.trim()};
 $("variant-output").textContent=JSON.stringify(v,null,2);return v
}
for(const id of["direction","tone","headline","caption","format","notes"])$(id).oninput=update;
$("export-module").onclick=()=>{const doc={schema:"zzx.memeantix.module.v1",module:pack,currentVariant:update(),distribution:false,platformCredentials:false,note:"Art/prompt module only; import into memeantix for scheduling/export."},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-cwg-module.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();window.MemeantixCWG=Object.freeze(pack);
})();
