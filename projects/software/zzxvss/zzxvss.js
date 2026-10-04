(()=>{"use strict";
const $=id=>document.getElementById(id), enc=new TextEncoder(), dec=new TextDecoder();
let idFile=null,selfieFile=null,idHash=null,selfieHash=null,envelope=null,authoritySig=null;
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
const unhex=s=>new Uint8Array((String(s).match(/../g)||[]).map(x=>parseInt(x,16)));
async function sha256File(f){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer())))}
function ageFromDOB(dob){
  const d=new Date(dob+"T00:00:00"),now=new Date();
  if(Number.isNaN(d.getTime()))return null;
  let a=now.getFullYear()-d.getFullYear();
  const m=now.getMonth()-d.getMonth();
  if(m<0||(m===0&&now.getDate()<d.getDate()))a--;
  return a;
}
function setImage(file,img){
  if(!file){img.hidden=true;img.removeAttribute("src");return}
  const u=URL.createObjectURL(file);
  img.src=u;img.hidden=false;
  img.onload=()=>setTimeout(()=>URL.revokeObjectURL(u),1000);
}
$("id-file").onchange=async()=>{idFile=$("id-file").files[0]||null;if(idFile){idHash=await sha256File(idFile);setImage(idFile,$("id-preview"));$("id-hash").textContent=idHash}else{idHash=null}};
$("selfie-file").onchange=async()=>{selfieFile=$("selfie-file").files[0]||null;if(selfieFile){selfieHash=await sha256File(selfieFile);setImage(selfieFile,$("selfie-preview"));$("selfie-hash").textContent=selfieHash}else{selfieHash=null}};
$("age-check").onclick=()=>{
 const age=ageFromDOB($("dob").value),threshold=+$("threshold").value;
 const result={age,threshold,eligible:Number.isInteger(age)?age>=threshold:false,source:"operator-entered DOB",facialAgeEstimation:false};
 $("age-out").textContent=JSON.stringify(result,null,2);
 $("age-status").textContent=result.eligible?"PASS":"NOT VERIFIED";
};
$("match-record").onclick=()=>{
 const score=$("match-score").value===""?null:+$("match-score").value;
 const rec={schema:"zzx.vss.match-result.v1",method:$("match-method").value,score,decision:$("match-decision").value,operator:$("operator").value.trim()||null,recorded:new Date().toISOString(),browserFaceRecognition:false,identitySearch:false};
 $("match-out").textContent=JSON.stringify(rec,null,2);
};
async function derive(pass,salt,uses){
 const base=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,uses);
}
async function encryptBytes(bytes,pass){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(pass,salt,["encrypt"]);
 const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes));
 return {cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:310000,salt:hex(salt),iv:hex(iv),ciphertext:hex(ct)};
}
async function decryptBytes(blob,pass){
 const key=await derive(pass,unhex(blob.salt),["decrypt"]);
 return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unhex(blob.iv)},key,unhex(blob.ciphertext)));
}
$("seal").onclick=async()=>{
 try{
   const pass=$("vault-pass").value;
   if(pass.length<12)throw new Error("Use a local vault passphrase of at least 12 characters.");
   if(!idFile||!selfieFile)throw new Error("Select both an ID image and a selfie/reference image.");
   const meta={
     schema:"zzx.vss.record.v1",
     created:new Date().toISOString(),
     subjectId:$("subject-id").value.trim()||crypto.randomUUID?.()||"local-subject",
     jurisdiction:$("jurisdiction").value.trim(),
     dob:$("dob").value,
     threshold:+$("threshold").value,
     ageAtSeal:ageFromDOB($("dob").value),
     idHash,selfieHash,
     verification:{
       matchMethod:$("match-method").value,
       matchDecision:$("match-decision").value,
       matchScore:$("match-score").value===""?null:+$("match-score").value,
       facialAgeEstimation:false,
       oneToManyIdentification:false
     }
   };
   const [idEnc,selfieEnc,metaEnc]=await Promise.all([
      encryptBytes(new Uint8Array(await idFile.arrayBuffer()),pass),
      encryptBytes(new Uint8Array(await selfieFile.arrayBuffer()),pass),
      encryptBytes(enc.encode(JSON.stringify(meta)),pass)
   ]);
   envelope={schema:"zzx.vss.encrypted-envelope.v1",created:new Date().toISOString(),subjectId:meta.subjectId,crypto:{dataCipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:310000},artifacts:{id:idEnc,selfie:selfieEnc,metadata:metaEnc},hashes:{id:idHash,selfie:selfieHash},releasePolicy:{userAuthorizationRequired:true,authoritySignatureRequired:true,dualControl:true,automaticCourtAccess:false}};
   $("vault-out").textContent=JSON.stringify({...envelope,artifacts:{id:{...idEnc,ciphertext:`<${idEnc.ciphertext.length/2} encrypted bytes>`},selfie:{...selfieEnc,ciphertext:`<${selfieEnc.ciphertext.length/2} encrypted bytes>`},metadata:{...metaEnc,ciphertext:`<${metaEnc.ciphertext.length/2} encrypted bytes>`}}},null,2);
   $("sealed").textContent="SEALED";
 }catch(e){$("vault-out").textContent="SEAL ERROR: "+e.message}
};
$("authority").onclick=async()=>{
 const text=$("authority-text").value.trim();
 if(!text){$("authority-out").textContent="Paste an authority approval/signature artifact or signed authorization descriptor.";return}
 const digest=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text))));
 authoritySig={recorded:new Date().toISOString(),sha256:digest,descriptor:text.slice(0,240),cryptographicSignatureVerified:false,manualReviewRequired:true};
 $("authority-out").textContent=JSON.stringify(authoritySig,null,2);
};
$("release").onclick=async()=>{
 try{
   if(!envelope)throw new Error("No sealed envelope.");
   if(!$("user-approve").checked)throw new Error("User authorization missing.");
   if(!authoritySig)throw new Error("Authority approval artifact missing.");
   if(!$("review-approve").checked)throw new Error("Human review approval missing.");
   const pass=$("vault-pass").value;
   const meta=JSON.parse(dec.decode(await decryptBytes(envelope.artifacts.metadata,pass)));
   $("release-out").textContent=JSON.stringify({released:true,metadata:meta,artifactRelease:"encrypted bytes remain sealed in browser demo",authorityApproval:authoritySig.sha256,userAuthorization:true,humanReview:true,automaticCourtAccess:false},null,2);
 }catch(e){$("release-out").textContent="RELEASE BLOCKED: "+e.message}
};
function dl(text,name,type="application/json"){
 const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");
 a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800);
}
$("export-envelope").onclick=()=>{if(envelope)dl(JSON.stringify(envelope,null,2),"zzxvss-encrypted-envelope.json")};
$("policy").onclick=()=>{
 const p={schema:"zzx.vss.policy.v1",created:new Date().toISOString(),ageThreshold:+$("threshold").value,principles:{dataMinimization:true,localEncryption:true,noFacialAgeEstimation:true,noOneToManyIdentification:true,dualControlRelease:true,automaticCourtAccess:false,humanReviewRequired:true},retentionDays:+$("retention").value||30,deletion:"operator-controlled policy event",legalNote:"Deployers must configure jurisdiction-specific requirements and obtain appropriate legal review."};
 $("policy-out").textContent=JSON.stringify(p,null,2);
};
window.ZZXVSS=Object.freeze({version:"0.1.0-alpha-web",facialAgeEstimation:false,oneToManyIdentification:false,automaticCourtAccess:false,localEncryption:true});
})();
