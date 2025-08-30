// /inspiration/figures/app.js
import { boot } from './modules/boot.js';

const BOOT_TIMEOUT_MS = 12000;

let booting = false;
let booted = false;
let showedError = false;

document.addEventListener('DOMContentLoaded', () => {
  wireGlobalErrorHandlers();
  start().catch(showError);
});

async function start() {
  if (booted || booting || window.__FIG_APP_BOOTED__) return;
  booting = true;
  window.__FIG_APP_BOOTED__ = true;

  // Warn for file:// (fetch/module CORS issues)
  if (location.protocol === 'file:') {
    throw new Error(
      'This page is being served via file://. Use a local web server (e.g., `python -m http.server`) so ES modules and JSON fetches work.'
    );
  }

  // Run boot with a timeout
  await Promise.race([
    Promise.resolve().then(() => boot()),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Boot timed out after ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS)
    ),
  ]);

  booted = true;
  booting = false;
}

// ---------- Error UI ----------
function showError(err) {
  if (showedError) return; // only render once
  showedError = true;
  booting = false; // allow retry

  const gridEl = ensureGrid();
  const msg = friendlyMessage(err);

  gridEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error-box';
  box.style.cssText = `
    border:1px solid rgba(255,255,255,.15);
    background: rgba(255,255,255,.06);
    color:#e8e8e8;
    padding:12px 14px; border-radius:8px; max-width:720px; margin:12px auto;
  `;
  box.innerHTML = `
    <h3 style="margin:0 0 6px; color:#c0d674; font-size:1.1rem;">Failed to load figures</h3>
    <p style="margin:.25rem 0 .5rem; color:#d1d1d1;">${escapeHtml(msg)}</p>
    <details style="margin:.5rem 0; color:#bcbcbc;">
      <summary style="cursor:pointer;">Details</summary>
      <pre style="white-space:pre-wrap; margin:.5rem 0 0; font-size:.85rem; color:#c9c9c9;">${escapeHtml(err?.stack || String(err))}</pre>
    </details>
    <div style="display:flex; gap:8px;">
      <button id="retry-boot" style="
        background:#e6a42b; color:#000; border:0; border-radius:6px;
        padding:.45rem .8rem; cursor:pointer;">Retry</button>
      <button id="reload-page" style="
        background:transparent; color:#e8e8e8; border:1px solid rgba(255,255,255,.25);
        border-radius:6px; padding:.45rem .8rem; cursor:pointer;">Reload</button>
    </div>
  `;
  gridEl.appendChild(box);

  const retry = box.querySelector('#retry-boot');
  const reload = box.querySelector('#reload-page');
  if (retry) retry.onclick = async () => {
    showedError = false;
    box.remove();
    try {
      await start();
    } catch (e) {
      showError(e);
    }
  };
  if (reload) reload.onclick = () => location.reload();

  console.error(err);
}

function friendlyMessage(err) {
  const msg = err?.message || String(err);
  const m = msg.toLowerCase();

  if (m.includes('file://')) {
    return 'Use a local HTTP server; ES modules and JSON fetches won’t work from file://.';
  }
  if (m.includes('unexpected token') || m.includes('json')) {
    return 'Likely a syntax error in a JSON file (e.g., figures/figures.json, figures/urls.json, or figures/color-palette.json). Check for trailing/missing commas.';
  }
  if (m.includes('failed to fetch') || m.includes('fetch')) {
    return 'Could not fetch assets (check /inspiration/figures/* paths, that your dev server is running, and CORS).';
  }
  if (m.includes('module') && m.includes('mime')) {
    return 'Module import issue — ensure the server serves JS with correct MIME and your script tag uses type="module".';
  }
  if (m.includes('timed out')) {
    return msg;
  }
  return msg;
}

function ensureGrid() {
  let el =
    document.getElementById('figure-grid') ||
    document.querySelector('[data-fig-grid]');
  if (!el) {
    el = document.createElement('div');
    el.id = 'figure-grid';
    // Put the fallback near the top of the figures page
    const host =
      document.querySelector('.feature-card-container') ||
      document.querySelector('main') ||
      document.body;
    host.prepend(el);
  }
  return el;
}

function wireGlobalErrorHandlers() {
  // Don’t double-install
  if (window.__FIG_ERRORS_WIRED__) return;
  window.__FIG_ERRORS_WIRED__ = true;

  window.addEventListener('error', (e) => {
    if (!booted) showError(e.error || new Error(e.message || 'Unknown error'));
  }, { passive: true });

  window.addEventListener('unhandledrejection', (e) => {
    if (!booted) showError(e.reason || new Error('Unhandled promise rejection'));
  }, { passive: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}
