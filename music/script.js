// /music/script.js
// Boots the MusicPlayer widget and gracefully handles GitHub Pages paths
// + missing manifest by falling back to an in-memory manifest (Blob URL).

(function () {
  const isGH = location.hostname.endsWith('github.io');
  const repoPrefix = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return (isGH && parts.length) ? '/' + parts[0] + '/' : '/';
  })();

  const root = document.querySelector('[data-mp]');
  if (!root) return;

  const DEFAULTS = {
    manifestRel : 'static/audio/music/playlists/manifest.json',
    audioBaseRel: 'static/audio/music/',
    autoplay    : true,
    autoplayMuted: true,
    shuffle     : true,
    volume      : 0.35,
    startSource : 'auto' // 'stations' | 'playlists' | 'auto'
  };

  // A tiny, valid fallback manifest so the page works even without files.
  // Replace these with your real playlists/stations when ready.
  const FALLBACK_MANIFEST = {
    stations: [
      { name: "LoFi Radio", file: "stations/lofi.m3u" },
      { name: "Ambient Radio", file: "stations/ambient.m3u" }
    ],
    playlists: [
      { name: "Lobby (Ambient)", file: "music/lobby.m3u" },
      { name: "Night Drive",     file: "music/night-drive.m3u" }
    ]
  };

  function ensureAttr(el, attr, value) {
    if (!el.hasAttribute(attr) || el.getAttribute(attr) === '') {
      el.setAttribute(attr, value);
    }
  }

  async function urlExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function resolveManifestUrl() {
    // If author already provided a manifest URL, try it first
    const hinted = root.getAttribute('data-manifest-url');
    if (hinted && await urlExists(hinted)) return hinted;

    // Try repo-aware default
    const candidate = repoPrefix + DEFAULTS.manifestRel;
    if (await urlExists(candidate)) return candidate;

    // Fallback to an in-memory Blob URL so the widget still works
    const blob = new Blob([JSON.stringify(FALLBACK_MANIFEST, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  async function boot() {
    // Resolve and set data-* attributes (widget reads these on mount)
    const manifestUrl = await resolveManifestUrl();
    ensureAttr(root, 'data-manifest-url', manifestUrl);
    ensureAttr(root, 'data-audio-base',   repoPrefix + DEFAULTS.audioBaseRel);
    ensureAttr(root, 'data-autoplay',     DEFAULTS.autoplay ? '1' : '0');
    ensureAttr(root, 'data-autoplay-muted', DEFAULTS.autoplayMuted ? '1' : '0');
    ensureAttr(root, 'data-shuffle',      DEFAULTS.shuffle ? '1' : '0');
    ensureAttr(root, 'data-volume',       String(DEFAULTS.volume));
    ensureAttr(root, 'data-start-source', DEFAULTS.startSource);

    // Kick the widget
    const ev = new CustomEvent('mp:init', { bubbles: true, detail: {} });
    root.dispatchEvent(ev);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
