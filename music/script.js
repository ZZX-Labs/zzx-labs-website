// /music/script.js — robust boot for ZZX music player
// - Validates manifest URL and overrides data-* even if one was provided
// - Works on GitHub Pages paths and file://
// - Falls back to a Blob manifest so the UI always mounts

(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) return;

  const isGH = location.hostname.endsWith('github.io');
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

  // Minimal but valid fallback manifest
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
    if (isFile) return false; // HEAD won’t work reliably on file:// — force fallback/accept hinted
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function resolveManifestUrl() {
    const hinted = root.getAttribute('data-manifest-url');
    if (hinted && (isFile || await urlExists(hinted))) {
      console.info('[music] using hinted manifest:', hinted);
      return hinted;
    }

    const candidate = repoPrefix + DEFAULTS.manifestRel;
    if (await urlExists(candidate)) {
      console.info('[music] using repo manifest:', candidate);
      return candidate;
    }

    // Fallback to in-memory Blob so UI still mounts
    const blob = new Blob([JSON.stringify(FALLBACK_MANIFEST, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    console.info('[music] using fallback Blob manifest');
    return blobUrl;
  }

  function setDataAttr(name, value) {
    root.setAttribute(name, value); // force override even if present
  }

  async function boot() {
    const manifestUrl = await resolveManifestUrl();

    setDataAttr('data-manifest-url',  manifestUrl);
    setDataAttr('data-audio-base',    repoPrefix + DEFAULTS.audioBaseRel);
    setDataAttr('data-autoplay',      DEFAULTS.autoplay ? '1' : '0');
    setDataAttr('data-autoplay-muted',DEFAULTS.autoplayMuted ? '1' : '0');
    setDataAttr('data-shuffle',       DEFAULTS.shuffle ? '1' : '0');
    setDataAttr('data-volume',        String(DEFAULTS.volume));
    setDataAttr('data-start-source',  DEFAULTS.startSource);

    // Fire the init event the player listens for
    root.dispatchEvent(new CustomEvent('mp:init', { bubbles: true, detail: {} }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
