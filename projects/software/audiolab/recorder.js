(() => {
  "use strict";

  class AudioLabRecorder {
    constructor() {
      this.stream=null;
      this.recorder=null;
      this.chunks=[];
      this.blob=null;
      this.startedAt=0;
      this.timer=null;
      this.onState=()=>{};
    }

    async start() {
      if(!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this browser.");
      }
      if(typeof MediaRecorder==="undefined") {
        throw new Error("MediaRecorder is unavailable.");
      }

      this.stream=await navigator.mediaDevices.getUserMedia({audio:true});
      this.chunks=[];
      this.blob=null;

      const preferred=[
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm"
      ].find(type=>MediaRecorder.isTypeSupported?.(type));

      this.recorder=new MediaRecorder(
        this.stream,
        preferred ? {mimeType:preferred} : undefined
      );

      this.recorder.ondataavailable=e=>{
        if(e.data?.size) this.chunks.push(e.data);
      };

      this.recorder.onstop=()=>{
        this.blob=new Blob(this.chunks,{
          type:this.recorder.mimeType||"audio/webm"
        });
        this.cleanupStream();
        this.onState({state:"ready",blob:this.blob,duration:(Date.now()-this.startedAt)/1000});
      };

      this.recorder.start(250);
      this.startedAt=Date.now();
      this.timer=setInterval(()=>{
        this.onState({state:"recording",duration:(Date.now()-this.startedAt)/1000});
      },250);

      this.onState({state:"recording",duration:0});
    }

    stop() {
      if(this.recorder&&this.recorder.state!=="inactive") {
        clearInterval(this.timer);
        this.timer=null;
        this.recorder.stop();
      }
    }

    cleanupStream() {
      if(this.stream) {
        this.stream.getTracks().forEach(t=>t.stop());
        this.stream=null;
      }
    }

    download(filename="audiolab-recording") {
      if(!this.blob) throw new Error("No recording is ready.");
      const ext=this.blob.type.includes("ogg")?"ogg":"webm";
      const url=URL.createObjectURL(this.blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`${filename}.${ext}`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }

  window.AudioLabRecorder=AudioLabRecorder;
})();
