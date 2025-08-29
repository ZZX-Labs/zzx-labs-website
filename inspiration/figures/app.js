// Wrapper that boots the Figures app
import { boot } from './modules/boot.js';

boot().catch(err => {
  const gridEl = document.getElementById('figure-grid');
  if (gridEl) gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
  console.error(err);
});
