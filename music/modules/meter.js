// /music/modules/meter.js — hotter, smoother 8-segment VU (L/R)
import { $$ } from './utils.js';

// Tweakables
const DRIVE  = 2.2;   // input gain -> higher = hotter meter
const CURVE  = 1.3;   // non-linear shaping (1 = linear, >1 = more aggressive)
const NOISE  = 0.008; // gate (ignore tiny noise)
const ATTACK = 0.25;  // envelope attack  (0..1)
const RELEASE= 0.12;  // envelope release (0..1)

export function ensureMeter(audio, root){
  if (!audio || typeof window === 'undefined') return null;
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) return null;

  // Idempotent per <audio>
  if (audio.__vu?.stop) return audio.__vu.stop;

  // Scope to this player root
  if (!root) root = audio.closest?.('[data-mp]') || document.querySelector('[data-mp]') || document;

  // LED nodes (two rows, 8 each)
  const ledsL = $$('[data-hled-L0],[data-hled-L1],[data-hled-L2],[data-hled-L3],[data-hled-L4],[data-hled-L5],[data-hled-L6],[data-hled-L7]', root);
  const ledsR = $$('[data-hled-R0],[data-hled-R1],[data-hled-R2],[data-hled-R3],[data-hled-R4],[data-hled-R5],[data-hled-R6],[data-hled-R7]', root);
  if (!ledsL.length || !ledsR.length) return null;

  let ctx, src, split, aL, aR, raf = 0;
  try{
    ctx  = new (window.AudioContext || window.webkitAudioContext)();
    src  = ctx.createMediaElementSource(audio);
    split= ctx.createChannelSplitter(2);
    aL   = ctx.createAnalyser();
    aR   = ctx.createAnalyser();

    aL.fftSize = 256; aR.fftSize = 256;
    aL.smoothingTimeConstant = 0.65;
    aR.smoothingTimeConstant = 0.65;

    src.connect(split);
    split.connect(aL, 0);
    split.connect(aR, 1);
    src.connect(ctx.destination);
  }catch{ return null; }

  const useFloat = !!aL.getFloatTimeDomainData;
  const bL = useFloat ? new Float32Array(aL.fftSize) : new Uint8Array(aL.fftSize);
  const bR = useFloat ? new Float32Array(aR.fftSize) : new Uint8Array(aR.fftSize);

  let envL = 0, envR = 0;

  const rms = (arr, isFloat) => {
    let s=0, v=0;
    if (isFloat){
      for (let i=0;i<arr.length;i++){ v = arr[i]; s += v*v; }
      return Math.sqrt(s/arr.length);
    } else {
      for (let i=0;i<arr.length;i++){ v = (arr[i]-128)/128; s += v*v; }
      return Math.sqrt(s/arr.length);
    }
  };

  const shape = (x) => {
    // apply drive and curve, clamp 0..1
    const driven = Math.min(1, Math.max(0, x * DRIVE));
    const shaped = Math.pow(driven, CURVE);
    // gate tiny noise
    return shaped < NOISE ? 0 : shaped;
  };

  const paint = (leds, value) => {
    // 0..1 -> 0..8 segments
    let lit = Math.round(value * 8);
    if (lit < 0) lit = 0; if (lit > 8) lit = 8;
    for (let i=0;i<8;i++){
      const on = i < lit;
      const el = leds[i];
      if (el && el.classList.contains('on') !== on) el.classList.toggle('on', on);
    }
  };

  function tick(){
    if (useFloat){ aL.getFloatTimeDomainData(bL); aR.getFloatTimeDomainData(bR); }
    else         { aL.getByteTimeDomainData(bL);  aR.getByteTimeDomainData(bR); }

    const vL = shape(rms(bL, useFloat));
    const vR = shape(rms(bR, useFloat));

    // Simple envelope follower (attack/release)
    envL = (vL > envL) ? envL + (vL - envL)*ATTACK : envL + (vL - envL)*RELEASE;
    envR = (vR > envR) ? envR + (vR - envR)*ATTACK : envR + (vR - envR)*RELEASE;

    paint(ledsL, envL);
    paint(ledsR, envR);

    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    try{ src?.disconnect(); }catch{}
    try{ split?.disconnect(); }catch{}
    try{ aL?.disconnect?.(); aR?.disconnect?.(); }catch{}
    audio.__vu = undefined;
  };
  audio.__vu = { stop };
  return stop;
}
