// /music/modules/ui.js — build shell + list rendering + helpers
import { $, $$ } from './utils.js';

export function buildShell(root, initialVolume){
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-now">
        <div class="mp-title mono" data-title>—</div>
        <div class="mp-sub small"  data-sub>—</div>
      </div>

      <div class="mp-controls" role="toolbar" aria-label="Controls">
        <div class="mp-switch" role="group" title="Toggle Radio / Playlists">
          <button class="mp-switch-knob" data-src-toggle aria-pressed="true" aria-label="Radio / Playlists"></button>
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

    <div class="mp-meter" id="vu">
      <div class="vu-rows">
        <div class="vu-row">
          <div class="vu-ch">L</div>
          <div class="vu-bar">${hbar('L')}</div>
        </div>
        <div class="vu-row">
          <div class="vu-ch">R</div>
          <div class="vu-bar">${hbar('R')}</div>
        </div>
      </div>
      <div class="mp-vol">
        <input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${initialVolume}" aria-label="Volume">
      </div>
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
  return getRefs(root);
}

function hbar(side){
  const spans=[];
  for(let i=0;i<6;i++) spans.push(`<span class="hled g" data-hled-${side}${i}></span>`);
  spans.push(`<span class="hled y" data-hled-${side}6></span>`);
  spans.push(`<span class="hled r" data-hled-${side}7></span>`);
  return spans.join('');
}

/* -------- refs -------- */
export function getRefs(root){
  return {
    root,
    titleEl: $('[data-title]', root),
    subEl:   $('[data-sub]', root),
    timeCur: $('[data-cur]', root),
    timeDur: $('[data-dur]', root),
    seek:    $('.mp-seek', root),
    vol:     $('.mp-volume', root),
    list:    $('.mp-list', root),
    btn: {
      prev:    $('[data-act="prev"]', root),
      play:    $('[data-act="play"]', root),
      stop:    $('[data-act="stop"]', root),
      next:    $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop:    $('[data-act="loop"]', root),
      loop1:   $('[data-act="loop1"]', root),
      mute:    $('[data-act="mute"]', root),
    },
    sel: {
      stations: $('.mp-pl-stations', root),
      playlists:$('.mp-pl-music', root),
    },
    switchKnob: $('[data-src-toggle]', root),
  };
}

/* -------- top display -------- */
export function setNow(refs, t, s='—'){
  if (refs.titleEl) refs.titleEl.textContent = t || '—';
  if (refs.subEl)   refs.subEl.textContent   = s || '—';
}

/* -------- playlists list -------- */
export function renderPlaylistList(refs, tracks, onPick){
  if (!refs.list) return;
  refs.list.innerHTML = '';
  tracks.forEach((t,i)=>{
    const li = document.createElement('li');
    const left = document.createElement('div'); left.className='t';
    left.textContent = `${String(i+1).padStart(2,'0')} — ${t.title || `Track ${i+1}`}`;
    const right = document.createElement('div'); right.className='len mono'; right.textContent = '';
    li.appendChild(left); li.appendChild(right);
    li.addEventListener('click', ()=> onPick(i));
    refs.list.appendChild(li);
  });
}

/* alias expected by player.js */
export function renderPlaylist(refs, tracks, onPick){
  return renderPlaylistList(refs, tracks, onPick);
}

/* -------- radio list + live -------- */
function liveText(n){
  const num = Number.isFinite(n) ? n : Number.parseInt(String(n ?? ''), 10);
  return Number.isFinite(num) ? `${num.toLocaleString?.() ?? num} • LIVE` : 'LIVE';
}

/**
 * stationTitle   -> station name
 * nowTitle       -> lastPlaying text
 * history[]      -> previous now-playing strings (oldest → newest)
 * listeners      -> number for “123 • LIVE” (optional)
 */
export function renderRadioList(refs, stationTitle, nowTitle, history=[], listeners){
  if (!refs.list) return;
  refs.list.innerHTML = '';

  // Row 0: station + listeners
  const liStation = document.createElement('li');
  const Ls = document.createElement('div'); Ls.className='t';   Ls.textContent = stationTitle || 'Live Station';
  const Rs = document.createElement('div'); Rs.className='len mono'; Rs.textContent = liveText(listeners);
  liStation.appendChild(Ls); liStation.appendChild(Rs);
  refs.list.appendChild(liStation);

  // Row 1: now playing
  const liNow = document.createElement('li');
  liNow.setAttribute('data-now', '1');
  const Ln = document.createElement('div'); Ln.className='t';   Ln.textContent = nowTitle || '—';
  const Rn = document.createElement('div'); Rn.className='len mono'; Rn.textContent = '';
  liNow.appendChild(Ln); liNow.appendChild(Rn);
  refs.list.appendChild(liNow);

  // History (newest last)
  for (let i = history.length - 1; i >= 0; i--){
    const hli = document.createElement('li');
    const hl  = document.createElement('div'); hl.className='t';
    const hr  = document.createElement('div'); hr.className='len mono';
    hl.textContent = history[i];
    hr.textContent = '';
    hli.appendChild(hl); hli.appendChild(hr);
    refs.list.appendChild(hli);
  }
}

export function updateRadioNow(refs, nowText){
  const el = refs.list?.querySelector('li[data-now="1"] .t');
  if (el) el.textContent = nowText || '—';
}

export function updateRadioListeners(refs, listeners){
  const el = refs.list?.querySelector('li:first-child .len');
  if (el) el.textContent = liveText(listeners);
}

/* -------- misc UI helpers -------- */
export function highlightList(refs, cursor, usingStations){
  if (!refs.list) return;
  $$('.active', refs.list).forEach(li => li.classList.remove('active'));
  if (cursor >= 0) refs.list.children[cursor + (usingStations ? 1 : 0)]?.classList.add('active');
}

export function setMuteIcon(refs, audio){
  if (refs.btn?.mute) refs.btn.mute.textContent = audio?.muted ? '🔇' : '🔊';
}

export function setPlayIcon(refs, on){
  if (refs.btn?.play) refs.btn.play.textContent = on ? '⏸' : '▶';
}

export function paintTimes(refs, audio, fmtTime){
  const t = (el, txt)=>{ if (el) el.textContent = txt; };
  t(refs.timeCur, fmtTime(audio.currentTime));
  t(refs.timeDur, isFinite(audio.duration) ? fmtTime(audio.duration) : '—');
  if (refs.seek && isFinite(audio.duration) && audio.duration>0) {
    refs.seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
}

export function fillSelect(selEl, arr){
  if (!selEl) return;
  selEl.innerHTML = '';
  arr.forEach((it,i)=>{
    const o=document.createElement('option');
    o.value = it.file;
    o.textContent = it.name || `Item ${i+1}`;
    selEl.appendChild(o);
  });
}
