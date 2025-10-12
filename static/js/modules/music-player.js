// /static/js/modules/music-player.js
// ZZX-Labs Music Player (ES Module)
// - Mounts on a provided root element with the CAB markup
// - Reads manifest.json (stations + playlists)
// - Supports M3U / M3U8 parsing, streams & file tracks
// - Shuffle, loop (all/one), mute, seek, keyboard shortcuts

/* Public API:
   import { MusicPlayer, mountMusicPlayer } from '/static/js/modules/music-player.js';
   mountMusicPlayer('.mp-root', { autoplay: true, autoplayMuted: true });
*/

const isGH = location.hostname.endsWith('github.io');
function repoPrefix() {
  const parts = location.pathname.split('/').filter(Boolean);
  return (isGH && parts.length) ? '/' + parts[0] + '/' : '/';
}
function isAbs(u) { return /^([a-z]+:)?\/\//i.test(u) || (u || '').startsWith('/'); }
function join(base, rel) {
  if (!rel) return base;
  if (isAbs(rel)) return rel;
  if (!base.endsWith('/')) base += '/';
  return base + rel.replace(/^\.\//, '');
}
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Parse .m3u/.m3u8 into [{url,title}]
function parseM3U(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let pendingTitle = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')) {
      const idx = line.indexOf(',');
      pendingTitle = (idx >= 0) ? line.slice(idx + 1).trim() : null;
      continue;
    }
    if (!line.startsWith('#')) {
      out.push({ url: line, title: pendingTitle || line });
      pendingTitle = null;
    }
  }
  return out;
}

async function fetchJSON(u) {
  try {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    return null;
  }
}
async function fetchText(u) {
  try {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw 0;
    return await r.text();
  } catch {
    return '';
  }
}
async function tryPlayStream(audio, urls) {
  for (const u of urls) {
    try {
      audio.src = u;
      await audio.play();
      return u;
    } catch {
      // keep trying
    }
  }
  throw new Error('No playable stream endpoint');
}

export class MusicPlayer {
  constructor(root, options = {}) {
    if (!root) throw new Error('MusicPlayer: missing root element');

    // Config — data-* overrides props
    this.cfg = {
      manifestUrl: root.dataset.manifestUrl || options.manifestUrl || (repoPrefix() + 'static/audio/music/playlists/manifest.json'),
      audioBase: root.dataset.audioBase || options.audioBase || (repoPrefix() + 'static/audio/music/'),
      autoplay: (root.dataset.autoplay ?? (options.autoplay ? '1' : '0')) === '1',
      autoplayMuted: (root.dataset.autoplayMuted ?? (options.autoplayMuted ? '1' : '0')) === '1',
      shuffle: (root.dataset.shuffle ?? (options.shuffle ? '1' : '0')) === '1',
      volume: parseFloat(root.dataset.volume ?? (options.volume ?? 0.5)),
      startSource: root.dataset.startSource || options.startSource || 'auto', // 'stations' | 'playlists' | 'auto'
    };

    // DOM
    this.root = root;
    this.titleEl = $('.mp-title', root);
    this.subEl = $('.mp-sub', root);
    this.timeCur = $('[data-cur]', root);
    this.timeDur = $('[data-dur]', root);
    this.seek = $('.mp-seek', root);
    this.vol = $('.mp-volume', root);
    this.list = $('.mp-list', root);
    this.selStations = $('#mp-pl-stations', root);
    this.selMusic = $('#mp-pl-music', root);

    this.btns = {
      prev: $('[data-act="prev"]', root),
      play: $('[data-act="play"]', root),
      stop: $('[data-act="stop"]', root),
      next: $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop: $('[data-act="loop"]', root),
      loop1: $('[data-act="loop1"]', root),
      mute: $('[data-act="mute"]', root),
    };

    // Audio + state
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';

    this.queue = [];   // [{url,title,isStream,urls?,length?}]
    this.cursor = -1;
    this.loopMode = 'none'; // 'none' | 'all' | 'one'
    this.usingStations = false;
    this.manifest = { stations: [], playlists: [] };

    this._wire();
  }

