// meter.js — horizontal 8-segment LED rows (L & R)
import { $$ } from './utils.js';

export function ensureMeter(audio){
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) return null;
  let audioCtx, srcNode, splitter, analyserL, analyserR, raf;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    srcNode  = audioCtx.createMediaElementSource(audio);
    splitter = audioCtx.createChannelSplitter(2);
    analyserL= audioCtx.createAnalyser(); analyserR = audioCtx.createAnalyser();
    analyserL.fftSize=256; analyserR.fftSize=256;
    srcNode.connect(splitter);
    splitter.connect(analyserL,0);
    splitter.connect(analyserR,1);
    srcNode.connect(audioCtx.destination);
  }catch{ return null; }

  const ledsL = $$('[data-hled-L0],[data-hled-L1],[data-hled-L2],[data-hled-L3],[data-hled-L4],[data-hled-L5],[data-hled-L6],[data-hled-L7]');
  const ledsR = $$('[data-hled-R0],[data-hled-R1],[data-hled-R2],[data-hled-R3],[data-hled-R4],[data-hled-R5],[data-hled-R6],[data-hled-R7]');
  const bufL = new Uint8Array(analyserL.frequencyBinCount);
  const bufR = new Uint8Array(analyserR.frequencyBinCount);

  const rms = arr => { let s=0; for (let i=0;i<arr.length;i++) s+=arr[i]*arr[i]; return Math.sqrt(s/arr.length)/255; };
  const paint = (leds, v) => {
    const total=8, lit=Math.round(v*total);
    leds.forEach((el,i)=> el.classList.toggle('on', i<lit));
  };

  (function loop(){
    analyserL.getByteTimeDomainData(bufL);
    analyserR.getByteTimeDomainData(bufR);
    const vL = Math.min(1, Math.max(0, (rms(bufL)-0.02)*1.4));
    const vR = Math.min(1, Math.max(0, (rms(bufR)-0.02)*1.4));
    paint(ledsL, vL); paint(ledsR, vR);
    raf = requestAnimationFrame(loop);
  })();

  return () => { if (raf) cancelAnimationFrame(raf); };
}
