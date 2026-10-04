// /docs/staff/materials/resources/script.js
function ensureCreditsPartial() {
  if (!document.querySelector('script[type="module"][src="/__partials/credits/loader.js"]'])) {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = '/__partials/credits/loader.js';
    document.head.appendChild(s);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureCreditsPartial();
  // Nothing else required on the selection hub.
});
