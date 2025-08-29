// Entry wrapper for Inspiration page (ESM)
import { boot } from './modules/boot.js';

document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    const grid = document.getElementById('figure-grid');
    if (grid) grid.innerHTML = `<p class="error">Failed to initialize: ${err?.message || err}</p>`;
    console.error(err);
  });
});
