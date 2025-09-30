// /docs/staff/materials/resources/core/rules/script.js
import { boot } from '/docs/staff/materials/loader-modules/loader.js';

function ensureCreditsPartial() {
  if (!document.querySelector('script[type="module"][src="/__partials/credits/loader.js"]')) {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = '/__partials/credits/loader.js';
    document.head.appendChild(s);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureCreditsPartial();
  boot().catch(err => {
    const toc = document.getElementById('toc-content');
    if (toc) toc.innerHTML = `<p class="error">Failed to initialize: ${err.message}</p>`;
    console.error(err);
  });
});
