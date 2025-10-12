// /music/modules/controls.js — wiring for buttons, seek, keys, toggle
import { setMuteIcon } from './ui.js';

export function wireControls(refs, audio, cfg, handlers){
  const { playPause, stop, prev, next, onPickStations, onPickMusic, setSwitch } = handlers;

  // Toggle Radio/Playlists
  refs.switchKnob?.addEventListener('click', async ()=>{
    const isRadio = (refs.switchKnob.getAttribute('aria-pressed') === 'true');
    setSwitch(!isRadio); // switch to playlists if currently radio
    if (isRadio) await onPickMusic(true);
    else         await onPickStations(true);
  });

  // Transport
  refs.btn.play?.addEventListener('click', playPause);
  refs.btn.stop?.addEventListener('click', stop);
  refs.btn.prev?.addEventListener('click', prev);
  refs.btn.next?.addEventListener('click', next);

  // Toggles
  refs.btn.shuffle?.addEventListener('click', ()=>{
    cfg.shuffle = !cfg.shuffle;
    refs.btn.shuffle.classList.toggle('active', cfg.shuffle);
  });
  refs.btn.loop?.addEventListener('click', ()=>{
    cfg.loopMode = (cfg.loopMode==='all') ? 'none' : 'all';
    refs.btn.loop.classList.toggle('active', cfg.loopMode==='all');
    refs.btn.loop1?.classList.remove('active');
  });
  refs.btn.loop1?.addEventListener('click', ()=>{
    cfg.loopMode = (cfg.loopMode==='one') ? 'none' : 'one';
    refs.btn.loop1.classList.toggle('active', cfg.loopMode==='one');
    refs.btn.loop?.classList.remove('active');
  });
  refs.btn.mute?.addEventListener('click', ()=>{
    audio.muted = !audio.muted;
    setMuteIcon(refs, audio);
  });

  // Seek + Volume
  refs.seek?.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = (refs.seek.value/1000) * audio.duration;
  });

  if (refs.vol){
    refs.vol.value = String(cfg.volume);
    audio.volume = cfg.volume;
    refs.vol.addEventListener('input', ()=>{
      const v = parseFloat(refs.vol.value);
      audio.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.25;
    });
  }

  // Autoplay-muted UX
  if (cfg.autoplayMuted){
    audio.muted = true;
    setMuteIcon(refs, audio);
    const unmute = ()=>{
      audio.muted = false;
      setMuteIcon(refs, audio);
      window.removeEventListener('click', unmute, { once:true });
    };
    window.addEventListener('click', unmute, { once:true });
  }
  setMuteIcon(refs, audio);

  // Keyboard (ignore while typing)
  const isTyping = (el)=> !!(el && el.closest('input, select, textarea, [contenteditable="true"]'));
  (refs.root || document).addEventListener('keydown', (e)=>{
    if (isTyping(e.target)) return;
    if (e.code === 'Space'){ e.preventDefault(); playPause(); }
    if (e.code === 'ArrowLeft') prev();
    if (e.code === 'ArrowRight') next();
    if ((e.key || '').toLowerCase() === 'm'){
      audio.muted = !audio.muted;
      setMuteIcon(refs, audio);
    }
  });

  // Dropdown changes
  refs.sel?.stations?.addEventListener('change', ()=> onPickStations(false));
  refs.sel?.playlists?.addEventListener('change', ()=> onPickMusic(false));
}
