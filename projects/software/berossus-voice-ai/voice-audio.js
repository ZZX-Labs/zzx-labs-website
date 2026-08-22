(() => {
  "use strict";

  async function decode(file,ctx=null) {
    const own=!ctx;
    ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();
    try{return await ctx.decodeAudioData(await file.arrayBuffer());}
    finally{if(own)await ctx.close();}
  }

  function metrics(buffer) {
    let peak=0,sum=0,count=0;
    for(let c=0;c<buffer.numberOfChannels;c++) {
      const d=buffer.getChannelData(c);
      for(const v of d){peak=Math.max(peak,Math.abs(v));sum+=v*v;count++;}
    }
    return {duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,peak,rms:Math.sqrt(sum/Math.max(1,count))};
  }

  function vad(buffer,{frameMs=30,threshold=.015,mergeGapMs=250}={}) {
    const sr=buffer.sampleRate,frame=Math.max(1,Math.floor(sr*frameMs/1000)),frames=[];
    const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));

    for(let start=0;start<buffer.length;start+=frame) {
      const end=Math.min(buffer.length,start+frame);
      let sum=0,count=0;
      for(let i=start;i<end;i++) {
        let v=0;for(const ch of channels)v+=ch[i]||0;v/=channels.length;
        sum+=v*v;count++;
      }
      frames.push({start:start/sr,end:end/sr,rms:Math.sqrt(sum/Math.max(1,count))});
    }

    const raw=[];
    let cur=null;
    for(const f of frames) {
      if(f.rms>=threshold) {
        if(!cur)cur={start:f.start,end:f.end,peakRms:f.rms};
        else{cur.end=f.end;cur.peakRms=Math.max(cur.peakRms,f.rms);}
      } else if(cur){raw.push(cur);cur=null;}
    }
    if(cur)raw.push(cur);

    const gap=mergeGapMs/1000,merged=[];
    for(const seg of raw) {
      const prev=merged.at(-1);
      if(prev&&seg.start-prev.end<=gap){prev.end=seg.end;prev.peakRms=Math.max(prev.peakRms,seg.peakRms);}
      else merged.push({...seg});
    }
    return merged.map((s,i)=>({id:`seg-${i+1}`,start:s.start,end:s.end,duration:s.end-s.start,peakRms:s.peakRms,speaker:"speaker_1",text:""}));
  }

  window.BerossusVoiceAudio=Object.freeze({decode,metrics,vad});
})();
