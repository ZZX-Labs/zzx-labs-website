(()=>{"use strict";const $=id=>document.getElementById(id);let policy=null;
function unix(s){const d=new Date(s);return Number.isFinite(d.getTime())?Math.floor(d.getTime()/1000):null}
function scriptPlan(p){
 if(p.lockType==="cltv"){return`${p.lockValue} OP_CHECKLOCKTIMEVERIFY OP_DROP <spend-pubkey> OP_CHECKSIG`}
 if(p.lockType==="csv"){return`${p.lockValue} OP_CHECKSEQUENCEVERIFY OP_DROP <spend-pubkey> OP_CHECKSIG`}
 return`<policy-template-placeholder>`
}
$("build").onclick=()=>{
 const type=$("lock-type").value,date=$("unlock").value,blocks=Math.max(1,+$("blocks").value||144),lockValue=type==="cltv"?unix(date):blocks;
 policy={schema:"zzx.stoa.policy.v1",created:new Date().toISOString(),name:$("name").value.trim(),lockType:type,lockValue,unlockTime:type==="cltv"&&lockValue?new Date(lockValue*1000).toISOString():null,relativeBlocks:type==="csv"?blocks:null,amountSats:Math.max(0,+$("amount").value||0),purpose:$("purpose").value.trim(),recovery:$("recovery").value,spendPath:"public-key placeholder only",privateKeysHandled:false,walletCredentialsHandled:false,psbtSigning:false,broadcast:false};
 policy.scriptTemplate=scriptPlan(policy);$("output").textContent=JSON.stringify(policy,null,2);$("script").textContent=policy.scriptTemplate;renderState()
};
function renderState(){const now=Math.floor(Date.now()/1000),locked=policy?.lockType==="cltv"&&policy.lockValue?now<policy.lockValue:true;$("status").textContent=locked?"LOCKED / POLICY PLANNED":"TIME CONDITION MET";$("amount-out").textContent=(policy?.amountSats||0).toLocaleString()+" sats";document.querySelectorAll("#states span").forEach((s,i)=>s.classList.toggle("on",i===0||(policy&&i<=2)))}
$("export").onclick=()=>{if(!policy)$("build").click();const t=JSON.stringify(policy,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="stoa-policy.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("unlock").value=new Date(Date.now()+365*86400000).toISOString().slice(0,16);$("build").click();window.STOA=Object.freeze({version:"0.2.0-alpha-web",privateKeys:false,signing:false,broadcast:false});
})();
