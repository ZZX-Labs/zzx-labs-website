<!-- /music/script.js -->
<script>
(() => {
  const isGH = location.hostname.endsWith('github.io');
  const repoPrefix = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return (isGH && parts.length) ? '/' + parts[0] + '/' : '/';
  })();

  const root = document.querySelector('[data-mp]');
  if (!root) return;

  const DEFAULTS = {
    manifestRel   : 'static/audio/music/playlists/manifest.json',
    audioBaseRel  : 'static/audio/music/',
    autoplay      : true,
    autoplayMuted : true,
    shuffle       : true,
    volume        : 0.35,
    startSource   : 'auto' // 'stations' | 'playlists' | 'auto'
  };

  function absFrom(base, rel) {
    if (/^([a-z]+:)?\/\//i.test(rel) || rel.startsWith('/')) return rel;
    return repoPrefix + base.replace(/^\/+/, '') + rel.replace(/^\/+/, '');
  }

  function ensureAttr(el, attr, value) {
    if (!el.hasAttribute(attr) || el.getAttribute(attr) === '') {
      el.setAttribute(attr, value);
    }
  }

  async function urlExists(url) {
    try {
      // Some hosts disallow HEAD; gracefully fall back to GET if needed.
      let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok && r.status !== 405) return false;
      if (r.status === 405) {
        r = await fetch(url, { method: 'GET', cache: 'no-store' });
      }
      return r.ok;
    } catch {
      return false;
    }
  }

  function buildFallbackManifest() {
    // Absolute URLs so they resolve even when manifest itself is a blob: URL.
    const plRoot = DEFAULTS.manifestRel.replace(/manifest\.json$/i, '');
    return {
      stations: [
        { name: "LoFi Radio",     file: absFrom(plRoot, "radio-stations/lofi.m3u") },
        { name: "Ambient Radio",  file: absFrom(plRoot, "radio-stations/ambient.m3u") }
      ],
      playlists: [
        { name: "Lobby (Ambient)", file: absFrom(plRoot, "ambient.m3u") },
        { name: "Night Drive",     file: absFrom(plRoot, "modern.m3u") }
      ]
    };
  }

  async function resolveManifestUrl() {
    // 1) Author-provided data attribute
    const hinted = root.getAttribute('data-manifest-url');
    if (hinted && await urlExists(hinted)) return hinted;

    // 2) Repo-aware default
    const candidate = repoPrefix + DEFAULTS.manifestRel;
    if (await urlExists(candidate)) return candidate;

    // 3) Fallback to blob: manifest with absolute entries
    const blob = new Blob(
      [ JSON.stringify(buildFallbackManifest(), null, 2) ],
      { type: 'application/json' }
    );
    return URL.createObjectURL(blob);
  }

  async function boot() {
    const manifestUrl = await resolveManifestUrl();
    ensureAttr(root, 'data-manifest-url', manifestUrl);
    ensureAttr(root, 'data-audio-base',   repoPrefix + DEFAULTS.audioBaseRel);
    ensureAttr(root, 'data-autoplay',     DEFAULTS.autoplay ? '1' : '0');
    ensureAttr(root, 'data-autoplay-muted', DEFAULTS.autoplayMuted ? '1' : '0');
    ensureAttr(root, 'data-shuffle',      DEFAULTS.shuffle ? '1' : '0');
    ensureAttr(root, 'data-volume',       String(DEFAULTS.volume));
    ensureAttr(root, 'data-start-source', DEFAULTS.startSource);

    // Kick the widget (music-player.js listens for this)
    const ev = new CustomEvent('mp:init', { bubbles: true, detail: {} });
    root.dispatchEvent(ev);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
</script>
