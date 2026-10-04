// Wrapper: loads the real app.
import { boot } from './loader-modules/loader.js';

window.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    const toc = document.getElementById('toc-content');
    if (toc) toc.innerHTML = `<p class="error">Failed to initialize: ${err.message}</p>`;
    console.error(err);
  });
});
