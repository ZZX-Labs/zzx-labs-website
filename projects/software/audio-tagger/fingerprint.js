(() => {
  "use strict";

  async function hexDigest(buffer) {
    const digest=await crypto.subtle.digest("SHA-256",buffer);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function fileSha256(file) {
    return hexDigest(await file.arrayBuffer());
  }

  async function acousticFingerprint(file) {
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) throw new Error("Web Audio is unavailable.");

    const ctx=new Ctx();
    try {
      const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
      const targetRate=8000;
      const frameSeconds=.5;
      const frameCount=Math.min(240,Math.max(1,Math.ceil(decoded.duration/frameSeconds)));
      const feature=[];

      for(let frame=0;frame<frameCount;frame++) {
        const t0=frame*frameSeconds;
        const t1=Math.min(decoded.duration,t0+frameSeconds);
        const i0=Math.floor(t0*decoded.sampleRate);
        const i1=Math.max(i0+1,Math.floor(t1*decoded.sampleRate));

        let sum=0,peak=0,zc=0,count=0,prev=0;
        const stride=Math.max(1,Math.floor(decoded.sampleRate/targetRate));

        for(let i=i0;i<i1;i+=stride) {
          let v=0;
          for(let c=0;c<decoded.numberOfChannels;c++) {
            v+=decoded.getChannelData(c)[i]||0;
          }
          v/=decoded.numberOfChannels;

          sum+=v*v;
          peak=Math.max(peak,Math.abs(v));
          if(count&&((prev<0&&v>=0)||(prev>=0&&v<0)))zc++;
          prev=v;
          count++;
        }

        const rms=Math.sqrt(sum/Math.max(1,count));
        feature.push(
          `${Math.round(rms*10000)},${Math.round(peak*10000)},${Math.round((zc/Math.max(1,count))*10000)}`
        );
      }

      const signature=[
        "ATG1",
        Math.round(decoded.duration*100),
        decoded.numberOfChannels,
        feature.join(";")
      ].join("|");

      return {
        algorithm:"ATG1-PCM-SUMMARY-SHA256",
        hash:await hexDigest(new TextEncoder().encode(signature)),
        duration:decoded.duration,
        sampleRate:decoded.sampleRate,
        channels:decoded.numberOfChannels,
        frames:frameCount
      };
    } finally {
      await ctx.close();
    }
  }

  window.AudioTaggerFingerprint=Object.freeze({
    fileSha256,
    acousticFingerprint
  });
})();
