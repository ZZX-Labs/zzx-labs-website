(() => {
  "use strict";

  function clamp(v,a,b) { return Math.min(b,Math.max(a,v)); }

  function makeDistortionCurve(amount=0, samples=44100) {
    const n = Math.max(0, Number(amount)||0);
    if (n <= 0) {
      const curve = new Float32Array(samples);
      for (let i=0;i<samples;i++) curve[i] = (i*2/(samples-1))-1;
      return curve;
    }
    const curve = new Float32Array(samples);
    const deg = Math.PI/180;
    for (let i=0;i<samples;i++) {
      const x = i*2/samples - 1;
      curve[i] = ((3+n)*x*20*deg)/(Math.PI+n*Math.abs(x));
    }
    return curve;
  }

  function analyzeChannelData(channels) {
    let peak=0, sum=0, count=0, crossings=0;
    for (const data of channels) {
      let prev = data[0] || 0;
      for (let i=0;i<data.length;i++) {
        const v = data[i];
        const av = Math.abs(v);
        if (av>peak) peak=av;
        sum += v*v;
        count++;
        if (i && ((prev<0&&v>=0)||(prev>=0&&v<0))) crossings++;
        prev=v;
      }
    }
    const rms=Math.sqrt(sum/Math.max(1,count));
    return {
      peak,rms,
      crestFactor:rms?peak/rms:null,
      zeroCrossings:crossings
    };
  }

  function processBuffer(buffer, options={}) {
    const sr=buffer.sampleRate;
    const start=clamp(Number(options.start)||0,0,buffer.duration);
    const endRaw=Number(options.end);
    const end=clamp(endRaw>start?endRaw:buffer.duration,start,buffer.duration);
    const i0=Math.floor(start*sr);
    const i1=Math.floor(end*sr);
    const len=Math.max(1,i1-i0);
    const channels=[];
    let peak=0;

    for(let c=0;c<buffer.numberOfChannels;c++) {
      const src=buffer.getChannelData(c);
      const dst=new Float32Array(len);
      dst.set(src.subarray(i0,i1));
      channels.push(dst);
      for(const v of dst) peak=Math.max(peak,Math.abs(v));
    }

    const target=Math.pow(10,(Number(options.peakDb)||-1)/20);
    const gain=options.normalize&&peak>0?target/peak:1;
    const fadeInSamples=Math.min(len,Math.floor(Math.max(0,Number(options.fadeIn)||0)*sr));
    const fadeOutSamples=Math.min(len,Math.floor(Math.max(0,Number(options.fadeOut)||0)*sr));

    for(const ch of channels) {
      for(let i=0;i<len;i++) {
        let g=gain;
        if(fadeInSamples&&i<fadeInSamples) g*=i/fadeInSamples;
        if(fadeOutSamples&&i>=len-fadeOutSamples) g*=(len-i-1)/fadeOutSamples;
        ch[i]=clamp(ch[i]*g,-1,1);
      }
    }

    return {channels,sampleRate:sr,start,end,gain};
  }

  function wavBlob(channels,sampleRate) {
    const numCh=channels.length;
    const len=channels[0].length;
    const buffer=new ArrayBuffer(44+len*numCh*2);
    const view=new DataView(buffer);

    const write=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
    write(0,"RIFF");
    view.setUint32(4,36+len*numCh*2,true);
    write(8,"WAVE");
    write(12,"fmt ");
    view.setUint32(16,16,true);
    view.setUint16(20,1,true);
    view.setUint16(22,numCh,true);
    view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*numCh*2,true);
    view.setUint16(32,numCh*2,true);
    view.setUint16(34,16,true);
    write(36,"data");
    view.setUint32(40,len*numCh*2,true);

    let o=44;
    for(let i=0;i<len;i++) {
      for(let c=0;c<numCh;c++) {
        const v=clamp(channels[c][i],-1,1);
        view.setInt16(o,v<0?v*32768:v*32767,true);
        o+=2;
      }
    }
    return new Blob([buffer],{type:"audio/wav"});
  }

  function generateSignal(type, frequency, duration, sampleRate=48000, gain=.35) {
    const len=Math.max(1,Math.floor(duration*sampleRate));
    const ch=new Float32Array(len);
    let seed=0x12345678;

    for(let i=0;i<len;i++) {
      const t=i/sampleRate;
      let v=0;

      if(type==="sine") v=Math.sin(2*Math.PI*frequency*t);
      else if(type==="square") v=Math.sin(2*Math.PI*frequency*t)>=0?1:-1;
      else if(type==="sawtooth") v=2*((frequency*t)-Math.floor(.5+frequency*t));
      else if(type==="triangle") v=2*Math.abs(2*((frequency*t)-Math.floor(frequency*t+.5)))-1;
      else {
        seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5;
        v=((seed>>>0)/0xffffffff)*2-1;
      }

      ch[i]=clamp(v*gain,-1,1);
    }

    return {channels:[ch],sampleRate};
  }

  window.AudioLabDSP=Object.freeze({
    clamp,
    makeDistortionCurve,
    analyzeChannelData,
    processBuffer,
    wavBlob,
    generateSignal
  });
})();
