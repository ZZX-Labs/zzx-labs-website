// Stamp "Last updated". Prefer a global build time if your pipeline injects one.
(function(){
  const el = document.getElementById('legal-last-updated');
  if (!el) return;
  try {
    const ts = window.__BUILD_LAST_UPDATED || Date.now();
    el.textContent = new Date(ts).toLocaleString();
  } catch {
    el.textContent = new Date().toLocaleString();
  }
})();
