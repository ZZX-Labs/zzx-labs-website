// static/js/modules/music-player/ui.js — build shell + list rendering + helpers
import { $, $$ } from './utils.js';

export function buildUI(root, cfg){
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-now">
        <div class="mp-title mono" data-title>—</div>
        <div class="mp-sub small"  data-sub>—</div>
      </div>

      <div class="mp-controls" role="toolbar" aria-label="Controls">
        <div class="mp-switch" role="group" title="Toggle Radio / Playlists">
          <button class="mp-switch-knob" data-src-toggle aria-pressed="${cfg.startSource==='playlists'?'false':'true'}" aria-label="Radio / Playlists"></button>
        </div>

        <button class="mp-btn" data-act="prev" title="Previous (⟵)">⏮</button>
        <button class="mp-btn" data-act="play" title="Play/Pause (Space)">▶</button>
        <button class="mp-btn" data-act="stop" title="Stop">⏹</button>
        <button class="mp-btn" data-act="next" title="Next (⟶)">⏭</button>
        <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
        <button class="mp-btn" data-act="loop" title="Loop all">🔁</button>
        <button class="mp-btn" data-act="loop1" title="Loop one">🔂</button>
        <button class="mp-btn" data-act="mute" title="Mute/Unmute">🔇</button>
      </div>
    </div>

    <div class="mp-middle">
      <div class="mp-time mono"><span data-cur>00:00</span> / <span data-dur>—</span></div>
      <input type="range" class="mp-seek" min="0" max="1000" value="0" step="1" aria-label="Seek">
    </div>

    <div class="mp-bottom">
      <div class="mp-left">
        <label class="small">Radio Stations (.m3u)</label>
        <select class="mp-pl mp-pl-stations"></select>

        <label class="small" style="margin-top:.6rem;display:block;">Playlists (.m3u)</label>
        <select class="mp-pl mp-pl-music"></select>
      </div>
      <div class="mp-right">
        <label class="small">Tracks</label>
        <ul class="mp-list" role="listbox" aria-label="Tracks"></ul>
      </div>
    </div>
  `;

  return {
    root,
    titleEl: $('[data-title]', root),
    subEl:   $('[data-sub]', root),
    timeCur: $('[data-cur]', root),
    timeDur: $('[data-dur]', root),
    seek:    $('.mp-seek', root),
    vol:     $('.mp-volume', root),
    list:    $('.mp-list', root),
    btns: {
      prev:    $('[data-act="prev"]', root),
      play:    $('[data-act="play"]', root),
      stop:    $('[data-act="stop"]', root),
      next:    $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop:    $('[data-act="loop"]', root),
      loop1:   $('[data-act="loop1"]', root),
      mute:    $('[data-act="mute"]', root),
    },
    selStations: $('.mp-pl-stations', root),
    selMusic:    $('.mp-pl-music', root),
    switchKnob:  $('[data-src-toggle]', root),
  };
}

export function uiHelpers({ titleEl, subEl, list, timeCur, timeDur, seek }){
  const setNow = (t, sub='—')=>{
    if (titleEl) titleEl.textContent = t || '—';
    if (subEl)   subEl.textContent   = sub || '—';
  };

  const setPlayIcon = (on)=>{
    const btn = $('[data-act="play"]', list?.closest('[data-mp]') || document);
    if (btn) btn.textContent = on ? '⏸' : '▶';
  };

  const setMuteIcon = (audio)=>{
    const btn = $('[data-act="mute"]', list?.closest('[data-mp]') || document);
    if (btn) btn.textContent = audio?.muted ? '🔇' : '🔊';
  };

  const paintTimes = (audio)=>{
    if (timeCur) timeCur.textContent = fmt(audio.currentTime);
    if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmt(audio.duration) : '—';
    if (seek && isFinite(audio.duration) && audio.duration>0){
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    }
  };

  const setSourceUI = (active, selStations, selMusic)=>{
    const isStations = active === 'stations';
    selStations?.classList.toggle('is-disabled', !isStations);
    selMusic?.classList.toggle('is-disabled', isStations);
    const knob = $('[data-src-toggle]', list?.closest('[data-mp]') || document);
    knob?.setAttribute('aria-pressed', isStations ? 'true' : 'false');
  };

  /** Render queue. For streams:
   *  Row 1: Station title + right side "⟨listeners⟩ • LIVE"
   *  Row 2: Now Playing track text (updates live)
   */
  const renderQueue = (queue, cursor)=>{
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(queue) || !queue.length) return;

    const tr = queue[Math.max(0, cursor)];
    if (tr?.isStream){
      // Station row
      const liStation = document.createElement('li');
      const Ls = document.createElement('div'); Ls.className='t';
      Ls.textContent = tr.title || 'Live Station';
      const Rs = document.createElement('div'); Rs.className='len mono';
      Rs.setAttribute('data-live','1');
      Rs.textContent = 'LIVE';
      liStation.appendChild(Ls); liStation.appendChild(Rs);
      list.appendChild(liStation);

      // Now-playing row
      const liNow = document.createElement('li');
      liNow.setAttribute('data-now','1');
      const Ln = document.createElement('div'); Ln.className='t';   Ln.textContent = '—';
      const Rn = document.createElement('div'); Rn.className='len mono'; Rn.textContent = '';
      liNow.appendChild(Ln); liNow.appendChild(Rn);
      list.appendChild(liNow);
    } else {
      queue.forEach((t,i)=>{
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className='t';
        left.textContent = `${String(i+1).padStart(2,'0')} — ${t.title || `Track ${i+1}`}`;
        const right = document.createElement('div'); right.className='len mono'; right.textContent = '';
        li.appendChild(left); li.appendChild(right);
        list.appendChild(li);
      });
    }
  };

  const updateRadioNow = (txt)=>{
    const el = list?.querySelector('li[data-now="1"] .t');
    if (el) el.textContent = txt || '—';
  };

  const updateRadioListeners = (count)=>{
    const live = list?.querySelector('[data-live="1"]');
    if (!live) return;
    const n = (Number.isFinite(+count) ? String(count) : '').trim();
    live.textContent = n ? `${n} • LIVE` : 'LIVE';
  };

  const highlightList = (cursor)=>{
    if (!list) return;
    $$('.active', list).forEach(li => li.classList.remove('active'));
    if (cursor >= 0) list.children[cursor]?.classList.add('active');
  };

  return { setNow, setPlayIcon, setMuteIcon, paintTimes, setSourceUI, renderQueue, updateRadioNow, updateRadioListeners, highlightList };
}

function fmt(sec){
  if (!isFinite(sec)||sec<0) return '—';
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
