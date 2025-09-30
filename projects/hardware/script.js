<script>
(async function () {
  const mount = document.getElementById('projects-list');
  if (!mount) return;

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Missing or invalid manifest.json');
    const { projects = [] } = await res.json();

    if (!projects.length) {
      mount.innerHTML = '<p class="error">No hardware projects found.</p>';
      return;
    }

    const html = projects.map(p => `
      <div class="feature">
        <h3>${p.title}</h3>
        <p>${p.blurb}</p>
        <div class="links">
          <a class="btn" href="${p.href}">Open ${p.title}</a>
        </div>
      </div>
    `).join('');

    mount.innerHTML = html;
  } catch (err) {
    mount.innerHTML = `<p class="error">Failed to load projects: ${err.message}</p>`;
  }
})();
</script>
