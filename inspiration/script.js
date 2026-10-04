// inspiration/script.js
// Entry wrapper for Inspiration page (ESM) — stable boot with timeout + friendly errors
import { boot } from './modules/boot.js';

const BOOT_TIMEOUT_MS = 12000;

document.addEventListener('DOMContentLoaded', () => {
  start().catch(showError);
});

async function start() {
  // one-and-done (guards hot-reload/double exec)
  if (window.__INSP_BOOTED__) return;
  window.__INSP_BOOTED__ = true;

  // file:// footgun
  if (location.protocol === 'file:') {
    throw new Error(
      'This page is being served via file://. Use a local web server (e.g. `python -m http.server`) so ES modules and fetch() work.'
    );
  }

  // boot with timeout
  await Promise.race([
    boot(),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Boot timed out after ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS)
    ),
  ]);
}

/* ---------------- Error UI ---------------- */
function showError(err) {
  const grid = document.getElementById('figure-grid');
  const msg = friendlyMessage(err);

  const html = `
    <div class="error-box" style="
      border:1px solid rgba(255,255,255,.15);
      background: rgba(255,255,255,.05);
      color:#e8e8e8;
      padding:12px 14px; border-radius:8px;
      max-width:820px; margin:16px auto; font-family:monospace;">
      <h3 style="margin:0 0 6px; color:#c0d674; font-size:1.1rem;">
        Failed to initialize
      </h3>
      <p style="margin:.25rem 0 .5rem; color:#d1d1d1;">${escapeHtml(msg)}</p>
      <details style="margin:.5rem 0; color:#bcbcbc;">
        <summary style="cursor:pointer;">Details</summary>
        <pre style="white-space:pre-wrap; margin:.5rem 0 0; font-size:.85rem; color:#c9c9c9;">${escapeHtml(err?.stack || String(err))}</pre>
      </details>
      <button id="insp-retry" style="
        background:#e6a42b; color:#000; border:0; border-radius:6px;
        padding:.45rem .8rem; cursor:pointer;">Retry</button>
    </div>
  `;

  if (grid) {
    grid.innerHTML = html;
  } else {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
  }

  const btn = document.getElementById('insp-retry');
  if (btn) btn.onclick = () => location.reload();

  console.error(err);
}

function friendlyMessage(err) {
  const m = err?.message || String(err);

  if (m.includes('file://')) {
    return 'Use a local HTTP server; ES modules and JSON fetches won’t work from file://.';
  }
  if (m.includes('Unexpected token') || m.includes('JSON')) {
    return 'Likely a syntax error in one of the JSON files (e.g., trailing comma or missing comma).';
  }
  if (/Failed to fetch|fetch/i.test(m)) {
    return 'Could not fetch assets (check paths, that the server is running, and CORS).';
  }
  if (/module/i.test(m) && /mime/i.test(m)) {
    return 'Module import MIME error — ensure your server serves .js with type=application/javascript and the script tag uses type="module".';
  }
  if (/timed out/i.test(m)) {
    return m; // already human-readable
  }
  return m;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Last-resort safety net for errors thrown outside our try/catch
window.addEventListener('unhandledrejection', (e) => showError(e.reason || e));
window.addEventListener('error', (e) => showError(e.error || e.message));
