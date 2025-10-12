// ui.js — DOM shell + references + rendering
import { $, $$ } from './utils.js';

export function buildShell(root, volume){
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

    <div class="mp-meter">
      <div class="vu-scale"><span class="left">0 dB</span><span class="right">+6 dB</span></div>
      <div class="vu-rows">
        <div class="vu-row">
          <div class="vu-ch">L</div>
          <div class="vu-bar">${renderHBar('L')}</div>
        </div>
        <div class="vu-row">
          <div class="vu-ch">R</div>
          <div class="vu-bar">${renderHBar('R')}</div>
        </div>
      </div>
      <div class="mp-vol"><input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${volume}" aria-label="Volume"></div>
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
}
function renderHBar(side){
  // 6 green, 1 yellow, 1 red
  const cells = [];
  for (let i=0;i<6;i++) cells.push(`<span class="hled g" data-hled-${side}${i}></span>`);
  cells.push(`<span class="hled y" data-hled-${side}6></span>`);
  cells.push(`<span class="hled r" data-hled-${side}7></span>`);
  return cells.join('');
}

export function refs(root){
  return {
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
      mute:    $('[data-act="mute"]', root)
    },
    sel: {
      stations: $('.mp-pl-stations', root),
      playlists: $('.mp-pl-music', root)
    },
    switchKnob: $('[data-src-toggle]', root)
  };
}

export function setNow(refs, t, s){
  if (refs.titleEl) refs.titleEl.textContent = t || '—';
  if (refs.subEl)   refs.subEl.textContent   = s || '—';
}
export function setPlayIcon(refs, on){ if (refs.btn.play) refs.btn.play.textContent = on ? '⏸' : '▶'; }
export function setMuteIcon(refs, audio){ if (refs.btn.mute) refs.btn.mute.textContent = audio.muted ? '🔇' : '🔊'; }
export function paintTimes(refs, audio, fmtTime){
  if (refs.timeCur) refs.timeCur.textContent = fmtTime(audio.currentTime);
  if (refs.timeDur) refs.timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
  if (refs.seek && isFinite(audio.duration) && audio.duration>0) {
    refs.seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
}

export function fillSelect(sel, arr){
  if (!sel) return;
  sel.innerHTML = '';
  arr.forEach((it,i)=>{
    const o=document.createElement('option');
    o.value = it.file;
    o.textContent = it.name || `Item ${i+1}`;
    sel.appendChild(o);
  });
}

export function renderRadioList(refs, stationTitle, nowTitle){
  if (!refs.list) return;
  refs.list.innerHTML = '';
  const liStation = row(`${stationTitle || 'Live Station'}`, 'LIVE');
  const liNow = row(nowTitle || '—', '');
  liNow.setAttribute('data-now','1');
  refs.list.appendChild(liStation);
  refs.list.appendChild(liNow);
}
export function updateRadioNow(refs, nowTitle){
  const el = refs.list?.querySelector('li[data-now="1"] .t');
  if (el) el.textContent = nowTitle || '—';
}
export function renderPlaylist(refs, tracks, onPickIndex){
  if (!refs.list) return;
  refs.list.innerHTML = '';
  tracks.forEach((t,i)=>{
    const li = row(`${String(i+1).padStart(2,'0')} — ${t.title || `Track ${i+1}`}`, '');
    li.addEventListener('click', ()=> onPickIndex(i));
    refs.list.appendChild(li);
  });
}
export function highlightList(refs, cursor, usingStations){
  if (!refs.list) return;
  $$('.active', refs.list).forEach(li=>li.classList.remove('active'));
  if (cursor >= 0) refs.list.children[cursor + (usingStations?1:0)]?.classList.add('active');
}

function row(left, right){
  const li = document.createElement('li');
  const L = document.createElement('div'); L.className='t'; L.textContent = left;
  const R = document.createElement('div'); R.className='len mono'; R.textContent = right;
  li.appendChild(L); li.appendChild(R);
  return li;
}
