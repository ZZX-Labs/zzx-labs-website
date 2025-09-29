// docs/.../*/*-resources/script.js
// Page-local bootstrapper for knowledgebase pages.
// Talks to /docs/staff/materials/loader-modules/loader.js (the unified wrapper).

import { boot, VERSION } from '/docs/staff/materials/loader-modules/loader.js';

function setStatus(message, kind = 'loading') {
  const toc = document.getElementById('toc-content');
  if (!toc) return;
  const p = document.createElement('p');
  p.className = kind; // "loading" | "error"
  p.textContent = message;
  // Clear any stale status nodes first:
  toc.querySelectorAll('.loading, .error').forEach(n => n.remove());
  toc.appendChild(p);
}

async function main() {
  // Optional: show quick UI hint while modules spin up
  setStatus('Loading sources…', 'loading');

  // Optional credits injection (no-op if loader not present)
  try {
    // Safe dynamic import – skip if file not found
    await import('/__partials/credits/loader.js')
      .then(mod => (typeof mod?.default === 'function' ? mod.default() : undefined))
      .catch(() => {}); // ignore missing credits loader
  } catch (_) {}

  try {
    // Kick off the wiki-loader pipeline (reads ./urls.json next to this script/page)
    await boot();
  } catch (err) {
    console.error('[materials:boot]', err);
    setStatus(`Failed to load content: ${err?.message || err}`, 'error');
    return;
  }

  // Success: clear status (your TOC will be filled by renderer)
  const toc = document.getElementById('toc-content');
  if (toc) toc.querySelectorAll('.loading, .error').forEach(n => n.remove());

  // Soft log for debugging/version tracking
  try {
    console.debug(`ZZX Materials loader ${VERSION} initialized`);
  } catch {}
}

// Defer until DOM is ready so targets (#toc-content, #sources) exist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
