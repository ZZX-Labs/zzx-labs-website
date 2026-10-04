(()=>{"use strict";
const $=id=>document.getElementById(id),N=NutraMeAPKCore;
let logs=[],photoURL=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("capture").onchange=()=>{if(photoURL)URL.revokeObjectURL(photoURL);const f=$("capture").files[0];if(!f){$("preview").hidden=true;return}photoURL=URL.createObjectURL(f);$("preview").src=photoURL;$("preview").hidden=false;$("photo-name").textContent=f.name};
$("quick-add").onclick=()=>{
 const x={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),at:new Date().toISOString(),name:$("food").value.trim(),calories:+$("calories").value||0,protein:+$("protein").value||0,carbs:+$("carbs").value||0,fat:+$("fat").value||0,labelPhoto:$("capture").files[0]?.name||null,notes:$("notes").value.trim()};
 if(!x.name)return;logs.unshift(x);render()
};
function render(){
 const e=$("logs");e.replaceChildren();logs.forEach(x=>{const d=document.createElement("div");d.className="mobile-log";d.innerHTML=`<strong>${esc(x.name)}</strong><div class="fx-watermark">${new Date(x.at).toLocaleString()} · ${x.calories} cal · P ${x.protein}g · C ${x.carbs}g · F ${x.fat}g</div>`;e.append(d)});
 $("count").textContent=logs.length;$("cal-total").textContent=logs.reduce((s,x)=>s+x.calories,0).toFixed(0)
}
$("encrypt-export").onclick=async()=>{const p=$("passphrase").value;if(p.length<8){$("sync-output").textContent="Use a passphrase of at least 8 characters.";return}const pkg=await N.encrypt({schema:"zzx.nutrame.mobile-ledger.v1",exported:new Date().toISOString(),logs},p),t=JSON.stringify(pkg,null,2);N.download(t,"nutrameapk-encrypted-sync.json");$("sync-output").textContent=t};
$("import-sync").onchange=async()=>{const f=$("import-sync").files[0];if(!f)return;try{const pkg=JSON.parse(await f.text()),data=await N.decrypt(pkg,$("passphrase").value);logs=[...(data.logs||[]),...logs];render();$("sync-output").textContent=`Imported ${data.logs?.length||0} encrypted record(s).`}catch(e){$("sync-output").textContent="IMPORT ERROR: "+e.message}$("import-sync").value=""};
render();window.NutraMeAPK=Object.freeze({version:"0.1.0-alpha-web",apkIncluded:false});
})();
