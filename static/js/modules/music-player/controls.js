// static/js/modules/music-player/controls.js
// Wire up playback, transport, and source-switch controls to player logic.

import { togglePlay, stop, toggleMute } from './audio.js';

/**
 * Attach event listeners to player UI buttons and inputs.
 * @param {HTMLElement} root - Player root element
 * @param {object} R - Refs from buildUI()
 * @param {HTMLAudioElement} audio - <audio> element
 * @param {object} state - Player state object (queue, cursor, loopMode, activeSource, lastNow, manifest)
 * @param {object} cfg - Player config
 * @param {object} hooks - callbacks / helpers used by controls:
 *   {
 *     playAt(i), prev(), next(),
 *     onPickStations(), onPickMusic(),
 *     setSourceUI(activeSource, selStations, selMusic),
 *     setPlayIcon(isPlaying), setMuteIcon(audio),
 *     clearMetaTimer?(), onStopMeta?(), // optional meta/ticker cleanup
 *   }
 */
export function wireControls(root, R, audio, state, cfg, hooks) {
  const { btns, seek, vol, switchKnob, selStations, selMusic } = R;
  const {
    playAt, prev, next,
    onPickStations, onPickMusic,
    setSourceUI, setPlayIcon, setMuteIcon,
  } = hooks;

  /* ---------------- Core Playback ---------------- */
  btns.play?.addEventListener('click', () => togglePlay(audio, setPlayIcon));

  btns.stop?.addEventListener('click', () => {
    // Stop playback and any metadata polling
    hooks.onStopMeta?.();
    stop(audio, setPlayIcon);
    state.lastNow = '';
  });

  btns.prev?.addEventListener('click', prev);
  btns.next?.addEventListener('click', next);

  /* ---------------- Shuffle / Loop ---------------- */
  btns.shuffle?.addEventListener('click', () => {
    cfg.shuffle = !cfg.shuffle;
    btns.shuffle.classList.toggle('active', cfg.shuffle);
  });

  btns.loop?.addEventListener('click', () => {
    state.loopMode = (state.loopMode === 'all') ? 'none' : 'all';
    btns.loop.classList.toggle('active', state.loopMode === 'all');
    btns.loop1?.classList.remove('active');
  });

  btns.loop1?.addEventListener('click', () => {
    state.loopMode = (state.loopMode === 'one') ? 'none' : 'one';
    btns.loop1.classList.toggle('active', state.loopMode === 'one');
    btns.loop?.classList.remove('active');
  });

  /* ---------------- Mute ---------------- */
  btns.mute?.addEventListener('click', () => toggleMute(audio, setMuteIcon));

  /* ---------------- Seek + Volume ---------------- */
  seek?.addEventListener('input', () => {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (seek.value / 1000) * audio.duration;
  });

  vol?.addEventListener('input', () => {
    const v = parseFloat(vol.value);
    if (!Number.isFinite(v)) return;
    audio.volume = Math.max(0, Math.min(1, v));
    // no need to persist to cfg.volume; slider owns it live
  });

  /* ---------------- Source Toggle ---------------- */
  switchKnob?.addEventListener('click', () => {
    const wasStations = switchKnob.getAttribute('aria-pressed') === 'true';
    const nextSource = wasStations ? 'playlists' : 'stations';

    // Update knob UI first
    switchKnob.setAttribute('aria-pressed', nextSource === 'stations' ? 'true' : 'false');

    // Stop any live metadata ticker/polling and reset lastNow
    hooks.onStopMeta?.();
    hooks.clearMetaTimer?.();
    state.lastNow = '';

    // Switch source and repaint selects
    state.activeSource = nextSource;
    setSourceUI(state.activeSource, selStations, selMusic);

    if (state.activeSource === 'stations') onPickStations();
    else onPickMusic();
  });

  /* ---------------- Select changes ---------------- */
  selStations?.addEventListener('change', () => {
    if (state.activeSource === 'stations') {
      hooks.onStopMeta?.();
      hooks.clearMetaTimer?.();
      state.lastNow = '';
      onPickStations();
    }
  });

  selMusic?.addEventListener('change', () => {
    if (state.activeSource === 'playlists') {
      hooks.onStopMeta?.();
      hooks.clearMetaTimer?.();
      state.lastNow = '';
      onPickMusic();
    }
  });

  /* ---------------- Keyboard Shortcuts ---------------- */
  // Scope to root to avoid hijacking page-wide shortcuts
  root.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(audio, setPlayIcon); }
    if (e.code === 'ArrowLeft') prev();
    if (e.code === 'ArrowRight') next();
    if (e.key && e.key.toLowerCase() === 'm') toggleMute(audio, setMuteIcon);
  });

  /* ---------------- List item selection (from ui.js) ---------------- */
  // If ui.js dispatches CustomEvent('mp:select-index', { detail: { index } })
  root.addEventListener('mp:select-index', (e) => {
    const i = Number(e?.detail?.index);
    if (Number.isInteger(i)) playAt(i);
  });
}
