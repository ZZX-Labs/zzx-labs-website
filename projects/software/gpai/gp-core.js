(()=>{"use strict";
const Z={
 id(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now()},
 esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))},
 dl(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)},
 async sha256Blob(blob){const d=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")},
 speak(text,rate=1,pitch=1){if(!("speechSynthesis" in window))throw new Error("Speech synthesis unavailable.");speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=rate;u.pitch=pitch;speechSynthesis.speak(u);return u},
 recognition(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return null;const r=new R();r.continuous=false;r.interimResults=false;return r},
 job(modality,prompt,opts={}){return{schema:"zzx.gp.job.v1",id:Z.id(),created:new Date().toISOString(),modality,prompt,options:opts,status:"planned",note:"Browser companion exports a generation job manifest; native/model execution is external."}}
};
window.GPWebCore=Object.freeze(Z);
})();
