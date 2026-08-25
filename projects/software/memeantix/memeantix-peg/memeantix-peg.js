(()=>{"use strict";
const $=id=>document.getElementById(id);
const kits=[
 {id:"egg-court",name:"Egg Court",tone:"absurd ceremonial luxury",palette:"cream / amber / black",visual:"comic platypus gourmets presenting an impossibly ornate egg tasting like a royal court"},
 {id:"brunch-tribunal",name:"Brunch Tribunal",tone:"deadpan bureaucracy",palette:"sage / mustard / paper",visual:"manga-style panel of platypus judges scoring a breakfast egg with absurd legal seriousness"},
 {id:"egg-heist",name:"The Egg Heist",tone:"retro caper parody",palette:"burgundy / cream / teal",visual:"cartoon platypus crew planning an elaborate theft of one ridiculously ordinary egg"},
 {id:"gourmet-war-room",name:"Gourmet War Room",tone:"strategic absurdity",palette:"charcoal / red / gold",visual:"anime-style planning board covered in egg diagrams, menu cards, and impossible tasting metrics"},
 {id:"shell-critic",name:"Shell Critic",tone:"pretentious art criticism",palette:"white / ink / coral",visual:"comic art critic studying a cracked eggshell as if it were a museum masterpiece"},
 {id:"midnight-omelette",name:"Midnight Omelette",tone:"noir culinary parody",palette:"black / silver / yolk",visual:"noir platypus chef under a single kitchen lamp treating an omelette like classified evidence"}
];
const narrativeSeeds=[
 "THE EGG WAS LOCAL. THE OPINIONS WERE IMPORTED.",
 "A FIVE-COURSE MENU BUILT AROUND ONE QUESTIONABLE EGG",
 "THE TASTING PANEL HAS LOST OBJECTIVITY",
 "THIS COULD HAVE BEEN BRUNCH",
 "WE HAVE ACHIEVED MAXIMUM SHELL INTEGRITY"
];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderKits(){
 const e=$("kit-grid");e.replaceChildren();kits.forEach(k=>{const a=document.createElement("article");a.className="peg-card";a.innerHTML=`<strong>${esc(k.name)}</strong><p>${esc(k.visual)}</p><div class="fx-note">${esc(k.tone)} · ${esc(k.palette)}</div><button class="btn ghost" data-id="${k.id}">USE KIT</button>`;e.append(a)});e.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{const k=kits.find(x=>x.id===b.dataset.id);$("art-direction").value=k.visual;$("tone").value=k.tone;$("palette").value=k.palette;update()})
}
function update(){
 const v={schema:"zzx.memeantix.peg.variant.v1",kit:$("kit-id").value||null,headline:$("headline").value.trim(),narrative:$("narrative").value.trim(),artDirection:$("art-direction").value.trim(),tone:$("tone").value.trim(),palette:$("palette").value.trim(),format:$("format").value,notes:$("notes").value.trim()};
 $("variant-output").textContent=JSON.stringify(v,null,2);return v
}
$("headline-seed").innerHTML=narrativeSeeds.map(x=>`<option>${esc(x)}</option>`).join("");
$("headline-seed").onchange=()=>{$("headline").value=$("headline-seed").value;update()};
for(const id of["headline","narrative","art-direction","tone","palette","format","notes"])$(id).oninput=update;
$("export-module").onclick=()=>{const doc={schema:"zzx.memeantix.module.v1",module:"memeantix-peg",version:"0.1.0",kits,narrativeSeeds,current:update(),distribution:false},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="memeantix-peg-module.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
renderKits();$("headline-seed").dispatchEvent(new Event("change"));window.MemeantixPEG=Object.freeze({version:"0.1.0",kits});
})();
