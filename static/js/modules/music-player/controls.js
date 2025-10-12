// static/js/modules/music-player/controls.js
// Wire up playback, transport, and source-switch controls to player logic.

import { togglePlay, stop, toggleMute } from './audio.js';

/**
 * Attach event listeners to player UI buttons and inputs.
 * @param {object} R - Refs from buildUI()
 * @param {object} audio - <audio> element
 * @param {object} state - Player state object (queue, cursor, loopMode, etc.)
 * @param {object} cfg - Player config
 * @param {object} hooks - callbacks for playback control (playAt, prev, next, etc.)
 */
export function wireControls(R, audio, state, cfg, hooks) {
  const { btns, seek, vol, switchKnob, selStations, selMusic } = R;
  const { playAt, prev, next, onPickStations, onPickMusic, setSourceUI } = hooks;

  /* ---------------- Core Playback ---------------- */
  btns.play?.addEventListener('click', () => togglePlay(audio, hooks.setPlayIcon));
  btns.stop?.addEventListener('click', () => { stop(audio, hooks.setPlayIcon); state.lastNow=''; });
  btns.prev?.addEventListener('click', prev);
  btns.next?.addEventListener('click', next);

  /* ---------------- Shuffle / Loop ---------------- */
  btns.shuffle?.addEventListener('click', ()=>{
    cfg.shuffle = !cfg.shuffle;
    btns.shuffle.classList.toggle('active', cfg.shuffle);
  });
  btns.loop?.addEventListener('click', ()=>{
    state.loopMode = (state.loopMode==='all')?'none':'all';
    btns.loop.classList.toggle('active', state.loopMode==='all');
    btns.loop1.classList.remove('active');
  });
  btns.loop1?.addEventListener('click', ()=>{
    state.loopMode = (state.loopMode==='one')?'none':'one';
    btns.loop1.classList.toggle('active', state.loopMode==='one');
    btns.loop.classList.remove('active');
  });

  /* ---------------- Mute ---------------- */
  btns.mute?.addEventListener('click', () => toggleMute(audio, hooks.setMuteIcon));

  /* ---------------- Seek + Volume ---------------- */
  seek?.addEventListener('input', () => {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (seek.value / 1000) * audio.duration;
  });
  vol?.addEventListener('input', () => {
    const v = parseFloat(vol.value);
    if (!Number.isFinite(v)) return;
    audio.volume = Math.max(0, Math.min(1, v));
  });

  /* ---------------- Source Toggle ---------------- */
  switchKnob?.addEventListener('click', () => {
    const pressed = switchKnob.getAttribute('aria-pressed') === 'true';
    state.activeSource = pressed ? 'playlists' : 'stations';
    setSourceUI(state.activeSource, selStations, selMusic);
    hooks.clearMetaTimer?.();
    state.lastNow = '';
    if (state.activeSource === 'stations') onPickStations();
    else onPickMusic();
  });

  /* ---------------- Keyboard Shortcuts ---------------- */
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(audio, hooks.setPlayIcon); }
    if (e.code === 'ArrowLeft') prev();
    if (e.code === 'ArrowRight') next();
    if (e.key?.toLowerCase() === 'm') toggleMute(audio, hooks.setMuteIcon);
  });
}
