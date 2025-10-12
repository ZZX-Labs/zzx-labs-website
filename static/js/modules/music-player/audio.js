// static/js/modules/music-player/audio.js
// Small audio-layer helpers used by the player controller

/** Create and prime an <audio> element */
export function createAudio(initialVolume = 0.25) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.playsInline = true; // better mobile/iOS behavior
  audio.volume = clamp01(initialVolume);
  return audio;
}

/** Play a single URL on an existing audio element */
export async function playUrl(audio, url) {
  if (!audio) throw new Error('audio not provided');
  audio.src = url;
  // Ensure the new src is committed before play (helps some browsers)
  try { audio.load?.(); } catch {}
  await audio.play();
  return url;
}

/** Try a list of stream endpoints until one succeeds; returns the working URL */
export async function tryPlayStream(audio, urls) {
  if (!Array.isArray(urls) || !urls.length) throw new Error('No stream URLs');
  let lastErr;
  for (const u of urls) {
    try { return await playUrl(audio, u); }
    catch (e) { lastErr = e; }
  }
  throw (lastErr || new Error('No playable stream endpoints'));
}

/** Wire core audio events to simple callbacks */
export function wireCoreAudioEvents(audio, {
  onTime = () => {},
  onDuration = () => {},
  onEnded = () => {},
} = {}) {
  const timeH = () => onTime(audio);
  const durH  = () => onDuration(audio);
  const endH  = () => onEnded(audio);

  audio.addEventListener('timeupdate', timeH);
  audio.addEventListener('durationchange', durH);
  audio.addEventListener('ended', endH);

  // Return an unsubscriber
  return () => {
    audio.removeEventListener('timeupdate', timeH);
    audio.removeEventListener('durationchange', durH);
    audio.removeEventListener('ended', endH);
  };
}

/** Play/Pause toggle with external icon updater */
export async function togglePlay(audio, setPlayIcon = () => {}) {
  if (!audio.src) return; // nothing loaded
  if (audio.paused) {
    try { await audio.play(); setPlayIcon(true); } catch {}
  } else {
    audio.pause(); setPlayIcon(false);
  }
}

/** Hard stop + reset playhead (keeps current src so user can resume) */
export function stop(audio, setPlayIcon = () => {}) {
  audio.pause();
  try { audio.currentTime = 0; } catch {}
  setPlayIcon(false);
}

/** Toggle mute and allow UI to update */
export function toggleMute(audio, setMuteIcon = () => {}) {
  audio.muted = !audio.muted;
  setMuteIcon(audio);
}

/* ----------------- small local utils ----------------- */
function clamp01(v) {
  const n = Number.isFinite(v) ? v : 0.25;
  return Math.min(1, Math.max(0, n));
}
