// /music/script.js — robust boot for ZZX music player
// - Dynamically imports the core if needed
// - Repo-aware paths, file:// safe fallbacks
// - Forces data-* attrs, then mounts immediately

(async function () {
  const root = document.querySelector('[data-mp]');
  if (!root) {
    console.warn('[music] no [data-mp] root found');
    return;
  }

  const isGH   = location.hostname.endsWith('github.io');
  const isFile = location.protocol === 'file:';
  const repoPrefix = (() => {
    if (!isGH) return '/';
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length ? '/' + parts[0] + '/' : '/';
  })();

  const DEFAULTS = {
    manifestRel   : 'static/audio/music/playlists/manifest.json',
    audioBaseRel  : 'static/audio/music/',
    autoplay      : true,
    autoplayMuted : true,
    shuffle       : true,
    volume        : 0.35,
    startSource   : 'auto' // 'stations' | 'playlists' | 'auto'
  };

  // Tiny valid fallback so UI mounts on file:// or missing assets
  const FALLBACK_MANIFEST = {
    stations: [
      { name: "LoFi Radio",    file: "stations/lofi.m3u" },
      { name: "Ambient Radio", file: "stations/ambient.m3u" }
    ],
    playlists: [
      { name: "Lobby (Ambient)", file: "music/lobby.m3u" },
      { name: "Night Drive",     file: "music/night-drive.m3u" }
    ]
  };

  async function urlExists(url) {
    if (isFile) return false; // HEAD unreliable on file://
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function resolveManifestUrl() {
    // 1) If author hinted and it works, use it
    const hinted = root.getAttribute('data-manifest-url');
    if (hinted && (isFile || await urlExists(hinted))) {
      console.info('[music] using hinted manifest:', hinted);
      return hinted;
    }
    // 2) Repo-aware default
    const candidate = repoPrefix + DEFAULTS.manifestRel;
    if (await urlExists(candidate)) {
      console.info('[music] using repo manifest:', candidate);
      return candidate;
    }
    // 3) Blob fallback
    const blob = new Blob([JSON.stringify(FALLBACK_MANIFEST, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    console.info('[music] using fallback Blob manifest');
    return blobUrl;
  }

  function setData(name, value) {
    root.setAttribute(name, value); // force override
  }

  async function ensurePlayerCore() {
    if (window.MusicPlayer && typeof window.MusicPlayer.mount === 'function') return true;
    try {
      // Try dynamic module import (same path as your <script type="module">)
      await import('/static/js/modules/music-player.js');
      return (window.MusicPlayer && typeof window.MusicPlayer.mount === 'function');
    } catch (e) {
      console.error('[music] failed to import core module:', e);
      return false;
    }
  }

  async function boot() {
    // Ensure core is available (either via <script type="module"> or dynamic import)
    const coreReady = await ensurePlayerCore();
    if (!coreReady) {
      console.error('[music] MusicPlayer core is not available. Check /static/js/modules/music-player.js path.');
      return;
    }

    // Resolve config + force data-* attrs
    const manifestUrl = await resolveManifestUrl();
    setData('data-manifest-url',   manifestUrl);
    setData('data-audio-base',     repoPrefix + DEFAULTS.audioBaseRel);
    setData('data-autoplay',       DEFAULTS.autoplay ? '1' : '0');
    setData('data-autoplay-muted', DEFAULTS.autoplayMuted ? '1' : '0');
    setData('data-shuffle',        DEFAULTS.shuffle ? '1' : '0');
    setData('data-volume',         String(DEFAULTS.volume));
    setData('data-start-source',   DEFAULTS.startSource);

    // Mount immediately (no event race)
    try {
      window.MusicPlayer.mount(root, {}); // options are read from data-* already
      console.info('[music] mounted player on', root);
    } catch (e) {
      console.error('[music] mount failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