  /* ---------- Wiring ---------- */
  _wire() {
    // Buttons
    this.btns.play?.addEventListener('click', () => this.playPause());
    this.btns.stop?.addEventListener('click', () => this.stop());
    this.btns.prev?.addEventListener('click', () => this.prev());
    this.btns.next?.addEventListener('click', () => this.next());
    this.btns.shuffle?.addEventListener('click', () => this.toggleShuffle());
    this.btns.loop?.addEventListener('click', () => this.toggleLoopAll());
    this.btns.loop1?.addEventListener('click', () => this.toggleLoopOne());
    this.btns.mute?.addEventListener('click', () => this.toggleMute());

    // Seek + volume
    this.seek?.addEventListener('input', () => {
      if (!isFinite(this.audio.duration) || this.audio.duration <= 0) return;
      this.audio.currentTime = (this.seek.value / 1000) * this.audio.duration;
    });
    if (this.vol) {
      const v = isFinite(this.cfg.volume) ? this.cfg.volume : 0.5;
      this.vol.value = v;
      this.audio.volume = Math.min(1, Math.max(0, v));
      this.vol.addEventListener('input', () => {
        this.audio.volume = Math.min(1, Math.max(0, parseFloat(this.vol.value)));
      });
    }

    // Audio events
    this.audio.addEventListener('timeupdate', () => this._paintTimes());
    this.audio.addEventListener('durationchange', () => this._paintTimes());
    this.audio.addEventListener('ended', () => this.next());

    // Keyboard shortcuts (scoped to widget)
    this.root.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); this.playPause(); }
      if (e.code === 'ArrowLeft') this.prev();
      if (e.code === 'ArrowRight') this.next();
      if (e.key && e.key.toLowerCase() === 'm') this.toggleMute();
    });

    // Autoplay policy: muted-first if requested
    if (this.cfg.autoplayMuted) {
      this.audio.muted = true;
      this._setMuteIcon();
      const unmute = () => {
        this.audio.muted = false;
        this._setMuteIcon();
        window.removeEventListener('click', unmute, { once: true });
      };
      window.addEventListener('click', unmute, { once: true });
    }

    // Selects
    this.selStations?.addEventListener('change', () => this._onPickStations());
    this.selMusic?.addEventListener('change', () => this._onPickMusic());
  }

  /* ---------- Boot ---------- */
  async init() {
    this._setNow('—', '—');
    this.btns.shuffle?.classList.toggle('active', this.cfg.shuffle);

    const mf = await fetchJSON(this.cfg.manifestUrl);
    this.manifest.stations = Array.isArray(mf?.stations) ? mf.stations : [];
    this.manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    this._fillSelect(this.selStations, this.manifest.stations);
    this._fillSelect(this.selMusic, this.manifest.playlists);

    await this._chooseInitial();

    if (this.cfg.autoplay && !this.cfg.autoplayMuted && this.audio.paused) {
      try { await this.audio.play(); }
      catch {
        this.audio.muted = true; this._setMuteIcon();
        try { await this.audio.play(); } catch {}
      }
    }
  }

  /* ---------- UI helpers ---------- */
  _setNow(title, sub = '') {
    if (this.titleEl) this.titleEl.textContent = title || '—';
    if (this.subEl) this.subEl.textContent = sub || '—';
  }
  _setPlayIcon(isPlaying) {
    if (!this.btns.play) return;
    this.btns.play.textContent = isPlaying ? '⏸' : '▶';
  }
  _setMuteIcon() {
    if (!this.btns.mute) return;
    this.btns.mute.textContent = this.audio.muted ? '🔇' : '🔊';
  }
  _paintTimes() {
    if (this.timeCur) this.timeCur.textContent = fmtTime(this.audio.currentTime);
    if (this.timeDur) this.timeDur.textContent = isFinite(this.audio.duration) ? fmtTime(this.audio.duration) : '—';
    if (this.seek && isFinite(this.audio.duration) && this.audio.duration > 0) {
      this.seek.value = Math.round((this.audio.currentTime / this.audio.duration) * 1000);
    }
  }
  _highlightList() {
    if (!this.list) return;
    $$('.active', this.list).forEach(li => li.classList.remove('active'));
    if (this.cursor >= 0 && this.list.children[this.cursor]) {
      this.list.children[this.cursor].classList.add('active');
    }
  }
  _renderQueue() {
    if (!this.list) return;
    this.list.innerHTML = '';
    this.queue.forEach((t, i) => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const right = document.createElement('div');
      left.className = 't';
      right.className = 'len mono';
      left.textContent = t.title || `Track ${i + 1}`;
      right.textContent = t.isStream ? 'LIVE' : (t.length ? fmtTime(t.length) : '');
      li.appendChild(left);
      li.appendChild(right);
      li.addEventListener('click', () => this.playAt(i));
      this.list.appendChild(li);
    });
    this._highlightList();
  }
  _fillSelect(sel, arr) {
    if (!sel) return;
    sel.innerHTML = '';
    arr.forEach((it, i) => {
      const o = document.createElement('option');
      o.value = it.file || it.href || it.path || '';
      o.textContent = it.name || `Playlist ${i + 1}`;
      sel.appendChild(o);
    });
  }

  /* ---------- Loading logic ---------- */
  async _chooseInitial() {
    let mode = this.cfg.startSource;
    if (mode === 'auto') {
      const both = this.manifest.stations.length && this.manifest.playlists.length;
      mode = both ? (Math.random() < 0.5 ? 'stations' : 'playlists')
                  : (this.manifest.stations.length ? 'stations' : 'playlists');
    }
    this.usingStations = (mode === 'stations');

    if (this.usingStations && this.manifest.stations.length) {
      this.selStations.value = this.manifest.stations[Math.floor(Math.random() * this.manifest.stations.length)].file;
      await this._onPickStations();
    } else if (this.manifest.playlists.length) {
      this.selMusic.value = this.manifest.playlists[Math.floor(Math.random() * this.manifest.playlists.length)].file;
      await this._onPickMusic();
    }
  }

  async _loadM3U(path, isStation) {
    const url = isAbs(path) ? path : join(this.cfg.manifestUrl.replace(/\/manifest\.json$/i, ''), path);
    const txt = await fetchText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];

    if (isStation) {
      return [{
        title: (this.selStations?.selectedOptions?.[0]?.textContent || 'Live Station'),
        isStream: true,
        urls: entries.map(e => isAbs(e.url) ? e.url : join(this.cfg.audioBase, e.url))
      }];
    } else {
      return entries.map(e => ({
        title: e.title || e.url,
        url: isAbs(e.url) ? e.url : join(this.cfg.audioBase, e.url),
        isStream: false
      }));
    }
  }

  async _onPickStations() {
    this.usingStations = true;
    const file = this.selStations?.value;
    if (!file) return;
    const tracks = await this._loadM3U(file, true);
    this.queue = tracks; this.cursor = -1;
    this._renderQueue();
    this._setNow('—', 'Radio');
    if (this.cfg.autoplay) this.playAt(0);
  }

  async _onPickMusic() {
    this.usingStations = false;
    const file = this.selMusic?.value;
    if (!file) return;
    let tracks = await this._loadM3U(file, false);
    if (this.cfg.shuffle) {
      // Fisher–Yates
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
    }
    this.queue = tracks; this.cursor = -1;
    this._renderQueue();
    this._setNow('—', 'Playlist');
    if (this.cfg.autoplay) this.playAt(0);
  }

  /* ---------- Controls ---------- */
  async playAt(i) {
    if (!this.queue.length) return;
    this.cursor = (i + this.queue.length) % this.queue.length;
    const tr = this.queue[this.cursor];
    this._setNow(tr.title, this.usingStations ? 'Radio' : 'Playlist');
    this._setPlayIcon(false);

    try {
      if (tr.isStream && Array.isArray(tr.urls) && tr.urls.length) {
        await tryPlayStream(this.audio, tr.urls);
      } else {
        this.audio.src = tr.url;
        await this.audio.play();
      }
      this._setPlayIcon(true);
      this._highlightList();
    } catch {
      this.next(); // if one fails, try next
    }
  }

  playPause() {
    if (!this.audio.src) return this.playAt(0);
    if (this.audio.paused) {
      this.audio.play().then(() => this._setPlayIcon(true)).catch(() => {});
    } else {
      this.audio.pause(); this._setPlayIcon(false);
    }
  }
  stop() {
    this.audio.pause();
    try { this.audio.currentTime = 0; } catch {}
    this._setPlayIcon(false);
  }
  prev() {
    if (this.loopMode === 'one') return this.playAt(this.cursor);
    this.playAt(this.cursor - 1);
  }
  next() {
    if (this.loopMode === 'one') return this.playAt(this.cursor);
    if (this.cfg.shuffle) {
      let j = Math.floor(Math.random() * this.queue.length);
      if (this.queue.length > 1 && j === this.cursor) j = (j + 1) % this.queue.length;
      this.playAt(j);
    } else {
      const n = this.cursor + 1;
      if (n >= this.queue.length) {
        if (this.loopMode === 'all') return this.playAt(0);
        this._setPlayIcon(false);
      } else {
        this.playAt(n);
      }
    }
  }
  toggleShuffle() {
    this.cfg.shuffle = !this.cfg.shuffle;
    this.btns.shuffle?.classList.toggle('active', this.cfg.shuffle);
  }
  toggleLoopAll() {
    this.loopMode = (this.loopMode === 'all') ? 'none' : 'all';
    this.btns.loop?.classList.toggle('active', this.loopMode === 'all');
    this.btns.loop1?.classList.remove('active');
  }
  toggleLoopOne() {
    this.loopMode = (this.loopMode === 'one') ? 'none' : 'one';
    this.btns.loop1?.classList.toggle('active', this.loopMode === 'one');
    this.btns.loop?.classList.remove('active');
  }
  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this._setMuteIcon();
  }
}

/* Convenience helper: mount on a selector (first match). */
export async function mountMusicPlayer(selector = '.mp-root', options = {}) {
  const root = $(selector);
  if (!root) throw new Error(`mountMusicPlayer: selector not found: ${selector}`);
  const mp = new MusicPlayer(root, options);
  await mp.init();
  return mp;
}
