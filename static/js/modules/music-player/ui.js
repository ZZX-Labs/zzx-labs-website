// static/js/modules/music-player/ui.js
// UI scaffold + small view helpers for the Music Player

import { $, $$, fmtTime } from './utils.js';

/** Build the entire player UI into `root` and return element refs */
export function buildUI(root, cfg) {
  // Shell
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-now">
        <div class="mp-title mono">—</div>
        <div class="mp-sub small">
          <span class="mp-subtext">—</span>
          <span class="mp-listeners small mono" style="margin-left:.5rem; opacity:.85;"></span>
        </div>
      </div>

      <div class="mp-controls" role="toolbar" aria-label="Playback">
        <div class="mp-switch" aria-label="Source">
          <button class="mp-switch-knob" type="button" aria-pressed="true" title="Left = Radio Stations, Right = Playlists"></button>
        </div>

        <button class="mp-btn" data-act="prev"    title="Previous (⟵)">⏮</button>
        <button class="mp-btn" data-act="play"    title="Play/Pause (Space)">▶</button>
        <button class="mp-btn" data-act="stop"    title="Stop">⏹</button>
        <button class="mp-btn" data-act="next"    title="Next (⟶)">⏭</button>
        <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
        <button class="mp-btn" data-act="loop"    title="Loop all">🔁</button>
        <button class="mp-btn" data-act="loop1"   title="Loop one">🔂</button>
        <button class="mp-btn" data-act="mute"    title="Mute/Unmute">🔇</button>
      </div>
    </div>

    <div class="mp-middle">
      <div class="mp-time mono"><span data-cur>00:00</span> / <span data-dur>—</span></div>
      <input type="range" class="mp-seek" min="0" max="1000" value="0" step="1" aria-label="Seek">
      <div class="mp-vol"><input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${cfg.volume}" aria-label="Volume"></div>
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

  // Refs
  const titleEl = $('.mp-title', root);
  const subEl   = $('.mp-subtext', root);       // subtitle text node
  const lisEl   = $('.mp-listeners', root);     // listeners badge
  const switchKnob = $('.mp-switch-knob', root);

  const btns = {
    prev:    $('[data-act="prev"]', root),
    play:    $('[data-act="play"]', root),
    stop:    $('[data-act="stop"]', root),
    next:    $('[data-act="next"]', root),
    shuffle: $('[data-act="shuffle"]', root),
    loop:    $('[data-act="loop"]', root),
    loop1:   $('[data-act="loop1"]', root),
    mute:    $('[data-act="mute"]', root),
  };

  const timeCur = $('[data-cur]', root);
  const timeDur = $('[data-dur]', root);
  const seek    = $('.mp-seek', root);
  const vol     = $('.mp-volume', root);
  const list    = $('.mp-list', root);
  const selStations = $('.mp-pl-stations', root);
  const selMusic    = $('.mp-pl-music', root);

  return { titleEl, subEl, lisEl, switchKnob, btns, timeCur, timeDur, seek, vol, list, selStations, selMusic };
}

/** Small view helpers bound to DOM */
export function uiHelpers({ titleEl, subEl, lisEl, list, timeCur, timeDur, seek }) {
  // local root to query buttons if needed
  const root = titleEl?.closest('[data-mp]') || document;
  const btnPlay = $('.mp-btn[data-act="play"]', root);
  const btnMute = $('.mp-btn[data-act="mute"]', root);
  const knob    = $('.mp-switch-knob', root);

  function setNow(title, sub='') {
    const txt = title || '—';
    if (titleEl) {
      titleEl.textContent = txt;
      requestAnimationFrame(() => {
        const over = titleEl.scrollWidth > titleEl.clientWidth + 2;
        titleEl.classList.toggle('ticker', over);
      });
    }
    if (subEl) subEl.textContent = sub || '—';
  }

  /** Show/hide listeners count, e.g. "• 1,234 listening" */
  function setListeners(n) {
    if (!lisEl) return;
    if (n == null || n === '' || Number(n) <= 0) {
      lisEl.textContent = '';
      lisEl.setAttribute('aria-hidden', 'true');
      return;
    }
    const num = Number.isFinite(+n) ? Number(n) : n;
    const pretty = (typeof num === 'number' && num.toLocaleString) ? num.toLocaleString() : num;
    lisEl.textContent = `• ${pretty} listening`;
    lisEl.removeAttribute('aria-hidden');
  }

  const setPlayIcon = (isPlaying) => {
    if (!btnPlay) return;
    btnPlay.textContent = isPlaying ? '⏸' : '▶';
  };

  const setMuteIcon = (audio) => {
    if (!btnMute) return;
    // Prefer explicit audio param; fallback: keep existing glyph if unknown
    if (audio && typeof audio.muted === 'boolean') {
      btnMute.textContent = audio.muted ? '🔇' : '🔊';
    }
  };

  const paintTimes = (audio) => {
    if (!audio) return;
    if (timeCur) timeCur.textContent = fmtTime(audio.currentTime);
    if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
    if (seek && isFinite(audio.duration) && audio.duration>0){
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    }
  };

  function setSourceUI(activeSource, selStations, selMusic) {
    const stationsActive = (activeSource === 'stations');
    if (knob) knob.setAttribute('aria-pressed', stationsActive ? 'true' : 'false');

    if (selStations) {
      selStations.disabled = !stationsActive;
      selStations.classList.toggle('is-disabled', !stationsActive);
    }
    if (selMusic) {
      selMusic.disabled = stationsActive;
      selMusic.classList.toggle('is-disabled', stationsActive);
    }
  }

  function renderQueue(queue, cursor = -1) {
    if (!list) return;
    list.innerHTML = '';
    queue.forEach((t, i) => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const right = document.createElement('div');
      left.className = 't';
      right.className = 'len mono';
      left.textContent = t.title || `Track ${i+1}`;
      right.textContent = t.isStream ? 'LIVE' : (t.length ? fmtTime(t.length) : '');
      li.appendChild(left); li.appendChild(right);
      li.dataset.index = String(i);

      // Let parent (mount.js/player.js) decide how to handle it; dispatch an event.
      li.addEventListener('click', () => {
        const ev = new CustomEvent('mp:select-index', { bubbles: true, detail: { index: i }});
        li.dispatchEvent(ev);
        // Optional global hook for legacy direct-calls
        if (typeof window !== 'undefined' && typeof window.__mpSelectItem === 'function') {
          try { window.__mpSelectItem(i); } catch {}
        }
      });

      list.appendChild(li);
    });
    highlightList(cursor);
  }

  function highlightList(cursor) {
    if (!list) return;
    $$('.active', list).forEach(li => li.classList.remove('active'));
    if (cursor >= 0 && list.children[cursor]) list.children[cursor].classList.add('active');
  }

  return { setNow, setListeners, setPlayIcon, setMuteIcon, paintTimes, setSourceUI, renderQueue, highlightList };
}
