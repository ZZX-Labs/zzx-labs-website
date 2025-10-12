// /music/modules/meter.js — calibrated dBFS VU (8-segment, L/R) — hotter + live RMS
import { $$ } from './utils.js';

// Tweakables
const FLOOR_DB   = -60;   // minimum visible level (dBFS)
const DRIVE_DB   = +9;    // gain offset in dB (boosts visual sensitivity)
const ATTACK     = 0.30;  // attack time constant (0–1)
const RELEASE    = 0.12;  // release time constant (0–1)
const SMOOTHING  = 0.65;  // analyser smoothing (0–1)
const FFT_SIZE   = 256;   // analyser FFT size

export function ensureMeter(audio, root){
  if (!audio || typeof window === 'undefined') return null;
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) return null;
  if (audio.__vu?.stop) return audio.__vu.stop;

  if (!root)
    root = audio.closest?.('[data-mp]') ||
           document.querySelector('[data-mp]') ||
           document;

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
    aL.fftSize = FFT_SIZE; aR.fftSize = FFT_SIZE;
    aL.smoothingTimeConstant = SMOOTHING;
    aR.smoothingTimeConstant = SMOOTHING;
    src.connect(split);
    split.connect(aL, 0);
    split.connect(aR, 1);
    src.connect(ctx.destination);
  }catch{ return null; }

  const useFloat = !!aL.getFloatTimeDomainData;
  const bL = useFloat ? new Float32Array(aL.fftSize) : new Uint8Array(aL.fftSize);
  const bR = useFloat ? new Float32Array(aR.fftSize) : new Uint8Array(aR.fftSize);
  let envL = 0, envR = 0;

  // Convert RMS (0–1) → dBFS (–∞ to 0)
  const rms = (arr, isFloat) => {
    let s = 0, v = 0;
    if (isFloat){
      for (let i=0;i<arr.length;i++){ v = arr[i]; s += v*v; }
    } else {
      for (let i=0;i<arr.length;i++){ v = (arr[i]-128)/128; s += v*v; }
    }
    return Math.sqrt(s / arr.length);
  };

  const rmsToDb = (val) => 20 * Math.log10(val || 1e-9);

  const normDb = (db) => {
    const adj = db + DRIVE_DB;
    const clamped = Math.max(FLOOR_DB, Math.min(0, adj));
    return (clamped - FLOOR_DB) / -FLOOR_DB; // 0..1
  };

  const paint = (leds, value) => {
    let lit = Math.ceil(value * 8 - 0.001);
    if (lit < 0) lit = 0; if (lit > 8) lit = 8;
    for (let i=0;i<8;i++){
      const on = i < lit;
      const el = leds[i];
      if (el && el.classList.contains('on') !== on) el.classList.toggle('on', on);
    }
  };

  const frame = () => {
    if (useFloat){ aL.getFloatTimeDomainData(bL); aR.getFloatTimeDomainData(bR); }
    else         { aL.getByteTimeDomainData(bL);  aR.getByteTimeDomainData(bR); }

    const dBL = rmsToDb(rms(bL, useFloat));
    const dBR = rmsToDb(rms(bR, useFloat));
    const vL = normDb(dBL);
    const vR = normDb(dBR);

    envL = (vL > envL) ? envL + (vL - envL)*ATTACK : envL + (vL - envL)*RELEASE;
    envR = (vR > envR) ? envR + (vR - envR)*ATTACK : envR + (vR - envR)*RELEASE;

    paint(ledsL, envL);
    paint(ledsR, envR);
    raf = requestAnimationFrame(frame);
  };

  const resumeCtx = async () => { try { if (ctx?.state === 'suspended') await ctx.resume(); } catch {} };
  const onPlay = () => resumeCtx();
  const onClickOnce = () => { resumeCtx(); root.removeEventListener('click', onClickOnce, { once:true }); };

  audio.addEventListener('play', onPlay);
  root.addEventListener('click', onClickOnce, { once:true });

  const onVis = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf), raf = 0;
    } else if (!raf) {
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  raf = requestAnimationFrame(frame);

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', onVis);
    audio.removeEventListener('play', onPlay);
    try{ root.removeEventListener('click', onClickOnce, { once:true }); }catch{}
    try{ src?.disconnect(); split?.disconnect(); aL?.disconnect?.(); aR?.disconnect?.(); }catch{}
    audio.__vu = undefined;
  };
  audio.__vu = { stop };
  return stop;
}
