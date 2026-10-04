(()=>{"use strict";const $=id=>document.getElementById(id);
let corpus="",tokens=[],freq=new Map(),unique=[],zzx108=[],dice=[];
function normalizeToken(t){
 let s=t;
 if($("lower").checked)s=s.toLowerCase();
 if($("strip-punct").checked)s=s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"");
 if($("alpha").checked)s=s.replace(/[^\p{L}]/gu,"");
 return s
}
function harvest(){
 const min=Math.max(1,+$("minlen").value||1),max=Math.max(min,+$("maxlen").value||64);
 const raw=corpus.split(" ");tokens=[];freq=new Map();
 for(const t0 of raw){const t=normalizeToken(t0);if(!t||t.length<min||t.length>max)continue;if($("no-digit").checked&&/\d/.test(t))continue;tokens.push(t);freq.set(t,(freq.get(t)||0)+1)}
 unique=[...freq.keys()];
 const sort=$("sort").value;
 if(sort==="alpha")unique.sort((a,b)=>a.localeCompare(b));
 else if(sort==="frequency")unique.sort((a,b)=>(freq.get(b)-freq.get(a))||a.localeCompare(b));
 else if(sort==="length")unique.sort((a,b)=>(a.length-b.length)||a.localeCompare(b));
 $("total").textContent=tokens.length.toLocaleString();$("unique").textContent=unique.length.toLocaleString();$("dupes").textContent=(tokens.length-unique.length).toLocaleString();$("coverage").textContent=Math.min(100,unique.length/108000*100).toFixed(2)+"%";
 $("progress").style.width=Math.min(100,unique.length/108000*100)+"%";$("preview").textContent=unique.slice(0,250).map(w=>`${w}\t${freq.get(w)}`).join("\n");
 buildLists()
}
function hash32(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function stableShuffle(arr,seed){return arr.slice().sort((a,b)=>{const ha=hash32(seed+"\0"+a),hb=hash32(seed+"\0"+b);return ha-hb||a.localeCompare(b)})}
function buildLists(){
 const seed=$("seed").value||"ZZX-WordHarvest-1";
 const src=stableShuffle(unique,seed);
 zzx108=src.slice(0,Math.min(108000,src.length));
 const diceSrc=stableShuffle(zzx108,$("dice-seed").value||seed+"-7776").slice(0,Math.min(7776,zzx108.length));
 dice=diceSrc.map((word,i)=>({code:indexToDice(i),word}));
 $("list108").textContent=zzx108.slice(0,300).join("\n");
 $("dice").textContent=dice.slice(0,300).map(x=>`${x.code}\t${x.word}`).join("\n");
 $("count108").textContent=zzx108.length.toLocaleString();$("count7776").textContent=dice.length.toLocaleString();
 $("status").textContent=unique.length>=108000?"ZZX-108K target met.":`Need ${(108000-unique.length).toLocaleString()} additional unique token(s) for a full ZZX-108K corpus.`
}
function indexToDice(i){let n=i,s="";for(let k=0;k<5;k++){s=String((n%6)+1)+s;n=Math.floor(n/6)}return s}
$("paste-run").onclick=()=>{corpus=$("paste").value;harvest()};
$("files").onchange=async()=>{let parts=[];for(const f of [...$("files").files])parts.push(await f.text());corpus=parts.join(" ");$("files").value="";harvest()};
["lower","strip-punct","alpha","no-digit","minlen","maxlen","sort","seed","dice-seed"].forEach(id=>$(id).oninput=harvest);
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("export-108").onclick=()=>dl(zzx108.join("\n")+"\n","ZZX-108K.txt");
$("export-7776").onclick=()=>dl(dice.map(x=>`${x.code} ${x.word}`).join("\n")+"\n","ZZX-7776-diceware.txt");
$("export-audit").onclick=()=>dl(JSON.stringify({schema:"zzx.wordharvest.audit.v1",created:new Date().toISOString(),tokenModel:"strict single-space split",normalization:{lowercase:$("lower").checked,stripEdgePunctuation:$("strip-punct").checked,alphaOnly:$("alpha").checked,noDigits:$("no-digit").checked,minLength:+$("minlen").value,maxLength:+$("maxlen").value,sort:$("sort").value},counts:{tokens:tokens.length,unique:unique.length,zzx108k:zzx108.length,diceware:dice.length},seeds:{partition:$("seed").value,diceware:$("dice-seed").value}},null,2),"wordharvest-audit.json","application/json");
$("paste").value="alpha beta gamma delta epsilon zeta eta theta iota kappa alpha beta";corpus=$("paste").value;harvest();window.WordHarvest=Object.freeze({version:"1.0.0-web",dicewareSize:7776,targetVocabulary:108000});
})();
