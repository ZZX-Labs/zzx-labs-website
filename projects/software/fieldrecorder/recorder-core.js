(()=>{"use strict";
class ZZXRecorder{
 constructor(){this.stream=null;this.recorder=null;this.chunks=[];this.started=0;this.sessions=[];this.timer=0}
 async devices(){const ds=await navigator.mediaDevices.enumerateDevices();return ds.filter(d=>d.kind==="audioinput")}
 async acquire(deviceId=""){if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=await navigator.mediaDevices.getUserMedia({audio:deviceId?{deviceId:{exact:deviceId}}:true});return this.stream}
 bestMime(){return["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/webm","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t))||""}
 async start(deviceId=""){if(!this.stream)await this.acquire(deviceId);this.chunks=[];const mime=this.bestMime();this.recorder=new MediaRecorder(this.stream,mime?{mimeType:mime}:undefined);this.started=Date.now();this.recorder.ondataavailable=e=>{if(e.data?.size)this.chunks.push(e.data)};this.recorder.start(1000);return{mime:this.recorder.mimeType,started:this.started}}
 stop(){return new Promise((resolve,reject)=>{if(!this.recorder||this.recorder.state==="inactive"){reject(new Error("Not recording."));return}this.recorder.onstop=async()=>{const blob=new Blob(this.chunks,{type:this.recorder.mimeType||"application/octet-stream"}),buf=new Uint8Array(await blob.arrayBuffer()),dig=await crypto.subtle.digest("SHA-256",buf),sha=[...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,"0")).join(""),s={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),started:new Date(this.started).toISOString(),ended:new Date().toISOString(),durationMs:Date.now()-this.started,mime:blob.type,bytes:blob.size,sha256:sha,blob};this.sessions.unshift(s);resolve(s)};this.recorder.stop()})}
 pause(){if(this.recorder?.state==="recording")this.recorder.pause()}
 resume(){if(this.recorder?.state==="paused")this.recorder.resume()}
 close(){if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null}
}
window.ZZXRecorder=ZZXRecorder;
})();
