// /projects/web/script.js

(async function () {
  const container = document.getElementById('projects-list');
  if (!container) return;

  const render = (items) => {
    container.innerHTML = '';
    for (const p of items) {
      const card = document.createElement('div');
      card.className = 'feature';

      const h3 = document.createElement('h3');
      h3.textContent = p.title || p.slug;
      card.appendChild(h3);

      if (p.blurb) {
        const desc = document.createElement('p');
        desc.textContent = p.blurb;
        card.appendChild(desc);
      }

      const ul = document.createElement('ul');
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.href || '#';
      a.textContent = `Open ${p.title || p.slug}`;
      li.appendChild(a);
      ul.appendChild(li);

      card.appendChild(ul);
      container.appendChild(card);
    }
  };

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const items = Array.isArray(json?.projects) ? json.projects : [];
    if (!items.length) {
      container.innerHTML = '<p class="loading">No projects listed yet.</p>';
      return;
    }

    render(items);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="loading">Failed to load project list: ${e.message}</p>`;
  }
})();
