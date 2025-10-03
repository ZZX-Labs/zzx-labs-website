// ProtoTag client-side script
// Loads manifest.json, injects data, and handles lightweight UI behaviors.

(async function () {
  const mountGallery = document.querySelector('.gallery');
  const manifestUrl = './manifest.json';

  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    const p = manifest?.project || {};

    // Update title if present
    if (p.title) document.title = `${p.title} | ZZX-Labs R&D`;

    // GitHub button update
    const ghBtn = document.getElementById('btn-gh');
    if (ghBtn && p.github) ghBtn.href = p.github;

    // Download button update
    const dlBtn = document.getElementById('btn-download');
    if (dlBtn && p.href) dlBtn.href = p.href;

    // Gallery injection
    if (Array.isArray(p.images) && p.images.length && mountGallery) {
      const grid = document.createElement('div');
      grid.className = 'image-grid';
      p.images.forEach(img => {
        const fig = document.createElement('figure');
        fig.className = 'image image-shadow ratio ratio-16x9';
        fig.innerHTML = `
          <img src="${img}" alt="Screenshot" loading="lazy" decoding="async" />
        `;
        grid.appendChild(fig);
      });
      mountGallery.appendChild(grid);
    }
  } catch (e) {
    console.error('Manifest load error', e);
    if (mountGallery) {
      const err = document.createElement('p');
      err.className = 'loading';
      err.textContent = `Failed to load manifest: ${e.message}`;
      mountGallery.appendChild(err);
    }
  }
})();
